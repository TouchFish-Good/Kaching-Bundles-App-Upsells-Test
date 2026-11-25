import fetch from 'node-fetch';
import { ADMIN_REST_VERSION } from '../service/admin-rest-version';
import { SHOPLINE_ACCEPT, SHOPLINE_USER_AGENT } from '../service/admin-request-headers';

export function buildAdminShopUrl(handle: string): string {
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(handle)) throw new Error('Invalid store handle');
  return `https://${handle}.myshopline.com/admin/openapi/${ADMIN_REST_VERSION}/merchants/shop.json`;
}

export function parseShopIdentity(body: unknown, _handle: string) {
  const data = body && typeof body === 'object' ? (body as { data?: unknown }).data : null;
  const shop = data && typeof data === 'object' ? data as { id?: unknown; name?: unknown } : null;
  const id = shop?.id;
  if ((typeof id !== 'string' && typeof id !== 'number') || !String(id).trim()) {
    throw new Error('SHOPLINE store ID unavailable');
  }
  return { storeId: String(id), displayName: typeof shop?.name === 'string' ? shop.name : '' };
}

export async function fetchShopIdentity(handle: string, accessToken: string) {
  const response = await fetch(buildAdminShopUrl(handle), {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: SHOPLINE_ACCEPT, 'User-Agent': SHOPLINE_USER_AGENT, 'Content-Type': 'application/json; charset=utf-8' },
  });
  if (!response.ok) throw new Error(`SHOPLINE shop lookup failed: ${response.status}`);
  return parseShopIdentity(await response.json(), handle);
}
