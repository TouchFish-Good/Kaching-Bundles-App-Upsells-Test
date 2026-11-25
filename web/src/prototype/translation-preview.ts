import { storefrontCopy, type StorefrontCopyKey } from './storefront-copy';

// Show usage hints only for storefront copy that appears under specific conditions.
const conditionalUsage = {
  'widget.cart_failure': 'translationUsageFailure',
  'widget.cart_success': 'translationUsageSuccess',
  'widget.no_stock': 'translationUsageNoStock',
  'widget.sold_out': 'translationUsageSoldOut',
  'widget.calculated_at_checkout': 'translationUsageCheckout',
  'widget.choose_option': 'translationUsageChoice',
  'widget.tier_items': 'translationUsageTier',
  'widget.cart_uncertain': 'translationUsageUncertain',
} as const;
export const translationUsageKeys: Partial<Record<StorefrontCopyKey, typeof conditionalUsage[keyof typeof conditionalUsage]>> = conditionalUsage;

// Keep stored legacy translations intact, but expose only copy used by the storefront.
const unusedStorefrontKeys = new Set<StorefrontCopyKey>(['widget.description', 'widget.tier_rule', 'widget.checkout_note', 'widget.adding']);
export const translationCopy = storefrontCopy.filter((entry) => !unusedStorefrontKeys.has(entry.key));
