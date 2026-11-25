import { env, createExecutionContext } from 'cloudflare:test';
import { beforeEach, expect, it, vi, afterEach } from 'vitest';
import { applyMigrations } from '../src/db/migrate';
import { D1SubscriptionRepository } from '../src/db/subscriptions';
import { D1SessionStore } from '../src/db/sessions';
import { EntitlementService } from '../src/services/entitlements';
import { hmacHex } from '../src/crypto';
import worker from '../src/index';
import type { Env } from '../src/env';
import type { SubscriptionRecord } from '../src/services/subscriptions';

const now = Date.parse('2026-11-23T07:00:00Z');
const testEnv = { ...(env as Env), SHOPLINE_APP_KEY: 'app-a', SHOPLINE_PARTNER_ACCESS_TOKEN: 'partner-secret', ADMIN_INTERNAL_SECRET: 'admin-secret', now: () => now } as Env;
const subscription: SubscriptionRecord = {
  subId: '7787410668482995410', status: 'unactive', type: 'trial', spuKey: 'ultra', handle: 'zhenghaonan',
  startAt: 1794493955000, endAt: 1795100400000, autoRecurring: false, isTrial: true,
};
const repository = () => new D1SubscriptionRepository(testEnv.DB, () => now);

async function storeListResponse(query = '') {
  return signedRead(`/internal/admin-read/v1/stores${query ? `?${query}` : ''}`);
}

async function signedRead(path: string) {
  const timestamp = String(now), nonce = crypto.randomUUID(), traceId = crypto.randomUUID();
  const signature = await hmacHex(testEnv.ADMIN_INTERNAL_SECRET, `GET\n${path}\n${timestamp}\n${nonce}\n${traceId}`);
  const response = await worker.fetch(new Request(`https://app.example${path}`, { headers: {
    'x-admin-timestamp': timestamp, 'x-admin-nonce': nonce, 'x-trace-id': traceId, 'x-admin-signature': signature,
  } }), testEnv, createExecutionContext());
  return response;
}

async function storeList(query = '') {
  const response = await storeListResponse(query);
  expect(response.status).toBe(200);
  return (await response.json() as { data: { total: number; items: Array<{ storeId: string; subscription: { state: string } | null }> } }).data;
}

async function stores() {
  return (await storeList()).items[0].subscription;
}

beforeEach(async () => {
  await applyMigrations(testEnv.DB);
  await testEnv.DB.batch(['quantity_breaks_subscription_snapshots', 'quantity_breaks_entitlements', 'quantity_breaks_subscription_operations', 'admin_stores', 'admin_installations', 'internal_request_nonces'].map(table => testEnv.DB.prepare(`DELETE FROM ${table}`)));
  await new D1SessionStore(testEnv.DB, '', () => new Date(now)).recordInstallation({ storeId: '42', handle: 'zhenghaonan', scope: 'write_discounts', at: new Date(now).toISOString() });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('shows an ended unactive trial as expired while preserving its raw status and revoking application access', async () => {
  const service = new EntitlementService(repository(), {
    listSubscriptions: async () => ({ subscriptions: [subscription], lastPage: true }),
    getSubscriptionDetail: async () => ({ featureKeys: [] }),
  }, () => now);
  await expect(service.reconcileEntitlement({ appKey: 'app-a', handle: 'zhenghaonan' })).resolves.toMatchObject({ state: 'unknown', featureKeys: [], activeSpuKey: null, validUntil: null });
  const fetcher = vi.fn(() => { throw new Error('Admin list must not call Partner'); });
  vi.stubGlobal('fetch', fetcher);
  expect(await stores()).toEqual({ state: 'expired', isTrial: true, plan: 'ultra', validUntil: subscription.endAt, graceUntil: null, lastVerifiedAt: now, nextStartsAt: null, nextEndsAt: null });
  const snapshot = await testEnv.DB.prepare('SELECT subscription_json FROM quantity_breaks_subscription_snapshots WHERE app_key = ? AND shop_handle = ?').bind('app-a', 'zhenghaonan').first<{ subscription_json: string }>();
  expect(JSON.parse(snapshot!.subscription_json).status).toBe('unactive');
  expect(fetcher).not.toHaveBeenCalled();
});

it('prefers the effective current plan over old cancelled trials and future preorders, regardless of order', async () => {
  const current = { ...subscription, subId: 'paid', status: 'active', type: 'paid', isTrial: false, startAt: now - 1000, endAt: now + 1000 };
  const future = { ...current, subId: 'future', type: 'preorder', startAt: now + 1000, endAt: now + 5000 };
  const other = { ...current, subId: 'other-store', handle: 'other', endAt: now + 99999 };
  for (const records of [[subscription, current, future, other], [other, future, current, subscription]]) {
    await repository().writeSubscriptionSnapshot('app-a', 'zhenghaonan', records);
    expect(await stores()).toMatchObject({ state: 'active', plan: 'ultra', validUntil: current.endAt, isTrial: false });
  }
});

it('keeps legacy entitlement summaries when no raw snapshot has been verified', async () => {
  await repository().writeEntitlement({ appKey: 'app-a', handle: 'zhenghaonan', state: 'active', featureKeys: ['quantity_breaks_access'], activeSubscriptionId: 'paid', activeSpuKey: 'ultra', validFrom: now - 1000, validUntil: now + 1000, graceUntil: null, autoRecurring: true, absenceConfirmations: 0 });
  expect(await stores()).toEqual({ state: 'active', plan: 'ultra', validUntil: now + 1000, graceUntil: null, lastVerifiedAt: now, nextStartsAt: null, nextEndsAt: null });
});

it('does not let a subscription snapshot write failure change a verified active entitlement', async () => {
  vi.spyOn(D1SubscriptionRepository.prototype, 'writeSubscriptionSnapshot').mockRejectedValue(new Error('storage unavailable'));
  const service = new EntitlementService(repository(), {
    listSubscriptions: async () => ({ subscriptions: [{ ...subscription, status: 'active', startAt: now - 1000, endAt: now + 1000 }], lastPage: true }),
    getSubscriptionDetail: async () => ({ featureKeys: ['quantity_breaks_access'] }),
  }, () => now);
  await expect(service.reconcileEntitlement({ appKey: 'app-a', handle: 'zhenghaonan' })).resolves.toMatchObject({ state: 'trial', featureKeys: ['quantity_breaks_access'] });
});

it('refreshes the complete snapshot even when a payment event carries a subscription ID', async () => {
  await repository().writeSubscriptionSnapshot('app-a', 'zhenghaonan', [subscription]);
  const service = new EntitlementService(repository(), {
    listSubscriptions: async ({ subIds }) => {
      expect(subIds).toBeUndefined();
      return { subscriptions: [subscription].filter(record => !subIds || subIds.includes(record.subId)), lastPage: true };
    },
    getSubscriptionDetail: async () => ({ featureKeys: [] }),
  }, () => now);
  await service.reconcileEntitlement({ appKey: 'app-a', handle: 'zhenghaonan', subscriptionId: 'missing-payment' });
  expect(await stores()).toMatchObject({ state: 'expired', plan: 'ultra', validUntil: subscription.endAt });
});

it('backfills existing merchants with read-only Partner calls and no entitlement changes', async () => {
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    expect(init?.method ?? 'GET').toBe('GET');
    expect(String(input)).toContain('/app_subscribe/list.json?');
    return Response.json({ subscriptions: { data: [{
      sub_id: subscription.subId, sub_status: 'unactive', sub_type: 'trial', spu_key: 'ultra', handle: 'zhenghaonan',
      start_at: subscription.startAt, end_at: subscription.endAt, is_trial: true, auto_recurring: false,
    }], last_page: true } });
  });
  vi.stubGlobal('fetch', fetcher);
  await worker.scheduled({ cron: '*/5 * * * *' } as ScheduledController, testEnv);
  expect(await stores()).toMatchObject({ state: 'expired', plan: 'ultra', validUntil: subscription.endAt, isTrial: true });
  expect(await repository().readEntitlement('app-a', 'zhenghaonan')).toBeNull();
  expect(await repository().pendingOperationShops('app-a')).toEqual([]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await worker.scheduled({ cron: '*/5 * * * *' } as ScheduledController, testEnv);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('keeps a last verified subscription after Partner failure and retries without touching access', async () => {
  await new D1SubscriptionRepository(testEnv.DB, () => now - 60 * 60_000).writeSubscriptionSnapshot('app-a', 'zhenghaonan', [subscription]);
  vi.stubGlobal('fetch', vi.fn(async () => new Response('unavailable', { status: 503 })));
  await worker.scheduled({ cron: '*/5 * * * *' } as ScheduledController, testEnv);
  expect(await stores()).toMatchObject({ state: 'expired', plan: 'ultra', lastVerifiedAt: now - 60 * 60_000 });
  expect(await repository().readEntitlement('app-a', 'zhenghaonan')).toBeNull();
  expect(await repository().subscriptionSnapshotShops('app-a', now + 4 * 60_000)).toEqual([]);
  expect(await repository().subscriptionSnapshotShops('app-a', now + 5 * 60_000)).toEqual(['zhenghaonan']);
});

it('keeps a newer verified entitlement after a filtered payment lookup while its display snapshot is older', async () => {
  await new D1SubscriptionRepository(testEnv.DB, () => now - 1000).writeSubscriptionSnapshot('app-a', 'zhenghaonan', [subscription]);
  await repository().writeEntitlement({ appKey: 'app-a', handle: 'zhenghaonan', state: 'active', featureKeys: ['quantity_breaks_access'], activeSubscriptionId: 'new-paid', activeSpuKey: 'ultra', validFrom: now, validUntil: now + 1000, graceUntil: null, autoRecurring: true, absenceConfirmations: 0 });
  expect(await stores()).toMatchObject({ state: 'active', validUntil: now + 1000 });
});

it('derives expired and future display states from timestamps without granting access', async () => {
  await repository().writeSubscriptionSnapshot('app-a', 'zhenghaonan', [{ ...subscription, status: 'active' }]);
  expect(await stores()).toMatchObject({ state: 'expired', isTrial: true });
  await repository().writeSubscriptionSnapshot('app-a', 'zhenghaonan', [{ ...subscription, status: 'active', startAt: now + 1000, endAt: now + 2000 }]);
  expect(await stores()).toMatchObject({ state: 'scheduled', isTrial: true });
  expect(await repository().readEntitlement('app-a', 'zhenghaonan')).toBeNull();
});

it('shows a grace date only for the matching expired subscription and only during its grace window', async () => {
  await repository().writeSubscriptionSnapshot('app-a', 'zhenghaonan', [{ ...subscription, status: 'expired', endAt: now - 1000 }]);
  const entitlement = { appKey: 'app-a', handle: 'zhenghaonan', state: 'grace' as const, featureKeys: ['quantity_breaks_access'], activeSubscriptionId: subscription.subId, activeSpuKey: 'ultra', validFrom: now - 2000, validUntil: now - 1000, graceUntil: now + 1000, autoRecurring: false, absenceConfirmations: 0 };
  await repository().writeEntitlement(entitlement);
  expect(await stores()).toMatchObject({ state: 'grace', validUntil: now - 1000, graceUntil: now + 1000 });
  await repository().writeEntitlement({ ...entitlement, activeSubscriptionId: 'old-other' });
  expect(await stores()).toMatchObject({ state: 'expired', graceUntil: null });
});

it('records a confirmed empty result without reusing an old plan and isolates snapshots by app', async () => {
  await repository().writeSubscriptionSnapshot('other-app', 'zhenghaonan', [subscription]);
  expect(await stores()).toBeNull();
  await repository().writeSubscriptionSnapshot('app-a', 'zhenghaonan', [subscription]);
  await repository().writeSubscriptionSnapshot('app-a', 'zhenghaonan', []);
  expect(await stores()).toMatchObject({ state: 'inactive', plan: null, validUntil: null });
});

it('does not save incomplete pagination results or recreate a merchant after deletion', async () => {
  await new D1SubscriptionRepository(testEnv.DB, () => now - 60 * 60_000).writeSubscriptionSnapshot('app-a', 'zhenghaonan', [subscription]);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.searchParams.get('page_num') === '2') return new Response(null, { status: 503 });
    return Response.json({ subscriptions: { data: [], last_page: false } });
  }));
  await worker.scheduled({ cron: '*/5 * * * *' } as ScheduledController, testEnv);
  expect(await stores()).toMatchObject({ state: 'expired', lastVerifiedAt: now - 60 * 60_000 });
  await testEnv.DB.batch(['admin_stores', 'quantity_breaks_subscription_snapshots'].map(table => testEnv.DB.prepare(`DELETE FROM ${table}`)));
  await repository().writeSubscriptionSnapshot('app-a', 'zhenghaonan', [subscription]);
  await repository().recordSubscriptionSnapshotAttempt('app-a', 'zhenghaonan');
  expect(await testEnv.DB.prepare('SELECT count(*) AS total FROM quantity_breaks_subscription_snapshots').first()).toEqual({ total: 0 });
});

it('bounds backfill to ten installed merchants per run with at most two concurrent requests', async () => {
  await testEnv.DB.batch(Array.from({ length: 12 }, (_, index) => testEnv.DB.prepare('INSERT INTO admin_stores VALUES (?, ?, ?, ?, ?, ?)')
    .bind(String(100 + index), `bulk-${index}`, '', index === 11 ? 'uninstalled' : 'installed', 'x', 'x')));
  let running = 0, maximum = 0;
  const visited: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    running++;
    maximum = Math.max(maximum, running);
    visited.push(new URL(String(input)).searchParams.get('handle')!);
    await Promise.resolve();
    running--;
    return Response.json({ subscriptions: { data: [], last_page: true } });
  }));
  await worker.scheduled({ cron: '*/5 * * * *' } as ScheduledController, testEnv);
  expect(visited).toHaveLength(10);
  expect(maximum).toBeLessThanOrEqual(2);
  await worker.scheduled({ cron: '*/5 * * * *' } as ScheduledController, testEnv);
  expect(visited).toHaveLength(12);
  expect(new Set(visited).size).toBe(12);
  expect(visited).not.toContain('bulk-11');
});

it('expires an unactive subscription at its exact end time and keeps future or missing expiry distinct', async () => {
  for (const [endAt, state] of [[now, 'expired'], [now - 1, 'expired'], [now + 1, 'unactive'], [null, 'unactive']] as const) {
    await repository().writeSubscriptionSnapshot('app-a', 'zhenghaonan', [{ ...subscription, endAt }]);
    expect(await stores()).toMatchObject({ state, validUntil: endAt });
  }
  await repository().writeSubscriptionSnapshot('app-a', 'zhenghaonan', [{ ...subscription, status: 'cancelled' }]);
  expect(await stores()).toMatchObject({ state: 'cancelled' });
});

it('does not display an old grace window after an unactive subscription has expired', async () => {
  await repository().writeSubscriptionSnapshot('app-a', 'zhenghaonan', [{ ...subscription, endAt: now - 1000 }]);
  await repository().writeEntitlement({ appKey: 'app-a', handle: 'zhenghaonan', state: 'grace', featureKeys: ['quantity_breaks_access'], activeSubscriptionId: subscription.subId, activeSpuKey: 'ultra', validFrom: now - 2000, validUntil: now - 1000, graceUntil: now + 1000, autoRecurring: false, absenceConfirmations: 0 });
  expect(await stores()).toMatchObject({ state: 'expired', graceUntil: null });
});

it('filters subscriptions before pagination and combines installation and search filters', async () => {
  await testEnv.DB.batch(Array.from({ length: 36 }, (_, index) => {
    const handle = `filter-${String(index).padStart(2, '0')}`;
    return testEnv.DB.prepare('INSERT INTO admin_stores VALUES (?, ?, ?, ?, ?, ?)')
      .bind(String(100 + index), handle, '', index < 2 ? 'uninstalled' : 'installed', 'x', new Date(now - index * 1000).toISOString());
  }));
  for (let index = 0; index < 36; index++) {
    const handle = `filter-${String(index).padStart(2, '0')}`;
    await repository().writeSubscriptionSnapshot('app-a', handle, [{ ...subscription, handle, status: index < 30 ? 'unactive' : 'active', endAt: index < 30 ? now - 1000 : now + 1000 }]);
  }
  const page = await storeList('subscriptionStatus=expired&status=installed&query=filter-&limit=2&offset=25');
  expect(page.total).toBe(28);
  expect(page.items.map(item => item.storeId)).toEqual(['127', '128']);
  expect(page.items.every(item => item.subscription?.state === 'expired')).toBe(true);
  const empty = await storeList('subscriptionStatus=expired&status=installed&query=filter-&limit=2&offset=50');
  expect(empty).toEqual({ total: 28, items: [] });
});

it('uses the same derived subscription state for filtering and display', async () => {
  const scenarios = [
    ['unactive', now - 1, now - 1000, 'expired'], ['unactive', now + 1000, now - 1000, 'unactive'],
    ['pending', now + 1000, now - 1000, 'pending'], ['cancelled', now - 1, now - 1000, 'cancelled'],
    ['expired', now - 1, now - 1000, 'expired'], ['active', now - 1, now - 1000, 'expired'],
    ['active', now + 1000, now - 1000, 'trial'], ['active', now + 2000, now + 1000, 'scheduled'],
    ['other', now + 1000, now - 1000, 'unknown'],
  ] as const;
  for (const [status, endAt, startAt, state] of scenarios) {
    await repository().writeSubscriptionSnapshot('app-a', 'zhenghaonan', [{ ...subscription, status, endAt, startAt }]);
    const page = await storeList(`subscriptionStatus=${state}`);
    expect(page.total, `${status} -> ${state}`).toBe(1);
    expect(page.items[0].subscription?.state).toBe(state);
  }
  await repository().writeSubscriptionSnapshot('app-a', 'zhenghaonan', []);
  expect((await storeList('subscriptionStatus=inactive')).total).toBe(1);
  await testEnv.DB.prepare('DELETE FROM quantity_breaks_subscription_snapshots').run();
  expect((await storeList('subscriptionStatus=unverified')).total).toBe(1);
  expect((await storeList('subscriptionStatus=unknown')).total).toBe(0);
});

it('rejects invalid subscription filters', async () => {
  const response = await storeListResponse('subscriptionStatus=invalid');
  expect(response.status).toBe(422);
  expect(await response.json()).toMatchObject({ error: { code: 'INVALID_SUBSCRIPTION_STATUS' } });
});

it('matches display filtering across legacy, damaged snapshots, paid renewals and grace boundaries', async () => {
  const assertFilter = async (expected: string | null) => {
    expect((await stores())?.state ?? null).toBe(expected);
    for (const state of ['unknown', 'trial', 'active', 'grace', 'review_pending', 'inactive', 'unactive', 'pending', 'cancelled', 'expired', 'scheduled', 'unverified']) {
      expect((await storeList(`subscriptionStatus=${state}`)).total, state).toBe(state === (expected ?? 'unverified') ? 1 : 0);
    }
  };
  const entitlement = { appKey: 'app-a', handle: 'zhenghaonan', state: 'unknown' as const, featureKeys: [], activeSubscriptionId: subscription.subId, activeSpuKey: 'ultra', validFrom: now - 2000, validUntil: now - 1000, graceUntil: null, autoRecurring: false, absenceConfirmations: 0 };
  await repository().writeEntitlement(entitlement);
  await assertFilter('unknown');
  await repository().writeSubscriptionSnapshot('app-a', 'zhenghaonan', [subscription]);
  await testEnv.DB.prepare("UPDATE quantity_breaks_subscription_snapshots SET subscription_json = '{broken'").run();
  await assertFilter('unknown');
  await new D1SubscriptionRepository(testEnv.DB, () => now - 1000).writeSubscriptionSnapshot('app-a', 'zhenghaonan', [subscription]);
  await repository().writeEntitlement({ ...entitlement, state: 'active', validUntil: now + 1000 });
  await assertFilter('active');
  await repository().writeSubscriptionSnapshot('app-a', 'zhenghaonan', [{ ...subscription, status: 'expired' }]);
  await repository().writeEntitlement({ ...entitlement, state: 'grace', graceUntil: now + 1000 });
  await assertFilter('grace');
  await repository().writeEntitlement({ ...entitlement, state: 'grace', graceUntil: now });
  await assertFilter('expired');
  await repository().writeEntitlement({ ...entitlement, state: 'grace', graceUntil: now + 1000, activeSubscriptionId: 'other' });
  await assertFilter('expired');
  await repository().writeSubscriptionSnapshot('app-a', 'zhenghaonan', [{ ...subscription, status: 'active', type: 'paid', isTrial: false, endAt: null }]);
  await assertFilter('active');
  await repository().writeSubscriptionSnapshot('app-a', 'zhenghaonan', [{ ...subscription, status: 'unactive', endAt: null }]);
  await assertFilter('unactive');
});

it('shows recorded next-period dates consistently in store lists and details without deriving renewal dates', async () => {
  const entitlement = { appKey: 'app-a', handle: 'zhenghaonan', state: 'active' as const, featureKeys: ['quantity_breaks_access'], activeSubscriptionId: 'paid', activeSpuKey: 'ultra', validFrom: now - 1000, validUntil: now + 1000, graceUntil: null, autoRecurring: true, absenceConfirmations: 0 };
  await repository().writeEntitlement({ ...entitlement, nextDisplayFrom: now + 1000, nextDisplayUntil: now + 10000 });
  expect(await stores()).toMatchObject({ state: 'active', nextStartsAt: now + 1000, nextEndsAt: now + 10000 });
  const detail = await signedRead('/internal/admin-read/v1/stores/42');
  expect(detail.status).toBe(200);
  expect(await detail.json()).toMatchObject({ data: { subscription: await stores() } });
  await repository().writeEntitlement({ ...entitlement, nextDisplayFrom: null, nextDisplayUntil: null });
  expect(await stores()).toMatchObject({ nextStartsAt: null, nextEndsAt: null });
  await repository().writeEntitlement({ ...entitlement, nextDisplayFrom: now - 1, nextDisplayUntil: now + 10000 });
  expect(await stores()).toMatchObject({ nextStartsAt: null, nextEndsAt: null });
});
