import type { StorefrontTranslations } from './storefront-copy';
import type { StoreLanguages } from './store-languages';
import { initialTranslationDraft } from './storefront-translation-defaults';

export type TranslationDraft = { saved: StorefrontTranslations; draft: StorefrontTranslations };
export type TranslationDrafts = Record<string, TranslationDraft>;

const storageKey = (shopId: string) => `quantity-breaks:translation-drafts:${shopId}`;
const localeStorageKey = (shopId: string) => `quantity-breaks:translation-locale:${shopId}`;
const languagesStorageKey = (shopId: string) => `quantity-breaks:translation-languages:${shopId}`;

export function createTranslationDraft(locale: string, saved: StorefrontTranslations): TranslationDraft {
  const initial = initialTranslationDraft(locale, saved);
  return { saved: initial, draft: { ...initial } };
}

export function restoreTranslationDrafts(shopId: string, storage: Pick<Storage, 'getItem'>): TranslationDrafts {
  try {
    const stored = storage.getItem(storageKey(shopId));
    if (!stored) return {};
    const value = JSON.parse(stored) as TranslationDrafts;
    if (!value || typeof value !== 'object') return {};
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item && typeof item === 'object' && item.saved && item.draft));
  } catch { return {}; }
}

export function saveTranslationDrafts(shopId: string, drafts: TranslationDrafts, storage: Pick<Storage, 'setItem'>): void {
  try { storage.setItem(storageKey(shopId), JSON.stringify(drafts)); }
  catch { /* A blocked browser storage must not prevent translation editing. */ }
}

export function restoreTranslationLocale(shopId: string, storage: Pick<Storage, 'getItem'>): string {
  try { return storage.getItem(localeStorageKey(shopId)) ?? ''; }
  catch { return ''; }
}

export function saveTranslationLocale(shopId: string, locale: string, storage: Pick<Storage, 'setItem'>): void {
  try { storage.setItem(localeStorageKey(shopId), locale); }
  catch { /* A blocked browser storage must not prevent translation editing. */ }
}

export function restoreStoreLanguages(shopId: string, storage: Pick<Storage, 'getItem'>): StoreLanguages | undefined {
  try {
    const stored = storage.getItem(languagesStorageKey(shopId));
    if (!stored) return undefined;
    const value = JSON.parse(stored) as StoreLanguages;
    if (!Array.isArray(value?.languages) || !value.languages.length || typeof value.defaultLanguage !== 'string' || !value.languages.includes(value.defaultLanguage)) return undefined;
    return { defaultLanguage: value.defaultLanguage, languages: value.languages.filter((code): code is string => typeof code === 'string' && Boolean(code)) };
  } catch { return undefined; }
}

export function saveStoreLanguages(shopId: string, languages: StoreLanguages, storage: Pick<Storage, 'setItem'>): void {
  try { storage.setItem(languagesStorageKey(shopId), JSON.stringify(languages)); }
  catch { /* A blocked browser storage must not prevent translation editing. */ }
}
