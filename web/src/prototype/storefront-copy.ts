export const storefrontCopy = [
  { key: "widget.offer_locked", source: "Locked", location: "Variant selection" },
  { key: "widget.gifts.title", source: "🎁 Free gifts with your order", location: "Widget header" },
  { key: "widget.bundles.title", source: "Frequently Bought Together", location: "Widget header" },
  { key: "widget.title", source: "Bundle & save", location: "Widget header" },
  { key: "widget.tier_savings_badge", source: "Save {saving_amount}", location: "Widget header" },
  { key: "widget.description", source: "Choose a quantity, then set each item.", location: "Widget header" },
  { key: "widget.tier_rule", source: "Highest tier applies to all items", location: "Widget header" },
  { key: "widget.original", source: "Original", location: "Price summary" },
  { key: "widget.savings", source: "Estimated savings", location: "Price summary" },
  { key: "widget.total", source: "Bundle total", location: "Price summary" },
  { key: "widget.add_to_cart", source: "Add {quantity} to cart · {price}", location: "Cart action" },
  { key: "widget.adding", source: "Adding bundle...", location: "Cart action" },
  { key: "widget.cart_failure", source: "Bundle could not be added. Your selections have been kept so you can retry.", location: "Cart feedback" },
  { key: "widget.cart_success", source: "{quantity} items were added as {lines} cart lines.", location: "Cart feedback" },
  { key: "widget.no_stock", source: "Not enough available variants for this quantity.", location: "Variant selection" },
  { key: "widget.sold_out", source: "Sold out", location: "Variant selection" },
  { key: "widget.checkout_note", source: "Taxes and final discount are calculated by SHOPLINE at checkout.", location: "Checkout note" },
  { key: "widget.calculated_at_checkout", source: "Calculated at checkout", location: "Price summary" },
  { key: "widget.choose_option", source: "Choose an option", location: "Variant selection" },
  { key: "widget.tier_items", source: "{quantity} items", location: "Tier selection" },
  { key: "widget.cart_uncertain", source: "We could not confirm your cart. Check it before trying again.", location: "Cart feedback" },
] as const;

export type StorefrontCopyKey = typeof storefrontCopy[number]["key"];
export type StorefrontTranslations = Partial<Record<StorefrontCopyKey, string>>;

export function validateTranslation(key: StorefrontCopyKey, value: string): string {
  void key;
  void value;
  return "";
}

export function renderStorefrontCopy(key: StorefrontCopyKey, translations: StorefrontTranslations = {}, variables: Record<string, string | number> = {}): string {
  const entry = storefrontCopy.find((item) => item.key === key)!;
  if (['widget.title', 'widget.gifts.title', 'widget.bundles.title'].includes(key) && Object.prototype.hasOwnProperty.call(translations, key) && !translations[key]?.trim()) return '';
  const translated = translations[key];
  const source = translated || entry.source;
  return source.replace(/\{([a-z_]+)\}/g, (_match, name: string) => String(variables[name] ?? `{${name}}`));
}
