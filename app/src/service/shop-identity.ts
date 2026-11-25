import fetch from 'node-fetch';
import { ADMIN_REST_VERSION } from './admin-rest-version';
import { SHOPLINE_ACCEPT, SHOPLINE_USER_AGENT } from './admin-request-headers';

export type ShopIdentity = { storeId: string; displayName: string; logoUrl: string | null };

export function parseShopIdentity(body: unknown): ShopIdentity {
  const data = body && typeof body === 'object' ? (body as { data?: unknown }).data : null;
  const shop = data && typeof data === 'object' ? data as { id?: unknown; name?: unknown; standard_logo?: unknown } : null;
  const storeId = typeof shop?.id === 'string' || typeof shop?.id === 'number' ? String(shop.id).trim() : '';
  const displayName = typeof shop?.name === 'string' ? shop.name.trim() : '';
  if (!storeId) throw new Error('SHOPLINE store ID unavailable');
  if (!displayName) throw new Error('SHOPLINE store name unavailable');
  let logoUrl: string | null = null;
  if (typeof shop?.standard_logo === 'string') {
    try {
      const url = new URL(shop.standard_logo);
      if (url.protocol === 'https:' && !url.username && !url.password) logoUrl = url.href;
    } catch { /* A missing or invalid logo uses the neutral shop icon. */ }
  }
  return { storeId, displayName, logoUrl };
}

export async function fetchShopIdentity(handle: string, accessToken: string, fetcher: typeof fetch = fetch): Promise<ShopIdentity> {
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(handle) || !accessToken) throw new Error('Authenticated SHOPLINE session is required');
  if (process.env.NODE_ENV === 'development') return { storeId: handle, displayName: handle, logoUrl: null };
  const response = await fetcher(`https://${handle}.myshopline.com/admin/openapi/${ADMIN_REST_VERSION}/merchants/shop.json`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: SHOPLINE_ACCEPT, 'User-Agent': SHOPLINE_USER_AGENT, 'Content-Type': 'application/json; charset=utf-8' },
  });
  if (!response.ok) throw new Error(`SHOPLINE shop lookup failed: ${response.status}`);
  return parseShopIdentity(await response.json());
}
