const placeholdersByKey: Record<string, string[]> = {
  'widget.title': [], 'widget.tier_savings_badge': ['saving_amount'], 'widget.description': [], 'widget.tier_rule': [], 'widget.original': [], 'widget.savings': [], 'widget.total': [],
  'widget.add_to_cart': ['quantity', 'price'], 'widget.add_to_cart_quantity': ['quantity'], 'widget.adding': [], 'widget.cart_failure': [], 'widget.cart_success': ['quantity', 'lines'],
  'widget.stock_shortage': ['item', 'quantity', 'available'], 'widget.no_stock': [], 'widget.sold_out': [], 'widget.color': [], 'widget.size': [], 'widget.checkout_note': [],
  'widget.calculated_at_checkout': [], 'widget.choose_option': [], 'widget.item_option': ['index', 'option'], 'widget.tier_items': ['quantity'], 'widget.cart_uncertain': [],
};

const MAX_TRANSLATION_VALUE_LENGTH = 64 * 1024;

export class TranslationDataError extends Error {}

export function validateTranslations(copy: Record<string, unknown>): string {
  if (!copy || typeof copy !== 'object' || Array.isArray(copy)) return 'Translation payload must be an object.';
  for (const [key, value] of Object.entries(copy)) {
    if (!Object.prototype.hasOwnProperty.call(placeholdersByKey, key)) return `Unknown translation key: ${key}.`;
    if (typeof value !== 'string') return `Translation ${key} must be text.`;
    if (value.length > MAX_TRANSLATION_VALUE_LENGTH) return `Translation ${key} is too large.`;
  }
  return '';
}

function parseStoredCopy(raw: string): Record<string, string> {
  try {
    const copy = JSON.parse(raw) as Record<string, unknown>;
    const error = validateTranslations(copy);
    if (error) throw new Error(error);
    return copy as Record<string, string>;
  } catch {
    throw new TranslationDataError('Stored translation data is invalid.');
  }
}

export class D1TranslationRepository {
  constructor(private readonly database: D1Database, private readonly clock: () => number = Date.now) {}

  async read(shopHandle: string, locale: string): Promise<Record<string, string>> {
    const row = await this.database.prepare('SELECT copy_json FROM quantity_breaks_translations WHERE shop_handle = ? AND locale = ?')
      .bind(shopHandle, locale).first<{ copy_json: string }>();
    return row ? parseStoredCopy(row.copy_json) : {};
  }

  async write(shopHandle: string, locale: string, copy: Record<string, string>): Promise<void> {
    const error = validateTranslations(copy);
    if (error) throw new Error(error);
    await this.database.prepare(`INSERT INTO quantity_breaks_translations
      (shop_handle, locale, copy_json, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(shop_handle, locale) DO UPDATE SET copy_json = excluded.copy_json, updated_at = excluded.updated_at`)
      .bind(shopHandle, locale, JSON.stringify(copy), new Date(this.clock()).toISOString()).run();
  }
}
