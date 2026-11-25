import { env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { D1CampaignRepository } from '../src/db/campaigns';
import { applyMigrations } from '../src/db/migrate';
import { D1SessionStore } from '../src/db/sessions';
import { D1SubscriptionRepository } from '../src/db/subscriptions';
import type { Env } from '../src/env';
import { processSubscriptionOperations } from '../src/jobs/subscription-operations';
import worker from '../src/index';
import { PartnerSubscriptionClient } from '../src/services/subscriptions';
import { EntitlementService } from '../src/services/entitlements';

const key = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY';
const now = Date.parse('2026-11-03T00:00:00.000Z');
const testEnv = { ...(env as Env), SHOPLINE_APP_KEY: 'app-a', TOKEN_ENCRYPTION_KEY: key, now: () => now } as Env;

describe('subscription expiry operations', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  beforeEach(async () => {
    await applyMigrations(testEnv.DB);
    vi.spyOn(PartnerSubscriptionClient.prototype, 'listSubscriptions').mockResolvedValue({ subscriptions: [{ subId: 'old', status: 'cancelled', type: 'paid', spuKey: 'ultra', handle: 'shop-a', startAt: now - 100_000, endAt: now - 1, autoRecurring: false, isTrial: false }], lastPage: true });
    vi.spyOn(PartnerSubscriptionClient.prototype, 'getSubscriptionDetail').mockResolvedValue({ featureKeys: ['quantity_breaks_access'] });
    await testEnv.DB.batch([
      'quantity_breaks_subscription_operations', 'quantity_breaks_entitlements', 'quantity_breaks_publications', 'quantity_breaks_campaigns', 'quantity_breaks_shop_locks', 'shopline_sessions',
    ].map((table) => testEnv.DB.prepare(`DELETE FROM ${table}`)));
  });

  it('cleans old history and blocks uncertain mutations from the five-minute schedule', async () => {
    const subscriptions = new D1SubscriptionRepository(testEnv.DB, () => now);
    await subscriptions.enqueueReconcileOnce({ operationKey: 'old-completed-read', appKey: 'app-a', handle: 'shop-a', nextAttemptAt: now });
    await testEnv.DB.prepare("UPDATE quantity_breaks_subscription_operations SET state = 'succeeded', updated_at = ? WHERE operation_key = 'old-completed-read'")
      .bind(now - 8 * 86_400_000).run();
    await subscriptions.enqueueOperationOnce({ operationKey: 'stalled-platform-delete', appKey: 'app-a', handle: 'shop-a', entitlementVersion: 1, kind: 'pause_campaign', campaignId: 'campaign-a', nextAttemptAt: now });
    await testEnv.DB.prepare("UPDATE quantity_breaks_subscription_operations SET state = 'running', attempts = 1, updated_at = ? WHERE operation_key = 'stalled-platform-delete'")
      .bind(now - 16 * 60_000).run();

    await worker.scheduled({ cron: '*/5 * * * *' } as ScheduledController, testEnv);

    await expect(testEnv.DB.prepare("SELECT state FROM quantity_breaks_subscription_operations WHERE operation_key = 'old-completed-read'").first()).resolves.toBeNull();
    await expect(testEnv.DB.prepare("SELECT state, last_error FROM quantity_breaks_subscription_operations WHERE operation_key = 'stalled-platform-delete'").first())
      .resolves.toEqual({ state: 'blocked', last_error: 'OPERATION_OUTCOME_UNCERTAIN' });
  });

  it('continues processing due tasks when history maintenance fails', async () => {
    const subscriptions = new D1SubscriptionRepository(testEnv.DB, () => now);
    await subscriptions.enqueueOperationOnce({ operationKey: 'storefront-task', appKey: 'app-a', handle: 'shop-a', entitlementVersion: 1, kind: 'disable_storefront', campaignId: null, nextAttemptAt: now });
    vi.spyOn(D1SubscriptionRepository.prototype, 'purgeOperationHistory').mockRejectedValue(new Error('D1 maintenance temporarily unavailable'));

    await worker.scheduled({ cron: '*/5 * * * *' } as ScheduledController, testEnv);

    await expect(testEnv.DB.prepare("SELECT state FROM quantity_breaks_subscription_operations WHERE operation_key = 'storefront-task'").first())
      .resolves.toEqual({ state: 'succeeded' });
  });

  it('records the actual end only after SHOPLINE confirms deletion', async () => {
    const campaigns = new D1CampaignRepository(testEnv.DB, () => now);
    await campaigns.save('shop-a', {
      id: 'confirmed-expiry', name: 'Expiry', status: 'draft', startsAt: '2026-10-01T00:00:00.000Z', neverExpires: true,
      scope: { kind: 'products', productIds: ['product-1'], excludedProductIds: [] },
      tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 1, discountType: 'none' }],
      combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
    }, 0);
    const lease = await campaigns.beginPublication('shop-a', 'confirmed-expiry', 1, 'publish');
    await campaigns.finishPublication('shop-a', 'confirmed-expiry', 1, 'publish', 'discount-1', lease.owner);
    await new D1SessionStore(testEnv.DB, key).upsert({ handle: 'shop-a', accessToken: 'access', refreshToken: 'refresh', scope: 'write_discounts', expiresAt: '2030-01-01T00:00:00.000Z', installed: true });
    const subscriptions = new D1SubscriptionRepository(testEnv.DB, () => now);
    await subscriptions.writeEntitlement({ appKey: 'app-a', handle: 'shop-a', state: 'inactive', featureKeys: [], activeSubscriptionId: null, activeSpuKey: null, validFrom: null, validUntil: null, graceUntil: null, autoRecurring: null, absenceConfirmations: 2 });
    await subscriptions.enqueueExpiryOperations('app-a', 'shop-a', 1, now);
    let deleted = false;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/sales/discount_app.json')) return Response.json({ discount_apps: deleted ? [] : [{ app_discount_id: 'discount-1', status: 'active' }] });
      if (String(input).includes('/admin/openapi/v20261201/sales/discount_apps/')) { deleted = true; return new Response(null, { status: 204 }); }
      throw new Error(`Unexpected platform request: ${input}`);
    }));

    await expect(processSubscriptionOperations(testEnv, now)).resolves.toEqual({ processed: 2, failed: 0 });
    await expect(campaigns.get('shop-a', 'confirmed-expiry')).resolves.toMatchObject({ status: 'paused', pauseReason: 'subscription_expired', endsAt: new Date(now).toISOString(), neverExpires: false });
    await expect(campaigns.getPublication('shop-a', 'confirmed-expiry')).resolves.toMatchObject({ state: 'entitlement_revoked', discountId: null });
  });

  it('uses SHOPLINE Retry-After before retrying a subscription-expiry discount deletion', async () => {
    const campaigns = new D1CampaignRepository(testEnv.DB, () => now);
    await campaigns.save('shop-a', {
      id: 'expired-offer', name: 'Expired offer', status: 'draft', startsAt: '2026-10-01T00:00:00.000Z',
      scope: { kind: 'products', productIds: ['product-1'], excludedProductIds: [] },
      tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 1, discountType: 'none' }],
      combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
    }, 0);
    const lease = await campaigns.beginPublication('shop-a', 'expired-offer', 1, 'publish');
    await campaigns.finishPublication('shop-a', 'expired-offer', 1, 'publish', 'discount-1', lease.owner);
    await new D1SessionStore(testEnv.DB, key).upsert({ handle: 'shop-a', accessToken: 'access', refreshToken: 'refresh', scope: 'write_discounts', expiresAt: '2030-01-01T00:00:00.000Z', installed: true });
    const subscriptions = new D1SubscriptionRepository(testEnv.DB, () => now);
    await subscriptions.writeEntitlement({
      appKey: 'app-a', handle: 'shop-a', state: 'inactive', featureKeys: [], activeSubscriptionId: null, activeSpuKey: null,
      validFrom: null, validUntil: null, graceUntil: null, autoRecurring: null, absenceConfirmations: 2,
    });
    await subscriptions.enqueueExpiryOperations('app-a', 'shop-a', 1, now);
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/sales/discount_app.json')) return Response.json({ discount_apps: [{ app_discount_id: 'discount-1', status: 'active' }] });
      if (String(input).includes('/admin/openapi/v20261201/sales/discount_apps/')) return new Response('{}', { status: 429, headers: { 'Retry-After': '120' } });
      throw new Error(`Unexpected platform request: ${input}`);
    }));

    await expect(processSubscriptionOperations(testEnv, now)).resolves.toEqual({ processed: 2, failed: 1 });
    const unchanged = await campaigns.get('shop-a', 'expired-offer');
    expect(unchanged?.status).toBe('active');
    expect(unchanged?.endsAt).toBeUndefined();
    expect(unchanged?.pauseReason).toBeUndefined();
    await expect(testEnv.DB.prepare(`SELECT state, attempts, next_attempt_at FROM quantity_breaks_subscription_operations
      WHERE operation_key = 'subscription-expired:app-a:shop-a:1:expired-offer'`).first<{ state: string; attempts: number; next_attempt_at: number }>())
      .resolves.toEqual({ state: 'retrying', attempts: 1, next_attempt_at: now + 120_000 });
    await expect(processSubscriptionOperations(testEnv, now + 1)).resolves.toEqual({ processed: 0, failed: 0 });
  });
  async function expiryTask() {
    const campaigns = new D1CampaignRepository(testEnv.DB, () => now);
    await campaigns.save('shop-a', { id: 'handoff', name: 'Handoff', status: 'draft', startsAt: '2026-10-01T00:00:00Z', neverExpires: true,
      scope: { kind: 'products', productIds: ['product-1'], excludedProductIds: [] }, tiers: [{ tierId: 't', displayOrder: 0, quantity: 1, discountType: 'none' }],
      combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false } }, 0);
    const lease = await campaigns.beginPublication('shop-a', 'handoff', 1, 'publish');
    await campaigns.finishPublication('shop-a', 'handoff', 1, 'publish', 'discount-1', lease.owner);
    await new D1SessionStore(testEnv.DB, key).upsert({ handle: 'shop-a', accessToken: 'access', refreshToken: 'refresh', scope: 'write_discounts', expiresAt: '2030-01-01T00:00:00Z', installed: true });
    const subscriptions = new D1SubscriptionRepository(testEnv.DB, () => now);
    const entitlement = await subscriptions.writeEntitlement({ appKey: 'app-a', handle: 'shop-a', state: 'unknown', featureKeys: [], activeSubscriptionId: null, activeSpuKey: null, validFrom: null, validUntil: null, graceUntil: null, autoRecurring: null, absenceConfirmations: 0 });
    await subscriptions.enqueueExpiryOperations('app-a', 'shop-a', entitlement.version, now);
    return { campaigns, subscriptions, entitlement };
  }

  it('rechecks Partner and cancels a deletion when the next period has become effective', async () => {
    const { campaigns, subscriptions } = await expiryTask();
    vi.mocked(PartnerSubscriptionClient.prototype.listSubscriptions).mockResolvedValue({ subscriptions: [{ subId: 'next', status: 'active', type: 'preorder', spuKey: 'ultra', handle: 'shop-a', startAt: now, endAt: now + 86_400_000, autoRecurring: false, isTrial: false }], lastPage: true });
    const platform = vi.fn(() => { throw new Error('Must not delete'); });
    vi.stubGlobal('fetch', platform);
    await expect(processSubscriptionOperations(testEnv, now)).resolves.toEqual({ processed: 2, failed: 0 });
    expect(platform).not.toHaveBeenCalled();
    await expect(subscriptions.readEntitlement('app-a', 'shop-a')).resolves.toMatchObject({ state: 'active', activeSubscriptionId: 'next' });
    await expect(campaigns.getPublication('shop-a', 'handoff')).resolves.toMatchObject({ state: 'active', discountId: 'discount-1' });
  });

  it('retries without touching the discount when fresh Partner verification fails', async () => {
    const { campaigns } = await expiryTask();
    vi.mocked(PartnerSubscriptionClient.prototype.listSubscriptions).mockRejectedValue(new Error('Partner 503'));
    const platform = vi.fn(() => { throw new Error('Must not delete'); });
    vi.stubGlobal('fetch', platform);
    await expect(processSubscriptionOperations(testEnv, now)).resolves.toEqual({ processed: 2, failed: 1 });
    expect(platform).not.toHaveBeenCalled();
    await expect(campaigns.getPublication('shop-a', 'handoff')).resolves.toMatchObject({ state: 'active', discountId: 'discount-1' });
  });

  it('ignores an old invalidation task after a newer entitlement version was saved', async () => {
    const { campaigns, subscriptions, entitlement } = await expiryTask();
    await subscriptions.writeEntitlement({ ...entitlement, absenceConfirmations: 2 });
    const platform = vi.fn(() => { throw new Error('Must not delete'); });
    vi.stubGlobal('fetch', platform);
    await expect(processSubscriptionOperations(testEnv, now)).resolves.toEqual({ processed: 2, failed: 0 });
    expect(platform).not.toHaveBeenCalled();
    expect(PartnerSubscriptionClient.prototype.listSubscriptions).not.toHaveBeenCalled();
    await expect(campaigns.getPublication('shop-a', 'handoff')).resolves.toMatchObject({ discountId: 'discount-1' });
  });

  it('prevents a renewal write from racing an in-flight discount deletion', async () => {
    const { subscriptions, campaigns } = await expiryTask();
    let deleted = false;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/sales/discount_app.json')) return Response.json({ discount_apps: deleted ? [] : [{ app_discount_id: 'discount-1', status: 'active' }] });
      if (String(input).includes('/admin/openapi/v20261201/sales/discount_apps/')) {
        const renewal = new EntitlementService(new D1SubscriptionRepository(testEnv.DB, () => now), { listSubscriptions: async () => ({ subscriptions: [], lastPage: true }), getSubscriptionDetail: async () => ({ featureKeys: [] }) }, () => now);
        await expect(renewal.reconcileEntitlement({ appKey: 'app-a', handle: 'shop-a' })).rejects.toThrow(/in progress/);
        deleted = true; return new Response(null, { status: 204 });
      }
      throw new Error('Unexpected platform request');
    }));
    await expect(processSubscriptionOperations(testEnv, now)).resolves.toEqual({ processed: 2, failed: 0 });
    expect(deleted).toBe(true);
    await expect(campaigns.getPublication('shop-a', 'handoff')).resolves.toMatchObject({ state: 'entitlement_revoked' });
    await expect(subscriptions.withEntitlementLock('app-a', 'shop-a', async () => true)).resolves.toBe(true);
  });

  it('keeps every campaign cleanup and Retry-After when fresh denied verification advances the entitlement version', async () => {
    const { campaigns } = await expiryTask();
    const second = { ...(await campaigns.get('shop-a', 'handoff'))!, id: 'handoff-two', status: 'draft' as const, scope: { kind: 'products' as const, productIds: ['product-2'], excludedProductIds: [] } };
    await campaigns.save('shop-a', second, 0);
    const lease = await campaigns.beginPublication('shop-a', second.id, 1, 'publish');
    await campaigns.finishPublication('shop-a', second.id, 1, 'publish', 'discount-2', lease.owner);
    await testEnv.DB.prepare(`INSERT INTO quantity_breaks_subscription_operations
      (operation_key, app_key, shop_handle, entitlement_version, kind, state, attempts, next_attempt_at, campaign_id, created_at, updated_at)
      VALUES ('second-cleanup', 'app-a', 'shop-a', 1, 'pause_campaign', 'pending', 0, ?, 'handoff-two', ?, ?)`).bind(now, now, now).run();
    vi.mocked(PartnerSubscriptionClient.prototype.listSubscriptions).mockResolvedValue({ subscriptions: [{ subId: 'no-feature', status: 'active', type: 'paid', spuKey: 'ultra', handle: 'shop-a', startAt: now - 1_000, endAt: now + 86_400_000, autoRecurring: false, isTrial: false }], lastPage: true });
    vi.mocked(PartnerSubscriptionClient.prototype.getSubscriptionDetail).mockResolvedValue({ featureKeys: [] });
    const deleted = new Set<string>(); let throttled = false;
    const platform = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/sales/discount_app.json')) return Response.json({ discount_apps: ['discount-1', 'discount-2'].filter(id => !deleted.has(id)).map(id => ({ app_discount_id: id, status: 'active' })) });
      const id = url.includes('/discount-2.json') ? 'discount-2' : 'discount-1';
      if (!throttled) { throttled = true; return new Response('{}', { status: 429, headers: { 'Retry-After': '120' } }); }
      deleted.add(id); return new Response(null, { status: 204 });
    });
    vi.stubGlobal('fetch', platform);
    await expect(processSubscriptionOperations(testEnv, now)).resolves.toEqual({ processed: 3, failed: 1 });
    expect(deleted.size).toBe(1);
    const calls = platform.mock.calls.length;
    await expect(processSubscriptionOperations(testEnv, now + 119_999)).resolves.toEqual({ processed: 0, failed: 0 });
    expect(platform).toHaveBeenCalledTimes(calls);
    await expect(processSubscriptionOperations(testEnv, now + 120_000)).resolves.toEqual({ processed: 1, failed: 0 });
    expect([...deleted].sort()).toEqual(['discount-1', 'discount-2']);
    for (const id of ['handoff', 'handoff-two']) await expect(campaigns.getPublication('shop-a', id)).resolves.toMatchObject({ state: 'entitlement_revoked', discountId: null });
  });

});
