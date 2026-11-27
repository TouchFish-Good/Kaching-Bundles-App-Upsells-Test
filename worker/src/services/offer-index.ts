import type { AuthContext } from '../auth/session';
import type { CampaignDraft } from '../domain/campaign';
import { D1CampaignRepository } from '../db/campaigns';
import { D1SessionStore } from '../db/sessions';
import type { Env } from '../env';
import { catalogScope, hasEnabledOffers, offerConfigDigest, offerSelections, type OfferSelection } from './offer-config';
import { supportedOfferFunction } from './discounts';
import { shoplineAdminHeaders, shoplineAdminRetryAfter } from './shopline-admin-request-headers';
export const OFFER_INDEX_NAMESPACE = 'qb_test_offers';
export const OFFER_INDEX_KEY = 'catalog_v1';
export type OfferProductRef = { id: string; handle: string; variantIds: string[] };
export type OfferIndexEntry = { campaignId: string; digest: string; scope: ReturnType<typeof catalogScope>; startsAt: string | null; endsAt: string | null; products: OfferProductRef[] };
export type OfferIndex = { version: 1; entries: OfferIndexEntry[] };
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
export class OfferIndexError extends Error { constructor(message: string, readonly retryAfter?: number) { super(message); } }
async function request(session: AuthContext, path: string, init: RequestInit = {}): Promise<unknown> {
  if (!/^[a-z0-9][a-z0-9-]{0,127}$/i.test(session.handle) || !session.accessToken) throw new OfferIndexError('Authenticated shop required.');
  const response = await fetch(`https://${session.handle}.myshopline.com/admin/openapi/v20260901${path}`, { ...init, headers: shoplineAdminHeaders(session.accessToken), signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(8_000)]) : AbortSignal.timeout(8_000) });
  if (!response.ok) {
    throw new OfferIndexError(`Offer catalog Admin request returned ${response.status}.`, response.status === 429 ? shoplineAdminRetryAfter(response.headers.get('Retry-After')) : undefined);
  }
  const payload: unknown = await response.json();
  if (!object(payload) || payload.errors) throw new OfferIndexError('Offer catalog Admin response is incomplete.');
  return payload;
}
/** Existing authenticated Admin product API establishes nested Product/variant ownership; never accepts editable handles. */
type VerifiedOfferRef = OfferProductRef & {
  title: string; imageUrl: string | null; optionNames: string[];
  variants: Array<{ id: string; title: string; imageUrl: string | null; options: Array<{ name: string; value: string }> }>;
};
export async function verifiedOfferReferences(session: AuthContext, selections: OfferSelection[], signal?: AbortSignal): Promise<VerifiedOfferRef[]> {
  const refs = new Map<string, VerifiedOfferRef>();
  for (let start = 0; start < selections.length; start += 50) {
    signal?.throwIfAborted();
    const batch = selections.slice(start, start + 50);
    if (batch.some(item => !/^[A-Za-z0-9_-]{1,128}$/.test(item.productId))) throw new OfferIndexError('Invalid Product identity.');
    const query = new URLSearchParams({ ids: batch.map(item => item.productId).join(','), limit: String(batch.length), fields: 'id,handle,title,image,options,variants' });
    const raw = await request(session, `/products/products.json?${query}`, { signal });
    const products = object(raw) ? raw.products : undefined;
    if (!Array.isArray(products) || products.length !== batch.length) throw new OfferIndexError('Configured Product identity is unverified.');
    for (const product of products) {
      if (!object(product) || typeof product.id !== 'string' || refs.has(product.id)) throw new OfferIndexError('Configured Product identity is invalid.');
      const selected = batch.find(item => item.productId === product.id);
      if (!selected || typeof product.handle !== 'string' || !product.handle.trim() || product.handle.length > 255 || /[\u0000-\u001f]/.test(product.handle) || !Array.isArray(product.variants)) throw new OfferIndexError('Configured Product handle/identity is unverified.');
      const variants = new Set<string>();
      for (const variant of product.variants) {
        if (!object(variant) || typeof variant.id !== 'string' || !variant.id || variants.has(variant.id) || (variant.product_id !== undefined && variant.product_id !== product.id)) throw new OfferIndexError('Configured variant identity is unverified.');
        variants.add(variant.id);
      }
      if (!selected.variantIds.every(id => variants.has(id))) throw new OfferIndexError('Configured variant ownership is unverified.');
      const productVariants = product.variants;
      const optionNames = Array.isArray(product.options) ? product.options.flatMap(option => object(option) && typeof option.name === 'string' ? [option.name] : []) : [];
      refs.set(product.id, { id: product.id, handle: product.handle, variantIds: selected.variantIds,
        title: typeof product.title === 'string' ? product.title : product.handle,
        imageUrl: object(product.image) && typeof product.image.src === 'string' && product.image.src.startsWith('https://') ? product.image.src : null,
        optionNames,
        variants: selected.variantIds.map(id => {
          const variant = productVariants.find(item => object(item) && item.id === id) as Record<string, unknown>;
          const values = Array.isArray(variant.options) && variant.options.length
            ? variant.options.flatMap(option => object(option) && typeof option.value === 'string' ? [option.value] : [])
            : [variant.option1, variant.option2, variant.option3, variant.option4, variant.option5].filter((value): value is string => typeof value === 'string' && Boolean(value));
          return { id, title: typeof variant.title === 'string' ? variant.title : values.join(' / ') || id,
            imageUrl: object(variant.image) && typeof variant.image.src === 'string' && variant.image.src.startsWith('https://') ? variant.image.src : null,
            options: values.flatMap((value, index) => optionNames[index] ? [{ name: optionNames[index], value }] : []),
          };
        }),
      });
    }
  }
  return selections.map(selection => refs.get(selection.productId)!);
}
export async function buildOfferIndex(session: AuthContext, published: CampaignDraft[], candidate: CampaignDraft | null, removeIds: string[] = []): Promise<OfferIndex> {
  const entries: OfferIndexEntry[] = [];
  const campaigns = [...published.filter(item => item.id !== candidate?.id && !removeIds.includes(item.id)), ...(candidate ? [candidate] : [])].filter(item => ['active', 'scheduled'].includes(item.status) && hasEnabledOffers(item)).sort((a, b) => a.id.localeCompare(b.id));
  const selections = new Map<string, Set<string>>();
  for (const campaign of campaigns) for (const selected of offerSelections(campaign)) { const ids = selections.get(selected.productId) ?? new Set<string>(); selected.variantIds.forEach(id => ids.add(id)); selections.set(selected.productId, ids); }
  const refs = await verifiedOfferReferences(session, [...selections].map(([productId, ids]) => ({ productId, variantIds: [...ids].sort() })));
  for (const campaign of campaigns) entries.push({ campaignId: campaign.id, digest: await offerConfigDigest(campaign), scope: catalogScope(campaign), startsAt: campaign.startsAt ?? null, endsAt: campaign.endsAt ?? null, products: offerSelections(campaign).map(item => ({ id: item.productId, handle: refs.find(ref => ref.id === item.productId)!.handle, variantIds: item.variantIds })) });
  return { version: 1, entries };
}
function metafield(raw: unknown): raw is Record<string, unknown> {
  return object(raw) && raw.namespace === OFFER_INDEX_NAMESPACE && raw.key === OFFER_INDEX_KEY && raw.owner_resource === 'shop' && raw.type === 'json';
}
function fieldId(raw: unknown): string {
  if (typeof raw === 'string' && /^\d+$/.test(raw)) return raw;
  if (typeof raw === 'number' && Number.isSafeInteger(raw) && raw > 0) return String(raw);
  throw new OfferIndexError('Metafield identity is unsafe.');
}
function decodedValue(value: unknown): unknown { if (typeof value !== 'string') return value; try { return JSON.parse(value); } catch { return null; } }
/** JSON object key order is insignificant; array order and all values remain exact. */
function sameJsonValue(actual: unknown, expected: unknown): boolean {
  if (actual === expected) return true;
  if (Array.isArray(actual) || Array.isArray(expected)) {
    return Array.isArray(actual) && Array.isArray(expected) && actual.length === expected.length
      && actual.every((value, index) => sameJsonValue(value, expected[index]));
  }
  if (!object(actual) || !object(expected)) return false;
  const keys = Object.keys(expected);
  return Object.keys(actual).length === keys.length
    && keys.every(key => Object.hasOwn(actual, key) && sameJsonValue(actual[key], expected[key]));
}
async function readIndex(session: AuthContext): Promise<Record<string, unknown> | undefined> {
  const query = new URLSearchParams({ namespace: OFFER_INDEX_NAMESPACE, key: OFFER_INDEX_KEY, limit: '2' });
  const raw = await request(session, `/metafields.json?${query}`);
  const fields = object(raw) ? raw.metafields : undefined;
  if (!Array.isArray(fields) || fields.length > 1 || (fields.length === 1 && !metafield(fields[0]))) throw new OfferIndexError('Offer index identity is ambiguous.');
  if (fields[0]) fieldId(fields[0].id);
  return fields[0];
}
export async function writeOfferIndex(session: AuthContext, index: OfferIndex, assertLease: () => Promise<void> = async () => {}): Promise<void> {
  if (JSON.stringify(index).length > 500_000) throw new OfferIndexError('Offer index exceeds the platform metafield size limit.');
  await assertLease();
  const current = await readIndex(session);
  if (sameJsonValue(decodedValue(current?.value), index)) { await assertLease(); return; }
  await assertLease();
  const id = current ? fieldId(current.id) : undefined;
  const payload = await request(session, id ? `/metafields/${encodeURIComponent(id)}.json` : '/metafields.json', { method: id ? 'PUT' : 'POST', body: JSON.stringify({ metafield: { ...(id ? { id } : { namespace: OFFER_INDEX_NAMESPACE, key: OFFER_INDEX_KEY }), type: 'json', value: index } }) });
  if (!object(payload) || !metafield(payload.metafield) || (id && fieldId(payload.metafield.id) !== id) || !sameJsonValue(decodedValue(payload.metafield.value), index)) throw new OfferIndexError('Offer index write was not confirmed.');
  const confirmed = await readIndex(session);
  if (!confirmed || fieldId(confirmed.id) !== fieldId(payload.metafield.id) || !sameJsonValue(decodedValue(confirmed.value), index)) throw new OfferIndexError('Offer index readback was not confirmed.');
  await assertLease();
}
/** Injected only in publication-capable repositories. Existing D1 shop lease serializes aggregate read/build/write. */
export function campaignRepository(env: Env, clock: () => number = Date.now): D1CampaignRepository {
  return new D1CampaignRepository(env.DB, clock, async (repository, handle, previous, candidate, owner) => {
    if (!previous.some(hasEnabledOffers) && !hasEnabledOffers(candidate)) return;
    if (hasEnabledOffers(candidate) && ['active', 'scheduled'].includes(candidate.status) && !supportedOfferFunction(handle, env)) throw new OfferIndexError('Verified gift/bundle Function capability is required for publication.');
    const session = await new D1SessionStore(env.DB, env.TOKEN_ENCRYPTION_KEY).get(handle);
    if (!session?.installed) throw new OfferIndexError('Installed shop catalog is unavailable.');
    const assertLease = () => repository.assertShopLease(handle, owner);
    await assertLease();
    const projections = await repository.listProjections(handle);
    const published = projections.filter(item => item.publication.state === 'active').map(item => item.campaign);
    const index = await buildOfferIndex(session, published, candidate, previous.map(item => item.id));
    await writeOfferIndex(session, index, assertLease);
  });
}
