export const APP_LOCALES = ['en', 'fr', 'de', 'es', 'it', 'nl', 'sv', 'tr', 'pt-BR', 'zh-Hans', 'zh-Hant', 'ms', 'th', 'id', 'vi', 'ja'] as const;
export type AdminLocale = typeof APP_LOCALES[number];
export const DEFAULT_ADMIN_LOCALE: AdminLocale = 'zh-Hans';

export const APP_LOCALE_NAMES: Record<AdminLocale, string> = {
  en: 'English', fr: 'Français', de: 'Deutsch', es: 'Español', it: 'Italiano', nl: 'Nederlands',
  sv: 'Svenska', tr: 'Türkçe', 'pt-BR': 'Português (Brasil)', 'zh-Hans': '简体中文', 'zh-Hant': '繁體中文',
  ms: 'Bahasa Melayu', th: 'ไทย', id: 'Bahasa Indonesia', vi: 'Tiếng Việt', ja: '日本語',
};

function supported(value: string | null): AdminLocale | null {
  if (!value) return null;
  const lower = value.toLowerCase();
  if (lower === 'zh-cn' || lower === 'zh-sg' || lower === 'zh-hans-cn') return 'zh-Hans';
  if (lower === 'zh-tw' || lower === 'zh-hk' || lower === 'zh-mo' || lower === 'zh-hant-tw') return 'zh-Hant';
  return APP_LOCALES.find((locale) => locale.toLowerCase() === lower) ?? null;
}

export function resolveAdminLocale({ storeId, search, storage }: { storeId: string | null; search: string; storage: Pick<Storage, 'getItem'> }): AdminLocale {
  if (storeId) {
    try {
      const saved = supported(storage.getItem(`quantity-breaks:admin-locale:${storeId}`));
      if (saved) return saved;
    } catch { /* Private browsing can deny storage access. */ }
  }
  return supported(new URLSearchParams(search).get('lang')) ?? DEFAULT_ADMIN_LOCALE;
}

export function setAdminLocale(storeId: string, locale: string, storage: Pick<Storage, 'setItem'>): void {
  const selected = supported(locale);
  if (!storeId || !selected) throw new Error('A verified store and supported language are required.');
  storage.setItem(`quantity-breaks:admin-locale:${storeId}`, selected);
}
