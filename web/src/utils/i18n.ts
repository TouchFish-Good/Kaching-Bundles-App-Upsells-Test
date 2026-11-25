import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import resourcesToBackend from "i18next-resources-to-backend";
import { match } from "@formatjs/intl-localematcher";
import { APP_LOCALES, DEFAULT_ADMIN_LOCALE } from "../prototype/admin-locale";
import simplifiedChinese from "../locales/zh-Hans.json";

const DEFAULT_APP_LOCALE = DEFAULT_ADMIN_LOCALE;

const locales = import.meta.glob("../locales/*.json", {
  eager: false,
  import: "default",
});

/**
 * @see https://developer.shopline.com/docsv2/ec20
 * @returns en | zh-hans-cn
 */
const SUPPORTED_APP_LOCALES: string[] = [...APP_LOCALES];

let _userLocale: string;

export function getQueryLang() {
  if (_userLocale) {
    return _userLocale;
  }
  const query = new URLSearchParams(window.location.search);
  const locale = query.get("lang") || DEFAULT_APP_LOCALE;
  try { _userLocale = match([locale], SUPPORTED_APP_LOCALES, DEFAULT_APP_LOCALE); }
  catch { _userLocale = DEFAULT_APP_LOCALE; }
  return _userLocale;
}

/**
 * i18next initialization
 * @see https://www.i18next.com
 */
let initialization: ReturnType<typeof i18next.init> | undefined;
export function initI18next() {
  return initialization ??= i18next
    .use(initReactI18next)
    .use(
      resourcesToBackend((locale: string) => {
        return locales[`../locales/${locale}.json`]();
      })
    )
    .init({
      debug: import.meta.env.DEV,
      lng: getQueryLang(),
      fallbackLng: DEFAULT_APP_LOCALE,
      resources: { 'zh-Hans': { translation: simplifiedChinese } },
      partialBundledLanguages: true,
      supportedLngs: SUPPORTED_APP_LOCALES,
      interpolation: {
        escapeValue: false,
      },
      lowerCaseLng: false,
      react: {
        useSuspense: false,
      },
    });
}
