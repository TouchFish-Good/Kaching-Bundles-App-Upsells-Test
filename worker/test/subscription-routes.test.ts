import { env, createExecutionContext } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import worker from '../src';
import { hmacHex } from '../src/crypto';
import { applyMigrations } from '../src/db/migrate';
import { D1SessionStore } from '../src/db/sessions';
import { D1SubscriptionRepository } from '../src/db/subscriptions';
import type { Env } from '../src/env';

const key = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY';
const secret = 'subscription-route-secret';
const testEnv = { ...(env as Env), SHOPLINE_APP_KEY: 'subscription-route-key', SHOPLINE_APP_SECRET: secret, TOKEN_ENCRYPTION_KEY: key, SHOPLINE_APP_URL: 'https://app.example', SHOPLINE_PARTNER_ACCESS_TOKEN: 'partner-token' } as Env;

function base64Url(value: string): string {
  return btoa(value).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function jwt(): Promise<string> {
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64Url(JSON.stringify({ aud: 'subscription-route-key', handle: 'subscription-shop', exp: 1_900_000_000 }));
  const bytes = await hmacHex(btoa(secret), `${header}.${payload}`);
  const signature = base64Url(String.fromCharCode(...(bytes.match(/.{2}/g) ?? []).map((part) => Number.parseInt(part, 16))));
  return `${header}.${payload}.${signature}`;
}

describe('subscription routes', () => {
  beforeEach(async () => {
    await applyMigrations(testEnv.DB);
    await testEnv.DB.batch([
      testEnv.DB.prepare('DELETE FROM quantity_breaks_subscription_operations'),
      testEnv.DB.prepare('DELETE FROM quantity_breaks_subscription_orders'),
      testEnv.DB.prepare('DELETE FROM quantity_breaks_trial_ledger'),
      testEnv.DB.prepare('DELETE FROM quantity_breaks_entitlements'),
      testEnv.DB.prepare('DELETE FROM shopline_sessions'),
    ]);
    await new D1SessionStore(testEnv.DB, key).upsert({
      handle: 'subscription-shop', accessToken: 'access', refreshToken: 'refresh', scope: 'read_products',
      expiresAt: '2030-01-01T00:00:00.000Z', installed: true,
    });
  });

  it('returns the current entitlement projection and plan price', async () => {
    await new D1SubscriptionRepository(testEnv.DB).writeEntitlement({
      appKey: testEnv.SHOPLINE_APP_KEY, handle: 'subscription-shop', state: 'grace', featureKeys: ['quantity_breaks_access'],
      activeSubscriptionId: 'sub-1', activeSpuKey: 'ultra', validFrom: 1_700_000_000_000, validUntil: 1_900_000_000_000,
      nextDisplayFrom: 1_900_000_000_000, nextDisplayUntil: 1_902_592_000_000,
      graceUntil: 1_900_005_000_000, autoRecurring: true, absenceConfirmations: 0,
    });

    const partner = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ subscriptions: { data: [], last_page: true } }));
    try {
      const response = await worker.fetch(new Request('https://app.example/api/quantity-breaks/subscription', { headers: { Authorization: `Bearer ${await jwt()}` } }), testEnv, createExecutionContext());
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ entitlement: { state: 'grace', activeSubscriptionId: 'sub-1', nextValidFrom: null, nextValidUntil: null, nextDisplayFrom: 1_900_000_000_000, nextDisplayUntil: 1_902_592_000_000 }, access: true, planPageRequired: false, plan: { spuKey: 'ultra', currency: 'USD', price: 9.99, periodDays: 30 } });
    } finally { partner.mockRestore(); }
  });

  it('returns the authenticated store time zone from SHOPLINE', async () => {
    const upstream = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ data: { id: 42, iana_timezone: 'Asia/Shanghai' } }));
    try {
      const response = await worker.fetch(new Request('https://app.example/api/quantity-breaks/shop-timezone', {
        headers: { Authorization: `Bearer ${await jwt()}` },
      }), testEnv, createExecutionContext());
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ timeZone: 'Asia/Shanghai' });
      const headers = new Headers(upstream.mock.calls[0]?.[1]?.headers);
      expect(headers.get('Authorization')).toBe('Bearer access');
      expect(headers.get('Accept')).toBe('application/json');
    } finally { upstream.mockRestore(); }
  });

  it('bootstraps an entitled shop with its configuration in one authenticated request', async () => {
    await new D1SubscriptionRepository(testEnv.DB).writeEntitlement({
      appKey: testEnv.SHOPLINE_APP_KEY, handle: 'subscription-shop', state: 'active', featureKeys: ['quantity_breaks_access'],
      activeSubscriptionId: 'sub-1', activeSpuKey: 'ultra', validFrom: 1_700_000_000_000, validUntil: 1_900_000_000_000,
      graceUntil: null, autoRecurring: true, absenceConfirmations: 0,
    });
    await testEnv.DB.prepare("UPDATE shopline_sessions SET store_id = '42' WHERE handle = 'subscription-shop'").run();
    const response = await worker.fetch(new Request('https://app.example/api/quantity-breaks/bootstrap?campaigns=1', {
      headers: { Authorization: `Bearer ${await jwt()}` },
    }), testEnv, createExecutionContext());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ subscription: { access: true }, shop: { storeId: '42' }, campaigns: [] });
  });

  it('does not expose campaign configuration when the subscription is denied', async () => {
    await testEnv.DB.prepare("UPDATE shopline_sessions SET store_id = '42' WHERE handle = 'subscription-shop'").run();
    const response = await worker.fetch(new Request('https://app.example/api/quantity-breaks/bootstrap?campaigns=1', {
      headers: { Authorization: `Bearer ${await jwt()}` },
    }), testEnv, createExecutionContext());
    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    expect(body).toMatchObject({ subscription: { access: false, planPageRequired: true } });
    expect(body).not.toHaveProperty('campaigns');
  });

  it('routes a denied shop to plans without waiting for its slow identity request', async () => {
    const upstream = vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise<Response>(() => undefined));
    try {
      const response = await Promise.race([
        worker.fetch(new Request('https://app.example/api/quantity-breaks/bootstrap?campaigns=1', {
          headers: { Authorization: `Bearer ${await jwt()}` },
        }), testEnv, createExecutionContext()),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Bootstrap waited for store identity.')), 500)),
      ]);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ subscription: { access: false } });
    } finally { upstream.mockRestore(); }
  });

  it('returns the cached projection and schedules reconciliation without waiting for Partner', async () => {
    const partner = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/list.json')) return Response.json({ subscriptions: { data: [{ sub_id: 'sub-live', sub_status: 'active', sub_type: 'paid', spu_key: 'ultra', handle: 'subscription-shop', start_at: 1_700_000_000_000, end_at: 4_700_000_000_000, auto_recurring: true, is_trial: false }], last_page: true } });
      if (url.pathname.endsWith('/detail.json')) return Response.json({ subscription: { feature_key_list: ['quantity_breaks_access'] } });
      return new Response(null, { status: 404 });
    });
    try {
      const waits: Promise<unknown>[] = [];
      const execution = { waitUntil(promise: Promise<unknown>) { waits.push(promise); } } as ExecutionContext;
      const response = await worker.fetch(new Request('https://app.example/api/quantity-breaks/subscription', { headers: { Authorization: `Bearer ${await jwt()}` } }), testEnv, execution);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ entitlement: null, access: false, planPageRequired: true });
      await Promise.all(waits);
      await expect(new D1SubscriptionRepository(testEnv.DB).readEntitlement(testEnv.SHOPLINE_APP_KEY, 'subscription-shop')).resolves.toMatchObject({ state: 'active', activeSubscriptionId: 'sub-live', activeSpuKey: 'ultra' });
    } finally { partner.mockRestore(); }
  });

  it('requires the plan page when the first authorization has no subscription', async () => {
    const partner = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ subscriptions: { data: [], last_page: true } }));
    try {
      const response = await worker.fetch(new Request('https://app.example/api/quantity-breaks/subscription', { headers: { Authorization: `Bearer ${await jwt()}` } }), testEnv, createExecutionContext());
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ entitlement: null, access: false, planPageRequired: true });
    } finally { partner.mockRestore(); }
  });

  it('requires the paid plan page for another active package or missing feature key', async () => {
    const partner = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/list.json')) return Response.json({ subscriptions: { data: [{ sub_id: 'sub-other', sub_status: 'active', sub_type: 'paid', spu_key: 'other-plan', handle: 'subscription-shop', start_at: 1_700_000_000_000, end_at: 4_700_000_000_000, auto_recurring: true, is_trial: false }], last_page: true } });
      return new Response(null, { status: 404 });
    });
    try {
      const response = await worker.fetch(new Request('https://app.example/api/quantity-breaks/subscription', { headers: { Authorization: `Bearer ${await jwt()}` } }), testEnv, createExecutionContext());
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ access: false, planPageRequired: true, entitlement: null });
    } finally { partner.mockRestore(); }
  });

  it('rejects the retired trial checkout contract', async () => {
    const repository = new D1SubscriptionRepository(testEnv.DB);
    await repository.consumeTrialOnce({ appKey: testEnv.SHOPLINE_APP_KEY, handle: 'subscription-shop', subscriptionId: 'completed-trial', sourceEventId: 'event-1' });

    const checkout = await worker.fetch(new Request('https://app.example/api/quantity-breaks/subscription/checkout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${await jwt()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent: 'trial' }),
    }), testEnv, createExecutionContext());
    expect(checkout.status).toBe(400);
    await expect(checkout.json()).resolves.toMatchObject({ code: 'TRIAL_NOT_SUPPORTED' });
  });

  it('creates one checkout order from the dynamic Ultra 30-day SKU and enqueues reconciliation after callback', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/productList.json')) return Response.json({ product_list: [{ spu_key: 'ultra', sku_list: [{ sku_id: 'dynamic-ultra', period: 30, period_type: 'DAY', price: { USD: 9.99 } }] }] });
      if (url.pathname.endsWith('/create_pay.json')) return Response.json({ url: 'https://pay.example/checkout' });
      if (url.pathname.endsWith('/charges/status.json')) return Response.json({ data: { status: 'paid', subscription_id: 'sub-paid' } });
      if (url.pathname.endsWith('/list.json')) return Response.json({ subscriptions: { data: [{ sub_id: 'sub-paid', sub_status: 'active', sub_type: 'paid', spu_key: 'ultra', handle: 'subscription-shop', start_at: Date.now() - 60_000, end_at: Date.now() + 86_400_000, auto_recurring: true, is_trial: false }], last_page: true } });
      if (url.pathname.endsWith('/detail.json')) return Response.json({ subscription: { feature_key_list: ['quantity_breaks_access'] } });
      return new Response(null, { status: 404 });
    });
    try {
      const checkout = await worker.fetch(new Request('https://app.example/api/quantity-breaks/subscription/checkout', { method: 'POST', headers: { Authorization: `Bearer ${await jwt()}` } }), testEnv, createExecutionContext());
      const checkoutText = await checkout.clone().text();
      expect(checkout.status, checkoutText).toBe(200);
      const body = await checkout.json() as { checkoutUrl: string; outTradeNo: string };
      expect(body.checkoutUrl).toBe('https://pay.example/checkout');
      expect(body.outTradeNo).toMatch(/^qb-subscription-shop-/);
      const createPayment = fetcher.mock.calls.find(([input]) => new URL(String(input)).pathname.endsWith('/create_pay.json'));
      expect(createPayment).toBeDefined();
      const paymentPayload = JSON.parse(String((createPayment?.[1] as RequestInit | undefined)?.body)) as { application_charge: { return_url: string } };
      const returnUrl = new URL(paymentPayload.application_charge.return_url);
      expect(returnUrl.searchParams.get('out_trade_no')).toBe(body.outTradeNo);
      expect(returnUrl.searchParams.get('appkey')).toBe(testEnv.SHOPLINE_APP_KEY);
      expect(returnUrl.searchParams.get('handle')).toBe('subscription-shop');
      expect(returnUrl.searchParams.get('shop')).toBe('subscription-shop');
      expect(returnUrl.searchParams.get('host')).toBe('subscription-shop.myshopline.com');
      expect(returnUrl.searchParams.get('embedded')).toBe('1');
      const order = await testEnv.DB.prepare('SELECT sku_id, status FROM quantity_breaks_subscription_orders WHERE out_trade_no = ?').bind(body.outTradeNo).first<{ sku_id: string; status: string }>();
      expect(order).toEqual({ sku_id: 'dynamic-ultra', status: 'pending' });

      const waits: Promise<unknown>[] = [];
      const execution = { waitUntil(promise: Promise<unknown>) { waits.push(promise); } } as ExecutionContext;
      const callback = await worker.fetch(new Request(`https://app.example/api/quantity-breaks/subscription/callback?out_trade_no=${encodeURIComponent(body.outTradeNo)}`), testEnv, execution);
      expect(callback.status).toBe(200);
      await expect(callback.json()).resolves.toMatchObject({ status: 'paid', outTradeNo: body.outTradeNo });
      await Promise.all(waits);
      await expect(new D1SubscriptionRepository(testEnv.DB).readEntitlement(testEnv.SHOPLINE_APP_KEY, 'subscription-shop')).resolves.toMatchObject({ state: 'active', activeSubscriptionId: 'sub-paid', featureKeys: ['quantity_breaks_access'] });
      const redirect = await worker.fetch(new Request(`https://app.example/api/quantity-breaks/subscription/callback?redirect=1&out_trade_no=${encodeURIComponent(body.outTradeNo)}`), testEnv, createExecutionContext());
      expect(redirect.status).toBe(303);
      const location = new URL(redirect.headers.get('Location') || '');
      expect(location.pathname).toBe('/quantity-breaks/plan');
      expect(location.searchParams.get('appkey')).toBe(testEnv.SHOPLINE_APP_KEY);
      expect(location.searchParams.get('handle')).toBe('subscription-shop');
      expect(location.searchParams.get('host')).toBe('subscription-shop.myshopline.com');
      const operation = await testEnv.DB.prepare("SELECT kind FROM quantity_breaks_subscription_operations WHERE app_key = ? AND shop_handle = ?").bind(testEnv.SHOPLINE_APP_KEY, 'subscription-shop').first<{ kind: string }>();
      expect(operation?.kind).toBe('reconcile');
    } finally {
      fetcher.mockRestore();
    }
  });

  it('returns a safe, traceable error when the subscription order cannot be persisted', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/productList.json')) return Response.json({ product_list: [{ spu_key: 'ultra', sku_list: [{ sku_id: 'dynamic-ultra', period: 30, period_type: 'DAY', price: { USD: 9.99 } }] }] });
      return new Response(null, { status: 404 });
    });
    const persist = vi.spyOn(D1SubscriptionRepository.prototype, 'createOrderOnce').mockRejectedValue(new Error('D1 unavailable'));
    try {
      const response = await worker.fetch(new Request('https://app.example/api/quantity-breaks/subscription/checkout', { method: 'POST', headers: { Authorization: `Bearer ${await jwt()}` } }), testEnv, createExecutionContext());
      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toMatchObject({ code: 'ORDER_PERSIST_FAILED', requestId: expect.any(String) });
    } finally {
      persist.mockRestore();
      fetcher.mockRestore();
    }
  });

  it('returns the failed checkout stage and upstream status without exposing its response body', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/productList.json')) return new Response('partner details must stay private', { status: 401 });
      return new Response(null, { status: 404 });
    });
    try {
      const response = await worker.fetch(new Request('https://app.example/api/quantity-breaks/subscription/checkout', { method: 'POST', headers: { Authorization: `Bearer ${await jwt()}` } }), testEnv, createExecutionContext());
      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toMatchObject({ code: 'SKU_LOOKUP_FAILED', diagnostics: { stage: 'sku_lookup', upstreamStatus: 401 } });
    } finally { fetcher.mockRestore(); }
  });
});
