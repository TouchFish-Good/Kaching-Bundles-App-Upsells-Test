import type { AuthContext } from '../auth/session';
import type { CampaignScope } from '../domain/campaign';
import { shoplineAdminHeaders } from './shopline-admin-request-headers';

const VERSION = 'v20260901';
const validId = (value: string) => /^[A-Za-z0-9_-]{1,128}$/.test(value);

function validHandle(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 255;
}

function baseUrl(session: AuthContext): string {
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(session.handle) || !session.accessToken) throw new Error('Authenticated SHOPLINE session is required.');
  return `https://${session.handle}.myshopline.com/admin/openapi/${VERSION}`;
}

async function productHandles(session: AuthContext, ids: string[], fetcher: typeof fetch): Promise<Record<string, string>> {
  const remaining = new Set(ids);
  const result: Record<string, string> = {};
  for (let index = 0; index < ids.length; index += 50) {
    const batch = ids.slice(index, index + 50);
    const query = new URLSearchParams({ ids: batch.join(','), limit: String(batch.length), fields: 'id,handle' });
    const response = await fetcher(`${baseUrl(session)}/products/products.json?${query}`, { headers: shoplineAdminHeaders(session.accessToken) });
    if (!response.ok) throw new Error(`SHOPLINE product handle lookup returned ${response.status}.`);
    const body = await response.json() as { products?: Array<{ id?: unknown; handle?: unknown }> };
    if (!Array.isArray(body.products) || body.products.length > batch.length) throw new Error('SHOPLINE product handle response is invalid.');
    for (const product of body.products) {
      const id = String(product.id ?? '');
      if (!remaining.has(id) || !validHandle(product.handle)) throw new Error('SHOPLINE product handle response is invalid.');
      result[id] = product.handle;
      remaining.delete(id);
    }
  }
  if (remaining.size) throw new Error('One or more selected products no longer exist.');
  return result;
}

async function collectionHandles(session: AuthContext, ids: string[], fetcher: typeof fetch): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const id of ids) {
    const response = await fetcher(`${baseUrl(session)}/products/collections/${encodeURIComponent(id)}.json?fields=id,handle`, { headers: shoplineAdminHeaders(session.accessToken) });
    if (!response.ok) throw new Error(`SHOPLINE collection handle lookup returned ${response.status}.`);
    const body = await response.json() as { collection?: { id?: unknown; handle?: unknown } };
    if (String(body.collection?.id ?? '') !== id || !validHandle(body.collection?.handle)) throw new Error('SHOPLINE collection handle response is invalid.');
    result[id] = body.collection.handle;
  }
  return result;
}

export async function refreshScopeHandleSnapshots(session: AuthContext, scope: CampaignScope, fetcher: typeof fetch = fetch): Promise<CampaignScope> {
  if (scope.kind === 'products') {
    const ids = scope.productIds ?? [];
    if (!ids.length || ids.some((id) => !validId(id))) throw new Error('Valid product IDs are required.');
    return { ...scope, productHandles: await productHandles(session, ids, fetcher) };
  }
  if (scope.kind === 'collections') {
    const ids = scope.collectionIds ?? [];
    if (!ids.length || ids.some((id) => !validId(id))) throw new Error('Valid collection IDs are required.');
    return { ...scope, collectionHandles: await collectionHandles(session, ids, fetcher) };
  }
  return scope;
}
