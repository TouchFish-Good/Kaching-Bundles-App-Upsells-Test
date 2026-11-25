import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import { applyMigrations } from '../src/db/migrate';
import { D1SubscriptionRepository } from '../src/db/subscriptions';
import type { Env } from '../src/env';

const database = (env as Env).DB;

describe('D1 subscription repository', () => {
  beforeEach(async () => {
    await applyMigrations(database);
    await database.batch([
      database.prepare('DELETE FROM quantity_breaks_subscription_operations'),
      database.prepare('DELETE FROM quantity_breaks_subscription_orders'),
      database.prepare('DELETE FROM quantity_breaks_trial_ledger'),
      database.prepare('DELETE FROM quantity_breaks_entitlements'),
      database.prepare('DELETE FROM quantity_breaks_shop_locks'),
    ]);
  });

  it('consumes a trial at most once for one app and store', async () => {
    const repository = new D1SubscriptionRepository(database, () => 1_700_000_000_000);

    await expect(repository.consumeTrialOnce({ appKey: 'app-a', handle: 'shop-a', subscriptionId: 'trial-1', sourceEventId: 'event-1' })).resolves.toBe(true);
    await expect(repository.consumeTrialOnce({ appKey: 'app-a', handle: 'shop-a', subscriptionId: 'trial-2', sourceEventId: 'event-2' })).resolves.toBe(false);
    await expect(repository.consumeTrialOnce({ appKey: 'app-a', handle: 'shop-b', subscriptionId: 'trial-3', sourceEventId: 'event-3' })).resolves.toBe(true);
  });

  it('keeps entitlements isolated by app and store', async () => {
    const repository = new D1SubscriptionRepository(database, () => 1_700_000_000_000);

    await repository.writeEntitlement({ appKey: 'app-a', handle: 'shop-a', state: 'active', featureKeys: ['quantity_breaks_access'], activeSubscriptionId: 'sub-1', activeSpuKey: 'ultra', validFrom: 1_700_000_000_000, validUntil: 1_700_002_592_000, graceUntil: null, autoRecurring: true, absenceConfirmations: 0 });

    await expect(repository.readEntitlement('app-a', 'shop-a')).resolves.toMatchObject({ state: 'active', version: 1, featureKeys: ['quantity_breaks_access'] });
    await expect(repository.readEntitlement('app-a', 'shop-b')).resolves.toBeNull();
    await expect(repository.readEntitlement('app-b', 'shop-a')).resolves.toBeNull();
  });

  it('enqueues an operation only once and claims only due work', async () => {
    const repository = new D1SubscriptionRepository(database, () => 1_700_000_000_000);
    const operation = { operationKey: 'subscription-expired:shop-a:1:campaign-a', appKey: 'app-a', handle: 'shop-a', entitlementVersion: 1, kind: 'pause_campaign' as const, campaignId: 'campaign-a', nextAttemptAt: 1_700_000_000_000 };

    await expect(repository.enqueueOperationOnce(operation)).resolves.toBe(true);
    await expect(repository.enqueueOperationOnce(operation)).resolves.toBe(false);
    await expect(repository.claimDueOperations(1_700_000_000_000, 10)).resolves.toEqual([expect.objectContaining({ operationKey: operation.operationKey, state: 'running', attempts: 1 })]);
    await expect(repository.claimDueOperations(1_700_000_000_000, 10)).resolves.toEqual([]);
  });

  it('enqueues one immediate reconcile operation per payment event', async () => {
    const repository = new D1SubscriptionRepository(database, () => 1_700_000_000_000);
    const input = { appKey: 'app-a', handle: 'shop-a', operationKey: 'payment:trade-1', nextAttemptAt: 1_700_000_000_000 };

    await expect(repository.enqueueReconcileOnce(input)).resolves.toBe(true);
    await expect(repository.enqueueReconcileOnce(input)).resolves.toBe(false);
    await expect(repository.pendingOperationShops('app-a')).resolves.toEqual(['shop-a']);
  });

  it('keeps payment order status monotonic when paid and expiry events arrive out of order', async () => {
    const repository = new D1SubscriptionRepository(database, () => 1_700_000_000_000);
    await repository.createOrderOnce({ outTradeNo: 'qb-order-monotonic', appKey: 'app-a', handle: 'shop-a', spuKey: 'ultra', skuId: 'ultra-30', status: 'pending' });

    await expect(repository.updateOrderStatus('qb-order-monotonic', 'paid', 'sub-1')).resolves.toMatchObject({ status: 'paid', subscriptionId: 'sub-1' });
    await expect(repository.updateOrderStatus('qb-order-monotonic', 'pending')).resolves.toMatchObject({ status: 'paid' });
    await expect(repository.updateOrderStatus('qb-order-monotonic', 'expired')).resolves.toMatchObject({ status: 'expired' });
    await expect(repository.updateOrderStatus('qb-order-monotonic', 'paid')).resolves.toMatchObject({ status: 'expired' });
  });

  it('stops retrying an operation after its third failed attempt', async () => {
    const repository = new D1SubscriptionRepository(database, () => 1_700_000_000_000);
    await repository.enqueueReconcileOnce({ operationKey: 'retry-at-most-three', appKey: 'app-a', handle: 'shop-a', nextAttemptAt: 1_700_000_000_000 });

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const [claimed] = await repository.claimDueOperations(1_700_000_000_000 + attempt, 1);
      expect(claimed).toMatchObject({ attempts: attempt, state: 'running' });
      await repository.retryOperation('retry-at-most-three', 1_700_000_000_000 + attempt + 1, `attempt ${attempt}`, claimed.attempts);
    }

    const final = await database.prepare('SELECT state, attempts FROM quantity_breaks_subscription_operations WHERE operation_key = ?').bind('retry-at-most-three').first<{ state: string; attempts: number }>();
    expect(final).toEqual({ state: 'failed', attempts: 3 });
  });

  it('purges only expired reconcile history based on its last state update', async () => {
    const now = 1_800_000_000_000;
    const day = 86_400_000;
    const repository = new D1SubscriptionRepository(database, () => now);
    const fixtures = [
      ['old-success', 'succeeded', now - 7 * day],
      ['recent-success', 'succeeded', now - 7 * day + 1],
      ['old-failure', 'failed', now - 30 * day],
      ['recent-failure', 'failed', now - 30 * day + 1],
      ['pending', 'pending', now - 60 * day],
      ['retrying', 'retrying', now - 60 * day],
      ['running', 'running', now - 60 * day],
      ['blocked', 'blocked', now - 60 * day],
    ] as const;
    for (const [operationKey, state, updatedAt] of fixtures) {
      await repository.enqueueReconcileOnce({ operationKey, appKey: 'app-a', handle: 'shop-a', nextAttemptAt: now });
      await database.prepare('UPDATE quantity_breaks_subscription_operations SET state = ?, created_at = ?, updated_at = ? WHERE operation_key = ?')
        .bind(state, now - 90 * day, updatedAt, operationKey).run();
    }

    await expect(repository.purgeOperationHistory(now)).resolves.toEqual({ deleted: 2, compacted: 0 });
    const kept = await database.prepare('SELECT operation_key FROM quantity_breaks_subscription_operations ORDER BY operation_key').all<{ operation_key: string }>();
    expect(kept.results.map((row) => row.operation_key)).toEqual(['blocked', 'pending', 'recent-failure', 'recent-success', 'retrying', 'running']);
  });

  it('retains discount-operation deduplication records when removing old error details', async () => {
    const now = 1_800_000_000_000;
    const repository = new D1SubscriptionRepository(database, () => now);
    for (const kind of ['pause_campaign', 'disable_storefront', 'resume_check'] as const) {
      for (const state of ['succeeded', 'failed', 'blocked'] as const) {
        const input = { operationKey: `${kind}:${state}`, appKey: 'app-a', handle: 'shop-a', entitlementVersion: 1, kind, campaignId: 'campaign-a', nextAttemptAt: now };
        await repository.enqueueOperationOnce(input);
        await database.prepare('UPDATE quantity_breaks_subscription_operations SET state = ?, last_error = ?, updated_at = ? WHERE operation_key = ?')
          .bind(state, 'Old operation detail', now - 30 * 86_400_000, input.operationKey).run();
        await repository.purgeOperationHistory(now);
        await expect(repository.enqueueOperationOnce(input)).resolves.toBe(false);
        await expect(database.prepare('SELECT state, last_error FROM quantity_breaks_subscription_operations WHERE operation_key = ?').bind(input.operationKey).first())
          .resolves.toEqual({ state, last_error: state === 'blocked' ? 'Old operation detail' : null });
      }
    }
  });

  it('limits each history deletion batch and continues on the next run', async () => {
    const now = 1_800_000_000_000;
    const repository = new D1SubscriptionRepository(database, () => now);
    for (let index = 0; index < 3; index += 1) {
      await repository.enqueueReconcileOnce({ operationKey: `old-${index}`, appKey: 'app-a', handle: 'shop-a', nextAttemptAt: now });
    }
    await database.prepare("UPDATE quantity_breaks_subscription_operations SET state = 'succeeded', updated_at = ?").bind(now - 8 * 86_400_000).run();
    await expect(repository.purgeOperationHistory(now, 2)).resolves.toEqual({ deleted: 2, compacted: 0 });
    await expect(repository.purgeOperationHistory(now, 2)).resolves.toEqual({ deleted: 1, compacted: 0 });
    await expect(repository.purgeOperationHistory(now, 2)).resolves.toEqual({ deleted: 0, compacted: 0 });
  });

  it('recovers stale reads with a retry limit and blocks uncertain discount operations', async () => {
    const now = 1_800_000_000_000;
    const repository = new D1SubscriptionRepository(database, () => now);
    for (const [operationKey, kind, attempts, updatedAt] of [
      ['stale-read', 'reconcile', 1, now - 15 * 60_000],
      ['exhausted-read', 'reconcile', 3, now - 15 * 60_000],
      ['live-read', 'reconcile', 1, now - 15 * 60_000 + 1],
      ['uncertain-delete', 'pause_campaign', 1, now - 15 * 60_000],
    ] as const) {
      await repository.enqueueOperationOnce({ operationKey, kind, appKey: 'app-a', handle: 'shop-a', entitlementVersion: 1, campaignId: null, nextAttemptAt: now });
      await database.prepare("UPDATE quantity_breaks_subscription_operations SET state = 'running', attempts = ?, updated_at = ? WHERE operation_key = ?")
        .bind(attempts, updatedAt, operationKey).run();
    }
    await expect(repository.recoverStalledOperations(now)).resolves.toBe(3);
    const rows = await database.prepare('SELECT operation_key, state FROM quantity_breaks_subscription_operations ORDER BY operation_key').all();
    expect(rows.results).toEqual([
      { operation_key: 'exhausted-read', state: 'failed' },
      { operation_key: 'live-read', state: 'running' },
      { operation_key: 'stale-read', state: 'retrying' },
      { operation_key: 'uncertain-delete', state: 'blocked' },
    ]);
    const claimed = await repository.claimDueOperations(now, 10);
    expect(claimed).toEqual([expect.objectContaining({ operationKey: 'stale-read', attempts: 2 })]);
  });

  it('rejects completion and retry from an older claim after a stale read is reclaimed', async () => {
    let now = 1_800_000_000_000;
    const repository = new D1SubscriptionRepository(database, () => now);
    await repository.enqueueReconcileOnce({ operationKey: 'reclaimed-read', appKey: 'app-a', handle: 'shop-a', nextAttemptAt: now });
    const [first] = await repository.claimDueOperations(now, 1);
    now += 15 * 60_000;
    await repository.recoverStalledOperations(now);
    const [second] = await repository.claimDueOperations(now, 1);
    await repository.finishOperation(first.operationKey, first.attempts);
    await repository.retryOperation(first.operationKey, now, 'Late failure', first.attempts);
    await expect(database.prepare('SELECT state, attempts, last_error FROM quantity_breaks_subscription_operations WHERE operation_key = ?').bind(first.operationKey).first())
      .resolves.toEqual({ state: 'running', attempts: 2, last_error: 'OPERATION_LEASE_EXPIRED' });
    await repository.finishOperation(second.operationKey, second.attempts);
    await expect(database.prepare('SELECT state FROM quantity_breaks_subscription_operations WHERE operation_key = ?').bind(first.operationKey).first())
      .resolves.toEqual({ state: 'succeeded' });
  });
  it('serializes one shop entitlement while allowing other shops and rejects late writes after lease expiry', async () => {
    let clock = 1_800_000_000_000;
    const repository = new D1SubscriptionRepository(database, () => clock);
    const value = { appKey: 'app-a', handle: 'shop-a', state: 'active' as const, featureKeys: ['quantity_breaks_access'], activeSubscriptionId: 'sub', activeSpuKey: 'ultra', validFrom: clock, validUntil: clock + 1_000, graceUntil: null, autoRecurring: false, absenceConfirmations: 0 };
    await repository.withEntitlementLock('app-a', 'shop-a', async (locked) => {
      await expect(repository.withEntitlementLock('app-a', 'shop-a', async () => null)).rejects.toThrow(/in progress/);
      await expect(repository.withEntitlementLock('app-a', 'shop-b', async () => 42)).resolves.toBe(42);
      await locked.writeEntitlement(value);
      clock += 21 * 60_000;
      await repository.withEntitlementLock('app-a', 'shop-a', async (newOwner) => {
        await newOwner.writeEntitlement({ ...value, activeSubscriptionId: 'renewed' });
        await expect(locked.writeEntitlement({ ...value, state: 'inactive' })).rejects.toThrow(/lease/);
      });
    });
    await expect(repository.readEntitlement('app-a', 'shop-a')).resolves.toMatchObject({ state: 'active', activeSubscriptionId: 'renewed' });
    await expect(repository.withEntitlementLock('app-a', 'shop-a', async () => { throw new Error('test release'); })).rejects.toThrow('test release');
    await expect(repository.withEntitlementLock('app-a', 'shop-a', async () => true)).resolves.toBe(true);
  });

});
