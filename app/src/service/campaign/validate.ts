import type { CampaignDraft, CampaignScope } from './model';
import { validateCampaignWidgetConfig } from './widget-config';

const nonEmptyIds = (value: unknown): value is string[] => Array.isArray(value) && value.every((id) => typeof id === 'string' && id.trim().length > 0);
const unique = (values: string[]) => new Set(values).size === values.length;
const live = (status: string) => status === 'active' || status === 'scheduled';

export function validateCampaign(value: CampaignDraft): string[] {
  const errors: string[] = [];
  if (!value || typeof value !== 'object') return ['Campaign must be an object.'];
  if (typeof value.id !== 'string' || !value.id.trim()) errors.push('Campaign id is required.');
  if (typeof value.name !== 'string' || !value.name.trim()) errors.push('Campaign name is required.');
  if (!['draft', 'active', 'scheduled', 'paused', 'ended'].includes(value.status)) errors.push('Unknown campaign status.');
  const scope = value.scope;
  if (!scope || !['all', 'products', 'collections'].includes(scope.kind)) errors.push('Valid product scope is required.');
  else {
    if (!nonEmptyIds(scope.excludedProductIds) || !unique(scope.excludedProductIds)) errors.push('excludedProductIds must contain unique IDs.');
    if (scope.kind === 'products' && (!nonEmptyIds(scope.productIds) || !scope.productIds.length || !unique(scope.productIds))) errors.push('productIds must contain unique IDs.');
    if (scope.kind === 'collections' && (!nonEmptyIds(scope.collectionIds) || !scope.collectionIds.length || !unique(scope.collectionIds))) errors.push('collectionIds must contain unique IDs.');
    if (live(value.status) && scope.kind === 'collections' && (!nonEmptyIds(scope.resolvedProductIds) || !scope.resolvedProductIds.length)) errors.push('Active collection scope needs resolvedProductIds.');
  }
  if (!Array.isArray(value.tiers) || !value.tiers.length) errors.push('At least one tier is required.');
  else {
    const quantities = new Set<number>();
    const tierIds = new Set<string>();
    const orders = new Set<number>();
    const specifiedMarkets = new Set<string>();
    const marketCurrencies = new Map<string, string>();
    for (const tier of value.tiers) {
      if (!tier || typeof tier.tierId !== 'string' || !tier.tierId.trim() || tierIds.has(tier.tierId)) errors.push('Tier IDs must be unique.');
      else tierIds.add(tier.tierId);
      if (!Number.isInteger(tier.displayOrder) || tier.displayOrder < 0 || orders.has(tier.displayOrder)) errors.push('displayOrder must be a unique non-negative integer.');
      else orders.add(tier.displayOrder);
      if (!Number.isInteger(tier.quantity) || tier.quantity < 1) errors.push('Tier quantity must be a positive integer.');
      else if (quantities.has(tier.quantity)) errors.push('Tier quantities must be unique.');
      else quantities.add(tier.quantity);
      if (!['none', 'percentage', 'fixed_amount', 'fixed_price', 'bundle_fixed_amount', 'bundle_fixed_price'].includes(tier.discountType)) errors.push('Unknown discount type.');
      if (tier.discountType === 'none' && tier.discountValue !== undefined) errors.push('Original-price tier cannot have a discount value.');
      if (tier.discountType !== 'none' && (!Number.isInteger(tier.discountValue) || (tier.discountValue as number) < 0)) errors.push('Discount value must be a non-negative integer.');
      if (tier.discountType === 'percentage' && (tier.discountValue as number) > 10000) errors.push('Percentage cannot exceed 10000 basis points.');
      for (const [marketId, override] of Object.entries(tier.marketOverrides || {})) {
        if (!marketId.trim() || !override || !['auto_convert', 'specified_amount'].includes(override.mode)) errors.push('Invalid market override.');
        if (override?.mode === 'specified_amount' && (!Number.isInteger(override.amountMinor) || override.amountMinor < 0 || !/^[A-Z]{3}$/.test(override.currencyCode))) errors.push('Market amountMinor and currencyCode are required.');
        if (override?.mode === 'specified_amount') {
          if (!['fixed_amount', 'fixed_price', 'bundle_fixed_amount', 'bundle_fixed_price'].includes(tier.discountType)) errors.push('Specified market amounts require a fixed discount type.');
          specifiedMarkets.add(marketId);
          const previousCurrency = marketCurrencies.get(marketId);
          if (previousCurrency && previousCurrency !== override.currencyCode) errors.push(`Market ${marketId} must use the same currency in every tier.`);
          marketCurrencies.set(marketId, override.currencyCode);
        }
      }
    }
    for (const marketId of specifiedMarkets) {
      if (value.tiers.some((tier) => tier.discountType !== 'none' && tier.marketOverrides?.[marketId]?.mode !== 'specified_amount')) {
        errors.push(`Market ${marketId} has mixed shop and presentment currency modes across tiers.`);
      }
    }
  }
  if (!value.combinesWith || typeof value.combinesWith.orderDiscounts !== 'boolean' || typeof value.combinesWith.productDiscounts !== 'boolean' || typeof value.combinesWith.shippingDiscounts !== 'boolean') errors.push('Combination choices are required.');
  if (value.widget !== undefined) errors.push(...validateCampaignWidgetConfig(value.widget));
  if (!value.startsAt) errors.push('startsAt is required.');
  else if (Number.isNaN(Date.parse(value.startsAt))) errors.push('Invalid startsAt.');
  if (value.endsAt && Number.isNaN(Date.parse(value.endsAt))) errors.push('Invalid endsAt.');
  if (value.startsAt && value.endsAt && Date.parse(value.endsAt) <= Date.parse(value.startsAt)) errors.push('endsAt must follow startsAt.');
  return errors;
}

export function scopesOverlap(left: CampaignScope, right: CampaignScope): boolean {
  const members = (scope: CampaignScope) => scope.kind === 'products' ? scope.productIds || [] : scope.resolvedProductIds || [];
  const included = (scope: CampaignScope, id: string) => !scope.excludedProductIds.includes(id) && (scope.kind === 'all' || members(scope).includes(id));
  if (left.kind === 'all' && right.kind === 'all') return true;
  if (left.kind === 'all') return members(right).some((id) => included(left, id) && included(right, id));
  if (right.kind === 'all') return members(left).some((id) => included(left, id) && included(right, id));
  return members(left).some((id) => included(left, id) && included(right, id));
}

export function campaignsConflict(left: CampaignDraft, right: CampaignDraft): boolean {
  if (!live(left.status) || !live(right.status)) return false;
  if ((left.scope.kind === 'products' && right.scope.kind === 'collections') || (left.scope.kind === 'collections' && right.scope.kind === 'products')) return false;
  return schedulesOverlap(left, right) && scopesOverlap(left.scope, right.scope);
}

function schedulesOverlap(left: CampaignDraft, right: CampaignDraft): boolean {
  const start = Math.max(left.startsAt ? Date.parse(left.startsAt) : -Infinity, right.startsAt ? Date.parse(right.startsAt) : -Infinity);
  const end = Math.min(left.endsAt ? Date.parse(left.endsAt) : Infinity, right.endsAt ? Date.parse(right.endsAt) : Infinity);
  return start < end;
}

export function campaignCurrencyConflict(left: CampaignDraft, right: CampaignDraft): boolean {
  if (!live(left.status) || !live(right.status) || !schedulesOverlap(left, right)) return false;
  const markets = new Set<string>();
  for (const campaign of [left, right]) for (const tier of campaign.tiers) {
    if (tier.discountType === 'none') continue;
    for (const [marketId, override] of Object.entries(tier.marketOverrides || {})) {
      if (override.mode === 'specified_amount') markets.add(marketId);
    }
  }
  for (const marketId of markets) {
    const mode = (campaign: CampaignDraft) => {
      const override = campaign.tiers.find((tier) => tier.discountType !== 'none')?.marketOverrides?.[marketId];
      return override?.mode === 'specified_amount' ? override.currencyCode : 'shop';
    };
    if (mode(left) !== mode(right)) return true;
  }
  return false;
}
