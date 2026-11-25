import type { Tier } from './model';

export type CombinationType = 'product' | 'order' | 'shipping';
export type CombinationSettings = {
  combineOrder?: boolean;
  combineProduct?: boolean;
  combineShipping?: boolean;
};
export type SpecifiedMarketCombinationRow = {
  tierId: string;
  label: string;
  marketNames: string[];
};

const fixedDiscountTypes = new Set<Tier['discountType']>([
  'fixed_amount',
  'fixed_price',
  'bundle_fixed_amount',
  'bundle_fixed_price',
]);

export function getEnabledCombinationTypes(settings: CombinationSettings): CombinationType[] {
  return [
    ...(settings.combineProduct ? ['product' as const] : []),
    ...(settings.combineOrder ? ['order' as const] : []),
    ...(settings.combineShipping ? ['shipping' as const] : []),
  ];
}

export function getSpecifiedMarketCombinationRows(
  tiers: Tier[],
  marketsById: Record<string, string>,
): SpecifiedMarketCombinationRow[] {
  return tiers.flatMap((tier) => {
    if (!fixedDiscountTypes.has(tier.discountType)) return [];
    const marketNames = Object.entries(tier.marketOverrides ?? {})
      .filter(([, override]) => override.mode === 'specified_amount')
      .map(([marketId]) => marketsById[marketId] ?? marketId);
    return marketNames.length
      ? [{ tierId: tier.tierId ?? '', label: tier.label || tier.tierId || '', marketNames }]
      : [];
  });
}
