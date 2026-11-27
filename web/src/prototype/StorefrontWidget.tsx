import { useEffect, useMemo, useRef, useState } from "react";
import { defaultTiers, variants } from "./data";
import { normalizeImageTileSize, normalizeWidgetFontSize } from "./variant-display.js";
import type { SlotSelection, Tier, Variant } from "./model";
import type { ProductVariant } from './CampaignProductPicker';
import { Button } from "./ui";
import { calculateTierPricing, validateTierPricing } from "./tier-pricing";
import { formatMinorMoney } from './money';
import { resolveMarketPreviewTier } from './market-preview';
import { chooseAvailableVariant, extendSlotsWithInventory, hasPurchasableOption, isVariantSoldOut } from "./slot-selection";
import { renderStorefrontCopy, type StorefrontCopyKey, type StorefrontTranslations } from "./storefront-copy";
import type { CampaignWidgetStyleConfig } from './widget-config';
import styles from "../pages/quantity-breaks.module.css";
import type { OfferModuleConfig } from '../../../shared/offer-core.mjs';
import type { OfferPreviewState, OfferModulePreviewState } from './offer-preview-client';
import { useOfferSelection } from './offer-selection';
import { OfferPreview, OfferReceipt } from './OfferPreview';

const firstSlots: SlotSelection[] = [
  { Color: "Black", Size: "M" }, { Color: "White", Size: "L" }, { Color: "Black", Size: "S" }, { Color: "Black", Size: "L" }, { Color: "White", Size: "S" },
];

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
const selectedVariant = (slot: SlotSelection | null, catalog: Variant[]) => slot && catalog.find((variant) => Object.keys(variant.options).length === Object.keys(slot).length && Object.entries(variant.options).every(([name, value]) => slot[name] === value));
const normalizeSlots = (current: (SlotSelection | null)[], quantity: number, catalog: Variant[]) => extendSlotsWithInventory(
  current.filter((slot): slot is SlotSelection => Boolean(selectedVariant(slot, catalog))),
  quantity,
  catalog,
);

function selectedTier(tiers: Tier[], quantity: number) {
  return [...tiers].filter((tier) => tier.quantity <= quantity).sort((a, b) => b.quantity - a.quantity)[0] ?? tiers[0];
}

function calculatePreviewPricing(variantPrices: number[], tier?: Tier) {
  const original = variantPrices.reduce((sum, price) => sum + price, 0);
  if (!tier || validateTierPricing(tier, variantPrices)) return { original, discounted: original, savings: 0 };
  return calculateTierPricing(variantPrices, tier);
}

export function tierDescription(option: Tier) {
  return option.subtitle?.trim() ? option.subtitle : '';
}

export type WidgetPreviewConfig = {
  allowMixed: boolean;
  showSelectors: boolean;
  selectorStyle: "Text values" | "Dropdown" | "Original variant images";
  imageTileSize: number;
  imageTileRadius: number;
  showImageColorValue: boolean;
  widgetFontSize: number;
  showStock: boolean;
  showPricing: boolean;
};

export type CartPreviewOutcome = 'success' | 'failure' | 'uncertain' | 'no_stock';
const cartFeedbackKeys = { success: 'widget.cart_success', failure: 'widget.cart_failure', uncertain: 'widget.cart_uncertain', no_stock: 'widget.no_stock' } as const;

type WidgetProps = {
  gifts?: OfferModuleConfig;
  bundles?: OfferModuleConfig;
  offerPreview?: OfferPreviewState | OfferModulePreviewState;
  device: "desktop" | "mobile";
  accent: string;
  locale: string;
  config: WidgetPreviewConfig;
  notify: (message: string, tone?: "success" | "error" | "notice") => void;
  tiers?: Tier[];
  compact?: boolean;
  translations?: StorefrontTranslations;
  campaignConfig?: CampaignWidgetStyleConfig;
  previewOnly?: boolean;
  previewCartOutcome?: CartPreviewOutcome;
  campaignProduct?: { id: string; title: string; imageUrl?: string | null; optionNames?: string[]; variants?: ProductVariant[] };
  previewPricing?: { state: 'loading' | 'ready' | 'unavailable'; amountsByVariant?: Record<string, number>; unavailableVariantIds?: string[]; currencyCode?: string; isPrimaryMarket?: boolean; shopCurrencyCode?: string; autoExchangeRate?: boolean; exchangeRate?: number | null };
  previewMarketId?: string;
  onPreviewPriceDemand?: (productId: string, ids: string[]) => void;
  onRetryPreviewPrices?: () => void;
  previewMessages?: { loading: string; unavailable: string; conversionUnavailable: string; retry?: string };
};

const safeColor = (value: string, fallback: string) => /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(value) ? value : fallback;

export function StorefrontWidget({ device, accent, locale, config, notify, tiers, compact = false, translations = {}, campaignConfig, previewOnly = false, previewCartOutcome, campaignProduct, previewPricing, previewMarketId, previewMessages, onPreviewPriceDemand, onRetryPreviewPrices, gifts, bundles, offerPreview }: WidgetProps) {
  const tierChoicesRef = useRef<HTMLFieldSetElement>(null);
  const copy = (key: StorefrontCopyKey, variables?: Record<string, string | number>) => renderStorefrontCopy(key, translations, variables);
  const activeTiers = useMemo(() => {
    const source = tiers?.length ? tiers : defaultTiers;
    const excluded = [gifts, bundles].some(module => module?.enabled && module.items.some(rule => rule.productId === campaignProduct?.id));
    return excluded ? source.map(tier => ({ ...tier, discountType: 'none' as const, discountValue: 0, discountPercent: 0, marketOverrides: undefined })) : source;
  }, [tiers, gifts, bundles, campaignProduct?.id]);
  const catalog = useMemo<Variant[]>(() => {
    if (!campaignProduct) return variants;
    const productVariants = Array.isArray(campaignProduct.variants) ? campaignProduct.variants : [];
    if (!productVariants.length) return variants;
    return productVariants.map((item, index) => ({
      id: item.id || `${campaignProduct.id}-${index + 1}`,
      options: Object.fromEntries((Array.isArray(item.options) ? item.options : []).map((option, optionIndex) => [campaignProduct.optionNames?.[optionIndex] || option.name, option.value])),
      price: item.price,
      compareAtPrice: item.compareAtPrice,
      inventory: item.inventory,
      inventoryPolicy: item.inventoryPolicy,
      inventoryTracker: item.inventoryTracker,
      available: item.available,
      image: item.imageUrl ?? campaignProduct.imageUrl ?? null,
    }));
  }, [campaignProduct]);
  const optionLabels = useMemo(() => {
    if (!campaignProduct) return [{ name: 'Color', value: 'Color' }, { name: 'Size', value: 'Size' }];
    const productVariants = Array.isArray(campaignProduct.variants) ? campaignProduct.variants : [];
    if (!productVariants.length) return [{ name: 'Color', value: 'Color' }, { name: 'Size', value: 'Size' }];
    const names = Array.isArray(campaignProduct.optionNames) ? campaignProduct.optionNames : [];
    if (names.length) return names.map((name) => ({ name, value: name }));
    return productVariants.flatMap((item) => Array.isArray(item.options) ? item.options : []).reduce<Array<{ name: string; value: string }>>((result, option) => result.some((item) => item.name === option.name) ? result : [...result, option], []);
  }, [campaignProduct]);
  const hasVariantChoices = optionLabels.length > 0;
  const optionValues = useMemo(() => optionLabels.map((option) => [...new Set(catalog.map((item) => item.options[option.name]).filter((value): value is string => Boolean(value)))]), [catalog, optionLabels]);
  const [quantity, setQuantity] = useState(() => activeTiers.find((option) => option.recommended)?.quantity ?? activeTiers.at(-1)?.quantity ?? 1);
  const [slots, setSlots] = useState<(SlotSelection | null)[]>(() => campaignConfig?.variants.defaultSelection === 'none' ? Array(quantity).fill(null) : normalizeSlots(firstSlots, quantity, catalog));
  const [adding, setAdding] = useState(false);
  const [cartFailure, setCartFailure] = useState(false);
  const [cartFeedback, setCartFeedback] = useState<{ outcome: CartPreviewOutcome; quantity: number; lines: number } | null>(null);
  const cartTimer = useRef<number>();
  useEffect(() => {
    window.clearTimeout(cartTimer.current);
    setAdding(false);
    setCartFeedback(null);
    return () => window.clearTimeout(cartTimer.current);
  }, [locale, campaignProduct?.id, previewCartOutcome]);
  const tier = selectedTier(activeTiers, quantity);
  const visibleSlots = slots.slice(0, quantity);
  const missingSelection = visibleSlots.length < quantity || visibleSlots.some((slot) => !slot);
  const selected = visibleSlots.map((slot) => selectedVariant(slot, catalog)).filter(Boolean) as Variant[];
  const grouped = useMemo(() => selected.reduce<Record<string, { variant: Variant; quantity: number }>>((result, variant) => {
    result[variant.id] = result[variant.id] ? { variant, quantity: result[variant.id].quantity + 1 } : { variant, quantity: 1 };
    return result;
  }, {}), [selected]);
  // Price every variant actually used by a displayed tier, not the entire catalog.
  const neededVariantIds = [...new Set(activeTiers.flatMap(option => normalizeSlots(slots, option.quantity, catalog).slice(0, option.quantity)
    .flatMap(slot => { const variant = selectedVariant(slot, catalog); return variant ? [variant.id] : []; })).concat(selected.map(variant => variant.id)))].sort();
  const priceDemandKey = neededVariantIds.join(',');
  useEffect(() => {
    if (campaignProduct) onPreviewPriceDemand?.(campaignProduct.id, neededVariantIds);
  }, [campaignProduct?.id, priceDemandKey, onPreviewPriceDemand]);
  const stockIssue = Object.values(grouped).find(({ variant, quantity: count }) => isVariantSoldOut(variant) || (variant.inventoryTracker !== false && variant.inventoryPolicy !== 'continue' && count > variant.inventory));
  const marketCurrencyReady = previewPricing?.state === 'ready' && /^[A-Z]{3}$/.test(previewPricing.currencyCode ?? '');
  const marketPriceFor = (variant: Variant | null | undefined) => {
    const amountMinor = variant ? previewPricing?.amountsByVariant?.[variant.id] : undefined;
    return Number.isSafeInteger(amountMinor) && (amountMinor ?? -1) >= 0 ? amountMinor : undefined;
  };
  const marketPriceReady = marketCurrencyReady && selected.every((variant) => marketPriceFor(variant) !== undefined);
  const moneyFor = (amountMinor: number) => marketCurrencyReady
    ? formatMinorMoney(amountMinor, previewPricing!.currencyCode!, locale)
    : money(amountMinor / 100);
  const previewMarket = { primary: previewPricing?.isPrimaryMarket === true, shopCurrencyCode: previewPricing?.shopCurrencyCode, marketCurrencyCode: previewPricing?.currencyCode, autoExchangeRate: previewPricing?.autoExchangeRate !== false, exchangeRate: previewPricing?.exchangeRate ?? null };
  const previewTier = marketPriceReady && previewMarketId ? resolveMarketPreviewTier(tier, previewMarketId, previewMarket) : { status: 'ready' as const, tier };
  const tierPrices = selected.map((variant) => marketPriceReady ? marketPriceFor(variant)! : Math.round(variant.price * 100));
  const pricing = calculatePreviewPricing(tierPrices, previewTier.status === 'unavailable' ? undefined : previewTier.tier);
  const original = marketPriceReady ? pricing.original : selected.reduce((sum, variant) => sum + Math.round((variant.compareAtPrice ?? variant.price) * 100), 0);
  const discounted = pricing.discounted;
  const previewBlocked = Boolean(previewPricing && (!marketPriceReady || previewTier.status === 'unavailable'));
  const offers = useOfferSelection({ gifts, bundles, preview: offerPreview, tiers: activeTiers, mainProductId: campaignProduct?.id ?? '__simulated_main', mainQuantity: quantity, currencyCode: previewPricing?.currencyCode ?? 'USD', marketId: previewMarketId });
  const combinedQuantity = quantity + offers.quantity;
  const combinedTotal = discounted + offers.discounted;
  const combinedOriginal = original + offers.original;
  const combinedSafe = offers.safe && Number.isSafeInteger(combinedQuantity) && Number.isSafeInteger(combinedTotal) && Number.isSafeInteger(combinedOriginal);
  const selectedPriceFailed = selected.some(variant => previewPricing?.unavailableVariantIds?.includes(variant.id));
  const previewStatus = previewTier.status === 'unavailable'
    ? previewMessages?.conversionUnavailable ?? 'Market discount conversion is unavailable.'
    : previewPricing?.state === 'unavailable' || selectedPriceFailed
      ? previewMessages?.unavailable ?? 'Market prices are unavailable.'
      : previewPricing && !marketPriceReady
        ? previewMessages?.loading ?? 'Market prices are loading.'
        : '';

  const legacyComparison = (campaignConfig as (CampaignWidgetStyleConfig & { showOriginalAndDiscountedPrice?: boolean }) | undefined)?.showOriginalAndDiscountedPrice;
  const showOriginalPrices = legacyComparison !== false;
  const showPriceSummary = campaignConfig ? config.showPricing && campaignConfig.showPriceSummary !== false : config.showPricing;
  const showCartVariantDetails = campaignConfig?.showCartVariantDetails ?? true;

  useEffect(() => {
    const next = activeTiers.some((option) => option.quantity === quantity) ? quantity : (activeTiers.find((option) => option.recommended)?.quantity ?? activeTiers[0]?.quantity ?? 1);
    setQuantity(next);
    setSlots((selections) => campaignConfig?.variants.defaultSelection === 'none'
      ? Array.from({ length: next }, (_, index) => selections[index] ?? null)
      : normalizeSlots(selections, next, catalog));
  }, [activeTiers, campaignConfig?.variants.defaultSelection, catalog]);

  const updateSlot = (index: number, patch: Partial<SlotSelection>) => setSlots((current) => {
    const next = chooseAvailableVariant(current[index], patch, catalog);
    return current.map((slot, slotIndex) => slotIndex === index ? next : slot);
  });
  const chooseTier = (next: number) => {
    setQuantity(next);
    setSlots((current) => campaignConfig?.variants.defaultSelection === 'none'
      ? Array.from({ length: next }, (_, index) => current[index] ?? null)
      : normalizeSlots(current, next, catalog));
  };
  const changeExpandedTierSlot = (tierQuantity: number, index: number, patch: Partial<SlotSelection>) => {
    setQuantity(tierQuantity);
    setSlots((current) => {
      const expanded = normalizeSlots(current, tierQuantity, catalog).slice(0, tierQuantity);
      const next = chooseAvailableVariant(expanded[index] ?? null, patch, catalog);
      return expanded.map((slot, slotIndex) => slotIndex === index ? next : slot);
    });
  };
  const addBundle = () => {
    if (adding) return;
    if (missingSelection) {
      setCartFeedback({ outcome: 'no_stock', quantity: combinedQuantity, lines: Object.keys(grouped).length + new Set(offers.lines).size });
      notify(copy("widget.no_stock"), "error");
      return;
    }
    if (stockIssue) return;
    setCartFeedback(null);
    setAdding(true);
    const outcome = previewCartOutcome ?? (cartFailure ? 'failure' : 'success');
    const feedback = { outcome, quantity: combinedQuantity, lines: Object.keys(grouped).length + new Set(offers.lines).size };
    cartTimer.current = window.setTimeout(() => {
      setAdding(false);
      setCartFeedback(feedback);
      if (!previewOnly) notify(copy(cartFeedbackKeys[outcome], feedback), outcome === 'success' ? 'success' : 'error');
    }, 700);
  };
  const label = copy('widget.title');

  useEffect(() => {
    const root = tierChoicesRef.current;
    if (!root) return;
    const alignHeaders = () => {
      const options = Array.from(root.querySelectorAll<HTMLLabelElement>(`.${styles.tierOption}`));
      options.forEach((option) => { option.style.minHeight = ''; });
      const height = Math.max(...options.map((option) => option.scrollHeight));
      if (height > 0) options.forEach((option) => { option.style.minHeight = `${height}px`; });
    };
    let width = root.getBoundingClientRect().width;
    alignHeaders();
    const observer = new ResizeObserver(() => {
      const nextWidth = root.getBoundingClientRect().width;
      if (Math.abs(nextWidth - width) > 0.5) { width = nextWidth; alignHeaders(); }
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, [activeTiers, campaignConfig?.layout, campaignConfig?.typography, quantity]);

  const widgetStyle = {
    '--accent': safeColor(accent, '#171717'),
    '--widget-font-size': `${normalizeWidgetFontSize(config.widgetFontSize)}px`,
    ...(campaignConfig ? {
      '--card-gap': `${campaignConfig.card.gapPx}px`,
      '--card-radius': `${campaignConfig.card.radiusPx}px`,
      '--card-color': safeColor(campaignConfig.colors.card, '#F7F7F7'),
      '--selected-color': safeColor(campaignConfig.colors.selected, '#FFFFFF'),
      '--card-border-color': safeColor(campaignConfig.colors.cardBorder, '#D4D4D4'),
      '--border-color': safeColor(campaignConfig.colors.border, '#171717'),
      '--section-title-color': safeColor(campaignConfig.colors.sectionTitle, '#171717'),
      '--title-color': safeColor(campaignConfig.colors.title, '#171717'),
      '--subtitle-color': safeColor(campaignConfig.colors.subtitle, '#555555'),
      '--price-color': safeColor(campaignConfig.colors.price, '#171717'),
      '--compare-price-color': safeColor(campaignConfig.colors.comparePrice, '#666666'),
      '--badge-bg': safeColor(campaignConfig.colors.badgeBackground, '#171717'),
      '--badge-color': safeColor(campaignConfig.colors.badgeText, '#FFFFFF'),
      '--tier-savings-badge-background': safeColor(campaignConfig.colors.tierSavingsBadgeBackground, '#171717'),
      '--tier-savings-badge-text': safeColor(campaignConfig.colors.tierSavingsBadgeText, '#FFFFFF'),
      '--tier-savings-badge-radius': `${campaignConfig.card.tierSavingsBadgeRadiusPx}px`,
      '--variant-title-color': safeColor(campaignConfig.colors.variantTitle, '#626262'),
      '--variant-value-color': safeColor(campaignConfig.colors.variantValue, '#262626'),
      '--variant-price-color': safeColor(campaignConfig.colors.variantPrice, '#6D6D6D'),
      '--variant-original-price-color': safeColor(campaignConfig.colors.variantOriginalPrice, '#8A8A8A'),
      '--variant-background': safeColor(campaignConfig.colors.variantBackground, '#FFFFFF'),
      '--slot-number-color': safeColor(campaignConfig.colors.slotNumber, '#262626'),
      '--variant-border': safeColor(campaignConfig.colors.variantBorder, '#C6C6C6'),
      '--variant-selected-border': safeColor(campaignConfig.colors.variantSelectedBorder, '#171717'),
      '--variant-selected-background': safeColor(campaignConfig.colors.variantSelectedBackground, '#FFFFFF'),
      '--variant-selected-text': safeColor(campaignConfig.colors.variantSelectedText, '#171717'),
      '--add-button-bg': safeColor(campaignConfig.colors.addButtonBackground, '#171717'),
      '--add-button-color': safeColor(campaignConfig.colors.addButtonText, '#FFFFFF'),
      '--add-button-border': safeColor(campaignConfig.colors.addButtonBorder, '#171717'),
      '--savings-label-color': safeColor(campaignConfig.colors.savingsLabel, '#A13D29'),
      '--savings-price-color': safeColor(campaignConfig.colors.savingsPrice, '#A13D29'),
      '--cart-line-color': safeColor(campaignConfig.colors.cartLine, '#52615C'),
      '--status-color': safeColor(campaignConfig.colors.status, '#52615C'),
      '--status-size': `${campaignConfig.typography.status.sizePx}px`,
      '--status-weight': campaignConfig.typography.status.weight,
      '--summary-label-color': safeColor(campaignConfig.colors.summaryLabel, '#666666'),
      '--summary-amount-color': safeColor(campaignConfig.colors.summaryAmount, '#171717'),
      '--section-title-size': `${campaignConfig.typography.sectionTitle.sizePx}px`,
      '--section-title-weight': campaignConfig.typography.sectionTitle.weight,
      '--title-size': `${campaignConfig.typography.title.sizePx}px`,
      '--title-weight': campaignConfig.typography.title.weight,
      '--subtitle-size': `${campaignConfig.typography.subtitle.sizePx}px`,
      '--subtitle-weight': campaignConfig.typography.subtitle.weight,
      '--price-size': `${campaignConfig.typography.price.sizePx}px`,
      '--price-weight': campaignConfig.typography.price.weight,
      '--compare-price-size': `${campaignConfig.typography.comparePrice?.sizePx ?? 11}px`,
      '--compare-price-weight': campaignConfig.typography.comparePrice?.weight ?? 600,
      '--badge-size': `${campaignConfig.typography.badge.sizePx}px`,
      '--badge-weight': campaignConfig.typography.badge.weight,
      '--tier-savings-badge-size': `${campaignConfig.typography.tierSavingsBadge.sizePx}px`,
      '--tier-savings-badge-weight': campaignConfig.typography.tierSavingsBadge.weight,
      '--add-button-size': `${campaignConfig.typography.addButton?.sizePx ?? 14}px`,
      '--add-button-weight': campaignConfig.typography.addButton?.weight ?? 700,
      '--variant-title-size': `${campaignConfig.typography.variantTitle.sizePx}px`,
      '--variant-title-weight': campaignConfig.typography.variantTitle.weight,
      '--variant-value-size': `${campaignConfig.typography.variantValue.sizePx}px`,
      '--variant-value-weight': campaignConfig.typography.variantValue.weight,
      '--variant-price-size': `${campaignConfig.typography.variantPrice.sizePx}px`,
      '--variant-price-weight': campaignConfig.typography.variantPrice.weight,
      '--variant-original-price-size': `${campaignConfig.typography.variantOriginalPrice?.sizePx ?? 11}px`,
      '--variant-original-price-weight': campaignConfig.typography.variantOriginalPrice?.weight ?? 600,
      '--slot-number-size': `${campaignConfig.typography.slotNumber.sizePx}px`,
      '--slot-number-weight': campaignConfig.typography.slotNumber.weight,
      '--savings-label-size': `${campaignConfig.typography.savingsLabel.sizePx}px`,
      '--savings-label-weight': campaignConfig.typography.savingsLabel.weight,
      '--savings-price-size': `${campaignConfig.typography.savingsPrice.sizePx}px`,
      '--savings-price-weight': campaignConfig.typography.savingsPrice.weight,
      '--cart-line-size': `${campaignConfig.typography.cartLine.sizePx}px`,
      '--cart-line-weight': campaignConfig.typography.cartLine.weight,
      '--summary-label-size': `${campaignConfig.typography.summaryLabel.sizePx}px`,
      '--summary-label-weight': campaignConfig.typography.summaryLabel.weight,
      '--summary-amount-size': `${campaignConfig.typography.summaryAmount.sizePx}px`,
      '--summary-amount-weight': campaignConfig.typography.summaryAmount.weight,
      '--checkout-note-size': `${campaignConfig.typography.checkoutNote.sizePx}px`,
      '--checkout-note-weight': campaignConfig.typography.checkoutNote.weight,
    } : {}),
  } as React.CSSProperties;

  return <div className={`${styles.storefront} ${compact ? styles.storefrontEditor : ""} ${device === "mobile" ? styles.storefrontMobile : ""}`} style={widgetStyle}>
    {!compact && <div className={styles.storeNav}><strong>Atelier Mora</strong><span>Skin care / Renewal serum</span></div>}
    <div className={styles.productFrame}>
      {!compact && <div className={styles.productImage}><img src="https://images.unsplash.com/photo-1611930022073-b7a4ba5fcccd?auto=format&fit=crop&w=900&q=85" alt="Amber skincare serum bottle" /></div>}
      <div className={styles.productInfo}>
        {!previewOnly && <><span className={styles.productEyebrow}>Daily ritual</span><p className={styles.productLead}>A focused formula with three selectable finish-and-size variants.</p></>}
        <div className={styles.widget}>
          {(!previewOnly || label) && <div className={styles.widgetIntro}><div>{label && <strong>{label}</strong>}{!previewOnly && <p>{copy("widget.description")}</p>}</div>{!previewOnly && <span className={styles.widgetRule}>{copy("widget.tier_rule")}</span>}</div>}
          {previewBlocked && <p className={styles.stockError} role="status">{previewStatus}</p>}
          {Boolean(previewPricing?.unavailableVariantIds?.length) && onRetryPreviewPrices && <button type="button" onClick={onRetryPreviewPrices}>{previewMessages?.retry ?? 'Retry'}</button>}
          <fieldset ref={tierChoicesRef} className={styles.tierChoices} data-layout={campaignConfig?.layout ?? 'stacked'} data-badge-position={campaignConfig?.badgePosition ?? 'corner'}>
            <legend className={styles.srOnly}>Quantity tier</legend>
            {activeTiers.map((option, index) => {
              const isSelectedTier = quantity === option.quantity && activeTiers.findIndex((candidate) => candidate.quantity === quantity) === index;
              const tierSlots = normalizeSlots(slots, option.quantity, catalog).slice(0, option.quantity);
              const optionPriceReady = !previewPricing || (marketCurrencyReady && tierSlots.every(slot => { const variant = selectedVariant(slot, catalog); return !variant || marketPriceFor(variant) !== undefined; }));
              const optionPriceFailed = tierSlots.some(slot => { const variant = selectedVariant(slot, catalog); return variant && previewPricing?.unavailableVariantIds?.includes(variant.id); });
              const optionTier = marketCurrencyReady && previewMarketId ? resolveMarketPreviewTier(option, previewMarketId, previewMarket) : { status: 'ready' as const, tier: option };
              const optionPrices = tierSlots.map((slot) => {
                const variant = selectedVariant(slot, catalog);
                return previewPricing ? marketPriceFor(variant) ?? 0 : Math.round((variant?.price ?? 0) * 100);
              });
              const optionPricing = calculatePreviewPricing(optionPrices, optionTier.status === 'unavailable' ? undefined : optionTier.tier);
              const displayedOriginal = isSelectedTier ? original : optionPricing.original;
              const displayedDiscounted = isSelectedTier ? discounted : optionPricing.discounted;
              const subtitle = tierDescription(option);
              return <div key={index} className={`${styles.tierChoice} ${isSelectedTier ? styles.tierChoiceSelected : ""}`}>
                <button type="button" className={styles.tierOption} aria-pressed={isSelectedTier} onClick={() => chooseTier(option.quantity)}>
                  <span className={styles.tierHeader}><span className={styles.tierTitleRow}><strong>{option.label}</strong>{optionPriceReady && campaignConfig?.showTierSavingsBadge && optionPricing.savings > 0 && <span className={styles.tierSavingsBadge}>{copy('widget.tier_savings_badge', { saving_amount: moneyFor(optionPricing.savings) })}</span>}</span>{subtitle && <small className={styles.tierSubtitle}>{subtitle}</small>}{option.tag && <em className={styles.tierTag}>{option.tag}</em>}</span>
                  <span className={styles.tierAmount}>{!optionPriceReady ? <small>{optionPriceFailed || previewPricing?.state === 'unavailable' ? previewMessages?.unavailable ?? 'Market prices are unavailable.' : previewMessages?.loading ?? 'Market prices are loading.'}</small> : optionTier.status === 'unavailable' ? <small>{previewMessages?.conversionUnavailable ?? 'Market discount conversion is unavailable.'}</small> : <><b>{moneyFor(displayedDiscounted)}</b>{showOriginalPrices && displayedDiscounted < displayedOriginal && <small>{moneyFor(displayedOriginal)}</small>}{optionTier.status === 'auto_convert' && <small className={styles.tierConversionNotice}>{previewMessages?.conversionUnavailable ?? 'Actual price prevails.'}</small>}</>}</span>
                </button>
                {hasVariantChoices && config.showSelectors && isSelectedTier && (
                  <VariantBundleComposer
                    slots={isSelectedTier ? visibleSlots : tierSlots}
                    tier={optionTier.tier}
                    showComparison={showOriginalPrices}
                    config={config}
                    onChange={isSelectedTier ? updateSlot : (slotIndex, patch) => changeExpandedTierSlot(option.quantity, slotIndex, patch)}
                    copy={copy}
                    catalog={catalog}
                    optionLabels={optionLabels}
                    optionValues={optionValues}
                    priceOverridesByVariant={previewPricing ? previewPricing.amountsByVariant ?? {} : undefined}
                    formatMoney={moneyFor}
                  />
                )}
                {hasVariantChoices && !config.showSelectors && isSelectedTier && !previewOnly && <p className={styles.selectorFallback}>Variant selectors are hidden in this widget style.</p>}
              </div>;
            })}
          </fieldset>
          <OfferPreview selection={offers} device={device} locale={locale} translations={translations} preview={offerPreview} tiers={activeTiers} onUnlock={chooseTier} mainTotal={discounted} mainReady={!previewBlocked && !missingSelection && !stockIssue} currencyCode={previewPricing?.currencyCode ?? 'USD'} />
          {!previewBlocked && (showCartVariantDetails || showPriceSummary || missingSelection) && <div className={styles.bundleSummary}>{showCartVariantDetails && Object.values(grouped).map(({ variant, quantity: count }) => {
            const itemName = Object.values(variant.options).join(' / ') || campaignProduct?.title || '';
            const itemSoldOut = isVariantSoldOut(variant) || (variant.inventoryTracker !== false && variant.inventoryPolicy !== 'continue' && count > variant.inventory);
            const itemBasePrice = marketPriceReady ? marketPriceFor(variant)! : Math.round(variant.price * 100);
            const itemOriginal = marketPriceReady ? itemBasePrice * count : Math.round((variant.compareAtPrice ?? variant.price) * 100) * count;
            const itemDiscounted = calculatePreviewPricing([itemBasePrice], previewTier.status === 'unavailable' ? undefined : previewTier.tier).discounted * count;
            return <div key={variant.id}><span>{itemName}{itemSoldOut ? ` (${copy('widget.sold_out')})` : ''} × {count}</span><b><strong className={styles.summarySalePrice}>{moneyFor(itemDiscounted)}</strong> {showOriginalPrices && itemDiscounted < itemOriginal && <del className={styles.summaryOriginalPrice}>{moneyFor(itemOriginal)}</del>}</b></div>;
          })}
            {showCartVariantDetails && <OfferReceipt selection={offers} translations={translations} locale={locale} currencyCode={previewPricing?.currencyCode ?? 'USD'} />}
            {missingSelection && <p className={styles.stockError} role="alert">{copy("widget.no_stock")}</p>}
            {showPriceSummary && !stockIssue && <><div className={styles.totalRow}><span>{copy("widget.original")}</span><b>{(combinedSafe ? moneyFor(combinedOriginal) : '…')}</b></div><div className={styles.savingsRow}><span>{copy("widget.savings")}</span><b>-{(combinedSafe ? moneyFor(combinedOriginal - combinedTotal) : '…')}</b></div></>}
            {showPriceSummary && !stockIssue && <div className={styles.grandTotal}><span>{copy("widget.total")}</span><b>{(combinedSafe ? moneyFor(combinedTotal) : '…')}</b></div>}
          </div>}
          <Button onClick={addBundle} disabled={!combinedSafe || previewBlocked || adding || Boolean(stockIssue) || missingSelection} aria-busy={adding} aria-label={previewBlocked ? previewStatus : stockIssue ? copy("widget.sold_out") : copy("widget.add_to_cart", { quantity: combinedQuantity, price: (combinedSafe ? moneyFor(combinedTotal) : '…') })} className={styles.addBundle}><span hidden={adding}>{previewBlocked ? previewStatus : stockIssue ? copy("widget.sold_out") : copy("widget.add_to_cart", { quantity: combinedQuantity, price: (combinedSafe ? moneyFor(combinedTotal) : '…') })}</span>{adding && <div className={styles.cartLoadingRotator}><svg aria-hidden="true" focusable="false" className="icon" width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18.3332 9.99935C18.3332 14.6017 14.6022 18.3327 9.99984 18.3327C5.39746 18.3327 1.6665 14.6017 1.6665 9.99935C1.6665 5.39698 5.39746 1.66602 9.99984 1.66602" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /></svg></div>}</Button>
          <p className={styles.cartFeedback} data-cart-feedback role="status" aria-live="polite">{cartFeedback && copy(cartFeedbackKeys[cartFeedback.outcome], cartFeedback)}</p>
          {!previewOnly && <label className={styles.failureToggle}><input type="checkbox" checked={cartFailure} onChange={(event) => setCartFailure(event.target.checked)} /> Preview cart failure feedback</label>}
          {!previewOnly && <p className={styles.checkoutNote}>{copy("widget.checkout_note")}</p>}
        </div>
      </div>
    </div>
  </div>;
}

type CopyRenderer = (key: StorefrontCopyKey, variables?: Record<string, string | number>) => string;

function VariantBundleComposer({ slots, tier, showComparison, config, onChange, copy, catalog, optionLabels, optionValues, priceOverridesByVariant, formatMoney }: { slots: (SlotSelection | null)[]; tier: Tier; showComparison: boolean; config: WidgetPreviewConfig; onChange: (index: number, patch: Partial<SlotSelection>) => void; copy: CopyRenderer; catalog: Variant[]; optionLabels: Array<{ name: string; value: string }>; optionValues: string[][]; priceOverridesByVariant?: Record<string, number>; formatMoney: (amountMinor: number) => string }) {
  return <div className={styles.tierComposer}>
    <div className={styles.variantSlots}>{slots.map((slot, index) => <VariantSlot key={index} index={index} slot={slot} tier={tier} showComparison={showComparison} config={config} onChange={onChange} copy={copy} catalog={catalog} optionLabels={optionLabels} optionValues={optionValues} priceOverridesByVariant={priceOverridesByVariant} formatMoney={formatMoney} />)}</div>
  </div>;
}

function VariantSlot({ index, slot, tier, showComparison, config, onChange, copy, catalog, optionLabels, optionValues, priceOverridesByVariant, formatMoney }: { index: number; slot: SlotSelection | null; tier: Tier; showComparison: boolean; config: WidgetPreviewConfig; onChange: (index: number, patch: Partial<SlotSelection>) => void; copy: CopyRenderer; catalog: Variant[]; optionLabels: Array<{ name: string; value: string }>; optionValues: string[][]; priceOverridesByVariant?: Record<string, number>; formatMoney: (amountMinor: number) => string }) {
  const variant = selectedVariant(slot, catalog);
  const priceOverrideMinor = variant ? priceOverridesByVariant?.[variant.id] : undefined;
  const pricePending = priceOverridesByVariant !== undefined && priceOverrideMinor === undefined;
  const slotBasePrice = priceOverrideMinor ?? (variant ? Math.round(variant.price * 100) : 0);
  const soldOut = variant ? isVariantSoldOut(variant) : false;
  const slotPrice = variant && !soldOut ? calculatePreviewPricing([slotBasePrice], tier).discounted : slotBasePrice;
  const slotOriginal = priceOverrideMinor ?? Math.round((variant?.compareAtPrice ?? variant?.price ?? 0) * 100);
  const slotHeader = <><legend>#{index + 1}</legend>{slot && variant && <span className={styles.stockState}>{pricePending ? <span>…</span> : <><b>{formatMoney(slotPrice)}</b>{!soldOut && showComparison && slotOriginal > slotPrice && <del className={styles.variantOriginalPrice}>{formatMoney(slotOriginal)}</del>}</>}</span>}</>;
  const slotClassName = `${styles.variantSlot} ${config.selectorStyle === "Text values" ? styles.textValues : ""}`;
  return <fieldset className={slotClassName}>{slotHeader}<div className={styles.slotControls}>{optionLabels.map((option, optionIndex) => {
    const name = option.name;
    const values = optionValues[optionIndex] ?? [];
    if (config.selectorStyle === "Dropdown") return <label className={styles.dropdownLine} key={name}>{name}<select value={slot?.[name] ?? ''} onChange={(event) => onChange(index, { [name]: event.target.value })}>{!slot && <option value="" disabled>{copy("widget.choose_option")}</option>}{values.map((value) => { const unavailable = !hasPurchasableOption(catalog, name, value, slot); return <option key={value} value={value}>{value}{unavailable ? ` (${copy("widget.sold_out")})` : ""}</option>; })}</select></label>;
    if (config.selectorStyle === "Original variant images" && optionIndex === 0) return <div className={styles.optionLine} key={name}><span>{name}</span><div className={styles.imageTileGrid} style={{ '--variant-tile-size': `${normalizeImageTileSize(config.imageTileSize)}px`, '--variant-tile-radius': `${config.imageTileRadius}px` } as React.CSSProperties}>{values.map((value) => {
      const unavailable = !hasPurchasableOption(catalog, name, value, slot);
      const candidate = catalog.find((item) => item.options[name] === value && Object.entries(slot ?? {}).every(([otherName, selected]) => otherName === name || item.options[otherName] === selected)) ?? catalog.find((item) => item.options[name] === value);
      return <button type="button" key={value} aria-label={value} aria-pressed={slot?.[name] === value} className={`${styles.imageTile} ${slot?.[name] === value ? styles.imageTileActive : ''} ${unavailable ? styles.optionSoldOut : ''}`} style={{ borderRadius: config.imageTileRadius }} onClick={() => onChange(index, { [name]: value })}>{candidate?.image ? <img src={candidate.image} alt="" style={{ borderRadius: config.imageTileRadius, clipPath: `inset(0 round ${config.imageTileRadius}px)` }} /> : <span className={styles.imageTileBlank} aria-hidden="true" />}{config.showImageColorValue && <span>{value}</span>}</button>;
    })}</div></div>;
    return <div className={styles.optionLine} key={name}><span>{name}</span><div>{values.map((value) => {
      const unavailable = !hasPurchasableOption(catalog, name, value, slot);
      const active = slot?.[name] === value;
      return <button type="button" key={value} aria-label={value} aria-pressed={active} className={`${styles.sizeButton} ${unavailable ? styles.optionSoldOut : ''} ${active ? styles.sizeActive : ''}`} onClick={() => onChange(index, { [name]: value })}>{value}</button>;
    })}</div></div>;
  })}</div></fieldset>;
}
