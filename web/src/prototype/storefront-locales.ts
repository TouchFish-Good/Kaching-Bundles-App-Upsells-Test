export const STOREFRONT_LOCALES = [
  'ar', 'bg', 'cs', 'da', 'de', 'el', 'en', 'es', 'et', 'fi', 'fr', 'hi', 'hr', 'hu',
  'id', 'it', 'ja', 'ko', 'lt', 'lv', 'ms', 'nb', 'nl', 'pl', 'pt-BR', 'pt-PT', 'ro',
  'ru', 'sk', 'sl', 'sv', 'th', 'tr', 'vi', 'zh-Hans', 'zh-Hant',
] as const;

export type StorefrontLocale = typeof STOREFRONT_LOCALES[number];

export const STOREFRONT_LOCALE_NAMES: Record<StorefrontLocale, string> = {
  ar: 'العربية', bg: 'Български', cs: 'Čeština', da: 'Dansk', de: 'Deutsch', el: 'Ελληνικά', en: 'English',
  es: 'Español', et: 'Eesti', fi: 'Suomi', fr: 'Français', hi: 'हिन्दी', hr: 'Hrvatski', hu: 'Magyar',
  id: 'Bahasa Indonesia', it: 'Italiano', ja: '日本語', ko: '한국어', lt: 'Lietuvių', lv: 'Latviešu', ms: 'Bahasa Melayu',
  nb: 'Norsk bokmål', nl: 'Nederlands', pl: 'Polski', 'pt-BR': 'Português (Brasil)', 'pt-PT': 'Português (Portugal)',
  ro: 'Română', ru: 'Русский', sk: 'Slovenčina', sl: 'Slovenščina', sv: 'Svenska', th: 'ไทย', tr: 'Türkçe', vi: 'Tiếng Việt',
  'zh-Hans': '简体中文', 'zh-Hant': '繁體中文',
};

export function normalizeStorefrontLocale(value: string | null | undefined): StorefrontLocale | null {
  if (!value) return null;
  const lower = value.toLowerCase();
  if (lower === 'zh-cn' || lower === 'zh-sg' || lower === 'zh-hans-cn') return 'zh-Hans';
  if (lower === 'zh-tw' || lower === 'zh-hk' || lower === 'zh-mo' || lower === 'zh-hant-tw') return 'zh-Hant';
  if (lower === 'pt-br') return 'pt-BR';
  if (lower === 'pt-pt') return 'pt-PT';
  return STOREFRONT_LOCALES.find((locale) => locale.toLowerCase() === lower) ?? null;
}

export function resolveStorefrontLocale(value: string | null | undefined, fallback: StorefrontLocale = 'en'): StorefrontLocale {
  return normalizeStorefrontLocale(value) ?? fallback;
}
