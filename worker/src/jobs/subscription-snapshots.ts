import type { Env } from '../env';
import { D1SubscriptionRepository } from '../db/subscriptions';
import { PartnerSubscriptionClient, type SubscriptionRecord } from '../services/subscriptions';

// Display-only refresh. It must never reconcile entitlements or enqueue campaign operations.
export async function refreshSubscriptionSnapshots(env: Env, now = env.now?.() ?? Date.now()): Promise<{ refreshed: number; failed: number }> {
  if (!env.SHOPLINE_PARTNER_ACCESS_TOKEN) return { refreshed: 0, failed: 0 };
  const repository = new D1SubscriptionRepository(env.DB, () => now);
  const handles = await repository.subscriptionSnapshotShops(env.SHOPLINE_APP_KEY, now, 10);
  let next = 0, refreshed = 0, failed = 0;
  const run = async () => {
    while (next < handles.length) {
      const handle = handles[next++];
      try {
        await repository.recordSubscriptionSnapshotAttempt(env.SHOPLINE_APP_KEY, handle);
        // Bound the whole paginated read, rather than giving every page a new timeout.
        const signal = AbortSignal.timeout(8_000);
        const client = new PartnerSubscriptionClient(env.SHOPLINE_PARTNER_ACCESS_TOKEN, (input, init) => fetch(input, { ...init, signal }));
        const subscriptions: SubscriptionRecord[] = [];
        for (let pageNum = 1; pageNum <= 100; pageNum++) {
          const page = await client.listSubscriptions({ appKey: env.SHOPLINE_APP_KEY, handle, pageNum, pageSize: 100 });
          subscriptions.push(...page.subscriptions);
          if (page.lastPage) break;
          if (pageNum === 100) throw new Error('SUBSCRIPTION_PAGINATION_INCOMPLETE');
        }
        await repository.writeSubscriptionSnapshot(env.SHOPLINE_APP_KEY, handle, subscriptions);
        refreshed++;
      } catch { failed++; }
    }
  };
  await Promise.all([run(), run()]);
  return { refreshed, failed };
}
