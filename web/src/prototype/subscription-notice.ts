import { APP_LOCALES, type AdminLocale } from './admin-locale';

type NoticeText = { current: string; currentWithNext: string; next: string; urgent: string };
const messages: Record<AdminLocale, NoticeText> = {
  en: { currentWithNext: 'Current plan expires on {{date}}.', current: 'Current plan expires on {{date}}. Related discounts will stop working then.', next: 'Next plan starts on {{date}}.', urgent: 'Your plan expires on {{date}}. Related discounts will stop working then.' },
  fr: { currentWithNext: 'Le forfait actuel expire le {{date}}.', current: 'Le forfait actuel expire le {{date}}. Les remises associées cesseront alors de fonctionner.', next: 'Le prochain forfait prend effet le {{date}}.', urgent: 'Votre forfait expire le {{date}}. Les remises associées cesseront alors de fonctionner.' },
  de: { currentWithNext: 'Der aktuelle Tarif läuft am {{date}} ab.', current: 'Der aktuelle Tarif läuft am {{date}} ab. Zugehörige Rabatte gelten dann nicht mehr.', next: 'Der nächste Tarif beginnt am {{date}}.', urgent: 'Ihr Tarif läuft am {{date}} ab. Zugehörige Rabatte gelten dann nicht mehr.' },
  es: { currentWithNext: 'El plan actual vence el {{date}}.', current: 'El plan actual vence el {{date}}. Los descuentos asociados dejarán de funcionar.', next: 'El próximo plan comienza el {{date}}.', urgent: 'Tu plan vence el {{date}}. Los descuentos asociados dejarán de funcionar.' },
  it: { currentWithNext: 'Il piano attuale scade il {{date}}.', current: 'Il piano attuale scade il {{date}}. Gli sconti collegati smetteranno di funzionare.', next: 'Il prossimo piano inizia il {{date}}.', urgent: 'Il piano scade il {{date}}. Gli sconti collegati smetteranno di funzionare.' },
  nl: { currentWithNext: 'Het huidige abonnement verloopt op {{date}}.', current: 'Het huidige abonnement verloopt op {{date}}. Bijbehorende kortingen werken dan niet meer.', next: 'Het volgende abonnement begint op {{date}}.', urgent: 'Je abonnement verloopt op {{date}}. Bijbehorende kortingen werken dan niet meer.' },
  sv: { currentWithNext: 'Nuvarande abonnemang löper ut {{date}}.', current: 'Nuvarande abonnemang löper ut {{date}}. Tillhörande rabatter slutar då gälla.', next: 'Nästa abonnemang börjar {{date}}.', urgent: 'Ditt abonnemang löper ut {{date}}. Tillhörande rabatter slutar då gälla.' },
  tr: { currentWithNext: 'Mevcut paket {{date}} tarihinde sona erer.', current: 'Mevcut paket {{date}} tarihinde sona erer. İlgili indirimler artık geçerli olmaz.', next: 'Sonraki paket {{date}} tarihinde başlar.', urgent: 'Paketiniz {{date}} tarihinde sona erer. İlgili indirimler artık geçerli olmaz.' },
  'pt-BR': { currentWithNext: 'O plano atual expira em {{date}}.', current: 'O plano atual expira em {{date}}. Os descontos associados deixarão de funcionar.', next: 'O próximo plano começa em {{date}}.', urgent: 'Seu plano expira em {{date}}. Os descontos associados deixarão de funcionar.' },
  'zh-Hans': { currentWithNext: '当前套餐将于{{date}}到期，', current: '当前套餐将于{{date}}到期，到期后对应折扣将直接失效。', next: '下一期套餐将于{{date}}生效。', urgent: '套餐即将在{{date}}到期，到期后对应折扣将直接失效。' },
  'zh-Hant': { currentWithNext: '目前方案將於{{date}}到期，', current: '目前方案將於{{date}}到期，到期後對應折扣將直接失效。', next: '下一期方案將於{{date}}生效。', urgent: '方案即將在{{date}}到期，到期後對應折扣將直接失效。' },
  ms: { currentWithNext: 'Pelan semasa tamat pada {{date}}.', current: 'Pelan semasa tamat pada {{date}}. Diskaun berkaitan tidak akan berfungsi lagi.', next: 'Pelan seterusnya bermula pada {{date}}.', urgent: 'Pelan anda tamat pada {{date}}. Diskaun berkaitan tidak akan berfungsi lagi.' },
  th: { currentWithNext: 'แพ็กเกจปัจจุบันหมดอายุวันที่ {{date}}', current: 'แพ็กเกจปัจจุบันหมดอายุวันที่ {{date}} ส่วนลดที่เกี่ยวข้องจะหยุดทำงาน', next: 'แพ็กเกจถัดไปเริ่มวันที่ {{date}}', urgent: 'แพ็กเกจของคุณหมดอายุวันที่ {{date}} ส่วนลดที่เกี่ยวข้องจะหยุดทำงาน' },
  id: { currentWithNext: 'Paket saat ini berakhir pada {{date}}.', current: 'Paket saat ini berakhir pada {{date}}. Diskon terkait akan berhenti berlaku.', next: 'Paket berikutnya mulai pada {{date}}.', urgent: 'Paket Anda berakhir pada {{date}}. Diskon terkait akan berhenti berlaku.' },
  vi: { currentWithNext: 'Gói hiện tại hết hạn vào {{date}}.', current: 'Gói hiện tại hết hạn vào {{date}}. Các ưu đãi liên quan sẽ ngừng hoạt động.', next: 'Gói tiếp theo có hiệu lực vào {{date}}.', urgent: 'Gói của bạn hết hạn vào {{date}}. Các ưu đãi liên quan sẽ ngừng hoạt động.' },
  ja: { currentWithNext: '現在のプランは{{date}}に期限切れになります。', current: '現在のプランは{{date}}に期限切れになります。関連する割引はその時点で無効になります。', next: '次のプランは{{date}}に有効になります。', urgent: 'プランは{{date}}に期限切れになります。関連する割引はその時点で無効になります。' },
};

function formatStoreTime(value: number, locale: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat(locale, {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}/${part('month')}/${part('day')} ${part('hour')}:${part('minute')}`;
}

export function subscriptionNotice(input: {
  validUntil: number | null | undefined; nextValidFrom: number | null | undefined; nextValidUntil: number | null | undefined;
  timeZone: string | null; locale: string; now: number;
}): { current: string; next: string | null; urgent: boolean } | null {
  const { validUntil, nextValidFrom, nextValidUntil, timeZone, locale, now } = input;
  if (!validUntil || validUntil <= now || !timeZone) return null;
  const supported = APP_LOCALES.find((item) => item.toLowerCase() === locale.toLowerCase()) ?? 'en';
  let currentDate: string;
  let nextDate: string | null = null;
  try {
    currentDate = formatStoreTime(validUntil, supported, timeZone);
    if (nextValidFrom && nextValidUntil && nextValidFrom > now && nextValidUntil > nextValidFrom) {
      nextDate = formatStoreTime(nextValidFrom, supported, timeZone);
    }
  } catch { return null; }
  const continuous = nextDate !== null && nextValidFrom !== null && nextValidFrom !== undefined && nextValidFrom <= validUntil;
  const urgent = validUntil - now <= 7 * 24 * 60 * 60 * 1000 && !continuous;
  const text = messages[supported];
  return {
    urgent,
    current: (urgent ? text.urgent : nextDate !== null ? text.currentWithNext : text.current).replace('{{date}}', currentDate),
    next: nextDate === null ? null : text.next.replace('{{date}}', nextDate),
  };
}
