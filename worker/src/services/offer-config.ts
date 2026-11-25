import type { CampaignDraft } from '../domain/campaign';
export type OfferSelection = { productId: string; variantIds: string[] };
export const hasEnabledOffers = (campaign: Pick<CampaignDraft, 'gifts' | 'bundles'>): boolean => campaign.gifts?.enabled === true || campaign.bundles?.enabled === true;
export function offerSelections(campaign: Pick<CampaignDraft, 'gifts' | 'bundles'>): OfferSelection[] {
  const products = new Map<string, Set<string>>();
  for (const module of [campaign.gifts, campaign.bundles]) if (module?.enabled) for (const rule of module.items) {
    const variants = products.get(rule.productId) ?? new Set<string>(); rule.allowedVariantIds.forEach(id => variants.add(id)); products.set(rule.productId, variants);
  }
  return [...products].sort(([a], [b]) => a.localeCompare(b)).map(([productId, variants]) => ({ productId, variantIds: [...variants].sort() }));
}
export function trustedCurrencyDecimals(currency: string): number {
  if (!/^[A-Z]{3}$/.test(currency) || !Intl.supportedValuesOf('currency').includes(currency)) throw new Error('Unsupported currency metadata.');
  const decimals = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits;
  if (decimals === undefined || !Number.isInteger(decimals) || decimals < 0 || decimals > 3) throw new Error('Unsupported currency precision.');
  return decimals;
}
export function catalogScope(campaign: CampaignDraft) {
  return { kind: campaign.scope.kind,
    ...(campaign.scope.kind === 'products' ? { productIds: [...(campaign.scope.productIds ?? [])].sort() } : {}),
    ...(campaign.scope.kind === 'collections' ? { collectionIds: [...(campaign.scope.collectionIds ?? [])].sort() } : {}),
    excludedProductIds: [...new Set([...(campaign.scope.excludedProductIds ?? []), ...offerSelections(campaign).map(item => item.productId)])].sort(),
  };
}
/** Catalog authority only: styling, copy, discounts and lifecycle row revisions do not invalidate hydrated products. */
export async function offerConfigDigest(campaign: CampaignDraft): Promise<string> {
  const value = JSON.stringify({ version: 1, campaignId: campaign.id, scope: catalogScope(campaign), startsAt: campaign.startsAt ?? null, endsAt: campaign.endsAt ?? null, products: offerSelections(campaign) });
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
export function validOfferSelection(value: unknown): value is OfferSelection[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 20 && value.every(item => item && typeof item === 'object' && typeof item.productId === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(item.productId) && Array.isArray(item.variantIds) && item.variantIds.length > 0 && item.variantIds.length <= 100 && new Set(item.variantIds).size === item.variantIds.length && item.variantIds.every((id: unknown) => typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9_:/.-]{0,255}$/.test(id))) && new Set(value.map(item => item.productId)).size === value.length && value.reduce((sum, item) => sum + item.variantIds.length, 0) <= 200;
}
