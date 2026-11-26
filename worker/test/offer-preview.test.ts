import { afterEach, expect, it, vi } from 'vitest';
import { resolveOfferPreview } from '../src/services/offer-preview';

const session = { handle: 'demo', accessToken: 'test-admin', scope: 'read_products' };
const variantId = '900719925474099312345';
const selection = [{ productId: 'gift-product', variantIds: [variantId] }];
const context = { marketId: 'primary', currencyCode: 'USD', countryCode: 'US' };
const metadata = { id: variantId, title: 'Large', options: [{ name: 'Size', value: 'Large' }], imageUrl: 'https://example.com/large.png' };

function upstream(mode = 'valid') {
  return vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const target = String(url);
    const rate = () => new Response('', { status: 429, headers: { 'Retry-After': '7' } });
    if (target.includes('/products/products.json')) {
      if (mode === 'product-rate') return rate();
      return Response.json({ products: [{ id: 'gift-product', handle: 'gift', title: 'Actual gift', image: { src: 'https://example.com/gift.png' }, options: [{ name: 'Size' }], variants: [{ id: variantId, product_id: 'gift-product', title: 'Large', option1: 'Large', image: { src: 'https://example.com/large.png' } }] }] });
    }
    if (target.includes('/currency/')) {
      if (mode === 'currency-rate') return rate();
      if (mode === 'currency-failure') throw new Error('upstream unavailable');
      return Response.json({ currencies: [{ currency: mode === 'jpy' ? 'JPY' : 'USD', enabled: true }] });
    }
    if (target.includes('/markets.json')) {
      if (mode === 'market-rate') return rate();
      if (mode === 'market-failure') return new Response('', { status: 503 });
      return Response.json({ markets: [{ id: 'primary', primary: true, enabled: true, regions: [{ code: 'US' }] }] });
    }
    if (!target.includes('/admin/graph/')) throw new Error('Unexpected upstream path');
    if (JSON.parse(String(init?.body)).variables.id !== variantId) throw new Error('Wrong selected variant identity');
    if (mode === 'rate') return rate();
    if (mode === 'failure') throw new Error('upstream unavailable');
    if (mode === 'graphql-errors') return Response.json({ errors: [{ message: 'Unavailable' }] });
    if (mode === 'http-failure') return new Response('', { status: 503 });
    return Response.json({ data: { productVariant: {
      id: mode === 'identity' ? 'other' : variantId,
      productId: mode === 'ownership' ? 'other-product' : 'gift-product',
      title: 'Graph title', availableForSale: mode === 'unavailable' ? false : mode === 'unknown' ? undefined : true,
      price: mode === 'no-price' ? null : mode === 'invalid-price' ? '12.345' : mode === 'jpy' ? '1200' : '12.34',
      selectedOptions: [{ name: 'Size', value: 'Graph option' }],
    } } });
  });
}

afterEach(() => vi.unstubAllGlobals());

it('returns exact Admin availability separately from trusted default-currency money', async () => {
  const fetcher = upstream(); vi.stubGlobal('fetch', fetcher);
  const result = await resolveOfferPreview(session, selection, context);
  expect(result.products[0]).toMatchObject({ id: 'gift-product', title: 'Actual gift', imageUrl: 'https://example.com/gift.png', optionNames: ['Size'], identityVerified: true, available: true, availability: 'available', variants: [{ ...metadata, available: true, availability: 'available', price: { amountMinor: 1234, currencyCode: 'USD', currencyDecimals: 2 } }] });
  expect(result.products[0].variants[0].unavailableReason).toBeUndefined();
  for (const [url, init] of fetcher.mock.calls) {
    expect(String(url)).not.toContain('/storefront/');
    const headers = new Headers(init?.headers);
    expect(headers.get('Authorization')).toBe('Bearer test-admin');
    expect(headers.get('Accept')).toBe('application/json');
    expect(headers.get('Content-Type')).toBe('application/json; charset=utf-8');
    expect(headers.get('User-Agent')).toBe('SHOPLINE-Quantity-Breaks-App/1.0');
    expect(headers.has('X-Shopline-Access-Token')).toBe(false);
  }
});

it.each(['no-price', 'invalid-price'])('preserves known sellability for %s without inventing a price', async mode => {
  vi.stubGlobal('fetch', upstream(mode));
  const result = await resolveOfferPreview(session, selection, context);
  expect(result.products[0]).toMatchObject({ available: false, availability: 'available', unavailableReason: 'price_unavailable', variants: [{ ...metadata, available: false, availability: 'available', price: null, unavailableReason: 'price_unavailable' }] });
});

it('labels sold out only after an exact Admin response explicitly says unavailable', async () => {
  vi.stubGlobal('fetch', upstream('unavailable'));
  const result = await resolveOfferPreview(session, selection, context);
  expect(result.products[0]).toMatchObject({ availability: 'sold_out', unavailableReason: 'sold_out', variants: [{ ...metadata, availability: 'sold_out', available: false, unavailableReason: 'sold_out' }] });
});

it.each(['identity', 'ownership', 'unknown', 'failure', 'http-failure', 'graphql-errors'])('keeps %s unknown and preserves verified REST metadata', async mode => {
  vi.stubGlobal('fetch', upstream(mode));
  const result = await resolveOfferPreview(session, selection, context);
  expect(result.products[0]).toMatchObject({ availability: 'unknown', available: false, variants: [{ ...metadata, availability: 'unknown', available: false }] });
  expect(result.products[0].variants[0].unavailableReason).toBe(mode === 'identity' || mode === 'ownership' ? 'identity_unverified' : 'availability_unknown');
  if (mode !== 'unknown') expect(result.products[0].variants[0].price).toBeNull();
});

it.each([
  [{ marketId: 'other-usd-market', currencyCode: 'USD' }, 'unsupported_market'],
  [{ currencyCode: 'USD' }, 'unsupported_market'],
  [{ marketId: 'primary', currencyCode: 'EUR' }, 'unsupported_currency'],
  [{ marketId: 'primary', currencyCode: 'USD', countryCode: 'GB' }, 'unsupported_country'],
])('checks availability for unsupported context %j without leaking default-context prices', async (requested, reason) => {
  const fetcher = upstream(); vi.stubGlobal('fetch', fetcher);
  const result = await resolveOfferPreview(session, selection, requested);
  expect(result.products[0]).toMatchObject({ available: false, availability: 'available', unavailableReason: reason, variants: [{ ...metadata, available: false, availability: 'available', price: null, unavailableReason: reason }] });
  expect(fetcher.mock.calls.filter(([url]) => String(url).includes('/admin/graph/'))).toHaveLength(1);
});

it.each(['currency-failure', 'market-failure'])('checks sellability even when %s prevents price validation', async mode => {
  vi.stubGlobal('fetch', upstream(mode));
  const result = await resolveOfferPreview(session, selection, context);
  expect(result.products[0].variants[0]).toMatchObject({ ...metadata, availability: 'available', available: false, price: null, unavailableReason: 'price_context_unavailable' });
});

it('uses trusted zero-decimal currency precision', async () => {
  vi.stubGlobal('fetch', upstream('jpy'));
  const result = await resolveOfferPreview(session, selection, { marketId: 'primary', currencyCode: 'JPY' });
  expect(result.products[0].variants[0].price).toEqual({ amountMinor: 1200, currencyCode: 'JPY', currencyDecimals: 0 });
});

it.each(['rate', 'currency-rate', 'market-rate', 'product-rate'])('retains bounded retry-after for %s without claiming sold out', async mode => {
  const fetcher = upstream(mode); vi.stubGlobal('fetch', fetcher);
  const result = await resolveOfferPreview(session, selection, context);
  expect(result.retryAfter).toBe(7);
  if (mode === 'product-rate') expect(result.products).toEqual([]);
  else expect(result.products[0]).toMatchObject({ availability: 'unknown', available: false, unavailableReason: 'rate_limited', variants: [{ ...metadata, availability: 'unknown', available: false, price: null, unavailableReason: 'rate_limited' }] });
  if (mode !== 'rate') expect(fetcher.mock.calls.filter(([url]) => String(url).includes('/admin/graph/'))).toHaveLength(0);
});
