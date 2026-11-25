import type { Env } from '../env';
import { D1SubscriptionRepository } from '../db/subscriptions';
import { EntitlementService } from '../services/entitlements';
import { PartnerSubscriptionClient } from '../services/subscriptions';
import { processSubscriptionOperations } from './subscription-operations';

export async function reconcileSubscriptionsDaily(env: Env, now = env.now?.() ?? Date.now()): Promise<{ shops: number; failed: number }> {
  const repository = new D1SubscriptionRepository(env.DB);
  const entitlements = await repository.listEntitlementsByStates(env.SHOPLINE_APP_KEY, ['active', 'grace', 'review_pending']);
  const pendingShops = await repository.pendingOperationShops(env.SHOPLINE_APP_KEY);
  const handles = [...new Set([...entitlements.map((item) => item.handle), ...pendingShops])];
  let failed = 0;
  for (const handle of handles) {
    try {
      await new EntitlementService(repository, new PartnerSubscriptionClient(env.SHOPLINE_PARTNER_ACCESS_TOKEN), () => now)
        .reconcileEntitlement({ appKey: env.SHOPLINE_APP_KEY, handle, sourceEventId: `cron:${now}` });
    } catch {
      failed += 1;
    }
  }
  try { await processSubscriptionOperations(env, now); }
  catch { failed += 1; }
  return { shops: handles.length, failed };
}
