export type StoreLanguages = { defaultLanguage: string; languages: string[] };

export function normalizeStoreLanguages(raw: { default_language?: string; supported_languages?: string[] }): StoreLanguages {
  const languages = [...new Set(raw.supported_languages ?? [])];
  if (!languages.length || languages.some((code) => !code || typeof code !== "string")) throw new Error("Storefront language list is empty or invalid.");
  if (!raw.default_language || !languages.includes(raw.default_language)) throw new Error("Store default language is missing from enabled languages.");
  return { defaultLanguage: raw.default_language, languages };
}
