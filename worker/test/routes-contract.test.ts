import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import worker from '../src';
import { hmacHex } from '../src/crypto';
import { applyMigrations } from '../src/db/migrate';
import { D1SessionStore } from '../src/db/sessions';
import { D1CampaignRepository } from '../src/db/campaigns';
import type { CampaignDraft } from '../src/domain/campaign';
import { D1SubscriptionRepository } from '../src/db/subscriptions';
import type { Env } from '../src/env';

const key = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY';
const secret = 'route-secret';
const testEnv = { ...(env as Env), SHOPLINE_APP_KEY: 'route-key', SHOPLINE_APP_SECRET: secret, TOKEN_ENCRYPTION_KEY: key, SHOPLINE_APP_URL: 'https://raised-stability-gaps-html.trycloudflare.com', SCOPES: 'read_products', now: () => Date.parse('2026-10-27T00:00:00.000Z') } as Env;

function base64Url(value: string): string {
  return btoa(value).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function jwt(): Promise<string> {
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64Url(JSON.stringify({ aud: 'route-key', handle: 'route-shop', exp: 1_900_000_000 }));
  const signature = base64Url(await hmacHex(btoa(secret), `${header}.${payload}`).then((hex) => String.fromCharCode(...(hex.match(/.{2}/g) ?? []).map((part) => Number.parseInt(part, 16)))));
  return `${header}.${payload}.${signature}`;
}

describe('Worker route contracts', () => {
  beforeEach(async () => {
    await applyMigrations(testEnv.DB);
    await testEnv.DB.batch([
      testEnv.DB.prepare('DELETE FROM quantity_breaks_campaigns'),
      testEnv.DB.prepare('DELETE FROM quantity_breaks_publications'),
      testEnv.DB.prepare('DELETE FROM shopline_sessions'),
    ]);
    await new D1SessionStore(testEnv.DB, key).upsert({
      handle: 'route-shop', accessToken: 'access', refreshToken: 'refresh', scope: 'read_products',
      expiresAt: '2030-01-01T00:00:00.000Z', installed: true,
    });
    await new D1SubscriptionRepository(testEnv.DB).writeEntitlement({
      appKey: testEnv.SHOPLINE_APP_KEY, handle: 'route-shop', state: 'active', featureKeys: ['quantity_breaks_access'],
      activeSubscriptionId: 'active-subscription', activeSpuKey: 'ultra', validFrom: null, validUntil: null,
      graceUntil: null, autoRecurring: true, absenceConfirmations: 0,
    });
  });

  it('keeps the campaign list response shape', async () => {
    const response = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/campaigns', { headers: { Authorization: `Bearer ${await jwt()}` } }), testEnv, createExecutionContext());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ campaigns: [] });
  });

  it('uses the authenticated installation identity when SHOPLINE shop lookup is unavailable', async () => {
    await new D1SessionStore(testEnv.DB, key).upsert({ handle: 'route-shop', storeId: '42', accessToken: 'access', refreshToken: 'refresh', scope: 'read_products', expiresAt: '2030-01-01T00:00:00.000Z', installed: true });
    const upstream = vi.fn(async () => new Response(null, { status: 503 }));
    vi.stubGlobal('fetch', upstream);
    const ctx = createExecutionContext();
    const response = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/shop?handle=other-store', { headers: { Authorization: `Bearer ${await jwt()}` } }), testEnv, ctx);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ shop: { storeId: '42' } });
    expect(upstream).not.toHaveBeenCalled();
    await waitOnExecutionContext(ctx);
    const event = await testEnv.DB.prepare('SELECT shop_handle FROM application_request_events WHERE trace_id = ?').bind(response.headers.get('X-Trace-Id')).first();
    expect(event).toMatchObject({ shop_handle: 'route-shop' });
  });

  it('returns campaign configuration without waiting for SHOPLINE or claiming its live status is verified', async () => {
    const repository = new D1CampaignRepository(testEnv.DB);
    await repository.save('route-shop', {
      id: 'startup-offer', name: 'Startup offer', status: 'draft', startsAt: '2026-10-26T00:00:00.000Z',
      scope: { kind: 'products', productIds: ['startup-product'], excludedProductIds: [] },
      tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 1, discountType: 'none' }],
      combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
    }, 0);
    const lease = await repository.beginPublication('route-shop', 'startup-offer', 1, 'publish');
    await repository.finishPublication('route-shop', 'startup-offer', 1, 'publish', 'startup-discount', lease.owner);
    const upstream = vi.fn(async () => new Response(null, { status: 503 }));
    vi.stubGlobal('fetch', upstream);
    const response = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/campaigns?view=configuration', { headers: { Authorization: `Bearer ${await jwt()}` } }), testEnv, createExecutionContext());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ campaigns: [{ id: 'startup-offer', platformStatus: 'unverified', platformDiscountId: 'startup-discount' }] });
    expect(upstream).not.toHaveBeenCalled();
  });

  it('does not return campaigns from another shop through the public endpoint', async () => {
    const response = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/public/quantity-breaks/campaign?shop=shop-a&productId=product-b'), testEnv, createExecutionContext());
    expect(response.status).toBe(404);
  });

  it.each(['unknown', 'review_pending', 'inactive'] as const)('does not expose public campaigns when the entitlement is %s', async (state) => {
    await new D1SubscriptionRepository(testEnv.DB).writeEntitlement({
      appKey: testEnv.SHOPLINE_APP_KEY, handle: 'route-shop', state, featureKeys: ['quantity_breaks_access'],
      activeSubscriptionId: null, activeSpuKey: null, validFrom: null, validUntil: null, graceUntil: null, autoRecurring: null, absenceConfirmations: 0,
    });

    const response = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/public/quantity-breaks/campaign?shop=route-shop&productId=product-1'), testEnv, createExecutionContext());

    expect(response.status).toBe(404);
  });

  it('returns saved public copy without exposing publication identifiers', async () => {
    const repository = new D1CampaignRepository(testEnv.DB);
    await repository.save('route-shop', {
      id: 'public-offer', name: 'Public offer', status: 'draft', startsAt: '2026-10-28T00:00:00.000Z',
      scope: { kind: 'products', productIds: ['product-1'], excludedProductIds: [] },
      tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 1, discountType: 'none' }],
      combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
    }, 0);
    const publication = await repository.beginPublication('route-shop', 'public-offer', 1, 'publish');
    await repository.finishPublication('route-shop', 'public-offer', 1, 'publish', 'discount-private', publication.owner);
    await testEnv.DB.prepare(`INSERT INTO quantity_breaks_translations (shop_handle, locale, copy_json, updated_at)
      VALUES (?, ?, ?, ?)`).bind('route-shop', 'fr', JSON.stringify({ 'widget.title': 'Offre groupee', 'widget.total': 'Total' }), '2026-10-28T00:00:00.000Z').run();

    const response = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/public/quantity-breaks/campaign?shop=route-shop&productId=product-1&locale=fr'), testEnv, createExecutionContext());
    const body = await response.json() as { campaign: { widgetTitle: string; copy?: Record<string, string> } };

    expect(response.status).toBe(200);
    expect(body.campaign.widgetTitle).toBe('Offre groupee');
    expect(body.campaign.copy).toEqual({ 'widget.title': 'Offre groupee', 'widget.total': 'Total' });
    expect(JSON.stringify(body)).not.toMatch(/discount-private|discountId|accessToken|refreshToken/i);
  });

  it('resolves an enabled market by exact storefront country code for the public campaign', async () => {
    const repository = new D1CampaignRepository(testEnv.DB);
    await repository.save('route-shop', {
      id: 'market-offer', name: 'Market offer', status: 'draft', startsAt: '2026-10-28T00:00:00.000Z',
      scope: { kind: 'products', productIds: ['product-1'], excludedProductIds: [] },
      tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 1, discountType: 'fixed_price', discountValue: 900,
        subtitle: 'Save on every item', marketOverrides: { 'market-fr': { mode: 'specified_amount', amountMinor: 800, currencyCode: 'EUR' } } }],
      combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
    }, 0);
    const publication = await repository.beginPublication('route-shop', 'market-offer', 1, 'publish');
    await repository.finishPublication('route-shop', 'market-offer', 1, 'publish', 'private-market-discount', publication.owner);
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toContain('/markets.json?limit=100');
      expect(new Headers(init?.headers).get('Accept')).toBe('application/json');
      expect(new Headers(init?.headers).get('User-Agent')).toBe('SHOPLINE-Quantity-Breaks-App/1.0');
      return Response.json({ markets: [{ market_id: 'market-fr', enabled: true, regions: [{ code: 'FR' }] }, { market_id: 'market-us', enabled: true, regions: [{ code: 'US' }] }, { market_id: 'market-ca', enabled: true, regions: [{ code: 'CA' }] }] });
    });
    vi.stubGlobal('fetch', fetcher);

    const response = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/public/quantity-breaks/campaign?shop=route-shop&productId=product-1&countryCode=FR'), testEnv, createExecutionContext());
    const body = await response.json() as { campaign: { marketId?: string; tiers: Array<{ subtitle?: string }> } };
    expect(response.status).toBe(200);
    expect(body.campaign.marketId).toBe('market-fr');
    expect(body.campaign.tiers[0].subtitle).toBe('Save on every item');

    const canadianResponse = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/public/quantity-breaks/campaign?shop=route-shop&productId=product-1&countryCode=CA'), testEnv, createExecutionContext());
    const canadianBody = await canadianResponse.json() as { campaign: { marketId?: string } };
    expect(canadianBody.campaign.marketId).toBe('market-ca');

    const unmatchedResponse = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/public/quantity-breaks/campaign?shop=route-shop&productId=product-1&countryCode=DE'), testEnv, createExecutionContext());
    const unmatchedBody = await unmatchedResponse.json() as { campaign: { marketId?: string } };
    expect(unmatchedBody.campaign.marketId).toBeUndefined();
  });

  it('returns a safe request identifier when an authenticated translation read finds malformed stored data', async () => {
    await testEnv.DB.prepare(`INSERT INTO quantity_breaks_translations (shop_handle, locale, copy_json, updated_at)
      VALUES (?, ?, ?, ?)`).bind('route-shop', 'en', '{"widget.title":"upstream-private-body"', '2026-10-28T00:00:00.000Z').run();

    const response = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/translations/en', { headers: { Authorization: `Bearer ${await jwt()}` } }), testEnv, createExecutionContext());
    const body = await response.json() as { error: string; requestId?: string };

    expect(response.status).toBe(502);
    expect(body.error).toBe('Translation data is unavailable.');
    expect(body.requestId).toMatch(/^[a-z0-9-]+$/i);
    expect(JSON.stringify(body)).not.toMatch(/upstream-private-body|accessToken|refreshToken/i);
  });

  it.each(['updating', 'needs_reconciliation'] as const)('does not serve a campaign while publication is %s', async (state) => {
    const repository = new D1CampaignRepository(testEnv.DB);
    await repository.save('route-shop', {
      id: `blocked-${state}`, name: 'Blocked offer', status: 'draft', startsAt: '2026-10-28T00:00:00.000Z',
      scope: { kind: 'products', productIds: ['product-1'], excludedProductIds: [] },
      tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 1, discountType: 'none' }],
      combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
    }, 0);
    const publication = await repository.beginPublication('route-shop', `blocked-${state}`, 1, 'publish');
    await repository.finishPublication('route-shop', `blocked-${state}`, 1, 'publish', 'discount-private', publication.owner);
    await testEnv.DB.prepare('UPDATE quantity_breaks_publications SET state = ? WHERE shop_handle = ? AND campaign_id = ?')
      .bind(state, 'route-shop', `blocked-${state}`).run();

    const response = await worker.fetch(new Request(`https://raised-stability-gaps-html.trycloudflare.com/public/quantity-breaks/campaign?shop=route-shop&productId=product-1`), testEnv, createExecutionContext());

    expect(response.status).toBe(404);
  });

  it('serves the SPA document when the asset binding redirects an unrecognized frontend route', async () => {
    const assets = {
      fetch: vi.fn(async (request: Request) => {
        if (new URL(request.url).pathname === '/quantity-breaks/translations') {
          return new Response(null, { status: 307, headers: { Location: '/' } });
        }
        if (new URL(request.url).pathname === '/') {
          return new Response('<!doctype html><html><body><div id="root"></div></body></html>', {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          });
        }
        return new Response('Not found', { status: 404 });
      }),
    } as unknown as Fetcher;

    const response = await worker.fetch(
      new Request('https://raised-stability-gaps-html.trycloudflare.com/quantity-breaks/translations'),
      { ...testEnv, ASSETS: assets },
      createExecutionContext(),
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain('<div id="root"></div>');
  });

  it.each(['/assets/old-release.css', '/assets/old-release.js', '/missing.png'])(
    'does not replace a missing static asset with the SPA document: %s', async (path) => {
      const assets = { fetch: vi.fn(async (request: Request) => new URL(request.url).pathname === '/'
        ? new Response('<!doctype html><html></html>', { headers: { 'Content-Type': 'text/html' } })
        : new Response('Not found', { status: 404 })) } as unknown as Fetcher;
      const response = await worker.fetch(new Request(`https://raised-stability-gaps-html.trycloudflare.com${path}`), { ...testEnv, ASSETS: assets }, createExecutionContext());
      expect(response.status).toBe(404);
      expect(await response.text()).not.toContain('<html>');
      expect(assets.fetch).toHaveBeenCalledTimes(1);
    },
  );

  it('rejects HTML returned by the asset binding for a stylesheet request', async () => {
    const assets = { fetch: vi.fn(async () => new Response('<!doctype html><html></html>', {
      headers: { 'Content-Type': 'text/html' },
    })) } as unknown as Fetcher;
    const response = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/assets/stale.css'), { ...testEnv, ASSETS: assets }, createExecutionContext());
    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('serves stylesheet bytes unchanged and keeps app documents out of browser caches', async () => {
    const css = '.workspace { display: grid; }';
    const assets = { fetch: vi.fn(async (request: Request) => new URL(request.url).pathname.endsWith('.css')
      ? new Response(css, { headers: { 'Content-Type': 'text/css', 'Cache-Control': 'public, max-age=31536000' } })
      : new Response('<!doctype html><html></html>', { headers: { 'Content-Type': 'text/html', 'Cache-Control': 'public, max-age=3600' } })) } as unknown as Fetcher;
    const stylesheet = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/assets/current.css'), { ...testEnv, ASSETS: assets }, createExecutionContext());
    expect(await stylesheet.text()).toBe(css);
    expect(stylesheet.headers.get('Content-Type')).toBe('text/css');
    const page = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/quantity-breaks/translations'), { ...testEnv, ASSETS: assets }, createExecutionContext());
    expect(page.headers.get('Cache-Control')).toBe('no-store');
  });

  it('returns a JSON 404 for an unknown API route instead of the SPA document', async () => {
    const response = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/missing', { headers: { Authorization: `Bearer ${await jwt()}` } }), testEnv, createExecutionContext());
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Not found' });
  });

  it('refreshes a rejected Admin token once before resolving the store identity', async () => {
    const store = new D1SessionStore(testEnv.DB, key);
    await store.upsert({
      handle: 'route-shop', accessToken: 'stale-access', refreshToken: 'refresh', scope: 'read_products',
      expiresAt: '2099-01-01T00:00:00.000Z', installed: true,
    });
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/admin/oauth/token/refresh')) {
        return new Response(JSON.stringify({ code: 200, data: { accessToken: 'fresh-access', expireTime: '2030-01-01T00:00:00.000Z' } }));
      }
      if (url.includes('/merchants/shop.json')) {
        const authorization = new Headers(init?.headers).get('Authorization');
        return authorization === 'Bearer stale-access'
          ? new Response(null, { status: 401 })
          : new Response(JSON.stringify({ shop: { id: 42 } }));
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetcher);

    const response = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/shop', { headers: { Authorization: `Bearer ${await jwt()}` } }), testEnv, createExecutionContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ shop: { storeId: '42' } });
    expect(fetcher).toHaveBeenCalledTimes(3);
    await expect(store.get('route-shop')).resolves.toMatchObject({ accessToken: 'fresh-access', expiresAt: '2030-01-01T00:00:00.000Z' });
  });

  it('asks App Bridge to reauthorize when the forced token refresh is rejected', async () => {
    const store = new D1SessionStore(testEnv.DB, key);
    await store.upsert({
      handle: 'route-shop', accessToken: 'stale-access', refreshToken: 'refresh', scope: 'read_products',
      expiresAt: '2099-01-01T00:00:00.000Z', installed: true,
    });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/admin/oauth/token/refresh')) return new Response(null, { status: 401 });
      if (String(input).includes('/merchants/shop.json')) return new Response(null, { status: 401 });
      throw new Error(`Unexpected request: ${input}`);
    }));

    const response = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/shop', { headers: { Authorization: `Bearer ${await jwt()}` } }), testEnv, createExecutionContext());

    expect(response.status).toBe(403);
    expect(response.headers.get('X-SHOPLINE-API-Request-Failure-Reauthorize')).toBe('1');
    expect(response.headers.get('X-SHOPLINE-API-Request-Failure-Reauthorize-Url')).toContain('/?uninstalled=true&embedded=1&appkey=route-key&handle=route-shop');
    await expect(response.json()).resolves.toEqual({ error: 'SHOPLINE authorization needs to be renewed.' });
  });

  it('keeps the authenticated product catalog response available to the editor', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ products: [{
      id: 1, title: 'Product 1', image: { src: 'https://cdn.example/product.png' },
      options: [{ name: 'Size', values: ['Small'] }],
      variants: [{ id: 2, title: 'Small', price: '12.50', compare_at_price: '15.00', option1: 'Small', inventory_quantity: 4, inventory_policy: 'deny', available: true, image: { src: 'https://cdn.example/variant.png' } }],
    }] })));
    vi.stubGlobal('fetch', fetcher);
    const response = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/products?limit=50', { headers: { Authorization: `Bearer ${await jwt()}` } }), testEnv, createExecutionContext());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ products: [{
      id: '1', title: 'Product 1', imageUrl: 'https://cdn.example/product.png', optionNames: ['Size'], variants: [{
        id: '2', title: 'Small', price: 12.5, compareAtPrice: 15, options: [{ name: 'Size', value: 'Small' }],
        imageUrl: 'https://cdn.example/variant.png', inventory: 4, inventoryPolicy: 'deny', available: true,
      }],
    }], nextPageInfo: null });
    const [, request] = fetcher.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit];
    expect(new Headers(request.headers).get('Accept')).toBe('application/json');
    expect(new Headers(request.headers).get('User-Agent')).toBe('SHOPLINE-Quantity-Breaks-App/1.0');
  });

  it('returns SHOPLINE next page_info unchanged for a subsequent product request', async () => {
    const firstCursor = 'eyJzaW5jZUlkIjoiMTYwNjg4OTQ2NDAxODYxMzgzNzY4MjEzNjUiLCJkaXJlY3Rpb24iOiJuZXh0Iiwic29ydFR5cGUiOiJjcmVhdGVkX2F0X2FzYyIsImxpbWl0IjoxMH0';
    const secondCursor = 'eyJzaW5jZUlkIjoiMTYwNjg4OTQ2NDA2MDc0MTQyNjY3MTEzNjUiLCJkaXJlY3Rpb24iOiJuZXh0Iiwic29ydFR5cGUiOiJjcmVhdGVkX2F0X2FzYyIsImxpbWl0IjoxMH0';
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const cursor = url.searchParams.get('page_info');
      return new Response(JSON.stringify({ products: [{ id: cursor ? '2' : '1', title: 'Product', variants: [] }] }), {
        headers: {
          Link: cursor
            ? `<https://route-shop.myshopline.com/admin/openapi/v20260901/products/products.json?limit=10&page_info=${secondCursor}>; rel="next", <https://route-shop.myshopline.com/admin/openapi/v20260901/products/products.json?limit=10&page_info=${firstCursor}>; rel="previous"`
            : `<https://route-shop.myshopline.com/admin/openapi/v20260901/products/products.json?limit=10&page_info=${firstCursor}>; rel="next"`,
        },
      });
    });
    vi.stubGlobal('fetch', fetcher);
    const headers = { Authorization: `Bearer ${await jwt()}` };

    const first = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/products?limit=10', { headers }), testEnv, createExecutionContext());
    const second = await worker.fetch(new Request(`https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/products?limit=10&page_info=${encodeURIComponent(firstCursor)}`, { headers }), testEnv, createExecutionContext());

    await expect(first.json()).resolves.toMatchObject({ nextPageInfo: firstCursor });
    await expect(second.json()).resolves.toMatchObject({ nextPageInfo: secondCursor });
    expect(new URL(String(fetcher.mock.calls[1][0])).searchParams.get('page_info')).toBe(firstCursor);
  });

  it('logs safe pagination evidence when SHOPLINE returns a full product page without a next cursor', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ products: Array.from({ length: 50 }, (_, index) => ({ id: String(index + 1), title: `Product ${index + 1}`, variants: [] })) })));
    const paginationWarning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', fetcher);

    const response = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/products?limit=50', {
      headers: { Authorization: `Bearer ${await jwt()}` },
    }), testEnv, createExecutionContext());

    expect(response.status).toBe(200);
    expect(paginationWarning).toHaveBeenCalledWith(expect.stringContaining('catalog_pagination_cursor_missing'));
    expect(paginationWarning).toHaveBeenCalledWith(expect.stringContaining('"linkPresent":false'));
    expect(paginationWarning).toHaveBeenCalledWith(expect.stringContaining('"productCount":50'));
    expect(paginationWarning).toHaveBeenCalledWith(expect.stringContaining('"paginationReason":"missing_link"'));
    expect(paginationWarning).toHaveBeenCalledWith(expect.stringContaining('"linkEncoding":null'));
  });

  it('keeps the next cursor from an escaped and HTML-encoded SHOPLINE Link header', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ products: [{ id: '1', title: 'Product 1', variants: [] }] }), {
      headers: { Link: "\\<https://route-shop.myshopline.com/admin/openapi/v20260901/products/products.json?limit=50&amp;page_info=next-token\\>; rel='next'" },
    }));
    vi.stubGlobal('fetch', fetcher);

    const response = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/products?limit=50', {
      headers: { Authorization: `Bearer ${await jwt()}` },
    }), testEnv, createExecutionContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ nextPageInfo: 'next-token' });
  });

  it('skips an HTML line break before the SHOPLINE next Link URL', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ products: [{ id: '1', title: 'Product 1', variants: [] }] }), {
      headers: { Link: '<br><https://route-shop.myshopline.com/admin/openapi/v20260901/products/products.json?limit=50&page_info=next-token>; rel="next"' },
    }));
    vi.stubGlobal('fetch', fetcher);

    const response = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/products?limit=50', {
      headers: { Authorization: `Bearer ${await jwt()}` },
    }), testEnv, createExecutionContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ nextPageInfo: 'next-token' });
  });

  it('keeps the next cursor when SHOPLINE spaces the Link relation attribute', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ products: [{ id: '1', title: 'Product 1', variants: [] }] }), {
      headers: { Link: '<https://route-shop.myshopline.com/admin/openapi/v20260901/products/products.json?limit=50&page_info=next-token>; rel = "next"' },
    }));
    vi.stubGlobal('fetch', fetcher);

    const response = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/products?limit=50', {
      headers: { Authorization: `Bearer ${await jwt()}` },
    }), testEnv, createExecutionContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ nextPageInfo: 'next-token' });
  });

  it('keeps the next cursor when a SHOPLINE Link URL contains unescaped field-list commas', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ products: [{ id: '1', title: 'Product 1', variants: [] }] }), {
      headers: { Link: '<https://route-shop.myshopline.com/admin/openapi/v20260901/products/products.json?fields=id,title,image,options,variants&limit=50&page_info=next-token>; rel="next"' },
    }));
    vi.stubGlobal('fetch', fetcher);

    const response = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/products?limit=50', {
      headers: { Authorization: `Bearer ${await jwt()}` },
    }), testEnv, createExecutionContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ nextPageInfo: 'next-token' });
  });

  it('keeps the next cursor for the specified collection picker when SHOPLINE spaces the Link relation attribute', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ custom_collections: [{ id: 'collection-1', title: 'Collection 1', collection_type: 'custom' }] }), {
      headers: { Link: '<https://route-shop.myshopline.com/admin/openapi/v20260901/products/custom_collections.json?limit=50&page_info=collection-next-token>; rel = "next"' },
    }));
    vi.stubGlobal('fetch', fetcher);

    const response = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/collections?kind=manual', {
      headers: { Authorization: `Bearer ${await jwt()}` },
    }), testEnv, createExecutionContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ nextPageInfo: 'collection-next-token' });
  });

  it('rejects mixed product lookup parameters and returns missing products explicitly', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ products: [
      { id: '1', title: 'One' },
      { id: '2', title: 'Two' },
    ] })));
    vi.stubGlobal('fetch', fetcher);
    const headers = { Authorization: `Bearer ${await jwt()}` };

    const invalid = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/products?id=1&ids=2', { headers }), testEnv, createExecutionContext());
    const selected = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/products?ids=2,1,3', { headers }), testEnv, createExecutionContext());

    expect(invalid.status).toBe(400);
    await expect(selected.json()).resolves.toMatchObject({
      products: [{ id: '2', title: 'Two' }, { id: '1', title: 'One' }],
      missingIds: ['3'],
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('keeps a manually paused SHOPLINE discount available for a later merchant action', async () => {
    const repository = new D1CampaignRepository(testEnv.DB);
    await repository.save('route-shop', {
      id: 'manually-paused', name: 'Manual pause', status: 'draft', startsAt: '2026-10-28T00:00:00.000Z',
      scope: { kind: 'products', productIds: ['product-1'], excludedProductIds: [] }, tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 1, discountType: 'none' }], combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
    }, 0);
    const lease = await repository.beginPublication('route-shop', 'manually-paused', 1, 'publish');
    await repository.finishPublication('route-shop', 'manually-paused', 1, 'publish', 'discount-1', lease.owner);
    const fetcher = vi.fn(async () => Response.json({ discount_apps: [{ app_discount_id: 'discount-1', status: 'expired' }] }));
    vi.stubGlobal('fetch', fetcher);

    const response = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/campaigns', { headers: { Authorization: `Bearer ${await jwt()}` } }), testEnv, createExecutionContext());

    await expect(response.json()).resolves.toMatchObject({ campaigns: [{ id: 'manually-paused', status: 'paused', platformState: 'paused', platformDiscountId: 'discount-1' }] });
    await expect(repository.getPublication('route-shop', 'manually-paused')).resolves.toMatchObject({ state: 'paused', discountId: 'discount-1' });
  });

  it('keeps D1 publication state intact when the batch SHOPLINE status read is empty', async () => {
    const repository = new D1CampaignRepository(testEnv.DB);
    const draft = {
      id: 'status-read-empty', name: 'Status read empty', status: 'draft' as const, startsAt: '2026-10-28T00:00:00.000Z',
      scope: { kind: 'products' as const, productIds: ['product-1'], excludedProductIds: [] },
      tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 1, discountType: 'none' as const }],
      combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
    };
    await repository.save('route-shop', draft, 0);
    const lease = await repository.beginPublication('route-shop', draft.id, 1, 'publish');
    await repository.finishPublication('route-shop', draft.id, 1, 'publish', 'discount-status-read-empty', lease.owner);
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetcher);

    const response = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/campaigns', {
      headers: { Authorization: `Bearer ${await jwt()}` },
    }), testEnv, createExecutionContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ campaigns: [{
      id: draft.id, status: 'active', platformStatus: 'unverified', platformOperationState: 'active',
    }] });
    await expect(repository.getPublication('route-shop', draft.id)).resolves.toMatchObject({
      state: 'active', discountId: 'discount-status-read-empty',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('does not start a pause when SHOPLINE status cannot be verified', async () => {
    const repository = new D1CampaignRepository(testEnv.DB);
    const draft = {
      id: 'pause-status-unverified', name: 'Pause status unverified', status: 'draft' as const, startsAt: '2026-10-28T00:00:00.000Z',
      scope: { kind: 'products' as const, productIds: ['product-1'], excludedProductIds: [] },
      tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 1, discountType: 'none' as const }],
      combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
    };
    await repository.save('route-shop', draft, 0);
    const lease = await repository.beginPublication('route-shop', draft.id, 1, 'publish');
    await repository.finishPublication('route-shop', draft.id, 1, 'publish', 'discount-pause-status-unverified', lease.owner);
    const secondDraft = { ...draft, id: 'pause-status-unverified-second', name: 'Pause status unverified second', scope: { kind: 'products' as const, productIds: ['product-2'], excludedProductIds: [] } };
    await repository.save('route-shop', secondDraft, 0);
    const secondLease = await repository.beginPublication('route-shop', secondDraft.id, 1, 'publish');
    await repository.finishPublication('route-shop', secondDraft.id, 1, 'publish', 'discount-pause-status-unverified-second', secondLease.owner);
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetcher);

    const response = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/campaigns/batch-status', {
      method: 'POST', headers: { Authorization: `Bearer ${await jwt()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'paused', campaigns: [{ id: draft.id, expectedRevision: 2 }, { id: secondDraft.id, expectedRevision: 2 }] }),
    }), testEnv, createExecutionContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ results: [
      { id: draft.id, outcome: 'unverified', message: 'SHOPLINE status is temporarily unavailable.' },
      { id: secondDraft.id, outcome: 'unverified', message: 'SHOPLINE status is temporarily unavailable.' },
    ] });
    await expect(repository.getPublication('route-shop', draft.id)).resolves.toMatchObject({
      state: 'active', discountId: 'discount-pause-status-unverified',
    });
    await expect(repository.getPublication('route-shop', secondDraft.id)).resolves.toMatchObject({
      state: 'active', discountId: 'discount-pause-status-unverified-second',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('records the SHOPLINE request ID when a pause update returns 500', async () => {
    const repository = new D1CampaignRepository(testEnv.DB);
    const draft = {
      id: 'pause-update-500', name: 'Pause update 500', status: 'draft' as const, startsAt: '2026-10-28T00:00:00.000Z',
      scope: { kind: 'products' as const, productIds: ['product-1'], excludedProductIds: [] },
      tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 1, discountType: 'none' as const }],
      combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
    };
    await repository.save('route-shop', draft, 0);
    const lease = await repository.beginPublication('route-shop', draft.id, 1, 'publish');
    await repository.finishPublication('route-shop', draft.id, 1, 'publish', 'discount-pause-update-500', lease.owner);
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/sales/discount_app.json')) return Response.json({ discount_apps: [{ app_discount_id: 'discount-pause-update-500', status: 'active' }] });
      if (url.includes('/currency/currencies.json')) return Response.json({ currencies: [{ currency: 'USD', enabled: true }] });
      if (url.includes('/sales/discount_automatic_app/discount-pause-update-500.json') && init?.method === 'PUT') {
        return new Response('', { status: 500, headers: { 'x-shopline-request-id': 'shopline-update-500' } });
      }
      throw new Error(`Unexpected platform request: ${url}`);
    });
    vi.stubGlobal('fetch', fetcher);

    const response = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/campaigns/batch-status', {
      method: 'POST', headers: { Authorization: `Bearer ${await jwt()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'paused', campaigns: [{ id: draft.id, expectedRevision: 2 }] }),
    }), testEnv, createExecutionContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ results: [{ id: draft.id, outcome: 'unverified', message: 'SHOPLINE Function discount API returned 500.' }] });
    await expect(testEnv.DB.prepare(`SELECT event_type, outcome, upstream_path, upstream_status, upstream_request_id, error_code
      FROM campaign_diagnostic_events WHERE campaign_id = ? ORDER BY occurred_at DESC LIMIT 1`).bind(draft.id).first())
      .resolves.toEqual({
        event_type: 'shopline_api', outcome: 'uncertain',
        upstream_path: '/admin/openapi/v20260901/sales/discount_automatic_app/discount-pause-update-500.json',
        upstream_status: 500, upstream_request_id: 'shopline-update-500', error_code: 'PAUSE_OUTCOME_UNCERTAIN',
      });
  });

  it('replaces an expired active Product Function discount with a new activity ID', async () => {
    const repository = new D1CampaignRepository(testEnv.DB);
    await repository.save('route-shop', {
      id: 'invalid-offer', name: 'Invalid offer', status: 'draft', startsAt: '2026-10-28T00:00:00.000Z',
      scope: { kind: 'products', productIds: ['product-1'], excludedProductIds: [] }, tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 1, discountType: 'none' }], combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
    }, 0);
    const published = await repository.beginPublication('route-shop', 'invalid-offer', 1, 'publish');
    await repository.finishPublication('route-shop', 'invalid-offer', 1, 'publish', 'invalid-discount', published.owner);
    let created = false;
    let deleted = false;
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/sales/discount_app.json')) {
        return Response.json({ discount_apps: [
          ...(!deleted ? [{ app_discount_id: 'invalid-discount', status: 'expired', ends_at: '2026-01-01T00:00:00.000Z' }] : []),
          ...(created ? [{ app_discount_id: 'replacement-discount', status: 'active' }] : []),
        ] });
      }
      if (url.includes('/products/products.json')) return Response.json({ products: [{ id: 'product-1', handle: 'replacement-product' }] });
      if (url.includes('/currency/currencies.json')) return Response.json({ currencies: [{ currency: 'USD', enabled: true }] });
      if (url.includes('/sales/discount_automatic_app.json') && init?.method === 'POST') {
        created = true;
        expect(JSON.parse(String(init.body))).toMatchObject({ ends_at: null });
        return Response.json({ app_discount_id: 'replacement-discount' });
      }
      if (url.includes('/admin/openapi/v20261201/sales/discount_apps/')) { deleted = true; return Response.json({ success: true }); }
      throw new Error(`Unexpected platform request: ${url}`);
    });
    vi.stubGlobal('fetch', fetcher);

    const response = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/campaigns/invalid-offer/status', {
      method: 'POST', headers: { Authorization: `Bearer ${await jwt()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'active', expectedRevision: 2 }),
    }), testEnv, createExecutionContext());

    expect(response.status).toBe(200);
    const result = await response.json() as { campaign: { id: string; status: string } };
    expect(result.campaign).toMatchObject({ status: 'active' });
    expect(result.campaign.id).not.toBe('invalid-offer');
    expect(await repository.get('route-shop', 'invalid-offer')).toBeNull();
    await expect(repository.getPublication('route-shop', result.campaign.id)).resolves.toMatchObject({ state: 'active', discountId: 'replacement-discount' });
  });

  it('replaces an expired paused discount with a separate activity while deleting the old one', async () => {
    const repository = new D1CampaignRepository(testEnv.DB);
    await repository.save('route-shop', {
      id: 'reactivate-offer', name: 'Reactivate offer', status: 'draft', startsAt: '2026-10-28T00:00:00.000Z',
      scope: { kind: 'products', productIds: ['product-1'], excludedProductIds: [] }, tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 1, discountType: 'none' }], combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
    }, 0);
    const publish = await repository.beginPublication('route-shop', 'reactivate-offer', 1, 'publish');
    await repository.finishPublication('route-shop', 'reactivate-offer', 1, 'publish', 'discount-1', publish.owner);
    const pause = await repository.beginPublication('route-shop', 'reactivate-offer', 2, 'pause');
    await repository.finishPublication('route-shop', 'reactivate-offer', 2, 'pause', 'discount-1', pause.owner);
    let created = false;
    let deleted = false;
    const requests: string[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/sales/discount_app.json')) {
        return Response.json({ discount_apps: [
          ...(!deleted ? [{ app_discount_id: 'discount-1', status: 'expired', node_id: 'gid://shopline/DiscountAutomaticNode/1' }] : []),
          ...(created ? [{ app_discount_id: 'discount-2', status: 'active', node_id: 'gid://shopline/DiscountAutomaticNode/2' }] : []),
        ] });
      }
      if (url.includes('/products/products.json')) return Response.json({ products: [{ id: 'product-1', handle: 'replacement-product' }] });
      if (url.includes('/currency/currencies.json')) return Response.json({ currencies: [{ currency: 'USD', enabled: true }] });
      if (url.includes('/sales/discount_automatic_app.json') && init?.method === 'POST') {
        requests.push('create');
        created = true;
        expect(JSON.parse(String(init.body))).toMatchObject({ ends_at: null });
        return Response.json({ app_discount_id: 'discount-2' });
      }
      if (url.includes('/admin/openapi/v20261201/sales/discount_apps/')) {
        requests.push('delete');
        deleted = true;
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected platform request: ${url}`);
    });
    vi.stubGlobal('fetch', fetcher);

    const response = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/campaigns/reactivate-offer/status', {
      method: 'POST', headers: { Authorization: `Bearer ${await jwt()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'active', expectedRevision: 3 }),
    }), testEnv, createExecutionContext());

    expect(response.status).toBe(200);
    const result = await response.json() as { campaign: { id: string } };
    expect(result.campaign.id).not.toBe('reactivate-offer');
    expect(await repository.get('route-shop', 'reactivate-offer')).toBeNull();
    await expect(repository.getPublication('route-shop', result.campaign.id)).resolves.toMatchObject({ state: 'active', discountId: 'discount-2' });
    expect(fetcher.mock.calls.some(([input, init]) => String(input).includes('/sales/discount_automatic_app.json') && (init as RequestInit).method === 'POST')).toBe(true);
    expect(fetcher.mock.calls.some(([input]) => String(input).includes('/currency/currencies.json'))).toBe(true);
    expect(requests.sort()).toEqual(['create', 'delete']);
  });

  it('publishes an edited expired campaign as an independent scheduled activity', async () => {
    const repository = new D1CampaignRepository(testEnv.DB);
    const original = {
      id: 'edit-expired-offer', name: 'Original offer', status: 'draft' as const, startsAt: '2026-10-28T00:00:00.000Z',
      scope: { kind: 'products' as const, productIds: ['product-1'], excludedProductIds: [] }, tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 1, discountType: 'none' as const }], combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
    };
    await repository.save('route-shop', original, 0);
    const publish = await repository.beginPublication('route-shop', original.id, 1, 'publish');
    await repository.finishPublication('route-shop', original.id, 1, 'publish', 'expired-edit-discount', publish.owner);
    const pause = await repository.beginPublication('route-shop', original.id, 2, 'pause');
    await repository.finishPublication('route-shop', original.id, 2, 'pause', 'expired-edit-discount', pause.owner);
    let created = false;
    let deleted = false;
    const requests: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/sales/discount_app.json')) return Response.json({ discount_apps: [
        ...(!deleted ? [{ app_discount_id: 'expired-edit-discount', status: 'expired', node_id: 'gid://shopline/DiscountAutomaticNode/expired' }] : []),
        ...(created ? [{ app_discount_id: 'edited-replacement', status: 'active', node_id: 'gid://shopline/DiscountAutomaticNode/replacement' }] : []),
      ] });
      if (url.includes('/products/products.json')) return Response.json({ products: [{ id: 'product-1', handle: 'replacement-product' }] });
      if (url.includes('/currency/currencies.json')) return Response.json({ currencies: [{ currency: 'USD', enabled: true }] });
      if (url.includes('/sales/discount_automatic_app.json') && init?.method === 'POST') {
        requests.push('create');
        created = true;
        expect(JSON.parse(String(init.body))).toMatchObject({ title: 'Edited offer', starts_at: '2026-11-01T00:00:00.000Z', ends_at: null });
        return Response.json({ app_discount_id: 'edited-replacement' });
      }
      if (url.includes('/admin/openapi/v20261201/sales/discount_apps/')) {
        requests.push('delete');
        deleted = true;
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected platform request: ${url}`);
    }));

    const response = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/campaigns/edit-expired-offer', {
      method: 'PUT', headers: { Authorization: `Bearer ${await jwt()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision: 3, campaign: { ...original, name: 'Edited offer', status: 'paused', startsAt: '2026-11-01T00:00:00.000Z', neverExpires: true } }),
    }), testEnv, createExecutionContext());

    expect(response.status).toBe(200);
    const result = await response.json() as { campaign: { id: string; name: string; status: string } };
    expect(result.campaign).toMatchObject({ name: 'Edited offer', status: 'scheduled' });
    expect(result.campaign.id).not.toBe(original.id);
    await expect(repository.getPublication('route-shop', result.campaign.id)).resolves.toMatchObject({ state: 'active', discountId: 'edited-replacement' });
    expect(requests.sort()).toEqual(['create', 'delete']);
  });

  it('keeps the old expired activity and publishes a new one when deletion is rejected', async () => {
    const repository = new D1CampaignRepository(testEnv.DB);
    await repository.save('route-shop', {
      id: 'reactivate-rejected', name: 'Reactivate rejected', status: 'draft', startsAt: '2026-10-28T00:00:00.000Z',
      scope: { kind: 'products', productIds: ['product-1'], excludedProductIds: [] }, tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 1, discountType: 'none' }], combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
    }, 0);
    const publish = await repository.beginPublication('route-shop', 'reactivate-rejected', 1, 'publish');
    await repository.finishPublication('route-shop', 'reactivate-rejected', 1, 'publish', 'discount-rejected', publish.owner);
    const pause = await repository.beginPublication('route-shop', 'reactivate-rejected', 2, 'pause');
    await repository.finishPublication('route-shop', 'reactivate-rejected', 2, 'pause', 'discount-rejected', pause.owner);
    let created = false;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/sales/discount_app.json')) {
        return Response.json({ discount_apps: [
          { app_discount_id: 'discount-rejected', status: 'expired' },
          ...(created ? [{ app_discount_id: 'reactivated-discount', status: 'active' }] : []),
        ] });
      }
      if (url.includes('/products/products.json')) return Response.json({ products: [{ id: 'product-1', handle: 'replacement-product' }] });
      if (url.includes('/currency/currencies.json')) return Response.json({ currencies: [{ currency: 'USD', enabled: true }] });
      if (url.includes('/sales/discount_automatic_app.json') && init?.method === 'POST') {
        created = true;
        return Response.json({ app_discount_id: 'reactivated-discount' });
      }
      if (url.includes('/admin/openapi/v20261201/sales/discount_apps/')) {
        return Response.json({ success: false, errors: 'The Function discount ID is invalid.' });
      }
      throw new Error(`Unexpected platform request: ${url}`);
    }));

    const response = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/campaigns/reactivate-rejected/status', {
      method: 'POST', headers: { Authorization: `Bearer ${await jwt()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'active', expectedRevision: 3 }),
    }), testEnv, createExecutionContext());

    expect(response.status).toBe(200);
    expect(created).toBe(true);
    const result = await response.json() as { campaign: { id: string } };
    expect(result.campaign.id).not.toBe('reactivate-rejected');
    await expect(repository.getPublication('route-shop', result.campaign.id)).resolves.toMatchObject({ state: 'active', discountId: 'reactivated-discount' });
    expect(await repository.list('route-shop')).toHaveLength(2);
    await expect(repository.getPublication('route-shop', 'reactivate-rejected')).resolves.toMatchObject({ state: 'paused', discountId: 'discount-rejected' });
  });

  it('removes local configuration after SHOPLINE already deleted the mapped discount', async () => {
    const repository = new D1CampaignRepository(testEnv.DB);
    await repository.save('route-shop', {
      id: 'externally-deleted', name: 'Externally deleted', status: 'draft', startsAt: '2026-10-28T00:00:00.000Z',
      scope: { kind: 'products', productIds: ['product-1'], excludedProductIds: [] }, tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 1, discountType: 'none' }], combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
    }, 0);
    const publish = await repository.beginPublication('route-shop', 'externally-deleted', 1, 'publish');
    await repository.finishPublication('route-shop', 'externally-deleted', 1, 'publish', 'deleted-in-shopline', publish.owner);
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ discount_apps: [] })));

    const response = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/campaigns/externally-deleted', {
      method: 'DELETE', headers: { Authorization: `Bearer ${await jwt()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: 2 }),
    }), testEnv, createExecutionContext());

    expect(response.status).toBe(200);
    await expect(repository.get('route-shop', 'externally-deleted')).resolves.toBeNull();
  });

  it('turns a missing SHOPLINE discount into a local draft', async () => {
    const repository = new D1CampaignRepository(testEnv.DB);
    await repository.save('route-shop', {
      id: 'missing-becomes-draft', name: 'Missing becomes draft', status: 'draft', startsAt: '2026-10-28T00:00:00.000Z',
      scope: { kind: 'products', productIds: ['product-1'], excludedProductIds: [] },
      tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 1, discountType: 'none' }], combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
    }, 0);
    const publication = await repository.beginPublication('route-shop', 'missing-becomes-draft', 1, 'publish');
    await repository.finishPublication('route-shop', 'missing-becomes-draft', 1, 'publish', 'missing-discount', publication.owner);
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ discount_apps: [] })));

    const response = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/campaigns', { headers: { Authorization: `Bearer ${await jwt()}` } }), testEnv, createExecutionContext());

    await expect(response.json()).resolves.toMatchObject({ campaigns: [{ id: 'missing-becomes-draft', status: 'draft', platformStatus: 'missing' }] });
    await expect(repository.getPublication('route-shop', 'missing-becomes-draft')).resolves.toMatchObject({ state: 'missing', discountId: null });
  });

  it('deletes an expired platform discount before removing the paused local configuration', async () => {
    const repository = new D1CampaignRepository(testEnv.DB);
    await repository.save('route-shop', {
      id: 'delete-expired', name: 'Delete expired', status: 'draft', startsAt: '2026-10-28T00:00:00.000Z',
      scope: { kind: 'products', productIds: ['product-1'], excludedProductIds: [] },
      tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 1, discountType: 'none' }], combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
    }, 0);
    const publish = await repository.beginPublication('route-shop', 'delete-expired', 1, 'publish');
    await repository.finishPublication('route-shop', 'delete-expired', 1, 'publish', 'expired-to-delete', publish.owner);
    const pause = await repository.beginPublication('route-shop', 'delete-expired', 2, 'pause');
    await repository.finishPublication('route-shop', 'delete-expired', 2, 'pause', 'expired-to-delete', pause.owner);
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/sales/discount_app.json')) {
        const reads = fetcher.mock.calls.filter(([request]) => String(request).includes('/sales/discount_app.json')).length;
        return Response.json({ discount_apps: reads <= 2 ? [{ app_discount_id: 'expired-to-delete', status: 'expired', node_id: 'gid://shopline/DiscountAutomaticNode/expired' }] : [] });
      }
      if (url.includes('/admin/openapi/v20261201/sales/discount_apps/')) return Response.json({ success: true });
      throw new Error(`Unexpected platform request: ${url}`);
    });
    vi.stubGlobal('fetch', fetcher);

    const response = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/campaigns/delete-expired', {
      method: 'DELETE', headers: { Authorization: `Bearer ${await jwt()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: 3 }),
    }), testEnv, createExecutionContext());

    expect(response.status).toBe(200);
    await expect(repository.get('route-shop', 'delete-expired')).resolves.toBeNull();
    expect(fetcher.mock.calls.map(([input]) => String(input))).toContainEqual(expect.stringContaining('/admin/openapi/v20261201/sales/discount_apps/'));
  });

  it('keeps an expired platform discount mapped until the merchant enables or deletes it', async () => {
    const repository = new D1CampaignRepository(testEnv.DB);
    await repository.save('route-shop', {
      id: 'expired-kept', name: 'Expired kept', status: 'draft', startsAt: '2026-10-28T00:00:00.000Z',
      scope: { kind: 'products', productIds: ['product-1'], excludedProductIds: [] },
      tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 1, discountType: 'none' }], combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
    }, 0);
    const publication = await repository.beginPublication('route-shop', 'expired-kept', 1, 'publish');
    await repository.finishPublication('route-shop', 'expired-kept', 1, 'publish', 'expired-discount', publication.owner);
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ discount_apps: [{ app_discount_id: 'expired-discount', status: 'expired' }] })));

    const response = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/campaigns', { headers: { Authorization: `Bearer ${await jwt()}` } }), testEnv, createExecutionContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ campaigns: [{ id: 'expired-kept', status: 'paused', platformStatus: 'paused', platformDiscountId: 'expired-discount' }] });
    await expect(repository.getPublication('route-shop', 'expired-kept')).resolves.toMatchObject({ state: 'paused', discountId: 'expired-discount' });
  });

  it('rejects deletion while a platform discount is currently effective', async () => {
    const repository = new D1CampaignRepository(testEnv.DB);
    await repository.save('route-shop', {
      id: 'active-delete-blocked', name: 'Active delete blocked', status: 'draft', startsAt: '2026-10-26T00:00:00.000Z',
      scope: { kind: 'products', productIds: ['product-1'], excludedProductIds: [] },
      tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 1, discountType: 'none' }], combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
    }, 0);
    const publication = await repository.beginPublication('route-shop', 'active-delete-blocked', 1, 'publish');
    await repository.finishPublication('route-shop', 'active-delete-blocked', 1, 'publish', 'active-discount', publication.owner);
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ discount_apps: [{ app_discount_id: 'active-discount', status: 'active' }] })));

    const response = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/campaigns/active-delete-blocked', {
      method: 'DELETE', headers: { Authorization: `Bearer ${await jwt()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: 2 }),
    }), testEnv, createExecutionContext());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: 'Current campaign is active. Pause it before deleting.' });
    await expect(repository.get('route-shop', 'active-delete-blocked')).resolves.not.toBeNull();
  });

  it('ends a scheduled campaign after SHOPLINE already deleted its mapped discount', async () => {
    const repository = new D1CampaignRepository(testEnv.DB);
    const scheduled: CampaignDraft = {
      id: 'scheduled-deleted', name: 'Scheduled deleted', status: 'draft', startsAt: '2026-10-28T00:00:00.000Z',
      scope: { kind: 'products', productIds: ['product-1'], excludedProductIds: [] }, tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 1, discountType: 'none' }], combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
    };
    await repository.save('route-shop', scheduled, 0);
    const publish = await repository.beginPublication('route-shop', 'scheduled-deleted', 1, 'publish');
    const active = await repository.finishPublication('route-shop', 'scheduled-deleted', 1, 'publish', 'deleted-scheduled-in-shopline', publish.owner);
    await testEnv.DB.prepare('UPDATE quantity_breaks_campaigns SET campaign_json = ? WHERE shop_handle = ? AND id = ?')
      .bind(JSON.stringify({ ...active, status: 'scheduled' }), 'route-shop', 'scheduled-deleted').run();
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ discount_apps: [] })));

    const response = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/campaigns/scheduled-deleted/end', {
      method: 'POST', headers: { Authorization: `Bearer ${await jwt()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: active.revision }),
    }), testEnv, createExecutionContext());

    expect(response.status).toBe(200);
    await expect(repository.get('route-shop', 'scheduled-deleted')).resolves.toMatchObject({ status: 'ended' });
  });

  it('continues a batch after a coverage conflict and identifies both campaigns plus the shared product', async () => {
    const repository = new D1CampaignRepository(testEnv.DB);
    const draft = {
      status: 'draft' as const, startsAt: '2026-10-28T00:00:00.000Z',
      scope: { kind: 'products' as const, productIds: ['product-1'], excludedProductIds: [] },
      tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 1, discountType: 'none' as const }],
      combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
    };
    await repository.save('route-shop', { ...draft, id: 'summer-offer', name: 'Summer offer' }, 0);
    await repository.save('route-shop', { ...draft, id: 'vip-offer', name: 'VIP offer' }, 0);
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = String(init?.body ?? '');
      if (url.includes('/currency/currencies.json')) return Response.json({ currencies: [{ currency: 'USD', enabled: true }] });
      if (url.includes('/sales/discount_automatic_app.json')) return Response.json({ app_discount_id: 'discount-summer' });
      if (url.includes('/sales/discount_app.json')) return Response.json({ discount_apps: [{ app_discount_id: 'discount-summer', status: 'active' }] });
      if (url.includes('/products/products.json')) return Response.json({ products: [{ id: 'product-1', handle: 'renewal-serum', title: 'Renewal Serum', variants: [] }] });
      throw new Error(`Unexpected platform request: ${url} ${body}`);
    });
    vi.stubGlobal('fetch', fetcher);

    const response = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/campaigns/batch-status', {
      method: 'POST', headers: { Authorization: `Bearer ${await jwt()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active', campaigns: [{ id: 'summer-offer', expectedRevision: 1 }, { id: 'vip-offer', expectedRevision: 1 }] }),
    }), testEnv, createExecutionContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ results: [
      { id: 'summer-offer', outcome: 'activated' },
      { id: 'vip-offer', outcome: 'conflict', conflict: { campaignName: 'VIP offer', conflictingCampaignName: 'Summer offer', overlap: { type: 'products', names: ['Renewal Serum'] } } },
    ] });
    await expect(repository.get('route-shop', 'summer-offer')).resolves.toMatchObject({ status: 'active' });
    await expect(repository.get('route-shop', 'vip-offer')).resolves.toMatchObject({ status: 'draft' });
  });

  it('reports each included overlapping product with its active campaign name', async () => {
    const repository = new D1CampaignRepository(testEnv.DB);
    const existing: CampaignDraft = {
      id: 'activity-a', name: 'Activity A', status: 'draft', startsAt: '2026-10-28T00:00:00.000Z',
      scope: { kind: 'products', productIds: ['product-a', 'product-excluded'], excludedProductIds: [] },
      tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 1, discountType: 'none' }],
      combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
    };
    await repository.save('route-shop', existing, 0);
    const publication = await repository.beginPublication('route-shop', existing.id, 1, 'publish');
    await repository.finishPublication('route-shop', existing.id, 1, 'publish', 'discount-a', publication.owner);
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/products/products.json')) return Response.json({ products: [{ id: 'product-a', title: 'Product A', variants: [] }] });
      throw new Error(`Unexpected platform request: ${String(input)}`);
    }));

    const response = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/campaigns/coverage', {
      method: 'POST', headers: { Authorization: `Bearer ${await jwt()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaign: { id: 'editing-activity', scope: { kind: 'products', productIds: ['product-a', 'product-excluded'], excludedProductIds: ['product-excluded'] }, startsAt: '2026-10-28T00:00:00.000Z' } }),
    }), testEnv, createExecutionContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ state: 'conflict', conflicts: [
      { campaignId: 'activity-a', campaignName: 'Activity A', itemId: 'product-a', itemName: 'Product A', type: 'products' },
    ] });
  });

  it('uses the product ID when a coverage title lookup fails', async () => {
    const repository = new D1CampaignRepository(testEnv.DB);
    const existing: CampaignDraft = {
      id: 'activity-a', name: 'Activity A', status: 'draft', startsAt: '2026-10-28T00:00:00.000Z',
      scope: { kind: 'products', productIds: ['product-a'], excludedProductIds: [] },
      tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 1, discountType: 'none' }],
      combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
    };
    await repository.save('route-shop', existing, 0);
    const publication = await repository.beginPublication('route-shop', existing.id, 1, 'publish');
    await repository.finishPublication('route-shop', existing.id, 1, 'publish', 'discount-a', publication.owner);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('product title lookup failed'); }));

    const response = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/campaigns/coverage', {
      method: 'POST', headers: { Authorization: `Bearer ${await jwt()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaign: { id: 'editing-activity', scope: { kind: 'products', productIds: ['product-a'], excludedProductIds: [] }, startsAt: '2026-10-28T00:00:00.000Z' } }),
    }), testEnv, createExecutionContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ state: 'conflict', conflicts: [{ itemId: 'product-a', itemName: 'product-a' }] });
  });

  it('keeps a conflicting collection campaign paused and returns the shared collection title', async () => {
    const repository = new D1CampaignRepository(testEnv.DB);
    const draft = {
      status: 'draft' as const, startsAt: '2026-10-28T00:00:00.000Z',
      scope: { kind: 'collections' as const, collectionIds: ['collection-1'], excludedProductIds: [] },
      tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 1, discountType: 'none' as const }],
      combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
    };
    await repository.save('route-shop', { ...draft, id: 'collection-a', name: 'Collection A' }, 0);
    const lease = await repository.beginPublication('route-shop', 'collection-a', 1, 'publish', ['product-1']);
    await repository.finishPublication('route-shop', 'collection-a', 1, 'publish', 'discount-collection-a', lease.owner);
    await repository.save('route-shop', { ...draft, id: 'collection-b', name: 'Collection B' }, 0);
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const query = String(init?.body ?? '');
      if (url.includes('/sales/discount_app.json')) return Response.json({ discount_apps: [{ app_discount_id: 'discount-collection-a', status: 'active' }] });
      if (url.includes('/products/collections/collection-1.json')) return Response.json({ collection: { id: 'collection-1', title: '精选套装' } });
      throw new Error(`Unexpected platform request: ${url} ${query}`);
    }));

    const response = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/campaigns/batch-status', {
      method: 'POST', headers: { Authorization: `Bearer ${await jwt()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active', campaigns: [{ id: 'collection-b', expectedRevision: 1 }] }),
    }), testEnv, createExecutionContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ results: [{
      id: 'collection-b', outcome: 'conflict',
      conflict: { campaignName: 'Collection B', conflictingCampaignName: 'Collection A', overlap: { type: 'collections', ids: ['collection-1'], names: ['精选套装'] } },
    }] });
    await expect(repository.get('route-shop', 'collection-b')).resolves.toMatchObject({ status: 'draft' });
  });

  it('ends an active campaign after deleting its confirmed platform discount', async () => {
    const repository = new D1CampaignRepository(testEnv.DB);
    await repository.save('route-shop', {
      id: 'ending-offer', name: 'Ending offer', status: 'draft', startsAt: '2026-10-28T00:00:00.000Z',
      scope: { kind: 'products', productIds: ['product-1'], excludedProductIds: [] },
      tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 1, discountType: 'none' }],
      combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
    }, 0);
    const published = await repository.beginPublication('route-shop', 'ending-offer', 1, 'publish');
    await repository.finishPublication('route-shop', 'ending-offer', 1, 'publish', 'discount-1', published.owner);
    let stateReads = 0;
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'GET') {
        stateReads += 1;
        return Response.json({ discount_apps: stateReads === 1 ? [{ app_discount_id: 'discount-1', status: 'active' }] : [] });
      }
      if (String(_input).includes('/admin/openapi/v20261201/sales/discount_apps/')) return Response.json({ success: true });
      throw new Error(`Unexpected platform request: ${_input}`);
    });
    vi.stubGlobal('fetch', fetcher);

    const response = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/campaigns/ending-offer/end', {
      method: 'POST', headers: { Authorization: `Bearer ${await jwt()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision: 2 }),
    }), testEnv, createExecutionContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ campaign: { id: 'ending-offer', status: 'ended', revision: 4 } });
    await expect(repository.getPublication('route-shop', 'ending-offer')).resolves.toMatchObject({ state: 'removed', discountId: null, owner: null });
    expect(fetcher.mock.calls.some(([input, init]) => String(input).includes('/admin/openapi/v20261201/sales/discount_apps/') && (init as RequestInit).method === 'DELETE')).toBe(true);
  });

  it('republishes an ended campaign through the status endpoint', async () => {
    const repository = new D1CampaignRepository(testEnv.DB);
    await repository.save('route-shop', {
      id: 'ended-offer', name: 'Ended offer', status: 'ended', startsAt: '2026-10-28T00:00:00.000Z',
      scope: { kind: 'products', productIds: ['product-1'], excludedProductIds: [] },
      tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 1, discountType: 'none' }],
      combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
    }, 0);
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const query = String(init?.body ?? '');
      if (url.includes('/currency/currencies.json')) return new Response(JSON.stringify({ currencies: [{ currency: 'USD', enabled: true }] }));
      if (url.includes('/products/products.json')) return Response.json({ products: [{ id: 'product-1', handle: 'ended-product' }] });
      if (url.includes('/sales/discount_automatic_app.json') && init?.method === 'POST') return new Response(JSON.stringify({ app_discount_id: 'discount-2' }));
      if (url.includes('/sales/discount_app.json')) return Response.json({ discount_apps: [{ app_discount_id: 'discount-2', status: 'active' }] });
      throw new Error(`Unexpected platform request: ${url}`);
    });
    vi.stubGlobal('fetch', fetcher);

    const response = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/campaigns/ended-offer/status', {
      method: 'POST', headers: { Authorization: `Bearer ${await jwt()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active', expectedRevision: 1 }),
    }), testEnv, createExecutionContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ campaign: { id: 'ended-offer', status: 'active', revision: 2 } });
    await expect(repository.getPublication('route-shop', 'ended-offer')).resolves.toMatchObject({ state: 'active', discountId: 'discount-2' });
  });

  it('updates an active campaign through its confirmed platform discount without pausing it', async () => {
    const repository = new D1CampaignRepository(testEnv.DB);
    await repository.save('route-shop', {
      id: 'active-offer', name: 'Original offer', status: 'draft', startsAt: '2026-10-28T00:00:00.000Z',
      scope: { kind: 'products', productIds: ['product-1'], excludedProductIds: [] },
      tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 1, discountType: 'none' }],
      combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
    }, 0);
    const published = await repository.beginPublication('route-shop', 'active-offer', 1, 'publish');
    await repository.finishPublication('route-shop', 'active-offer', 1, 'publish', 'discount-1', published.owner);
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/sales/discount_app.json')) return new Response(JSON.stringify({ discount_apps: [{ app_discount_id: 'discount-1', status: 'active' }] }));
      if (url.includes('/products/products.json')) return Response.json({ products: [{ id: 'product-1', handle: 'active-product' }] });
      if (url.includes('/currency/currencies.json')) return new Response(JSON.stringify({ currencies: [{ currency: 'USD', enabled: true }] }));
      if (url.includes('/sales/discount_automatic_app/discount-1.json') && init?.method === 'PUT') return new Response(JSON.stringify({ app_discount_id: 'discount-1' }));
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetcher);
    const response = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/campaigns/active-offer', {
      method: 'PUT', headers: { Authorization: `Bearer ${await jwt()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision: 2, campaign: {
        id: 'active-offer', name: 'Updated offer', status: 'paused', startsAt: '2026-10-28T00:00:00.000Z',
        scope: { kind: 'products', productIds: ['product-1'], excludedProductIds: [] },
        tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 1, discountType: 'none' }],
        combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
      } }),
    }), testEnv, createExecutionContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ campaign: { name: 'Updated offer', status: 'active', revision: 3 } });
    await expect(repository.getPublication('route-shop', 'active-offer')).resolves.toMatchObject({ state: 'active', discountId: 'discount-1' });
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('/sales/discount_automatic_app/discount-1.json'), expect.objectContaining({ method: 'PUT' }));
  });

  it('updates an unlinked draft while another campaign remains active', async () => {
    const repository = new D1CampaignRepository(testEnv.DB);
    const published = {
      id: 'published-other', name: 'Published other', status: 'draft' as const, startsAt: '2026-10-28T00:00:00.000Z',
      scope: { kind: 'products' as const, productIds: ['product-2'], excludedProductIds: [] },
      tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 1, discountType: 'none' as const }],
      combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
    };
    await repository.save('route-shop', published, 0);
    const publication = await repository.beginPublication('route-shop', published.id, 1, 'publish');
    await repository.finishPublication('route-shop', published.id, 1, 'publish', 'published-other-discount', publication.owner);
    await repository.save('route-shop', {
      id: 'stale-draft', name: 'Stale draft', status: 'active', startsAt: '2026-10-28T00:00:00.000Z',
      scope: { kind: 'products', productIds: ['product-1'], excludedProductIds: [] },
      tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 1, discountType: 'none' }],
      combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
    }, 0);
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/products/products.json')) return Response.json({ products: [{ id: 'product-1', handle: 'recovered-product' }] });
      throw new Error(`Unexpected request: ${input}`);
    }));

    const response = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/campaigns/stale-draft', {
      method: 'PUT', headers: { Authorization: `Bearer ${await jwt()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision: 1, campaign: {
        id: 'stale-draft', name: 'Recovered draft', status: 'draft', startsAt: '2026-10-28T00:00:00.000Z',
        scope: { kind: 'products', productIds: ['product-1'], excludedProductIds: [] },
        tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 1, discountType: 'none' }],
        combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
      } }),
    }), testEnv, createExecutionContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ campaign: { id: 'stale-draft', name: 'Recovered draft', status: 'draft' } });
    await expect(repository.getPublication('route-shop', published.id)).resolves.toMatchObject({ state: 'active', discountId: 'published-other-discount' });
  });

  it('restores an active campaign after a definitive platform update rejection', async () => {
    const repository = new D1CampaignRepository(testEnv.DB);
    await repository.save('route-shop', {
      id: 'rejected-offer', name: 'Original offer', status: 'draft', startsAt: '2026-10-28T00:00:00.000Z',
      scope: { kind: 'products', productIds: ['product-1'], excludedProductIds: [] }, tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 1, discountType: 'none' }], combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
    }, 0);
    const published = await repository.beginPublication('route-shop', 'rejected-offer', 1, 'publish');
    await repository.finishPublication('route-shop', 'rejected-offer', 1, 'publish', 'discount-1', published.owner);
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/sales/discount_app.json')) return new Response(JSON.stringify({ discount_apps: [{ app_discount_id: 'discount-1', status: 'active' }] }));
      if (String(input).includes('/products/products.json')) return Response.json({ products: [{ id: 'product-1', handle: 'rejected-product' }] });
      if (String(input).includes('/currency/currencies.json')) return new Response(JSON.stringify({ currencies: [{ currency: 'USD', enabled: true }] }));
      if (init?.method === 'PUT') return new Response('{}', { status: 422 });
      throw new Error(`Unexpected request: ${input}`);
    }));
    const response = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/campaigns/rejected-offer', {
      method: 'PUT', headers: { Authorization: `Bearer ${await jwt()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision: 2, campaign: { id: 'rejected-offer', name: 'Rejected change', status: 'active', startsAt: '2026-10-28T00:00:00.000Z', scope: { kind: 'products', productIds: ['product-1'], excludedProductIds: [] }, tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 1, discountType: 'none' }], combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false } } }),
    }), testEnv, createExecutionContext());

    expect(response.status).toBe(502);
    await expect(repository.getPublication('route-shop', 'rejected-offer')).resolves.toMatchObject({ state: 'active', discountId: 'discount-1' });
    await expect(repository.getStagedUpdate('route-shop', 'rejected-offer')).resolves.toBeNull();
    await expect(repository.get('route-shop', 'rejected-offer')).resolves.toMatchObject({ name: 'Original offer', revision: 2 });
  });

  it('marks a timed out update for reconciliation and retains its candidate', async () => {
    const repository = new D1CampaignRepository(testEnv.DB);
    await repository.save('route-shop', {
      id: 'uncertain-offer', name: 'Original offer', status: 'draft', startsAt: '2026-10-28T00:00:00.000Z',
      scope: { kind: 'products', productIds: ['product-1'], excludedProductIds: [] }, tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 1, discountType: 'none' }], combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
    }, 0);
    const published = await repository.beginPublication('route-shop', 'uncertain-offer', 1, 'publish');
    await repository.finishPublication('route-shop', 'uncertain-offer', 1, 'publish', 'discount-1', published.owner);
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/sales/discount_app.json')) return new Response(JSON.stringify({ discount_apps: [{ app_discount_id: 'discount-1', status: 'active' }] }));
      if (String(input).includes('/products/products.json')) return Response.json({ products: [{ id: 'product-1', handle: 'uncertain-product' }] });
      if (String(input).includes('/currency/currencies.json')) return new Response(JSON.stringify({ currencies: [{ currency: 'USD', enabled: true }] }));
      if (init?.method === 'PUT') throw new Error('timeout');
      throw new Error(`Unexpected request: ${input}`);
    }));
    const response = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/campaigns/uncertain-offer', {
      method: 'PUT', headers: { Authorization: `Bearer ${await jwt()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision: 2, campaign: { id: 'uncertain-offer', name: 'Uncertain change', status: 'active', startsAt: '2026-10-28T00:00:00.000Z', scope: { kind: 'products', productIds: ['product-1'], excludedProductIds: [] }, tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 1, discountType: 'none' }], combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false } } }),
    }), testEnv, createExecutionContext());

    expect(response.status).toBe(409);
    await expect(repository.getPublication('route-shop', 'uncertain-offer')).resolves.toMatchObject({ state: 'needs_reconciliation', discountId: 'discount-1' });
    await expect(repository.getStagedUpdate('route-shop', 'uncertain-offer')).resolves.toMatchObject({ candidate: { name: 'Uncertain change' } });
  });

  it('rejects a published collection update before requesting a discount when members changed', async () => {
    const repository = new D1CampaignRepository(testEnv.DB);
    await repository.save('route-shop', {
      id: 'collection-offer', name: 'Collection offer', status: 'draft', startsAt: '2026-10-28T00:00:00.000Z',
      scope: { kind: 'collections', collectionIds: ['collection-1'], resolvedProductIds: ['product-1', 'product-2'], excludedProductIds: [] }, tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 1, discountType: 'none' }], combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
    }, 0);
    const published = await repository.beginPublication('route-shop', 'collection-offer', 1, 'publish', ['product-1', 'product-2']);
    await repository.finishPublication('route-shop', 'collection-offer', 1, 'publish', 'discount-1', published.owner);
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/collections/collection-1/products.json')) return new Response(JSON.stringify({ products: [{ id: 'product-1' }, { id: 'product-3' }] }));
      if (init?.method === 'PUT') throw new Error('Discount update must not be called.');
      throw new Error(`Unexpected request: ${input}`);
    });
    vi.stubGlobal('fetch', fetcher);
    const response = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/campaigns/collection-offer', {
      method: 'PUT', headers: { Authorization: `Bearer ${await jwt()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision: 2, campaign: { id: 'collection-offer', name: 'Changed collection offer', status: 'active', startsAt: '2026-10-28T00:00:00.000Z', scope: { kind: 'collections', collectionIds: ['collection-1'], resolvedProductIds: ['product-1', 'product-2'], excludedProductIds: [] }, tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 1, discountType: 'none' }], combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false } } }),
    }), testEnv, createExecutionContext());

    expect(response.status).toBe(409);
    expect(fetcher.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === 'PUT')).toBe(false);
    await expect(repository.getPublication('route-shop', 'collection-offer')).resolves.toMatchObject({ state: 'active' });
  });

  it('keeps collection, market, and shop identity shapes compatible with the editor', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/products/collections/collection-1.json')) return new Response(JSON.stringify({ collection: { id: 'collection-1', title: 'Collection 1', collection_type: 'custom', image: { src: 'https://cdn.example/collection.png' } } }));
      if (url.includes('/currency/currencies.json')) return new Response(JSON.stringify({ currencies: [{ currency: 'USD', enabled: true }] }));
      if (url.includes('/markets.json')) return new Response(JSON.stringify({ markets: [{ market_id: 3, market_name: 'Europe', enabled: true, primary: true, currency_settings: { base_currency: { currency_code: 'EUR', auto_exchange_rate: false, exchange_rate: '6.6' } }, regions: [{ code: 'FR', currency: { currency_code: 'EUR' } }], web_presence: { default_locale: 'fr' }, specified_amount_supported: true }] }));
      if (url.includes('/merchants/shop.json')) return new Response(JSON.stringify({ shop: { id: 42 } }));
      throw new Error(`Unexpected request: ${url}`);
    }));
    const headers = { Authorization: `Bearer ${await jwt()}` };
    const collection = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/collections/collection-1', { headers }), testEnv, createExecutionContext());
    const markets = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/markets', { headers }), testEnv, createExecutionContext());
    const shop = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/shop', { headers }), testEnv, createExecutionContext());

    await expect(collection.json()).resolves.toEqual({ collection: { id: 'collection-1', title: 'Collection 1', kind: 'manual', imageUrl: 'https://cdn.example/collection.png' } });
    await expect(markets.json()).resolves.toEqual({ markets: [{ id: '3', name: 'Europe', enabled: true, currencyCode: 'EUR', regionCurrencyCodes: ['EUR'], specifiedAmountSupported: true, primary: true, defaultLocale: 'fr', regionCodes: ['FR'], autoExchangeRate: false, exchangeRate: 6.6 }], shopCurrencyCode: 'USD' });
    await expect(shop.json()).resolves.toEqual({ shop: { storeId: '42' } });
  });

  it.each(['?limit=50', '?id=five-options', '?ids=five-options'])('keeps all five product option values through catalog lookup %s', async (query) => {
    const product = { id: 'five-options', title: 'Five options', options: ['Colour', 'Size', 'Color', 'Material', 'Style'].map(name => ({ name })), variants: [
      { id: 'five-variant', option1: 'Black Marle', option2: 'S', option3: '1', option4: 'Cotton', option5: 'Regular', inventory_quantity: 10 },
    ] };
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(query.startsWith('?id=') ? { product } : { products: [product] })));
    const response = await worker.fetch(new Request(`https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/products${query}`, { headers: { Authorization: `Bearer ${await jwt()}` } }), testEnv, createExecutionContext());
    expect(response.status).toBe(200);
    const data = await response.json() as { product?: { variants: Array<{ options: unknown }> }; products?: Array<{ variants: Array<{ options: unknown }> }> };
    expect((data.product ?? data.products![0]).variants[0].options).toEqual([
      { name: 'Colour', value: 'Black Marle' }, { name: 'Size', value: 'S' }, { name: 'Color', value: '1' }, { name: 'Material', value: 'Cotton' }, { name: 'Style', value: 'Regular' },
    ]);
  });

  it('returns validated variant market prices in ten-country SHOPLINE batches', async () => {
    const requestedCountryCodes: string[][] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (!url.pathname.endsWith('/markets/variant-1/price.json')) throw new Error(`Unexpected request: ${url}`);
      const headers = new Headers(init?.headers);
      expect(headers.get('Authorization')).toBe('Bearer access');
      expect(headers.get('Accept')).toBe('application/json');
      expect(headers.get('Content-Type')).toBe('application/json; charset=utf-8');
      expect(headers.get('User-Agent')).toBe('SHOPLINE-Quantity-Breaks-App/1.0');
      const countryCodes = (url.searchParams.get('country_codes') ?? '').split(',');
      requestedCountryCodes.push(countryCodes);
      return Response.json({ market_prices: countryCodes.map((countryCode, index) => ({ country_code: countryCode, market_price: { amount: String(index + 1), currency_code: countryCode === 'JP' ? 'JPY' : 'USD' } })) });
    }));
    const headers = { Authorization: `Bearer ${await jwt()}` };
    const countries = ['JP', 'US', 'CA', 'GB', 'FR', 'DE', 'IT', 'ES', 'AU', 'NZ', 'KR'];
    const response = await worker.fetch(new Request(`https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/variants/variant-1/market-prices?country_codes=${countries.join(',')}`, { headers }), testEnv, createExecutionContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ prices: [
      { countryCode: 'JP', amountMinor: 1, currencyCode: 'JPY' },
      { countryCode: 'US', amountMinor: 2, currencyCode: 'USD' },
      { countryCode: 'CA', amountMinor: 3, currencyCode: 'USD' },
      { countryCode: 'GB', amountMinor: 4, currencyCode: 'USD' },
      { countryCode: 'FR', amountMinor: 5, currencyCode: 'USD' },
      { countryCode: 'DE', amountMinor: 6, currencyCode: 'USD' },
      { countryCode: 'IT', amountMinor: 7, currencyCode: 'USD' },
      { countryCode: 'ES', amountMinor: 8, currencyCode: 'USD' },
      { countryCode: 'AU', amountMinor: 9, currencyCode: 'USD' },
      { countryCode: 'NZ', amountMinor: 10, currencyCode: 'USD' },
      { countryCode: 'KR', amountMinor: 1, currencyCode: 'USD' },
    ] });
    expect(requestedCountryCodes).toEqual([countries.slice(0, 10), countries.slice(10)]);

    const invalid = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/variants/variant-1/market-prices?country_codes=JP,Japan', { headers }), testEnv, createExecutionContext());
    expect(invalid.status).toBe(400);
  });

  it('rejects malformed variant market prices instead of falling back to shop amounts', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ market_prices: [{ country_code: 'JP', market_price: { amount: 'not-an-integer', currency_code: 'JPY' } }] })));
    const response = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/variants/variant-1/market-prices?country_codes=JP', { headers: { Authorization: `Bearer ${await jwt()}` } }), testEnv, createExecutionContext());

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: 'SHOPLINE market price response is invalid.' });
  });

  it('preserves an upstream rate limit and retry delay instead of reporting a gateway error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 429, headers: { 'Retry-After': '30' } })));
    const response = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/variants/limited-variant/market-prices?country_codes=US', { headers: { Authorization: `Bearer ${await jwt()}` } }), testEnv, createExecutionContext());
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('30');
  });

  it('does not begin an external publication when the deployment has disabled publications', async () => {
    const repository = new D1CampaignRepository(testEnv.DB);
    await repository.save('route-shop', {
      id: 'draft-offer', name: 'Draft offer', status: 'draft', startsAt: '2026-10-28T00:00:00.000Z',
      scope: { kind: 'products', productIds: ['product-1'], excludedProductIds: [] },
      tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 1, discountType: 'none' }],
      combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
    }, 0);
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const response = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/campaigns/draft-offer/status', {
      method: 'POST', headers: { Authorization: `Bearer ${await jwt()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active', expectedRevision: 1 }),
    }), { ...testEnv, SHOPLINE_QUANTITY_BREAKS_PUBLICATION_ENABLED: 'false' }, createExecutionContext());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: 'Campaign publication is disabled for this deployment.' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('creates a draft without querying an empty platform discount ID', async () => {
    const repository = new D1CampaignRepository(testEnv.DB);
    await repository.save('route-shop', {
      id: 'draft-without-platform-id', name: 'Draft without platform ID', status: 'draft', startsAt: '2026-10-28T00:00:00.000Z',
      scope: { kind: 'products', productIds: ['product-1'], excludedProductIds: [] },
      tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 1, discountType: 'none' }],
      combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
    }, 0);
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/currency/currencies.json')) return Response.json({ currencies: [{ currency: 'USD', enabled: true }] });
      if (url.includes('/products/products.json')) return Response.json({ products: [{ id: 'product-1', handle: 'new-product' }] });
      if (url.includes('/sales/discount_automatic_app.json') && init?.method === 'POST') return Response.json({ app_discount_id: 'new-discount' });
      if (url.includes('/sales/discount_app.json')) return Response.json({ discount_apps: [{ app_discount_id: 'new-discount', status: 'active' }] });
      throw new Error(`Unexpected platform request: ${url}`);
    });
    vi.stubGlobal('fetch', fetcher);

    const response = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/campaigns/draft-without-platform-id/status', {
      method: 'POST', headers: { Authorization: `Bearer ${await jwt()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active', expectedRevision: 1 }),
    }), testEnv, createExecutionContext());

    expect(response.status).toBe(200);
    const urls = fetcher.mock.calls.map(([input]) => String(input));
    expect(urls.some((url) => /discount_automatic_app\/.json/.test(url))).toBe(false);
    expect(urls).toContainEqual(expect.stringContaining('/sales/discount_automatic_app.json'));
  });

  it.each([
    ['single', '2026-10-26T00:00:00.000Z', 'active'],
    ['batch', '2026-10-26T00:00:00.000Z', 'active'],
    ['single', '2026-10-28T00:00:00.000Z', 'scheduled'],
    ['batch', '2026-10-28T00:00:00.000Z', 'scheduled'],
  ] as const)('preserves a saved end time for %s activation starting at %s (%s)', async (mode, startsAt, status) => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(testEnv.now!());
    try {
      const repository = new D1CampaignRepository(testEnv.DB);
      const draft = {
        id: 'finite-draft', name: 'Finite draft', status: 'draft' as const, startsAt,
        endsAt: '2026-11-01T00:00:00.000Z', neverExpires: false,
        scope: { kind: 'products' as const, productIds: ['product-1'], excludedProductIds: [] },
        tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 1, discountType: 'none' as const }],
        combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
      };
      let publishedInput: Record<string, unknown> | undefined;
      vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/products/products.json')) return Response.json({ products: [{ id: 'product-1', handle: 'finite-product' }] });
        if (url.includes('/currency/currencies.json')) return Response.json({ currencies: [{ currency: 'USD', enabled: true }] });
        if (url.includes('/sales/discount_automatic_app.json') && init?.method === 'POST') {
          publishedInput = JSON.parse(String(init.body));
          return Response.json({ app_discount_id: 'finite-discount' });
        }
        if (url.includes('/sales/discount_app.json')) return Response.json({ discount_apps: [{ app_discount_id: 'finite-discount', status: 'active', node_id: 'gid://shopline/DiscountAutomaticNode/finite-discount' }] });
        throw new Error(`Unexpected platform request: ${url}`);
      }));
      const headers = { Authorization: `Bearer ${await jwt()}`, 'Content-Type': 'application/json' };
      const saved = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/campaigns', {
        method: 'POST', headers, body: JSON.stringify({ campaign: draft, expectedRevision: 0 }),
      }), testEnv, createExecutionContext());
      expect(saved.status).toBe(201);
      await expect(repository.get('route-shop', draft.id)).resolves.toMatchObject({ endsAt: '2026-11-01T00:00:00.000Z', neverExpires: false });
      const response = await worker.fetch(new Request(`https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/campaigns/${mode === 'batch' ? 'batch-status' : `${draft.id}/status`}`, {
        method: 'POST', headers, body: JSON.stringify(mode === 'batch'
          ? { status: 'active', campaigns: [{ id: draft.id, expectedRevision: 1 }] }
          : { status: 'active', expectedRevision: 1 }),
      }), testEnv, createExecutionContext());
      const result = await response.json();
      expect(response.status, JSON.stringify(result)).toBe(200);
      const expected = { id: draft.id, status, startsAt, endsAt: '2026-11-01T00:00:00.000Z', neverExpires: false };
      expect(result, JSON.stringify(result)).toMatchObject(mode === 'batch' ? { results: [{ outcome: 'activated', campaign: expected }] } : { campaign: expected });
      expect(publishedInput).toMatchObject({ starts_at: startsAt, ends_at: '2026-11-01T00:00:00.000Z' });
      await expect(repository.get('route-shop', draft.id)).resolves.toMatchObject(expected);
    } finally { clock.mockRestore(); }
  });

  it.each(['single', 'batch'].flatMap((mode) => ['scheduled', 'active'].map((storedStatus) => ({ mode, storedStatus }))))('starts a future activity with stored $storedStatus status through $mode without creating another discount', async ({ mode, storedStatus }) => {
    const repository = new D1CampaignRepository(testEnv.DB);
    const scheduled = {
      id: 'scheduled-start', name: 'Scheduled start', status: 'draft' as const, startsAt: '2026-10-28T00:00:00.000Z', endsAt: '2026-11-01T00:00:00.000Z', neverExpires: false,
      scope: { kind: 'products' as const, productIds: ['product-1'], excludedProductIds: [] },
      tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 1, discountType: 'none' as const }],
      combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
    };
    await repository.save('route-shop', scheduled, 0);
    const publication = await repository.beginPublication('route-shop', scheduled.id, 1, 'publish');
    await repository.finishPublication('route-shop', scheduled.id, 1, 'publish', 'scheduled-1', publication.owner);
    await testEnv.DB.prepare(`UPDATE quantity_breaks_campaigns SET campaign_json = json_set(campaign_json, '$.status', ?)
      WHERE shop_handle = ? AND id = ?`).bind(storedStatus, 'route-shop', scheduled.id).run();
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/sales/discount_app.json')) return Response.json({ discount_apps: [{ app_discount_id: 'scheduled-1', status: 'scheduled' }] });
      if (url.includes('/currency/currencies.json')) return Response.json({ currencies: [{ currency: 'USD', enabled: true }] });
      if (url.includes('/sales/discount_automatic_app/scheduled-1.json') && init?.method === 'PUT') {
        expect(JSON.parse(String(init.body))).toMatchObject({ starts_at: '2026-10-27T00:00:00.000Z', ends_at: '2026-11-01T00:00:00.000Z' });
        return Response.json({ app_discount_id: 'scheduled-1' });
      }
      throw new Error(`Unexpected platform request: ${url}`);
    });
    vi.stubGlobal('fetch', fetcher);

    const response = await worker.fetch(new Request(`https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/campaigns/${mode === 'batch' ? 'batch-status' : 'scheduled-start/status'}`, {
      method: 'POST', headers: { Authorization: `Bearer ${await jwt()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(mode === 'batch' ? { status: 'active', campaigns: [{ id: scheduled.id, expectedRevision: 2 }] } : { status: 'active', expectedRevision: 2 }),
    }), testEnv, createExecutionContext());

    expect(response.status).toBe(200);
    const body = await response.json() as { campaign?: unknown; results?: Array<{ outcome: string; campaign: unknown }> };
    expect(mode === 'batch' ? body.results?.[0] : body).toMatchObject({
      ...(mode === 'batch' ? { outcome: 'activated' } : {}),
      campaign: { status: 'active', startsAt: '2026-10-27T00:00:00.000Z', endsAt: '2026-11-01T00:00:00.000Z', neverExpires: false },
    });
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('/sales/discount_automatic_app/scheduled-1.json'), expect.objectContaining({ method: 'PUT' }));
    expect(fetcher.mock.calls.some(([input, init]) => String(input).endsWith('/sales/discount_automatic_app.json') && init?.method === 'POST')).toBe(false);
    await expect(repository.get('route-shop', scheduled.id)).resolves.toMatchObject({ status: 'active', startsAt: '2026-10-27T00:00:00.000Z' });
    const refreshed = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/campaigns', { headers: { Authorization: `Bearer ${await jwt()}` } }), testEnv, createExecutionContext());
    expect(refreshed.status).toBe(200);
    await expect(refreshed.json()).resolves.toMatchObject({ campaigns: [expect.objectContaining({ status: 'active', startsAt: '2026-10-27T00:00:00.000Z', platformStatus: 'active' })] });
  });

  it.each(['single', 'batch'].flatMap((mode) => [{ status: 'scheduled', future: true }, { status: 'active', future: true }, { status: 'active', future: false }].map((item) => ({ mode, ...item }))))('returns continuous disabling state for $status activity (future=$future) through $mode status API', async ({ mode, status, future }) => {
    const repository = new D1CampaignRepository(testEnv.DB);
    const scheduled = {
      id: 'scheduled-pause', name: 'Scheduled pause', status: 'draft' as const, startsAt: future ? '2026-10-28T00:00:00.000Z' : '2026-10-26T00:00:00.000Z',
      scope: { kind: 'products' as const, productIds: ['product-1'], excludedProductIds: [] },
      tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 1, discountType: 'none' as const }],
      combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
    };
    await repository.save('route-shop', scheduled, 0);
    const publication = await repository.beginPublication('route-shop', scheduled.id, 1, 'publish');
    await repository.finishPublication('route-shop', scheduled.id, 1, 'publish', 'scheduled-pause-1', publication.owner);
    await testEnv.DB.prepare(`UPDATE quantity_breaks_campaigns SET campaign_json = json_set(campaign_json, '$.status', ?)
      WHERE shop_handle = ? AND id = ?`).bind(status, 'route-shop', scheduled.id).run();
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/sales/discount_app.json')) return Response.json({ discount_apps: [{ app_discount_id: 'scheduled-pause-1', status: future ? 'scheduled' : 'active' }] });
      if (url.includes('/currency/currencies.json')) return Response.json({ currencies: [{ currency: 'USD', enabled: true }] });
      if (url.includes('/sales/discount_automatic_app/scheduled-pause-1.json') && init?.method === 'PUT') {
        expect(JSON.parse(String(init.body))).toMatchObject({
          ...(future ? { starts_at: '2026-10-27T00:00:00.000Z' } : {}),
          ends_at: '2026-10-27T00:00:10.000Z',
        });
        return Response.json({ app_discount_id: 'scheduled-pause-1' });
      }
      throw new Error(`Unexpected platform request: ${url}`);
    });
    vi.stubGlobal('fetch', fetcher);

    const response = await worker.fetch(new Request(`https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/campaigns/${mode === 'batch' ? 'batch-status' : 'scheduled-pause/status'}`, {
      method: 'POST', headers: { Authorization: `Bearer ${await jwt()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(mode === 'batch' ? { status: 'paused', campaigns: [{ id: scheduled.id, expectedRevision: 2 }] } : { status: 'paused', expectedRevision: 2 }),
    }), testEnv, createExecutionContext());

    expect(response.status).toBe(200);
    const body = await response.json() as { campaign?: unknown; results?: Array<{ outcome: string; campaign: unknown }> };
    expect(mode === 'batch' ? body.results?.[0] : body).toMatchObject({
      ...(mode === 'batch' ? { outcome: 'pausing' } : {}),
      campaign: { status: future ? 'scheduled' : 'active', platformOperationState: 'pausing', platformState: 'pausing', platformDiscountId: 'scheduled-pause-1' },
    });
    await expect(repository.getPublication('route-shop', scheduled.id)).resolves.toMatchObject({ state: 'pausing', discountId: 'scheduled-pause-1' });
  });

  it('queues eligible deletes while requiring an effective campaign to be paused first', async () => {
    const repository = new D1CampaignRepository(testEnv.DB);
    const active = {
      id: 'batch-delete-active', name: 'Active', status: 'draft' as const, startsAt: '2026-10-26T00:00:00.000Z',
      scope: { kind: 'products' as const, productIds: ['product-1'], excludedProductIds: [] },
      tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 1, discountType: 'none' as const }],
      combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
    };
    const expired = { ...active, id: 'batch-delete-expired', name: 'Expired', scope: { kind: 'products' as const, productIds: ['product-2'], excludedProductIds: [] } };
    await repository.save('route-shop', active, 0);
    const activePublication = await repository.beginPublication('route-shop', active.id, 1, 'publish');
    await repository.finishPublication('route-shop', active.id, 1, 'publish', 'active-delete-1', activePublication.owner);
    await repository.save('route-shop', expired, 0);
    const expiredPublication = await repository.beginPublication('route-shop', expired.id, 1, 'publish');
    await repository.finishPublication('route-shop', expired.id, 1, 'publish', 'expired-delete-1', expiredPublication.owner);
    const pause = await repository.beginPublication('route-shop', expired.id, 2, 'pause');
    await repository.finishPublication('route-shop', expired.id, 2, 'pause', 'expired-delete-1', pause.owner);
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ discount_apps: [
      { app_discount_id: 'active-delete-1', status: 'active' },
      { app_discount_id: 'expired-delete-1', status: 'expired' },
    ] })));

    const response = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/campaigns/batch-delete', {
      method: 'POST', headers: { Authorization: `Bearer ${await jwt()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaigns: [{ id: active.id, expectedRevision: 2 }, { id: expired.id, expectedRevision: 3 }] }),
    }), testEnv, createExecutionContext());

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      batch: { id: expect.any(String) },
      results: [
        { id: active.id, outcome: 'requires_pause' },
        { id: expired.id, outcome: 'queued' },
      ],
    });
  });

  it.each([
    { status: 500, body: {}, expectedStatus: 500 },
    { status: 200, body: { metafields: [], fail_metafields: [{ errors: 'Metafield write rejected' }] }, expectedStatus: 409 },
  ])('returns a collection publication to idle when metafield write fails with HTTP $status before discount creation', async ({ status, body, expectedStatus }) => {
    const repository = new D1CampaignRepository(testEnv.DB);
    await repository.save('route-shop', {
      id: 'collection-draft', name: 'Collection draft', status: 'draft', startsAt: '2026-10-28T00:00:00.000Z',
      scope: { kind: 'collections', collectionIds: ['collection-1'], excludedProductIds: [] },
      tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 1, discountType: 'none' }],
      combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
    }, 0);
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/currency/currencies.json')) return new Response(JSON.stringify({ currencies: [{ currency: 'USD', enabled: true }] }));
      if (url.includes('/products/collections/collection-1.json')) return Response.json({ collection: { id: 'collection-1', handle: 'winter-collection' } });
      if (url.includes('/collections/collection-1/products.json')) return new Response(JSON.stringify({ products: [{ id: 'product-1' }] }));
      if (url.includes('/merchants/shop.json')) return new Response(JSON.stringify({ data: { id: '42' } }));
      if (url.includes('/metafields_set.json') && init?.method === 'POST') return new Response(JSON.stringify(body), { status, headers: { Traceid: 'collection-write-trace' } });
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetcher);
    const response = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/campaigns/collection-draft/status', {
      method: 'POST', headers: { Authorization: `Bearer ${await jwt()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active', expectedRevision: 1 }),
    }), testEnv, createExecutionContext());

    expect(response.status).toBe(expectedStatus);
    await expect(repository.getPublication('route-shop', 'collection-draft')).resolves.toEqual({ state: 'idle', discountId: null, nodeId: null, owner: null });
    expect(fetcher.mock.calls.some(([input]) => String(input).includes('discount_automatic_app'))).toBe(false);
    if (status === 200) {
      const diagnostic = await testEnv.DB.prepare('SELECT upstream_path, upstream_request_id, upstream_response_body FROM campaign_diagnostic_events WHERE campaign_id = ?').bind('collection-draft').first();
      expect(diagnostic).toMatchObject({ upstream_path: '/admin/openapi/v20260901/metafields_set.json', upstream_request_id: 'collection-write-trace' });
      expect(diagnostic?.upstream_response_body).toContain('Metafield write rejected');
    }
  });
});
