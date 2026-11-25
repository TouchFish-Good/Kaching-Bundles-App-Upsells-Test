import { env, createExecutionContext } from 'cloudflare:test';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import worker from '../src';
import { applyMigrations } from '../src/db/migrate';
import { D1CampaignRepository } from '../src/db/campaigns';
import { D1SubscriptionRepository } from '../src/db/subscriptions';
import { D1SessionStore } from '../src/db/sessions';
import type { CampaignScope } from '../src/domain/campaign';
import type { Env } from '../src/env';
let shop = 'os21-shop';
let merchantIndex = 0;
const encryptionKey = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY';
let clock = Date.now();
const testEnv = { ...(env as Env), SHOPLINE_APP_KEY: 'os21-test', TOKEN_ENCRYPTION_KEY: encryptionKey, now: () => clock } as Env;
async function publish(id: string, scope: CampaignScope) {
  const repository = new D1CampaignRepository(testEnv.DB);
  await repository.save(shop, { id, name: id, status: 'draft', scope, startsAt: '2026-01-01T00:00:00.000Z',
    tiers: [{ tierId: 'one', displayOrder: 0, quantity: 1, discountType: 'none' }],
    combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
  }, 0);
  const lease = await repository.beginPublication(shop, id, 1, 'publish', scope.resolvedProductIds ?? ['old-product']);
  await repository.finishPublication(shop, id, 1, 'publish', `discount-${id}`, lease.owner);
}
const collection = { kind: 'collections', collectionIds: ['category-21'], resolvedProductIds: ['old-product'], excludedProductIds: [] } as CampaignScope;
function request(extra: Record<string, string> = {}) {
  return worker.fetch(new Request(`https://raised-stability-gaps-html.trycloudflare.com/public/quantity-breaks/campaign?${new URLSearchParams({ shopId: '1726037928557', themeVersion: '2.1', productId: 'product-1', ...extra })}`), testEnv, createExecutionContext());
}
beforeEach(async () => {
  shop = `os21-shop-${++merchantIndex}`;
  clock += 61_000;
  await applyMigrations(testEnv.DB);
  await new D1SessionStore(testEnv.DB, encryptionKey).upsert({ handle: shop, storeId: '1726037928557', accessToken: 'os21-token', refreshToken: 'refresh', scope: 'read_products', expiresAt: '2099-01-01T00:00:00Z', installed: true });
  await new D1SubscriptionRepository(testEnv.DB).writeEntitlement({ appKey: testEnv.SHOPLINE_APP_KEY, handle: shop, state: 'active', featureKeys: ['quantity_breaks_access'], activeSubscriptionId: 'sub', activeSpuKey: 'ultra', validFrom: null, validUntil: null, graceUntil: null, autoRecurring: true, absenceConfirmations: 0 });
});
afterEach(() => vi.unstubAllGlobals());
it('resolves an installed shop ID, caches current membership and never exposes credentials', async () => {
  await publish('os21-collection', collection);
  const upstream = vi.fn(async (_url: string, _init?: RequestInit) => Response.json({ collects: [{ product_id: 'product-1', collection_id: 'category-21' }] }));
  vi.stubGlobal('fetch', upstream);
  for (let i = 0; i < 2; i++) {
    const response = await request(); expect(response.status).toBe(200);
    const body = await response.text(); expect(JSON.parse(body)).toMatchObject({ campaign: { id: 'os21-collection' } }); expect(body).not.toContain('os21-token');
  }
  expect(upstream).toHaveBeenCalledTimes(1);
  const [url, init] = upstream.mock.calls[0];
  expect(url).toBe(`https://${shop}.myshopline.com/admin/openapi/v20260601/products/collects.json?product_id=product-1&limit=250`);
  const headers = new Headers(init?.headers);
  expect(headers.get('Authorization')).toBe('Bearer os21-token'); expect(headers.get('Accept')).toBe('application/json');
  expect(headers.get('Content-Type')).toBe('application/json; charset=utf-8'); expect(headers.get('User-Agent')).toBe('SHOPLINE-Quantity-Breaks-App/1.0');
});
it('follows Link cursors but never follows a supplied upstream host', async () => {
  await publish('os21-pages', { ...collection, collectionIds: ['last-category'] });
  const upstream = vi.fn(async (url: string) => new URL(url).searchParams.has('page_info')
    ? Response.json({ collects: [{ product_id: 'product-1', collection_id: 'last-category' }] })
    : Response.json({ collects: [{ product_id: 'product-1', collection_id: 'first-category' }] }, { headers: { Link: '<https://untrusted.example/path?page_info=next%3D>; rel="next"' } }));
  vi.stubGlobal('fetch', upstream);
  expect((await request()).status).toBe(200); expect(upstream).toHaveBeenCalledTimes(2);
  expect(upstream.mock.calls[1][0]).toContain(`${shop}.myshopline.com/admin/openapi/v20260601/products/collects.json?`);
  expect(new URL(upstream.mock.calls[1][0]).searchParams.get('page_info')).toBe('next=');
});
it('prefers a product offer without calling the classification API', async () => {
  await publish('os21-collection', collection);
  await publish('os21-product', { kind: 'products', productIds: ['product-1'], excludedProductIds: [] });
  const upstream = vi.fn(); vi.stubGlobal('fetch', upstream);
  const response = await request(); expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ campaign: { id: 'os21-product' } }); expect(upstream).not.toHaveBeenCalled();
});
it('does not use stale snapshots after membership changes or upstream failure', async () => {
  await publish('os21-stale', { ...collection, resolvedProductIds: ['product-1'] });
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ collects: [] })));
  expect((await request()).status).toBe(404);
  clock += 61_000;
  vi.stubGlobal('fetch', vi.fn(async () => new Response('rate limited', { status: 429 })));
  expect((await request()).status).toBe(503);
});
it('rejects mismatched identities and never queries Admin for uninstalled or unknown shops', async () => {
  const upstream = vi.fn(); vi.stubGlobal('fetch', upstream);
  expect((await request({ shop: 'another-shop' })).status).toBe(400);
  expect((await request({ shopId: '999999' })).status).toBe(404);
  await new D1SessionStore(testEnv.DB, encryptionKey).markUninstalled(shop);
  expect((await request()).status).toBe(404); expect(upstream).not.toHaveBeenCalled();
});
it('merges concurrent reads and refreshes membership after the short cache expires', async () => {
  await publish('os21-dedup', collection);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const upstream = vi.fn(async () => { await gate; return Response.json({ collects: [{ product_id: 'product-1', collection_id: 'category-21' }] }); });
  vi.stubGlobal('fetch', upstream);
  const reads = [request(), request()];
  release();
  expect((await Promise.all(reads)).map(response => response.status)).toEqual([200, 200]);
  expect(upstream).toHaveBeenCalledTimes(1);
  clock += 61_000;
  expect((await request()).status).toBe(200); expect(upstream).toHaveBeenCalledTimes(2);
});
it.each(['invalid', 'loop', 'too-many-pages'])('fails closed for %s collection responses', async mode => {
  await publish('os21-invalid', { ...collection, resolvedProductIds: ['product-1'] });
  let page = 0;
  const upstream = vi.fn(async () => {
    page++;
    return Response.json({ collects: [{ product_id: mode === 'invalid' ? 'different-product' : 'product-1', collection_id: 'category-21' }] },
      { headers: mode === 'invalid' ? {} : { Link: `<https://example.com/?page_info=${mode === 'loop' ? 'same' : page}>; rel="next"` } });
  });
  vi.stubGlobal('fetch', upstream);
  expect((await request()).status).toBe(503);
  expect(upstream.mock.calls.length).toBeLessThanOrEqual(4);
  const count = upstream.mock.calls.length;
  expect((await request()).status).toBe(503); expect(upstream).toHaveBeenCalledTimes(count);
});
it('respects entitlement and product exclusions before calling Admin', async () => {
  await publish('os21-excluded', { ...collection, excludedProductIds: ['product-1'] });
  const upstream = vi.fn(); vi.stubGlobal('fetch', upstream);
  expect((await request()).status).toBe(404);
  await new D1SubscriptionRepository(testEnv.DB).writeEntitlement({ appKey: testEnv.SHOPLINE_APP_KEY, handle: shop, state: 'inactive', featureKeys: [], activeSubscriptionId: null, activeSpuKey: null, validFrom: null, validUntil: null, graceUntil: null, autoRecurring: false, absenceConfirmations: 0 });
  expect((await request()).status).toBe(404); expect(upstream).not.toHaveBeenCalled();
});

it('spaces different product reads for one merchant and applies merchant-wide 429 cooldown', async () => {
  await publish('os21-throttle', collection);
  const starts: number[] = [];
  let blocked = false;
  const upstream = vi.fn(async (url: string) => {
    starts.push(Date.now());
    return blocked ? new Response('{}', { status: 429, headers: { 'Retry-After': '10' } }) : Response.json({ collects: [{ product_id: new URL(url).searchParams.get('product_id'), collection_id: 'category-21' }] });
  });
  vi.stubGlobal('fetch', upstream);
  const results = await Promise.all([request({ productId: 'other-1' }), request({ productId: 'other-2' })]);
  expect(results.map(response => response.status)).toEqual([200, 200]);
  expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(450);
  blocked = true;
  expect((await request({ productId: 'other-3' })).status).toBe(503);
  const count = upstream.mock.calls.length;
  expect((await request({ productId: 'other-4' })).status).toBe(503);
  expect(upstream).toHaveBeenCalledTimes(count);
});
