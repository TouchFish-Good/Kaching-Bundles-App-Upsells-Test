import type { Env } from '../env';
import { D1SubscriptionRepository, type SubscriptionOperation } from '../db/subscriptions';
import { D1SessionStore } from '../db/sessions';
import { D1CampaignRepository } from '../db/campaigns';
import { EntitlementService } from '../services/entitlements';
import { PartnerSubscriptionClient } from '../services/subscriptions';
import { hasSubscriptionAccess } from '../domain/entitlement-access';
import { deleteAutomaticDiscount, DiscountUncertainError } from '../services/discounts';

const MAX_OPERATIONS = 50;

export type ImmediateReconcileContext = {
  operationKey: string;
  handle: string;
  subscriptionId?: string | null;
  paymentPending?: boolean;
  sourceEventId?: string;
};

function backoff(attempts: number): number {
  return Math.min(60 * 60 * 1000, 30 * 1000 * (2 ** Math.max(0, attempts - 1)));
}

function retryDelay(error: unknown, attempts: number): number {
  const retryAfterMs = error instanceof DiscountUncertainError ? error.metadata.retryAfterMs : undefined;
  return Math.max(backoff(attempts), retryAfterMs ?? 0);
}
async function pauseCampaign(operation: SubscriptionOperation, env: Env, session: Awaited<ReturnType<D1SessionStore['get']>>, repository: D1SubscriptionRepository, entitlementVersion: number): Promise<void> {
  if (!session) throw new Error('SHOPLINE session is unavailable.');
  const clock = () => env.now?.() ?? Date.now();
  const campaigns = new D1CampaignRepository(env.DB, clock);
  const owner = await campaigns.acquireShopLock(operation.handle);
  try {
    const campaign = await campaigns.get(operation.handle, operation.campaignId ?? '');
    if (!campaign) return;
    const publication = await campaigns.getPublication(operation.handle, campaign.id);
    if (!publication.discountId || ['entitlement_revoked', 'missing', 'removed'].includes(publication.state)) return;
    const assertCurrent = async () => {
      await repository.assertEntitlementLease(operation.appKey, operation.handle);
      const entitlement = await repository.readEntitlement(operation.appKey, operation.handle);
      const lock = await env.DB.prepare('SELECT 1 AS held FROM quantity_breaks_shop_locks WHERE shop_handle = ? AND owner = ? AND expires_at > ?')
        .bind(operation.handle, owner, clock()).first();
      const latest = await campaigns.getPublication(operation.handle, campaign.id);
      if (!lock || !await repository.isOperationRunning(operation) || entitlement?.version !== entitlementVersion
        || hasSubscriptionAccess(entitlement, clock()) || latest.discountId !== publication.discountId) {
        throw new Error('Subscription invalidation was superseded.');
      }
    };
    // The platform read inside deleteAutomaticDiscount can take time. Recheck immediately before DELETE.
    await deleteAutomaticDiscount(session, publication.discountId, env, publication.nodeId, assertCurrent);
    await assertCurrent();
    await campaigns.pauseForSubscriptionExpiration(operation.handle, campaign.id);
  } finally { await campaigns.releaseShopLock(operation.handle, owner); }
}

async function invalidateCampaign(operation: SubscriptionOperation, env: Env, repository: D1SubscriptionRepository): Promise<void> {
  const clock = () => env.now?.() ?? Date.now();
  await repository.withEntitlementLock(operation.appKey, operation.handle, async (locked) => {
    const currentOperation = await locked.readRunningOperation(operation);
    const entitlement = await locked.readEntitlement(operation.appKey, operation.handle);
    if (!currentOperation || hasSubscriptionAccess(entitlement, clock()) || !entitlement
      || entitlement.version !== currentOperation.entitlementVersion) return;
    const verified = await new EntitlementService(locked, new PartnerSubscriptionClient(env.SHOPLINE_PARTNER_ACCESS_TOKEN), clock)
      .reconcileEntitlement({ appKey: operation.appKey, handle: operation.handle, requireFresh: true, sourceEventId: operation.operationKey });
    if (hasSubscriptionAccess(verified, clock())) return;
    if (!verified || !['unknown', 'inactive'].includes(verified.state)) throw new Error('Subscription invalidation awaits confirmation.');
    if (verified.version !== entitlement.version) {
      await locked.advanceInvalidationVersion(operation.appKey, operation.handle, entitlement.version, verified.version);
    }
    const session = await new D1SessionStore(env.DB, env.TOKEN_ENCRYPTION_KEY).get(operation.handle);
    await pauseCampaign({ ...currentOperation, entitlementVersion: verified.version }, env, session, locked, verified.version);
  });
}
export async function processSubscriptionOperations(env: Env, now = env.now?.() ?? Date.now(), immediate?: ImmediateReconcileContext): Promise<{ processed: number; failed: number }> {
  const repository = new D1SubscriptionRepository(env.DB, () => env.now?.() ?? Date.now());
  const operations = await repository.claimDueOperations(now, MAX_OPERATIONS);
  let failed = 0;
  for (const operation of operations) {
    try {
      if (operation.kind === 'reconcile') {
        const session = await new D1SessionStore(env.DB, env.TOKEN_ENCRYPTION_KEY).get(operation.handle);
        if (!session) throw new Error('SHOPLINE session is unavailable.');
        const isImmediate = immediate?.operationKey === operation.operationKey && immediate.handle === operation.handle;
        await new EntitlementService(repository, new PartnerSubscriptionClient(env.SHOPLINE_PARTNER_ACCESS_TOKEN), () => env.now?.() ?? Date.now())
          .reconcileEntitlement({
            appKey: operation.appKey,
            handle: operation.handle,
            subscriptionId: isImmediate ? immediate.subscriptionId : undefined,
            paymentPending: isImmediate ? immediate.paymentPending : undefined,
            sourceEventId: isImmediate ? immediate.sourceEventId ?? operation.operationKey : operation.operationKey,
          });
      } else if (operation.kind === 'pause_campaign') {
        await invalidateCampaign(operation, env, repository);
      }
      await repository.finishOperation(operation.operationKey, operation.attempts);
    } catch (error) {
      failed += 1;
      await repository.retryOperation(operation.operationKey, now + retryDelay(error, operation.attempts), error instanceof Error ? error.message : 'Subscription operation failed.', operation.attempts);
    }
  }
  return { processed: operations.length, failed };
}
