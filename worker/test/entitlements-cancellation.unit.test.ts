import { describe, expect, it } from 'vitest';

import type { D1SubscriptionRepository, Entitlement, WriteEntitlement } from '../src/db/subscriptions';
import { EntitlementService } from '../src/services/entitlements';

const now = Date.parse('2026-10-30T00:00:00.000Z');
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function existingEntitlement(overrides: Partial<Entitlement> = {}): Entitlement {
  return {
    appKey: 'app-a', handle: 'shop-a', state: 'active', featureKeys: ['quantity_breaks_access'], activeSubscriptionId: 'sub-active', activeSpuKey: 'ultra',
    validFrom: now - 10_000, validUntil: now + 30 * ONE_DAY_MS, nextValidFrom: null, nextValidUntil: null,
    graceUntil: null, autoRecurring: true, absenceConfirmations: 0, lastVerifiedAt: now, version: 1,
    ...overrides,
  };
}

function serviceFor(status: string, endAt: number, initial = existingEntitlement()) {
  let saved: Entitlement | null = initial;
  const expiryVersions: number[] = [];
  const operations: Array<Record<string, unknown>> = [];
  const repository = {
    hasEntitlementLease: true,
    assertEntitlementLease: async () => {},
    readEntitlement: async () => saved,
    writeEntitlement: async (input: WriteEntitlement) => {
      saved = { ...input, nextValidFrom: input.nextValidFrom ?? null, nextValidUntil: input.nextValidUntil ?? null,
        lastVerifiedAt: now, version: (saved?.version ?? 0) + 1 };
      return saved;
    },
    enqueueExpiryOperations: async (_appKey: string, _handle: string, version: number) => {
      expiryVersions.push(version);
      return 1;
    },
    enqueueOperationOnce: async (input: Record<string, unknown>) => {
      operations.push(input);
      return true;
    },
  } as unknown as D1SubscriptionRepository;
  const service = new EntitlementService(repository, {
    listSubscriptions: async () => ({
      subscriptions: [{ subId: `sub-${status}`, status, type: 'paid', spuKey: 'ultra', handle: 'shop-a', startAt: now - 10_000, endAt, autoRecurring: false, isTrial: false }],
      lastPage: true,
    }),
    getSubscriptionDetail: async () => ({ featureKeys: [] }),
  }, () => now);
  return { service, expiryVersions, operations };
}

describe('subscription cancellation entitlement', () => {
  it('removes a paid entitlement immediately when its Ultra subscription is cancelled before end_at', async () => {
    const { service, expiryVersions } = serviceFor('cancelled', now + ONE_DAY_MS);

    await expect(service.reconcileEntitlement({ appKey: 'app-a', handle: 'shop-a' })).resolves.toMatchObject({
      state: 'unknown', featureKeys: [], activeSubscriptionId: null, validUntil: null, graceUntil: null,
    });
    expect(expiryVersions).toEqual([2]);
  });

  it.each(['unactive', 'pending'])('removes all access and schedules campaign suspension when the current Ultra subscription is %s', async (status) => {
    const { service, expiryVersions } = serviceFor(status, now + ONE_DAY_MS);

    await expect(service.reconcileEntitlement({ appKey: 'app-a', handle: 'shop-a' })).resolves.toMatchObject({
      state: 'unknown', featureKeys: [], activeSubscriptionId: null, validUntil: null, graceUntil: null,
    });
    expect(expiryVersions).toEqual([2]);
  });

  it('keeps access only through the single expired-subscription grace day measured from the Partner end_at value', async () => {
    const expiredAt = now - 60 * 60 * 1000;
    const { service, expiryVersions, operations } = serviceFor('expired', expiredAt);

    await expect(service.reconcileEntitlement({ appKey: 'app-a', handle: 'shop-a' })).resolves.toMatchObject({
      state: 'grace', featureKeys: ['quantity_breaks_access'], validUntil: expiredAt, graceUntil: expiredAt + ONE_DAY_MS,
    });
    expect(expiryVersions).toEqual([]);
    expect(operations).toEqual([expect.objectContaining({
      kind: 'reconcile', nextAttemptAt: expiredAt + ONE_DAY_MS, entitlementVersion: 2,
    })]);
  });

  it('removes all access and schedules campaign suspension immediately after the expired-subscription grace day', async () => {
    const { service, expiryVersions } = serviceFor('expired', now - ONE_DAY_MS - 1);

    await expect(service.reconcileEntitlement({ appKey: 'app-a', handle: 'shop-a' })).resolves.toMatchObject({
      state: 'unknown', featureKeys: [], activeSubscriptionId: null, validUntil: null, graceUntil: null,
    });
    expect(expiryVersions).toEqual([2]);
  });
});
