import type { Context, Hono } from 'hono';

import { requireShoplineSession, ShoplineTokenRefreshError, withFreshAccessToken, type AuthContext } from '../auth/session';
import { reauthorizationRequired } from '../auth/reauthorization';
import type { Env } from '../env';
import { fetchShopCurrency, fetchStoreId, fetchShopTimeZone, ShoplineAdminApiError } from '../services/collection-publication';
import { getCampaignProducts } from '../services/shopline-admin';
import { normalizeStorefrontLocale } from '../services/locales';
import { shoplineAdminHeaders } from '../services/shopline-admin-request-headers';
import { requestMarketPrice } from '../services/market-price-request';
import { D1SessionStore } from '../db/sessions';

type App = Hono<{ Bindings: Env; Variables: { auth: AuthContext } }>;
const VERSION = 'v20260901';

type PageCursorResult = {
  cursor: string | null;
  reason: 'missing_link' | 'missing_next_relation' | 'missing_next_url' | 'invalid_url' | 'missing_page_info' | 'invalid_page_info' | null;
  nextSegmentFound: boolean;
  linkedUrlFound: boolean;
};

function linkEncoding(link: string | null): 'standard_angle_brackets' | 'backslash_escaped_angles' | 'html_escaped_angles' | 'html_line_break_prefix' | 'other' | null {
  if (!link) return null;
  if (/&(?:lt|gt);/i.test(link)) return 'html_escaped_angles';
  if (/\\[<>]/.test(link)) return 'backslash_escaped_angles';
  if (/<br\b/i.test(link)) return 'html_line_break_prefix';
  if (/<[^>]+>/.test(link)) return 'standard_angle_brackets';
  return 'other';
}

function parsePageCursor(link: string | null): PageCursorResult {
  if (!link) return { cursor: null, reason: 'missing_link', nextSegmentFound: false, linkedUrlFound: false };
  const nextRelationPresent = /rel\s*=\s*["']?next["']?/i.test(link);
  if (!nextRelationPresent) return { cursor: null, reason: 'missing_next_relation', nextSegmentFound: false, linkedUrlFound: false };
  const linkedUrl = /<([^>]+)>[^<]*?rel\s*=\s*["']?next["']?/i.exec(link)?.[1] ?? null;
  if (!linkedUrl) return { cursor: null, reason: 'missing_next_url', nextSegmentFound: true, linkedUrlFound: false };
  const href = linkedUrl
    .replace(/^\\+/, '')
    .replace(/\\+$/, '')
    .replace(/&amp;/gi, '&');
  if (!href) return { cursor: null, reason: 'missing_next_url', nextSegmentFound: true, linkedUrlFound: true };
  try {
    const cursor = new URL(href, 'https://pagination.invalid').searchParams.get('page_info');
    if (!cursor) return { cursor: null, reason: 'missing_page_info', nextSegmentFound: true, linkedUrlFound: true };
    if (/\s/.test(cursor)) return { cursor: null, reason: 'invalid_page_info', nextSegmentFound: true, linkedUrlFound: true };
    return { cursor, reason: null, nextSegmentFound: true, linkedUrlFound: true };
  } catch {
    return { cursor: null, reason: 'invalid_url', nextSegmentFound: true, linkedUrlFound: true };
  }
}

function pageCursor(link: string | null): string | null { return parsePageCursor(link).cursor; }

async function authenticated(c: Context<{ Bindings: Env; Variables: { auth: AuthContext } }>): Promise<AuthContext | Response> {
  const session = await requireShoplineSession(c.req.raw, c.env);
  if (!(session instanceof Response)) c.set('auth', session);
  return session;
}

async function admin(session: AuthContext, path: string): Promise<Response> {
  const response = await fetch(`https://${session.handle}.myshopline.com/admin/openapi/${VERSION}${path}`, { headers: shoplineAdminHeaders(session.accessToken) });
  if (!response.ok) throw new Error(`SHOPLINE Admin API ${path.split('?')[0]} returned ${response.status}.`);
  return response;
}

function error(error: unknown): Response {
  return Response.json({ error: error instanceof Error ? error.message : 'SHOPLINE catalog request failed.' }, { status: 502 });
}

function needsReauthorization(failure: unknown): boolean {
  return (failure instanceof ShoplineAdminApiError || failure instanceof ShoplineTokenRefreshError)
    && (failure.status === 401 || failure.status === 403);
}

export async function fetchStoreIdWithTokenRecovery(session: AuthContext, env: Env): Promise<string> {
  try {
    return await fetchStoreId(session);
  } catch (failure) {
    if (!(failure instanceof ShoplineAdminApiError) || failure.status !== 401) throw failure;
  }
  return fetchStoreId(await withFreshAccessToken(session.handle, env, { force: true }));
}

async function fetchShopTimeZoneWithTokenRecovery(session: AuthContext, env: Env): Promise<string> {
  try { return await fetchShopTimeZone(session); }
  catch (failure) {
    if (!(failure instanceof ShoplineAdminApiError) || failure.status !== 401) throw failure;
  }
  return fetchShopTimeZone(await withFreshAccessToken(session.handle, env, { force: true }));
}

function validId(value: string): boolean { return /^[A-Za-z0-9_-]{1,128}$/.test(value); }

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function countryCodes(value: string | undefined): string[] | null {
  if (!value) return null;
  const codes = value.split(',');
  if (!codes.length || codes.length > 100 || codes.some((code) => !/^[A-Z]{2}$/.test(code)) || new Set(codes).size !== codes.length) return null;
  return codes;
}

function chunks<T>(values: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));
}

function imageUrl(value: unknown): string | null {
  return value && typeof value === 'object' && typeof (value as { src?: unknown }).src === 'string'
    ? (value as { src: string }).src
    : null;
}

function product(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') throw new Error('SHOPLINE product response is invalid.');
  const source = raw as { id?: unknown; title?: unknown; image?: unknown; options?: unknown; variants?: unknown };
  const id = String(source.id ?? '');
  if (!validId(id)) throw new Error('SHOPLINE product response has an invalid ID.');
  const optionNames = Array.isArray(source.options)
    ? source.options.flatMap((option) => option && typeof option === 'object' && typeof (option as { name?: unknown }).name === 'string' ? [(option as { name: string }).name.trim()] : []).filter(Boolean)
    : [];
  const variants = Array.isArray(source.variants) ? source.variants.flatMap((rawVariant, index) => {
    if (!rawVariant || typeof rawVariant !== 'object') return [];
    const variant = rawVariant as Record<string, unknown>;
    const variantId = String(variant.id ?? `${id}-${index + 1}`);
    if (!validId(variantId)) return [];
    const values = Array.isArray(variant.options) && variant.options.length
      ? variant.options.flatMap((option) => option && typeof option === 'object' && typeof (option as { value?: unknown }).value === 'string' ? [(option as { value: string }).value] : [])
      : [variant.option1, variant.option2, variant.option3, variant.option4, variant.option5].filter((value): value is string => typeof value === 'string' && Boolean(value));
    const inventory = Math.max(0, Number(variant.inventory_quantity ?? variant.inventory ?? 0));
    const inventoryTracker = typeof (variant.inventory_tracker ?? variant.inventoryTracker) === 'boolean' ? Boolean(variant.inventory_tracker ?? variant.inventoryTracker) : undefined;
    const inventoryPolicy = (variant.inventory_policy ?? variant.inventoryPolicy) === 'continue' ? 'continue' : 'deny';
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

function collection(raw: unknown, fallbackKind?: 'manual' | 'smart'): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') throw new Error('SHOPLINE collection response is invalid.');
  const source = raw as { id?: unknown; title?: unknown; collection_type?: unknown; image?: unknown };
  const id = String(source.id ?? '');
  if (!validId(id)) throw new Error('SHOPLINE collection response has an invalid ID.');
  const kind = fallbackKind ?? (source.collection_type === 'custom' ? 'manual' : source.collection_type === 'smart' ? 'smart' : null);
  if (!kind) throw new Error('SHOPLINE collection detail is invalid.');
  return { id, title: typeof source.title === 'string' ? source.title : id, kind, imageUrl: imageUrl(source.image) };
}

function collectionProduct(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') throw new Error('SHOPLINE collection response is invalid.');
  const source = raw as { id?: unknown; title?: unknown; image?: unknown };
  const id = String(source.id ?? '');
  if (!validId(id)) throw new Error('SHOPLINE collection response has an invalid ID.');
  return { id, title: typeof source.title === 'string' ? source.title : id, imageUrl: imageUrl(source.image) };
}

function market(raw: unknown): Record<string, unknown> {
  if (!record(raw)) throw new Error('SHOPLINE markets response is invalid.');
  const source = raw;
  const id = String(source.market_id ?? source.id ?? '');
  const name = source.market_name ?? source.name;
  const currencySettings = record(source.currency_settings) ? source.currency_settings : null;
  const baseCurrencyConfig = currencySettings && record(currencySettings.base_currency) ? currencySettings.base_currency : null;
  const baseCurrency = baseCurrencyConfig?.currency_code ?? source.currency_code;
  const rawExchangeRate = baseCurrencyConfig?.exchange_rate;
  const parsedExchangeRate = typeof rawExchangeRate === 'number' || typeof rawExchangeRate === 'string' ? Number(rawExchangeRate) : NaN;
  const exchangeRate = Number.isFinite(parsedExchangeRate) && parsedExchangeRate > 0 ? parsedExchangeRate : null;
  const autoExchangeRate = baseCurrencyConfig?.auto_exchange_rate !== false;
  const regions = Array.isArray(source.regions) ? source.regions.flatMap((region) => {
    if (!record(region) || typeof region.code !== 'string' || !/^[A-Z]{2}$/.test(region.code)) return [];
    const currency = record(region.currency) && typeof region.currency.currency_code === 'string' && /^[A-Z]{3}$/.test(region.currency.currency_code)
      ? region.currency.currency_code
      : null;
    return [{ code: region.code, currency }];
  }) : [];
  const uniqueRegions = regions.filter((region, index) => regions.findIndex((candidate) => candidate.code === region.code) === index);
  const regionCurrencyCodes = Array.isArray(source.regions)
    ? [...new Set(uniqueRegions.flatMap((region) => region.currency ? [region.currency] : []))]
    : Array.isArray(source.region_currency_codes) ? [...new Set(source.region_currency_codes.filter((value): value is string => typeof value === 'string'))] : [];
  if (!validId(id) || typeof name !== 'string' || !/^[A-Z]{3}$/.test(typeof baseCurrency === 'string' ? baseCurrency : '')) throw new Error('SHOPLINE markets response is invalid.');
  const specifiedAmountSupported = source.specified_amount_supported === true || (regionCurrencyCodes.length === 1 && regionCurrencyCodes[0] === baseCurrency);
  const webPresence = record(source.web_presence) ? source.web_presence : {};
  const defaultLocale = typeof webPresence.default_locale === 'string' && webPresence.default_locale.trim() ? webPresence.default_locale.trim() : null;
  return { id, name, enabled: source.enabled === true, currencyCode: specifiedAmountSupported ? baseCurrency : null, regionCurrencyCodes, specifiedAmountSupported, primary: source.primary === true, defaultLocale, regionCodes: uniqueRegions.map((region) => region.code), autoExchangeRate, exchangeRate };
}

export function registerCatalogRoutes(app: App): void {
  app.get('/api/quantity-breaks/variants/:id/market-prices', async (c) => {
    const session = await authenticated(c);
    if (session instanceof Response) return session;
    const variantId = c.req.param('id');
    const requestedCodes = countryCodes(c.req.query('country_codes'));
    if (!validId(variantId) || !requestedCodes) return c.json({ error: 'Invalid market price parameters.' }, 400);
    try {
      const pricesByCountry = new Map<string, { countryCode: string; amountMinor: number; currencyCode: string }>();
      for (const countryBatch of chunks(requestedCodes, 10)) {
        const response = await requestMarketPrice(session, `/markets/${encodeURIComponent(variantId)}/price.json?country_codes=${encodeURIComponent(countryBatch.join(','))}`, c.req.raw.signal);
        if (response.status === 429) {
          await response.body?.cancel();
          return c.json({ error: 'SHOPLINE market prices are temporarily rate limited.' }, 429, { 'Retry-After': response.headers.get('Retry-After') ?? '1' });
        }
        if (!response.ok) throw new Error(`SHOPLINE Admin API /markets/${variantId}/price.json returned ${response.status}.`);
        const payload = await response.json() as { market_prices?: unknown };
        if (!Array.isArray(payload.market_prices)) throw new Error('SHOPLINE market price response is invalid.');
        for (const rawPrice of payload.market_prices) {
          if (!record(rawPrice) || typeof rawPrice.country_code !== 'string' || !countryBatch.includes(rawPrice.country_code) || pricesByCountry.has(rawPrice.country_code) || !record(rawPrice.market_price)) {
            throw new Error('SHOPLINE market price response is invalid.');
          }
          const amount = rawPrice.market_price.amount;
          const currency = rawPrice.market_price.currency_code;
          if (typeof amount !== 'string' || !/^\d+$/.test(amount) || typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) {
            throw new Error('SHOPLINE market price response is invalid.');
          }
          const amountMinor = Number(amount);
          if (!Number.isSafeInteger(amountMinor)) throw new Error('SHOPLINE market price response is invalid.');
          pricesByCountry.set(rawPrice.country_code, { countryCode: rawPrice.country_code, amountMinor, currencyCode: currency });
        }
      }
      return c.json({ prices: requestedCodes.flatMap((countryCode) => pricesByCountry.get(countryCode) ?? []) });
    } catch (failure) { return error(failure); }
  });

  app.get('/api/quantity-breaks/products', async (c) => {
    const session = await authenticated(c);
    if (session instanceof Response) return session;
    const id = c.req.query('id');
    const idsParam = c.req.query('ids');
    const title = c.req.query('title') ?? '';
    const cursor = c.req.query('page_info');
    const limit = Number(c.req.query('limit') ?? '50');
    if ((id && !/^[A-Za-z0-9_-]{1,128}$/.test(id)) || title.length > 255 || (cursor && (cursor.length > 2048 || /\s/.test(cursor))) || !Number.isInteger(limit) || limit < 1 || limit > 50) return c.json({ error: 'Invalid product search parameters.' }, 400);
    if (idsParam !== undefined) {
      const ids = idsParam.split(',');
      if (id || title || cursor || !ids.length || ids.length > 500 || ids.some((value) => !validId(value)) || new Set(ids).size !== ids.length) {
        return c.json({ error: 'Invalid product lookup parameters.' }, 400);
      }
      try { return c.json(await getCampaignProducts(session, ids)); }
      catch (failure) { return error(failure); }
    }
    try {
      if (id) {
        const payload = await (await admin(session, `/products/products/${encodeURIComponent(id)}.json?fields=id,title,image,options,variants`)).json() as { product?: unknown };
        return c.json({ product: product(payload.product) });
      }
      const query = new URLSearchParams({ fields: 'id,title,image,options,variants', limit: String(limit), ...(title ? { title } : {}), ...(cursor ? { page_info: cursor } : {}) });
      const response = await admin(session, `/products/products.json?${query}`);
      const payload = await response.json() as { products?: unknown[] };
      if (!Array.isArray(payload.products) || payload.products.length > limit) throw new Error('SHOPLINE product response is invalid.');
      const link = response.headers.get('link');
      const pageCursorResult = parsePageCursor(link);
      const nextPageInfo = pageCursorResult.cursor;
      if (payload.products.length === limit && !nextPageInfo) {
        console.warn(JSON.stringify({
          event: 'catalog_pagination_cursor_missing',
          handle: session.handle,
          productCount: payload.products.length,
          limit,
          requestCursorPresent: Boolean(cursor),
          linkPresent: link !== null,
          linkLength: link?.length ?? 0,
          linkHasPageInfo: Boolean(link && /page_info/i.test(link)),
          nextRelationPresent: Boolean(link && /rel\s*=\s*["']?next["']?/i.test(link)),
          parsedNextPageInfo: false,
          paginationReason: pageCursorResult.reason,
          nextSegmentFound: pageCursorResult.nextSegmentFound,
          linkedUrlFound: pageCursorResult.linkedUrlFound,
          linkEncoding: linkEncoding(link),
          shoplineTraceId: response.headers.get('traceid') ?? response.headers.get('trace-id'),
        }));
      }
      return c.json({ products: payload.products.map(product), nextPageInfo });
    } catch (failure) { return error(failure); }
  });

  app.get('/api/quantity-breaks/collections/:id/products', async (c) => {
    const session = await authenticated(c);
    if (session instanceof Response) return session;
    const id = c.req.param('id');
    const cursor = c.req.query('page_info');
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id) || (cursor && (cursor.length > 2048 || /\s/.test(cursor)))) return c.json({ error: 'Invalid collection search parameters.' }, 400);
    try {
      const query = new URLSearchParams({ fields: 'id,title,image', limit: '50', ...(cursor ? { page_info: cursor } : {}) });
      const response = await admin(session, `/products/collections/${encodeURIComponent(id)}/products.json?${query}`);
      const payload = await response.json() as { products?: unknown[] };
      if (!Array.isArray(payload.products) || payload.products.length > 50) throw new Error('SHOPLINE collection response is invalid.');
      return c.json({ products: payload.products.map(collectionProduct), nextPageInfo: pageCursor(response.headers.get('link')) });
    } catch (failure) { return error(failure); }
  });

  app.get('/api/quantity-breaks/collections/:id', async (c) => {
    const session = await authenticated(c);
    if (session instanceof Response) return session;
    const id = c.req.param('id');
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return c.json({ error: 'Invalid collection search parameters.' }, 400);
    try {
      const payload = await (await admin(session, `/products/collections/${encodeURIComponent(id)}.json?fields=id,title,collection_type,image`)).json() as { collection?: unknown };
      return c.json({ collection: collection(payload.collection) });
    }
    catch (failure) { return error(failure); }
  });

  app.get('/api/quantity-breaks/collections', async (c) => {
    const session = await authenticated(c);
    if (session instanceof Response) return session;
    const kind = c.req.query('kind');
    const title = c.req.query('title') ?? '';
    const cursor = c.req.query('page_info');
    if ((kind !== 'manual' && kind !== 'smart') || title.length > 255 || (cursor && (cursor.length > 2048 || /\s/.test(cursor)))) return c.json({ error: 'Invalid collection search parameters.' }, 400);
    try {
      const query = new URLSearchParams({ fields: 'id,title,image', limit: '50', ...(title ? { title } : {}), ...(cursor ? { page_info: cursor } : {}) });
      const response = await admin(session, `${kind === 'manual' ? '/products/custom_collections.json' : '/products/smart_collections.json'}?${query}`);
      const payload = await response.json() as Record<string, unknown>;
      const rows = payload[kind === 'manual' ? 'custom_collections' : 'smart_collections'];
      if (!Array.isArray(rows) || rows.length > 50) throw new Error('SHOPLINE collection response is invalid.');
      return c.json({ collections: rows.map((item) => collection(item, kind)), nextPageInfo: pageCursor(response.headers.get('link')) });
    } catch (failure) { return error(failure); }
  });

  app.get('/api/quantity-breaks/markets', async (c) => {
    const session = await authenticated(c);
    if (session instanceof Response) return session;
    try {
      const shopCurrencyCode = await fetchShopCurrency(session);
      const markets: Record<string, unknown>[] = [];
      let cursor: string | null = null;
      const seen = new Set<string>();
      do {
        const response = await admin(session, `/markets.json?limit=100${cursor ? `&page_info=${encodeURIComponent(cursor)}` : ''}`);
        const payload = await response.json() as { markets?: unknown[] };
        if (!Array.isArray(payload.markets)) throw new Error('SHOPLINE markets response is invalid.');
        markets.push(...payload.markets.map(market));
        cursor = pageCursor(response.headers.get('link'));
        if (cursor && seen.has(cursor)) throw new Error('SHOPLINE markets pagination loop detected.');
        if (cursor) seen.add(cursor);
      } while (cursor);
      return c.json({ markets, shopCurrencyCode });
    } catch (failure) { return error(failure); }
  });

  app.get('/api/quantity-breaks/shop', async (c) => {
    const session = await authenticated(c);
    if (session instanceof Response) return session;
    try {
      const identity = await new D1SessionStore(c.env.DB, c.env.TOKEN_ENCRYPTION_KEY).getInstalledStoreId(session.handle);
      return c.json({ shop: { storeId: identity ?? await fetchStoreIdWithTokenRecovery(session, c.env) } });
    }
    catch (failure) { return needsReauthorization(failure) ? reauthorizationRequired(session.handle, c.env) : error(failure); }
  });

  app.get('/api/quantity-breaks/shop-timezone', async (c) => {
    const session = await authenticated(c);
    if (session instanceof Response) return session;
    try { return c.json({ timeZone: await fetchShopTimeZoneWithTokenRecovery(session, c.env) }); }
    catch (failure) { return needsReauthorization(failure) ? reauthorizationRequired(session.handle, c.env) : error(failure); }
  });

  app.get('/api/quantity-breaks/store-languages', async (c) => {
    const session = await authenticated(c);
    if (session instanceof Response) return session;
    try {
      const payload = await (await admin(session, '/store/languages.json')).json() as { data?: { default_language?: string; supported_languages?: string[] }; languages?: { default_language?: string; supported_languages?: string[] } };
      const data = payload.languages ?? payload.data;
      const languages = [...new Set((data?.supported_languages ?? []).map((code) => normalizeStorefrontLocale(code) ?? code))];
      const defaultLanguage = normalizeStorefrontLocale(data?.default_language) ?? data?.default_language;
      if (!defaultLanguage || !languages.includes(defaultLanguage)) throw new Error('Store default language is missing from enabled languages.');
      return c.json({ defaultLanguage, languages });
    } catch (failure) { return error(failure); }
  });
}
