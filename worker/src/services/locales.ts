export const STOREFRONT_LOCALES = [
  'ar', 'bg', 'cs', 'da', 'de', 'el', 'en', 'es', 'et', 'fi', 'fr', 'hi', 'hr', 'hu',
  'id', 'it', 'ja', 'ko', 'lt', 'lv', 'ms', 'nb', 'nl', 'pl', 'pt-BR', 'pt-PT', 'ro',
  'ru', 'sk', 'sl', 'sv', 'th', 'tr', 'vi', 'zh-Hans', 'zh-Hant',
] as const;

export type StorefrontLocale = typeof STOREFRONT_LOCALES[number];

export function normalizeStorefrontLocale(value: string | undefined | null): StorefrontLocale | null {
  if (!value) return null;
  const lower = value.toLowerCase();
  if (lower === 'zh-cn' || lower === 'zh-sg' || lower === 'zh-hans-cn') return 'zh-Hans';
  if (lower === 'zh-tw' || lower === 'zh-hk' || lower === 'zh-mo' || lower === 'zh-hant-tw') return 'zh-Hant';
  if (lower === 'pt-br') return 'pt-BR';
  if (lower === 'pt-pt') return 'pt-PT';
  return STOREFRONT_LOCALES.find((locale) => locale.toLowerCase() === lower) ?? null;
}
