import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { SaveBar } from "@shoplineos/app-bridge";
import { RefreshCw } from "lucide-react";
import { storefrontCopy, type StorefrontCopyKey, type StorefrontTranslations } from "./storefront-copy";
import type { StoreLanguages } from "./store-languages";
import { readTranslations, writeTranslations } from "./translations-api";
import { Button } from "./ui";
import { useAppBridge } from "../hooks/useAppBridge";
import { workspaceText } from './admin-workspace-messages';
import { createTranslationDraft, restoreStoreLanguages, restoreTranslationDrafts, restoreTranslationLocale, saveStoreLanguages, saveTranslationDrafts, saveTranslationLocale, type TranslationDrafts } from './translation-drafts';
import { BridgeConfirmation } from './BridgeConfirmation';
import { StorefrontWidget, type WidgetPreviewConfig, type CartPreviewOutcome } from './StorefrontWidget';
import { defaultTiers } from './data';
import { defaultCampaignWidgetConfig } from './widget-config';
import { CampaignProductPicker, productPickerLabels, type Product } from './CampaignProductPicker';
import styles from "../pages/quantity-breaks.module.css";
import { translationCopy, translationUsageKeys } from './translation-preview';
import { browserStorage } from './browser-storage';

type Props = { shopId: string | null; notify: (message: string, tone?: "success" | "error" | "notice") => void; fetcher: typeof fetch; languageControl?: React.ReactNode };
type LoadState = { status: "loading" | "ready" | "error"; data?: StoreLanguages; error?: string };
const groupKey = {
  'Widget header': 'groupWidget', 'Price summary': 'groupPrice', 'Cart action': 'groupCartAction',
  'Cart feedback': 'groupCartFeedback', 'Variant selection': 'groupVariant', 'Tier selection': 'groupTierSelection', 'Checkout note': 'groupCheckout',
} as const satisfies Record<(typeof storefrontCopy)[number]['location'], string>;

const translationPreviewStyle = { ...defaultCampaignWidgetConfig(), showTierSavingsBadge: true, showCartVariantDetails: true, showPriceSummary: true };
const cartPreviewLabels = { success: 'translationCartSuccess', failure: 'translationCartFailure', uncertain: 'translationCartUncertain', no_stock: 'translationCartNoStock' } as const;
const translationPreviewConfig: WidgetPreviewConfig = {
  allowMixed: true,
  showSelectors: translationPreviewStyle.variants.showSelectors,
  selectorStyle: 'Dropdown',
  imageTileSize: translationPreviewStyle.variants.imageSizePx,
  imageTileRadius: translationPreviewStyle.variants.imageRadiusPx,
  showImageColorValue: translationPreviewStyle.variants.showImageColorValue,
  widgetFontSize: translationPreviewStyle.typography.bodyPx,
  showStock: false,
  showPricing: translationPreviewStyle.showPriceSummary,
};

export function Translations({ shopId, notify, fetcher, languageControl }: Props) {
  const { t, i18n } = useTranslation();
  const app = useAppBridge();
  const wt = (key: Parameters<typeof workspaceText>[1], params: Record<string, string | number> = {}) => workspaceText(i18n.language, key, params);
  const storage = browserStorage('sessionStorage');
  const cachedLanguages = shopId ? restoreStoreLanguages(shopId, storage) : undefined;
  const cachedDrafts = shopId ? restoreTranslationDrafts(shopId, storage) : {};
  const cachedLocale = shopId ? restoreTranslationLocale(shopId, storage) : '';
  const [load, setLoad] = useState<LoadState>(() => cachedLanguages ? { status: 'ready', data: cachedLanguages } : { status: "loading" });
  const [refresh, setRefresh] = useState(0);
  const [locale, setLocale] = useState(cachedLocale);
  const [translationDrafts, setTranslationDrafts] = useState<TranslationDrafts>(cachedDrafts);
  const [loadedLocales, setLoadedLocales] = useState<Record<string, boolean>>(() => Object.fromEntries(Object.keys(cachedDrafts).map((code) => [code, true])));
  const [copyState, setCopyState] = useState<"idle" | "loading" | "ready" | "error">(() => cachedLocale && cachedDrafts[cachedLocale] ? 'ready' : 'idle');
  const [copyError, setCopyError] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingLocale, setPendingLocale] = useState("");
  const [discardConfirmationOpen, setDiscardConfirmationOpen] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [previewUsesDraft, setPreviewUsesDraft] = useState(false);
  const [previewCartOutcome, setPreviewCartOutcome] = useState<CartPreviewOutcome>('success');
  const [previewProduct, setPreviewProduct] = useState<Product | undefined>();
  const languages = load.data?.languages ?? [];
  const previewProductCopy = productPickerLabels(i18n.language ?? 'en');
  const draftState = translationDrafts[locale];
  const draft = draftState?.draft ?? {};
  const previewTranslations = previewUsesDraft ? draft : draftState?.saved ?? {};
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftState?.saved ?? {});
  const groups = [...new Set(translationCopy.map((entry) => entry.location))];

  useEffect(() => {
    const controller = new AbortController();
    if (!shopId) return () => controller.abort();
    const cached = refresh === 0 ? restoreStoreLanguages(shopId, storage) : undefined;
    if (cached) {
      setLoad({ status: 'ready', data: cached });
      setLocale((current) => cached.languages.includes(current) ? current : cached.defaultLanguage);
    }
    if (!cached) setLoad({ status: "loading" });
    fetcher("/api/quantity-breaks/store-languages", { credentials: "same-origin", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(response.status === 401 ? "Connect a SHOPLINE store to load storefront languages." : `Storefront languages could not be loaded (${response.status}).`);
        return response.json() as Promise<StoreLanguages>;
      })
      .then((data) => {
        if (!data.languages?.length || !data.languages.includes(data.defaultLanguage)) throw new Error("Storefront language data is incomplete.");
        saveStoreLanguages(shopId, data, storage);
        setLoad({ status: "ready", data });
        setLocale((current) => data.languages.includes(current) ? current : data.defaultLanguage);
      })
      .catch((error) => { if (error.name !== "AbortError" && !cached) setLoad({ status: "error", error: error.message }); });
    return () => controller.abort();
  }, [refresh, shopId, fetcher]);

  useEffect(() => {
    if (!locale) return;
    if (loadedLocales[locale]) { setCopyState("ready"); return; }
    let active = true;
    setCopyState("loading");
    readTranslations(locale, fetcher).then((copy) => {
      if (!active) return;
      setTranslationDrafts((current) => {
        const existing = current[locale];
        return existing && JSON.stringify(existing.draft) !== JSON.stringify(existing.saved) ? current : { ...current, [locale]: createTranslationDraft(locale, copy) };
      });
      setLoadedLocales((current) => ({ ...current, [locale]: true }));
      setCopyState("ready");
    }).catch((error) => { if (active) { setCopyError(error.message); setCopyState("error"); } });
    return () => { active = false; };
  }, [locale, loadedLocales, fetcher]);

  useEffect(() => {
    if (!shopId || typeof window === 'undefined') return;
    saveTranslationDrafts(shopId, translationDrafts, storage);
  }, [shopId, translationDrafts]);

  useEffect(() => {
    if (!shopId || !locale || typeof window === 'undefined') return;
    saveTranslationLocale(shopId, locale, storage);
  }, [shopId, locale]);

  const languageName = (code: string) => {
    try { return new Intl.DisplayNames([i18n.language], { type: "language" }).of(code) ?? code; }
    catch { return code; }
  };
  const resizeTranslation = (element: HTMLTextAreaElement | null) => {
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  };
  const update = (key: StorefrontCopyKey, value: string) => {
    setPreviewUsesDraft(true);
    setTranslationDrafts((current) => {
      const state = current[locale] ?? createTranslationDraft(locale, {});
      return { ...current, [locale]: { ...state, draft: { ...state.draft, [key]: value } } };
    });
  };
  const save = async (): Promise<boolean> => {
    setSaving(true);
    try {
      const copy = await writeTranslations(locale, Object.fromEntries(storefrontCopy.map((entry) => [entry.key, draft[entry.key] ?? ''])) as StorefrontTranslations, fetcher);
      setTranslationDrafts((current) => ({ ...current, [locale]: createTranslationDraft(locale, copy) }));
      setPreviewUsesDraft(false);
      notify(wt('translationSaved', { language: languageName(locale) }), "success");
      return true;
    } catch (error) { notify(wt('translationSaveFailed', { error: (error as Error).message }), "error"); return false; }
    finally { setSaving(false); }
  };
  const chooseLocale = (next: string) => {
    if (next !== locale && dirty) setPendingLocale(next);
    else { setPreviewUsesDraft(false); setLocale(next); }
  };
  const resolveSwitch = () => {
    setPreviewUsesDraft(false);
    setLocale(pendingLocale);
    setPendingLocale("");
  };
  const saveAndSwitch = async () => { if (await save() && pendingLocale) resolveSwitch(); };
  const discardAndSwitch = () => {
    setPreviewUsesDraft(false);
    setTranslationDrafts((current) => {
      const state = current[locale];
      return state ? { ...current, [locale]: { ...state, draft: { ...state.saved } } } : current;
    });
    if (pendingLocale) resolveSwitch();
  };
  const saveBarUpdateLabel = wt('translationUpdate');
  const saveAndSwitchRef = useRef(saveAndSwitch);
  const discardAndSwitchRef = useRef(discardAndSwitch);
  const saveBarRef = useRef<ReturnType<typeof SaveBar.create> | null>(null);
  saveAndSwitchRef.current = saveAndSwitch;
  discardAndSwitchRef.current = discardAndSwitch;
  const handleDiscard = useCallback(() => { discardAndSwitchRef.current(); }, []);

  useEffect(() => {
    if (!app) return;
    const saveBar = SaveBar.create(app);
    saveBarRef.current = saveBar;
    return () => {
      saveBar.hide();
      saveBarRef.current = null;
    };
  }, [app]);

  useEffect(() => {
    if (!app) return;
    const saveBar = saveBarRef.current;
    if (!saveBar) return;
    if (dirty && load.status === "ready") {
      saveBar.show({ onFinishText: saveBarUpdateLabel, formType: 'edit', onSave: () => { void saveAndSwitchRef.current(); }, onCancel: handleDiscard });
      saveBar.setLoading(saving);
    } else {
      saveBar.hide();
    }
  }, [app, copyState, dirty, handleDiscard, load.status, saveBarUpdateLabel, saving]);

  return <div className={styles.translationsWorkspace}>
    <header className={styles.translationsHeader}><div><span className={styles.eyebrow}>{t('translationTitle')}</span></div><div className={styles.headerButtons}>{languageControl}<button type="button" className={styles.translationRefreshButton} onClick={() => setRefresh((count) => count + 1)} aria-label={t('translationRefresh')} title={t('translationRefresh')}><RefreshCw size={14} aria-hidden="true" /><span>{t('translationRefresh')}</span></button></div></header>
    {load.status === "loading" && <TranslationsLoading />}
    {load.status === "error" && <div className={styles.translationLoadError} role="alert"><p>{t('translationUnavailable')}</p><button type="button" onClick={() => setRefresh((count) => count + 1)}>{t('retry')}</button></div>}
    {load.status !== "loading" && <div className={styles.translationWorkspaceGrid}>
      <section className={styles.translationEditor}>
        {copyState === "loading" && <p className={styles.translationStatus} role="status">{wt('loadingTranslation')}</p>}
        {copyState === "error" && <div className={styles.translationLoadError} role="alert"><p>{wt('copyReadError')} {copyError}</p><button type="button" onClick={() => { setLoadedLocales((current) => { const next = { ...current }; delete next[locale]; return next; }); setCopyState("idle"); }}>{t('retry')}</button></div>}
        {groups.map((group) => <section key={group} className={styles.translationGroup}><h3>{t(groupKey[group])}</h3><div className={styles.translationGroupRows}>{translationCopy.filter((entry) => entry.location === group).map((entry) => <div key={entry.key} className={styles.translationRow}><div className={styles.translationOriginalValue}>{entry.source}{translationUsageKeys[entry.key] && <p className={styles.translationUsage}>{t(translationUsageKeys[entry.key]!)}</p>}</div><div className={styles.translationValueField}><textarea rows={1} ref={resizeTranslation} onInput={(event) => resizeTranslation(event.currentTarget)} value={draft[entry.key] ?? ""} disabled={copyState !== "ready" || load.status !== "ready"} onChange={(event) => update(entry.key, event.target.value)} placeholder={entry.source} aria-label={`${t('translationMerchant')}: ${entry.source}`} /></div></div>)}</div></section>)}
      </section>
      <aside className={styles.translationPreviewColumn}><section className={styles.editorPreview} aria-live="polite" aria-label={t('widgetLivePreview')}><header className={styles.previewToolbar} data-preview-toolbar><div className={styles.previewControl} data-preview-control="device"><span className={styles.previewControlLabel}>{t('widgetLivePreview')}</span><div className={styles.previewDeviceToggle} role="group" aria-label={t('widgetLivePreview')}><button type="button" aria-pressed={previewDevice === 'desktop'} onClick={() => setPreviewDevice('desktop')}>PC</button><button type="button" aria-pressed={previewDevice === 'mobile'} onClick={() => setPreviewDevice('mobile')}>{t('mobile', { defaultValue: 'Mobile' })}</button></div></div>{load.status === "ready" && <label className={`${styles.previewControl} ${styles.previewLanguageSelect}`} data-preview-control="language"><span className={styles.previewControlLabel}>{t('translationLanguage')}</span><select aria-label={t('translationLanguage')} value={locale} onChange={(event) => chooseLocale(event.target.value)}>{languages.map((code) => <option key={code} value={code}>{code.toUpperCase()} - {languageName(code)}{translationDrafts[code] && JSON.stringify(translationDrafts[code].draft) !== JSON.stringify(translationDrafts[code].saved) ? ` (${wt('unsaved')})` : ""}</option>)}</select></label>}<div className={`${styles.previewControl} ${styles.previewProductPicker}`} data-preview-control="product"><span className={styles.previewControlLabel}>{previewProductCopy.previewTrigger}</span><div className={styles.previewProductValue}><span data-preview-product-title title={previewProduct?.title ?? previewProductCopy.loading}>{previewProduct?.title ?? previewProductCopy.loading}</span><CampaignProductPicker fetcher={fetcher} selectedIds={previewProduct ? [previewProduct.id] : []} onChange={() => {}} onPreviewProduct={setPreviewProduct} autoPreviewFirst selectionLimit={1} triggerLabel={previewProductCopy.previewTrigger} compactTrigger showSelectedItems={false} inputId="translation-preview-product-search" locale={i18n.language ?? 'en'} mode="dialog" /></div></div></header><label className={`${styles.translationCartResult} ${styles.previewLanguageSelect}`} data-preview-control="cart-result"><span>{t('translationCartResult')}</span><select value={previewCartOutcome} onChange={(event) => setPreviewCartOutcome(event.target.value as CartPreviewOutcome)}>{(['success', 'failure', 'uncertain', 'no_stock'] as const).map((outcome) => <option key={outcome} value={outcome}>{t(cartPreviewLabels[outcome])}</option>)}</select></label><div className={styles.previewDeviceStage}>{previewDevice === 'mobile' && <div className={styles.previewPhoneFrame}><span className={styles.previewPhoneCamera} aria-hidden="true" /><StorefrontWidget device="mobile" accent={translationPreviewStyle.colors.border} locale={locale} translations={previewTranslations} config={translationPreviewConfig} campaignConfig={translationPreviewStyle} tiers={defaultTiers} compact previewOnly previewCartOutcome={previewCartOutcome} campaignProduct={previewProduct} notify={notify} /></div>}{previewDevice === 'desktop' && <StorefrontWidget device="desktop" accent={translationPreviewStyle.colors.border} locale={locale} translations={previewTranslations} config={translationPreviewConfig} campaignConfig={translationPreviewStyle} tiers={defaultTiers} compact previewOnly previewCartOutcome={previewCartOutcome} campaignProduct={previewProduct} notify={notify} />}</div></section></aside>
    </div>}
    {!app && dirty && load.status === "ready" && <div className={styles.translationSaveBar} role="status"><div><Button type="button" variant="secondary" onClick={() => setDiscardConfirmationOpen(true)} disabled={saving}>{wt('discardChanges')}</Button><Button type="button" onClick={saveAndSwitch} disabled={copyState !== "ready" || saving}>{saving ? wt('saving') : saveBarUpdateLabel}</Button></div></div>}
    {!app && discardConfirmationOpen && <BridgeConfirmation title={wt('discardChanges')} content={wt('discardChangesConfirm')} type="danger" onCancel={() => setDiscardConfirmationOpen(false)} onConfirm={() => { setDiscardConfirmationOpen(false); discardAndSwitch(); }} fallback={<div className={styles.modalScrim} role="presentation"><div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="discard-translation-title"><h2 id="discard-translation-title">{wt('discardChanges')}</h2><p>{wt('discardChangesConfirm')}</p><div><Button type="button" variant="secondary" onClick={() => setDiscardConfirmationOpen(false)}>{t('cancel')}</Button><Button type="button" variant="danger" onClick={() => { setDiscardConfirmationOpen(false); discardAndSwitch(); }}>{wt('discardChanges')}</Button></div></div></div>} />}
  </div>;
}

export function TranslationsLoading() {
  const { t } = useTranslation();
  return <div className={styles.translationLoadingWorkspaceGrid} role="status"><section className={`${styles.translationLoadingFrame} ${styles.translationLoadingEditor}`}><div className={styles.translationLoadingToolbar}><span /><span /></div><div className={styles.translationLoadingRows}>{translationCopy.slice(0, 6).map((entry) => <div key={entry.key}><span /><span /></div>)}</div><p>{t('translationLoading')}</p></section><section className={`${styles.editorPreview} ${styles.translationLoadingPreview}`}><header><div className={styles.translationPreviewLoadingControl} /><div className={styles.translationPreviewLoadingControl} /></header><div className={styles.previewDeviceStage}><div className={styles.translationPreviewLoadingCanvas}><span /><span /><span /></div></div></section></div>;
}
