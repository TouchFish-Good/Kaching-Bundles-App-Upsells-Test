import type { AuthContext } from '../auth/session';
import { shoplineAdminHeaders } from './shopline-admin-request-headers';

const BASE_VERSION = 'v20260901';
const PRODUCT_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export type CampaignProduct = {
  id: string;
  title: string;
  imageUrl: string | null;
  optionNames?: string[];
  variants: Array<{
    id: string;
    title: string;
    price: number;
    compareAtPrice: number | null;
    options: Array<{ name: string; value: string }>;
    imageUrl: string | null;
    inventory: number;
    inventoryPolicy: 'deny' | 'continue';
    inventoryTracker?: boolean;
    available: boolean;
  }>;
};

export class CampaignProductLookupError extends Error {}

function imageUrl(value: unknown): string | null {
  return value && typeof value === 'object' && typeof (value as { src?: unknown }).src === 'string'
    ? (value as { src: string }).src
    : null;
}

function normalizeCampaignProduct(raw: unknown): CampaignProduct {
  if (!raw || typeof raw !== 'object') throw new CampaignProductLookupError('SHOPLINE product response is invalid.');
  const source = raw as { id?: unknown; title?: unknown; image?: unknown; options?: unknown; variants?: unknown };
  const id = String(source.id ?? '');
  if (!PRODUCT_ID_PATTERN.test(id)) throw new CampaignProductLookupError('SHOPLINE product response has an invalid ID.');
  const optionNames = Array.isArray(source.options)
    ? source.options.flatMap((option) => option && typeof option === 'object' && typeof (option as { name?: unknown }).name === 'string' ? [(option as { name: string }).name.trim()] : []).filter(Boolean)
    : [];
  const variants = Array.isArray(source.variants) ? source.variants.flatMap((rawVariant, index) => {
    if (!rawVariant || typeof rawVariant !== 'object') return [];
    const variant = rawVariant as Record<string, unknown>;
    const variantId = String(variant.id ?? `${id}-${index + 1}`);
    if (!PRODUCT_ID_PATTERN.test(variantId)) return [];
    const values = Array.isArray(variant.options) && variant.options.length
      ? variant.options.flatMap((option) => option && typeof option === 'object' && typeof (option as { value?: unknown }).value === 'string' ? [(option as { value: string }).value] : [])
      : [variant.option1, variant.option2, variant.option3, variant.option4, variant.option5].filter((value): value is string => typeof value === 'string' && Boolean(value));
    const inventory = Math.max(0, Number(variant.inventory_quantity ?? variant.inventory ?? 0));
    const inventoryTracker = typeof (variant.inventory_tracker ?? variant.inventoryTracker) === 'boolean' ? Boolean(variant.inventory_tracker ?? variant.inventoryTracker) : undefined;
    const inventoryPolicy: 'deny' | 'continue' = (variant.inventory_policy ?? variant.inventoryPolicy) === 'continue' ? 'continue' : 'deny';
    const available = inventoryTracker === false || inventoryPolicy === 'continue' || (variant.available !== false && inventory > 0);
    const price = Number(variant.price ?? 0);
    const compareValue = variant.compare_at_price ?? variant.compareAtPrice;
    const compareAtPrice = compareValue == null ? null : Number(compareValue);
    return [{
      id: variantId,
      title: typeof variant.title === 'string' ? variant.title : values.join(' / ') || variantId,
      price: Number.isFinite(price) ? price : 0,
      compareAtPrice: Number.isFinite(compareAtPrice) ? compareAtPrice : null,
      options: values.map((value, optionIndex) => ({ name: optionNames[optionIndex] ?? `Option ${optionIndex + 1}`, value })),
      imageUrl: imageUrl(variant.image), inventory, inventoryPolicy, ...(inventoryTracker === undefined ? {} : { inventoryTracker }), available,
    }];
  }) : [];
  return { id, title: typeof source.title === 'string' ? source.title : id, imageUrl: imageUrl(source.image), variants, ...(optionNames.length ? { optionNames } : {}) };
}

function validatedUniqueProductIds(ids: string[]): string[] {
  if (!Array.isArray(ids) || !ids.length || ids.length > 500 || ids.some((id) => !PRODUCT_ID_PATTERN.test(id))) {
    throw new CampaignProductLookupError('Product IDs must contain between 1 and 500 valid IDs.');
  }
  if (new Set(ids).size !== ids.length) throw new CampaignProductLookupError('Product IDs must be unique.');
  return ids;
}

export async function getCampaignProducts(
  session: AuthContext,
  ids: string[],
  fetcher: typeof fetch = fetch,
): Promise<{ products: CampaignProduct[]; missingIds: string[] }> {
  const requested = validatedUniqueProductIds(ids);
  const productsById = new Map<string, CampaignProduct>();
  for (let start = 0; start < requested.length; start += 50) {
    const batch = requested.slice(start, start + 50);
    const query = new URLSearchParams({ ids: batch.join(','), limit: String(batch.length), fields: 'id,title,image,options,variants' });
    const response = await fetcher(`https://${session.handle}.myshopline.com/admin/openapi/${BASE_VERSION}/products/products.json?${query}`, {
      headers: shoplineAdminHeaders(session.accessToken),
    });
    if (!response.ok) throw new CampaignProductLookupError(`SHOPLINE product lookup returned ${response.status}.`);
    const payload = await response.json() as { products?: unknown[] };
    if (!Array.isArray(payload.products) || payload.products.length > batch.length) throw new CampaignProductLookupError('SHOPLINE product response is invalid.');
    for (const raw of payload.products) {
      const product = normalizeCampaignProduct(raw);
      if (batch.includes(product.id)) productsById.set(product.id, product);
    }
  }
  return {
    products: requested.flatMap((id) => productsById.has(id) ? [productsById.get(id)!] : []),
    missingIds: requested.filter((id) => !productsById.has(id)),
  };
}

export class ShoplineAdminClient {
  constructor(private readonly session: AuthContext, private readonly fetcher: typeof fetch = fetch) {}

  private request(path: string, init: RequestInit = {}): Promise<Response> {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return this.fetcher(`https://${this.session.handle}.myshopline.com/admin/api/${BASE_VERSION}${normalizedPath}`, {
      ...init,
      headers: shoplineAdminHeaders(this.session.accessToken, init.headers),
    });
  }

  get(path: string): Promise<Response> { return this.request(path); }
  post(path: string, body: unknown): Promise<Response> { return this.request(path, { method: 'POST', body: JSON.stringify(body) }); }
  put(path: string, body: unknown): Promise<Response> { return this.request(path, { method: 'PUT', body: JSON.stringify(body) }); }
  delete(path: string): Promise<Response> { return this.request(path, { method: 'DELETE' }); }
}
