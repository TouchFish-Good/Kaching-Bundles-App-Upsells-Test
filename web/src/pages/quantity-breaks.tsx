import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { waitForCampaignOperationBatch, deleteCampaigns, readCampaign, readCampaignByPlatformDiscount, readCampaigns, saveCampaign as persistCampaign, deleteCampaign as removeCampaign, changeCampaignStatus, changeCampaignStatuses, readCampaignProductTitles } from "../prototype/campaign-api";
import { formatCampaignDateTime, formatTierSummary, formatTierRows, toAdminCampaign, toCampaignDraft, type ServerCampaign } from "../prototype/campaign-adapter";
import type { Campaign, CampaignStatus, Tier, Toast, WorkspacePage } from "../prototype/model";
import { CampaignEditor } from "../prototype/CampaignEditor";
import { ThemeSetupGuide, ThemeSetupGuideDialog } from "../prototype/ThemeSetupGuide";
import { themeSetupGuideText } from "../prototype/theme-setup-guide-messages";
import { campaignText } from "../prototype/campaign-editor-messages";
import { Translations, TranslationsLoading } from "../prototype/Translations";
import { Button, StatusPill, ToastRegion } from "../prototype/ui";
import { readWorkspaceLocation, workspaceHref } from "../prototype/navigation";
import { findPrototypeCoverageConflicts } from "../prototype/coverage";
import { readShopIdentity, type ShopIdentity } from "../prototype/shop-identity-api";
import { DEFAULT_ADMIN_LOCALE, resolveAdminLocale, setAdminLocale } from "../prototype/admin-locale";
import { AdminLanguageSelect } from "../prototype/AdminLanguageSelect";
import { workspaceText } from "../prototype/admin-workspace-messages";
import { useAuthenticatedFetch } from "../hooks/useAuthenticatedFetch";
import { useAppBridge } from "../hooks/useAppBridge";
import { beginAdminLoading, isEmbeddedAdmin, showAdminMessage } from "../prototype/admin-feedback";
import { BridgeConfirmation } from "../prototype/BridgeConfirmation";
import { FeedbackBoard, FeedbackBoardLoading } from '../prototype/FeedbackBoard';
import QuantityBreaksPlan from "./quantity-breaks/plan";
import { readSubscription, startSubscriptionCheckout, type SubscriptionResponse } from "../prototype/subscription-api";
import { openNativePackagePurchase } from "../prototype/subscription-navigation";
import { subscriptionText } from "../prototype/subscription-messages";
import { subscriptionNotice } from "../prototype/subscription-notice";
import { readBootstrap } from "../prototype/bootstrap-api";
import { markStartup } from "../prototype/startup-performance";
import { browserStorage } from "../prototype/browser-storage";
import { readStartupResource, reportStartupFailure } from "../prototype/startup-read";
import { startupLoadError } from "../prototype/startup-messages";
import styles from "./quantity-breaks.module.css";

const tierSummary = (tiers: Tier[], locale: string) => formatTierSummary(tiers, locale);
const normalizedListStatus = (campaign: Campaign): Campaign['listStatus'] => campaign.listStatus ?? (campaign.status === 'Paused' ? 'Ended' : campaign.status);

export default function QuantityBreaksPrototype() {
  const { t, i18n } = useTranslation();
  const wt = (key: Parameters<typeof workspaceText>[1], params: Record<string, string | number> = {}) => workspaceText(i18n.language, key, params);
  const fetcher = useAuthenticatedFetch();
  const app = useAppBridge();
  const [location, setLocation] = useState(() => readWorkspaceLocation(typeof window === "undefined" ? "/quantity-breaks" : window.location.pathname));
  useEffect(() => { if (window.location.pathname === "/quantity-breaks/widget") window.history.replaceState(null, "", "/quantity-breaks"); }, []);
  const page = location.page;
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [serverCampaigns, setServerCampaigns] = useState<ServerCampaign[]>([]);
  const [campaignStatus, setCampaignStatus] = useState<"loading" | "ready" | "error">("loading");
  const [campaignRefresh, setCampaignRefresh] = useState(0);
  const [startupRefresh, setStartupRefresh] = useState(0);
  const campaignCacheReady = useRef(false);
  const confirmationPolling = useRef<{ storeId: string; until: number } | null>(null);
  const [activationConfirmations, setActivationConfirmations] = useState<{ storeId: string; ids: string[] } | null>(null);
  const deletedCampaignIds = useRef(new Map<string, Set<string>>());
  const deletionRead = useRef<AbortController | null>(null);
  const keepCampaign = (storeId: string, id: string) => !deletedCampaignIds.current.get(storeId)?.has(id);
  const forgetDeletedCampaigns = (storeId: string, ids: string[]) => {
    if (verifiedStoreId.current !== storeId || !ids.length) return;
    const deleted = deletedCampaignIds.current.get(storeId) ?? new Set<string>();
    ids.forEach((id) => deleted.add(id));
    deletedCampaignIds.current.set(storeId, deleted);
    setCampaigns((items) => items.filter((item) => !deleted.has(item.id)));
    setServerCampaigns((items) => items.filter((item) => !deleted.has(item.id)));
    setEditorCampaign((item) => item && deleted.has(item.id) ? null : item);
  };
  const verifiedStoreId = useRef<string | null>(null);
  const pendingAdminLocale = useRef<string | null>(null);
  const reconciledEditorCampaignId = useRef<string | null>(null);
  const [editorCampaign, setEditorCampaign] = useState<Campaign | null>(null);
  const [deepLinkStatus, setDeepLinkStatus] = useState<'idle' | 'loading' | 'missing'>(() => location.page === 'discount-detail' ? 'loading' : 'idle');
  const listedEditing = location.campaignId ? campaigns.find((campaign) => campaign.id === location.campaignId) ?? null : null;
  const editing = location.campaignId ? editorCampaign?.id === location.campaignId ? editorCampaign : listedEditing : null;
  const [toast, setToast] = useState<Toast>(null);
  const [shop, setShop] = useState<ShopIdentity | null>(null);
  useEffect(() => () => { deletionRead.current?.abort(); }, [shop?.storeId]);
  const [shopTimeZone, setShopTimeZone] = useState<{ storeId: string; value: string } | null>(null);
  const [shopStatus, setShopStatus] = useState<"loading" | "ready" | "error">("loading");
  const [subscriptionStatus, setSubscriptionStatus] = useState<'loading' | 'ready' | 'denied' | 'error'>('loading');
  const [subscription, setSubscription] = useState<SubscriptionResponse | null>(null);
  const hasResolvedSubscription = useRef(false);
  useEffect(() => {
    if (!shop?.storeId || !subscription?.access || !subscription.entitlement?.validUntil) return undefined;
    let active = true;
    setShopTimeZone(null);
    void fetcher('/api/quantity-breaks/shop-timezone', { credentials: 'same-origin' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Store time zone is unavailable.');
        const body = await response.json() as { timeZone?: unknown };
        if (active && typeof body.timeZone === 'string') setShopTimeZone({ storeId: shop.storeId, value: body.timeZone });
      }).catch(() => { if (active) setShopTimeZone(null); });
    return () => { active = false; };
  }, [fetcher, shop?.storeId, subscription?.access, subscription?.entitlement?.validUntil]);
  const isPlanPage = page === 'plan';
  const needsCampaigns = !['translations', 'feedback', 'plan', 'not-found', 'discount-detail'].includes(page);
  const refreshStartup = useCallback(() => {
    setStartupRefresh((value) => value + 1);
  }, []);
  useEffect(() => {
    if (isPlanPage || needsCampaigns) return;
    let active = true;
    if (!hasResolvedSubscription.current) setSubscriptionStatus('loading');
    readStartupResource((signal) => readSubscription(fetcher, signal), () => active).then((subscription) => {
      if (!active) return;
      setSubscription(subscription);
      if (!(subscription.planPageRequired ?? !subscription.access)) {
        hasResolvedSubscription.current = true;
        setSubscriptionStatus('ready');
        markStartup('subscription-ready');
      }
      else {
        setSubscriptionStatus('denied');
        setSubscription(null);
        hasResolvedSubscription.current = false;
        campaignCacheReady.current = false;
        setEditorCampaign(null);
        setShop(null); setCampaigns([]); setServerCampaigns([]);
        window.history.replaceState(window.history.state, '', `/quantity-breaks/plan${window.location.search}`);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
    }).catch((error) => {
      if (!active) return;
      reportStartupFailure('subscription', error, fetcher);
      if (hasResolvedSubscription.current && (error as { status?: number }).status !== 401 && (error as { status?: number }).status !== 403) return;
      hasResolvedSubscription.current = false;
      setSubscriptionStatus('error');
    });
    return () => { active = false; };
  }, [fetcher, page, isPlanPage, needsCampaigns, startupRefresh]);
  useEffect(() => {
    if (!shop?.storeId || subscriptionStatus !== 'ready' || (page !== 'dashboard' && page !== 'campaigns')) return undefined;
    let active = true;
    const timer = setTimeout(() => {
      void readSubscription(fetcher).then((fresh) => {
        if (active && fresh.access) setSubscription(fresh);
      }).catch(() => { /* Keep the confirmed cached subscription on a transient refresh failure. */ });
    }, 3_000);
    return () => { active = false; clearTimeout(timer); };
  }, [fetcher, page, shop?.storeId, subscriptionStatus, startupRefresh]);
  useEffect(() => {
    if (isPlanPage || !needsCampaigns) return;
    let active = true;
    const initial = !campaignCacheReady.current;
    if (!hasResolvedSubscription.current) setSubscriptionStatus('loading');
    if (!verifiedStoreId.current) setShopStatus('loading');
    if (initial) setCampaignStatus('loading');
    readStartupResource((signal) => readBootstrap(fetcher, true, signal), () => active).then((result) => {
      if (!active) return;
      const nextSubscription = result.subscription;
      if (nextSubscription.planPageRequired ?? !nextSubscription.access) {
        setSubscriptionStatus('denied');
        setSubscription(null);
        hasResolvedSubscription.current = false;
        campaignCacheReady.current = false;
        setEditorCampaign(null); setShop(null); setCampaigns([]); setServerCampaigns([]);
        window.history.replaceState(window.history.state, '', `/quantity-breaks/plan${window.location.search}`);
        window.dispatchEvent(new PopStateEvent('popstate'));
        return;
      }
      const storeId = result.shop!.storeId;
      if (verifiedStoreId.current && verifiedStoreId.current !== storeId) {
        pendingAdminLocale.current = null;
        setEditorCampaign(null);
        reconciledEditorCampaignId.current = null;
      }
      verifiedStoreId.current = storeId;
      setSubscription(nextSubscription);
      setShop(result.shop!);
      const visibleCampaigns = result.campaigns!.filter((item) => keepCampaign(storeId, item.id));
      setServerCampaigns(visibleCampaigns);
      setCampaigns(visibleCampaigns.map((item) => toAdminCampaign(item)));
      campaignCacheReady.current = true;
      hasResolvedSubscription.current = true;
      setCampaignStatus('ready');
      setSubscriptionStatus('ready');
      setShopStatus('ready');
      markStartup('subscription-ready'); markStartup('shop-ready'); markStartup('campaigns-ready');
      setCampaignRefresh((value) => value + 1);
    }).catch((error) => {
      if (!active) return;
      reportStartupFailure('bootstrap', error, fetcher);
      if (hasResolvedSubscription.current && (error as { status?: number }).status !== 401 && (error as { status?: number }).status !== 403) return;
      hasResolvedSubscription.current = false;
      setSubscriptionStatus('error');
    });
    return () => { active = false; };
  }, [fetcher, isPlanPage, needsCampaigns, startupRefresh]);
  useEffect(() => {
    if (isPlanPage) return;
    const refreshIdentity = () => {
      if (readWorkspaceLocation(window.location.pathname).page === 'editor') return;
      setStartupRefresh((value) => value + 1);
    };
    // Returning to the tab must not unmount an editor with unsaved form state.
    const onVisible = () => { if (document.visibilityState === "visible" && location.page !== 'editor') refreshIdentity(); };
    window.addEventListener("pageshow", refreshIdentity);
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.removeEventListener("pageshow", refreshIdentity); document.removeEventListener("visibilitychange", onVisible); };
  }, [location.page, isPlanPage]);
  useEffect(() => {
    if (isPlanPage || needsCampaigns) return;
    let active = true;
    if (!verifiedStoreId.current) setShopStatus("loading");
    readStartupResource((signal) => readShopIdentity(fetcher, signal), () => active).then((identity) => {
      if (!active) return;
      if (verifiedStoreId.current && verifiedStoreId.current !== identity.storeId) {
        pendingAdminLocale.current = null;
        campaignCacheReady.current = false;
        setCampaigns([]); setServerCampaigns([]); setEditorCampaign(null);
        reconciledEditorCampaignId.current = null;
        setSubscription(null);
        setCampaignStatus('loading');
        hasResolvedSubscription.current = false;
        setSubscriptionStatus('loading');
        setStartupRefresh((value) => value + 1);
      } else if (verifiedStoreId.current) {
        setCampaignRefresh((value) => value + 1);
      }
      verifiedStoreId.current = identity.storeId;
      setShop(identity);
      setShopStatus("ready");
      markStartup('shop-ready');
    }).catch((error) => {
      if (!active) return;
      reportStartupFailure('shop', error, fetcher);
      if (verifiedStoreId.current && (error as { status?: number }).status !== 401 && (error as { status?: number }).status !== 403) return;
      setShopStatus("error");
    });
    return () => { active = false; };
  }, [fetcher, startupRefresh, isPlanPage, needsCampaigns]);
  useEffect(() => {
    if (!shop?.storeId) return;
    const selected = pendingAdminLocale.current;
    pendingAdminLocale.current = null;
    if (selected) {
      try { setAdminLocale(shop.storeId, selected, browserStorage('localStorage')); }
      catch { notify(wt('preferenceNotStored'), 'error'); }
    }
    void i18n.changeLanguage(selected ?? resolveAdminLocale({ storeId: shop.storeId, search: window.location.search, storage: browserStorage('localStorage') }));
  }, [shop?.storeId, i18n]);
  const changeAdminLanguage = (locale: string) => {
    if (!shop?.storeId) pendingAdminLocale.current = locale;
    if (shop?.storeId) {
      try { setAdminLocale(shop.storeId, locale, browserStorage('localStorage')); }
      catch { notify(wt('preferenceNotStored'), 'error'); }
    }
    void i18n.changeLanguage(locale);
  };
  useEffect(() => {
    if (!needsCampaigns || subscriptionStatus !== 'ready' || shopStatus !== 'ready') return;
    if (!shop?.storeId) return;
    let active = true;
    const isInitialLoad = !campaignCacheReady.current;
    if (isInitialLoad) setCampaignStatus("loading");
    let appliedVersion = 0;
    let confirmationTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleConfirmation = () => {
      clearTimeout(confirmationTimer);
      const polling = confirmationPolling.current;
      if (polling?.storeId === shop.storeId && Date.now() < polling.until) {
        const delay = polling.until - Date.now() > 50_000 ? 2_000 : 5_000;
        confirmationTimer = setTimeout(() => { if (active) setCampaignRefresh((value) => value + 1); }, delay);
      }
    };
    const read = (configurationOnly: boolean) => readStartupResource(async (signal) => {
      const items = await readCampaigns(fetcher, { configurationOnly, signal });
      // Validate adapters inside the bounded read, before changing any state.
      return { items, campaigns: items.map((item) => toAdminCampaign(item)) };
    }, () => active);
    const apply = ({ items, campaigns }: { items: ServerCampaign[]; campaigns: Campaign[] }) => {
      if (!active) return;
      const version = ++appliedVersion;
      setActivationConfirmations((current) => {
        if (!current || current.storeId !== shop.storeId) return null;
        const ids = current.ids.filter((id) => items.some((item) => item.id === id && ['publishing', 'activating', 'needs_reconciliation'].includes(item.platformOperationState ?? '') && item.platformStatus !== 'active' && item.platformStatus !== 'paused' && item.platformStatus !== 'missing'));
        return ids.length === current.ids.length ? current : ids.length ? { ...current, ids } : null;
      });
      const pending = items.some((item) => ['needs_reconciliation', 'publishing', 'activating', 'pausing'].includes(item.platformOperationState ?? '') && item.platformDiscountId);
      if (pending && confirmationPolling.current?.storeId !== shop.storeId) confirmationPolling.current = { storeId: shop.storeId, until: Date.now() + 60_000 };
      if (!pending) confirmationPolling.current = null;
      scheduleConfirmation();
      campaignCacheReady.current = true;
      setServerCampaigns(items.filter((item) => keepCampaign(shop.storeId, item.id)));
      setCampaigns(campaigns.filter((item) => keepCampaign(shop.storeId, item.id)));
      setCampaignStatus("ready");
      markStartup('campaigns-ready');
      const productIds = items.flatMap((item) => item.scope.kind === 'products' ? item.scope.productIds ?? [] : []);
      void readCampaignProductTitles(productIds, fetcher).then((titles) => {
        if (active && version === appliedVersion) setCampaigns(items.filter((item) => keepCampaign(shop.storeId, item.id)).map((item) => toAdminCampaign(item, titles)));
      }).catch(() => undefined);
    };
    read(isInitialLoad).then(async (result) => {
      if (!active) return;
      apply(result);
      // Configuration is safe to render immediately, but linked discounts stay
      // unverified until the ordinary authoritative SHOPLINE read completes.
      if (isInitialLoad && result.items.some((item) => item.platformDiscountId)) {
        try { apply(await read(false)); }
        catch (error) { if (active) reportStartupFailure('campaigns', error, fetcher); }
      }
    }).catch((error) => {
      if (!active) return;
      reportStartupFailure('campaigns', error, fetcher);
      scheduleConfirmation();
      if (!isInitialLoad && (error as { status?: number }).status !== 401 && (error as { status?: number }).status !== 403) return;
      setCampaignStatus("error");
    });
    return () => { active = false; clearTimeout(confirmationTimer); };
  }, [shop?.storeId, campaignRefresh, fetcher, needsCampaigns, subscriptionStatus, shopStatus]);
  const refreshCampaignsAfterWrite = (pending: boolean) => {
    if (pending && shop?.storeId) confirmationPolling.current = { storeId: shop.storeId, until: Date.now() + 60_000 };
    setCampaignRefresh((value) => value + 1);
  };
  const notify = (message: string, tone: NonNullable<Toast>["tone"] = "notice") => {
    if (isEmbeddedAdmin()) showAdminMessage(app, message, tone);
    else setToast({ message, tone });
  };
  useEffect(() => {
    const onPopState = () => setLocation(readWorkspaceLocation(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  const navigate = (next: WorkspacePage, campaignId?: string) => {
    const href = workspaceHref(next, campaignId);
    if (typeof window !== "undefined" && window.location.pathname !== href) window.history.pushState(null, "", href);
    setLocation(readWorkspaceLocation(href));
  };
  useEffect(() => {
    if (location.page !== 'discount-detail' || subscriptionStatus !== 'ready') return;
    let active = true;
    setDeepLinkStatus('loading');
    readCampaignByPlatformDiscount(location.platformDiscountId, fetcher).then((campaign) => {
      if (!active) return;
      if (verifiedStoreId.current && !keepCampaign(verifiedStoreId.current, campaign.id)) { setDeepLinkStatus('missing'); return; }
      campaignCacheReady.current = true;
      setServerCampaigns((items) => [campaign, ...items.filter((item) => item.id !== campaign.id)]);
      const adminCampaign = toAdminCampaign(campaign);
      setCampaigns((items) => [adminCampaign, ...items.filter((item) => item.id !== campaign.id)]);
      setEditorCampaign(adminCampaign);
      reconciledEditorCampaignId.current = campaign.id;
      setCampaignStatus('ready');
      const href = workspaceHref('editor', campaign.id);
      window.history.replaceState(null, '', `${href}${window.location.search}${window.location.hash}`);
      setLocation(readWorkspaceLocation(href));
    }).catch(() => { if (active) setDeepLinkStatus('missing'); });
    return () => { active = false; };
  }, [fetcher, location, subscriptionStatus]);
  useEffect(() => {
    if (page !== 'editor' || !location.campaignId) return;
    const source = serverCampaigns.find((campaign) => campaign.id === location.campaignId);
    if (!source?.platformDiscountId) return;
    if (reconciledEditorCampaignId.current === source.id) return;
    reconciledEditorCampaignId.current = source.id;
    let active = true;
    readCampaign(source.id, fetcher).then((campaign) => {
      if (!active) return;
      if (!verifiedStoreId.current || !keepCampaign(verifiedStoreId.current, campaign.id)) return;
      const current = toAdminCampaign(campaign);
      setServerCampaigns((items) => [campaign, ...items.filter((item) => item.id !== campaign.id)]);
      setCampaigns((items) => {
        const existing = items.find((item) => item.id === campaign.id);
        const next = existing ? { ...current, products: existing.products } : current;
        return [next, ...items.filter((item) => item.id !== campaign.id)];
      });
      setEditorCampaign((currentEditor) => currentEditor?.id === campaign.id ? { ...current, products: currentEditor.products } : currentEditor);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [fetcher, location.campaignId, page, serverCampaigns]);
  const openEditor = (campaign?: Campaign) => {
    setEditorCampaign(campaign ?? null);
    navigate("editor", campaign?.id);
  };
  const saveCampaign = async (draft: Campaign, intent: 'draft' | 'publish' | 'update') => {
    const finishLoading = (intent === 'publish' || intent === 'update') && isEmbeddedAdmin() ? beginAdminLoading(app) : undefined;
    try {
      const original = serverCampaigns.find((campaign) => campaign.id === draft.id);
      const saved = await persistCampaign(toCampaignDraft(draft, original), original?.revision ?? 0, fetcher);
      setServerCampaigns((items) => [saved, ...items.filter((item) => item.id !== saved.id)]);
      // A draft has no Function discount. Saving it with a schedule is therefore its first
      // publication; a future start remains scheduled and a current/past start is active.
      const publishDraftAfterSave = intent === 'publish' || (intent === 'update' && !original?.platformDiscountId && draft.status === 'Draft');
      const published = publishDraftAfterSave ? await changeCampaignStatus(saved.id, 'active', saved.revision, fetcher) : saved;
      const pending = published.platformOperationState === 'needs_reconciliation' && published.platformStatus === 'unverified';
      notify(pending ? wt('activationPending') : wt(intent === 'publish' ? 'published' : 'saved', { name: draft.name }), pending ? 'notice' : 'success');
      refreshCampaignsAfterWrite(pending);
      navigate("dashboard");
    } catch (error) {
      notify(wt(intent === 'publish' ? 'publishFailed' : intent === 'update' ? 'campaignUpdateFailed' : 'saveFailed', { error: (error as Error).message }), "error");
    } finally {
      finishLoading?.();
    }
  };
  const toggleCampaign = async (id: string) => {
    const existing = serverCampaigns.find((campaign) => campaign.id === id);
    if (!existing) { notify(wt('campaignMissing'), 'error'); return; }
    try {
      const next = existing.status === 'active' || existing.status === 'scheduled' ? 'paused' : 'active';
      const changed = await changeCampaignStatus(id, next, existing.revision, fetcher);
      const pending = changed.platformOperationState === 'pausing' || (changed.platformOperationState === 'needs_reconciliation' && changed.platformStatus === 'unverified');
      refreshCampaignsAfterWrite(pending);
      notify(wt(pending ? next === 'paused' ? 'pausePending' : 'activationPending' : next === 'paused' ? 'campaignPaused' : 'campaignPublished'), pending ? 'notice' : 'success');
    } catch (error) { notify(wt('statusChangeFailed', { error: (error as Error).message }), 'error'); }
  };
  const deleteCampaign = async (id: string) => {
    const existing = serverCampaigns.find((campaign) => campaign.id === id);
    if (!existing) { notify(wt('campaignMissing'), "error"); return; }
    try {
      const storeId = shop!.storeId;
      await removeCampaign(id, existing.revision, fetcher);
      if (verifiedStoreId.current !== storeId) return;
      forgetDeletedCampaigns(storeId, [id]);
      setCampaignRefresh((value) => value + 1);
      notify(wt('campaignDeleted'), "success");
    } catch (error) { notify(wt('campaignDeleteFailed', { error: (error as Error).message }), "error"); }
  };
  const batchCampaignAction = async (ids: string[], action: 'activate' | 'pause' | 'delete') => {
    const selected = ids.map((id) => serverCampaigns.find((campaign) => campaign.id === id)).filter((campaign): campaign is ServerCampaign => Boolean(campaign));
    if (!selected.length) return;
    try {
      if (action !== 'delete') {
        const storeId = shop!.storeId;
        const results = await changeCampaignStatuses(action === 'activate' ? 'active' : 'paused', selected.map((campaign) => ({ id: campaign.id, revision: campaign.revision })), fetcher);
        if (verifiedStoreId.current !== storeId) return;
        const succeeded = results.filter((result) => action === 'activate' ? ['activated', 'already_active'].includes(result.outcome) : ['paused', 'already_paused'].includes(result.outcome));
        const pending = results.filter((result) => result.outcome === (action === 'pause' ? 'pausing' : 'activation_pending'));
        const failed = results.filter((result) => !succeeded.includes(result) && !pending.includes(result));
        const updates = [...succeeded, ...pending].flatMap((result) => result.campaign ? [result.campaign] : []);
        if (updates.length) {
          // Use returned records immediately, including a new ID when an ended
          // campaign is republished. The ordinary read still verifies the result.
          setServerCampaigns((current) => [...new Map([...current, ...updates].map((item) => [item.id, item])).values()]);
          setCampaigns((current) => [...new Map([...current, ...updates.map((item) => toAdminCampaign(item))].map((item) => [item.id, item])).values()]);
        }
        if (action === 'activate' && pending.length) setActivationConfirmations((current) => ({ storeId, ids: [...new Set([...(current?.storeId === storeId ? current.ids : []), ...pending.flatMap((result) => result.campaign ? [result.campaign.id] : [])])] }));
        refreshCampaignsAfterWrite(pending.length > 0);
        const messages = [
          ...(succeeded.length ? [wt(action === 'pause' ? 'batchPaused' : 'batchEnabled', { count: succeeded.length })] : []),
          ...(pending.length ? [wt(action === 'pause' ? 'pausePending' : 'activationPending')] : []),
          ...(failed.length ? [wt('batchFailed', { error: failed.map((result) => result.message || result.id).join(' · ') })] : []),
        ];
        if (messages.length) notify(messages.join(' '), failed.length ? 'error' : pending.length ? 'notice' : 'success');
        return;
      }
      const storeId = shop!.storeId;
      const controller = new AbortController();
      deletionRead.current?.abort();
      deletionRead.current = controller;
      const deletion = await deleteCampaigns(selected.map((campaign) => ({ id: campaign.id, revision: campaign.revision })), fetcher);
      if (controller.signal.aborted || verifiedStoreId.current !== storeId) return;
      const requiresPause = deletion.results.filter((result) => result.outcome === 'requires_pause');
      const failed = deletion.results.filter((result) => ['failed', 'unverified'].includes(result.outcome));
      if (requiresPause.length) notify(wt('activeCampaignCannotDelete'), 'error');
      if (failed.length) notify(wt('batchFailed', { error: failed.map((result) => result.message || result.id).join(' · ') }), 'error');
      if (deletion.batch) {
        const batch = await waitForCampaignOperationBatch(deletion.batch.id, fetcher, { signal: controller.signal });
        if (controller.signal.aborted || verifiedStoreId.current !== storeId) return;
        const queued = new Set(deletion.results.filter((result) => result.outcome === 'queued').map((result) => result.id));
        const operations = batch?.operations.filter((operation) => queued.has(operation.campaignId)) ?? [];
        const succeeded = operations.filter((operation) => operation.state === 'succeeded');
        forgetDeletedCampaigns(storeId, succeeded.map((operation) => operation.campaignId));
        setCampaignRefresh((value) => value + 1);
        if (succeeded.length) notify(wt('batchDeleted', { count: succeeded.length }), 'success');
        if (operations.some((operation) => operation.state === 'requires_pause')) notify(wt('activeCampaignCannotDelete'), 'error');
        const taskFailures = operations.filter((operation) => operation.state === 'failed');
        if (taskFailures.length) notify(wt('batchFailed', { error: taskFailures.map((operation) => operation.lastError || selected.find((item) => item.id === operation.campaignId)?.name || operation.campaignId).join(' · ') }), 'error');
        if (operations.length < queued.size || operations.some((operation) => ['queued', 'running', 'retrying'].includes(operation.state))) notify(wt('batchDeletePending'), 'notice');
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      notify(wt('batchFailed', { error: (error as Error).message }), 'error');
    }
  };
  const isHome = page === "dashboard" || page === "campaigns";
  const languageControl = <AdminLanguageSelect value={i18n.language ?? DEFAULT_ADMIN_LOCALE} onChange={changeAdminLanguage} label={t('language')} />;
  const detailCampaign = location.campaignId ? campaigns.find((campaign) => campaign.id === location.campaignId) ?? null : null;
  const editorHasSnapshot = page === 'editor' && (!location.campaignId || Boolean(editing));
  const isIndependentPage = page === 'translations' || page === 'feedback';
  const usesCampaignLoadingFrame = !isIndependentPage && (isHome || page === 'editor' || page === 'detail' || page === 'discount-detail');
  const hasPageLoadError = subscriptionStatus === 'error' || shopStatus === 'error' || (needsCampaigns && campaignStatus === 'error');
  const identityReady = subscriptionStatus === 'ready' && shopStatus === 'ready';
  const retryStartupRegion = () => {
    if (subscriptionStatus === 'error' || shopStatus === 'error') refreshStartup();
    else setCampaignRefresh((value) => value + 1);
  };
  const pageLoading = !hasPageLoadError && (subscriptionStatus === 'loading' || shopStatus === 'loading'
    || needsCampaigns && !editorHasSnapshot && campaignStatus === 'loading'
    || page === 'discount-detail' && deepLinkStatus === 'loading');
  if (page === 'plan') return <QuantityBreaksPlan />;
  const notice = subscription?.access ? subscriptionNotice({
    validUntil: subscription.entitlement?.validUntil,
    nextValidFrom: subscription.entitlement?.nextDisplayFrom === undefined ? subscription.entitlement?.nextValidFrom : subscription.entitlement.nextDisplayFrom,
    nextValidUntil: subscription.entitlement?.nextDisplayUntil === undefined ? subscription.entitlement?.nextValidUntil : subscription.entitlement.nextDisplayUntil,
    timeZone: shopTimeZone && shopTimeZone.storeId === shop?.storeId ? shopTimeZone.value : null,
    locale: i18n.language,
    now: Date.now(),
  }) : null;
  const renewPlan = async () => {
    try {
      if (app?.config.appKey) openNativePackagePurchase(app);
      else {
        const { checkoutUrl } = await startSubscriptionCheckout(fetcher);
        window.location.assign(checkoutUrl);
      }
    } catch { notify(subscriptionText(i18n.language, 'checkoutError'), 'error'); }
  };
  return <div className={`${styles.appShell} ${styles.homeShell}`}>
    <main className={styles.main}>
      {notice && <div className={`${styles.collectionConflictNotice} ${notice.urgent ? styles.subscriptionNoticeUrgent : ''}`} role={notice.urgent ? 'alert' : 'status'}>
        <div className={styles.subscriptionNoticeCopy}><span>{notice.current}{notice.next && <> {notice.next}</>}</span></div>
        <Button variant="secondary" onClick={() => { void renewPlan(); }}>{subscriptionText(i18n.language, 'renew')}</Button>
      </div>}
      {isHome && <Dashboard key={shop?.storeId ?? "unverified"} campaigns={identityReady ? campaigns.map((campaign) => activationConfirmations?.storeId === shop?.storeId && activationConfirmations?.ids.includes(campaign.id) ? { ...campaign, listStatus: 'Starting' } : campaign) : []} onCreate={() => openEditor()} onEdit={openEditor} onBatchAction={batchCampaignAction} onStatusAction={toggleCampaign} languageControl={languageControl}
        loadState={hasPageLoadError ? 'error' : identityReady && campaignStatus === 'ready' ? 'ready' : 'loading'} onRetry={retryStartupRegion} />}
      {isIndependentPage && !identityReady && <header className={page === 'translations' ? styles.translationsHeader : styles.feedbackHeader}><div>{page === 'translations' ? <span className={styles.eyebrow}>{t('translationTitle')}</span> : <h1>{t('feedbackTitle')}</h1>}</div><div className={styles.headerButtons}>{languageControl}</div></header>}
      {!isHome && usesCampaignLoadingFrame && pageLoading && <CampaignLoading />}
      {page === 'translations' && pageLoading && <TranslationsLoading />}
      {page === 'feedback' && pageLoading && <FeedbackBoardLoading />}
      {!isHome && hasPageLoadError && <div role="alert"><p>{startupLoadError(i18n.language)}</p><Button onClick={retryStartupRegion}>{t('retry')}</Button></div>}
      {!hasPageLoadError && identityReady && <>
        {page === 'editor' && (editorHasSnapshot || campaignStatus === 'ready') && (!location.campaignId || editing
          ? <CampaignEditor key={`${shop?.storeId ?? "unverified"}:${location.campaignId ?? "new"}`} campaign={editing} campaigns={campaigns} onCancel={() => navigate("dashboard")} onSave={saveCampaign} notify={notify} fetcher={fetcher} languageControl={languageControl} />
          : <div role="alert"><h1>{wt('campaignNotFound')}</h1><Button onClick={() => navigate("dashboard")}>{wt('backToCampaigns')}</Button></div>)}
        {campaignStatus === 'ready' && page === 'detail' && (detailCampaign
          ? <CampaignDetail campaign={detailCampaign} onEdit={() => openEditor(detailCampaign)} onBack={() => navigate('dashboard')} />
          : <div role="alert"><h1>{wt('campaignNotFound')}</h1><Button onClick={() => navigate('dashboard')}>{wt('backToCampaigns')}</Button></div>)}
        {page === 'discount-detail' && deepLinkStatus === 'missing' && <div role="alert"><h1>{wt('campaignNotFound')}</h1><p>{wt('campaignMissing')}</p><Button onClick={() => navigate('dashboard')}>{wt('backToCampaigns')}</Button></div>}
        {page === "translations" && <Translations key={shop?.storeId ?? "unverified"} shopId={shop?.storeId ?? null} notify={notify} fetcher={fetcher} languageControl={languageControl} />}
        {page === 'feedback' && <FeedbackBoard fetcher={fetcher} notify={notify} languageControl={languageControl} />}
      </>}
      {page === "not-found" && <div role="alert"><h1>{t('404')}</h1><Button onClick={() => navigate("dashboard")}>{wt('backToOverview')}</Button></div>}
    </main>
    <ToastRegion toast={toast} onClose={() => setToast(null)} />
  </div>;
}
function CampaignLoading() {
  const { t } = useTranslation();
  return <div className={styles.loadingFrame} role="status"><div className={styles.loadingFrameCards}><span /><span /><span /><span /></div><p>{t('loadingCampaigns')}</p></div>;
}

export function Dashboard({ campaigns, onCreate, onEdit, onBatchAction, languageControl, loadState = 'ready', onRetry }: { campaigns: Campaign[]; onCreate: () => void; onEdit: (campaign: Campaign) => void; onBatchAction: (ids: string[], action: 'activate' | 'pause' | 'delete') => Promise<void>; onStatusAction?: (id: string) => Promise<void>; languageControl?: React.ReactNode; loadState?: 'loading' | 'ready' | 'error'; onRetry?: () => void }) {
  const { t, i18n } = useTranslation();
  const [setupGuideOpen, setSetupGuideOpen] = useState(false);
  const setupGuide = themeSetupGuideText(i18n.language);
  const wt = (key: Parameters<typeof workspaceText>[1], params: Record<string, string | number> = {}) => workspaceText(i18n.language, key, params);
  const count = (status: CampaignStatus) => campaigns.filter((campaign) => campaign.status === status).length;
  const listCampaigns = campaigns.map((campaign) => ({ ...campaign, listStatus: normalizedListStatus(campaign) }));
  return <div className={styles.homeContent}>
    <ThemeSetupGuide language={i18n.language} onOpenGuide={() => setSetupGuideOpen(true)} />
    <header className={styles.homePageHeader}><div><h1>{t('campaignTitle')}</h1><p>{t('campaignSubtitle')}</p></div><div className={styles.headerButtons}>{languageControl}<Button variant="secondary" onClick={() => setSetupGuideOpen(true)}>{setupGuide.setupGuide}</Button><Button disabled={loadState !== 'ready'} onClick={onCreate}>{t('createCampaign')}</Button></div></header>
    {loadState === 'loading' && <CampaignLoading />}
    {loadState === 'error' && <div role="alert"><p>{startupLoadError(i18n.language)}</p><Button onClick={onRetry}>{t('retry')}</Button></div>}
    {loadState === 'ready' && <><section className={styles.overviewSurface} aria-label={t('overview')}><div className={styles.metricGrid}><Metric value={String(count("Active"))} label={wt('activeCampaigns')} detail={wt('currentlyRunning')} /><Metric value={String(count("Scheduled"))} label={wt('scheduledCampaigns')} detail={wt('startingLater')} /><Metric value={String(count("Paused"))} label={wt('pausedCampaigns')} detail={wt('notShownInStore')} /><Metric value={String(campaigns.length)} label={wt('allCampaigns')} detail={wt('includingDraftsEnded')} /></div></section>
    <CampaignListBatchOnly campaigns={listCampaigns} onEdit={onEdit} onBatchAction={onBatchAction} /></>}
    {setupGuideOpen && <ThemeSetupGuideDialog language={i18n.language} onClose={() => setSetupGuideOpen(false)} />}
  </div>;
}
function Metric({ value, label, detail }: { value: string; label: string; detail: string }) { return <div className={styles.metric}><span>{label}</span><small>{detail}</small><strong>{value}</strong></div>; }

function CombinationList({ campaign, text }: { campaign: Campaign; text: (key: Parameters<typeof campaignText>[1]) => string }) {
  const combinations = [
    campaign.combineProduct && text('otherProductDiscounts'),
    campaign.combineOrder && text('orderDiscounts'),
    campaign.combineShipping && text('shippingDiscounts'),
  ].filter(Boolean) as string[];
  return combinations.length ? <>{combinations.map((label) => <span key={label}>{label}</span>)}</> : <span>{text('neverCombine')}</span>;
}


function CampaignListBatchOnly({ campaigns, onEdit, onBatchAction }: { campaigns: Campaign[]; onEdit: (campaign: Campaign) => void; onBatchAction: (ids: string[], action: 'activate' | 'pause' | 'delete') => Promise<void> }) {
  const { t, i18n } = useTranslation();
  const wt = (key: Parameters<typeof workspaceText>[1], params: Record<string, string | number> = {}) => workspaceText(i18n.language, key, params);
  const ct = (key: Parameters<typeof campaignText>[1]) => campaignText(i18n.language, key);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<Campaign['listStatus'] | 'All'>('All');
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchOpen, setSearchOpen] = useState(false);
  const [pendingBatch, setPendingBatch] = useState<'activate' | 'pause' | 'delete' | null>(null);
  const [runningBatch, setRunningBatch] = useState<{ ids: string[]; action: 'activate' | 'pause' | 'delete' } | null>(null);
  const batchLock = useRef(false);
  const submittingBatch = runningBatch !== null;
  const displayStatus = (campaign: Campaign): CampaignStatus => runningBatch?.ids.includes(campaign.id) && runningBatch.action !== 'delete' ? runningBatch.action === 'activate' ? 'Starting' : 'Pausing' : campaign.listStatus ?? 'Ended';
  const rowBusy = (campaign: Campaign) => ['Starting', 'Pausing'].includes(displayStatus(campaign));
  const confirmBatch = () => {
    if (batchLock.current || !pendingBatch) return;
    const ids = [...selectedIds];
    const action = pendingBatch;
    batchLock.current = true;
    setRunningBatch({ ids, action });
    setPendingBatch(null);
    void onBatchAction(ids, action).finally(() => {
      batchLock.current = false;
      setRunningBatch(null);
      setSelectedIds(new Set());
    });
  };
  const searchTriggerRef = useRef<HTMLButtonElement>(null);
  const restoreSearchFocus = useRef(false);
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const filtered = useMemo(() => campaigns.filter((campaign) =>
    (status === 'All' || campaign.listStatus === status)
      && (!deferredQuery || `${campaign.name} ${campaign.products}`.toLowerCase().includes(deferredQuery)),
  ), [campaigns, deferredQuery, status]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageItems = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const pageIds = pageItems.filter((campaign) => !rowBusy(campaign)).map((campaign) => campaign.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const toggleSelected = (id: string) => setSelectedIds((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const togglePage = () => setSelectedIds((current) => {
    const next = new Set(current);
    if (allPageSelected) pageIds.forEach((id) => next.delete(id)); else pageIds.forEach((id) => next.add(id));
    return next;
  });
  const closeSearch = () => { setQuery(''); restoreSearchFocus.current = true; setSearchOpen(false); };
  useEffect(() => {
    if (!searchOpen && restoreSearchFocus.current) {
      searchTriggerRef.current?.focus();
      restoreSearchFocus.current = false;
    }
  }, [searchOpen]);
  useEffect(() => { setPage(1); }, [deferredQuery, status, pageSize]);
  useEffect(() => { setSelectedIds((current) => new Set([...current].filter((id) => campaigns.some((campaign) => campaign.id === id)))); }, [campaigns]);
  const selectedCount = selectedIds.size;
  const collectionIssues = campaigns.filter((campaign) => campaign.status === 'Active' && campaign.scope?.kind === 'collections' && campaign.collectionConflict?.state === 'conflict');

  return <section className={styles.campaignSurface} id="campaigns" aria-label={t('campaignList')} aria-busy={submittingBatch}>
    {collectionIssues.length > 0 && <div className={`${styles.collectionConflictNotice} ${styles.collectionIssueNotice}`} role="alert">{collectionIssues.map((campaign) => `${campaign.name}: ${campaignText(i18n.language, 'coverageConflict')}`).join(' · ')}</div>}
    <div className={styles.campaignToolbar}>{searchOpen
      ? <div className={styles.campaignSearch}><label className={styles.srOnly} htmlFor="campaign-search">{wt('searchCampaigns')}</label><input id="campaign-search" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={wt('searchPlaceholder')} /><button type="button" onClick={closeSearch}>{t('cancel')}</button></div>
      : <><div className={styles.campaignTabs} role="group" aria-label={wt('filterStatus')}>{(['All', 'Active', 'Scheduled', 'Ended', 'Draft'] as const).map((tab) => <button type="button" aria-pressed={status === tab} key={tab} className={status === tab ? styles.campaignTabActive : ''} onClick={() => setStatus(tab)}>{tab === 'All' ? wt('allCampaigns') : wt(`status${tab}` as Parameters<typeof workspaceText>[1])}</button>)}</div><button type="button" ref={searchTriggerRef} className={styles.searchTrigger} aria-label={wt('searchCampaigns')} title={wt('searchCampaigns')} onClick={() => setSearchOpen(true)}><Search size={16} strokeWidth={2} aria-hidden="true" /></button></>}
    </div>
    {selectedCount > 0 && <div className={styles.bulkToolbar} role="toolbar"><span>{wt('selectedCampaigns', { count: selectedCount })}</span><button type="button" disabled={submittingBatch} onClick={() => setPendingBatch('activate')}>{runningBatch?.action === 'activate' ? wt('statusStarting') : wt('enable')}</button><button type="button" disabled={submittingBatch} onClick={() => setPendingBatch('pause')}>{runningBatch?.action === 'pause' ? wt('statusPausing') : wt('pause')}</button><button type="button" className={styles.bulkDanger} disabled={submittingBatch} onClick={() => setPendingBatch('delete')}>{wt('deleteAction')}</button><button type="button" disabled={submittingBatch} onClick={() => setSelectedIds(new Set())}>{wt('clearSelection')}</button></div>}
    {filtered.length ? <>
      <div className={styles.campaignTableScroll}><table className={styles.homeCampaignTable}><colgroup><col className={styles.listCheckCol} /><col className={styles.listCampaignCol} /><col className={styles.listDiscountNameCol} /><col className={styles.listProductsCol} /><col className={styles.listTiersCol} /><col className={styles.listStatusCol} /><col className={styles.listDateCol} /><col className={styles.listDateCol} /><col className={styles.listCombinationsCol} /></colgroup><thead><tr><th scope="col" className={styles.checkboxColumn}><input type="checkbox" aria-label={wt('selectAllCampaigns')} disabled={submittingBatch} checked={allPageSelected} onChange={togglePage} /></th><th scope="col">{wt('campaign')}</th><th scope="col">{wt('discountName')}</th><th scope="col">{wt('products')}</th><th scope="col">{wt('tiers')}</th><th scope="col">{wt('status')}</th><th scope="col">{wt('startTime')}</th><th scope="col">{wt('endTime')}</th><th scope="col">{wt('combinableDiscounts')}</th></tr></thead><tbody>{pageItems.map((campaign) => <tr key={campaign.id} onClick={() => { if (!submittingBatch && !rowBusy(campaign)) onEdit(campaign); }}><td className={styles.checkboxColumn} onClick={(event) => event.stopPropagation()}><input type="checkbox" aria-label={wt('selectCampaign', { name: campaign.name })} disabled={submittingBatch || rowBusy(campaign)} checked={selectedIds.has(campaign.id)} onChange={() => toggleSelected(campaign.id)} /></td><td><a href={workspaceHref('editor', campaign.id)} className={styles.campaignName} aria-disabled={submittingBatch || rowBusy(campaign)} onClick={(event) => { event.stopPropagation(); if (submittingBatch || rowBusy(campaign)) { event.preventDefault(); return; } if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); onEdit(campaign); } }}>{campaign.name}</a></td><td>{campaign.discountName || campaign.name}</td><td>{campaign.products}</td><td className={styles.tierCell}>{formatTierRows(campaign.tiers, i18n.language).map((row) => <span key={row}>{row}</span>)}</td><td><StatusPill status={displayStatus(campaign)} /></td><td>{formatCampaignDateTime(campaign.startsAt, i18n.language, campaign.timeZone)}</td><td>{formatCampaignDateTime(campaign.endsAt, i18n.language, campaign.timeZone)}</td><td className={styles.combinationCell}><CombinationList campaign={campaign} text={ct} /></td></tr>)}</tbody></table></div>
      <div className={styles.mobileCampaignList}>{pageItems.map((campaign) => <article key={campaign.id} className={styles.mobileCampaignCard} onClick={() => { if (!submittingBatch && !rowBusy(campaign)) onEdit(campaign); }}><header><div><input type="checkbox" aria-label={wt('selectCampaign', { name: campaign.name })} disabled={submittingBatch || rowBusy(campaign)} checked={selectedIds.has(campaign.id)} onClick={(event) => event.stopPropagation()} onChange={() => toggleSelected(campaign.id)} /><a href={workspaceHref('editor', campaign.id)} className={styles.campaignName} aria-disabled={submittingBatch || rowBusy(campaign)} onClick={(event) => { event.stopPropagation(); event.preventDefault(); onEdit(campaign); }}>{campaign.name}</a></div><StatusPill status={displayStatus(campaign)} /></header><dl><div><dt>{wt('discountName')}</dt><dd>{campaign.discountName || campaign.name}</dd></div><div><dt>{wt('products')}</dt><dd>{campaign.products}</dd></div><div><dt>{wt('tiers')}</dt><dd>{formatTierRows(campaign.tiers, i18n.language).map((row) => <span key={row}>{row}</span>)}</dd></div><div><dt>{wt('startTime')}</dt><dd>{formatCampaignDateTime(campaign.startsAt, i18n.language, campaign.timeZone)}</dd></div><div><dt>{wt('endTime')}</dt><dd>{formatCampaignDateTime(campaign.endsAt, i18n.language, campaign.timeZone)}</dd></div><div><dt>{wt('combinableDiscounts')}</dt><dd className={styles.combinationCell}><CombinationList campaign={campaign} text={ct} /></dd></div></dl></article>)}</div>
      <footer className={styles.pagination}><span>{wt('pageRange', { from: (currentPage - 1) * pageSize + 1, to: Math.min(currentPage * pageSize, filtered.length), total: filtered.length })}</span><label>{wt('rowsPerPage')} <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}><option value={10}>10</option><option value={20}>20</option><option value={50}>50</option></select></label><button type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>{wt('previous')}</button><button type="button" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>{wt('next')}</button></footer>
    </> : <div className={styles.homeEmpty}><strong>{campaigns.length ? wt('noMatch') : t('noCampaigns')}</strong><p>{campaigns.length ? wt('tryAnother') : t('createFirst')}</p>{campaigns.length > 0 && <Button variant="secondary" onClick={() => { setQuery(''); setStatus('All'); setSearchOpen(false); }}>{wt('clearFilters')}</Button>}</div>}
    {pendingBatch && <ConfirmBatch action={pendingBatch} count={selectedCount} submitting={submittingBatch} onClose={() => { if (!submittingBatch) setPendingBatch(null); }} requiresDisable={campaigns.some((campaign) => selectedIds.has(campaign.id) && ['Active', 'Scheduled', 'Pausing', 'Starting'].includes(displayStatus(campaign)))} onConfirm={confirmBatch} />}
  </section>;
}

function CampaignList({ campaigns, onCreate, onEdit, onBatchAction, onStatusAction }: { campaigns: Campaign[]; onCreate: () => void; onEdit: (campaign: Campaign) => void; onBatchAction: (ids: string[], action: 'activate' | 'pause' | 'delete') => Promise<void>; onStatusAction: (id: string) => Promise<void> }) {
  const { t, i18n } = useTranslation();
  const wt = (key: Parameters<typeof workspaceText>[1], params: Record<string, string | number> = {}) => workspaceText(i18n.language, key, params);
  const ct = (key: Parameters<typeof campaignText>[1]) => campaignText(i18n.language, key);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Campaign['listStatus'] | "All">("All");
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchOpen, setSearchOpen] = useState(false);
  const [pendingBatch, setPendingBatch] = useState<'activate' | 'pause' | 'delete' | null>(null);
  const [submittingBatch, setSubmittingBatch] = useState(false);
  const [pendingStatusCampaign, setPendingStatusCampaign] = useState<Campaign | null>(null);
  const [submittingStatus, setSubmittingStatus] = useState(false);
  const searchTriggerRef = useRef<HTMLButtonElement>(null);
  const restoreSearchFocus = useRef(false);
  useEffect(() => {
    if (!searchOpen && restoreSearchFocus.current) {
      searchTriggerRef.current?.focus();
      restoreSearchFocus.current = false;
    }
  }, [searchOpen]);
  const closeSearch = () => { setQuery(""); restoreSearchFocus.current = true; setSearchOpen(false); };
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const filtered = useMemo(() => campaigns.filter((campaign) => (status === "All" || campaign.listStatus === status) && (!deferredQuery || `${campaign.name} ${campaign.products}`.toLowerCase().includes(deferredQuery))), [campaigns, deferredQuery, status]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageItems = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const pageIds = pageItems.map((campaign) => campaign.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const toggleSelected = (id: string) => setSelectedIds((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const togglePage = () => setSelectedIds((current) => { const next = new Set(current); if (allPageSelected) pageIds.forEach((id) => next.delete(id)); else pageIds.forEach((id) => next.add(id)); return next; });
  const selectedCount = selectedIds.size;
  const displayStatus = (campaign: Campaign) => campaign.listStatus ?? (campaign.status === 'Active' ? 'Active' : campaign.status === 'Scheduled' ? 'Scheduled' : 'Ended');
  useEffect(() => { setPage(1); }, [deferredQuery, status, pageSize]);
  useEffect(() => { setSelectedIds((current) => new Set([...current].filter((id) => campaigns.some((campaign) => campaign.id === id)))); }, [campaigns]);
  const collectionIssues = campaigns.filter((campaign) => campaign.status === 'Active' && campaign.scope?.kind === 'collections' && campaign.collectionConflict?.state === 'conflict');
  return <section className={styles.campaignSurface} id="campaigns" aria-label={t('campaignList')}>{collectionIssues.length > 0 && <div className={`${styles.collectionConflictNotice} ${styles.collectionIssueNotice}`} role="alert">{collectionIssues.map((campaign) => `${campaign.name}: ${campaignText(i18n.language, 'coverageConflict')}`).join(' · ')}</div>}
    <div className={styles.campaignToolbar}>{searchOpen ? <div className={styles.campaignSearch}><label className={styles.srOnly} htmlFor="campaign-search">{wt('searchCampaigns')}</label><input id="campaign-search" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={wt('searchPlaceholder')} /><button type="button" onClick={closeSearch}>{t('cancel')}</button></div> : <><div className={styles.campaignTabs} role="group" aria-label={wt('filterStatus')}>{(["All", "Active", "Scheduled", "Ended"] as const).map((tab) => <button type="button" aria-pressed={status === tab} key={tab} className={status === tab ? styles.campaignTabActive : ""} onClick={() => setStatus(tab)}>{tab === 'All' ? wt('allCampaigns') : wt(`status${tab}` as Parameters<typeof workspaceText>[1])}</button>)}</div><button type="button" ref={searchTriggerRef} className={styles.searchTrigger} aria-label={wt('searchCampaigns')} title={wt('searchCampaigns')} onClick={() => setSearchOpen(true)}><Search size={16} strokeWidth={2} aria-hidden="true" /></button></>}</div>
    {selectedCount > 0 && <div className={styles.bulkToolbar} role="toolbar"><span>{wt('selectedCampaigns', { count: selectedCount })}</span><button type="button" onClick={() => setPendingBatch('activate')}>{wt('enable')}</button><button type="button" onClick={() => setPendingBatch('pause')}>{wt('pause')}</button><button type="button" className={styles.bulkDanger} onClick={() => setPendingBatch('delete')}>{wt('deleteAction')}</button><button type="button" onClick={() => setSelectedIds(new Set())}>{wt('clearSelection')}</button></div>}
    {filtered.length ? <><div className={styles.campaignTableScroll}><table className={styles.homeCampaignTable}><colgroup><col className={styles.listCheckCol} /><col className={styles.listCampaignCol} /><col className={styles.listProductsCol} /><col className={styles.listTiersCol} /><col className={styles.listStatusCol} /><col className={styles.listDateCol} /><col className={styles.listDateCol} /><col className={styles.listCombinationsCol} /><col className={styles.listStatusCol} /></colgroup><thead><tr><th scope="col" className={styles.checkboxColumn}><input type="checkbox" aria-label={wt('selectAllCampaigns')} checked={allPageSelected} onChange={togglePage} /></th><th scope="col">{wt('campaign')}</th><th scope="col">{wt('products')}</th><th scope="col">{wt('tiers')}</th><th scope="col">{wt('status')}</th><th scope="col">{wt('startTime')}</th><th scope="col">{wt('endTime')}</th><th scope="col">{wt('combinableDiscounts')}</th><th scope="col">{wt('actions')}</th></tr></thead><tbody>{pageItems.map((campaign) => <tr key={campaign.id} onClick={() => onEdit(campaign)}><td className={styles.checkboxColumn} onClick={(event) => event.stopPropagation()}><input type="checkbox" aria-label={wt('selectCampaign', { name: campaign.name })} checked={selectedIds.has(campaign.id)} onChange={() => toggleSelected(campaign.id)} /></td><td><a href={workspaceHref('editor', campaign.id)} className={styles.campaignName} onClick={(event) => { event.stopPropagation(); if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); onEdit(campaign); } }}>{campaign.name}</a></td><td>{campaign.products}</td><td className={styles.tierCell}>{formatTierRows(campaign.tiers, i18n.language).map((row) => <span key={row}>{row}</span>)}</td><td><StatusPill status={campaign.listStatus ?? 'Ended'} /></td><td>{formatCampaignDateTime(campaign.startsAt, i18n.language, campaign.timeZone)}</td><td>{formatCampaignDateTime(campaign.endsAt, i18n.language, campaign.timeZone)}</td><td className={styles.combinationCell}><CombinationList campaign={campaign} text={ct} /></td><td onClick={(event) => event.stopPropagation()}><Button variant="secondary" disabled={submittingStatus} onClick={() => setPendingStatusCampaign(campaign)}>{['Active', 'Scheduled'].includes(displayStatus(campaign)) ? wt('pause') : wt('enable')}</Button></td></tr>)}</tbody></table></div><div className={styles.mobileCampaignList}>{pageItems.map((campaign) => <article key={campaign.id} className={styles.mobileCampaignCard} onClick={() => onEdit(campaign)}><header><div><input type="checkbox" aria-label={wt('selectCampaign', { name: campaign.name })} checked={selectedIds.has(campaign.id)} onClick={(event) => event.stopPropagation()} onChange={() => toggleSelected(campaign.id)} /><a href={workspaceHref('editor', campaign.id)} className={styles.campaignName} onClick={(event) => { event.stopPropagation(); event.preventDefault(); onEdit(campaign); }}>{campaign.name}</a></div><StatusPill status={campaign.listStatus ?? 'Ended'} /></header><dl><div><dt>{wt('products')}</dt><dd>{campaign.products}</dd></div><div><dt>{wt('tiers')}</dt><dd>{formatTierRows(campaign.tiers, i18n.language).map((row) => <span key={row}>{row}</span>)}</dd></div><div><dt>{wt('startTime')}</dt><dd>{formatCampaignDateTime(campaign.startsAt, i18n.language, campaign.timeZone)}</dd></div><div><dt>{wt('endTime')}</dt><dd>{formatCampaignDateTime(campaign.endsAt, i18n.language, campaign.timeZone)}</dd></div><div><dt>{wt('combinableDiscounts')}</dt><dd className={styles.combinationCell}><CombinationList campaign={campaign} text={ct} /></dd></div></dl><div onClick={(event) => event.stopPropagation()}><Button variant="secondary" disabled={submittingStatus} onClick={() => setPendingStatusCampaign(campaign)}>{['Active', 'Scheduled'].includes(displayStatus(campaign)) ? wt('pause') : wt('enable')}</Button></div></article>)}</div><footer className={styles.pagination}><span>{wt('pageRange', { from: (currentPage - 1) * pageSize + 1, to: Math.min(currentPage * pageSize, filtered.length), total: filtered.length })}</span><label>{wt('rowsPerPage')} <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}><option value={10}>10</option><option value={20}>20</option><option value={50}>50</option></select></label><button type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>{wt('previous')}</button><button type="button" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>{wt('next')}</button></footer></> : <div className={styles.homeEmpty}><strong>{campaigns.length ? wt('noMatch') : t('noCampaigns')}</strong><p>{campaigns.length ? wt('tryAnother') : t('createFirst')}</p>{campaigns.length > 0 && <Button variant="secondary" onClick={() => { setQuery(""); setStatus("All"); setSearchOpen(false); }}>{wt('clearFilters')}</Button>}</div>}
    {pendingBatch && <ConfirmBatch action={pendingBatch} count={selectedCount} submitting={submittingBatch} onClose={() => { if (!submittingBatch) setPendingBatch(null); }} onConfirm={() => { if (submittingBatch) return; setSubmittingBatch(true); void onBatchAction([...selectedIds], pendingBatch).finally(() => { setSubmittingBatch(false); setPendingBatch(null); setSelectedIds(new Set()); }); }} />}
    {pendingStatusCampaign && <ConfirmCampaignStatus campaign={pendingStatusCampaign} submitting={submittingStatus} onClose={() => { if (!submittingStatus) setPendingStatusCampaign(null); }} onConfirm={() => { if (submittingStatus) return; setSubmittingStatus(true); void onStatusAction(pendingStatusCampaign.id).finally(() => { setSubmittingStatus(false); setPendingStatusCampaign(null); }); }} />}</section>;
}

function CampaignDetail({ campaign, onEdit, onBack }: { campaign: Campaign; onEdit: () => void; onBack: () => void }) {
  const { i18n } = useTranslation();
  const wt = (key: Parameters<typeof workspaceText>[1]) => workspaceText(i18n.language, key);
  const ct = (key: Parameters<typeof campaignText>[1]) => campaignText(i18n.language, key);
  const scopeLabel = campaign.scope?.kind === 'products' ? ct('specificProducts') : campaign.scope?.kind === 'collections' ? ct('productCollections') : ct('allProducts');
  const combinations = [campaign.combineOrder && ct('orderDiscounts'), campaign.combineShipping && ct('shippingDiscounts')].filter(Boolean).join(' · ') || ct('neverCombine');
  const isChinese = i18n.language.toLowerCase().startsWith('zh');
  const layoutName = (value: string) => isChinese ? ({ stacked: '纵向', horizontal: '横向', grid: '网格', list: '列表' } as Record<string, string>)[value] ?? value : value;
  return <section className={styles.campaignSurface} aria-labelledby="campaign-detail-title">
    <div className={styles.homePageHeader}><div><span className={styles.eyebrow}>{wt('campaign')}</span><h1 id="campaign-detail-title">{campaign.name}</h1></div><div className={styles.headerButtons}><Button variant="secondary" onClick={onBack}>{wt('backToCampaigns')}</Button><Button onClick={onEdit}>{wt('edit')}</Button></div></div>
    <dl className={styles.detailGrid}><div><dt>{wt('status')}</dt><dd><StatusPill status={campaign.status} /></dd></div><div><dt>{ct('productScope')}</dt><dd>{scopeLabel} · {campaign.products}</dd></div><div><dt>{wt('startTime')}</dt><dd>{formatCampaignDateTime(campaign.startsAt, i18n.language, campaign.timeZone)}</dd></div><div><dt>{wt('endTime')}</dt><dd>{formatCampaignDateTime(campaign.endsAt, i18n.language, campaign.timeZone)}</dd></div></dl>
    <div className={styles.detailSection}><h2>{ct('ruleSummary')}</h2><ol className={styles.detailTiers}>{campaign.tiers.map((tier, index) => <li key={tier.tierId ?? index}><span>{tier.label || `${ct('quantity')} ${tier.quantity}`}</span><strong>{formatTierSummary([tier], i18n.language)}</strong></li>)}</ol></div>
    <div className={styles.detailSection}><h2>{ct('settings')}</h2><dl className={styles.detailGrid}><div><dt>{ct('otherProductDiscounts')}</dt><dd>{combinations}</dd></div></dl></div>
    {campaign.widget && <div className={styles.detailSection}><h2>{ct('style')}</h2><dl className={styles.detailGrid}><div><dt>PC</dt><dd>{layoutName(campaign.widget?.layout)}</dd></div><div><dt>Mobile</dt><dd>{layoutName(campaign.widget.mobile?.layout ?? campaign.widget.layout)}</dd></div><div><dt>{ct('offerBar')}</dt><dd>{campaign.widget.badgePosition === 'corner' ? (isChinese ? '右上角' : 'Corner') : (isChinese ? '副标题下方' : 'Below subtitle')}</dd></div></dl></div>}
  </section>;
}

function ConfirmBatch({ action, count, submitting, requiresDisable = false, onClose, onConfirm }: { action: 'activate' | 'pause' | 'delete'; count: number; submitting: boolean; requiresDisable?: boolean; onClose: () => void; onConfirm: () => void }) {
  const { t, i18n } = useTranslation();
  const wt = (key: Parameters<typeof workspaceText>[1], params: Record<string, string | number> = {}) => workspaceText(i18n.language, key, params);
  const title = wt(action === 'delete' ? 'batchDeleteTitle' : action === 'pause' ? 'batchPauseTitle' : 'batchEnableTitle');
  const content = (action === 'delete' && requiresDisable ? `${wt('activeCampaignCannotDelete')} ` : '') + wt(action === 'delete' ? 'batchDeleteBody' : action === 'pause' ? 'batchPauseBody' : 'batchEnableBody', { count });
  const actionLabel = action === 'delete' ? wt('deleteAction') : action === 'pause' ? wt('pause') : wt('enable');
  return <BridgeConfirmation title={title} content={content} type={action === 'delete' ? 'danger' : 'confirm'} onCancel={onClose} onConfirm={onConfirm} fallback={<div className={styles.modalScrim} role="presentation"><div className={styles.modal} role="dialog" aria-modal="true"><h2>{title}</h2><p>{content}</p><div><Button variant="secondary" disabled={submitting} onClick={onClose}>{t('cancel')}</Button><Button variant={action === 'delete' ? 'danger' : 'primary'} disabled={submitting} onClick={onConfirm}>{actionLabel}</Button></div></div></div>} />;
}

function ConfirmCampaignStatus({ campaign, submitting, onClose, onConfirm }: { campaign: Campaign; submitting: boolean; onClose: () => void; onConfirm: () => void }) {
  const { t, i18n } = useTranslation();
  const wt = (key: Parameters<typeof workspaceText>[1], params: Record<string, string | number> = {}) => workspaceText(i18n.language, key, params);
  const pausing = ['Active', 'Scheduled'].includes(campaign.listStatus ?? campaign.status);
  const title = wt(pausing ? 'batchPauseTitle' : 'batchEnableTitle');
  const content = wt(pausing ? 'batchPauseBody' : 'batchEnableBody', { count: 1 });
  const actionLabel = wt(pausing ? 'pause' : 'enable');
  return <BridgeConfirmation title={title} content={content} type={pausing ? "warn" : "confirm"} onCancel={onClose} onConfirm={onConfirm} fallback={<div className={styles.modalScrim} role="presentation"><div className={styles.modal} role="dialog" aria-modal="true"><h2>{title}</h2><p>{content}</p><div><Button variant="secondary" disabled={submitting} onClick={onClose}>{t('cancel')}</Button><Button disabled={submitting} onClick={onConfirm}>{actionLabel}</Button></div></div></div>} />;
}

function ConfirmDelete({ campaign, onClose, onConfirm }: { campaign: Campaign; onClose: () => void; onConfirm: () => void }) {
  const { t, i18n } = useTranslation();
  const title = workspaceText(i18n.language, 'deleteTitle');
  const content = workspaceText(i18n.language, 'deleteBody', { name: campaign.name });
  return <BridgeConfirmation title={title} content={content} type="danger" onCancel={onClose} onConfirm={onConfirm} fallback={<div className={styles.modalScrim} role="presentation"><div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="delete-title"><span className={styles.modalMark}>!</span><h2 id="delete-title">{title}</h2><p>{content}</p><div><Button variant="secondary" onClick={onClose}>{t('cancel')}</Button><Button variant="danger" onClick={onConfirm}>{t('delete')}</Button></div></div></div>} />;
}
