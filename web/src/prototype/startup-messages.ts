import type { AdminLocale } from './admin-locale';

const messages: Record<AdminLocale, string> = {
  en: 'This page could not be loaded. Please try again.',
  fr: 'Cette page n’a pas pu être chargée. Veuillez réessayer.',
  de: 'Diese Seite konnte nicht geladen werden. Bitte erneut versuchen.',
  es: 'No se pudo cargar esta página. Vuelve a intentarlo.',
  it: 'Impossibile caricare questa pagina. Riprova.',
  nl: 'Deze pagina kon niet worden geladen. Probeer het opnieuw.',
  sv: 'Sidan kunde inte laddas. Försök igen.',
  tr: 'Bu sayfa yüklenemedi. Lütfen tekrar deneyin.',
  'pt-BR': 'Não foi possível carregar esta página. Tente novamente.',
  'zh-Hans': '暂时无法加载此页面，请重试。',
  'zh-Hant': '暫時無法載入此頁面，請重試。',
  ms: 'Halaman ini tidak dapat dimuatkan. Sila cuba lagi.',
  th: 'ไม่สามารถโหลดหน้านี้ได้ โปรดลองอีกครั้ง',
  id: 'Halaman ini tidak dapat dimuat. Silakan coba lagi.',
  vi: 'Không thể tải trang này. Vui lòng thử lại.',
  ja: 'このページを読み込めませんでした。もう一度お試しください。',
};
export function startupLoadError(locale: string): string {
  return messages[locale as AdminLocale] ?? messages.en;
}
