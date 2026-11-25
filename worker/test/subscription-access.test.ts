import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import { applyMigrations } from '../src/db/migrate';
import { D1SubscriptionRepository } from '../src/db/subscriptions';
import { hasSubscriptionAccess, requireSubscriptionAccess } from '../src/routes/subscription-access';
import type { Env } from '../src/env';

const database = (env as Env).DB;

describe('subscription access guard', () => {
  beforeEach(async () => {
    await applyMigrations(database);
    await database.prepare('DELETE FROM quantity_breaks_entitlements').run();
  });

  it('returns the required JSON 403 unless the authenticated shop has a valid entitlement', async () => {
    const denied = await requireSubscriptionAccess(database, 'app-a', 'shop-a');
    expect(denied).toBeInstanceOf(Response);
    expect((denied as Response).status).toBe(403);
    await expect((denied as Response).json()).resolves.toEqual({ error: 'Subscription required.', code: 'SUBSCRIPTION_REQUIRED' });

    await new D1SubscriptionRepository(database).writeEntitlement({ appKey: 'app-a', handle: 'shop-a', state: 'grace', featureKeys: ['quantity_breaks_access'], activeSubscriptionId: 'sub', activeSpuKey: 'ultra', validFrom: null, validUntil: null, graceUntil: null, autoRecurring: null, absenceConfirmations: 0 });
    await expect(requireSubscriptionAccess(database, 'app-a', 'shop-a')).resolves.toBeNull();
  });
  it('hands access to a verified continuous next period without bridging a gap or extending its end', async () => {
    const end = Date.parse('2026-12-23T09:00:00Z');
    const repository = new D1SubscriptionRepository(database);
    const entitlement = await repository.writeEntitlement({ appKey: 'app-a', handle: 'shop-a', state: 'active', featureKeys: ['quantity_breaks_access'], activeSubscriptionId: 'current', activeSpuKey: 'ultra', validFrom: end - 30_000, validUntil: end, nextValidFrom: end, nextValidUntil: end + 30_000, graceUntil: null, autoRecurring: false, absenceConfirmations: 0 });
    expect(hasSubscriptionAccess(entitlement, end)).toBe(true);
    expect(hasSubscriptionAccess(entitlement, end + 1)).toBe(true);
    expect(hasSubscriptionAccess(entitlement, end + 30_001)).toBe(false);
    expect(hasSubscriptionAccess({ ...entitlement, nextValidFrom: end + 100 }, end + 101)).toBe(false);
    expect(hasSubscriptionAccess({ ...entitlement, nextValidUntil: null }, end + 1)).toBe(false);
    expect(hasSubscriptionAccess({ ...entitlement, state: 'inactive' }, end + 1)).toBe(false);
    expect(hasSubscriptionAccess({ ...entitlement, featureKeys: [] }, end + 1)).toBe(false);
  });

});
