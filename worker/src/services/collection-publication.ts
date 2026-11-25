import type { AuthContext } from '../auth/session';
import { CampaignConflictError } from '../db/campaigns';
import type { Campaign } from '../domain/campaign';
import { shoplineAdminHeaders } from './shopline-admin-request-headers';
import { DiscountUncertainError, type ShoplineRequestMetadata } from './discounts';
import { diagnosticResponseBody } from '../observability/diagnostic-response';
import { COLLECTION_VARIABLE_KEY, COLLECTION_VARIABLE_NAMESPACE, ensureCollectionMetafieldDefinition } from './collection-metafield-definition';

const VERSION = 'v20260901';

export class ShoplineAdminApiError extends Error {
  constructor(readonly path: string, readonly status: number) {
    super(`SHOPLINE Admin API ${path} returned ${status}.`);
    this.name = 'ShoplineAdminApiError';
  }
}

function validId(id: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}$/.test(id);
}

function baseUrl(session: AuthContext): string {
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(session.handle) || !session.accessToken) throw new Error('Authenticated SHOPLINE session is required.');
  return `https://${session.handle}.myshopline.com/admin/openapi/${VERSION}`;
}

function nextCursor(link: string | null): string | null {
  if (!link) return null;
  const next = link.split(',').find((part) => /rel=["']?next["']?/i.test(part));
  const href = next?.match(/<([^>]+)>/)?.[1];
  if (!href) return null;
  const cursor = new URL(href, 'https://pagination.invalid').searchParams.get('page_info');
  if (!cursor || cursor.length > 2048 || /\s/.test(cursor)) throw new Error('SHOPLINE collection pagination is invalid.');
  return cursor;
}

async function request(session: AuthContext, path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(`${baseUrl(session)}${path}`, {
    ...init,
    headers: shoplineAdminHeaders(session.accessToken, init.headers),
  });
  if (!response.ok) throw new ShoplineAdminApiError(path.split('?')[0], response.status);
  return response;
}

export async function resolveCollectionMembers(session: AuthContext, collectionIds: string[]): Promise<string[]> {
  if (!Array.isArray(collectionIds) || !collectionIds.length || collectionIds.some((id) => !validId(id))) throw new Error('Valid SHOPLINE collection IDs are required.');
  const members = new Set<string>();
  for (const collectionId of new Set(collectionIds)) {
    let cursor: string | null = null;
    const seen = new Set<string>();
    for (let page = 0; page < 1000; page += 1) {
      const query = new URLSearchParams({ fields: 'id', limit: '50', ...(cursor ? { page_info: cursor } : {}) });
      const response = await request(session, `/products/collections/${encodeURIComponent(collectionId)}/products.json?${query}`);
      const body = await response.json() as { products?: Array<{ id?: string | number }> };
      if (!Array.isArray(body.products) || body.products.length > 50) throw new Error('SHOPLINE collection response is invalid.');
      for (const product of body.products) {
        const id = String(product.id ?? '');
        if (!validId(id)) throw new Error('SHOPLINE collection response has an invalid product ID.');
        members.add(id);
      }
      cursor = nextCursor(response.headers.get('link'));
      if (!cursor) break;
      if (seen.has(cursor) || page === 999) throw new Error('SHOPLINE collection pagination did not finish.');
      seen.add(cursor);
    }
  }
  return [...members].sort();
}

export async function fetchCollectionTitles(session: AuthContext, collectionIds: string[]): Promise<Record<string, string>> {
  if (!Array.isArray(collectionIds) || collectionIds.some((id) => !validId(id))) throw new Error('Valid SHOPLINE collection IDs are required.');
  const titles: Record<string, string> = {};
  for (const collectionId of [...new Set(collectionIds)]) {
    const response = await request(session, `/products/collections/${encodeURIComponent(collectionId)}.json?fields=id,title`);
    const body = await response.json() as { collection?: { id?: unknown; title?: unknown } };
    const id = String(body.collection?.id ?? '');
    if (id !== collectionId || typeof body.collection?.title !== 'string' || !body.collection.title.trim()) {
      throw new Error('SHOPLINE collection title response is invalid.');
    }
    titles[id] = body.collection.title;
  }
  return titles;
}

export async function assertPublishedCollectionScopeUnchanged(session: AuthContext, campaign: Campaign): Promise<string[]> {
  if (campaign.scope.kind !== 'collections') throw new CampaignConflictError('Campaign does not use a collection scope.');
  const current = await resolveCollectionMembers(session, campaign.scope.collectionIds ?? []);
  const published = [...new Set(campaign.scope.resolvedProductIds ?? [])].sort();
  if (!current.length || current.join('\u0000') !== published.join('\u0000')) {
    throw new CampaignConflictError('Collection membership changed; pause and republish after reviewing the product scope.');
  }
  return current;
}

export async function fetchShopCurrency(session: AuthContext): Promise<string> {
  const body = await (await request(session, '/currency/currencies.json')).json() as { currencies?: Array<{ currency?: unknown; enabled?: unknown }> };
  const currencies = (body.currencies ?? []).filter((item): item is { currency: string; enabled: true } => item?.enabled === true && typeof item.currency === 'string' && /^[A-Z]{3}$/.test(item.currency));
  if (currencies.length !== 1) throw new Error('SHOPLINE settlement currency cannot be determined uniquely.');
  return currencies[0].currency;
}

export async function fetchStoreId(session: AuthContext): Promise<string> {
  const body = await (await request(session, '/merchants/shop.json')).json() as { data?: { id?: unknown }; shop?: { id?: unknown } };
  const storeId = String(body.data?.id ?? body.shop?.id ?? '');
  if (!/^\d+$/.test(storeId)) throw new Error('A trusted numeric SHOPLINE store ID is required.');
  return storeId;
}

export async function fetchShopTimeZone(session: AuthContext): Promise<string> {
  const body = await (await request(session, '/merchants/shop.json')).json() as { data?: { iana_timezone?: unknown } };
  const timeZone = body.data?.iana_timezone;
  if (typeof timeZone !== 'string') throw new Error('SHOPLINE store time zone is unavailable.');
  try { new Intl.DateTimeFormat('en', { timeZone }); }
  catch { throw new Error('SHOPLINE store time zone is invalid.'); }
  return timeZone;
}

function normalizedIds(ids: string[]): string[] {
  if (!Array.isArray(ids) || ids.some((id) => !validId(id))) throw new Error('Invalid SHOPLINE collection IDs.');
  return [...new Set(ids)].sort();
}

type CollectionMetafield = { namespace?: unknown; key?: unknown; owner_id?: unknown; value?: unknown };
type MetafieldResult = { metafields?: CollectionMetafield[]; fail_metafields?: unknown };

async function metafieldRequest(session: AuthContext, path: string, init?: RequestInit): Promise<{ body: MetafieldResult; metadata: ShoplineRequestMetadata }> {
  const response = await request(session, path, init);
  let payload: unknown;
  try { payload = await response.json(); } catch { payload = null; }
  const metadata: ShoplineRequestMetadata = {
    upstreamStatus: response.status, upstreamRequestId: response.headers.get('Traceid'),
    upstreamPath: `/admin/openapi/${VERSION}${path.split('?')[0]}`,
    upstreamResponseBody: diagnosticResponseBody(payload),
  };
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new DiscountUncertainError('SHOPLINE collection metafield response is invalid.', metadata, 'COLLECTION_METAFIELD_RESPONSE_INVALID');
  return { body: payload as MetafieldResult, metadata };
}

export async function writeCollectionVariables(session: AuthContext, storeId: string, ids: string[]): Promise<void> {
  if (!/^\d+$/.test(storeId)) throw new Error('A trusted numeric SHOPLINE store ID is required.');
  const expected = normalizedIds(ids);
  const field = {
    namespace: COLLECTION_VARIABLE_NAMESPACE, key: COLLECTION_VARIABLE_KEY, owner_id: storeId, owner_resource: 'shop', type: 'json',
    value: JSON.stringify({ inCollections: expected }), description: 'Quantity Breaks collection membership variables',
  };
  const { body: written, metadata: writeMetadata } = await metafieldRequest(session, '/metafields_set.json', { method: 'POST', body: JSON.stringify({ metafields: [field] }) });
  const writeUnconfirmed = () => new DiscountUncertainError('SHOPLINE collection metafield write was not confirmed.', writeMetadata, 'COLLECTION_METAFIELD_WRITE_UNCONFIRMED');
  if ((written.fail_metafields !== undefined && (!Array.isArray(written.fail_metafields) || written.fail_metafields.length)) || !Array.isArray(written.metafields) || written.metafields.length !== 1) throw writeUnconfirmed();
  const accepted = written.metafields[0];
  if (!accepted || typeof accepted.namespace !== 'string' || !accepted.namespace || accepted.key !== field.key || String(accepted.owner_id) !== storeId) throw writeUnconfirmed();

  // SHOPLINE expands $app on write; list queries require the persisted namespace.
  const query = new URLSearchParams({ namespace: accepted.namespace, key: COLLECTION_VARIABLE_KEY, limit: '2' });
  const { body: result, metadata: readMetadata } = await metafieldRequest(session, `/metafields.json?${query}`);
  // Compare the server's write/read identities before accepting the saved variables.
  const fields = Array.isArray(result.metafields) ? result.metafields.filter((item) => item && item.namespace === accepted.namespace && item.key === field.key && String(item.owner_id) === storeId) : [];
  const readbackError = (message: string) => new DiscountUncertainError(message, readMetadata, 'COLLECTION_METAFIELD_READBACK_INVALID');
  if (fields.length !== 1 || typeof fields[0].value !== 'string') throw readbackError('SHOPLINE collection metafield readback is invalid.');
  let actual: unknown;
  try { actual = JSON.parse(fields[0].value); } catch { throw readbackError('SHOPLINE collection metafield value is invalid.'); }
  if (!actual || typeof actual !== 'object' || !Array.isArray((actual as { inCollections?: unknown }).inCollections) || JSON.stringify(normalizedIds((actual as { inCollections: string[] }).inCollections)) !== JSON.stringify(expected)) {
    throw readbackError('SHOPLINE collection metafield readback did not match the write.');
  }
  await ensureCollectionMetafieldDefinition(session, accepted.namespace);
}
