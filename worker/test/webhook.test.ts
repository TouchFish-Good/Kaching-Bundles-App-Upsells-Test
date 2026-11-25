import { createExecutionContext, env } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';

import worker from '../src';
import { hmacHex } from '../src/crypto';
import { applyMigrations } from '../src/db/migrate';
import { D1SessionStore } from '../src/db/sessions';
import { D1SubscriptionRepository } from '../src/db/subscriptions';
import { verifyWebhook } from '../src/auth/webhook';
import type { Env } from '../src/env';

const testEnv = {
  ...(env as Env),
  SHOPLINE_APP_KEY: 'webhook-test-key',
  SHOPLINE_APP_SECRET: 'test-secret',
  SHOPLINE_PARTNER_ACCESS_TOKEN: 'partner-token',
  TOKEN_ENCRYPTION_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY',
} as Env;

describe('SHOPLINE webhooks', () => {
  it('rejects a webhook with one altered HMAC byte', async () => {
    const request = new Request('https://raised-stability-gaps-html.trycloudflare.com/api/webhooks', {
      body: JSON.stringify({ handle: 'demo', topic: 'apps/installed_uninstalled', webhook_id: 'evt-1' }),
      headers: { 'X-Shopline-Hmac-Sha256': '0'.repeat(64) },
      method: 'POST',
    });

    await expect(verifyWebhook(request, testEnv)).rejects.toThrow('Invalid webhook signature');
  });

  it('records rejected webhook processing for the internal diagnostics reader', async () => {
    await applyMigrations(testEnv.DB);
    await testEnv.DB.prepare('DELETE FROM admin_error_events').run();
    const response = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/webhooks', {
      method: 'POST', body: JSON.stringify({ handle: 'demo' }), headers: { 'X-Shopline-Hmac-Sha256': '0'.repeat(64) },
    }), testEnv, createExecutionContext());

    expect(response.status).toBe(401);
    await expect(testEnv.DB.prepare('SELECT kind, code FROM admin_error_events ORDER BY id DESC LIMIT 1').first<{ kind: string; code: string }>()).resolves.toEqual({ kind: 'webhook', code: 'WEBHOOK_PROCESSING_FAILED' });
  });

  it('only deactivates the installation for an explicit UNINSTALL event', async () => {
    await applyMigrations(testEnv.DB);
    await testEnv.DB.batch([testEnv.DB.prepare('DELETE FROM shopline_sessions'), testEnv.DB.prepare('DELETE FROM webhook_events')]);
    const store = new D1SessionStore(testEnv.DB, testEnv.TOKEN_ENCRYPTION_KEY);
    await store.upsert({ handle: 'demo', storeId: '42', accessToken: 'access', refreshToken: 'refresh', scope: 'read_products', expiresAt: '2030-01-01T00:00:00.000Z', installed: true });
    const payload = JSON.stringify({ handle: 'demo', topic: 'apps/installed_uninstalled', webhook_id: 'installed-1', operate: 'INSTALL', store_id: '42', timestamp: Date.parse('2026-10-27T00:00:00.000Z') });
    const response = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/webhooks', { method: 'POST', body: payload, headers: { 'X-Shopline-Hmac-Sha256': await hmacHex(testEnv.SHOPLINE_APP_SECRET, payload) } }), testEnv, createExecutionContext());

    expect(response.status).toBe(200);
    await expect(store.get('demo')).resolves.toMatchObject({ installed: true });
  });

  it('persists webhook IDs so retried uninstall events are applied once', async () => {
    await applyMigrations(testEnv.DB);
    await testEnv.DB.batch([testEnv.DB.prepare('DELETE FROM shopline_sessions'), testEnv.DB.prepare('DELETE FROM webhook_events')]);
    const store = new D1SessionStore(testEnv.DB, testEnv.TOKEN_ENCRYPTION_KEY);
    await store.upsert({ handle: 'demo', storeId: '42', accessToken: 'access', refreshToken: 'refresh', scope: 'read_products', expiresAt: '2030-01-01T00:00:00.000Z', installed: true });
    const payload = JSON.stringify({ handle: 'demo', topic: 'apps/installed_uninstalled', webhook_id: 'uninstall-1', operate: 'UNINSTALL', store_id: '42', timestamp: Date.now() });
    const request = () => new Request('https://raised-stability-gaps-html.trycloudflare.com/api/webhooks', { method: 'POST', body: payload, headers: { 'X-Shopline-Hmac-Sha256': '' } });
    const signature = await hmacHex(testEnv.SHOPLINE_APP_SECRET, payload);
    await worker.fetch(new Request(request(), { headers: { 'X-Shopline-Hmac-Sha256': signature } }), testEnv, createExecutionContext());
    await worker.fetch(new Request(request(), { headers: { 'X-Shopline-Hmac-Sha256': signature } }), testEnv, createExecutionContext());

    const row = await testEnv.DB.prepare('SELECT count(*) AS count FROM webhook_events WHERE webhook_id = ?').bind('uninstall-1').first<{ count: number }>();
    expect(row?.count).toBe(1);
    await expect(store.get('demo')).resolves.toMatchObject({ installed: false });
  });

  it('does not let an old uninstall event deactivate a newer installation and records the current uninstall for admin diagnostics', async () => {
    await applyMigrations(testEnv.DB);
    await testEnv.DB.batch([
      testEnv.DB.prepare('DELETE FROM shopline_sessions'),
      testEnv.DB.prepare('DELETE FROM webhook_events'),
      testEnv.DB.prepare('DELETE FROM admin_installations'),
      testEnv.DB.prepare('DELETE FROM admin_stores'),
    ]);
    const store = new D1SessionStore(testEnv.DB, testEnv.TOKEN_ENCRYPTION_KEY);
    await store.upsert({ handle: 'demo', accessToken: 'access', refreshToken: 'refresh', scope: 'read_products', expiresAt: '2030-01-01T00:00:00.000Z', installed: true });
    const installedAt = new Date(Date.now()).toISOString();
    await testEnv.DB.batch([
      testEnv.DB.prepare('UPDATE shopline_sessions SET store_id = ?, created_at = ? WHERE handle = ?').bind('42', installedAt, 'demo'),
      testEnv.DB.prepare("INSERT INTO admin_stores (store_id, handle, scope, status, installed_at, updated_at) VALUES (?, ?, ?, 'installed', ?, ?)").bind('42', 'demo', 'read_products', installedAt, installedAt),
      testEnv.DB.prepare('INSERT INTO admin_installations (store_id, installed_at) VALUES (?, ?)').bind('42', installedAt),
    ]);
    const send = async (webhookId: string, timestamp: number) => {
      const payload = JSON.stringify({ handle: 'demo', topic: 'apps/installed_uninstalled', webhook_id: webhookId, operate: 'UNINSTALL', store_id: '42', timestamp });
      return worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/webhooks', { method: 'POST', body: payload, headers: { 'X-Shopline-Hmac-Sha256': await hmacHex(testEnv.SHOPLINE_APP_SECRET, payload) } }), testEnv, createExecutionContext());
    };

    await expect(send('old-uninstall', Date.parse(installedAt) - 1_000)).resolves.toMatchObject({ status: 200 });
    await expect(store.get('demo')).resolves.toMatchObject({ installed: true });
    await expect(send('current-uninstall', Date.parse(installedAt) + 1_000)).resolves.toMatchObject({ status: 200 });
    await expect(store.get('demo')).resolves.toMatchObject({ installed: false });
    await expect(testEnv.DB.prepare('SELECT status FROM admin_stores WHERE store_id = ?').bind('42').first<{ status: string }>()).resolves.toEqual({ status: 'uninstalled' });
    await expect(testEnv.DB.prepare('SELECT uninstalled_at FROM admin_installations WHERE store_id = ?').bind('42').first<{ uninstalled_at: string | null }>()).resolves.toMatchObject({ uninstalled_at: expect.any(String) });
  });

  it('accepts a valid subscription webhook once, immediately reconciles, and preserves cross-store payment isolation', async () => {
    await applyMigrations(testEnv.DB);
    await testEnv.DB.batch([
      testEnv.DB.prepare('DELETE FROM shopline_sessions'),
      testEnv.DB.prepare('DELETE FROM webhook_events'),
      testEnv.DB.prepare('DELETE FROM quantity_breaks_subscription_operations'),
      testEnv.DB.prepare('DELETE FROM quantity_breaks_subscription_orders'),
    ]);
    const store = new D1SessionStore(testEnv.DB, testEnv.TOKEN_ENCRYPTION_KEY);
    await Promise.all(['demo', 'other-store'].map((handle) => store.upsert({ handle, accessToken: 'access', refreshToken: 'refresh', scope: 'read_products', expiresAt: '2030-01-01T00:00:00.000Z', installed: true })));
    const orders = new D1SubscriptionRepository(testEnv.DB);
    await orders.createOrderOnce({ outTradeNo: 'qb-webhook-order', appKey: testEnv.SHOPLINE_APP_KEY, handle: 'demo', spuKey: 'ultra', skuId: 'ultra-30', status: 'pending' });
    const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/list.json')) {
        const subscriptions = url.searchParams.get('handle') === 'demo'
          ? [{ sub_id: 'sub-webhook', sub_status: 'active', sub_type: 'paid', spu_key: 'ultra', handle: 'demo', start_at: Date.now() - 60_000, end_at: Date.now() + 86_400_000, auto_recurring: true, is_trial: false }]
          : [];
        return Response.json({ subscriptions: { data: subscriptions, last_page: true } });
      }
      if (url.pathname.endsWith('/detail.json')) return Response.json({ subscription: { feature_key_list: ['quantity_breaks_access'] } });
      return new Response(null, { status: 404 });
    });
    const send = async (handle: string, webhookId: string, status: string, execution: ExecutionContext = createExecutionContext()) => {
      const payload = JSON.stringify({ handle, topic: 'appsubscription/paid', webhook_id: webhookId, appkey: testEnv.SHOPLINE_APP_KEY, out_trade_no: 'qb-webhook-order', status, subscription_id: 'sub-webhook' });
      return worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/webhooks', { method: 'POST', body: payload, headers: { 'X-Shopline-Hmac-Sha256': await hmacHex(testEnv.SHOPLINE_APP_SECRET, payload) } }), testEnv, execution);
    };

    try {
      const waits: Promise<unknown>[] = [];
      await expect(send('demo', 'subscription-paid-1', 'paid', { waitUntil(promise: Promise<unknown>) { waits.push(promise); } } as ExecutionContext)).resolves.toMatchObject({ status: 200 });
      await Promise.all(waits);
      await expect(new D1SubscriptionRepository(testEnv.DB).readEntitlement(testEnv.SHOPLINE_APP_KEY, 'demo')).resolves.toMatchObject({ state: 'active', activeSubscriptionId: 'sub-webhook', featureKeys: ['quantity_breaks_access'] });
      await expect(orders.readOrder('qb-webhook-order')).resolves.toMatchObject({ status: 'paid', subscriptionId: 'sub-webhook' });
      await expect(send('demo', 'subscription-paid-1', 'paid')).resolves.toMatchObject({ status: 200 });
      await expect(send('other-store', 'subscription-paid-2', 'expired')).resolves.toMatchObject({ status: 200 });
      await expect(orders.readOrder('qb-webhook-order')).resolves.toMatchObject({ status: 'paid', handle: 'demo' });
      const operations = await testEnv.DB.prepare('SELECT kind, shop_handle FROM quantity_breaks_subscription_operations ORDER BY operation_key').all<{ kind: string; shop_handle: string }>();
      expect(operations.results).toEqual([
        { kind: 'reconcile', shop_handle: 'demo' },
        { kind: 'reconcile', shop_handle: 'other-store' },
      ]);
    } finally {
      fetcher.mockRestore();
    }
  });

  it('drains the subscription invalidation operation created by a cancellation webhook before waitUntil completes', async () => {
    await applyMigrations(testEnv.DB);
    await testEnv.DB.batch([
      testEnv.DB.prepare('DELETE FROM shopline_sessions'),
      testEnv.DB.prepare('DELETE FROM webhook_events'),
      testEnv.DB.prepare('DELETE FROM quantity_breaks_subscription_operations'),
      testEnv.DB.prepare('DELETE FROM quantity_breaks_entitlements'),
    ]);
    const store = new D1SessionStore(testEnv.DB, testEnv.TOKEN_ENCRYPTION_KEY);
    await store.upsert({ handle: 'demo', accessToken: 'access', refreshToken: 'refresh', scope: 'read_products', expiresAt: '2030-01-01T00:00:00.000Z', installed: true });
    const repository = new D1SubscriptionRepository(testEnv.DB);
    await repository.writeEntitlement({ appKey: testEnv.SHOPLINE_APP_KEY, handle: 'demo', state: 'active', featureKeys: ['quantity_breaks_access'], activeSubscriptionId: 'sub-cancelled', activeSpuKey: 'ultra', validFrom: Date.now() - 1_000, validUntil: Date.now() + 86_400_000, graceUntil: null, autoRecurring: false, absenceConfirmations: 0 });
    const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/list.json')) return Response.json({ subscriptions: { data: [{ sub_id: 'sub-cancelled', sub_status: 'cancelled', sub_type: 'paid', spu_key: 'ultra', handle: 'demo', start_at: Date.now() - 60_000, end_at: Date.now() + 86_400_000, auto_recurring: false, is_trial: false }], last_page: true } });
      return new Response(null, { status: 404 });
    });
    const payload = JSON.stringify({ handle: 'demo', topic: 'appsubscription/expiration', webhook_id: 'subscription-cancelled-1', appkey: testEnv.SHOPLINE_APP_KEY, subscription_id: 'sub-cancelled', expiration_type: 2 });
    const waits: Promise<unknown>[] = [];

    try {
      const response = await worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/webhooks', {
        method: 'POST', body: payload, headers: { 'X-Shopline-Hmac-Sha256': await hmacHex(testEnv.SHOPLINE_APP_SECRET, payload) },
      }), testEnv, { waitUntil(promise: Promise<unknown>) { waits.push(promise); } } as ExecutionContext);

      expect(response.status).toBe(200);
      await Promise.all(waits);
      const operations = await testEnv.DB.prepare(`SELECT kind, state FROM quantity_breaks_subscription_operations
        WHERE shop_handle = ? ORDER BY kind`).bind('demo').all<{ kind: string; state: string }>();
      expect(operations.results).toEqual([
          { kind: 'disable_storefront', state: 'succeeded' },
          { kind: 'reconcile', state: 'succeeded' },
        ]);
    } finally {
      fetcher.mockRestore();
    }
  });
});
