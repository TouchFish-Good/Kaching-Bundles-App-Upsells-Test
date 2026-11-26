import type { AuthContext } from '../auth/session';
import { fetchShopCurrency, ShoplineAdminApiError } from './collection-publication';
import { trustedCurrencyDecimals, type OfferSelection } from './offer-config';
import { verifiedOfferReferences, OfferIndexError } from './offer-index';
import { shoplineAdminHeaders, shoplineAdminRetryAfter } from './shopline-admin-request-headers';
// Admin v20260901 ProductVariant: availableForSale is independent of Money, a default-shop-currency scalar.
const OPERATION = 'query OfferPreviewVariant($id: ID!) { productVariant(id: $id) { id productId availableForSale price } }';
type Context = { marketId?: string; currencyCode?: string; countryCode?: string };
type Price = { amountMinor: number; currencyCode: string; currencyDecimals: number };
export type OfferAvailability = 'available' | 'sold_out' | 'unknown';
export type OfferUnavailableReason = 'unsupported_market' | 'unsupported_currency' | 'unsupported_country' | 'price_unavailable' | 'price_context_unavailable' | 'availability_unknown' | 'sold_out' | 'rate_limited' | 'identity_unverified';
type Variant = { id: string; title: string; available: boolean; availability: OfferAvailability; unavailableReason?: OfferUnavailableReason; price: Price | null; imageUrl: string | null; options: Array<{ name: string; value: string }> };
export type OfferPreviewProduct = { id: string; title: string; handle: string; imageUrl: string | null; optionNames: string[]; identityVerified: boolean; available: boolean; availability: OfferAvailability; unavailableReason?: OfferUnavailableReason; variants: Variant[] };
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
function money(raw: unknown, currencyCode: string): Price | null {
  if (typeof raw !== 'string' || !/^\d+(?:\.\d+)?$/.test(raw)) return null;
  const currencyDecimals = trustedCurrencyDecimals(currencyCode), [whole, fraction = ''] = raw.split('.');
  if (fraction.length > currencyDecimals && /[1-9]/.test(fraction.slice(currencyDecimals))) return null;
  const amount = BigInt(whole) * 10n ** BigInt(currencyDecimals) + BigInt(fraction.slice(0, currencyDecimals).padEnd(currencyDecimals, '0') || '0');
  return amount <= BigInt(Number.MAX_SAFE_INTEGER) ? { amountMinor: Number(amount), currencyCode, currencyDecimals } : null;
}

type PriceContext = { currency?: string; reason?: OfferUnavailableReason; retryAfter?: number };
async function resolvePriceContext(session: AuthContext, context: Context): Promise<PriceContext> {
  if (!context.marketId) return { reason: 'unsupported_market' };
  try {
    const currency = await fetchShopCurrency(session); trustedCurrencyDecimals(currency);
    if (context.currencyCode !== currency) return { reason: 'unsupported_currency' };
    const response = await fetch(`https://${session.handle}.myshopline.com/admin/openapi/v20260901/markets.json?limit=100`, { headers: shoplineAdminHeaders(session.accessToken), signal: AbortSignal.timeout(8_000) });
    if (response.status === 429) { await response.body?.cancel(); return { reason: 'rate_limited', retryAfter: shoplineAdminRetryAfter(response.headers.get('Retry-After')) }; }
    if (!response.ok) { await response.body?.cancel(); return { reason: 'price_context_unavailable' }; }
    const payload: unknown = await response.json();
    if (response.headers.get('Link') || !object(payload) || !Array.isArray(payload.markets)) return { reason: 'price_context_unavailable' };
    const primary = payload.markets.filter(item => object(item) && item.primary === true && item.enabled === true);
    if (primary.length !== 1 || !object(primary[0])) return { reason: 'price_context_unavailable' };
    if ((primary[0].market_id ?? primary[0].id) !== context.marketId) return { reason: 'unsupported_market' };
    if (context.countryCode && (!Array.isArray(primary[0].regions) || !primary[0].regions.some(region => object(region) && region.code === context.countryCode))) return { reason: 'unsupported_country' };
    return { currency };
  } catch (failure) {
    return failure instanceof ShoplineAdminApiError && failure.status === 429
      ? { reason: 'rate_limited', retryAfter: failure.retryAfter ?? 1 }
      : { reason: 'price_context_unavailable' };
  }
}

export async function resolveOfferPreview(session: AuthContext, selections: OfferSelection[], context: Context): Promise<{ products: OfferPreviewProduct[]; retryAfter?: number }> {
  let refs: Awaited<ReturnType<typeof verifiedOfferReferences>>;
  try { refs = await verifiedOfferReferences(session, selections); }
  catch (failure) {
    if (failure instanceof OfferIndexError && failure.retryAfter) return { products: [], retryAfter: failure.retryAfter };
    throw failure;
  }
  const products: OfferPreviewProduct[] = refs.map(ref => ({ id: ref.id, title: ref.title, handle: ref.handle, imageUrl: ref.imageUrl, optionNames: ref.optionNames, identityVerified: true, available: false, availability: 'unknown', variants: ref.variants.map(variant => ({ ...variant, available: false, availability: 'unknown', price: null, unavailableReason: 'availability_unknown' })) }));
  const pricing = await resolvePriceContext(session, context);
  let retry = pricing.retryAfter;
  const variantDeadline = AbortSignal.timeout(8_000);
  // Unsupported pricing never prevents an exact availability query. A rate limit does stop further requests.
  for (const product of products) for (const variant of product.variants) {
    if (retry) { variant.unavailableReason = 'rate_limited'; continue; }
    try {
      const response = await fetch(`https://${session.handle}.myshopline.com/admin/graph/v20260901/graphql.json`, { method: 'POST', headers: shoplineAdminHeaders(session.accessToken), body: JSON.stringify({ query: OPERATION, variables: { id: variant.id } }), signal: variantDeadline });
      if (response.status === 429) { await response.body?.cancel(); retry = shoplineAdminRetryAfter(response.headers.get('Retry-After')); variant.unavailableReason = 'rate_limited'; continue; }
      if (!response.ok) { await response.body?.cancel(); continue; }
      const payload: unknown = await response.json();
      if (!object(payload) || (Array.isArray(payload.errors) && payload.errors.length) || !object(payload.data) || !object(payload.data.productVariant)) continue;
      const resolved = payload.data.productVariant;
      if (resolved.id !== variant.id || resolved.productId !== product.id) { variant.unavailableReason = 'identity_unverified'; continue; }
      variant.availability = resolved.availableForSale === true ? 'available' : resolved.availableForSale === false ? 'sold_out' : 'unknown';
      variant.price = pricing.currency ? money(resolved.price, pricing.currency) : null;
      // Keep legacy available as the priced/usable flag for existing API consumers.
      variant.available = variant.availability === 'available' && variant.price !== null;
      variant.unavailableReason = pricing.reason ?? (variant.availability === 'sold_out' ? 'sold_out' : variant.availability === 'unknown' ? 'availability_unknown' : variant.price === null ? 'price_unavailable' : undefined);
    } catch { /* Failed availability remains unknown; verified REST metadata is retained. */ }
  }
  for (const product of products) {
    product.available = product.variants.some(variant => variant.available);
    product.availability = product.variants.some(variant => variant.availability === 'available') ? 'available'
      : product.variants.length > 0 && product.variants.every(variant => variant.availability === 'sold_out') ? 'sold_out' : 'unknown';
    if (!product.available) product.unavailableReason = product.variants.find(variant => variant.availability === product.availability)?.unavailableReason ?? pricing.reason ?? 'availability_unknown';
  }
  return { products, ...(retry ? { retryAfter: retry } : {}) };
}
