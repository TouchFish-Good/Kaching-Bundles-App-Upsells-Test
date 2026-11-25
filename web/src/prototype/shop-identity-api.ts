export type ShopIdentity = { storeId: string };
type Fetcher = typeof fetch;

export class ShopIdentityError extends Error {
  constructor(readonly code: 'AUTH_REQUIRED' | 'SHOP_UNAVAILABLE', readonly status?: number, readonly traceId?: string) { super(code); }
}

export async function readShopIdentity(fetcher: Fetcher = fetch, signal?: AbortSignal): Promise<ShopIdentity> {
  const response = await fetcher('/api/quantity-breaks/shop', { credentials: 'same-origin', signal });
  const traceId = response.headers?.get('X-Trace-Id') ?? undefined;
  if (!response.ok) throw new ShopIdentityError(response.status === 401 ? 'AUTH_REQUIRED' : 'SHOP_UNAVAILABLE', response.status, traceId);
  const body = await response.json() as { shop?: ShopIdentity };
  if (!body.shop?.storeId || typeof body.shop.storeId !== 'string') throw new ShopIdentityError('SHOP_UNAVAILABLE', 502, traceId);
  return body.shop;
}
