import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { SaveBar } from "@shoplineos/app-bridge";
import { Check, ChevronDown, Copy, GripVertical, Tag, Settings2, Paintbrush, Trash2 } from "lucide-react";
import { DndContext, PointerSensor, closestCenter, useSensor, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { defaultTiers } from "./data";
import type { Campaign, MarketOverride, Tier } from "./model";
import { StorefrontWidget, tierDescription, type WidgetPreviewConfig } from "./StorefrontWidget";
import { CampaignStyleEditor } from './CampaignStyleEditor';
import { isHexColor } from './color-picker';
import { defaultCampaignWidgetConfig, normalizeCampaignWidgetConfig, type CampaignWidgetStyleConfig } from './widget-config';
import { campaignText, type CampaignEditorMessageKey } from './campaign-editor-messages';
import { Button, Toggle } from "./ui";
import { findCollectionPriorityNotices, type CollectionPriorityNotice, type PrototypeScope } from "./coverage";
import { checkCampaignCoverage, type CampaignCoverage } from "./campaign-api";
import { validateTierPricing } from "./tier-pricing";
import { formatMoneyInput, parseMoney } from "./money";
import { setMarketOverrideMode, validateMarketOverrides, type MarketsResponse } from "./market-config";
import { reorderFromDragEnd } from "./tier-order";
import { copyTierAfter, removeTierById } from './tier-actions';
import { TierDeleteDialog } from './TierDeleteDialog';
import { CampaignProductPicker, productPickerLabels, type Product } from './CampaignProductPicker';
import { CampaignCollectionPicker } from './CampaignCollectionPicker';
import { toDateTimeInput, fromDateTimeInput } from "./campaign-datetime";
import { getEnabledCombinationTypes, getSpecifiedMarketCombinationRows } from './combination-policy';
import { readTranslations } from './translations-api';
import type { StorefrontTranslations } from './storefront-copy';
import { normalizeStorefrontLocale } from './storefront-locales';
import { createPreviewPriceClient } from './preview-price-client';
import { selectPreviewMarket } from './market-preview';
import { useAppBridge } from '../hooks/useAppBridge';
import { BridgeConfirmation } from './BridgeConfirmation';
import { openEditorExitConfirmation } from './admin-feedback';
import { editorSaveBarText } from './editor-save-bar-messages';
import styles from "../pages/quantity-breaks.module.css";
import { defaultOfferModule, validateOfferModule } from '../../../shared/offer-core.mjs';
import { OfferModulePanel } from './OfferModulePanel';
import { useOfferPreview } from './offer-preview-client';

type Props = {
  fetcher: typeof fetch;
  campaign: Campaign | null;
  campaigns: Campaign[];
  onCancel: () => void;
  onSave: (campaign: Campaign, intent: 'draft' | 'publish' | 'update') => Promise<void>;
  notify: (message: string, tone?: "success" | "error" | "notice") => void;
  languageControl?: React.ReactNode;
};
type EditorTier = Tier & { tierId: string };
type CollectionProduct = { id: string; title: string };
type PreviewPricingState = { state: 'loading' | 'ready' | 'unavailable'; amountsByVariant?: Record<string, number>; unavailableVariantIds?: string[]; currencyCode?: string; isPrimaryMarket?: boolean; shopCurrencyCode?: string; autoExchangeRate?: boolean; exchangeRate?: number | null };

async function loadSelectedCollectionProducts(fetcher: typeof fetch, collectionIds: string[]): Promise<CollectionProduct[]> {
  const products = new Map<string, CollectionProduct>();
  for (const collectionId of collectionIds) {
    const seenCursors = new Set<string>();
    let pageInfo: string | null = null;
    do {
      const query = pageInfo ? `?page_info=${encodeURIComponent(pageInfo)}` : '';
      const response = await fetcher(`/api/quantity-breaks/collections/${encodeURIComponent(collectionId)}/products${query}`, { credentials: 'same-origin' });
      if (!response.ok) throw new Error('Collection products are unavailable.');
      const page = await response.json() as { products?: CollectionProduct[]; nextPageInfo?: string | null };
      if (!Array.isArray(page.products)) throw new Error('Collection products are unavailable.');
      for (const product of page.products) if (typeof product.id === 'string' && typeof product.title === 'string') products.set(product.id, product);
      pageInfo = typeof page.nextPageInfo === 'string' ? page.nextPageInfo : null;
      if (pageInfo && (seenCursors.has(pageInfo) || pageInfo.length > 2048)) throw new Error('Collection pagination is invalid.');
      if (pageInfo) seenCursors.add(pageInfo);
    } while (pageInfo);
  }
  return [...products.values()];
}

function EditorPanel({ title, icon: Icon, children, initiallyOpen = false, panelRef, headerAction }: {
  title: string;
  icon?: typeof Tag;
  children: React.ReactNode;
  initiallyOpen?: boolean;
  panelRef?: React.Ref<HTMLDetailsElement>;
  headerAction?: React.ReactNode;
}) {
  const panel = <details className={styles.editorPanel} open={initiallyOpen} ref={panelRef}>
    <summary><ChevronDown size={16} aria-hidden="true" />{Icon && <Icon size={16} aria-hidden="true" />}<span>{title}</span></summary>
    <div className={styles.editorPanelBody}>{children}</div>
  </details>;
  return headerAction ? <div className={styles.editorPanelWithAction}>{panel}<div className={styles.editorPanelHeaderAction}>{headerAction}</div></div> : panel;
}

function SortableTierRow({ tier, children, onKeyboardMove, label, hint }: { tier: EditorTier; children: React.ReactNode; onKeyboardMove: (direction: -1 | 1) => void; label: string; hint: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tier.tierId });
  return <div
    ref={setNodeRef}
    className={`${styles.offerPanelRow} ${isDragging ? styles.offerPanelDragging : ""}`}
    style={{ transform: CSS.Transform.toString(transform), transition }}
  >
    <button type="button" className={styles.tierDragHandle} {...attributes} {...listeners} aria-describedby={undefined} aria-roledescription="reorder handle" aria-label={label} title={hint} onKeyDown={(event) => {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      event.preventDefault();
      onKeyboardMove(event.key === "ArrowUp" ? -1 : 1);
    }}><GripVertical size={16} aria-hidden="true" /></button>
    {children}
  </div>;
}

export function CampaignEditor({ campaign, campaigns, onCancel, onSave, notify, fetcher, languageControl }: Props) {
  const { t, i18n } = useTranslation();
  const app = useAppBridge();
  const ct = (key: CampaignEditorMessageKey, params: Record<string, string | number> = {}) => campaignText(i18n.language ?? 'en', key, params);
  const saveBarCopy = editorSaveBarText(i18n.language);
  const saveBarFinishText = campaign ? saveBarCopy.save : saveBarCopy.create;
  const productCopy = productPickerLabels(i18n.language ?? 'en');
  const tierDragText = (key: 'reorderTier' | 'reorderTierHint' | 'tierMoved', tier: EditorTier, position?: number) => ct(key).replace('{tier}', tier.label || `${ct('quantity')} ${tier.quantity}`).replace('{position}', String(position ?? ''));
  const settingsRef = useRef<HTMLDetailsElement>(null);
  const scopeRef = useRef<HTMLDetailsElement>(null);
  const newCampaignId = useRef(campaign?.id ?? `local-${crypto.randomUUID()}`);
  const styleRef = useRef<HTMLDetailsElement>(null);
  const tierPanelRefs = useRef<(HTMLDetailsElement | null)[]>([]);
  const [name, setName] = useState(campaign?.name ?? "");
  const [discountName, setDiscountName] = useState(campaign?.discountName ?? campaign?.name ?? "");
  const [saving, setSaving] = useState(false);
  const [scope, setScope] = useState<PrototypeScope>(campaign?.scope?.kind === 'collections' ? 'Product collections' : 'Specific products');
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>(campaign?.scope?.productIds ?? []);
  const [previewProduct, setPreviewProduct] = useState<Product | undefined>();
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>(campaign?.scope?.collectionIds ?? []);
  const [tiers, setTiers] = useState<EditorTier[]>(() => (campaign?.tiers ?? defaultTiers).map((tier) => ({ ...tier, tierId: tier.tierId ?? crypto.randomUUID() })));
  const [amountDrafts, setAmountDrafts] = useState<Record<string, string>>({});
  const [amountErrors, setAmountErrors] = useState<Record<string, string>>({});
  const [marketAmountDrafts, setMarketAmountDrafts] = useState<Record<string, string>>({});
  const [marketAmountErrors, setMarketAmountErrors] = useState<Record<string, string>>({});
  const [markets, setMarkets] = useState<{ state: "loading" | "ready" | "error"; data?: MarketsResponse; error?: string }>({ state: "loading" });
  const [marketRefresh, setMarketRefresh] = useState(0);
  const shopCurrencyCode = markets.data?.shopCurrencyCode ?? "USD";
  const [combineOrder, setCombineOrder] = useState(campaign?.combineOrder ?? false);
  const [combineProduct, setCombineProduct] = useState(campaign?.combineProduct ?? false);
  const [combineShipping, setCombineShipping] = useState(campaign?.combineShipping ?? false);
  const [checkState, setCheckState] = useState<"idle" | "checking" | "clear" | "conflict" | "unverified">("idle");
  const [coverageConflicts, setCoverageConflicts] = useState<CampaignCoverage['conflicts']>([]);
  const [priorityNotices, setPriorityNotices] = useState<CollectionPriorityNotice[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [startsAt, setStartsAt] = useState(toDateTimeInput(campaign?.startsAt));
  const [endsAt, setEndsAt] = useState(toDateTimeInput(campaign?.endsAt));
  const [neverExpires, setNeverExpires] = useState(campaign?.neverExpires ?? !campaign?.endsAt);
  const [gifts, setGifts] = useState(() => campaign?.gifts ?? defaultOfferModule('gifts'));
  const [bundles, setBundles] = useState(() => campaign?.bundles ?? defaultOfferModule('bundles'));
  const [giftDraftError, setGiftDraftError] = useState('');
  const [bundleDraftError, setBundleDraftError] = useState('');
  const [widget, setWidget] = useState(() => campaign?.widget ? normalizeCampaignWidgetConfig(campaign.widget) : defaultCampaignWidgetConfig());
  const [activeStyleDevice, setActiveStyleDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [previewMarketId, setPreviewMarketId] = useState('');
  const [previewCountryChoice, setPreviewCountryChoice] = useState<{ marketId: string; code: string }>();
  const [priceDemand, setPriceDemand] = useState<{ productId: string; ids: string[] }>({ productId: '', ids: [] });
  const priceClient = useMemo(() => createPreviewPriceClient(fetcher), [fetcher]);
  const onPreviewPriceDemand = useCallback((productId: string, ids: string[]) => {
    setPriceDemand(current => current.productId === productId && current.ids.join(',') === ids.join(',') ? current : { productId, ids });
  }, []);
  const [previewPriceRefresh, setPreviewPriceRefresh] = useState(0);
  const [previewPricing, setPreviewPricing] = useState<PreviewPricingState>({ state: 'loading' });
  const [previewTranslations, setPreviewTranslations] = useState<StorefrontTranslations>({});
  const [orderAnnouncement, setOrderAnnouncement] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [exitConfirmationOpen, setExitConfirmationOpen] = useState(false);
  const deleteTriggerRef = useRef<HTMLElement | null>(null);
  const dragSensor = useSensor(PointerSensor, { activationConstraint: { distance: 5 } });
  const initialSnapshotRef = useRef<string | null>(null);
  const saveBarRef = useRef<ReturnType<typeof SaveBar.create> | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setMarkets({ state: "loading" });
    fetcher("/api/quantity-breaks/markets", { signal: controller.signal, credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) throw new Error(response.status === 401 ? "Connect a SHOPLINE store to load markets." : `Markets could not be loaded (${response.status}).`);
        return response.json() as Promise<MarketsResponse>;
      })
      .then((data) => {
        if (!Array.isArray(data.markets) || !data.shopCurrencyCode) throw new Error("Market data is incomplete.");
        setMarkets({ state: "ready", data });
        setPreviewMarketId((current) => data.markets.some((market) => market.id === current) ? current : (selectPreviewMarket(data.markets)?.id ?? ''));
      })
      .catch((error) => { if (error.name !== "AbortError") setMarkets({ state: "error", error: error.message }); });
    return () => controller.abort();
  }, [marketRefresh, fetcher]);

  const previewMarket = markets.data?.markets.find((market) => market.id === previewMarketId);
  const previewCountry = previewCountryChoice?.marketId === previewMarketId && previewMarket?.regionCodes.includes(previewCountryChoice.code) ? previewCountryChoice.code : previewMarket?.regionCodes[0] ?? '';
  const previewLocale = normalizeStorefrontLocale(previewMarket?.defaultLocale) ?? 'en';
  const offerPreview = useOfferPreview(gifts, bundles, {marketId: previewMarketId, currencyCode: previewMarket?.currencyCode ?? undefined, countryCode: previewCountry, locale: previewLocale}, fetcher);
  const offerValidation = giftDraftError || bundleDraftError || [...validateOfferModule(gifts, 'gifts', tiers), ...validateOfferModule(bundles, 'bundles', tiers)][0] || '';

  useEffect(() => {
    if (!previewLocale) return;
    let active = true;
    setPreviewTranslations({});
    readTranslations(previewLocale, fetcher)
      .then((translations) => { if (active) setPreviewTranslations(translations); })
      .catch(() => { if (active) setPreviewTranslations({}); });
    return () => { active = false; };
  }, [previewLocale, fetcher]);

  useEffect(() => {
    const controller = new AbortController();
    const variantIds = priceDemand.productId === previewProduct?.id ? priceDemand.ids : [];
    if (!variantIds.length || !previewMarket || !previewCountry) {
      setPreviewPricing({ state: 'unavailable' });
      return () => controller.abort();
    }
    const amountsByVariant: Record<string, number> = {};
    const unavailableVariantIds: string[] = [];
    let currencyCode: string | undefined;
    let remaining = variantIds.length;
    const publish = () => {
      if (controller.signal.aborted) return;
      setPreviewPricing({ state: currencyCode ? 'ready' : remaining ? 'loading' : 'unavailable', amountsByVariant: { ...amountsByVariant }, unavailableVariantIds: [...unavailableVariantIds], currencyCode, isPrimaryMarket: previewMarket.primary, shopCurrencyCode, autoExchangeRate: previewMarket.autoExchangeRate, exchangeRate: previewMarket.exchangeRate });
    };
    setPreviewPricing({ state: 'loading' });
    for (const variantId of variantIds) {
      priceClient.load(variantId, previewCountry, controller.signal).then(price => {
        if (currencyCode && currencyCode !== price.currencyCode) { unavailableVariantIds.push(variantId); return; }
        currencyCode = price.currencyCode;
        amountsByVariant[variantId] = price.amountMinor;
      }).catch(() => { unavailableVariantIds.push(variantId); }).finally(() => { remaining--; publish(); });
    }
    return () => controller.abort();
  }, [priceClient, previewProduct?.id, priceDemand, previewCountry, previewMarket, shopCurrencyCode, previewPriceRefresh]);

  const quantities = tiers.map((tier) => tier.quantity);
  const invalidTierIndex = quantities.findIndex((quantity, index) => !Number.isInteger(quantity) || quantity < 1 || quantities.indexOf(quantity) !== index);
  const invalidPriceIndex = tiers.findIndex((tier) => Boolean(validateTierPricing(tier)));
  const invalidAmountIndex = tiers.findIndex((tier) => Boolean(amountErrors[tier.tierId]));
  const invalidMarketIndex = tiers.findIndex((tier) => Boolean(validateMarketOverrides(tier.marketOverrides)));
  const activeStyle = activeStyleDevice === 'mobile' ? (widget.mobile ?? normalizeCampaignWidgetConfig(widget).mobile!) : widget;
  const invalidDesktopColorKey = (Object.keys(widget.colors) as Array<keyof typeof widget.colors>).find((key) => !isHexColor(widget.colors[key]));
  const invalidMobileColorKey = widget.mobile && (Object.keys(widget.mobile.colors) as Array<keyof typeof widget.mobile.colors>).find((key) => !isHexColor(widget.mobile!.colors[key]));
  const invalidActiveColorKey = (Object.keys(activeStyle.colors) as Array<keyof typeof activeStyle.colors>).find((key) => !isHexColor(activeStyle.colors[key]));
  const marketAmountError = Object.values(marketAmountErrors).find(Boolean);
  const validationError = !name.trim() ? ct('nameRequired')
    : !discountName.trim() ? ct('discountNameRequired')
    : scope === 'Specific products' && !selectedProductIds.length ? ct('coverageBlocked')
    : scope === 'Product collections' && !selectedCollectionIds.length ? ct('coverageBlocked')
    : quantities.some((quantity) => !Number.isInteger(quantity) || quantity < 1) ? ct('quantityRequired')
    : new Set(quantities).size !== quantities.length ? ct('quantityUnique')
    : !tiers.length ? ct('tierRequired')
    : invalidAmountIndex >= 0 ? amountErrors[tiers[invalidAmountIndex].tierId]
    : marketAmountError ? marketAmountError
    : invalidMarketIndex >= 0 ? validateMarketOverrides(tiers[invalidMarketIndex].marketOverrides)
    : invalidPriceIndex >= 0 ? validateTierPricing(tiers[invalidPriceIndex])
    : invalidDesktopColorKey || invalidMobileColorKey ? ct('styleHexAlphaError')
    : offerValidation ? offerValidation
    : !startsAt ? ct('startRequired')
    : !neverExpires && !endsAt ? ct('endRequired')
    : startsAt && endsAt && new Date(startsAt) > new Date(endsAt) ? ct('endAfterStart')
    : "";
  const errorTarget = !name.trim() ? "campaign-name" : !discountName.trim() ? "campaign-discount-name" : scope === 'Specific products' && !selectedProductIds.length ? 'campaign-product-search' : scope === 'Product collections' && !selectedCollectionIds.length ? 'campaign-collection-search' : invalidTierIndex >= 0 ? `tier-quantity-${invalidTierIndex}` : invalidAmountIndex >= 0 ? `tier-amount-${invalidAmountIndex}` : invalidMarketIndex >= 0 ? `tier-discount-${invalidMarketIndex}` : invalidPriceIndex >= 0 ? `tier-discount-${invalidPriceIndex}` : invalidActiveColorKey ? `widget-color-${activeStyleDevice}-${invalidActiveColorKey}` : invalidDesktopColorKey ? `widget-color-desktop-${invalidDesktopColorKey}` : invalidMobileColorKey ? `widget-color-mobile-${invalidMobileColorKey}` : !startsAt ? "schedule-starts-at" : "schedule-ends-at";
  const enabledCombinationTypes = getEnabledCombinationTypes({ combineOrder, combineProduct, combineShipping });
  const specifiedMarketRows = getSpecifiedMarketCombinationRows(tiers, Object.fromEntries((markets.data?.markets ?? []).map((market) => [market.id, market.name])));
  const summaryStartsAt = fromDateTimeInput(startsAt, campaign?.startsAt);
  const summaryEndsAt = neverExpires ? undefined : fromDateTimeInput(endsAt, campaign?.endsAt);
  const editorSnapshot = JSON.stringify({ name, discountName, scope, selectedProductIds, selectedCollectionIds, tiers, startsAt, endsAt, neverExpires, combineOrder, combineProduct, combineShipping, widget, gifts, bundles, giftDraftError, bundleDraftError });
  if (initialSnapshotRef.current === null) initialSnapshotRef.current = editorSnapshot;
  const dirty = initialSnapshotRef.current !== editorSnapshot;
  const formatSummaryDateTime = (value?: string) => {
    if (!value) return ct('none');
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? ct('none') : new Intl.DateTimeFormat(i18n.language ?? 'en', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  };
  const combinationLabels = enabledCombinationTypes.map((type) => type === 'product' ? ct('otherProductDiscounts') : type === 'order' ? ct('orderDiscounts') : ct('shippingDiscounts'));
  const previewConfig: WidgetPreviewConfig = {
    allowMixed: true,
    showSelectors: activeStyle.variants.showSelectors,
    selectorStyle: ({ dropdown: 'Dropdown', image: 'Original variant images', text: 'Text values', swatch: 'Text values' } as const)[activeStyle.variants.selectorStyle],
    imageTileSize: activeStyle.variants.imageSizePx,
    imageTileRadius: activeStyle.variants.imageRadiusPx,
    showImageColorValue: activeStyle.variants.showImageColorValue,
    widgetFontSize: 14,
    showStock: false,
    showPricing: activeStyle.showPriceSummary,
  };
  const changeActiveStyle = (next: CampaignWidgetStyleConfig) => setWidget((current) => activeStyleDevice === 'mobile' ? { ...current, mobile: next } : { ...current, ...next });
  const selectStyleDevice = (device: 'desktop' | 'mobile') => {
    styleRef.current?.setAttribute("open", "");
    setActiveStyleDevice(device);
  };
  const summaryDiscount = (tier: EditorTier) => {
    const type = tier.discountType ?? (tier.discountPercent ? 'percentage' : 'none');
    const typeLabel = type === 'none' ? ct('originalPrice') : type === 'percentage' ? ct('percentageOff') : type === 'fixed_amount' ? ct('amountOff') : type === 'fixed_price' ? ct('fixedPrice') : type === 'bundle_fixed_amount' ? ct('bundleAmountOff') : ct('bundleFixedPrice');
    const value = type === 'none' ? '—' : type === 'percentage' ? `${tier.discountValue ?? tier.discountPercent}%` : `${formatMoneyInput(tier.discountValue ?? 0, shopCurrencyCode)} ${shopCurrencyCode}`;
    return { typeLabel, value };
  };

  const addTier = () => setTiers((current) => [...current, { tierId: crypto.randomUUID(), quantity: Math.max(0, ...current.map((tier) => tier.quantity)) + 1, label: "New tier", discountPercent: 10 }]);
  const copyTier = (id: string) => setTiers((current) => copyTierAfter(current, id, crypto.randomUUID()));
  const confirmDeleteTier = () => {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    setTiers((current) => removeTierById(current, id));
    setAmountDrafts((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== id)));
    setAmountErrors((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== id)));
    setMarketAmountDrafts((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${id}:`))));
    setMarketAmountErrors((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${id}:`))));
    setPendingDeleteId(null);
    window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`.${styles.addOfferRow} button`)?.focus());
  };
  const updateTier = (index: number, patch: Partial<Tier>) => setTiers((current) => current.map((tier, item) => item === index ? { ...tier, ...patch } : tier));
  const moveTier = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    setTiers((current) => reorderFromDragEnd(current, sourceId, targetId));
    const source = tiers.find((tier) => tier.tierId === sourceId);
    const target = tiers.findIndex((tier) => tier.tierId === targetId);
    if (source && target >= 0) setOrderAnnouncement(tierDragText('tierMoved', source, target + 1));
  };
  const handleTierDragEnd = ({ active, over }: DragEndEvent) => {
    if (over) moveTier(String(active.id), String(over.id));
  };
  const changeDiscountType = (index: number, discountType: Tier["discountType"]) => {
    const id = tiers[index].tierId;
    updateTier(index, { discountType, discountValue: discountType === "percentage" ? 0 : undefined, discountPercent: 0, marketOverrides: undefined });
    setAmountDrafts((current) => { const next = { ...current }; delete next[id]; return next; });
    setAmountErrors((current) => { const next = { ...current }; delete next[id]; return next; });
    setMarketAmountErrors((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${id}:`))));
  };
  const changeAmount = (index: number, value: string, discountType: Tier["discountType"]) => {
    const id = tiers[index].tierId;
    setAmountDrafts((current) => ({ ...current, [id]: value }));
    const field = discountType === "fixed_price" || discountType === "bundle_fixed_price" ? "Fixed price" : "Amount off";
    try {
      const discountValue = parseMoney(value, shopCurrencyCode, field);
      updateTier(index, { discountValue });
      setAmountErrors((current) => { const next = { ...current }; delete next[id]; return next; });
    } catch (error) { setAmountErrors((current) => ({ ...current, [id]: (error as Error).message })); }
  };
  const changeMarketMode = (index: number, marketId: string, mode: MarketOverride["mode"], currencyCode: string) => {
    const tier = tiers[index];
    updateTier(index, { marketOverrides: setMarketOverrideMode(tier.marketOverrides ?? {}, marketId, mode, currencyCode) });
    const key = `${tier.tierId}:${marketId}`;
    setMarketAmountDrafts((current) => { const next = { ...current }; delete next[key]; return next; });
    setMarketAmountErrors((current) => { const next = { ...current }; delete next[key]; return next; });
  };
  const changeMarketAmount = (index: number, marketId: string, currencyCode: string, value: string) => {
    const key = `${tiers[index].tierId}:${marketId}`;
    setMarketAmountDrafts((current) => ({ ...current, [key]: value }));
    try {
      const amountMinor = parseMoney(value, currencyCode, "Market amount");
      updateTier(index, { marketOverrides: { ...tiers[index].marketOverrides, [marketId]: { mode: "specified_amount", currencyCode, amountMinor } } });
      setMarketAmountErrors((current) => { const next = { ...current }; delete next[key]; return next; });
    } catch (error) { setMarketAmountErrors((current) => ({ ...current, [key]: (error as Error).message })); }
  };
  const makeRecommended = (index: number) => setTiers((current) => current.map((tier, item) => ({ ...tier, recommended: item === index })));
  const checkOverlap = async (): Promise<boolean> => {
    setCheckState("checking");
    setPriorityNotices([]);
    if (scope === 'Product collections') {
      try {
        const products = await loadSelectedCollectionProducts(fetcher, selectedCollectionIds);
        setPriorityNotices(findCollectionPriorityNotices(campaigns, products, campaign?.id));
        const result = await checkCampaignCoverage({
          id: campaign?.id,
          scope: { kind: 'collections', collectionIds: selectedCollectionIds, excludedProductIds: [] },
          startsAt: fromDateTimeInput(startsAt, campaign?.startsAt),
          endsAt: neverExpires ? undefined : fromDateTimeInput(endsAt, campaign?.endsAt),
          neverExpires,
        }, fetcher);
        setCoverageConflicts(result.conflicts);
        setCheckState(result.state);
        return result.state === 'clear';
      } catch {
        setCoverageConflicts([]);
        setCheckState('unverified');
        return false;
      }
    }
    try {
      const result = await checkCampaignCoverage({
        id: campaign?.id,
        scope: { kind: 'products', productIds: selectedProductIds, excludedProductIds: [] },
        startsAt: fromDateTimeInput(startsAt, campaign?.startsAt),
        endsAt: neverExpires ? undefined : fromDateTimeInput(endsAt, campaign?.endsAt),
        neverExpires,
      }, fetcher);
      setCoverageConflicts(result.conflicts);
      setCheckState(result.state);
      return result.state === 'clear';
    } catch {
      setCoverageConflicts([]);
      setCheckState('unverified');
      return false;
    }
  };
  const save = async (intent: 'draft' | 'publish' | 'update' = campaign ? 'update' : 'publish') => {
    if (saving) return;
    setSubmitted(true);
    if (validationError) {
      if ((invalidDesktopColorKey || invalidMobileColorKey) && errorTarget.startsWith('widget-color-')) styleRef.current?.setAttribute("open", "");
      else if ((invalidTierIndex >= 0 || invalidPriceIndex >= 0 || invalidAmountIndex >= 0 || invalidMarketIndex >= 0) && name.trim()) tierPanelRefs.current[invalidTierIndex >= 0 ? invalidTierIndex : invalidAmountIndex >= 0 ? invalidAmountIndex : invalidMarketIndex >= 0 ? invalidMarketIndex : invalidPriceIndex]?.setAttribute("open", "");
      else settingsRef.current?.setAttribute("open", "");
      notify(validationError, "error");
      window.requestAnimationFrame(() => document.getElementById(errorTarget)?.focus());
      return;
    }
    if (!await checkOverlap()) { notify(ct('coverageBlocked'), "error"); return; }
    const status = campaign ? campaign.status : "Draft";
    setSaving(true);
    await onSave({
      id: campaign?.id ?? newCampaignId.current,
      name: name.trim(),
      discountName: discountName.trim(),
      products: scope === 'Product collections' ? `${selectedCollectionIds.length} collections` : `${selectedProductIds.length} selected products`,
      scope: scope === 'Specific products' ? { kind: 'products', productIds: selectedProductIds, excludedProductIds: [] } : { kind: 'collections', collectionIds: selectedCollectionIds, excludedProductIds: [] },
      tiers,
      status,
      schedule: startsAt ? `Starts ${new Date(startsAt).toLocaleDateString("en-US")}` : "No schedule",
      updated: "Just now",
      revision: campaign?.revision,
      startsAt: fromDateTimeInput(startsAt, campaign?.startsAt),
      endsAt: neverExpires ? undefined : fromDateTimeInput(endsAt, campaign?.endsAt),
      neverExpires,
      combineOrder,
      combineProduct,
      combineShipping,
      widget,
      gifts,
      bundles,
    }, intent).finally(() => setSaving(false));
  };
  const saveRef = useRef(save);
  saveRef.current = save;
  const exitConfirmationCleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => { exitConfirmationCleanup.current?.(); }, []);
  const requestExit = useCallback(() => {
    if (saving) return;
    if (!dirty) { onCancel(); return; }
    if (app) {
      exitConfirmationCleanup.current?.();
      exitConfirmationCleanup.current = openEditorExitConfirmation(app, {
        content: saveBarCopy.leaveBody, confirmText: saveBarCopy.leave, cancelText: saveBarCopy.cancel,
        onConfirm: onCancel,
      });
      return;
    }
    setExitConfirmationOpen(true);
  }, [app, dirty, onCancel, saveBarCopy.leaveBody, saveBarCopy.leave, saveBarCopy.cancel, saving]);
  const confirmExit = () => { setExitConfirmationOpen(false); onCancel(); };
  const exitFromSaveBar = useCallback(() => { if (!saving) onCancel(); }, [onCancel, saving]);

  useEffect(() => {
    if (!app) return;
    const saveBar = SaveBar.create(app);
    saveBarRef.current = saveBar;
    return () => { saveBar.hide(); saveBarRef.current = null; };
  }, [app]);

  useEffect(() => {
    if (!app) return;
    const saveBar = saveBarRef.current;
    if (!saveBar) return;
    if (dirty) {
      saveBar.show({ onFinishText: saveBarFinishText, formType: campaign ? 'edit' : 'add', onSave: () => { void saveRef.current(campaign ? 'update' : 'publish'); }, onCancel: exitFromSaveBar });
      saveBar.setLoading(saving);
    } else {
      saveBar.hide();
    }
  }, [app, campaign, dirty, exitFromSaveBar, saveBarFinishText, saving]);

  return <form className={styles.referenceEditor} onSubmit={(event) => { event.preventDefault(); void save(); }}>
    <header className={styles.editorTopbar}>
      <div><span className={styles.eyebrow}>{campaign ? ct('editCampaign') : t('createCampaign')}</span><h1>{campaign?.name ?? t('campaignTitle')}</h1></div>
      <div className={styles.headerButtons}>{languageControl}{!campaign && <button type="button" className={styles.editorDraft} onClick={() => { void save('draft'); }} disabled={saving}>{t('saveDraft')}</button>}<Button type="button" variant="secondary" onClick={requestExit} disabled={saving}>{saveBarCopy.exit}</Button></div>
    </header>
    {submitted && validationError && <div className={styles.errorSummary} role="alert" tabIndex={-1}><b>{ct('saveError')}</b><a href={`#${errorTarget}`}>{validationError}</a></div>}
    <div className={styles.editorContent}>
      <div className={styles.editorFormColumn}>
      <EditorPanel title={ct('productScope')} icon={Tag} initiallyOpen panelRef={scopeRef} headerAction={<button type="button" onClick={() => { if (scopeRef.current) scopeRef.current.open = true; void checkOverlap(); }} disabled={checkState === 'checking'}>{ct(checkState === 'checking' ? 'checking' : 'checkCoverage')}</button>}>
        <div className={`${styles.overlapGuard} ${checkState === "clear" || checkState === "conflict" ? styles.overlapClear : ""} ${checkState === "conflict" ? styles.overlapConflict : ""}`} aria-live="polite"><div><b>{ct(checkState === "clear" ? 'coverageClear' : checkState === "conflict" ? 'coverageConflictTitle' : checkState === "unverified" ? 'coverageUnverified' : checkState === "checking" ? 'checking' : 'checkCoverage')}</b>{checkState === "conflict" ? <div className={styles.coverageConflictTable}><table><thead><tr><th scope="col">{ct('conflictActivityName')}</th><th scope="col">{ct(coverageConflicts.every((conflict) => conflict.type === 'collections') ? 'productCollections' : 'conflictProductName')}</th></tr></thead><tbody>{coverageConflicts.map((conflict) => <tr key={`${conflict.campaignId}:${conflict.itemId}`}><td>{conflict.campaignName}</td><td>{conflict.itemName}</td></tr>)}</tbody></table></div> : <p>{ct('coverageDescription')}</p>}{priorityNotices.map((notice) => <p key={`${notice.productTitle}:${notice.campaignName}`}>{ct('collectionPriorityNotice').replace('{product}', notice.productTitle).replace('{campaign}', notice.campaignName)}</p>)}</div></div>
        <div className={styles.scopeOptions}>{(["Specific products", "Product collections"] as const).map((option) => <label key={option}><input type="radio" name="campaign-scope" checked={scope === option} onChange={() => { setScope(option); setCheckState("idle"); setCoverageConflicts([]); setPriorityNotices([]); }} />{ct(({ 'Specific products': 'specificProducts', 'Product collections': 'productCollections' } as const)[option])}</label>)}</div>
            {scope === 'Specific products' && <CampaignProductPicker fetcher={fetcher} selectedIds={selectedProductIds} onChange={(ids) => { setSelectedProductIds(ids); setCheckState('idle'); setCoverageConflicts([]); setPriorityNotices([]); }} locale={i18n.language ?? 'en'} mode="dialog" />}
        {scope === 'Product collections' && <CampaignCollectionPicker fetcher={fetcher} selectedIds={selectedCollectionIds} onChange={(ids) => { setSelectedCollectionIds(ids); setCheckState('idle'); setCoverageConflicts([]); setPriorityNotices([]); }} locale={i18n.language ?? 'en'} mode="dialog" />}
      </EditorPanel>

      <EditorPanel title={ct('settings')} icon={Settings2} initiallyOpen panelRef={settingsRef}>
        <label className={styles.field}>{ct('internalName')}<input id="campaign-name" value={name} onChange={(event) => setName(event.target.value)} aria-invalid={submitted && Boolean(validationError)} placeholder="e.g. Renewal Serum multi-buy" /></label>
        <label className={styles.field}>{ct('discountName')}<input id="campaign-discount-name" value={discountName} onChange={(event) => setDiscountName(event.target.value)} aria-invalid={submitted && Boolean(validationError)} placeholder="e.g. Buy more, save more" /></label>
        <div className={styles.scheduleFields}><label className={styles.field}>{ct('startsAt')}<input id="schedule-starts-at" type="datetime-local" required value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label><label className={styles.field}>{ct('endsAt')}<input id="schedule-ends-at" type="datetime-local" required={!neverExpires} disabled={neverExpires} value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></label><label><input id="schedule-never-expires" type="checkbox" checked={neverExpires} onChange={(event) => { setNeverExpires(event.target.checked); if (event.target.checked) setEndsAt(""); }} />{ct('neverExpires')}</label></div>
        <div className={styles.editorDivider} />
        {enabledCombinationTypes.length > 0 && specifiedMarketRows.length > 0 && <div className={styles.marketNotice}><p>{ct('marketCombinationNotice', { types: enabledCombinationTypes.map((type) => type === 'product' ? ct('otherProductDiscounts') : type === 'order' ? ct('orderDiscounts') : ct('shippingDiscounts')).join(i18n.language?.toLowerCase().startsWith('zh') ? '、' : ', ') })}</p><table><thead><tr><th>{ct('tierLabel')}</th><th>{ct('marketAmounts')}</th></tr></thead><tbody>{specifiedMarketRows.map((row) => <tr key={row.tierId}><td>{row.label}</td><td>{row.marketNames.join(i18n.language?.toLowerCase().startsWith('zh') ? '、' : ', ')}</td></tr>)}</tbody></table></div>}
        <div className={styles.combinationControls}><label><span>{ct('otherProductDiscounts')}</span><Toggle checked={combineProduct} onChange={() => setCombineProduct(!combineProduct)} label={ct('otherProductDiscounts')} /></label><label><span>{ct('orderDiscounts')}</span><Toggle checked={combineOrder} onChange={() => setCombineOrder(!combineOrder)} label={ct('orderDiscounts')} /></label><label><span>{ct('shippingDiscounts')}</span><Toggle checked={combineShipping} onChange={() => setCombineShipping(!combineShipping)} label={ct('shippingDiscounts')} /></label></div>
      </EditorPanel>

      <EditorPanel title={ct('style')} icon={Paintbrush} panelRef={styleRef} headerAction={<div className={styles.styleDeviceToggle} role="group" aria-label={ct('style')}><button type="button" aria-pressed={activeStyleDevice === 'desktop'} onClick={() => selectStyleDevice('desktop')}>PC</button><button type="button" aria-pressed={activeStyleDevice === 'mobile'} onClick={() => selectStyleDevice('mobile')}>{t('mobile', { defaultValue: 'Mobile' })}</button></div>}>
        <CampaignStyleEditor device={activeStyleDevice} value={activeStyle} onChange={changeActiveStyle} autoOpenColor={submitted ? invalidActiveColorKey : undefined} />
      </EditorPanel>

      <OfferModulePanel kind="gifts" value={gifts} onChange={setGifts} tiers={tiers} locale={i18n.language ?? 'en'} fetcher={fetcher} currencyCode={shopCurrencyCode} onDraftError={setGiftDraftError} />
      <OfferModulePanel kind="bundles" value={bundles} onChange={setBundles} tiers={tiers} locale={i18n.language ?? 'en'} fetcher={fetcher} currencyCode={shopCurrencyCode} onDraftError={setBundleDraftError} />
      {submitted && offerValidation && <p role="alert">{offerValidation}</p>}
      <DndContext sensors={[dragSensor]} collisionDetection={closestCenter} onDragEnd={handleTierDragEnd}><SortableContext items={tiers.map((tier) => tier.tierId)} strategy={verticalListSortingStrategy}><div className={styles.offerPanels}>{tiers.map((tier, index) => <SortableTierRow tier={tier} key={tier.tierId} label={tierDragText('reorderTier', tier)} hint={ct('reorderTierHint')} onKeyboardMove={(direction) => { const target = tiers[index + direction]; if (target) moveTier(tier.tierId, target.tierId); }}><div className={styles.tierPanelWithActions}><EditorPanel title={`${ct('offerBar')}#${index + 1}  ${tier.label || ct('untitledCampaign')}`} panelRef={(node) => { tierPanelRefs.current[index] = node; }}>
        <div className={styles.tierEditRow}>
          <label>{ct('quantity')}<input id={`tier-quantity-${index}`} type="number" min="1" step="1" value={tier.quantity} onChange={(event) => updateTier(index, { quantity: Number(event.target.value) })} /></label>
          <label>{ct('tierLabel')}<input value={tier.label} onChange={(event) => updateTier(index, { label: event.target.value })} /></label>
          <label>{ct('tierSubtitle')}<input value={tier.subtitle ?? ''} placeholder={tierDescription(tier)} onChange={(event) => updateTier(index, { subtitle: event.target.value })} /></label>
          <label>{ct('discountType')}<select id={`tier-discount-${index}`} value={tier.discountType ?? (tier.discountPercent ? "percentage" : "none")} onChange={(event) => changeDiscountType(index, event.target.value as Tier["discountType"])}><option value="none">{ct('originalPrice')}</option><option value="percentage">{ct('percentageOff')}</option><option value="fixed_amount">{ct('amountOff')}</option><option value="fixed_price">{ct('fixedPrice')}</option><option value="bundle_fixed_amount">{ct('bundleAmountOff')}</option><option value="bundle_fixed_price">{ct('bundleFixedPrice')}</option></select></label>
          {(tier.discountType ?? (tier.discountPercent ? "percentage" : "none")) === "percentage" && <label>{ct('discountValue')}<input type="number" min="0" max="100" step="1" value={tier.discountValue ?? tier.discountPercent} onChange={(event) => updateTier(index, { discountValue: Number(event.target.value), discountPercent: Number(event.target.value) })} /></label>}
          {['fixed_amount', 'fixed_price', 'bundle_fixed_amount', 'bundle_fixed_price'].includes(tier.discountType ?? '') && <label>{ct(tier.discountType === 'fixed_amount' ? 'amountOffEach' : tier.discountType === 'fixed_price' ? 'fixedPriceEach' : tier.discountType === 'bundle_fixed_amount' ? 'amountOffTotal' : 'fixedPriceTotal')} ({shopCurrencyCode}{markets.state === "ready" ? "" : " demo"})<input id={`tier-amount-${index}`} type="text" inputMode="decimal" value={amountDrafts[tier.tierId] ?? (tier.discountValue === undefined ? "" : formatMoneyInput(tier.discountValue, shopCurrencyCode))} onChange={(event) => changeAmount(index, event.target.value, tier.discountType)} aria-invalid={Boolean(amountErrors[tier.tierId])} />{amountErrors[tier.tierId] && <small role="alert">{amountErrors[tier.tierId]}</small>}</label>}
          <label>{ct('badgeText')}<input value={tier.tag ?? ""} placeholder="e.g. Most popular" onChange={(event) => updateTier(index, { tag: event.target.value })} /></label>
              <button type="button" onClick={() => makeRecommended(index)} className={`${styles.recommendButton} ${tier.recommended ? styles.recommendSelected : ""}`} aria-pressed={Boolean(tier.recommended)}>{ct('defaultSelected')}</button>
        </div>
        {['fixed_amount', 'fixed_price', 'bundle_fixed_amount', 'bundle_fixed_price'].includes(tier.discountType ?? '') && <div className={styles.tierMarkets}>
          <div className={styles.tierMarketsHeading}><b>{ct('marketAmounts')}</b><span>{ct('marketConversion')}</span></div>
          {markets.state === "loading" && <p role="status">{ct('loadingMarkets')}</p>}
          {markets.state === "error" && <div className={styles.marketError} role="alert"><span>{ct('marketUnavailable')}</span><button type="button" onClick={() => setMarketRefresh((count) => count + 1)}>{t('retry')}</button></div>}
          {markets.state === "ready" && !markets.data?.markets.length && <p>{ct('noMarkets')}</p>}
          {markets.state === "ready" && markets.data?.markets.map((market) => {
            const override = tier.marketOverrides?.[market.id] ?? { mode: "auto_convert" as const };
            const key = `${tier.tierId}:${market.id}`;
            return <div key={market.id} className={styles.tierMarketRow}>
              <div><strong>{market.name}</strong><span>{market.currencyCode ?? (market.regionCurrencyCodes.join(" / ") || ct('currencyUnavailable'))}{market.enabled ? "" : ` · ${ct('disabled')}`}</span></div>
              <label>{ct('amountMode')}<select value={override.mode} disabled={!market.enabled || !market.specifiedAmountSupported} onChange={(event) => changeMarketMode(index, market.id, event.target.value as MarketOverride["mode"], market.currencyCode!)}><option value="auto_convert">{ct('autoConvert')}</option><option value="specified_amount">{ct('specifyAmount')}</option></select></label>
              {override.mode === "specified_amount" && market.currencyCode && <label>{ct('marketAmount')} ({market.currencyCode})<input type="text" inputMode="decimal" value={marketAmountDrafts[key] ?? (override.amountMinor === undefined ? "" : formatMoneyInput(override.amountMinor, market.currencyCode))} onChange={(event) => changeMarketAmount(index, market.id, market.currencyCode!, event.target.value)} aria-invalid={Boolean(marketAmountErrors[key])} />{marketAmountErrors[key] && <small role="alert">{marketAmountErrors[key]}</small>}</label>}
              {!market.specifiedAmountSupported && <small>{ct('specifiedUnavailable')}</small>}
            </div>;
          })}
        </div>}
      </EditorPanel><div className={styles.tierPanelActions}>{tier.recommended && <span className={styles.defaultTierTag}>{ct('defaultSelected')}</span>}<button type="button" aria-label={ct('copyTier')} title={ct('copyTier')} onClick={() => copyTier(tier.tierId)}><Copy size={16} aria-hidden="true" /></button><button type="button" aria-label={ct('deleteTier')} title={ct('deleteTier')} disabled={tiers.length <= 1} onClick={(event) => { deleteTriggerRef.current = event.currentTarget; setPendingDeleteId(tier.tierId); }}><Trash2 size={16} aria-hidden="true" /></button></div></div></SortableTierRow>)}</div></SortableContext></DndContext>
      <span className={styles.srOnly} role="status" aria-live="polite">{orderAnnouncement}</span>
      <div className={styles.addOfferRow}><Button type="button" variant="secondary" onClick={addTier}>{ct('addTier')}</Button></div>
      <p className={styles.formHint}>{ct('tierRule')}</p>
      </div>
          <aside className={styles.editorPreviewColumn}>
          <section className={styles.ruleSummary}><dl><div><dt>{ct('internalName')}</dt><dd>{name || ct('untitledCampaign')}</dd></div><div><dt>{ct('discountName')}</dt><dd>{discountName || ct('none')}</dd></div><div><dt>{ct('summaryScope')}</dt><dd>{ct(({ 'All products': 'allProducts', 'Specific products': 'specificProducts', 'Product collections': 'productCollections' } as const)[scope])}</dd></div><div><dt>{ct('summaryCombination')}</dt><dd>{combinationLabels.length > 0 ? <div className={styles.ruleSummaryCombination}>{combinationLabels.map((label) => <span key={label}>{label}</span>)}</div> : ct('none')}</dd></div><div><dt>{ct('summaryTiers')}</dt><dd><div className={styles.ruleSummaryTiers}><table><thead><tr><th>{ct('tierLabel')}</th><th>{ct('discountType')}</th><th>{ct('discountValue')}</th><th>{ct('quantity')}</th><th>{ct('defaultSelected')}</th></tr></thead><tbody>{tiers.map((tier) => { const discount = summaryDiscount(tier); return <tr key={tier.tierId}><td>{tier.label || ct('untitledCampaign')}</td><td>{discount.typeLabel}</td><td>{discount.value}</td><td>{tier.quantity}</td><td>{tier.recommended && <Check size={16} strokeWidth={2} aria-label={ct('defaultSelected')} />}</td></tr>; })}</tbody></table></div></dd></div><div><dt>{ct('startsAt')}</dt><dd>{summaryStartsAt ? <time dateTime={summaryStartsAt}>{formatSummaryDateTime(summaryStartsAt)}</time> : ct('none')}</dd></div><div><dt>{ct('endsAt')}</dt><dd>{neverExpires ? ct('neverExpires') : summaryEndsAt ? <time dateTime={summaryEndsAt}>{formatSummaryDateTime(summaryEndsAt)}</time> : ct('none')}</dd></div></dl></section>
          <section className={styles.editorPreview} aria-live="polite" aria-label={ct('livePreview')}><header className={styles.previewToolbar} data-preview-toolbar><div className={styles.previewControl} data-preview-control="device"><span className={styles.previewControlLabel}>{ct('livePreview')}</span><div className={styles.previewDeviceToggle} role="group" aria-label={ct('livePreview')}><button type="button" aria-pressed={activeStyleDevice === 'desktop'} onClick={() => setActiveStyleDevice('desktop')}>PC</button><button type="button" aria-pressed={activeStyleDevice === 'mobile'} onClick={() => setActiveStyleDevice('mobile')}>{t('mobile', { defaultValue: 'Mobile' })}</button></div></div><div className={`${styles.previewControl} ${styles.previewProductPicker}`} data-preview-control="product"><span className={styles.previewControlLabel}>{productCopy.previewTrigger}</span><div className={styles.previewProductValue}><span data-preview-product-title title={previewProduct?.title ?? productCopy.loading}>{previewProduct?.title ?? productCopy.loading}</span><CampaignProductPicker fetcher={fetcher} selectedIds={previewProduct ? [previewProduct.id] : []} onChange={() => {}} onPreviewProduct={setPreviewProduct} autoPreviewFirst selectionLimit={1} triggerLabel={productCopy.previewTrigger} compactTrigger showSelectedItems={false} inputId="preview-product-search" locale={i18n.language ?? 'en'} mode="dialog" /></div></div><label className={`${styles.previewControl} ${styles.previewLanguageSelect}`} data-preview-control="country"><span className={styles.previewControlLabel}>{ct('previewCountry')}</span><select aria-label={ct('previewCountry')} value={previewCountry} disabled={!previewMarket?.regionCodes.length} onChange={event => setPreviewCountryChoice({ marketId: previewMarketId, code: event.target.value })}>{(previewMarket?.regionCodes ?? []).map(code => <option key={code} value={code}>{code}</option>)}</select></label><label className={`${styles.previewControl} ${styles.previewLanguageSelect}`} data-preview-control="market"><span className={styles.previewControlLabel}>{ct('specifiedMarket')}</span><select aria-label={ct('specifiedMarket')} value={previewMarketId} disabled={markets.state !== 'ready'} onChange={(event) => setPreviewMarketId(event.target.value)}>{(markets.data?.markets ?? []).map((market) => <option key={market.id} value={market.id} disabled={!market.enabled}>{market.name}{market.currencyCode ? ` (${market.currencyCode})` : ''}{market.enabled ? '' : ` · ${ct('disabled')}`}</option>)}</select></label></header><div className={styles.previewDeviceStage}><div className={activeStyleDevice === 'mobile' ? styles.previewPhoneFrame : undefined}>{activeStyleDevice === 'mobile' && <span className={styles.previewPhoneCamera} aria-hidden="true" />}<StorefrontWidget gifts={gifts} bundles={bundles} offerPreview={offerPreview} device={activeStyleDevice} accent={activeStyle.colors.border} locale={previewLocale} translations={previewTranslations} config={previewConfig} campaignConfig={activeStyle} tiers={tiers} compact previewOnly campaignProduct={previewProduct} previewPricing={previewPricing} onPreviewPriceDemand={onPreviewPriceDemand} onRetryPreviewPrices={() => setPreviewPriceRefresh(count => count + 1)} previewMarketId={previewMarketId} previewMessages={{ retry: t('retry'), loading: ct('marketPriceLoading'), unavailable: ct('marketPriceUnavailable'), conversionUnavailable: ct('marketConversionUnavailable') }} notify={notify} /></div></div></section>
      </aside>
    </div>
    {pendingDeleteId && <TierDeleteDialog title={ct('deleteTierTitle')} body={ct('deleteTierBody').replace('{tier}', tiers.find((tier) => tier.tierId === pendingDeleteId)?.label || ct('offerBar'))} cancelLabel={ct('cancelDeleteTier')} confirmLabel={ct('confirmDeleteTier')} onCancel={() => setPendingDeleteId(null)} onConfirm={confirmDeleteTier} returnFocus={deleteTriggerRef.current} />}
    {!app && dirty && <div className={styles.editorSaveBar} role="status"><Button type="button" variant="secondary" onClick={requestExit} disabled={saving}>{saveBarCopy.exit}</Button><Button type="button" onClick={() => { void save(campaign ? 'update' : 'publish'); }} disabled={saving}>{saving ? `${saveBarFinishText}...` : saveBarFinishText}</Button></div>}
    {exitConfirmationOpen && <BridgeConfirmation title={saveBarCopy.leaveTitle} content={saveBarCopy.leaveBody} type="confirm" onCancel={() => setExitConfirmationOpen(false)} onConfirm={confirmExit} fallback={<div className={styles.modalScrim} role="presentation"><div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="exit-editor-title"><h2 id="exit-editor-title">{saveBarCopy.leaveTitle}</h2><p>{saveBarCopy.leaveBody}</p><div><Button type="button" variant="secondary" onClick={() => setExitConfirmationOpen(false)}>{saveBarCopy.cancel}</Button><Button type="button" variant="danger" onClick={confirmExit}>{saveBarCopy.leave}</Button></div></div></div>} />}
  </form>;
}
