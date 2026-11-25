import fetch from 'node-fetch';
import { ADMIN_REST_VERSION } from '../admin-rest-version';
import { SHOPLINE_ACCEPT, SHOPLINE_USER_AGENT } from '../admin-request-headers';
import { CampaignValidationError } from './repository';

type Session = { handle: string; accessToken: string };
type Fetcher = typeof fetch;
export type ProductVariant = { id: string; title: string; price: number; compareAtPrice: number | null; options: Array<{ name: string; value: string }>; imageUrl: string | null; inventory: number; inventoryPolicy: 'deny' | 'continue'; inventoryTracker?: boolean; available: boolean };
export type Product = { id: string; title: string; imageUrl: string | null; variants: ProductVariant[]; optionNames?: string[] };
type RawVariant = { id?: string | number; title?: string; price?: string | number; compare_at_price?: string | number | null; compareAtPrice?: string | number | null; inventory_quantity?: number; inventory?: number; inventory_tracker?: boolean; inventoryTracker?: boolean; inventory_policy?: string; inventoryPolicy?: string; available?: boolean; image?: { src?: string | null } | null; option1?: string | null; option2?: string | null; option3?: string | null; options?: Array<{ name?: string; value?: string }> };
type RawProduct = { id?: string | number; title?: string; image?: { src?: string | null } | null; options?: Array<{ name?: string; values?: string[]; option_values?: Array<{ value?: string }> }>; variants?: RawVariant[] };
type PaginationReason = 'invalid_format' | 'missing_cursor' | 'repeated_cursor';

class ProductPaginationError extends Error {
  constructor(readonly reason: PaginationReason, readonly details?: { queryKeys: string[]; hasPageInfoText: boolean; hasAngle: boolean; hasBackslash: boolean }) { super('SHOPLINE product pagination link is invalid.'); }
}

function baseUrl(session: Session): string {
  if (!/^[a-zA-Z0-9-]+$/.test(session.handle) || !session.accessToken) throw new Error('Authenticated SHOPLINE session is required.');
  return `https://${session.handle}.myshopline.com/admin/openapi/${ADMIN_REST_VERSION}`;
}

function headers(session: Session) {
  return { Authorization: `Bearer ${session.accessToken}`, 'Content-Type': 'application/json; charset=utf-8', Accept: SHOPLINE_ACCEPT, 'User-Agent': SHOPLINE_USER_AGENT };
}

async function productRequest(session: Session, url: string, endpoint: string, fetcher: Fetcher, requestId?: string) {
  if (requestId) console.info('SHOPLINE product catalog trace', { requestId, stage: 'upstream_request', method: 'GET', endpoint, version: ADMIN_REST_VERSION });
  const startedAt = Date.now();
  let response;
  try { response = await fetcher(url, { headers: headers(session) }); }
  catch (error) {
    if (requestId) console.error('SHOPLINE product catalog trace', { requestId, stage: 'upstream_network_error', endpoint, durationMs: Date.now() - startedAt, errorType: error instanceof Error ? error.name : 'Unknown' });
    throw error;
  }
  if (requestId) {
    const rawTraceId = ['traceId', 'x-trace-id', 'x-shopline-trace-id'].map((name) => response.headers?.get(name)).find(Boolean);
    const traceId = rawTraceId && /^[A-Za-z0-9._:-]{1,128}$/.test(rawTraceId) ? rawTraceId : null;
    console.info('SHOPLINE product catalog trace', { requestId, stage: 'upstream_response', endpoint, status: response.status, durationMs: Date.now() - startedAt, traceId });
  }
  return response;
}

function numericPrice(value: string | number | null | undefined): number {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function product(raw: RawProduct): Product {
  const id = String(raw?.id ?? '');
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new Error('SHOPLINE product response has an invalid ID.');
  const optionNames = Array.isArray(raw.options)
    ? raw.options.map((option) => typeof option?.name === 'string' ? option.name.trim() : '').filter(Boolean)
    : [];
  const variants = Array.isArray(raw.variants) ? raw.variants.flatMap((item, index) => {
    const variantId = String(item.id ?? `${id}-${index + 1}`);
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(variantId)) return [];
    const rawOptions = Array.isArray(item.options) && item.options.length
      ? item.options.flatMap((option) => option?.value ? [option.value] : [])
      : [item.option1, item.option2, item.option3].filter((value): value is string => Boolean(value));
    const options = rawOptions.map((value, optionIndex) => ({ name: optionNames[optionIndex] ?? item.options?.[optionIndex]?.name ?? `Option ${optionIndex + 1}`, value }));
    const inventory = Math.max(0, Number(item.inventory_quantity ?? item.inventory ?? 0));
    const rawInventoryTracker = item.inventory_tracker ?? item.inventoryTracker;
    const inventoryTracker = typeof rawInventoryTracker === 'boolean' ? rawInventoryTracker : undefined;
    const inventoryPolicy: ProductVariant['inventoryPolicy'] = (item.inventory_policy ?? item.inventoryPolicy) === 'continue' ? 'continue' : 'deny';
    return [{ id: variantId, title: typeof item.title === 'string' ? item.title : options.map((option) => option.value).join(' / ') || variantId, price: numericPrice(item.price), compareAtPrice: item.compare_at_price == null && item.compareAtPrice == null ? null : numericPrice(item.compare_at_price ?? item.compareAtPrice), options, imageUrl: typeof item.image?.src === 'string' ? item.image.src : null, inventory, inventoryPolicy, ...(inventoryTracker === undefined ? {} : { inventoryTracker }), available: inventoryTracker === false || inventoryPolicy === 'continue' || (item.available !== false && inventory > 0) }];
  }) : [];
  return { id, title: typeof raw.title === 'string' ? raw.title : id, imageUrl: typeof raw.image?.src === 'string' ? raw.image.src : null, variants, ...(optionNames.length ? { optionNames } : {}) };
}

function nextPage(link: string | null, base: string, current?: string): string | null {
  if (!link) return null;
  const next = link.split(',').find((part) => /rel=["']?next["']?/i.test(part));
  if (!next) return null;
  const linkedUrl = next.match(/<([^>]+)>\s*;\s*rel=['"]?next['"]?/i)?.[1];
  const href = (linkedUrl ?? next.split(';')[0].trim()).replace(/\\$/, '').replace(/&amp;/gi, '&');
  if (!href) throw new ProductPaginationError('invalid_format');
  const expected = new URL(`${base}/products/products.json`);
  let url: URL;
  try { url = new URL(href, expected); }
  catch { throw new ProductPaginationError('invalid_format'); }
  let pageInfo = url.searchParams.get('page_info');
  if (!pageInfo) {
    const marker = href.indexOf('page_info=');
    if (marker >= 0) {
      const params = new URLSearchParams(href.slice(marker).split(/[;,\s>'"]/)[0]);
      pageInfo = params.get('page_info');
    }
  }
  if (!pageInfo) {
    const knownKeys = new Set(['page_info', 'amp;page_info', 'pageInfo', 'limit', 'fields', 'title']);
    const queryKeys = [...new Set([...url.searchParams.keys()].slice(0, 10).map((key) => knownKeys.has(key) ? key : 'other'))];
    throw new ProductPaginationError('missing_cursor', { queryKeys, hasPageInfoText: /page_info/i.test(next), hasAngle: next.includes('<'), hasBackslash: next.includes('\\') });
  }
  if (pageInfo === current) throw new ProductPaginationError('repeated_cursor');
  return pageInfo;
}

export async function searchCampaignProducts(session: Session, title = '', pageInfo?: string, fetcher: Fetcher = fetch, requestId?: string, limit = 50): Promise<{ products: Product[]; nextPageInfo: string | null }> {
  if (title.length > 255 || !Number.isInteger(limit) || limit < 1 || limit > 50 || (pageInfo && (pageInfo.length > 2048 || /\s/.test(pageInfo)))) throw new CampaignValidationError('Invalid product search or page cursor.');
  const base = baseUrl(session);
  const url = new URL(`${base}/products/products.json`);
  url.searchParams.set('fields', 'id,title,image,options,variants');
  url.searchParams.set('limit', String(limit));
  if (title) url.searchParams.set('title', title);
  if (pageInfo) url.searchParams.set('page_info', pageInfo);
  const response = await productRequest(session, url.toString(), '/products/products.json', fetcher, requestId);
  if (!response.ok) throw new Error(`SHOPLINE product search returned ${response.status}.`);
  try {
    const body = await response.json() as { products?: RawProduct[] };
    if (!Array.isArray(body.products)) throw new Error('SHOPLINE product search response is invalid.');
    const unique = new Map<string, Product>();
    for (const raw of body.products) {
      const item = product(raw);
      if (!unique.has(item.id)) unique.set(item.id, item);
    }
    return { products: [...unique.values()], nextPageInfo: nextPage(response.headers?.get('link') ?? null, base, pageInfo) };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const reason = error instanceof SyntaxError ? 'invalid_json'
      : message === 'SHOPLINE product search response is invalid.' ? 'missing_products'
      : message === 'SHOPLINE product response has an invalid ID.' ? 'invalid_product_id'
      : message === 'SHOPLINE product pagination link is invalid.' ? 'invalid_pagination'
      : 'unexpected';
    if (requestId) console.error('SHOPLINE product catalog trace', { requestId, stage: 'invalid_response', endpoint: '/products/products.json', reason, ...(error instanceof ProductPaginationError ? { paginationReason: error.reason, ...(error.details ? { paginationQueryKeys: error.details.queryKeys, paginationHasPageInfoText: error.details.hasPageInfoText, paginationHasAngle: error.details.hasAngle, paginationHasBackslash: error.details.hasBackslash } : {}) } : {}) });
    throw error;
  }
}

export async function verifyCampaignProducts(session: Session, productIds: string[], fetcher: Fetcher = fetch): Promise<void> {
  if (!productIds.length || new Set(productIds).size !== productIds.length || productIds.some((id) => !/^[A-Za-z0-9_-]{1,64}$/.test(id))) {
    throw new CampaignValidationError('Select valid, unique SHOPLINE products before publishing.');
  }
  const result = await getCampaignProducts(session, productIds, fetcher);
  if (result.missingIds.length) throw new CampaignValidationError(`Selected SHOPLINE products are unavailable: ${result.missingIds.join(', ')}.`);
}

/**
 * Resolve selected products in documented SHOPLINE batches. The API accepts at
 * most 50 ids per request, so callers can safely pass the complete selection.
 * The returned array follows the caller's order and missing ids are explicit.
 */
export async function getCampaignProducts(session: Session, ids: string[], fetcher: Fetcher = fetch, requestId?: string): Promise<{ products: Product[]; missingIds: string[] }> {
  const unique = [...new Set(ids)];
  if (!unique.length || unique.length > 500 || unique.some((id) => !/^[A-Za-z0-9_-]{1,64}$/.test(id))) {
    throw new CampaignValidationError('Select valid, unique SHOPLINE products.');
  }
  const found = new Map<string, Product>();
  const base = baseUrl(session);
  for (let offset = 0; offset < unique.length; offset += 50) {
    const batch = unique.slice(offset, offset + 50);
    const url = new URL(`${base}/products/products.json`);
    url.searchParams.set('ids', batch.join(','));
    url.searchParams.set('limit', String(batch.length));
    url.searchParams.set('fields', 'id,title,image,options,variants');
    const response = await productRequest(session, url.toString(), '/products/products.json?ids=', fetcher, requestId);
    if (!response.ok) throw new Error(`SHOPLINE product lookup returned ${response.status}.`);
    const body = await response.json() as { products?: RawProduct[] };
    if (!Array.isArray(body.products)) throw new Error('SHOPLINE product lookup response is invalid.');
    for (const raw of body.products) {
      const item = product(raw);
      if (batch.includes(item.id)) found.set(item.id, item);
    }
  }
  return { products: unique.flatMap((id) => found.has(id) ? [found.get(id)!] : []), missingIds: unique.filter((id) => !found.has(id)) };
}

export async function getCampaignProduct(session: Session, id: string, fetcher: Fetcher = fetch, requestId?: string): Promise<Product> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new CampaignValidationError('Invalid SHOPLINE product ID.');
  const response = await productRequest(session, `${baseUrl(session)}/products/${encodeURIComponent(id)}.json`, '/products/{id}.json', fetcher, requestId);
  if (response.status === 404) throw new CampaignValidationError(`Selected SHOPLINE product ${id} is unavailable.`);
  if (!response.ok) throw new Error(`SHOPLINE product lookup returned ${response.status}.`);
  const body = await response.json() as { product?: RawProduct };
  if (!body.product || String(body.product.id ?? '') !== id) throw new CampaignValidationError(`Selected SHOPLINE product ${id} is unavailable.`);
  return product(body.product);
}
