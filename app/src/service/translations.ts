import type { Database } from 'sqlite3';

const placeholdersByKey: Record<string, string[]> = {
  'widget.gifts.title': [], 'widget.bundles.title': [], 'widget.title': [], 'widget.tier_savings_badge': ['saving_amount'], 'widget.description': [], 'widget.tier_rule': [],
  'widget.original': [], 'widget.savings': [], 'widget.total': [],
  'widget.add_to_cart': ['quantity', 'price'], 'widget.adding': [],
  'widget.cart_failure': [], 'widget.cart_success': ['quantity', 'lines'],
  'widget.stock_shortage': ['item', 'quantity', 'available'],
  'widget.no_stock': [], 'widget.sold_out': [], 'widget.color': [],
  'widget.size': [], 'widget.checkout_note': [], 'widget.calculated_at_checkout': [],
  'widget.choose_option': [], 'widget.item_option': ['index', 'option'], 'widget.tier_items': ['quantity'], 'widget.cart_uncertain': [],
};

export function validateTranslations(copy: Record<string, unknown>): string {
  if (!copy || typeof copy !== 'object' || Array.isArray(copy)) return 'Translation payload must be an object.';
  for (const [key, value] of Object.entries(copy)) {
    if (!Object.prototype.hasOwnProperty.call(placeholdersByKey, key)) return `Unknown translation key: ${key}.`;
    if (typeof value !== 'string') return `Translation ${key} must be text.`;
  }
  return '';
}

export class TranslationRepository {
  private ready: Promise<void>;

  constructor(private db: Database) {
    this.ready = new Promise((resolve, reject) => db.run(
      'CREATE TABLE IF NOT EXISTS quantity_breaks_translations (shop_handle TEXT NOT NULL, locale TEXT NOT NULL, copy_json TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (shop_handle, locale))',
      (error) => error ? reject(error) : resolve(),
    ));
  }

  async read(shopHandle: string, locale: string): Promise<Record<string, string>> {
    await this.ready;
    const row = await new Promise<{ copy_json: string } | undefined>((resolve, reject) => this.db.get(
      'SELECT copy_json FROM quantity_breaks_translations WHERE shop_handle = ? AND locale = ?', [shopHandle, locale],
      (error, value) => error ? reject(error) : resolve(value as { copy_json: string } | undefined),
    ));
    return row ? JSON.parse(row.copy_json) : {};
  }

  async write(shopHandle: string, locale: string, copy: Record<string, string>): Promise<void> {
    const error = validateTranslations(copy);
    if (error) throw new Error(error);
    await this.ready;
    await new Promise<void>((resolve, reject) => this.db.run(
      'INSERT INTO quantity_breaks_translations (shop_handle, locale, copy_json, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(shop_handle, locale) DO UPDATE SET copy_json = excluded.copy_json, updated_at = excluded.updated_at',
      [shopHandle, locale, JSON.stringify(copy), new Date().toISOString()],
      (failure) => failure ? reject(failure) : resolve(),
    ));
  }
}
