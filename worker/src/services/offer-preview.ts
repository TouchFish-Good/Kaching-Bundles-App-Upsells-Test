import type { AuthContext } from '../auth/session';
import { fetchShopCurrency } from './collection-publication';
import { trustedCurrencyDecimals, type OfferSelection } from './offer-config';
import { verifiedOfferReferences, OfferIndexError } from './offer-index';
import { shoplineAdminHeaders } from './shopline-admin-request-headers';
// Official Admin v20260901 ProductVariant docs: Money is a scalar in Admin, unlike Storefront Money.
const OPERATION = 'query OfferPreviewVariant($id: ID!) { productVariant(id: $id) { id productId title availableForSale price selectedOptions { name value } image { url } } }';
type Context = { marketId?: string; currencyCode?: string; countryCode?: string };
type Price = { amountMinor: number; currencyCode: string; currencyDecimals: number };
type Variant = { id: string; title: string; available: boolean; price: Price | null; imageUrl: string | null; options: Array<{ name: string; value: string }> };
export type OfferPreviewProduct = { id: string; title: string; handle: string; imageUrl: string | null; optionNames: string[]; identityVerified: boolean; available: boolean; variants: Variant[] };
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
function money(raw: unknown, currencyCode: string): Price | null {
  if (typeof raw !== 'string' || !/^\d+(?:\.\d+)?$/.test(raw)) return null;
  const currencyDecimals = trustedCurrencyDecimals(currencyCode), [whole, fraction = ''] = raw.split('.');
  if (fraction.length > currencyDecimals && /[1-9]/.test(fraction.slice(currencyDecimals))) return null;
  const amount = BigInt(whole) * 10n ** BigInt(currencyDecimals) + BigInt(fraction.slice(0, currencyDecimals).padEnd(currencyDecimals, '0') || '0');
  return amount <= BigInt(Number.MAX_SAFE_INTEGER) ? { amountMinor: Number(amount), currencyCode, currencyDecimals } : null;
}
function unavailable(id: string): Variant { return { id, title: '', available: false, price: null, imageUrl: null, options: [] }; }
function retryAfter(header: string | null): number { const value = header && /^\d+$/.test(header) ? Number(header) : header ? (Date.parse(header) - Date.now()) / 1000 : 1; return Number.isFinite(value) ? Math.max(1, Math.min(3600, Math.ceil(value))) : 1; }
export async function resolveOfferPreview(session: AuthContext, selections: OfferSelection[], context: Context): Promise<{ products: OfferPreviewProduct[]; retryAfter?: number }> {
  const refs = await verifiedOfferReferences(session, selections);
  const products: OfferPreviewProduct[] = refs.map(ref => ({ id: ref.id, title: ref.title, handle: ref.handle, imageUrl: ref.imageUrl, optionNames: ref.optionNames, identityVerified: true, available: false, variants: ref.variantIds.map(unavailable) }));
  let currency: string;
  try {
    currency = await fetchShopCurrency(session); trustedCurrencyDecimals(currency);
    if (!context.marketId || context.currencyCode !== currency) return { products };
    const response = await fetch(`https://${session.handle}.myshopline.com/admin/openapi/v20260901/markets.json?limit=100`, { headers: shoplineAdminHeaders(session.accessToken), signal: AbortSignal.timeout(8_000) });
    if (response.status === 429) { await response.body?.cancel(); return { products, retryAfter: retryAfter(response.headers.get('Retry-After')) }; }
    const payload: unknown = await response.json();
    if (!response.ok || response.headers.get('Link') || !object(payload) || !Array.isArray(payload.markets)) return { products };
    const primary = payload.markets.filter(item => object(item) && item.primary === true && item.enabled === true);
    if (primary.length !== 1 || !object(primary[0]) || (primary[0].market_id ?? primary[0].id) !== context.marketId) return { products };
    if (context.countryCode && (!Array.isArray(primary[0].regions) || !primary[0].regions.some(region => object(region) && region.code === context.countryCode))) return { products };
  } catch (failure) { return { products, ...(failure instanceof OfferIndexError && failure.retryAfter ? { retryAfter: failure.retryAfter } : {}) }; }
  let retry: number | undefined;
  const variantDeadline = AbortSignal.timeout(8_000);
  // One bounded request per exact selected variant; never enumerates an unbounded catalog or guesses GIDs.
  for (const product of products) for (let index = 0; index < product.variants.length; index++) {
    if (retry) break;
    const expected = product.variants[index].id;
    try {
      const response = await fetch(`https://${session.handle}.myshopline.com/admin/graph/v20260901/graphql.json`, { method: 'POST', headers: shoplineAdminHeaders(session.accessToken), body: JSON.stringify({ query: OPERATION, variables: { id: expected } }), signal: variantDeadline });
      if (response.status === 429) { await response.body?.cancel(); retry = retryAfter(response.headers.get('Retry-After')); break; }
      if (!response.ok) continue;
      const payload: unknown = await response.json();
      if (!object(payload) || (Array.isArray(payload.errors) && payload.errors.length) || !object(payload.data) || !object(payload.data.productVariant)) continue;
      const variant = payload.data.productVariant;
      if (variant.id !== expected || variant.productId !== product.id) continue;
      const price = money(variant.price, currency);
      const options = Array.isArray(variant.selectedOptions) ? variant.selectedOptions.flatMap(option => object(option) && typeof option.name === 'string' && typeof option.value === 'string' ? [{ name: option.name, value: option.value }] : []) : [];
      const imageUrl = object(variant.image) && typeof variant.image.url === 'string' && variant.image.url.startsWith('https://') ? variant.image.url : null;
      product.variants[index] = { id: expected, title: typeof variant.title === 'string' ? variant.title : '', available: variant.availableForSale === true && price !== null, price, imageUrl, options };
    } catch { /* An individual unavailable variant never becomes available by inference. */ }
  }
  products.forEach(product => { product.available = product.variants.some(variant => variant.available); });
  return { products, ...(retry ? { retryAfter: retry } : {}) };
}
