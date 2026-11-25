import fetch from 'node-fetch';
import { ADMIN_REST_VERSION } from '../admin-rest-version';
import { SHOPLINE_ACCEPT, SHOPLINE_USER_AGENT } from '../admin-request-headers';
import { CampaignValidationError } from './repository';

type Session = { handle: string; accessToken: string };
type Fetcher = typeof fetch;
type Kind = 'manual' | 'smart';
type Collection = { id: string; title: string; kind: Kind; imageUrl: string | null };
type Product = { id: string; title: string; imageUrl: string | null };
type RawItem = { id?: string | number; title?: string; image?: { src?: string | null } | null; collection_type?: string };

function baseUrl(session: Session): string {
  if (!/^[A-Za-z0-9-]+$/.test(session.handle) || !session.accessToken) throw new Error('Authenticated SHOPLINE session is required.');
  return `https://${session.handle}.myshopline.com/admin/openapi/${ADMIN_REST_VERSION}`;
}

function validId(id: string): boolean { return /^[A-Za-z0-9_-]{1,64}$/.test(id); }

function validatePaging(title: string, pageInfo?: string): void {
  if (title.length > 255 || (pageInfo && (pageInfo.length > 2048 || /\s/.test(pageInfo)))) throw new CampaignValidationError('Invalid collection search or page cursor.');
}

function nextPage(link: string | null, current?: string): string | null {
  if (!link) return null;
  const next = link.split(',').find((part) => /rel=["']?next["']?/i.test(part));
  if (!next) return null;
  const href = (next.match(/<([^>]+)>/)?.[1] ?? next.split(';')[0]).replace(/&amp;/gi, '&').replace(/\\$/, '');
  let cursor: string | null;
  try {
    cursor = new URL(href, 'https://pagination.local/').searchParams.get('page_info');
    if (!cursor && href.includes('page_info=')) cursor = new URLSearchParams(href.slice(href.indexOf('page_info='))).get('page_info');
  } catch { throw new Error('SHOPLINE collection pagination link is invalid.'); }
  if (!cursor || cursor === current) throw new Error('SHOPLINE collection pagination link is invalid.');
  return cursor;
}

async function request(session: Session, path: string, params: Record<string, string>, fetcher: Fetcher, requestId?: string) {
  const url = new URL(`${baseUrl(session)}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const endpoint = path.replace(/\/\d+\//, '/{id}/').replace(/\/\d+\.json$/, '/{id}.json');
  if (requestId) console.info('SHOPLINE collection catalog trace', { requestId, stage: 'upstream_request', method: 'GET', endpoint, version: ADMIN_REST_VERSION });
  const startedAt = Date.now();
  let response;
  try {
    response = await fetcher(url.toString(), { headers: { Authorization: `Bearer ${session.accessToken}`, 'Content-Type': 'application/json; charset=utf-8', Accept: SHOPLINE_ACCEPT, 'User-Agent': SHOPLINE_USER_AGENT } });
  } catch (error) {
    if (requestId) console.error('SHOPLINE collection catalog trace', { requestId, stage: 'upstream_network_error', endpoint, durationMs: Date.now() - startedAt, errorType: error instanceof Error ? error.name : 'Unknown' });
    throw error;
  }
  if (requestId) {
    const rawTrace = ['traceId', 'x-trace-id', 'x-shopline-trace-id'].map((name) => response.headers?.get(name)).find(Boolean);
    console.info('SHOPLINE collection catalog trace', { requestId, stage: 'upstream_response', endpoint, status: response.status, durationMs: Date.now() - startedAt, traceId: rawTrace && /^[A-Za-z0-9._:-]{1,128}$/.test(rawTrace) ? rawTrace : null });
  }
  if (!response.ok) throw new Error(`SHOPLINE collection request returned ${response.status}.`);
  return response;
}

function idOf(raw: RawItem): string {
  const id = String(raw?.id ?? '');
  if (!validId(id)) throw new Error('SHOPLINE collection response has an invalid ID.');
  return id;
}

export async function searchCampaignCollections(session: Session, kind: Kind, title = '', pageInfo?: string, fetcher: Fetcher = fetch, requestId?: string): Promise<{ collections: Collection[]; nextPageInfo: string | null }> {
  if (kind !== 'manual' && kind !== 'smart') throw new CampaignValidationError('Invalid collection kind.');
  validatePaging(title, pageInfo);
  const path = kind === 'manual' ? '/products/custom_collections.json' : '/products/smart_collections.json';
  const params: Record<string, string> = { fields: 'id,title,image', limit: '50' };
  if (title) params.title = title;
  if (pageInfo) params.page_info = pageInfo;
  const result = await request(session, path, params, fetcher, requestId);
  const body = await result.json() as Record<string, unknown>;
  const rows = body[kind === 'manual' ? 'custom_collections' : 'smart_collections'];
  if (!Array.isArray(rows) || rows.length > 50) throw new Error('SHOPLINE collection response is invalid or exceeds 50 items.');
  const unique = new Map<string, Collection>();
  for (const raw of rows as RawItem[]) {
    const id = idOf(raw);
    if (!unique.has(id)) unique.set(id, { id, title: typeof raw.title === 'string' ? raw.title : id, kind, imageUrl: typeof raw.image?.src === 'string' ? raw.image.src : null });
  }
  return { collections: [...unique.values()], nextPageInfo: nextPage(result.headers?.get('link') ?? null, pageInfo) };
}

export async function getCampaignCollection(session: Session, id: string, fetcher: Fetcher = fetch, requestId?: string): Promise<Collection> {
  if (!validId(id)) throw new CampaignValidationError('Invalid SHOPLINE collection ID.');
  const result = await request(session, `/products/collections/${encodeURIComponent(id)}.json`, { fields: 'id,title,collection_type,image' }, fetcher, requestId);
  const body = await result.json() as { collection?: RawItem };
  if (!body.collection || idOf(body.collection) !== id || !['custom', 'smart'].includes(body.collection.collection_type ?? '')) throw new Error('SHOPLINE collection detail is invalid.');
  return { id, title: typeof body.collection.title === 'string' ? body.collection.title : id, kind: body.collection.collection_type === 'custom' ? 'manual' : 'smart', imageUrl: typeof body.collection.image?.src === 'string' ? body.collection.image.src : null };
}

export async function searchCollectionProducts(session: Session, id: string, pageInfo?: string, fetcher: Fetcher = fetch, requestId?: string): Promise<{ products: Product[]; nextPageInfo: string | null }> {
  if (!validId(id)) throw new CampaignValidationError('Invalid SHOPLINE collection ID.');
  validatePaging('', pageInfo);
  const params: Record<string, string> = { fields: 'id,title,image', limit: '50' };
  if (pageInfo) params.page_info = pageInfo;
  const result = await request(session, `/products/collections/${encodeURIComponent(id)}/products.json`, params, fetcher, requestId);
  const body = await result.json() as { products?: RawItem[] };
  if (!Array.isArray(body.products) || body.products.length > 50) throw new Error('SHOPLINE collection products response is invalid or exceeds 50 items.');
  const unique = new Map<string, Product>();
  for (const raw of body.products) {
    const productId = idOf(raw);
    if (!unique.has(productId)) unique.set(productId, { id: productId, title: typeof raw.title === 'string' ? raw.title : productId, imageUrl: typeof raw.image?.src === 'string' ? raw.image.src : null });
  }
  return { products: [...unique.values()], nextPageInfo: nextPage(result.headers?.get('link') ?? null, pageInfo) };
}
