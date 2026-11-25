import { campaignRepository } from '../services/offer-index';
import type { Context, Hono } from 'hono';
import { campaignForActivation, campaignsConflict, type Campaign, type CampaignDraft } from '../domain/campaign';
import { CampaignConflictError, CampaignValidationError, D1CampaignRepository, type CampaignPublicationProjection } from '../db/campaigns';
import { D1CampaignDiagnostics } from '../db/campaign-diagnostics';
import { D1CampaignOperationRepository } from '../db/campaign-operations';
import { requireShoplineSession, type AuthContext } from '../auth/session';
import type { Env } from '../env';
import { createAutomaticDiscount, deleteAutomaticDiscount, DiscountCreationPendingError, DiscountRejectedError, DiscountUncertainError, listAutomaticDiscountStates, pauseAutomaticDiscount, readAutomaticDiscountState, updateAutomaticDiscount, updateAutomaticDiscountSchedule, type AutomaticDiscountState } from '../services/discounts';
import { assertPublishedCollectionScopeUnchanged, fetchCollectionTitles, fetchShopCurrency, fetchStoreId, resolveCollectionMembers, writeCollectionVariables } from '../services/collection-publication';
import { getCampaignProducts } from '../services/shopline-admin';
import { refreshScopeHandleSnapshots } from '../services/scope-handle-snapshots';
import { requireSubscriptionAccess } from './subscription-access';
import { processCampaignOperations } from '../jobs/campaign-operations';

type Variables = { auth: AuthContext };
type App = Hono<{ Bindings: Env; Variables: Variables }>;
type BackgroundExecution = { waitUntil(promise: Promise<unknown>): void };

function errorResponse(error: unknown): Response {
  const message = error instanceof Error ? error.message : 'Campaign request failed.';
  const status = error instanceof SyntaxError || error instanceof CampaignValidationError ? 400 : error instanceof CampaignConflictError || error instanceof DiscountUncertainError ? 409 : error instanceof DiscountRejectedError ? 502 : 500;
  return Response.json({ error: message }, { status });
}

async function auth(c: Context<{ Bindings: Env; Variables: Variables }>): Promise<Response | AuthContext> {
  const result = await requireShoplineSession(c.req.raw, c.env);
  if (result instanceof Response) return result;
  c.set('auth', result);
  return result;
}

async function body(c: Context): Promise<Record<string, unknown>> {
  const parsed = await c.req.json<unknown>();
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new CampaignValidationError('JSON body is required.');
  return parsed as Record<string, unknown>;
}

async function requireWriteAccess(c: Context<{ Bindings: Env; Variables: Variables }>, session: AuthContext): Promise<Response | null> {
  return requireSubscriptionAccess(c.env.DB, c.env.SHOPLINE_APP_KEY, session.handle);
}

type PlatformStatus = 'active' | 'paused' | 'missing' | 'unverified';

async function recordCampaignReadDiagnostic(env: Env, session: AuthContext, campaignId: string, error: unknown): Promise<void> {
  const metadata = error instanceof DiscountRejectedError || error instanceof DiscountUncertainError
    ? error.metadata
    : { upstreamStatus: 0, upstreamRequestId: null };
  const errorCode = error instanceof DiscountUncertainError
    ? error.diagnosticCode ?? 'UPSTREAM_OUTCOME_UNCERTAIN'
    : error instanceof DiscountRejectedError ? 'UPSTREAM_REJECTED' : 'WORKER_RECONCILIATION_ERROR';
  try {
    await new D1CampaignDiagnostics(env.DB, () => env.now?.() ?? Date.now()).record({
      traceId: crypto.randomUUID(), workerName: 'shopline-quantity-breaks', shopHandle: session.handle, campaignId,
      eventType: 'campaign_read', outcome: 'uncertain', upstreamService: 'SHOPLINE',
      upstreamPath: metadata.upstreamPath ?? '/admin/openapi/v20261201/sales/discount_app.json', upstreamStatus: metadata.upstreamStatus || undefined,
      upstreamRequestId: metadata.upstreamRequestId ?? undefined, upstreamResponseCode: metadata.upstreamResponseCode,
      upstreamResponseMessage: metadata.upstreamResponseMessage, upstreamResponseBody: metadata.upstreamResponseBody, errorCode,
    });
  } catch { /* Observability must not change a merchant-facing list response. */ }
}

async function recordCampaignOperationDiagnostic(
  env: Env,
  session: AuthContext,
  campaignId: string,
  operation: 'create' | 'pause' | 'resume' | 'update' | 'delete',
  discountId: string | null,
  error: unknown,
): Promise<void> {
  if (!(error instanceof DiscountRejectedError) && !(error instanceof DiscountUncertainError)) return;
  const metadata = error.metadata;
  const outcome = error instanceof DiscountRejectedError ? 'failure' : 'uncertain';
  const errorCode = error instanceof DiscountUncertainError && error.diagnosticCode
    ? error.diagnosticCode
    : `${operation.toUpperCase()}_${outcome === 'failure' ? 'REJECTED' : 'OUTCOME_UNCERTAIN'}`;
  const endpoint = metadata.upstreamPath ?? (discountId
    ? `/admin/openapi/v20260901/sales/discount_automatic_app/${encodeURIComponent(discountId)}.json`
    : '/admin/openapi/v20260901/sales/discount_automatic_app.json');
  try {
    await new D1CampaignDiagnostics(env.DB, () => env.now?.() ?? Date.now()).record({
      traceId: crypto.randomUUID(), workerName: 'shopline-quantity-breaks', shopHandle: session.handle, campaignId,
      eventType: 'shopline_api', outcome, upstreamService: 'SHOPLINE', upstreamPath: endpoint,
      upstreamStatus: metadata.upstreamStatus || undefined, upstreamRequestId: metadata.upstreamRequestId ?? undefined,
      upstreamResponseCode: metadata.upstreamResponseCode, upstreamResponseMessage: metadata.upstreamResponseMessage, upstreamResponseBody: metadata.upstreamResponseBody, errorCode,
    });
  } catch { /* Observability must not change a merchant-facing publication response. */ }
}

export async function reconcileCampaign(repository: D1CampaignRepository, session: AuthContext, env: Env, campaignId: string, knownState?: AutomaticDiscountState, knownStates?: Map<string, AutomaticDiscountState>): Promise<PlatformStatus | null> {
  let publication = await repository.getPublication(session.handle, campaignId);
  if (await repository.prepareParallelReplacementReconciliation(session.handle, campaignId, publication)) {
    return publication.stateReason === 'parallel_replacement_old' ? 'paused' : 'unverified';
  }
  if (publication.owner && publication.stateReason?.startsWith('parallel_replacement_')) publication = await repository.getPublication(session.handle, campaignId);
  if (!publication.discountId) {
    if (publication.state !== 'needs_reconciliation') return null;
    try {
      const matches = [...(knownStates ?? await listAutomaticDiscountStates(session, env)).values()].filter((state): state is AutomaticDiscountState & { discountId: string; state: 'active' | 'paused' } =>
        state.campaignId === campaignId && Boolean(state.discountId) && (state.state === 'active' || state.state === 'paused'));
      if (matches.length > 1) return 'unverified';
      const match = matches[0];
      await repository.reconcileUnlinkedPublication(session.handle, campaignId, match
        ? { discountId: match.discountId!, nodeId: match.nodeId, state: match.state, endsAt: match.endsAt }
        : null);
      return match?.state ?? null;
    } catch (error) {
      await recordCampaignReadDiagnostic(env, session, campaignId, error);
      return 'unverified';
    }
  }
  try {
    const state = knownState ?? await readAutomaticDiscountState(session, publication.discountId, env, publication.nodeId);
    if (state.state === 'missing' && publication.stateReason === 'creation_confirmation_pending') return 'unverified';
    await repository.reconcilePlatformState(session.handle, campaignId, state.state, state.nodeId, state.endsAt);
    return state.state;
  } catch (error) {
    await recordCampaignReadDiagnostic(env, session, campaignId, error);
    return 'unverified';
  }
}

async function reconcileCampaignList(repository: D1CampaignRepository, session: AuthContext, env: Env, projections: CampaignPublicationProjection[]): Promise<Map<string, PlatformStatus>> {
  const relevant = projections.filter((item) => Boolean(item.publication.discountId)
    || item.publication.state === 'needs_reconciliation' || item.publication.stateReason === 'parallel_replacement_new');
  const results = new Map<string, PlatformStatus>();
  if (!relevant.length) return results;
  try {
    const states = await listAutomaticDiscountStates(session, env);
    const direct: Array<{ campaignId: string; state: 'active' | 'paused' | 'missing'; nodeId: string | null; endsAt?: string }> = [];
    for (const { campaign, publication } of relevant) {
      if (await repository.prepareParallelReplacementReconciliation(session.handle, campaign.id, publication)) {
        results.set(campaign.id, publication.stateReason === 'parallel_replacement_old' ? 'paused' : 'unverified');
        continue;
      }
      if (!publication.discountId) {
        const state = await reconcileCampaign(repository, session, env, campaign.id, undefined, states);
        if (state) results.set(campaign.id, state);
        continue;
      }
      const state = states.get(publication.discountId) ?? { state: 'missing' as const, discountId: null, nodeId: null, metadata: { upstreamStatus: 200, upstreamRequestId: null } };
      if (state.state === 'missing' && publication.stateReason === 'creation_confirmation_pending') {
        results.set(campaign.id, 'unverified');
        continue;
      }
      direct.push({ campaignId: campaign.id, state: state.state, nodeId: state.nodeId, endsAt: state.endsAt });
      results.set(campaign.id, state.state);
    }
    await repository.reconcilePlatformStates(session.handle, direct);
  } catch (error) {
    for (const { campaign } of relevant) {
      await recordCampaignReadDiagnostic(env, session, campaign.id, error);
      results.set(campaign.id, 'unverified');
    }
  }
  return results;
}

export function campaignResponse(projection: CampaignPublicationProjection, platformStatus?: PlatformStatus) {
  const { campaign, publication, collectionConflict } = projection;
  platformStatus ??= ['publishing', 'needs_reconciliation'].includes(publication.state) ? 'unverified' : undefined;
  return {
    ...campaign,
    ...(collectionConflict ? { collectionConflict } : {}),
    ...(publication.discountId ? { platformDiscountId: publication.discountId } : {}),
    ...(platformStatus ? { platformStatus } : {}),
    platformOperationState: publication.state,
    platformState: publication.state,
  };
}

type RequestedStatus = 'active' | 'paused';
type CoverageConflict = {
  campaignId: string;
  campaignName: string;
  conflictingCampaignId: string;
  conflictingCampaignName: string;
  overlap: { type: 'products' | 'collections'; ids: string[]; names: string[] };
};
type BatchResult = { id: string; outcome: 'activated' | 'activation_pending' | 'already_active' | 'paused' | 'pausing' | 'already_paused' | 'conflict' | 'unverified' | 'failed'; campaign?: unknown; message?: string; conflict?: CoverageConflict };

function overlappingIds(left: string[] | undefined, right: string[] | undefined): string[] {
  const rightIds = new Set(right ?? []);
  return [...new Set(left ?? [])].filter((id) => rightIds.has(id)).sort();
}

function overlappingProductIds(left: CampaignDraft['scope'], right: CampaignDraft['scope']): string[] {
  return overlappingIds(left.productIds, right.productIds)
    .filter((id) => !left.excludedProductIds.includes(id) && !right.excludedProductIds.includes(id));
}

type CoverageDetail = {
  campaignId: string;
  campaignName: string;
  itemId: string;
  itemName: string;
  type: 'products' | 'collections';
};

function coverageCandidate(value: unknown): CampaignDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CampaignValidationError('Campaign coverage input is required.');
  const candidate = value as Record<string, unknown>;
  const scope = candidate.scope;
  if (!scope || typeof scope !== 'object' || Array.isArray(scope)) throw new CampaignValidationError('Campaign scope is required.');
  const rawScope = scope as Record<string, unknown>;
  const ids = (key: 'productIds' | 'collectionIds' | 'excludedProductIds', required = false): string[] => {
    const values = rawScope[key];
    if (values === undefined && !required) return [];
    if (!Array.isArray(values) || values.some((id) => typeof id !== 'string' || !id.trim()) || (required && !values.length)) throw new CampaignValidationError(`${key} must contain valid IDs.`);
    return [...new Set(values)];
  };
  const kind = rawScope.kind;
  if (kind !== 'products' && kind !== 'collections') throw new CampaignValidationError('Coverage checks require products or collections.');
  const startsAt = candidate.startsAt;
  const endsAt = candidate.endsAt;
  if (startsAt !== undefined && (typeof startsAt !== 'string' || Number.isNaN(Date.parse(startsAt)))) throw new CampaignValidationError('startsAt is invalid.');
  if (endsAt !== undefined && (typeof endsAt !== 'string' || Number.isNaN(Date.parse(endsAt)))) throw new CampaignValidationError('endsAt is invalid.');
  return {
    id: typeof candidate.id === 'string' ? candidate.id : '', name: '', status: 'active', startsAt: startsAt as string | undefined, endsAt: endsAt as string | undefined,
    neverExpires: candidate.neverExpires === true,
    scope: kind === 'products'
      ? { kind, productIds: ids('productIds', true), excludedProductIds: ids('excludedProductIds') }
      : { kind, collectionIds: ids('collectionIds', true), excludedProductIds: ids('excludedProductIds') },
    tiers: [], combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
  };
}

async function describeCoverageDetails(repository: D1CampaignRepository, session: AuthContext, candidate: CampaignDraft): Promise<CoverageDetail[]> {
  const details: CoverageDetail[] = [];
  for (const other of await repository.list(session.handle)) {
    if (other.id === candidate.id || !campaignsConflict(candidate, other)) continue;
    if ((await repository.getPublication(session.handle, other.id)).state !== 'active') continue;
    const collectionConflict = candidate.scope.kind === 'collections' && other.scope.kind === 'collections';
    const ids = collectionConflict
      ? overlappingIds(candidate.scope.collectionIds, other.scope.collectionIds)
      : overlappingProductIds(candidate.scope, other.scope);
    if (!ids.length) continue;
    let names = new Map(ids.map((id) => [id, id]));
    try {
      if (collectionConflict) names = new Map(Object.entries(await fetchCollectionTitles(session, ids)));
      else names = new Map((await getCampaignProducts(session, ids)).products.map((product) => [product.id, product.title]));
    } catch { /* IDs remain a usable fallback when a title lookup is unavailable. */ }
    const type: CoverageDetail['type'] = collectionConflict ? 'collections' : 'products';
    details.push(...ids.map((itemId) => ({ campaignId: other.id, campaignName: other.name, itemId, itemName: names.get(itemId) ?? itemId, type })));
  }
  return details;
}

async function describeCoverageConflict(repository: D1CampaignRepository, session: AuthContext, campaign: Campaign): Promise<CoverageConflict | null> {
  const candidate: CampaignDraft = { ...campaign, status: 'active' };
  for (const other of await repository.list(session.handle)) {
    if (other.id === campaign.id) continue;
    const publication = await repository.getPublication(session.handle, other.id);
    const awaitingCreation = publication.state === 'needs_reconciliation' && publication.stateReason === 'creation_confirmation_pending';
    // An accepted first publication is still stored as a draft until confirmed.
    // Reserve the same scope and schedule sent to SHOPLINE while it is pending.
    const enabled = awaitingCreation ? { ...other, status: 'active' as const, endsAt: undefined, neverExpires: true } : other;
    if (!campaignsConflict(candidate, enabled) || (publication.state !== 'active' && !awaitingCreation)) continue;
    const collectionConflict = candidate.scope.kind === 'collections' && other.scope.kind === 'collections';
    const ids = collectionConflict
      ? overlappingIds(candidate.scope.collectionIds, other.scope.collectionIds)
      : overlappingProductIds(candidate.scope, other.scope);
    if (!ids.length) continue;
    let names = ids;
    try {
      if (collectionConflict) {
        const titles = await fetchCollectionTitles(session, ids);
        names = ids.map((id) => titles[id] ?? id);
      } else {
        const products = await getCampaignProducts(session, ids);
        const titles = new Map(products.products.map((product) => [product.id, product.title]));
        names = ids.map((id) => titles.get(id) ?? id);
      }
    } catch { /* IDs still identify the overlap when SHOPLINE cannot resolve a display name. */ }
    return {
      campaignId: campaign.id,
      campaignName: campaign.name,
      conflictingCampaignId: other.id,
      conflictingCampaignName: other.name,
      overlap: { type: collectionConflict ? 'collections' : 'products', ids, names },
    };
  }
  return null;
}

async function replaceExpiredCampaign(
  repository: D1CampaignRepository,
  session: AuthContext,
  env: Env,
  candidate: CampaignDraft,
  expectedRevision: number,
): Promise<{ campaign: Campaign; pending: boolean }> {
  candidate = { ...candidate, scope: await refreshScopeHandleSnapshots(session, candidate.scope) };
  const now = env.now?.() ?? Date.now();
  if (candidate.neverExpires !== true && candidate.endsAt && Date.parse(candidate.endsAt) <= now) {
    throw new CampaignValidationError('当前结束时间早于当前时间');
  }
  const resolved = candidate.scope.kind === 'collections'
    ? await resolveCollectionMembers(session, candidate.scope.collectionIds || [])
    : [];
  if (candidate.scope.kind === 'collections' && !resolved.length) {
    throw new CampaignConflictError('Collection membership verification found no current products.');
  }
  const lease = await repository.beginExpiredReplacement(session.handle, candidate, expectedRevision, resolved, now);
  let currency: string;
  try {
    if (lease.campaign.scope.kind === 'collections') {
      const collectionIds = [...new Set([
        ...await repository.listRequiredCollectionIds(session.handle),
        ...(lease.campaign.scope.collectionIds || []),
      ])];
      await writeCollectionVariables(session, await fetchStoreId(session), collectionIds);
    }
    currency = await fetchShopCurrency(session);
  } catch (error) {
    await repository.settleExpiredReplacement(session.handle, candidate.id, expectedRevision, lease.owner, { deleted: false, uncertain: false });
    throw error;
  }
  // Both calls start now; neither waits for the other's success. Persist their
  // outcomes independently so an expired entity cannot hide a new active one.
  const [deletion, creation] = await Promise.allSettled([
    deleteAutomaticDiscount(session, lease.previousDiscountId, env, lease.previousNodeId),
    createAutomaticDiscount(session, lease.campaign, env, currency),
  ]);
  const published = await repository.settleExpiredReplacement(session.handle, candidate.id, expectedRevision, lease.owner, {
    deleted: deletion.status === 'fulfilled',
    created: creation.status === 'fulfilled' ? creation.value : undefined,
    pendingDiscountId: creation.status === 'rejected' && creation.reason instanceof DiscountCreationPendingError ? creation.reason.discountId : undefined,
    uncertain: creation.status === 'rejected' && !(creation.reason instanceof DiscountRejectedError),
  });
  if (deletion.status === 'rejected') await recordCampaignOperationDiagnostic(env, session, candidate.id, 'delete', lease.previousDiscountId, deletion.reason);
  if (creation.status === 'rejected') {
    await recordCampaignOperationDiagnostic(env, session, lease.campaign.id, 'create', null, creation.reason);
    if (creation.reason instanceof DiscountCreationPendingError) return { campaign: published, pending: true };
    throw creation.reason;
  }
  return { campaign: published, pending: false };
}

export async function changeCampaignStatus(repository: D1CampaignRepository, session: AuthContext, env: Env, id: string, requested: RequestedStatus, expectedRevision: number, reconciledStatuses?: ReadonlyMap<string, PlatformStatus>, executionCtx?: BackgroundExecution): Promise<BatchResult> {
  const beforeReconciliation = await repository.get(session.handle, id);
  if (!beforeReconciliation) return { id, outcome: 'failed', message: 'Campaign not found.' };
  const initialPublication = await repository.getPublication(session.handle, id);
  // Drafts intentionally have no platform discount ID, so they must never enter an ID-based state read.
  if (requested === 'paused' && !initialPublication.discountId) return { id, outcome: 'already_paused', campaign: beforeReconciliation };
  const platformStatus = initialPublication.discountId
    ? (reconciledStatuses ? reconciledStatuses.get(id) ?? null : await reconcileCampaign(repository, session, env, id))
    : null;
  if (platformStatus === 'unverified') return { id, outcome: 'unverified', message: 'SHOPLINE status is temporarily unavailable.' };
  if (requested === 'active') {
    // Reconcile possible conflicts serially so a manually paused platform discount cannot block this campaign.
    for (const item of await repository.list(session.handle)) {
      if (item.id === id) continue;
      const otherStatus = reconciledStatuses ? reconciledStatuses.get(item.id) ?? null : await reconcileCampaign(repository, session, env, item.id);
      if (otherStatus === 'unverified') return { id, outcome: 'unverified', message: `SHOPLINE status for ${item.name} is temporarily unavailable.` };
    }
  }
  let campaign = await repository.get(session.handle, id);
  if (!campaign) return { id, outcome: 'failed', message: 'Campaign not found.' };
  let publication = await repository.getPublication(session.handle, id);
  if (publication.state === 'needs_reconciliation') {
    const repaired = await reconcileCampaign(repository, session, env, id);
    if (repaired === 'unverified') return { id, outcome: 'unverified', message: 'SHOPLINE status is temporarily unavailable.' };
    publication = await repository.getPublication(session.handle, id);
    campaign = await repository.get(session.handle, id);
    if (!campaign) return { id, outcome: 'failed', message: 'Campaign not found.' };
  }
  if (requested === 'active') campaign = campaignForActivation(campaign);
  const now = env.now?.() ?? Date.now();
  // Match the list's schedule semantics: a published activity can retain an
  // internal active status while its actual start time is still in the future.
  const isScheduled = ['active', 'scheduled'].includes(campaign.status) && publication.state === 'active' && platformStatus === 'active' && Boolean(campaign.startsAt) && Date.parse(campaign.startsAt!) > now;
  if (requested === 'active' && isScheduled && publication.discountId) {
    const startsAt = new Date(now).toISOString();
    let lease: Awaited<ReturnType<D1CampaignRepository['beginUpdate']>> | null = null;
    try {
      lease = await repository.beginUpdate(session.handle, { ...campaign, startsAt, status: 'active' }, expectedRevision, publication.discountId, 'active');
      const currency = await fetchShopCurrency(session);
      await updateAutomaticDiscountSchedule(session, publication.discountId, lease.campaign, env, currency, { startsAt, endsAt: campaign.endsAt ?? null });
      return { id, outcome: 'activated', campaign: await repository.finishUpdate(session.handle, id, expectedRevision, publication.discountId, lease.owner) };
    } catch (error) {
      if (lease) await repository.markUpdateFailure(session.handle, id, !(error instanceof DiscountRejectedError), lease.owner);
      await recordCampaignOperationDiagnostic(env, session, id, 'resume', publication.discountId, error);
      return { id, outcome: error instanceof DiscountUncertainError ? 'unverified' : 'failed', message: error instanceof Error ? error.message : 'Campaign request failed.' };
    }
  }
  if (requested === 'paused' && isScheduled && publication.discountId) {
    const startsAt = new Date(now).toISOString();
    const endsAt = new Date(now + 10_000).toISOString();
    let lease: Awaited<ReturnType<D1CampaignRepository['beginUpdate']>> | null = null;
    try {
      lease = await repository.beginUpdate(session.handle, { ...campaign, startsAt, endsAt, neverExpires: false, status: 'scheduled' }, expectedRevision, publication.discountId, 'scheduled');
      const currency = await fetchShopCurrency(session);
      await updateAutomaticDiscountSchedule(session, publication.discountId, lease.campaign, env, currency, { startsAt, endsAt });
      const updated = await repository.finishUpdate(session.handle, id, expectedRevision, publication.discountId, lease.owner);
      const pauseLease = await repository.beginPublication(session.handle, id, updated.revision, 'pause');
      await repository.finishPausePending(session.handle, id, updated.revision, publication.discountId, pauseLease.owner, publication.nodeId);
      return { id, outcome: 'pausing', campaign: campaignResponse((await repository.getProjection(session.handle, id))!) };
    } catch (error) {
      if (lease) await repository.markUpdateFailure(session.handle, id, !(error instanceof DiscountRejectedError), lease.owner);
      await recordCampaignOperationDiagnostic(env, session, id, 'pause', publication.discountId, error);
      return { id, outcome: error instanceof DiscountUncertainError ? 'unverified' : 'failed', message: error instanceof Error ? error.message : 'Campaign request failed.' };
    }
  }
  if (requested === 'active' && publication.state === 'active') return { id, outcome: 'already_active', campaign };
  if (requested === 'paused' && (publication.state === 'paused' || !publication.discountId)) return { id, outcome: 'already_paused', campaign };
  let actionRevision = beforeReconciliation?.revision === expectedRevision && campaign.revision === expectedRevision + 1
    ? campaign.revision
    : expectedRevision;
  if (campaign.revision !== actionRevision) return { id, outcome: 'conflict', message: 'Campaign revision has changed. Refresh and retry.' };
  try {
    if (requested === 'active') {
      // Replace an expired activity with an independent record while deleting the old platform entity concurrently.
      if (platformStatus === 'paused' && publication.discountId) {
        if (env.SHOPLINE_QUANTITY_BREAKS_PUBLICATION_ENABLED === 'false') throw new CampaignConflictError('Campaign publication is disabled for this deployment.');
        const conflict = await describeCoverageConflict(repository, session, campaign);
        if (conflict) {
          const overlap = conflict.overlap.names.join(', ');
          return { id, outcome: 'conflict', conflict, message: `${conflict.campaignName} conflicts with ${conflict.conflictingCampaignName}: ${overlap}.` };
        }
        const startsAt = new Date(now).toISOString();
        const replacement = await replaceExpiredCampaign(repository, session, env, {
          ...campaign,
          status: 'active',
          startsAt,
          endsAt: undefined,
          neverExpires: true,
        }, actionRevision);
        return { id, outcome: replacement.pending ? 'activation_pending' : 'activated', campaign: replacement.pending
          ? campaignResponse((await repository.getProjection(session.handle, replacement.campaign.id))!, 'unverified') : replacement.campaign };
      }
      if (env.SHOPLINE_QUANTITY_BREAKS_PUBLICATION_ENABLED === 'false') throw new CampaignConflictError('Campaign publication is disabled for this deployment.');
      const conflict = await describeCoverageConflict(repository, session, campaign);
      if (conflict) {
        const overlap = conflict.overlap.names.join(', ');
        return { id, outcome: 'conflict', conflict, message: `${conflict.campaignName} conflicts with ${conflict.conflictingCampaignName}: ${overlap}.` };
      }
      const refreshedScope = await refreshScopeHandleSnapshots(session, campaign.scope);
      const currency = await fetchShopCurrency(session);
      const resolved = refreshedScope.kind === 'collections' ? await resolveCollectionMembers(session, refreshedScope.collectionIds || []) : [];
      if (refreshedScope.kind === 'collections' && !resolved.length) throw new CampaignConflictError('Collection membership verification found no current products.');
      const lease = await repository.beginPublication(session.handle, id, actionRevision, 'publish', resolved, refreshedScope);
      let platformRequestStarted = false;
      try {
        if (refreshedScope.kind === 'collections') await writeCollectionVariables(session, await fetchStoreId(session), await repository.listRequiredCollectionIds(session.handle));
        platformRequestStarted = true;
        const platformDiscount = await createAutomaticDiscount(session, { ...lease.campaign, status: 'active', scope: lease.campaign.scope }, env, currency);
        return { id, outcome: 'activated', campaign: await repository.finishPublication(session.handle, id, actionRevision, 'publish', platformDiscount.discountId, lease.owner, platformDiscount.nodeId) };
      } catch (error) {
        await recordCampaignOperationDiagnostic(env, session, id, 'create', null, error);
        await repository.markPublicationFailure(session.handle, id, platformRequestStarted && !(error instanceof DiscountRejectedError), 'publish', lease.owner, error instanceof DiscountCreationPendingError ? error.discountId : undefined);
        if (error instanceof DiscountCreationPendingError) return { id, outcome: 'activation_pending', campaign: campaignResponse((await repository.getProjection(session.handle, id))!, 'unverified') };
        throw error;
      }
    }
    if (!publication.discountId) return { id, outcome: 'already_paused', campaign };
    const lease = await repository.beginPublication(session.handle, id, actionRevision, 'pause');
    try {
      const currency = await fetchShopCurrency(session);
      const pause = await pauseAutomaticDiscount(session, publication.discountId, lease.campaign, env, currency);
      if (campaign.scope.kind === 'collections') await writeCollectionVariables(session, await fetchStoreId(session), await repository.listRequiredCollectionIds(session.handle, id));
      if (pause.state === 'pausing') {
        await repository.finishPausePending(session.handle, id, actionRevision, publication.discountId, lease.owner, publication.nodeId);
        // Keep the publication state in write responses too, so the UI can
        // retain Disabling until an authoritative read confirms the stop.
        return { id, outcome: 'pausing', campaign: campaignResponse((await repository.getProjection(session.handle, id))!) };
      }
      return { id, outcome: 'paused', campaign: await repository.finishPublication(session.handle, id, actionRevision, 'pause', publication.discountId, lease.owner, publication.nodeId) };
    } catch (error) {
      await recordCampaignOperationDiagnostic(env, session, id, 'pause', publication.discountId, error);
      await repository.markPublicationFailure(session.handle, id, !(error instanceof DiscountRejectedError), 'pause', lease.owner);
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Campaign request failed.';
    return { id, outcome: error instanceof DiscountUncertainError ? 'unverified' : error instanceof CampaignConflictError ? 'conflict' : 'failed', message };
  }
}

export function registerCampaignRoutes(app: App): void {
  app.get('/api/quantity-breaks/campaigns', async (c) => {
    const session = await auth(c);
    if (session instanceof Response) return session;
    const repository = campaignRepository(c.env);
    const projections = await repository.listProjections(session.handle);
    if (c.req.query('view') === 'configuration') {
      return c.json({ campaigns: projections.map((projection) => campaignResponse(projection,
        projection.publication.discountId ? 'unverified' : undefined)) });
    }
    const statuses = await reconcileCampaignList(repository, session, c.env, projections);
    const refreshed = await repository.listProjections(session.handle);
    return c.json({ campaigns: refreshed.map((projection) => campaignResponse(projection, statuses.get(projection.campaign.id))) });
  });

  app.get('/api/quantity-breaks/campaigns/:id', async (c) => {
    const session = await auth(c);
    if (session instanceof Response) return session;
    const repository = campaignRepository(c.env);
    const id = c.req.param('id');
    if (!await repository.getProjection(session.handle, id)) return c.json({ error: 'Campaign not found.' }, 404);
    const platformStatus = await reconcileCampaign(repository, session, c.env, id);
    const projection = await repository.getProjection(session.handle, id);
    return projection ? c.json({ campaign: campaignResponse(projection, platformStatus ?? undefined) }) : c.json({ error: 'Campaign not found.' }, 404);
  });

  app.get('/api/quantity-breaks/campaigns/by-platform-discount/:id', async (c) => {
    const session = await auth(c);
    if (session instanceof Response) return session;
    const platformDiscountId = c.req.param('id');
    const repository = campaignRepository(c.env);
    const projection = (await repository.listProjections(session.handle))
      .find((item) => item.publication.discountId === platformDiscountId);
    if (!projection) return c.json({ error: 'This discount is not managed by Quantity Breaks.' }, 404);
    const platformStatus = await reconcileCampaign(repository, session, c.env, projection.campaign.id);
    const refreshed = await repository.getProjection(session.handle, projection.campaign.id);
    return refreshed ? c.json({ campaign: campaignResponse(refreshed, platformStatus ?? undefined) }) : c.json({ error: 'Campaign not found.' }, 404);
  });

  app.post('/api/quantity-breaks/campaigns/coverage', async (c) => {
    const session = await auth(c);
    if (session instanceof Response) return session;
    try {
      const candidate = coverageCandidate((await body(c)).campaign);
      const conflicts = await describeCoverageDetails(campaignRepository(c.env), session, candidate);
      return c.json({ state: conflicts.length ? 'conflict' : 'clear', conflicts });
    } catch (error) { return errorResponse(error); }
  });

  const save = async (c: Context<{ Bindings: Env; Variables: Variables }>) => {
    const session = await auth(c);
    if (session instanceof Response) return session;
    const denied = await requireWriteAccess(c, session);
    if (denied) return denied;
    try {
      const input = await body(c);
      const campaign = input.campaign as CampaignDraft;
      const expectedRevision = input.expectedRevision;
      if (!campaign || !Number.isInteger(expectedRevision)) throw new CampaignValidationError('Campaign and expectedRevision are required.');
      if (campaign.status === 'active' || campaign.status === 'scheduled') return c.json({ error: 'Direct active writes are not allowed. Save as Draft or Paused, then publish using the status endpoint.' }, 409);
      const saved = await campaignRepository(c.env).save(session.handle, { ...campaign, scope: await refreshScopeHandleSnapshots(session, campaign.scope) }, expectedRevision as number);
      return c.json({ campaign: saved }, c.req.method === 'POST' ? 201 : 200);
    } catch (error) { return errorResponse(error); }
  };
  app.post('/api/quantity-breaks/campaigns', save);
  app.put('/api/quantity-breaks/campaigns/:id', async (c) => {
    const session = await auth(c);
    if (session instanceof Response) return session;
    const denied = await requireWriteAccess(c, session);
    if (denied) return denied;
    try {
      const input = await body(c);
      const campaign = input.campaign as CampaignDraft;
      if (campaign && campaign.id !== c.req.param('id')) return c.json({ error: 'Campaign ID does not match the route.' }, 400);
      if (!campaign || !Number.isInteger(input.expectedRevision)) throw new CampaignValidationError('Campaign and expectedRevision are required.');
      const expectedRevision = input.expectedRevision as number;
      const repository = campaignRepository(c.env);
      const beforeReconciliation = await repository.get(session.handle, campaign.id);
      if (!beforeReconciliation) return c.json({ error: 'Campaign not found.' }, 404);
      const initialPublication = await repository.getPublication(session.handle, campaign.id);
      const platformStatus = initialPublication.discountId
        ? await reconcileCampaign(repository, session, c.env, campaign.id)
        : null;
      if (platformStatus === 'unverified') throw new CampaignConflictError('SHOPLINE status is temporarily unavailable.');
      let current = await repository.get(session.handle, campaign.id);
      if (!current) return c.json({ error: 'Campaign not found.' }, 404);
      let actionRevision = beforeReconciliation.revision === expectedRevision && current.revision === expectedRevision + 1
        ? current.revision
        : expectedRevision;
      if (current.revision !== actionRevision) throw new CampaignConflictError('Campaign revision has changed. Refresh and retry.');
      let publication = await repository.getPublication(session.handle, campaign.id);
      if (platformStatus === 'paused' && current.status === 'paused' && publication.state === 'paused' && publication.discountId) {
        const updated = await replaceExpiredCampaign(repository, session, c.env, campaign, actionRevision);
        return c.json({ campaign: updated.pending
          ? campaignResponse((await repository.getProjection(session.handle, updated.campaign.id))!, 'unverified') : updated.campaign });
      }
      if (publication.discountId && (['active', 'scheduled'].includes(current.status) || publication.state === 'active')) {
        if (publication.state !== 'active' || !publication.discountId) throw new CampaignConflictError('Campaign publication needs reconciliation before editing.');
        if (current.scope.kind === 'collections') await assertPublishedCollectionScopeUnchanged(session, current);
        // Collection membership is server-owned; the editor sends only the selected IDs.
        const refreshedScope = await refreshScopeHandleSnapshots(session, campaign.scope);
        const resolved = refreshedScope.kind === 'collections' ? await resolveCollectionMembers(session, refreshedScope.collectionIds ?? []) : [];
        if (refreshedScope.kind === 'collections' && !resolved.length) throw new CampaignConflictError('Collection membership verification found no current products.');
        const candidate: CampaignDraft = { ...campaign, scope: refreshedScope.kind === 'collections' ? { ...refreshedScope, resolvedProductIds: resolved } : refreshedScope };
        const lease = await repository.beginUpdate(session.handle, candidate, actionRevision, publication.discountId);
        let platformRequestStarted = false;
        try {
          const currency = await fetchShopCurrency(session);
          const usesCollections = current.scope.kind === 'collections' || candidate.scope.kind === 'collections';
          const storeId = usesCollections ? await fetchStoreId(session) : null;
          const requiredIds = usesCollections ? await repository.listRequiredCollectionIds(session.handle, campaign.id) : [];
          const finalIds = [...new Set([...requiredIds, ...(candidate.scope.kind === 'collections' ? candidate.scope.collectionIds ?? [] : [])])].sort();
          const transitionIds = [...new Set([...finalIds, ...(current.scope.kind === 'collections' ? current.scope.collectionIds ?? [] : [])])].sort();
          // Keep old and new rules covered until SHOPLINE confirms the update.
          if (storeId) await writeCollectionVariables(session, storeId, transitionIds);
          platformRequestStarted = true;
          await updateAutomaticDiscount(session, lease.discountId, lease.campaign, c.env, currency);
          if (storeId && JSON.stringify(finalIds) !== JSON.stringify(transitionIds)) {
            try {
              await writeCollectionVariables(session, storeId, finalIds);
            } catch (error) {
              // A harmless superset must not turn a confirmed discount update into a failure.
              await recordCampaignOperationDiagnostic(c.env, session, campaign.id, 'update', lease.discountId, error);
            }
          }
          const updated = await repository.finishUpdate(session.handle, campaign.id, actionRevision, lease.discountId, lease.owner);
          return c.json({ campaign: updated });
        } catch (error) {
          await repository.markUpdateFailure(session.handle, campaign.id, platformRequestStarted && !(error instanceof DiscountRejectedError), lease.owner);
          throw error;
        }
      }
      if (campaign.status === 'active' || campaign.status === 'scheduled') return c.json({ error: 'Direct active writes are not allowed. Save as Draft or Paused, then publish using the status endpoint.' }, 409);
      const saved = await repository.save(session.handle, { ...campaign, scope: await refreshScopeHandleSnapshots(session, campaign.scope) }, actionRevision);
      return c.json({ campaign: saved });
    } catch (error) { return errorResponse(error); }
  });

  app.delete('/api/quantity-breaks/campaigns/:id', async (c) => {
    const session = await auth(c);
    if (session instanceof Response) return session;
    const denied = await requireWriteAccess(c, session);
    if (denied) return denied;
    try {
      const input = await body(c);
      if (!Number.isInteger(input.expectedRevision)) throw new CampaignValidationError('Campaign ID and expectedRevision are required.');
      const repository = campaignRepository(c.env);
      const before = await repository.get(session.handle, c.req.param('id'));
      if (!before) return c.json({ error: 'Campaign not found.' }, 404);
      const platformStatus = await reconcileCampaign(repository, session, c.env, before.id);
      if (platformStatus === 'unverified') throw new CampaignConflictError('SHOPLINE status is temporarily unavailable.');
      let reconciled = await repository.get(session.handle, before.id);
      if (!reconciled) return c.json({ error: 'Campaign not found.' }, 404);
      const requestedRevision = input.expectedRevision as number;
      let actionRevision = before.revision === requestedRevision && reconciled.revision === requestedRevision + 1
        ? reconciled.revision
        : requestedRevision;
      if (reconciled.revision !== actionRevision) throw new CampaignConflictError('Campaign revision has changed. Refresh and retry.');
      const publication = await repository.getPublication(session.handle, before.id);
      const startsAt = reconciled.startsAt ? Date.parse(reconciled.startsAt) : Number.NEGATIVE_INFINITY;
      const isCurrentlyEffective = platformStatus === 'active' && (!Number.isFinite(startsAt) || startsAt <= (c.env.now?.() ?? Date.now()));
      if (isCurrentlyEffective) throw new CampaignConflictError('Current campaign is active. Pause it before deleting.');
      if (publication.discountId) {
        const lease = await repository.beginPlatformDeletion(session.handle, before.id, actionRevision);
        try {
          await deleteAutomaticDiscount(session, publication.discountId, c.env, publication.nodeId);
          const cleared = await repository.finishPlatformDeletion(session.handle, before.id, actionRevision, lease.owner);
          reconciled = cleared;
          actionRevision = cleared.revision;
        } catch (error) {
          await repository.markPlatformDeletionFailure(session.handle, before.id, !(error instanceof DiscountRejectedError), lease.owner);
          throw error;
        }
      }
      const deleted = await repository.delete(session.handle, before.id, actionRevision);
      return deleted ? c.json({ deleted: true }) : c.json({ error: 'Campaign not found.' }, 404);
    } catch (error) { return errorResponse(error); }
  });

  app.post('/api/quantity-breaks/campaigns/:id/end', async (c) => {
    const session = await auth(c);
    if (session instanceof Response) return session;
    const denied = await requireWriteAccess(c, session);
    if (denied) return denied;
    try {
      const input = await body(c);
      const expectedRevision = input.expectedRevision;
      if (!Number.isInteger(expectedRevision)) throw new CampaignValidationError('Campaign ID and expectedRevision are required.');
      const repository = campaignRepository(c.env);
      const id = c.req.param('id');
      const before = await repository.get(session.handle, id);
      if (!before) throw new CampaignConflictError('Campaign not found.');
      if (before.status !== 'active') await reconcileCampaign(repository, session, c.env, id);
      const campaign = await repository.get(session.handle, id);
      if (!campaign) throw new CampaignConflictError('Campaign not found.');
      const actionRevision = before.revision === expectedRevision && campaign.revision === expectedRevision + 1
        ? campaign.revision
        : expectedRevision;
      if (campaign.status === 'active') {
        const publication = await repository.getPublication(session.handle, id);
        const lease = await repository.beginPlatformDeletion(session.handle, id, actionRevision as number);
        try {
          if (!publication.discountId) throw new CampaignConflictError('Campaign is not published.');
          await deleteAutomaticDiscount(session, publication.discountId, c.env, publication.nodeId);
          if (campaign.scope.kind === 'collections') {
            await writeCollectionVariables(session, await fetchStoreId(session), await repository.listRequiredCollectionIds(session.handle, id));
          }
          const paused = await repository.finishPlatformDeletion(session.handle, id, actionRevision as number, lease.owner);
          return c.json({ campaign: await repository.end(session.handle, id, paused.revision) });
        } catch (error) {
          await repository.markPlatformDeletionFailure(session.handle, id, !(error instanceof DiscountRejectedError), lease.owner);
          throw error;
        }
      }
      return c.json({ campaign: await repository.end(session.handle, id, actionRevision as number) });
    } catch (error) { return errorResponse(error); }
  });

  app.post('/api/quantity-breaks/campaigns/:id/status', async (c) => {
    const session = await auth(c);
    if (session instanceof Response) return session;
    const denied = await requireWriteAccess(c, session);
    if (denied) return denied;
    try {
      const input = await body(c);
      const status = input.status;
      const expectedRevision = input.expectedRevision;
      if (!Number.isInteger(expectedRevision) || (status !== 'active' && status !== 'paused')) throw new CampaignValidationError('Campaign ID, expectedRevision, and active or paused status are required.');
      const result = await changeCampaignStatus(campaignRepository(c.env), session, c.env, c.req.param('id'), status, expectedRevision as number, undefined, c.executionCtx);
      if (!result.campaign) return c.json({ error: result.message ?? 'Campaign status was not changed.' }, result.outcome === 'failed' ? 500 : 409);
      return c.json({ campaign: result.campaign });
    } catch (error) { return errorResponse(error); }
  });

  app.post('/api/quantity-breaks/campaigns/batch-status', async (c) => {
    const session = await auth(c);
    if (session instanceof Response) return session;
    const denied = await requireWriteAccess(c, session);
    if (denied) return denied;
    try {
      const input = await body(c);
      const status = input.status;
      const campaigns = input.campaigns;
      if ((status !== 'active' && status !== 'paused') || !Array.isArray(campaigns) || !campaigns.length || campaigns.length > 35) throw new CampaignValidationError('A status and 1 to 35 campaigns are required.');
      const repository = campaignRepository(c.env);
      const reconciledStatuses = await reconcileCampaignList(repository, session, c.env, await repository.listProjections(session.handle));
      const results: BatchResult[] = [];
      for (const item of campaigns) {
        if (!item || typeof item !== 'object' || typeof (item as { id?: unknown }).id !== 'string' || !Number.isInteger((item as { expectedRevision?: unknown }).expectedRevision)) {
          results.push({ id: typeof (item as { id?: unknown })?.id === 'string' ? (item as { id: string }).id : '', outcome: 'failed', message: 'Campaign id and expected revision are required.' });
          continue;
        }
        results.push(await changeCampaignStatus(repository, session, c.env, (item as { id: string }).id, status, (item as { expectedRevision: number }).expectedRevision, reconciledStatuses, c.executionCtx));
      }
      return c.json({ results });
    } catch (error) { return errorResponse(error); }
  });

  app.post('/api/quantity-breaks/campaigns/batch-delete', async (c) => {
    const session = await auth(c);
    if (session instanceof Response) return session;
    const denied = await requireWriteAccess(c, session);
    if (denied) return denied;
    try {
      const input = await body(c);
      const requested = input.campaigns;
      if (!Array.isArray(requested) || requested.length < 1 || requested.length > 35) {
        throw new CampaignValidationError('1 to 35 campaigns are required.');
      }
      const parsed: Array<{ id: string; expectedRevision: number }> = [];
      const ids = new Set<string>();
      for (const item of requested) {
        const candidate = item as { id?: unknown; expectedRevision?: unknown } | null;
        if (!candidate || typeof candidate.id !== 'string' || !candidate.id || typeof candidate.expectedRevision !== 'number' || !Number.isInteger(candidate.expectedRevision) || candidate.expectedRevision < 0 || ids.has(candidate.id)) {
          throw new CampaignValidationError('Campaign id and expected revision must be unique.');
        }
        const expectedRevision = candidate.expectedRevision as number;
        ids.add(candidate.id);
        parsed.push({ id: candidate.id, expectedRevision });
      }
      const repository = campaignRepository(c.env);
      const statuses = await reconcileCampaignList(repository, session, c.env, await repository.listProjections(session.handle));
      const results: Array<{ id: string; outcome: 'queued' | 'requires_pause' | 'unverified' | 'failed'; message?: string }> = [];
      const eligible: Array<{ campaignId: string; expectedRevision: number }> = [];
      const now = c.env.now?.() ?? Date.now();
      for (const item of parsed) {
        const campaign = await repository.get(session.handle, item.id);
        if (!campaign) { results.push({ id: item.id, outcome: 'failed', message: 'Campaign not found.' }); continue; }
        if (campaign.revision !== item.expectedRevision) { results.push({ id: item.id, outcome: 'failed', message: 'Campaign revision has changed. Refresh and retry.' }); continue; }
        const platformStatus = statuses.get(item.id) ?? null;
        if (platformStatus === 'unverified') { results.push({ id: item.id, outcome: 'unverified', message: 'SHOPLINE status is temporarily unavailable.' }); continue; }
        const publication = await repository.getPublication(session.handle, item.id);
        const currentlyEffective = platformStatus === 'active' && campaign.status === 'active' && (!campaign.startsAt || Date.parse(campaign.startsAt) <= now);
        if (currentlyEffective && publication.discountId) { results.push({ id: item.id, outcome: 'requires_pause', message: 'Current campaign is active. Pause it before deleting.' }); continue; }
        eligible.push({ campaignId: item.id, expectedRevision: item.expectedRevision });
      }
      if (!eligible.length) return c.json({ results }, 200);
      const batch = await new D1CampaignOperationRepository(c.env.DB, () => c.env.now?.() ?? Date.now()).enqueueBatch({ handle: session.handle, type: 'delete', campaigns: eligible });
      results.push(...eligible.map((item) => ({ id: item.campaignId, outcome: 'queued' as const })));
      c.executionCtx.waitUntil(processCampaignOperations(c.env));
      return c.json({ batch: { id: batch.id, state: batch.state }, results }, 202);
    } catch (error) { return errorResponse(error); }
  });

  app.get('/api/quantity-breaks/campaign-operations/:batchId', async (c) => {
    const session = await auth(c);
    if (session instanceof Response) return session;
    const batch = await new D1CampaignOperationRepository(c.env.DB).readBatch(session.handle, c.req.param('batchId'));
    if (!batch) return c.json({ error: 'Campaign operation batch not found.' }, 404);
    return c.json({ batch: {
      id: batch.id, type: batch.type, state: batch.state,
      operations: batch.operations.map((operation) => ({ id: operation.id, campaignId: operation.campaignId, type: operation.type, state: operation.state, attempts: operation.attempts, lastError: operation.lastError })),
    } });
  });
}
