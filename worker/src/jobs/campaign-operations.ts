import { campaignRepository } from '../services/offer-index';
import { D1CampaignOperationRepository, type CampaignOperation } from '../db/campaign-operations';
import { CampaignConflictError } from '../db/campaigns';
import type { CampaignDraft } from '../domain/campaign';
import type { Env } from '../env';
import { D1SessionStore } from '../db/sessions';
import { fetchShopCurrency } from '../services/collection-publication';
import { createAutomaticDiscount, deleteAutomaticDiscount, DiscountRejectedError, DiscountUncertainError } from '../services/discounts';
import { refreshScopeHandleSnapshots } from '../services/scope-handle-snapshots';

const MAX_OPERATIONS = 20;

function retryDelay(error: unknown, attempts: number): number {
  const retryAfter = error instanceof DiscountUncertainError ? error.metadata.retryAfterMs ?? 0 : 0;
  return Math.max(retryAfter, Math.min(60 * 60 * 1000, 5_000 * (2 ** Math.max(0, attempts - 1))));
}

function candidateFromOperation(operation: CampaignOperation, current: CampaignDraft): CampaignDraft {
  const candidate = operation.candidate;
  if (!candidate) return { ...current, status: 'paused', endsAt: undefined, neverExpires: true };
  return candidate as unknown as CampaignDraft;
}

function expiredDiscountCleanup(operation: CampaignOperation): { discountId: string; nodeId: string | null } | null {
  const candidate = operation.candidate;
  const discountId = candidate?.expiredDiscountId;
  if (typeof discountId !== 'string' || !discountId.trim()) return null;
  const nodeId = typeof candidate?.expiredNodeId === 'string' && candidate.expiredNodeId.trim()
    ? candidate.expiredNodeId
    : null;
  return { discountId, nodeId };
}

async function deleteOperation(operation: CampaignOperation, env: Env, session: NonNullable<Awaited<ReturnType<D1SessionStore['get']>>>): Promise<'requires_pause' | 'succeeded'> {
  const expired = expiredDiscountCleanup(operation);
  if (expired) {
    await deleteAutomaticDiscount(session, expired.discountId, env, expired.nodeId);
    return 'succeeded';
  }
  const campaigns = campaignRepository(env);
  const current = await campaigns.get(operation.handle, operation.campaignId);
  if (!current) return 'succeeded';
  if (current.revision !== operation.expectedRevision) throw new CampaignConflictError('Campaign revision has changed.');
  const publication = await campaigns.getPublication(operation.handle, operation.campaignId);
  const now = env.now?.() ?? Date.now();
  const currentlyEffective = current.status === 'active' && (!current.startsAt || Date.parse(current.startsAt) <= now);
  if (currentlyEffective && publication.discountId) return 'requires_pause';
  let revision = current.revision;
  if (publication.discountId) {
    const lease = await campaigns.beginPlatformDeletion(operation.handle, operation.campaignId, revision);
    try {
      await deleteAutomaticDiscount(session, publication.discountId, env, publication.nodeId);
      const paused = await campaigns.finishPlatformDeletion(operation.handle, operation.campaignId, revision, lease.owner);
      revision = paused.revision;
    } catch (error) {
      await campaigns.markPlatformDeletionFailure(operation.handle, operation.campaignId, !(error instanceof DiscountRejectedError), lease.owner);
      throw error;
    }
  }
  await campaigns.delete(operation.handle, operation.campaignId, revision);
  return 'succeeded';
}

async function replaceOperation(operation: CampaignOperation, env: Env, session: NonNullable<Awaited<ReturnType<D1SessionStore['get']>>>): Promise<void> {
  const campaigns = campaignRepository(env);
  const current = await campaigns.get(operation.handle, operation.campaignId);
  if (!current) throw new CampaignConflictError('Campaign not found.');
  if (current.revision !== operation.expectedRevision) throw new CampaignConflictError('Campaign revision has changed.');
  const candidate = candidateFromOperation(operation, current);
  const scope = await refreshScopeHandleSnapshots(session, candidate.scope);
  const publication = await campaigns.getPublication(operation.handle, operation.campaignId);
  let revision = current.revision;
  if (publication.discountId) {
    const lease = await campaigns.beginPlatformDeletion(operation.handle, operation.campaignId, revision);
    try {
      await deleteAutomaticDiscount(session, publication.discountId, env, publication.nodeId);
      const removed = await campaigns.finishPlatformDeletion(operation.handle, operation.campaignId, revision, lease.owner);
      revision = removed.revision;
    } catch (error) {
      await campaigns.markPlatformDeletionFailure(operation.handle, operation.campaignId, !(error instanceof DiscountRejectedError), lease.owner);
      throw error;
    }
  }
  const saved = await campaigns.save(operation.handle, { ...candidate, id: current.id, status: 'paused', scope }, revision);
  const currency = await fetchShopCurrency(session);
  const lease = await campaigns.beginPublication(operation.handle, current.id, saved.revision, 'publish');
  try {
    const published = await createAutomaticDiscount(session, { ...lease.campaign, status: 'active', startsAt: new Date(env.now?.() ?? Date.now()).toISOString(), endsAt: undefined, neverExpires: true }, env, currency);
    await campaigns.finishPublication(operation.handle, current.id, saved.revision, 'publish', published.discountId, lease.owner, published.nodeId);
  } catch (error) {
    await campaigns.markPublicationFailure(operation.handle, current.id, !(error instanceof DiscountRejectedError), 'publish', lease.owner);
    throw error;
  }
}

export async function processCampaignOperations(env: Env, now = env.now?.() ?? Date.now()): Promise<{ processed: number; failed: number }> {
  const operations = new D1CampaignOperationRepository(env.DB, () => env.now?.() ?? Date.now());
  const claimed = await operations.claimDue(now, MAX_OPERATIONS);
  let failed = 0;
  for (const operation of claimed) {
    try {
      const session = await new D1SessionStore(env.DB, env.TOKEN_ENCRYPTION_KEY).get(operation.handle);
      if (!session) throw new Error('SHOPLINE session is unavailable.');
      if (operation.type === 'delete') {
        const outcome = await deleteOperation(operation, env, session);
        if (outcome === 'requires_pause') {
          await operations.requirePause(operation.id);
          continue;
        }
      } else {
        await replaceOperation(operation, env, session);
      }
      await operations.finish(operation.id);
    } catch (error) {
      failed += 1;
      const deterministic = error instanceof DiscountRejectedError || error instanceof CampaignConflictError;
      await operations.retry(operation.id, now + retryDelay(error, operation.attempts), error instanceof Error ? error.message : 'Campaign operation failed.', deterministic);
    }
  }
  return { processed: claimed.length, failed };
}
