import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import { applyMigrations } from '../src/db/migrate';
import { D1SubscriptionRepository } from '../src/db/subscriptions';
import { EntitlementService } from '../src/services/entitlements';
import { hasSubscriptionAccess } from '../src/domain/entitlement-access';
import type { Env } from '../src/env';
import type { SubscriptionRecord } from '../src/services/subscriptions';

const database = (env as Env).DB;
const now = Date.parse('2026-10-28T00:00:00.000Z');

function client(subscriptions: SubscriptionRecord[], detail: { featureKeys: string[] } = { featureKeys: ['quantity_breaks_access'] }) {
  return { listSubscriptions: async () => ({ subscriptions, lastPage: true }), getSubscriptionDetail: async () => detail };
}

describe('subscription entitlement reconciliation', () => {
  beforeEach(async () => {
    await applyMigrations(database);
    await database.batch(['quantity_breaks_subscription_operations', 'quantity_breaks_trial_ledger', 'quantity_breaks_entitlements'].map((table) => database.prepare(`DELETE FROM ${table}`)));
  });

  it('writes trial and paid active access only after detail confirms the feature key', async () => {
    const repository = new D1SubscriptionRepository(database, () => now);
    const trial = new EntitlementService(repository, client([{ subId: 'trial-1', status: 'active', type: 'trial', spuKey: 'ultra', handle: 'shop-a', startAt: now, endAt: now + 1000, autoRecurring: false, isTrial: true }]), () => now);
    await expect(trial.reconcileEntitlement({ appKey: 'app-a', handle: 'shop-a', sourceEventId: 'event-1' })).resolves.toMatchObject({ state: 'trial', version: 1 });
    const paid = new EntitlementService(repository, client([{ subId: 'paid-1', status: 'active', type: 'paid', spuKey: 'ultra', handle: 'shop-a', startAt: now, endAt: now + 1000, autoRecurring: true, isTrial: false }]), () => now);
    await expect(paid.reconcileEntitlement({ appKey: 'app-a', handle: 'shop-a' })).resolves.toMatchObject({ state: 'active', version: 2 });
    await expect(repository.consumeTrialOnce({ appKey: 'app-a', handle: 'shop-a', subscriptionId: 'another', sourceEventId: null })).resolves.toBe(false);
  });

  it('does not treat a future subscription period as effective before its start time', async () => {
    const repository = new D1SubscriptionRepository(database, () => now);
    const currentEnd = now + 2 * 24 * 60 * 60 * 1000;
    const futureEnd = now + 32 * 24 * 60 * 60 * 1000;
    const service = new EntitlementService(repository, client([
      { subId: 'current-period', status: 'active', type: 'paid', spuKey: 'ultra', handle: 'shop-a', startAt: now - 28 * 24 * 60 * 60 * 1000, endAt: currentEnd, autoRecurring: false, isTrial: false },
      { subId: 'future-period', status: 'active', type: 'paid', spuKey: 'ultra', handle: 'shop-a', startAt: now + 2 * 24 * 60 * 60 * 1000, endAt: futureEnd, autoRecurring: false, isTrial: false },
    ]), () => now);

    await expect(service.reconcileEntitlement({ appKey: 'app-a', handle: 'shop-a' }))
      .resolves.toMatchObject({ activeSubscriptionId: 'current-period', validUntil: currentEnd });
  });

  it('records a verified upcoming preorder without granting its access early', async () => {
    const repository = new D1SubscriptionRepository(database, () => now);
    const currentEnd = now + 2 * 24 * 60 * 60 * 1000;
    const nextEnd = currentEnd + 30 * 24 * 60 * 60 * 1000;
    const service = new EntitlementService(repository, client([
      { subId: 'current', status: 'active', type: 'paid', spuKey: 'ultra', handle: 'shop-a', startAt: now - 10_000, endAt: currentEnd, autoRecurring: false, isTrial: false },
      { subId: 'next', status: 'active', type: 'preorder', spuKey: 'ultra', handle: 'shop-a', startAt: currentEnd, endAt: nextEnd, autoRecurring: false, isTrial: false },
    ]), () => now);

    await expect(service.reconcileEntitlement({ appKey: 'app-a', handle: 'shop-a' })).resolves.toMatchObject({
      activeSubscriptionId: 'current', validUntil: currentEnd, nextValidFrom: currentEnd, nextValidUntil: nextEnd,
    });
    await expect(repository.readEntitlement('app-a', 'shop-a')).resolves.toMatchObject({ nextValidFrom: currentEnd, nextValidUntil: nextEnd });
  });

  it('does not report a future preorder from another store or without the required feature', async () => {
    const repository = new D1SubscriptionRepository(database, () => now);
    const current = { subId: 'current', status: 'active', type: 'paid', spuKey: 'ultra', handle: 'shop-a', startAt: now - 10_000, endAt: now + 100_000, autoRecurring: false, isTrial: false };
    const service = new EntitlementService(repository, {
      listSubscriptions: async () => ({ subscriptions: [
        current,
        { ...current, subId: 'other-store', handle: 'shop-b', type: 'preorder', startAt: now + 100_000, endAt: now + 200_000 },
        { ...current, subId: 'no-feature', type: 'preorder', startAt: now + 100_000, endAt: now + 200_000 },
      ], lastPage: true }),
      getSubscriptionDetail: async ({ subId }) => ({ featureKeys: subId === 'no-feature' ? [] : ['quantity_breaks_access'] }),
    }, () => now);

    await expect(service.reconcileEntitlement({ appKey: 'app-a', handle: 'shop-a' })).resolves.toMatchObject({
      activeSubscriptionId: 'current', nextValidFrom: null, nextValidUntil: null,
    });
  });

  it('keeps current access when checking the upcoming preorder fails', async () => {
    const repository = new D1SubscriptionRepository(database, () => now);
    const currentEnd = now + 100_000;
    const service = new EntitlementService(repository, {
      listSubscriptions: async () => ({ subscriptions: [
        { subId: 'current', status: 'active', type: 'paid', spuKey: 'ultra', handle: 'shop-a', startAt: now - 10_000, endAt: currentEnd, autoRecurring: false, isTrial: false },
        { subId: 'upcoming', status: 'active', type: 'preorder', spuKey: 'ultra', handle: 'shop-a', startAt: currentEnd, endAt: currentEnd + 100_000, autoRecurring: false, isTrial: false },
      ], lastPage: true }),
      getSubscriptionDetail: async ({ subId }) => {
        if (subId === 'upcoming') throw new Error('Partner detail temporarily unavailable');
        return { featureKeys: ['quantity_breaks_access'] };
      },
    }, () => now);

    await expect(service.reconcileEntitlement({ appKey: 'app-a', handle: 'shop-a' })).resolves.toMatchObject({
      state: 'active', activeSubscriptionId: 'current', nextValidFrom: null,
    });
  });

  it.each(['missing-feature', 'unavailable'])('displays the next preorder even when its detail is %s without granting unverified access', async (outcome) => {
    const repository = new D1SubscriptionRepository(database, () => now);
    const end = now + 100_000;
    const current: SubscriptionRecord = { subId: 'current', status: 'active', type: 'paid', spuKey: 'ultra', handle: 'shop-a', startAt: now - 10_000, endAt: end, autoRecurring: false, isTrial: false };
    const next = { ...current, subId: 'next', type: 'preorder', startAt: end, endAt: end + 100_000 };
    const service = new EntitlementService(repository, {
      listSubscriptions: async () => ({ subscriptions: [next, current], lastPage: true }),
      getSubscriptionDetail: async ({ subId }) => {
        if (subId === 'current') return { featureKeys: ['quantity_breaks_access'] };
        if (outcome === 'unavailable') throw new Error('Partner temporarily unavailable');
        return { featureKeys: [] };
      },
    }, () => now);
    const result = await service.reconcileEntitlement({ appKey: 'app-a', handle: 'shop-a' });
    expect(result).toMatchObject({ nextDisplayFrom: end, nextDisplayUntil: end + 100_000, nextValidFrom: null, nextValidUntil: null });
    expect(await repository.readEntitlement('app-a', 'shop-a')).toMatchObject({ nextDisplayFrom: end, nextDisplayUntil: end + 100_000 });
    expect(hasSubscriptionAccess(result, end + 1)).toBe(false);
  });

  it('displays only the earliest valid future preorder belonging to this shop and package', async () => {
    const repository = new D1SubscriptionRepository(database, () => now);
    const current: SubscriptionRecord = { subId: 'current', status: 'active', type: 'paid', spuKey: 'ultra', handle: 'shop-a', startAt: now - 10_000, endAt: now + 100_000, autoRecurring: false, isTrial: false };
    const next = { ...current, subId: 'next', type: 'preorder', startAt: now + 200_000, endAt: now + 300_000 };
    const records = [current, { ...next, subId: 'later', startAt: now + 250_000 },
      { ...next, subId: 'cancelled', status: 'cancelled', startAt: now + 100_000 },
      { ...next, subId: 'other-shop', handle: 'shop-b', startAt: now + 100_000 },
      { ...next, subId: 'other-plan', spuKey: 'other', startAt: now + 100_000 },
      { ...next, subId: 'invalid', startAt: now + 400_000 }, next];
    const service = new EntitlementService(repository, client(records, { featureKeys: ['quantity_breaks_access'] }), () => now);
    expect(await service.reconcileEntitlement({ appKey: 'app-a', handle: 'shop-a' })).toMatchObject({ nextDisplayFrom: next.startAt, nextDisplayUntil: next.endAt });
    next.status = 'cancelled';
    records.splice(1, 1);
    expect(await service.reconcileEntitlement({ appKey: 'app-a', handle: 'shop-a' })).toMatchObject({ nextDisplayFrom: null, nextDisplayUntil: null });
  });

  it('keeps a paid store review_pending when Partner has not exposed the subscription yet', async () => {
    const repository = new D1SubscriptionRepository(database, () => now);
    let requestedSubIds: string[] | undefined;
    const service = new EntitlementService(repository, {
      listSubscriptions: async ({ subIds }) => {
        requestedSubIds = subIds;
        return { subscriptions: [], lastPage: true };
      },
      getSubscriptionDetail: async () => ({ featureKeys: [] }),
    }, () => now);

    await expect(service.reconcileEntitlement({ appKey: 'app-a', handle: 'shop-a', subscriptionId: 'sub-paid', paymentPending: true, sourceEventId: 'payment:trade-1' }))
      .resolves.toMatchObject({ state: 'review_pending', activeSubscriptionId: 'sub-paid', featureKeys: [] });
    expect(requestedSubIds).toBeUndefined();
    await expect(repository.pendingOperationShops('app-a')).resolves.toEqual(['shop-a']);
  });

  it('creates a new short-backoff operation for each pending payment retry window', async () => {
    const repository = new D1SubscriptionRepository(database, () => now);
    const service = new EntitlementService(repository, {
      listSubscriptions: async () => ({ subscriptions: [], lastPage: true }),
      getSubscriptionDetail: async () => ({ featureKeys: [] }),
    }, () => now);

    await service.reconcileEntitlement({ appKey: 'app-a', handle: 'shop-a', subscriptionId: 'sub-paid', paymentPending: true, sourceEventId: 'payment:trade-1' });
    const first = await database.prepare("SELECT operation_key FROM quantity_breaks_subscription_operations WHERE state = 'pending'").all<{ operation_key: string }>();
    const nextService = new EntitlementService(repository, {
      listSubscriptions: async () => ({ subscriptions: [], lastPage: true }),
      getSubscriptionDetail: async () => ({ featureKeys: [] }),
    }, () => now + 2_000);
    await nextService.reconcileEntitlement({ appKey: 'app-a', handle: 'shop-a' });
    const second = await database.prepare("SELECT operation_key FROM quantity_breaks_subscription_operations WHERE state = 'pending'").all<{ operation_key: string }>();
    expect(second.results.map((row) => row.operation_key)).toHaveLength(first.results.length + 1);
  });

  it('keeps payment reconciliation keys bounded when retries have no subscription ID', async () => {
    let clock = now;
    const repository = new D1SubscriptionRepository(database, () => clock);
    const service = new EntitlementService(repository, client([]), () => clock);
    let sourceEventId = 'payment:trade-without-subscription-id';
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await service.reconcileEntitlement({ appKey: 'app-a', handle: 'shop-a', paymentPending: attempt === 0, sourceEventId });
      const tasks = await repository.claimDueOperations(clock + 2_000, 10);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].operationKey.length).toBeLessThan(256);
      sourceEventId = tasks[0].operationKey;
      await repository.finishOperation(sourceEventId, tasks[0].attempts);
      clock += 2_000;
    }
    await expect(repository.readEntitlement('app-a', 'shop-a')).resolves.toMatchObject({ state: 'review_pending', activeSubscriptionId: null, featureKeys: [] });
  });

  it('deduplicates payment checks for the same store and retry window regardless of source event', async () => {
    const repository = new D1SubscriptionRepository(database, () => now);
    const service = new EntitlementService(repository, client([]), () => now);
    await service.reconcileEntitlement({ appKey: 'app-a', handle: 'shop-a', paymentPending: true, sourceEventId: 'callback:one' });
    await service.reconcileEntitlement({ appKey: 'app-a', handle: 'shop-a', sourceEventId: 'background:two' });
    const tasks = await repository.claimDueOperations(now + 2_000, 10);
    expect(tasks).toHaveLength(1);
  });

  it('does not grant access when an active Ultra subscription lacks the required feature key', async () => {
    const repository = new D1SubscriptionRepository(database, () => now);
    const service = new EntitlementService(repository, {
      listSubscriptions: async () => ({
        subscriptions: [{ subId: 'sub-no-feature', status: 'active', type: 'paid', spuKey: 'ultra', handle: 'shop-a', startAt: now, endAt: now + 30_000, autoRecurring: true, isTrial: false }],
        lastPage: true,
      }),
      getSubscriptionDetail: async () => ({ featureKeys: [] }),
    }, () => now);

    await expect(service.reconcileEntitlement({ appKey: 'app-a', handle: 'shop-a' })).resolves.toMatchObject({ state: 'unknown', featureKeys: [] });
  });

  it('does not grant another store subscription returned by Partner', async () => {
    const repository = new D1SubscriptionRepository(database, () => now);
    const service = new EntitlementService(repository, {
      listSubscriptions: async () => ({
        subscriptions: [{ subId: 'sub-other-store', status: 'active', type: 'paid', spuKey: 'ultra', handle: 'shop-b', startAt: now, endAt: now + 30_000, autoRecurring: true, isTrial: false }],
        lastPage: true,
      }),
      getSubscriptionDetail: async () => ({ featureKeys: ['quantity_breaks_access'] }),
    }, () => now);

    await expect(service.reconcileEntitlement({ appKey: 'app-a', handle: 'shop-a' })).resolves.toMatchObject({ state: 'unknown', featureKeys: [] });
  });

  it('keeps access during grace and requires two successful absent checks before inactive', async () => {
    const repository = new D1SubscriptionRepository(database, () => now + 2_000);
    await repository.writeEntitlement({ appKey: 'app-a', handle: 'shop-a', state: 'active', featureKeys: ['quantity_breaks_access'], activeSubscriptionId: 'old', activeSpuKey: 'ultra', validFrom: now - 10_000, validUntil: now, graceUntil: null, autoRecurring: true, absenceConfirmations: 0 });
    const service = new EntitlementService(repository, client([]), () => now + 2_000);
    await expect(service.reconcileEntitlement({ appKey: 'app-a', handle: 'shop-a' })).resolves.toMatchObject({ state: 'grace' });
    const afterGrace = new EntitlementService(repository, client([]), () => now + 86_400_001);
    await expect(afterGrace.reconcileEntitlement({ appKey: 'app-a', handle: 'shop-a' })).resolves.toMatchObject({ state: 'review_pending', absenceConfirmations: 1 });
    await expect(afterGrace.reconcileEntitlement({ appKey: 'app-a', handle: 'shop-a' })).resolves.toMatchObject({ state: 'inactive', absenceConfirmations: 2 });
  });

  it('revokes access immediately when an Ultra subscription is cancelled before its end time', async () => {
    const repository = new D1SubscriptionRepository(database, () => now);
    await repository.writeEntitlement({ appKey: 'app-a', handle: 'shop-a', state: 'active', featureKeys: ['quantity_breaks_access'], activeSubscriptionId: 'sub-active', activeSpuKey: 'ultra', validFrom: now - 10_000, validUntil: now + 86_400_000, graceUntil: null, autoRecurring: true, absenceConfirmations: 0 });
    const service = new EntitlementService(repository, client([
      { subId: 'sub-cancelled', status: 'cancelled', type: 'paid', spuKey: 'ultra', handle: 'shop-a', startAt: now - 10_000, endAt: now + 86_400_000, autoRecurring: false, isTrial: false },
    ]), () => now);

    await expect(service.reconcileEntitlement({ appKey: 'app-a', handle: 'shop-a' })).resolves.toMatchObject({
      state: 'unknown', featureKeys: [], activeSubscriptionId: null, validUntil: null, graceUntil: null,
    });
  });

  it('preserves the last confirmed entitlement when Partner API fails and isolates stores', async () => {
    const repository = new D1SubscriptionRepository(database, () => now);
    await repository.writeEntitlement({ appKey: 'app-a', handle: 'shop-a', state: 'active', featureKeys: ['quantity_breaks_access'], activeSubscriptionId: 'sub-a', activeSpuKey: 'ultra', validFrom: now, validUntil: now + 1_000, graceUntil: null, autoRecurring: true, absenceConfirmations: 0 });
    const failing = new EntitlementService(repository, { listSubscriptions: async () => { throw new Error('503'); }, getSubscriptionDetail: async () => ({ featureKeys: [] }) }, () => now);
    await expect(failing.reconcileEntitlement({ appKey: 'app-a', handle: 'shop-a' })).resolves.toMatchObject({ state: 'active', activeSubscriptionId: 'sub-a' });
    await expect(repository.readEntitlement('app-a', 'shop-b')).resolves.toBeNull();
  });

  it('checks every Partner subscription list page before marking a store absent', async () => {
    const repository = new D1SubscriptionRepository(database, () => now);
    const service = new EntitlementService(repository, {
      listSubscriptions: async ({ pageNum }) => pageNum === 2
        ? {
          subscriptions: [{ subId: 'paid-page-two', status: 'active', type: 'paid', spuKey: 'ultra', handle: 'shop-a', startAt: now, endAt: now + 86_400_000, autoRecurring: true, isTrial: false }],
          lastPage: true,
        }
        : { subscriptions: [], lastPage: false },
      getSubscriptionDetail: async () => ({ featureKeys: ['quantity_breaks_access'] }),
    }, () => now);

    await expect(service.reconcileEntitlement({ appKey: 'app-a', handle: 'shop-a' })).resolves.toMatchObject({ state: 'active', activeSubscriptionId: 'paid-page-two' });
  });
  it.each(['unactive', 'cancelled', 'expired'])('finds the effective next period even when the notification names the old %s subscription', async (status) => {
    const repository = new D1SubscriptionRepository(database, () => now);
    const old: SubscriptionRecord = { subId: 'old', status, type: 'paid', spuKey: 'ultra', handle: 'shop-a', startAt: now - 30_000, endAt: now, autoRecurring: false, isTrial: false };
    const next: SubscriptionRecord = { ...old, subId: 'next', status: 'active', type: 'preorder', startAt: now, endAt: now + 30_000 };
    const requested: Array<string[] | undefined> = [];
    const service = new EntitlementService(repository, {
      listSubscriptions: async ({ subIds, pageNum }) => {
        requested.push(subIds);
        return { subscriptions: (pageNum === 1 ? [old] : [next]).filter(row => !subIds || subIds.includes(row.subId)), lastPage: !!subIds || pageNum === 2 };
      },
      getSubscriptionDetail: async () => ({ featureKeys: ['quantity_breaks_access'] }),
    }, () => now);
    await expect(service.reconcileEntitlement({ appKey: 'app-a', handle: 'shop-a', subscriptionId: 'old' })).resolves.toMatchObject({ state: 'active', activeSubscriptionId: 'next', validUntil: now + 30_000 });
    expect(requested).toEqual([undefined, undefined]);
    const tasks = await repository.claimDueOperations(now, 10);
    expect(tasks).toHaveLength(0);
  });

  it('does not renew an ended period just because its list status is still active', async () => {
    const repository = new D1SubscriptionRepository(database, () => now);
    await repository.writeEntitlement({ appKey: 'app-a', handle: 'shop-a', state: 'active', featureKeys: ['quantity_breaks_access'], activeSubscriptionId: 'old', activeSpuKey: 'ultra', validFrom: now - 100_000_000, validUntil: now - 86_400_001, graceUntil: null, autoRecurring: false, absenceConfirmations: 0 });
    const service = new EntitlementService(repository, client([{ subId: 'old', status: 'active', type: 'paid', spuKey: 'ultra', handle: 'shop-a', startAt: now - 100_000_000, endAt: now - 86_400_001, autoRecurring: false, isTrial: false }]), () => now);
    await expect(service.reconcileEntitlement({ appKey: 'app-a', handle: 'shop-a' })).resolves.toMatchObject({ state: 'unknown', featureKeys: [] });
  });

  it('preserves verified continuous coverage when a delayed payment notification cannot reach Partner', async () => {
    const repository = new D1SubscriptionRepository(database, () => now);
    await repository.writeEntitlement({ appKey: 'app-a', handle: 'shop-a', state: 'active', featureKeys: ['quantity_breaks_access'], activeSubscriptionId: 'current', activeSpuKey: 'ultra', validFrom: now - 100_000, validUntil: now, nextValidFrom: now, nextValidUntil: now + 86_400_000, graceUntil: null, autoRecurring: false, absenceConfirmations: 0 });
    const service = new EntitlementService(repository, { listSubscriptions: async () => { throw new Error('Partner 503'); }, getSubscriptionDetail: async () => ({ featureKeys: [] }) }, () => now + 1);
    const result = await service.reconcileEntitlement({ appKey: 'app-a', handle: 'shop-a', subscriptionId: 'next', paymentPending: true });
    expect(result).toMatchObject({ nextValidFrom: now, nextValidUntil: now + 86_400_000 });
    expect(hasSubscriptionAccess(result, now + 1)).toBe(true);
  });

  it('clears future coverage when the verified full list cancels the upcoming period', async () => {
    let clock = now;
    const repository = new D1SubscriptionRepository(database, () => clock);
    const current: SubscriptionRecord = { subId: 'current', status: 'active', type: 'paid', spuKey: 'ultra', handle: 'shop-a', startAt: now - 100_000, endAt: now + 100, autoRecurring: false, isTrial: false };
    const next = { ...current, subId: 'next', type: 'preorder', startAt: now + 100, endAt: now + 86_400_000 };
    const records = [current, next];
    const service = new EntitlementService(repository, client(records), () => clock);
    await service.reconcileEntitlement({ appKey: 'app-a', handle: 'shop-a' });
    next.status = 'cancelled';
    const result = await service.reconcileEntitlement({ appKey: 'app-a', handle: 'shop-a' });
    expect(result).toMatchObject({ state: 'active', nextValidFrom: null, nextValidUntil: null });
    clock += 101;
    expect(hasSubscriptionAccess(result, clock)).toBe(false);
  });

});
