import fetch from 'node-fetch';
import { ADMIN_REST_VERSION } from '../admin-rest-version';
import { SHOPLINE_ACCEPT, SHOPLINE_USER_AGENT } from '../admin-request-headers';
import { DiscountRejectedError } from './discount-adapter';

type Session = { handle: string; accessToken: string };
type Fetcher = typeof fetch;
type Metafield = { namespace?: unknown; key?: unknown; owner_id?: unknown; value?: unknown };

export const COLLECTION_VARIABLE_NAMESPACE = '$app:quantity-breaks';
export const COLLECTION_VARIABLE_KEY = 'collection-membership';

function baseUrl(session: Session): string {
  if (!/^[A-Za-z0-9-]+$/.test(session.handle) || !session.accessToken) throw new Error('Authenticated SHOPLINE session is required.');
  return `https://${session.handle}.myshopline.com/admin/openapi/${ADMIN_REST_VERSION}`;
}

function storeIdOf(value: string): string {
  if (!/^[0-9]+$/.test(value)) throw new Error('A trusted numeric SHOPLINE store ID is required.');
  return value;
}

function normalizedIds(ids: string[]): string[] {
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(id))) throw new Error('Invalid SHOPLINE collection IDs.');
  return [...new Set(ids)].sort();
}

async function request(session: Session, path: string, method: 'GET' | 'POST', body: unknown, fetcher: Fetcher, requestId?: string): Promise<Record<string, unknown>> {
  const endpoint = path.split('?')[0];
  const startedAt = Date.now();
  if (requestId) console.info('SHOPLINE collection variables trace', { requestId, stage: 'upstream_request', method, endpoint, version: ADMIN_REST_VERSION });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    let response;
    try {
      response = await fetcher(`${baseUrl(session)}${path}`, {
        method,
        headers: { Authorization: `Bearer ${session.accessToken}`, 'Content-Type': 'application/json; charset=utf-8', Accept: SHOPLINE_ACCEPT, 'User-Agent': SHOPLINE_USER_AGENT },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
      });
    } catch (error) {
      if (requestId) console.error('SHOPLINE collection variables trace', { requestId, stage: 'upstream_network_error', endpoint, durationMs: Date.now() - startedAt, errorType: error instanceof Error ? error.name : 'Unknown' });
      throw error;
    }
    if (requestId) {
      const rawTrace = ['traceId', 'x-trace-id', 'x-shopline-trace-id'].map((key) => response.headers?.get(key)).find(Boolean);
      console.info('SHOPLINE collection variables trace', { requestId, stage: 'upstream_response', endpoint, status: response.status, durationMs: Date.now() - startedAt, traceId: rawTrace && /^[A-Za-z0-9._:-]{1,128}$/.test(rawTrace) ? rawTrace : null });
    }
    if (!response.ok) {
      const message = `SHOPLINE collection metafield request returned ${response.status}.`;
      if (method === 'POST' && response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) throw new DiscountRejectedError(message);
      throw new Error(message);
    }
    const data = await response.json() as unknown;
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('SHOPLINE collection metafield response is invalid.');
    return data as Record<string, unknown>;
  } finally { clearTimeout(timeout); }
}

export async function readCollectionVariables(session: Session, storeId: string, fetcher: Fetcher = fetch, requestId?: string): Promise<string[]> {
  storeIdOf(storeId);
  const params = new URLSearchParams({ namespace: COLLECTION_VARIABLE_NAMESPACE, key: COLLECTION_VARIABLE_KEY, limit: '2' });
  const body = await request(session, `/metafields.json?${params}`, 'GET', undefined, fetcher, requestId);
  if (!Array.isArray(body.metafields)) throw new Error('SHOPLINE collection metafield readback is invalid.');
  const fields = (body.metafields as Metafield[]).filter((field) => field?.namespace === COLLECTION_VARIABLE_NAMESPACE && field.key === COLLECTION_VARIABLE_KEY && String(field.owner_id) === storeId);
  if (fields.length > 1) throw new Error('SHOPLINE collection metafield readback contains duplicate fields.');
  if (!fields.length) return [];
  let value: unknown;
  try { value = typeof fields[0].value === 'string' ? JSON.parse(fields[0].value) : fields[0].value; }
  catch { throw new Error('SHOPLINE collection metafield value is invalid.'); }
  if (!value || typeof value !== 'object' || !('inCollections' in value)) throw new Error('SHOPLINE collection metafield value is invalid.');
  return normalizedIds((value as { inCollections: string[] }).inCollections);
}

export async function writeCollectionVariables(session: Session, storeId: string, ids: string[], fetcher: Fetcher = fetch, requestId?: string): Promise<void> {
  storeIdOf(storeId);
  const expected = normalizedIds(ids);
  const field = {
    namespace: COLLECTION_VARIABLE_NAMESPACE,
    key: COLLECTION_VARIABLE_KEY,
    owner_id: storeId,
    owner_resource: 'Shop',
    type: 'json',
    value: JSON.stringify({ inCollections: expected }),
    description: 'Quantity Breaks collection membership variables',
  };
  const result = await request(session, '/metafields_set.json', 'POST', { metafields: [field] }, fetcher, requestId);
  if (!Array.isArray(result.fail_metafields) || result.fail_metafields.length || !Array.isArray(result.metafields) || result.metafields.length !== 1) {
    throw new Error('SHOPLINE collection metafield write was not confirmed.');
  }
  const written = result.metafields[0] as Metafield;
  if (written.namespace !== field.namespace || written.key !== field.key || String(written.owner_id) !== storeId) throw new Error('SHOPLINE collection metafield write was not confirmed.');
  const actual = await readCollectionVariables(session, storeId, fetcher, requestId);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('SHOPLINE collection metafield readback did not match the write.');
}
