import { env, createExecutionContext } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import worker from '../src';
import { hmacHex } from '../src/crypto';
import { D1CampaignRepository } from '../src/db/campaigns';
import { D1CampaignDiagnostics } from '../src/db/campaign-diagnostics';
import { applyMigrations } from '../src/db/migrate';
import { D1SessionStore } from '../src/db/sessions';
import { D1SubscriptionRepository } from '../src/db/subscriptions';
import type { CampaignDraft } from '../src/domain/campaign';
import type { Env } from '../src/env';

const now = Date.parse('2026-11-03T00:00:00.000Z');
const testEnv = {
  ...(env as Env),
  ADMIN_INTERNAL_SECRET: 'developer-platform-secret',
  SHOPLINE_APP_KEY: 'quantity-breaks',
  TOKEN_ENCRYPTION_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY',
  now: () => now,
} as Env;
const traceId = '550e8400-e29b-41d4-a716-446655440000';

const campaign: CampaignDraft = {
  id: 'campaign-1', name: '秋季多件折扣', status: 'draft', startsAt: '2026-11-01T00:00:00.000Z',
  scope: { kind: 'products', productIds: ['product-1'], excludedProductIds: [] },
  tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 2, discountType: 'percentage', discountValue: 1000, label: '两件九折' }],
  combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
};

function discountApps(discountId: string, status: 'active' | 'inactive' | 'expired') {
  return Response.json({ discount_apps: [{ app_discount_id: discountId, status }] });
}

async function signedRequest(method: 'GET' | 'POST', path: string, body?: Record<string, unknown>): Promise<Request> {
  const timestamp = String(now);
  const nonce = crypto.randomUUID();
  const signature = await hmacHex(testEnv.ADMIN_INTERNAL_SECRET, `${method}\n${path}\n${timestamp}\n${nonce}\n${traceId}`);
  return new Request(`https://raised-stability-gaps-html.trycloudflare.com${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-admin-timestamp': timestamp,
      'x-admin-nonce': nonce,
      'x-admin-signature': signature,
      'x-trace-id': traceId,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe('developer-platform campaign operations', () => {
  let repository: D1CampaignRepository;

  beforeEach(async () => {
    vi.unstubAllGlobals();
    await applyMigrations(testEnv.DB);
    await testEnv.DB.batch([
      testEnv.DB.prepare('DELETE FROM internal_request_nonces'),
      testEnv.DB.prepare('DELETE FROM campaign_diagnostic_events'),
      testEnv.DB.prepare('DELETE FROM quantity_breaks_collection_conflicts'),
      testEnv.DB.prepare('DELETE FROM quantity_breaks_staged_updates'),
      testEnv.DB.prepare('DELETE FROM quantity_breaks_publications'),
      testEnv.DB.prepare('DELETE FROM quantity_breaks_campaigns'),
      testEnv.DB.prepare('DELETE FROM quantity_breaks_shop_locks'),
      testEnv.DB.prepare('DELETE FROM quantity_breaks_entitlements'),
      testEnv.DB.prepare('DELETE FROM admin_installations'),
      testEnv.DB.prepare('DELETE FROM admin_stores'),
      testEnv.DB.prepare('DELETE FROM shopline_sessions'),
    ]);
    const sessions = new D1SessionStore(testEnv.DB, testEnv.TOKEN_ENCRYPTION_KEY, () => new Date(now));
    await sessions.upsert({ handle: 'merchant-alpha', storeId: '42', accessToken: 'merchant-access-token', refreshToken: 'merchant-refresh-token', scope: 'write_discounts', expiresAt: '2099-01-01T00:00:00.000Z', installed: true });
    await sessions.recordInstallation({ storeId: '42', handle: 'merchant-alpha', scope: 'write_discounts', at: new Date(now).toISOString() });
    repository = new D1CampaignRepository(testEnv.DB, () => now);
    await repository.save('merchant-alpha', campaign, 0);
    const publication = await repository.beginPublication('merchant-alpha', campaign.id, 1, 'publish');
    await repository.finishPublication('merchant-alpha', campaign.id, 1, 'publish', 'discount-1', publication.owner);
  });

  it('returns campaign summaries for an installed store without access tokens', async () => {
    const path = '/internal/admin-read/v1/stores/42/campaigns';
    const response = await worker.fetch(await signedRequest('GET', path), testEnv, createExecutionContext());

    expect(response.status).toBe(200);
    const payload = await response.json() as { data: { items: unknown[] } };
    expect(payload).toMatchObject({
      data: { items: [expect.objectContaining({ id: 'campaign-1', name: '秋季多件折扣', status: 'active', revision: 2 })] },
    });
    expect(JSON.stringify(payload)).not.toContain('merchant-access-token');
  });

  it('lists campaigns across all installed stores with safe platform state', async () => {
    await new D1SessionStore(testEnv.DB, testEnv.TOKEN_ENCRYPTION_KEY, () => new Date(now)).upsert({
      handle: 'merchant-beta', storeId: '43', accessToken: 'merchant-beta-token', refreshToken: 'merchant-beta-refresh',
      scope: 'write_discounts', expiresAt: '2099-01-01T00:00:00.000Z', installed: true,
    });
    await new D1SessionStore(testEnv.DB, testEnv.TOKEN_ENCRYPTION_KEY, () => new Date(now)).recordInstallation({ storeId: '43', handle: 'merchant-beta', scope: 'write_discounts', at: new Date(now).toISOString() });
    await new D1CampaignRepository(testEnv.DB, () => now).save('merchant-beta', { ...campaign, id: 'campaign-2', name: '冬季折扣' }, 0);
    const response = await worker.fetch(await signedRequest('GET', '/internal/admin-read/v1/campaigns?limit=25&offset=0'), testEnv, createExecutionContext());

    expect(response.status).toBe(200);
    const payload = await response.json() as { data: { items: unknown[] } };
    expect(payload.data.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ storeId: '42', shopHandle: 'merchant-alpha', platformDiscountState: 'active' }),
      expect.objectContaining({ storeId: '43', shopHandle: 'merchant-beta', platformDiscountState: null }),
    ]));
    expect(JSON.stringify(payload)).not.toContain('discount-1');
  });

  it('omits market override objects from global campaign summaries', async () => {
    await testEnv.DB.prepare('UPDATE quantity_breaks_campaigns SET campaign_json = ? WHERE shop_handle = ? AND id = ?').bind(JSON.stringify({
      ...campaign, status: 'active',
      tiers: [{ ...campaign.tiers[0], discountType: 'fixed_price', discountValue: 1200, marketOverrides: { primary: { mode: 'specified_amount', currencyCode: 'USD', amountMinor: 1200 } } }],
    }), 'merchant-alpha', 'campaign-1').run();

    const response = await worker.fetch(await signedRequest('GET', '/internal/admin-read/v1/campaigns?status=active&limit=100&offset=0'), testEnv, createExecutionContext());

    expect(response.status).toBe(200);
    const payload = await response.json() as { data: { items: Array<{ tiers: Array<Record<string, unknown>> }> } };
    expect(payload.data.items[0]?.tiers[0]).not.toHaveProperty('marketOverrides');
  });

  it('keeps campaign-list database reads bounded as installed stores grow', async () => {
    const sessions = new D1SessionStore(testEnv.DB, testEnv.TOKEN_ENCRYPTION_KEY, () => new Date(now));
    for (let index = 0; index < 20; index += 1) {
      const handle = `empty-shop-${index}`;
      await sessions.recordInstallation({ storeId: String(100 + index), handle, scope: 'write_discounts', at: new Date(now).toISOString() });
    }
    const statements: string[] = [];
    const database = new Proxy(testEnv.DB, {
      get(target, property) {
        if (property === 'prepare') return (sql: string) => { statements.push(sql); return target.prepare(sql); };
        const value = Reflect.get(target, property);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const response = await worker.fetch(await signedRequest('GET', '/internal/admin-read/v1/campaigns?limit=1&offset=0'), { ...testEnv, DB: database }, createExecutionContext());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { total: 1, items: [{ id: 'campaign-1', platformDiscountState: 'active' }] } });
    expect(statements.filter((sql) => /^SELECT/i.test(sql.trim()) && /quantity_breaks_(campaigns|publications)/.test(sql))).toHaveLength(2);
  });

  it('filters expired campaign pages before counting and paginating, with literal Unicode search', async () => {
    await repository.save('merchant-alpha', { ...campaign, id: 'paused-1', status: 'paused', name: '夏季 100%_折扣' }, 0);
    await repository.save('merchant-alpha', { ...campaign, id: 'paused-2', status: 'paused', name: '夏季 100%_折扣二' }, 0);
    await repository.save('merchant-alpha', { ...campaign, id: 'other', status: 'paused', name: '夏季 100XX折扣' }, 0);
    await repository.save('uninstalled-shop', { ...campaign, id: 'hidden', status: 'paused', name: '夏季 100%_折扣' }, 0);

    const query = new URLSearchParams({ status: 'expired', query: '100%_折扣', limit: '1', offset: '1' });
    for (const path of ['/internal/admin-read/v1/campaigns', '/internal/admin-read/v1/stores/42/campaigns']) {
      const response = await worker.fetch(await signedRequest('GET', `${path}?${query}`), testEnv, createExecutionContext());
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ data: { total: 2, items: [{ id: 'paused-2' }] } });
    }
  });

  it('groups merchant handles before pagination and orders each merchant by latest update', async () => {
    await new D1SessionStore(testEnv.DB, '', () => new Date(now)).recordInstallation({ storeId: '43', handle: 'merchant-beta', scope: 'write_discounts', at: new Date(now).toISOString() });
    await repository.save('merchant-alpha', { ...campaign, id: 'alpha-latest' }, 0);
    await repository.save('merchant-beta', { ...campaign, id: 'beta-latest' }, 0);
    await testEnv.DB.prepare("UPDATE quantity_breaks_campaigns SET updated_at = ? WHERE id = 'campaign-1'").bind('2026-10-01T00:00:00Z').run();
    await testEnv.DB.prepare("UPDATE quantity_breaks_campaigns SET updated_at = ? WHERE id = 'beta-latest'").bind('2026-12-01T00:00:00Z').run();
    const response = await worker.fetch(await signedRequest('GET', '/internal/admin-read/v1/campaigns?limit=2&offset=0'), testEnv, createExecutionContext());
    expect(response.status).toBe(200);
    const result = await response.json() as { data: { total: number; items: Array<{ id: string; shopHandle: string }> } };
    expect(result.data.total).toBe(3);
    expect(result.data.items.map(item => [item.shopHandle, item.id])).toEqual([['merchant-alpha', 'alpha-latest'], ['merchant-alpha', 'campaign-1']]);
    const second = await worker.fetch(await signedRequest('GET', '/internal/admin-read/v1/campaigns?limit=2&offset=2'), testEnv, createExecutionContext());
    expect(await second.json()).toMatchObject({ data: { items: [{ shopHandle: 'merchant-beta' }] } });
  });

  it('returns an empty page with the filtered total and excludes uninstalled stores', async () => {
    const response = await worker.fetch(await signedRequest('GET', '/internal/admin-read/v1/campaigns?limit=1&offset=100'), testEnv, createExecutionContext());
    await expect(response.json()).resolves.toMatchObject({ data: { total: 1, items: [] } });
    await testEnv.DB.prepare("UPDATE admin_stores SET status = 'uninstalled' WHERE store_id = '42'").run();
    const hidden = await worker.fetch(await signedRequest('GET', '/internal/admin-read/v1/campaigns'), testEnv, createExecutionContext());
    await expect(hidden.json()).resolves.toMatchObject({ data: { total: 0, items: [] } });
  });

  it('adds Chinese developer-console display values without changing stored discount values', async () => {
    await testEnv.DB.prepare('UPDATE quantity_breaks_campaigns SET campaign_json = ? WHERE shop_handle = ? AND id = ?').bind(JSON.stringify({
      ...campaign,
      discountName: '购物车与结账折扣名',
      combinesWith: { orderDiscounts: true, productDiscounts: false, shippingDiscounts: true },
      tiers: [
        { tierId: 'original', displayOrder: 0, quantity: 1, discountType: 'none' },
        { tierId: 'percentage', displayOrder: 1, quantity: 2, discountType: 'percentage', discountValue: 1234 },
        { tierId: 'amount', displayOrder: 2, quantity: 3, discountType: 'fixed_amount', discountValue: 200, marketOverrides: { 'market-us': { mode: 'specified_amount', currencyCode: 'USD', amountMinor: 250 } } },
        { tierId: 'price', displayOrder: 3, quantity: 4, discountType: 'fixed_price', discountValue: 200 },
        { tierId: 'bundle-amount', displayOrder: 4, quantity: 5, discountType: 'bundle_fixed_amount', discountValue: 200 },
        { tierId: 'bundle-price', displayOrder: 5, quantity: 6, discountType: 'bundle_fixed_price', discountValue: 200 },
      ],
    }), 'merchant-alpha', 'campaign-1').run();

    const response = await worker.fetch(await signedRequest('GET', '/internal/admin-read/v1/campaigns?limit=25&offset=0'), testEnv, createExecutionContext());

    expect(response.status).toBe(200);
    const payload = await response.json() as { data: { items: Array<{ tiers: Array<Record<string, unknown>> }> } };
    expect(payload.data.items[0]?.tiers).toEqual([
      expect.objectContaining({ discountType: 'none', discountTypeDisplay: '原价' }),
      expect.objectContaining({ discountType: 'percentage', discountValue: 1234, discountTypeDisplay: '百分比折扣', discountValueDisplay: '12.34%' }),
      expect.objectContaining({ discountType: 'fixed_amount', discountValue: 200, discountTypeDisplay: '每件固定减免', discountValueDisplay: '200' }),
      expect.objectContaining({ discountType: 'fixed_price', discountValue: 200, discountTypeDisplay: '每件固定价格', discountValueDisplay: '200' }),
      expect.objectContaining({ discountType: 'bundle_fixed_amount', discountValue: 200, discountTypeDisplay: '整单固定减免', discountValueDisplay: '200' }),
      expect.objectContaining({ discountType: 'bundle_fixed_price', discountValue: 200, discountTypeDisplay: '整单固定价格', discountValueDisplay: '200' }),
    ]);
    expect(payload.data.items[0]?.tiers[0]).not.toHaveProperty('discountValueDisplay');

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/markets.json')) return Response.json({ markets: [{ market_id: 'market-us', market_name: '美国市场', currency_code: 'USD', enabled: true }] });
      if (url.includes('/currency/currencies.json')) return Response.json({ currencies: [{ currency: 'USD', enabled: true }] });
      throw new Error(`Unexpected request: ${url}`);
    }));
    const detailResponse = await worker.fetch(await signedRequest('GET', '/internal/admin-read/v1/stores/42/campaigns/campaign-1'), testEnv, createExecutionContext());

    expect(detailResponse.status).toBe(200);
    const detailPayload = await detailResponse.json() as { data: { shopHandle?: string; discountName?: string; combinesWith?: unknown; tiers: Array<Record<string, unknown>> } };
    expect(detailPayload.data).toMatchObject({
      shopHandle: 'merchant-alpha',
      discountName: '购物车与结账折扣名',
      combinesWith: { orderDiscounts: true, productDiscounts: false, shippingDiscounts: true },
    });
    expect(detailPayload.data.tiers).toEqual(expect.arrayContaining([
      expect.objectContaining({ discountType: 'percentage', discountTypeDisplay: '百分比折扣', discountValueDisplay: '12.34%' }),
      expect.objectContaining({ discountType: 'fixed_amount', discountTypeDisplay: '每件固定减免', discountValueDisplay: '200' }),
      expect.objectContaining({ discountType: 'bundle_fixed_price', discountTypeDisplay: '整单固定价格', discountValueDisplay: '200' }),
      expect.objectContaining({ discountType: 'fixed_amount', marketOverrides: [{ marketId: 'market-us', marketName: '美国市场', mode: 'specified_amount', currencyCode: 'USD', amountMinor: 250 }] }),
    ]));
  });

  it('returns a safe subscription summary for installed stores', async () => {
    await new D1SubscriptionRepository(testEnv.DB, () => now).writeEntitlement({
      appKey: 'quantity-breaks', handle: 'merchant-alpha', state: 'active', featureKeys: ['quantity-breaks'],
      activeSubscriptionId: 'subscription-private', activeSpuKey: 'ultra', validFrom: now,
      validUntil: now + 2_592_000_000, graceUntil: null, autoRecurring: true, absenceConfirmations: 0,
    });

    const response = await worker.fetch(await signedRequest('GET', '/internal/admin-read/v1/stores?status=installed&limit=10&offset=0'), testEnv, createExecutionContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { items: [expect.objectContaining({
        storeId: '42', handle: 'merchant-alpha', subscription: {
          state: 'active', plan: 'ultra', validUntil: now + 2_592_000_000, graceUntil: null, lastVerifiedAt: now, nextStartsAt: null, nextEndsAt: null,
        },
      })] },
    });
  });

  it('pauses through the Function update endpoint and keeps the platform discount', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ currencies: [{ currency: 'USD', enabled: true }] }))
      .mockResolvedValueOnce(Response.json({ app_discount_id: 'discount-1' }))
      .mockResolvedValueOnce(discountApps('discount-1', 'expired'));
    vi.stubGlobal('fetch', fetcher);
    const response = await worker.fetch(await signedRequest('POST', '/internal/admin/v1/stores/42/campaigns/campaign-1/pause', { expectedRevision: 2, reason: '紧急排障' }), testEnv, createExecutionContext());

    expect(response.status).toBe(200);
    expect(fetcher.mock.calls[0][0]).toContain('/currency/currencies.json');
    expect(fetcher.mock.calls[1][0]).toContain('/sales/discount_automatic_app/discount-1.json');
    expect(fetcher.mock.calls[1][1]).toMatchObject({ method: 'PUT' });
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toMatchObject({
      title: campaign.name,
      function_id: '754292a155d740809a5437a3f8c59231',
      starts_at: campaign.startsAt,
      ends_at: '2026-11-03T00:00:10.000Z',
    });
    await expect(repository.getPublication('merchant-alpha', 'campaign-1')).resolves.toMatchObject({ state: 'paused', discountId: 'discount-1' });
  });

  it('replaces an expired paused discount when an administrator activates the campaign', async () => {
    const publication = await repository.beginPublication('merchant-alpha', 'campaign-1', 2, 'pause');
    await repository.finishPublication('merchant-alpha', 'campaign-1', 2, 'pause', 'discount-1', publication.owner);
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/sales/discount_app.json')) {
        const reads = fetcher.mock.calls.filter(([request]) => String(request).includes('/sales/discount_app.json')).length;
        return Response.json({ discount_apps: reads === 1 ? [{ app_discount_id: 'discount-1', status: 'expired' }] : reads === 2 ? [] : [{ app_discount_id: 'discount-2', status: 'active' }] });
      }
      if (url.includes('/products/products.json')) return Response.json({ products: [{ id: 'product-1', handle: 'fresh-serum' }] });
      if (url.includes('/currency/currencies.json')) return Response.json({ currencies: [{ currency: 'USD', enabled: true }] });
      if (url.includes('/sales/discount_automatic_app.json') && init?.method === 'POST') return Response.json({ app_discount_id: 'discount-2' });
      if (url.includes('/admin/openapi/v20261201/sales/discount_apps/')) return Response.json({ success: true });
      throw new Error(`Unexpected platform request: ${url}`);
    });
    vi.stubGlobal('fetch', fetcher);

    const response = await worker.fetch(await signedRequest('POST', '/internal/admin/v1/stores/42/campaigns/campaign-1/activate', { expectedRevision: 3, reason: '恢复活动' }), testEnv, createExecutionContext());

    expect(response.status).toBe(200);
    expect(fetcher.mock.calls.some(([input, init]) => String(input).includes('/sales/discount_automatic_app.json') && (init as RequestInit).method === 'POST')).toBe(true);
    expect(fetcher.mock.calls.some(([input]) => String(input).includes('/currency/currencies.json'))).toBe(true);
    const payload = await response.json() as { data: { outcome: string; campaign: { id: string } } };
    expect(payload.data.outcome).toBe('activated');
    expect(payload.data.campaign.id).not.toBe('campaign-1');
    await expect(repository.getPublication('merchant-alpha', payload.data.campaign.id)).resolves.toMatchObject({ state: 'active', discountId: 'discount-2' });
    await expect(repository.get('merchant-alpha', payload.data.campaign.id)).resolves.toMatchObject({ scope: { productHandles: { 'product-1': 'fresh-serum' } } });
    await expect(repository.get('merchant-alpha', 'campaign-1')).resolves.toBeNull();
  });

  it('keeps an accepted activation pending and confirms it by reading the replacement without another create', async () => {
    const paused = await repository.beginPublication('merchant-alpha', 'campaign-1', 2, 'pause');
    await repository.finishPublication('merchant-alpha', 'campaign-1', 2, 'pause', 'discount-1', paused.owner);
    let visible = false, deleted = false;
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/sales/discount_app.json')) return Response.json({ discount_apps: [
        ...(!deleted ? [{ app_discount_id: 'discount-1', status: 'expired' }] : []),
        ...(visible ? [{ app_discount_id: 'discount-2', status: 'active', node_id: 'gid://shopline/DiscountAutomaticNode/discount-2' }] : []),
      ] });
      if (url.includes('/products/products.json')) return Response.json({ products: [{ id: 'product-1', handle: 'fresh-serum' }] });
      if (url.includes('/currency/currencies.json')) return Response.json({ currencies: [{ currency: 'USD', enabled: true }] });
      if (init?.method === 'POST' && url.includes('/sales/discount_automatic_app.json')) return Response.json({ app_discount_id: 'discount-2' });
      if (init?.method === 'DELETE') { deleted = true; return new Response(null, { status: 204 }); }
      throw new Error(`Unexpected platform request: ${url}`);
    });
    vi.stubGlobal('fetch', fetcher);
    const response = await worker.fetch(await signedRequest('POST', '/internal/admin/v1/stores/42/campaigns/campaign-1/activate', { expectedRevision: 3 }), testEnv, createExecutionContext());
    expect(response.status).toBe(200);
    const payload = await response.json() as { data: { outcome: string; campaign: { id: string; activationPending: boolean } } };
    expect(payload.data.outcome).toBe('activation_pending');
    expect(payload.data.campaign.activationPending).toBe(true);
    expect(payload.data.campaign.id).not.toBe('campaign-1');
    visible = true;
    const detail = await worker.fetch(await signedRequest('GET', `/internal/admin-read/v1/stores/42/campaigns/${payload.data.campaign.id}`), testEnv, createExecutionContext());
    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({ data: { id: payload.data.campaign.id, status: 'active', activationPending: false } });
    expect(fetcher.mock.calls.filter(([input, init]) => String(input).includes('/sales/discount_automatic_app.json') && init?.method === 'POST')).toHaveLength(1);
  });

  it('rejects a stale activation before platform calls', async () => {
    const paused = await repository.beginPublication('merchant-alpha', 'campaign-1', 2, 'pause');
    await repository.finishPublication('merchant-alpha', 'campaign-1', 2, 'pause', 'discount-1', paused.owner);
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const response = await worker.fetch(await signedRequest('POST', '/internal/admin/v1/stores/42/campaigns/campaign-1/activate', { expectedRevision: 2 }), testEnv, createExecutionContext());
    expect(response.status).toBe(409);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('deletes only the platform discount and keeps the application campaign paused', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(discountApps('discount-1', 'active'))
      .mockResolvedValueOnce(Response.json({ success: true }))
      .mockResolvedValueOnce(Response.json({ discount_apps: [] }));
    vi.stubGlobal('fetch', fetcher);
    const response = await worker.fetch(await signedRequest('POST', '/internal/admin/v1/stores/42/campaigns/campaign-1/platform-delete', { expectedRevision: 2, reason: '移除平台折扣' }), testEnv, createExecutionContext());

    expect(response.status).toBe(200);
    await expect(repository.get('merchant-alpha', 'campaign-1')).resolves.toMatchObject({ status: 'paused' });
    await expect(repository.getPublication('merchant-alpha', 'campaign-1')).resolves.toMatchObject({ state: 'removed', discountId: null, stateReason: 'platform_deleted' });
    await expect(testEnv.DB.prepare('SELECT event_type FROM campaign_diagnostic_events ORDER BY occurred_at DESC LIMIT 1').first())
      .resolves.toEqual({ event_type: 'campaign_platform_delete' });
    await expect(testEnv.DB.prepare('SELECT upstream_path FROM campaign_diagnostic_events ORDER BY occurred_at DESC LIMIT 1').first())
      .resolves.toEqual({ upstream_path: '/admin/openapi/v20261201/sales/discount_apps/754292a155d740809a5437a3f8c59231/discount-1.json' });
    expect(JSON.stringify(await response.json())).not.toContain('discount-1');
  });

  it('blocks collection overlap before calling SHOPLINE and returns verified collection titles', async () => {
    const target = {
      ...campaign,
      id: 'campaign-collection',
      name: '恢复活动',
      status: 'paused' as const,
      scope: { kind: 'collections' as const, collectionIds: ['collection-1'], resolvedProductIds: ['product-1'], excludedProductIds: [] },
    };
    const other = { ...target, id: 'campaign-existing', name: '冬季活动', status: 'paused' as const };
    await repository.save('merchant-alpha', target, 0);
    const targetPublication = await repository.beginPublication('merchant-alpha', target.id, 1, 'publish', ['product-1']);
    await repository.finishPublication('merchant-alpha', target.id, 1, 'publish', 'discount-target', targetPublication.owner);
    const paused = await repository.beginPublication('merchant-alpha', target.id, 2, 'pause');
    await repository.finishPublication('merchant-alpha', target.id, 2, 'pause', 'discount-target', paused.owner);
    await repository.save('merchant-alpha', other, 0);
    const publication = await repository.beginPublication('merchant-alpha', other.id, 1, 'publish', ['product-1']);
    await repository.finishPublication('merchant-alpha', other.id, 1, 'publish', 'discount-collection', publication.owner);
    const fetcher = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input).includes('/sales/discount_app.json')) return Response.json({ discount_apps: [
        { app_discount_id: 'discount-target', status: 'expired' },
        { app_discount_id: 'discount-collection', status: 'active' },
        { app_discount_id: 'discount-1', status: 'active' },
      ] });
      return Response.json({ collection: { id: 'collection-1', title: '冬季精选' } });
    });
    vi.stubGlobal('fetch', fetcher);

    const response = await worker.fetch(await signedRequest('POST', '/internal/admin/v1/stores/42/campaigns/campaign-collection/activate', { expectedRevision: 3, reason: '恢复活动' }), testEnv, createExecutionContext());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ conflicts: [expect.objectContaining({ campaignId: 'campaign-existing', overlap: { type: 'collections', ids: ['collection-1'], names: ['冬季精选'] } })] });
    expect(fetcher.mock.calls.some(([input]) => String(input).includes('/products/collections/collection-1.json?fields=id,title'))).toBe(true);
    expect(fetcher.mock.calls.some(([, init]) => init?.method === 'POST' || init?.method === 'DELETE')).toBe(false);
  });

  it('rejects a stale emergency pause revision without calling SHOPLINE', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const path = '/internal/admin/v1/stores/42/campaigns/campaign-1/pause';
    const response = await worker.fetch(await signedRequest('POST', path, { expectedRevision: 1, reason: '紧急排障' }), testEnv, createExecutionContext());

    expect(response.status).toBe(409);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('records an uncertain upstream pause and does not return success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 504 })));
    const path = '/internal/admin/v1/stores/42/campaigns/campaign-1/pause';
    const response = await worker.fetch(await signedRequest('POST', path, { expectedRevision: 2, reason: '紧急排障' }), testEnv, createExecutionContext());

    expect(response.status).toBe(503);
    await expect(repository.get('merchant-alpha', 'campaign-1')).resolves.toMatchObject({ status: 'active', revision: 2 });
    await expect(testEnv.DB.prepare('SELECT trace_id, event_type, outcome, upstream_status FROM campaign_diagnostic_events').first())
      .resolves.toEqual({ trace_id: traceId, event_type: 'campaign_pause', outcome: 'uncertain', upstream_status: 504 });
  });

  it('returns only allowlisted diagnostic event fields for an exact trace lookup', async () => {
    await new D1CampaignDiagnostics(testEnv.DB, () => now).record({
      traceId,
      workerName: 'shopline-quantity-breaks',
      storeId: '42',
      shopHandle: 'merchant-alpha',
      campaignId: 'campaign-1',
      eventType: 'campaign_pause',
      outcome: 'failure',
      upstreamService: 'SHOPLINE',
      upstreamPath: '/sales/discount_app.json?discount_type=automatic&function_id=function-id',
      upstreamStatus: 422,
      upstreamRequestId: 'shopline-request-1',
      errorCode: 'UPSTREAM_REJECTED',
      durationMs: 42,
    });
    const path = `/internal/admin-read/v1/diagnostics?traceId=${traceId}&limit=25&offset=0`;
    const response = await worker.fetch(await signedRequest('GET', path), testEnv, createExecutionContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { total: 1, items: [expect.objectContaining({ traceId, upstreamRequestId: 'shopline-request-1', errorCode: 'UPSTREAM_REJECTED' })] },
    });
  });
});
