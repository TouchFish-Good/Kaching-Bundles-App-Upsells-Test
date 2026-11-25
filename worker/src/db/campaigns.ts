import { normalizeOfferModules } from '../../../shared/offer-core.mjs';
import { campaignForActivation, campaignWithConfirmedEnd, campaignsConflict, validateCampaign, type Campaign, type CampaignDraft, type CampaignScope, type CampaignStatus } from '../domain/campaign';

export class CampaignValidationError extends Error {}
export class CampaignConflictError extends Error {}

export type PublicationState = 'idle' | 'publishing' | 'activating' | 'updating' | 'active' | 'pausing' | 'paused' | 'unpublishing' | 'deleting' | 'removed' | 'entitlement_revoked' | 'missing' | 'needs_reconciliation';
export type PublicationResumeStatus = 'active' | 'scheduled';
export type Publication = { state: PublicationState; discountId: string | null; nodeId: string | null; owner: string | null; resumeStatus?: PublicationResumeStatus; lastVerifiedAt?: string; stateReason?: string };
export type CollectionConflict = { state: 'clear' | 'conflict' | 'unknown'; campaignIds: string[]; syncedAt?: string };
export type CampaignPublicationProjection = { campaign: Campaign; publication: Publication; collectionConflict?: CollectionConflict };
export type PublicationLease = { campaign: Campaign; owner: string };
export type UpdateLease = { campaign: CampaignDraft; owner: string; discountId: string };
export type ReplacementPublicationLease = { campaign: CampaignDraft; owner: string; previousDiscountId: string; previousNodeId: string | null };
export type StagedUpdate = { candidate: CampaignDraft; expectedRevision: number; discountId: string };
type Row = { campaign_json: string; revision: number; updated_at: string };
type PublicationRow = { state: PublicationState; discount_id: string | null; platform_node_id: string | null; owner: string | null; resume_status: PublicationResumeStatus | null; last_verified_at: string | null; state_reason: string | null };
type PublicationProjectionRow = PublicationRow & { campaign_id: string };
type CollectionConflictRow = { campaign_id: string; state: CollectionConflict['state']; campaign_ids_json: string; synced_at: string | null };
type StagedUpdateRow = { candidate_json: string; expected_revision: number; discount_id: string };
type Clock = () => number;

const nowIso = (clock: Clock) => new Date(clock()).toISOString();

export class D1CampaignRepository {
  constructor(private readonly database: D1Database, private readonly clock: Clock = Date.now,
    private readonly syncOfferIndex?: (repository: D1CampaignRepository, handle: string, previous: CampaignDraft[], candidate: CampaignDraft, owner: string) => Promise<void>) {}

  async assertShopLease(handle: string, owner: string): Promise<void> {
    const lock = await this.database.prepare('SELECT owner, expires_at FROM quantity_breaks_shop_locks WHERE shop_handle = ?').bind(handle).first<{ owner: string; expires_at: number }>();
    if (!lock || lock.owner !== owner || lock.expires_at <= this.clock()) throw new CampaignConflictError('Publication shop lease was lost.');
  }

  private decode(row: Row): Campaign {
    const campaign = normalizeOfferModules(JSON.parse(row.campaign_json) as CampaignDraft);
    return { ...campaign, combinesWith: { ...campaign.combinesWith, productDiscounts: campaign.combinesWith?.productDiscounts ?? false }, revision: row.revision, updatedAt: row.updated_at };
  }

  private publication(row?: PublicationRow | null): Publication {
    return row ? {
      state: row.state, discountId: row.discount_id, nodeId: row.platform_node_id, owner: row.owner,
      ...(row.resume_status ? { resumeStatus: row.resume_status } : {}),
      ...(row.last_verified_at ? { lastVerifiedAt: row.last_verified_at } : {}),
      ...(row.state_reason ? { stateReason: row.state_reason } : {}),
    } : { state: 'idle', discountId: null, nodeId: null, owner: null };
  }

  private async rows(shopHandle: string): Promise<Campaign[]> {
    const result = await this.database.prepare(
      'SELECT campaign_json, revision, updated_at FROM quantity_breaks_campaigns WHERE shop_handle = ? ORDER BY updated_at DESC',
    ).bind(shopHandle).all<Row>();
    return result.results.map((row) => this.decode(row));
  }

  async list(shopHandle: string): Promise<Campaign[]> { return this.rows(shopHandle); }

  async listForAdmin(filters: { storeId?: string; query: string; status?: string; limit: number; offset: number }): Promise<{ total: number; items: Array<CampaignPublicationProjection & { storeId: string; shopHandle: string }> }> {
    const clauses = ["s.status = 'installed'"];
    const values: string[] = [];
    if (filters.storeId) { clauses.push('s.store_id = ?'); values.push(filters.storeId); }
    if (filters.query) {
      // instr treats merchant input literally, including SQL wildcard characters.
      clauses.push("instr(lower(s.store_id || ' ' || s.handle || ' ' || json_extract(c.campaign_json, '$.name')), ?) > 0");
      values.push(filters.query);
    }
    if (filters.status === 'expired') {
      clauses.push("json_extract(c.campaign_json, '$.status') NOT IN ('draft', 'active')");
    } else if (filters.status) {
      clauses.push("json_extract(c.campaign_json, '$.status') = ?");
      values.push(filters.status);
    }
    const from = `FROM quantity_breaks_campaigns c JOIN admin_stores s ON s.handle = c.shop_handle WHERE ${clauses.join(' AND ')}`;
    type AdminRow = Row & PublicationRow & { store_id: string; shop_handle: string; publication_state: PublicationState | null };
    const [count, page] = await this.database.batch([
      this.database.prepare(`SELECT count(*) AS total ${from}`).bind(...values),
      this.database.prepare(`SELECT c.campaign_json, c.revision, c.updated_at, s.store_id, c.shop_handle,
        p.state AS publication_state, p.discount_id, p.platform_node_id, p.owner, p.resume_status, p.last_verified_at, p.state_reason
        FROM quantity_breaks_campaigns c JOIN admin_stores s ON s.handle = c.shop_handle
        LEFT JOIN quantity_breaks_publications p ON p.shop_handle = c.shop_handle AND p.campaign_id = c.id
        WHERE ${clauses.join(' AND ')} ORDER BY s.handle COLLATE NOCASE, s.store_id, c.updated_at DESC, c.id LIMIT ? OFFSET ?`)
        .bind(...values, filters.limit, filters.offset),
    ]);
    return {
      total: Number((count.results[0] as { total: number }).total),
      items: (page.results as AdminRow[]).map((row) => ({
        campaign: this.decode(row),
        publication: this.publication(row.publication_state ? { ...row, state: row.publication_state } : null),
        storeId: row.store_id,
        shopHandle: row.shop_handle,
      })),
    };
  }

  async listProjections(shopHandle: string): Promise<CampaignPublicationProjection[]> {
    const [campaigns, publications, conflicts] = await Promise.all([
      this.rows(shopHandle),
      this.database.prepare('SELECT campaign_id, state, discount_id, platform_node_id, owner, resume_status, last_verified_at, state_reason FROM quantity_breaks_publications WHERE shop_handle = ?').bind(shopHandle).all<PublicationProjectionRow>(),
      this.database.prepare('SELECT campaign_id, state, campaign_ids_json, synced_at FROM quantity_breaks_collection_conflicts WHERE shop_handle = ?').bind(shopHandle).all<CollectionConflictRow>(),
    ]);
    const publicationByCampaign = new Map(publications.results.map((row) => [row.campaign_id, this.publication(row)]));
    const conflictByCampaign = new Map(conflicts.results.map((row) => [row.campaign_id, {
      state: row.state, campaignIds: JSON.parse(row.campaign_ids_json) as string[],
      ...(row.synced_at ? { syncedAt: row.synced_at } : {}),
    }]));
    return campaigns.map((campaign) => ({
      campaign,
      publication: publicationByCampaign.get(campaign.id) ?? this.publication(),
      ...(campaign.scope.kind === 'collections' ? { collectionConflict: conflictByCampaign.get(campaign.id) ?? { state: 'unknown' as const, campaignIds: [] } } : {}),
    }));
  }

  async getProjection(shopHandle: string, id: string): Promise<CampaignPublicationProjection | null> {
    const [campaign, publication, collectionConflict] = await Promise.all([
      this.get(shopHandle, id), this.getPublication(shopHandle, id), this.getCollectionConflict(shopHandle, id),
    ]);
    if (!campaign) return null;
    return { campaign, publication, ...(campaign.scope.kind === 'collections' ? { collectionConflict } : {}) };
  }

  async pauseForSubscriptionExpiration(shopHandle: string, id: string): Promise<Campaign | null> {
    const campaign = await this.get(shopHandle, id);
    if (!campaign) return null;
    if (campaign.pauseReason === 'subscription_expired' && campaign.neverExpires === false && campaign.endsAt) return campaign;
    const expiredAt = nowIso(this.clock);
    const next: Campaign = { ...campaign, status: 'paused', pauseReason: 'subscription_expired', endsAt: expiredAt, neverExpires: false, revision: campaign.revision + 1, updatedAt: expiredAt };
    await this.database.batch([
      this.database.prepare('UPDATE quantity_breaks_campaigns SET campaign_json = ?, revision = ?, updated_at = ? WHERE shop_handle = ? AND id = ?')
        .bind(JSON.stringify(next), next.revision, next.updatedAt, shopHandle, id),
      this.database.prepare("UPDATE quantity_breaks_publications SET state = 'entitlement_revoked', discount_id = NULL, owner = NULL, last_verified_at = ?, state_reason = 'subscription_expired', updated_at = ? WHERE shop_handle = ? AND campaign_id = ?")
        .bind(next.updatedAt, next.updatedAt, shopHandle, id),
    ]);
    return next;
  }

  async get(shopHandle: string, id: string): Promise<Campaign | null> {
    const row = await this.database.prepare(
      'SELECT campaign_json, revision, updated_at FROM quantity_breaks_campaigns WHERE shop_handle = ? AND id = ?',
    ).bind(shopHandle, id).first<Row>();
    return row ? this.decode(row) : null;
  }

  async getPublication(shopHandle: string, id: string): Promise<Publication> {
    const row = await this.database.prepare(
      'SELECT state, discount_id, platform_node_id, owner, resume_status, last_verified_at, state_reason FROM quantity_breaks_publications WHERE shop_handle = ? AND campaign_id = ?',
    ).bind(shopHandle, id).first<PublicationRow>();
    return this.publication(row);
  }

  async prepareParallelReplacementReconciliation(shopHandle: string, id: string, knownPublication?: Publication): Promise<boolean> {
    const publication = knownPublication ?? await this.getPublication(shopHandle, id);
    if (!publication.owner || !['parallel_replacement_old', 'parallel_replacement_new'].includes(publication.stateReason ?? '')) return false;
    const lock = await this.database.prepare('SELECT owner, expires_at FROM quantity_breaks_shop_locks WHERE shop_handle = ?')
      .bind(shopHandle).first<{ owner: string; expires_at: number }>();
    if (lock?.owner === publication.owner && lock.expires_at > this.clock()) return true;
    // A terminated Worker can leave either request's result unknown. Read SHOPLINE;
    // never send another create just because the publication lease has expired.
    await this.database.batch([
      this.database.prepare(`UPDATE quantity_breaks_publications SET state = ?, owner = NULL, updated_at = ?
        WHERE shop_handle = ? AND campaign_id = ? AND owner = ?`)
        .bind(publication.discountId ? 'paused' : 'needs_reconciliation', nowIso(this.clock), shopHandle, id, publication.owner),
      this.database.prepare('DELETE FROM quantity_breaks_staged_updates WHERE shop_handle = ? AND campaign_id = ?').bind(shopHandle, id),
    ]);
    return false;
  }

  private async removeConfirmedReplacementOld(shopHandle: string, campaign: Campaign): Promise<void> {
    await this.database.batch([
      this.database.prepare(`DELETE FROM quantity_breaks_campaigns WHERE shop_handle = ? AND id = ? AND revision = ?
        AND EXISTS (SELECT 1 FROM quantity_breaks_publications WHERE shop_handle = ? AND campaign_id = ?
          AND state_reason = 'parallel_replacement_old' AND owner IS NULL)`)
        .bind(shopHandle, campaign.id, campaign.revision, shopHandle, campaign.id),
      ...['quantity_breaks_publications', 'quantity_breaks_collection_conflicts', 'quantity_breaks_staged_updates'].map((table) =>
        this.database.prepare(`DELETE FROM ${table} WHERE shop_handle = ? AND campaign_id = ?
          AND NOT EXISTS (SELECT 1 FROM quantity_breaks_campaigns WHERE shop_handle = ? AND id = ?)`)
          .bind(shopHandle, campaign.id, shopHandle, campaign.id)),
    ]);
  }

  async reconcilePlatformStates(shopHandle: string, states: ReadonlyArray<{ campaignId: string; state: 'active' | 'paused' | 'missing'; nodeId: string | null; endsAt?: string }>): Promise<void> {
    if (!states.length) return;
    const projections = await this.listProjections(shopHandle);
    const byCampaign = new Map(projections.map((projection) => [projection.campaign.id, projection]));
    const now = nowIso(this.clock);
    const statements: D1PreparedStatement[] = [];
    for (const state of states) {
      const projection = byCampaign.get(state.campaignId);
      if (!projection?.publication.discountId) continue;
      const { campaign, publication } = projection;
      if (await this.prepareParallelReplacementReconciliation(shopHandle, campaign.id, publication)) continue;
      if (state.state === 'missing' && publication.stateReason === 'parallel_replacement_old') {
        await this.removeConfirmedReplacementOld(shopHandle, campaign);
        continue;
      }
      const pausePending = publication.state === 'pausing' && state.state === 'active';
      const nextStatus: CampaignStatus = pausePending
        ? campaign.status
        : state.state === 'active' ? (campaign.status === 'scheduled' ? 'scheduled' : 'active')
          : state.state === 'missing' ? 'draft' : 'paused';
      const nextPublication: PublicationState = pausePending ? 'pausing' : state.state === 'missing' ? 'missing' : state.state;
      const nextDiscountId = state.state === 'missing' ? null : publication.discountId;
      const nextNodeId = state.state === 'missing' ? null : state.nodeId;
      const nextReason = publication.stateReason === 'parallel_replacement_old' ? publication.stateReason : null;
      const confirmed = state.state === 'paused' ? campaignWithConfirmedEnd(campaign, now, state.endsAt) : campaign;
      const changedCampaign = campaign.status !== nextStatus || (campaign.pauseReason ?? null) !== null || campaign.endsAt !== confirmed.endsAt || campaign.neverExpires !== confirmed.neverExpires;
      if (changedCampaign) {
        const next: Campaign = { ...confirmed, status: nextStatus, pauseReason: undefined, revision: campaign.revision + 1, updatedAt: now };
        statements.push(this.database.prepare('UPDATE quantity_breaks_campaigns SET campaign_json = ?, revision = ?, updated_at = ? WHERE shop_handle = ? AND id = ? AND revision = ?')
          .bind(JSON.stringify(next), next.revision, now, shopHandle, campaign.id, campaign.revision));
      }
      statements.push(this.database.prepare('UPDATE quantity_breaks_publications SET state = ?, discount_id = ?, platform_node_id = ?, owner = NULL, last_verified_at = ?, state_reason = ?, updated_at = ? WHERE shop_handle = ? AND campaign_id = ?')
        .bind(nextPublication, nextDiscountId, nextNodeId, now, nextReason, now, shopHandle, campaign.id));
    }
    if (statements.length) await this.database.batch(statements);
  }

  async reconcilePlatformState(shopHandle: string, id: string, state: 'active' | 'paused' | 'missing', nodeId: string | null, endsAt?: string): Promise<Campaign | null> {
    const campaign = await this.get(shopHandle, id);
    const publication = await this.getPublication(shopHandle, id);
    if (!campaign || !publication.discountId) return campaign;
    if (await this.prepareParallelReplacementReconciliation(shopHandle, id, publication)) return campaign;
    if (state === 'missing' && publication.stateReason === 'parallel_replacement_old') {
      await this.removeConfirmedReplacementOld(shopHandle, campaign);
      return this.get(shopHandle, id);
    }
    const now = nowIso(this.clock);
    const pausePending = publication.state === 'pausing' && state === 'active';
    const nextStatus: CampaignStatus = pausePending
      ? campaign.status
      : state === 'active' ? (campaign.status === 'scheduled' ? 'scheduled' : 'active')
        : state === 'missing' ? 'draft' : 'paused';
    const nextPublication: PublicationState = pausePending ? 'pausing' : state === 'missing' ? 'missing' : state;
    const nextDiscountId = state === 'missing' ? null : publication.discountId;
    const nextNodeId = state === 'missing' ? null : nodeId;
    const nextReason = publication.stateReason === 'parallel_replacement_old' ? publication.stateReason : null;
    const confirmed = state === 'paused' ? campaignWithConfirmedEnd(campaign, now, endsAt) : campaign;
    const nextCampaign: Campaign = {
      ...confirmed,
      status: nextStatus,
      pauseReason: undefined,
      revision: campaign.status === nextStatus && (campaign.pauseReason ?? null) === null && campaign.endsAt === confirmed.endsAt && campaign.neverExpires === confirmed.neverExpires ? campaign.revision : campaign.revision + 1,
      updatedAt: now,
    };
    await this.database.batch([
      ...(nextCampaign.revision === campaign.revision ? [] : [this.database.prepare('UPDATE quantity_breaks_campaigns SET campaign_json = ?, revision = ?, updated_at = ? WHERE shop_handle = ? AND id = ?')
        .bind(JSON.stringify(nextCampaign), nextCampaign.revision, now, shopHandle, id)]),
      this.database.prepare('UPDATE quantity_breaks_publications SET state = ?, discount_id = ?, platform_node_id = ?, owner = NULL, last_verified_at = ?, state_reason = ?, updated_at = ? WHERE shop_handle = ? AND campaign_id = ?')
        .bind(nextPublication, nextDiscountId, nextNodeId, now, nextReason, now, shopHandle, id),
    ]);
    return nextCampaign;
  }

  async reconcileUnlinkedPublication(
    shopHandle: string,
    id: string,
    matched: { discountId: string; nodeId: string | null; state: 'active' | 'paused'; endsAt?: string } | null,
  ): Promise<Campaign | null> {
    const campaign = await this.get(shopHandle, id);
    const publication = await this.getPublication(shopHandle, id);
    if (!campaign || publication.discountId || publication.state !== 'needs_reconciliation') return campaign;
    if (await this.prepareParallelReplacementReconciliation(shopHandle, id, publication)) return campaign;
    const now = nowIso(this.clock);
    const replacementDeleted = publication.stateReason === 'expired_replacement_deleted';
    const staged = replacementDeleted ? await this.getStagedUpdate(shopHandle, id) : null;
    const publishedCandidate = staged ? { ...staged.candidate, revision: campaign.revision, updatedAt: campaign.updatedAt } : campaignForActivation(campaign);
    const confirmed = matched ? (matched.state === 'paused' ? campaignWithConfirmedEnd(publishedCandidate, now, matched.endsAt) : publishedCandidate) : campaign;
    const nextStatus: CampaignStatus = matched ? (matched.state === 'active' && confirmed.startsAt && Date.parse(confirmed.startsAt) > this.clock() ? 'scheduled' : matched.state === 'active' ? 'active' : 'paused') : replacementDeleted || campaign.pauseReason === 'subscription_expired' ? 'paused' : 'draft';
    const nextPublication: PublicationState = matched ? matched.state : replacementDeleted ? 'removed' : 'idle';
    const pauseReason = matched ? undefined : campaign.pauseReason;
    const next: Campaign = {
      ...confirmed,
      status: nextStatus,
      pauseReason,
      revision: campaign.status === nextStatus && confirmed === campaign && campaign.pauseReason === pauseReason ? campaign.revision : campaign.revision + 1,
      updatedAt: now,
    };
    await this.database.batch([
      ...(next.revision === campaign.revision ? [] : [this.database.prepare('UPDATE quantity_breaks_campaigns SET campaign_json = ?, revision = ?, updated_at = ? WHERE shop_handle = ? AND id = ?')
        .bind(JSON.stringify(next), next.revision, now, shopHandle, id)]),
      this.database.prepare(`UPDATE quantity_breaks_publications SET state = ?, discount_id = ?, platform_node_id = ?, owner = NULL,
        last_verified_at = ?, state_reason = ?, updated_at = ? WHERE shop_handle = ? AND campaign_id = ?`)
        .bind(nextPublication, matched?.discountId ?? null, matched?.nodeId ?? null, now, matched ? null : 'platform_discount_not_found', now, shopHandle, id),
      ...(staged ? [this.database.prepare('DELETE FROM quantity_breaks_staged_updates WHERE shop_handle = ? AND campaign_id = ?').bind(shopHandle, id)] : []),
    ]);
    return next;
  }

  async finishExpiredPauseCleanup(shopHandle: string, id: string, expectedRevision: number): Promise<Campaign> {
    const campaign = await this.get(shopHandle, id);
    const publication = await this.getPublication(shopHandle, id);
    if (!campaign || campaign.revision !== expectedRevision || !publication.discountId || !['active', 'paused', 'pausing'].includes(publication.state)) {
      throw new CampaignConflictError('Expired discount cleanup is no longer applicable.');
    }
    const next: Campaign = { ...campaignWithConfirmedEnd(campaign, nowIso(this.clock)), status: 'paused', pauseReason: undefined, revision: expectedRevision + 1, updatedAt: nowIso(this.clock) };
    const updated = await this.database.prepare('UPDATE quantity_breaks_campaigns SET campaign_json = ?, revision = ?, updated_at = ? WHERE shop_handle = ? AND id = ? AND revision = ?')
      .bind(JSON.stringify(next), next.revision, next.updatedAt, shopHandle, id, expectedRevision).run();
    if ((updated.meta.changes ?? 0) !== 1) throw new CampaignConflictError('Campaign revision has changed.');
    await this.database.prepare(`UPDATE quantity_breaks_publications SET state = 'removed', discount_id = NULL, platform_node_id = NULL,
      owner = NULL, resume_status = NULL, last_verified_at = ?, state_reason = 'merchant_paused', updated_at = ?
      WHERE shop_handle = ? AND campaign_id = ? AND discount_id IS NOT NULL`)
      .bind(next.updatedAt, next.updatedAt, shopHandle, id).run();
    return next;
  }

  async markReconciliationNeeded(shopHandle: string, id: string): Promise<void> {
    await this.database.prepare(`UPDATE quantity_breaks_publications
      SET state = 'needs_reconciliation', owner = NULL, state_reason = 'platform_state_unverified', updated_at = ?
      WHERE shop_handle = ? AND campaign_id = ? AND discount_id IS NOT NULL`)
      .bind(nowIso(this.clock), shopHandle, id).run();
  }

  async getStagedUpdate(shopHandle: string, id: string): Promise<StagedUpdate | null> {
    const row = await this.database.prepare(
      `SELECT candidate_json, expected_revision, discount_id
       FROM quantity_breaks_staged_updates WHERE shop_handle = ? AND campaign_id = ?`,
    ).bind(shopHandle, id).first<StagedUpdateRow>();
    if (!row) return null;
    const candidate = normalizeOfferModules(JSON.parse(row.candidate_json) as CampaignDraft);
    return { candidate: { ...candidate, combinesWith: { ...candidate.combinesWith, productDiscounts: candidate.combinesWith?.productDiscounts ?? false } }, expectedRevision: row.expected_revision, discountId: row.discount_id };
  }

  async save(shopHandle: string, draft: CampaignDraft, expectedRevision: number): Promise<Campaign> {
    const errors = validateCampaign(draft);
    if (errors.length) throw new CampaignValidationError(errors.join(' '));
    draft = normalizeOfferModules(draft);
    if (!shopHandle || !Number.isInteger(expectedRevision) || expectedRevision < 0) {
      throw new CampaignValidationError('Shop and expected revision are required.');
    }

    const owner = await this.acquireShopLock(shopHandle);
    try {
      const existing = await this.rows(shopHandle);
      const current = existing.find((item) => item.id === draft.id);
      if ((current?.revision ?? 0) !== expectedRevision) throw new CampaignConflictError('Campaign revision has changed.');
      const publication = await this.getPublication(shopHandle, draft.id);
      if (publication.discountId || ['publishing', 'activating', 'updating', 'pausing', 'deleting', 'unpublishing'].includes(publication.state)) {
        throw new CampaignConflictError('Pause or reconcile the published campaign before editing.');
      }
      if (existing.some((item) => item.id !== draft.id && campaignsConflict(item, draft))) {
        throw new CampaignConflictError('Campaign product scope overlaps another enabled campaign.');
      }
      if ((draft.status === 'active' || draft.status === 'scheduled') &&
        existing.filter((item) => item.id !== draft.id && (item.status === 'active' || item.status === 'scheduled')).length >= 35) {
        throw new CampaignConflictError('A SHOPLINE Function supports at most 35 enabled rules.');
      }

      const revision = expectedRevision + 1;
      const updatedAt = nowIso(this.clock);
      const result = await this.database.prepare(`INSERT INTO quantity_breaks_campaigns
        (shop_handle, id, campaign_json, revision, updated_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(shop_handle, id) DO UPDATE SET campaign_json = excluded.campaign_json,
        revision = excluded.revision, updated_at = excluded.updated_at
        WHERE quantity_breaks_campaigns.revision = ?`)
        .bind(shopHandle, draft.id, JSON.stringify(draft), revision, updatedAt, expectedRevision).run();
      if ((result.meta.changes ?? 0) !== 1) throw new CampaignConflictError('Campaign revision has changed.');
      return { ...draft, revision, updatedAt };
    } finally {
      await this.releasePublicationLock(shopHandle, owner);
    }
  }

  private async acquirePublicationLock(shopHandle: string, owner: string): Promise<void> {
    const now = this.clock();
    const result = await this.database.prepare(`INSERT INTO quantity_breaks_shop_locks
      (shop_handle, owner, expires_at) VALUES (?, ?, ?)
      ON CONFLICT(shop_handle) DO UPDATE SET owner = excluded.owner, expires_at = excluded.expires_at
      WHERE quantity_breaks_shop_locks.expires_at < ?`)
      .bind(shopHandle, owner, now + 60_000, now).run();
    if ((result.meta.changes ?? 0) !== 1) throw new CampaignConflictError('Another publication in progress for this shop.');
  }

  private async releasePublicationLock(shopHandle: string, owner: string): Promise<void> {
    await this.database.prepare('DELETE FROM quantity_breaks_shop_locks WHERE shop_handle = ? AND owner = ?').bind(shopHandle, owner).run();
  }

  async acquireShopLock(shopHandle: string): Promise<string> {
    const owner = crypto.randomUUID();
    await this.acquirePublicationLock(shopHandle, owner);
    return owner;
  }

  async releaseShopLock(shopHandle: string, owner: string): Promise<void> {
    await this.releasePublicationLock(shopHandle, owner);
  }

  async beginPublication(shopHandle: string, id: string, expectedRevision: number, action: 'publish' | 'pause', resolvedProductIds: string[] = [], scopeSnapshot?: CampaignScope): Promise<PublicationLease> {
    const owner = await this.acquireShopLock(shopHandle);
    try {
      const campaigns = await this.rows(shopHandle);
      const campaign = campaigns.find((item) => item.id === id);
      if (!campaign) throw new CampaignConflictError('Campaign not found.');
      if (campaign.revision !== expectedRevision) throw new CampaignConflictError('Campaign revision has changed.');
      const publication = await this.getPublication(shopHandle, id);
      if (['needs_reconciliation', 'publishing', 'activating', 'pausing', 'deleting', 'unpublishing'].includes(publication.state)) {
        throw new CampaignConflictError('Publication needs reconciliation before retry.');
      }
      let leaseCampaign: Campaign = campaign;

      if (action === 'publish') {
        const creating = ['draft', 'paused', 'ended'].includes(campaign.status) && !publication.discountId && ['idle', 'removed', 'missing', 'entitlement_revoked'].includes(publication.state);
        if (!creating) {
          throw new CampaignConflictError('Campaign is already active or has a platform discount.');
        }
        if (campaign.scope.kind === 'all') throw new CampaignConflictError('Only specified products or collections can be published.');
        if (campaign.scope.kind === 'collections' && !resolvedProductIds.length) {
          throw new CampaignConflictError('Collection membership verification is required before publication.');
        }
        const snapshot = scopeSnapshot ?? campaign.scope;
        const candidate: CampaignDraft = { ...campaignForActivation(campaign), status: 'active', scope: snapshot.kind === 'collections'
          ? { ...snapshot, resolvedProductIds: [...new Set(resolvedProductIds)] }
          : snapshot };
        leaseCampaign = { ...campaignForActivation(campaign), scope: candidate.scope };
        const errors = validateCampaign(candidate);
        if (errors.length) throw new CampaignValidationError(errors.join(' '));
        if (campaigns.some((item) => item.id !== id && campaignsConflict(item, candidate))) {
          throw new CampaignConflictError('Campaign product scope overlaps another enabled campaign.');
        }
        if (campaigns.filter((item) => item.id !== id && (item.status === 'active' || item.status === 'scheduled')).length >= 35) {
          throw new CampaignConflictError('A SHOPLINE Function supports at most 35 enabled rules.');
        }
        if (JSON.stringify(campaign.scope) !== JSON.stringify(candidate.scope)) {
          await this.database.prepare('UPDATE quantity_breaks_campaigns SET campaign_json = ? WHERE shop_handle = ? AND id = ?')
            .bind(JSON.stringify({ ...campaign, scope: candidate.scope }), shopHandle, id).run();
        }
      } else if (!['active', 'scheduled'].includes(campaign.status) || !publication.discountId || publication.state !== 'active') {
        throw new CampaignConflictError('Campaign is not published.');
      }

      await this.syncOfferIndex?.(this, shopHandle, [campaign], { ...leaseCampaign, status: action === 'publish' ? 'active' : 'paused' }, owner);
      await this.assertShopLease(shopHandle, owner);
      await this.database.prepare(`INSERT INTO quantity_breaks_publications
        (shop_handle, campaign_id, state, discount_id, platform_node_id, owner, resume_status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(shop_handle, campaign_id) DO UPDATE SET state = excluded.state,
        discount_id = excluded.discount_id, platform_node_id = excluded.platform_node_id, owner = excluded.owner,
        resume_status = excluded.resume_status, updated_at = excluded.updated_at`)
        .bind(shopHandle, id, action === 'publish' ? (publication.discountId ? 'activating' : 'publishing') : 'pausing', publication.discountId, publication.nodeId, owner,
          action === 'pause' ? (campaign.status === 'scheduled' ? 'scheduled' : 'active') : publication.resumeStatus ?? null, nowIso(this.clock)).run();
      return { campaign: leaseCampaign, owner };
    } catch (error) {
      await this.releasePublicationLock(shopHandle, owner);
      throw error;
    }
  }

  async finishPublication(shopHandle: string, id: string, expectedRevision: number, action: 'publish' | 'pause', discountId: string | null, owner: string, nodeId: string | null = null): Promise<Campaign> {
    const lock = await this.database.prepare('SELECT owner, expires_at FROM quantity_breaks_shop_locks WHERE shop_handle = ?').bind(shopHandle).first<{ owner: string; expires_at: number }>();
    if (!lock || lock.owner !== owner || lock.expires_at <= this.clock()) {
      await this.database.prepare(`UPDATE quantity_breaks_publications SET state = 'needs_reconciliation', updated_at = ? WHERE shop_handle = ? AND campaign_id = ? AND owner = ?`)
        .bind(nowIso(this.clock), shopHandle, id, owner).run();
      throw new CampaignConflictError('Publication lock was lost and needs reconciliation.');
    }
    const campaign = await this.get(shopHandle, id);
    if (!campaign || campaign.revision !== expectedRevision) {
      await this.releasePublicationLock(shopHandle, owner);
      throw new CampaignConflictError('Campaign revision changed during publication.');
    }
    const publication = await this.getPublication(shopHandle, id);
    const expectedState = action === 'publish' ? (publication.discountId ? 'activating' : 'publishing') : 'pausing';
    if (publication.state !== expectedState) {
      await this.releasePublicationLock(shopHandle, owner);
      throw new CampaignConflictError('Publication transition is not in progress.');
    }
    if (action === 'publish' && !discountId) {
      await this.releasePublicationLock(shopHandle, owner);
      throw new CampaignValidationError('Confirmed platform discount ID is required.');
    }
    const confirmedDiscountId = action === 'pause' ? discountId ?? publication.discountId : discountId;
    const confirmedNodeId = action === 'pause' ? nodeId ?? publication.nodeId : nodeId;
    if (!confirmedDiscountId) {
      await this.releasePublicationLock(shopHandle, owner);
      throw new CampaignValidationError('Confirmed platform discount ID is required.');
    }
    const startsAt = campaign.startsAt ? Date.parse(campaign.startsAt) : Number.NaN;
    const publishStatus: CampaignStatus = Number.isFinite(startsAt) && startsAt > this.clock() ? 'scheduled' : 'active';
    const next: Campaign = { ...(action === 'publish' ? campaignForActivation(campaign) : campaignWithConfirmedEnd(campaign, nowIso(this.clock))), status: action === 'publish' ? (publication.resumeStatus ?? publishStatus) : 'paused', revision: expectedRevision + 1, updatedAt: nowIso(this.clock) };
    await this.database.batch([
      this.database.prepare('UPDATE quantity_breaks_campaigns SET campaign_json = ?, revision = ?, updated_at = ? WHERE shop_handle = ? AND id = ?')
        .bind(JSON.stringify(next), next.revision, next.updatedAt, shopHandle, id),
      this.database.prepare('UPDATE quantity_breaks_publications SET state = ?, discount_id = ?, platform_node_id = ?, owner = NULL, resume_status = ?, last_verified_at = ?, state_reason = NULL WHERE shop_handle = ? AND campaign_id = ? AND owner = ?')
        .bind(action === 'publish' ? 'active' : 'paused', confirmedDiscountId, confirmedNodeId, action === 'publish' ? null : (campaign.status === 'scheduled' ? 'scheduled' : 'active'), next.updatedAt, shopHandle, id, owner),
      this.database.prepare('DELETE FROM quantity_breaks_shop_locks WHERE shop_handle = ? AND owner = ?').bind(shopHandle, owner),
    ]);
    return next;
  }

  async beginExpiredReplacement(
    shopHandle: string,
    candidate: CampaignDraft,
    expectedRevision: number,
    resolvedProductIds: string[] = [],
    replacementNow = this.clock(),
  ): Promise<ReplacementPublicationLease> {
    const owner = await this.acquireShopLock(shopHandle);
    try {
      const current = await this.get(shopHandle, candidate.id);
      const publication = await this.getPublication(shopHandle, candidate.id);
      if (!current || current.revision !== expectedRevision || current.status !== 'paused' || publication.state !== 'paused' || !publication.discountId) {
        throw new CampaignConflictError('Expired campaign replacement is not available.');
      }
      const startsAt = candidate.startsAt ? Date.parse(candidate.startsAt) : Number.NaN;
      const replacement: CampaignDraft = {
        ...normalizeOfferModules(candidate),
        id: `local-${crypto.randomUUID()}`,
        status: Number.isFinite(startsAt) && startsAt > replacementNow ? 'scheduled' : 'active',
        scope: candidate.scope.kind === 'collections'
          ? { ...candidate.scope, resolvedProductIds: [...new Set(resolvedProductIds)] }
          : candidate.scope,
      };
      const errors = validateCampaign(replacement);
      if (errors.length) throw new CampaignValidationError(errors.join(' '));
      if (replacement.scope.kind === 'all') throw new CampaignConflictError('Only specified products or collections can be published.');
      if (replacement.scope.kind === 'collections' && !resolvedProductIds.length) {
        throw new CampaignConflictError('Collection membership verification is required before publication.');
      }
      const campaigns = await this.rows(shopHandle);
      if (campaigns.some((item) => item.id !== candidate.id && campaignsConflict(item, replacement))) {
        throw new CampaignConflictError('Campaign product scope overlaps another enabled campaign.');
      }
      if (campaigns.filter((item) => item.id !== candidate.id && (item.status === 'active' || item.status === 'scheduled')).length >= 35) {
        throw new CampaignConflictError('A SHOPLINE Function supports at most 35 enabled rules.');
      }
      await this.syncOfferIndex?.(this, shopHandle, [current], replacement, owner);
      await this.assertShopLease(shopHandle, owner);
      const now = nowIso(this.clock);
      await this.database.batch([
        this.database.prepare(`INSERT INTO quantity_breaks_campaigns (shop_handle, id, campaign_json, revision, updated_at)
          VALUES (?, ?, ?, 1, ?)`)
          .bind(shopHandle, replacement.id, JSON.stringify(replacement), now),
        this.database.prepare(`INSERT INTO quantity_breaks_publications
          (shop_handle, campaign_id, state, owner, state_reason, updated_at)
          VALUES (?, ?, 'publishing', ?, 'parallel_replacement_new', ?)`)
          .bind(shopHandle, replacement.id, owner, now),
        this.database.prepare(`INSERT INTO quantity_breaks_staged_updates
          (shop_handle, campaign_id, candidate_json, expected_revision, discount_id) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(shop_handle, campaign_id) DO UPDATE SET candidate_json = excluded.candidate_json,
          expected_revision = excluded.expected_revision, discount_id = excluded.discount_id`)
          .bind(shopHandle, candidate.id, JSON.stringify(replacement), expectedRevision, publication.discountId),
        this.database.prepare(`UPDATE quantity_breaks_publications SET state = 'activating', owner = ?, state_reason = 'parallel_replacement_old', updated_at = ?
          WHERE shop_handle = ? AND campaign_id = ? AND state = 'paused' AND discount_id = ?`)
          .bind(owner, now, shopHandle, candidate.id, publication.discountId),
      ]);
      const staged = await this.getPublication(shopHandle, candidate.id);
      if (staged.state !== 'activating' || staged.owner !== owner || staged.discountId !== publication.discountId) {
        throw new CampaignConflictError('Expired campaign replacement changed during staging.');
      }
      return { campaign: replacement, owner, previousDiscountId: publication.discountId, previousNodeId: publication.nodeId };
    } catch (error) {
      await this.releasePublicationLock(shopHandle, owner);
      throw error;
    }
  }

  async settleExpiredReplacement(
    shopHandle: string,
    id: string,
    expectedRevision: number,
    owner: string,
    result: { deleted: boolean; created?: { discountId: string; nodeId: string | null }; pendingDiscountId?: string; uncertain: boolean },
  ): Promise<Campaign> {
    const lock = await this.database.prepare('SELECT owner, expires_at FROM quantity_breaks_shop_locks WHERE shop_handle = ?')
      .bind(shopHandle).first<{ owner: string; expires_at: number }>();
    const current = await this.get(shopHandle, id);
    const publication = await this.getPublication(shopHandle, id);
    const staged = await this.getStagedUpdate(shopHandle, id);
    if (!lock || lock.owner !== owner || lock.expires_at <= this.clock() || !current || current.revision !== expectedRevision
      || publication.owner !== owner || publication.state !== 'activating' || !staged || staged.expectedRevision !== expectedRevision) {
      throw new CampaignConflictError('Replacement needs reconciliation before retry.');
    }
    const replacement = await this.get(shopHandle, staged.candidate.id);
    const replacementPublication = staged ? await this.getPublication(shopHandle, staged.candidate.id) : null;
    if (!replacement || replacement.id === id || replacementPublication?.owner !== owner || replacementPublication.state !== 'publishing') {
      throw new CampaignConflictError('Replacement identity is unavailable.');
    }
    const now = nowIso(this.clock);
    const keepNew = Boolean(result.created) || result.uncertain;
    const keepOld = !result.deleted || !keepNew;
    const statements: D1PreparedStatement[] = [];
    const old: Campaign = { ...current, revision: expectedRevision + 1, updatedAt: now };
    if (keepOld) {
      statements.push(
        this.database.prepare('UPDATE quantity_breaks_campaigns SET campaign_json = ?, revision = ?, updated_at = ? WHERE shop_handle = ? AND id = ? AND revision = ?')
          .bind(JSON.stringify(old), old.revision, now, shopHandle, id, expectedRevision),
        this.database.prepare(`UPDATE quantity_breaks_publications SET state = ?, discount_id = ?, platform_node_id = ?, owner = NULL,
          state_reason = ?, last_verified_at = ?, updated_at = ? WHERE shop_handle = ? AND campaign_id = ? AND owner = ?`)
          .bind(result.deleted ? 'removed' : 'paused', result.deleted ? null : publication.discountId,
            result.deleted ? null : publication.nodeId, keepNew ? 'parallel_replacement_old' : null, now, now, shopHandle, id, owner),
      );
    } else {
      statements.push(this.database.prepare('DELETE FROM quantity_breaks_campaigns WHERE shop_handle = ? AND id = ? AND revision = ?')
        .bind(shopHandle, id, expectedRevision));
      for (const table of ['quantity_breaks_publications', 'quantity_breaks_collection_conflicts']) {
        statements.push(this.database.prepare(`DELETE FROM ${table} WHERE shop_handle = ? AND campaign_id = ?`).bind(shopHandle, id));
      }
    }
    if (keepNew) {
      statements.push(this.database.prepare(`UPDATE quantity_breaks_publications SET state = ?, discount_id = ?, platform_node_id = ?, owner = NULL,
        state_reason = ?, last_verified_at = ?, updated_at = ? WHERE shop_handle = ? AND campaign_id = ? AND owner = ?`)
        .bind(result.created ? 'active' : 'needs_reconciliation', result.created?.discountId ?? result.pendingDiscountId ?? null, result.created?.nodeId ?? null,
          result.created ? null : result.pendingDiscountId ? 'creation_confirmation_pending' : 'parallel_replacement_new', result.created ? now : null, now, shopHandle, replacement.id, owner));
    } else {
      statements.push(this.database.prepare('DELETE FROM quantity_breaks_campaigns WHERE shop_handle = ? AND id = ?').bind(shopHandle, replacement.id),
        this.database.prepare('DELETE FROM quantity_breaks_publications WHERE shop_handle = ? AND campaign_id = ?').bind(shopHandle, replacement.id));
    }
    statements.push(this.database.prepare('DELETE FROM quantity_breaks_staged_updates WHERE shop_handle = ? AND campaign_id = ?').bind(shopHandle, id),
      this.database.prepare('DELETE FROM quantity_breaks_shop_locks WHERE shop_handle = ? AND owner = ?').bind(shopHandle, owner));
    await this.database.batch(statements);
    return keepNew ? replacement : old;
  }

  async finishPausePending(shopHandle: string, id: string, expectedRevision: number, discountId: string, owner: string, nodeId: string | null = null): Promise<Campaign> {
    const lock = await this.database.prepare('SELECT owner, expires_at FROM quantity_breaks_shop_locks WHERE shop_handle = ?').bind(shopHandle).first<{ owner: string; expires_at: number }>();
    if (!lock || lock.owner !== owner || lock.expires_at <= this.clock()) {
      await this.database.prepare("UPDATE quantity_breaks_publications SET state = 'needs_reconciliation', updated_at = ? WHERE shop_handle = ? AND campaign_id = ? AND owner = ?")
        .bind(nowIso(this.clock), shopHandle, id, owner).run();
      throw new CampaignConflictError('Publication lock was lost and needs reconciliation.');
    }
    const campaign = await this.get(shopHandle, id);
    const publication = await this.getPublication(shopHandle, id);
    if (!campaign || campaign.revision !== expectedRevision || publication.state !== 'pausing' || publication.owner !== owner) {
      await this.releasePublicationLock(shopHandle, owner);
      throw new CampaignConflictError('Pause transition is not in progress.');
    }
    const now = nowIso(this.clock);
    await this.database.batch([
      this.database.prepare('UPDATE quantity_breaks_publications SET state = ?, discount_id = ?, platform_node_id = ?, owner = NULL, resume_status = ?, last_verified_at = ?, state_reason = NULL, updated_at = ? WHERE shop_handle = ? AND campaign_id = ? AND owner = ?')
        .bind('pausing', discountId, nodeId ?? publication.nodeId, campaign.status === 'scheduled' ? 'scheduled' : 'active', now, now, shopHandle, id, owner),
      this.database.prepare('DELETE FROM quantity_breaks_shop_locks WHERE shop_handle = ? AND owner = ?').bind(shopHandle, owner),
    ]);
    return campaign;
  }

  async beginPlatformDeletion(shopHandle: string, id: string, expectedRevision: number): Promise<PublicationLease> {
    const owner = await this.acquireShopLock(shopHandle);
    try {
      const campaign = await this.get(shopHandle, id);
      const publication = await this.getPublication(shopHandle, id);
      if (!campaign || campaign.revision !== expectedRevision || !['active', 'scheduled', 'paused'].includes(campaign.status) || !publication.discountId || !['active', 'paused'].includes(publication.state)) {
        throw new CampaignConflictError('Campaign platform deletion is not available.');
      }
      await this.database.prepare(`UPDATE quantity_breaks_publications SET state = 'deleting', owner = ?, updated_at = ? WHERE shop_handle = ? AND campaign_id = ? AND state = ? AND discount_id IS NOT NULL`)
        .bind(owner, nowIso(this.clock), shopHandle, id, publication.state).run();
      const staged = await this.getPublication(shopHandle, id);
      if (staged.state !== 'deleting' || staged.owner !== owner) throw new CampaignConflictError('Campaign platform deletion changed during staging.');
      return { campaign, owner };
    } catch (error) {
      await this.releasePublicationLock(shopHandle, owner);
      throw error;
    }
  }

  async markPublicationFailure(shopHandle: string, id: string, uncertain: boolean, action: 'publish' | 'pause', owner: string, pendingDiscountId?: string): Promise<void> {
    const state: PublicationState = uncertain ? 'needs_reconciliation' : action === 'publish' ? 'idle' : 'active';
    await this.database.batch([
      this.database.prepare('UPDATE quantity_breaks_publications SET state = ?, discount_id = COALESCE(?, discount_id), state_reason = CASE WHEN ? IS NOT NULL THEN ? ELSE state_reason END, owner = NULL, updated_at = ? WHERE shop_handle = ? AND campaign_id = ? AND owner = ?').bind(state, pendingDiscountId ?? null, pendingDiscountId ?? null, 'creation_confirmation_pending', nowIso(this.clock), shopHandle, id, owner),
      this.database.prepare('DELETE FROM quantity_breaks_shop_locks WHERE shop_handle = ? AND owner = ?').bind(shopHandle, owner),
    ]);
  }

  async finishPlatformDeletion(shopHandle: string, id: string, expectedRevision: number, owner: string): Promise<Campaign> {
    const campaign = await this.get(shopHandle, id);
    const publication = await this.getPublication(shopHandle, id);
    if (!campaign || campaign.revision !== expectedRevision || publication.state !== 'deleting' || publication.owner !== owner) {
      throw new CampaignConflictError('Campaign deletion transition is not in progress.');
    }
    const next: Campaign = { ...campaignWithConfirmedEnd(campaign, nowIso(this.clock)), status: 'paused', revision: expectedRevision + 1, updatedAt: nowIso(this.clock) };
    await this.database.batch([
      this.database.prepare('UPDATE quantity_breaks_campaigns SET campaign_json = ?, revision = ?, updated_at = ? WHERE shop_handle = ? AND id = ?')
        .bind(JSON.stringify(next), next.revision, next.updatedAt, shopHandle, id),
      this.database.prepare(`UPDATE quantity_breaks_publications SET state = 'removed', discount_id = NULL, platform_node_id = NULL, owner = NULL,
        resume_status = NULL, last_verified_at = ?, state_reason = 'platform_deleted', updated_at = ? WHERE shop_handle = ? AND campaign_id = ? AND owner = ?`)
        .bind(next.updatedAt, next.updatedAt, shopHandle, id, owner),
      this.database.prepare('DELETE FROM quantity_breaks_shop_locks WHERE shop_handle = ? AND owner = ?').bind(shopHandle, owner),
    ]);
    return next;
  }

  async markPlatformDeletionFailure(shopHandle: string, id: string, uncertain: boolean, owner: string): Promise<void> {
    const campaign = await this.get(shopHandle, id);
    await this.database.batch([
      this.database.prepare('UPDATE quantity_breaks_publications SET state = ?, owner = NULL, updated_at = ? WHERE shop_handle = ? AND campaign_id = ? AND owner = ?')
        .bind(uncertain ? 'needs_reconciliation' : campaign?.status === 'paused' ? 'paused' : 'active', nowIso(this.clock), shopHandle, id, owner),
      this.database.prepare('DELETE FROM quantity_breaks_shop_locks WHERE shop_handle = ? AND owner = ?').bind(shopHandle, owner),
    ]);
  }

  async beginUpdate(
    shopHandle: string,
    candidate: CampaignDraft,
    expectedRevision: number,
    discountId: string,
    nextStatus?: Extract<CampaignStatus, 'active' | 'scheduled'>,
  ): Promise<UpdateLease> {
    if (!shopHandle || !discountId || !Number.isInteger(expectedRevision) || expectedRevision < 1) {
      throw new CampaignValidationError('Shop, expected revision, and confirmed discount ID are required.');
    }
    const owner = await this.acquireShopLock(shopHandle);
    try {
      const current = await this.get(shopHandle, candidate.id);
      if (!current) throw new CampaignConflictError('Campaign not found.');
      if (current.revision !== expectedRevision) throw new CampaignConflictError('Campaign revision has changed.');
      const publication = await this.getPublication(shopHandle, candidate.id);
      if (publication.state === 'needs_reconciliation' || publication.state === 'updating') {
        throw new CampaignConflictError('Publication needs reconciliation before retry.');
      }
      if (publication.state !== 'active' || publication.discountId !== discountId || !['active', 'scheduled'].includes(current.status)) {
        throw new CampaignConflictError('Campaign is not published with the confirmed platform discount.');
      }
      const stagedCandidate: CampaignDraft = { ...normalizeOfferModules(candidate), status: nextStatus ?? current.status };
      const errors = validateCampaign(stagedCandidate);
      if (errors.length) throw new CampaignValidationError(errors.join(' '));
      const existing = await this.rows(shopHandle);
      if (existing.some((item) => item.id !== candidate.id && campaignsConflict(item, stagedCandidate))) {
        throw new CampaignConflictError('Campaign product scope overlaps another enabled campaign.');
      }
      await this.syncOfferIndex?.(this, shopHandle, [current], stagedCandidate, owner);
      await this.assertShopLease(shopHandle, owner);
      await this.database.batch([
        this.database.prepare(`INSERT INTO quantity_breaks_staged_updates
          (shop_handle, campaign_id, candidate_json, expected_revision, discount_id) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(shop_handle, campaign_id) DO UPDATE SET candidate_json = excluded.candidate_json,
          expected_revision = excluded.expected_revision, discount_id = excluded.discount_id`)
          .bind(shopHandle, candidate.id, JSON.stringify(stagedCandidate), expectedRevision, discountId),
        this.database.prepare(`UPDATE quantity_breaks_publications SET state = 'updating', owner = ?, updated_at = ?
          WHERE shop_handle = ? AND campaign_id = ? AND state = 'active' AND discount_id = ?`)
          .bind(owner, nowIso(this.clock), shopHandle, candidate.id, discountId),
      ]);
      const stagedPublication = await this.getPublication(shopHandle, candidate.id);
      if (stagedPublication.state !== 'updating' || stagedPublication.owner !== owner) {
        throw new CampaignConflictError('Campaign publication changed during update staging.');
      }
      return { campaign: stagedCandidate, owner, discountId };
    } catch (error) {
      await this.releasePublicationLock(shopHandle, owner);
      throw error;
    }
  }

  async finishUpdate(shopHandle: string, id: string, expectedRevision: number, discountId: string, owner: string): Promise<Campaign> {
    const lock = await this.database.prepare('SELECT owner, expires_at FROM quantity_breaks_shop_locks WHERE shop_handle = ?').bind(shopHandle).first<{ owner: string; expires_at: number }>();
    if (!lock || lock.owner !== owner || lock.expires_at <= this.clock()) {
      await this.database.prepare(`UPDATE quantity_breaks_publications SET state = 'needs_reconciliation', updated_at = ?
        WHERE shop_handle = ? AND campaign_id = ? AND owner = ?`).bind(nowIso(this.clock), shopHandle, id, owner).run();
      throw new CampaignConflictError('Update lock was lost and needs reconciliation.');
    }
    const current = await this.get(shopHandle, id);
    const publication = await this.getPublication(shopHandle, id);
    const staged = await this.getStagedUpdate(shopHandle, id);
    if (!current || current.revision !== expectedRevision || publication.state !== 'updating' || publication.owner !== owner || publication.discountId !== discountId || !staged || staged.expectedRevision !== expectedRevision || staged.discountId !== discountId) {
      throw new CampaignConflictError('Campaign changed during update.');
    }
    const next: Campaign = { ...staged.candidate, revision: expectedRevision + 1, updatedAt: nowIso(this.clock) };
    const update = await this.database.prepare(`UPDATE quantity_breaks_campaigns SET campaign_json = ?, revision = ?, updated_at = ?
      WHERE shop_handle = ? AND id = ? AND revision = ?`).bind(JSON.stringify(staged.candidate), next.revision, next.updatedAt, shopHandle, id, expectedRevision).run();
    if ((update.meta.changes ?? 0) !== 1) throw new CampaignConflictError('Campaign revision has changed.');
    await this.database.batch([
      this.database.prepare(`UPDATE quantity_breaks_publications SET state = 'active', owner = NULL, updated_at = ?
        WHERE shop_handle = ? AND campaign_id = ? AND owner = ?`).bind(next.updatedAt, shopHandle, id, owner),
      this.database.prepare('DELETE FROM quantity_breaks_staged_updates WHERE shop_handle = ? AND campaign_id = ?').bind(shopHandle, id),
      this.database.prepare('DELETE FROM quantity_breaks_shop_locks WHERE shop_handle = ? AND owner = ?').bind(shopHandle, owner),
    ]);
    return next;
  }

  async markUpdateFailure(shopHandle: string, id: string, uncertain: boolean, owner: string): Promise<void> {
    await this.database.batch([
      this.database.prepare(`UPDATE quantity_breaks_publications SET state = ?, owner = NULL, updated_at = ?
        WHERE shop_handle = ? AND campaign_id = ? AND owner = ?`).bind(uncertain ? 'needs_reconciliation' : 'active', nowIso(this.clock), shopHandle, id, owner),
      ...(uncertain ? [] : [this.database.prepare('DELETE FROM quantity_breaks_staged_updates WHERE shop_handle = ? AND campaign_id = ?').bind(shopHandle, id)]),
      this.database.prepare('DELETE FROM quantity_breaks_shop_locks WHERE shop_handle = ? AND owner = ?').bind(shopHandle, owner),
    ]);
  }

  async delete(shopHandle: string, id: string, expectedRevision: number): Promise<boolean> {
    const owner = await this.acquireShopLock(shopHandle);
    try {
      const campaign = await this.get(shopHandle, id);
      if (!campaign) return false;
      if (campaign.revision !== expectedRevision) throw new CampaignConflictError('Campaign revision has changed.');
      const publication = await this.getPublication(shopHandle, id);
      if (!['idle', 'removed', 'missing', 'entitlement_revoked'].includes(publication.state) || publication.discountId || ['active', 'scheduled'].includes(campaign.status)) {
        throw new CampaignConflictError('Pause or reconcile the published campaign before deletion.');
      }
      const deleted = await this.database.prepare('DELETE FROM quantity_breaks_campaigns WHERE shop_handle = ? AND id = ? AND revision = ?')
        .bind(shopHandle, id, expectedRevision).run();
      if ((deleted.meta.changes ?? 0) !== 1) throw new CampaignConflictError('Campaign revision has changed.');
      await this.database.batch([
        this.database.prepare('DELETE FROM quantity_breaks_publications WHERE shop_handle = ? AND campaign_id = ?').bind(shopHandle, id),
        this.database.prepare('DELETE FROM quantity_breaks_collection_conflicts WHERE shop_handle = ? AND campaign_id = ?').bind(shopHandle, id),
      ]);
      return true;
    } finally {
      await this.releasePublicationLock(shopHandle, owner);
    }
  }

  async end(shopHandle: string, id: string, expectedRevision: number): Promise<Campaign> {
    const owner = await this.acquireShopLock(shopHandle);
    try {
      const campaign = await this.get(shopHandle, id);
      if (!campaign) throw new CampaignConflictError('Campaign not found.');
      if (campaign.revision !== expectedRevision) throw new CampaignConflictError('Campaign revision has changed.');
      const publication = await this.getPublication(shopHandle, id);
      if (!['idle', 'removed', 'missing', 'entitlement_revoked'].includes(publication.state) || publication.discountId || ['active', 'scheduled'].includes(campaign.status)) {
        throw new CampaignConflictError('Pause or reconcile the published campaign before ending.');
      }
      const next: Campaign = { ...campaign, status: 'ended', revision: expectedRevision + 1, updatedAt: nowIso(this.clock) };
      const updated = await this.database.prepare(`UPDATE quantity_breaks_campaigns SET campaign_json = ?, revision = ?, updated_at = ?
        WHERE shop_handle = ? AND id = ? AND revision = ?`).bind(JSON.stringify(next), next.revision, next.updatedAt, shopHandle, id, expectedRevision).run();
      if ((updated.meta.changes ?? 0) !== 1) throw new CampaignConflictError('Campaign revision has changed.');
      return next;
    } finally {
      await this.releasePublicationLock(shopHandle, owner);
    }
  }

  async updateCollectionSnapshot(shopHandle: string, id: string, expectedRevision: number, members: string[]): Promise<void> {
    const campaign = await this.get(shopHandle, id);
    const publication = await this.getPublication(shopHandle, id);
    if (!campaign || campaign.revision !== expectedRevision || campaign.status !== 'active' || campaign.scope.kind !== 'collections' || publication.state !== 'active') throw new CampaignConflictError('Published collection campaign changed during membership refresh.');
    const normalized = JSON.stringify([...new Set(members)].sort());
    const previous = JSON.stringify([...new Set(campaign.scope.resolvedProductIds ?? [])].sort());
    if (normalized === previous) return;
    const result = await this.database.prepare(`UPDATE quantity_breaks_campaigns
      SET campaign_json = json_set(campaign_json, '$.scope.resolvedProductIds', json(?))
      WHERE shop_handle = ? AND id = ? AND revision = ? AND json_extract(campaign_json, '$.status') = 'active'
      AND EXISTS (SELECT 1 FROM quantity_breaks_publications WHERE shop_handle = ? AND campaign_id = ? AND state = 'active')`)
      .bind(normalized, shopHandle, id, expectedRevision, shopHandle, id).run();
    if ((result.meta.changes ?? 0) !== 1) throw new CampaignConflictError('Published collection campaign changed during membership refresh.');
  }

  async setCollectionConflict(shopHandle: string, id: string, state: 'clear' | 'conflict' | 'unknown', campaignIds: string[], syncedAt?: string): Promise<void> {
    await this.database.prepare(`INSERT INTO quantity_breaks_collection_conflicts
      (shop_handle, campaign_id, state, campaign_ids_json, checked_at, synced_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(shop_handle, campaign_id) DO UPDATE SET state = excluded.state,
      campaign_ids_json = excluded.campaign_ids_json, checked_at = excluded.checked_at,
      synced_at = COALESCE(excluded.synced_at, quantity_breaks_collection_conflicts.synced_at)`)
      .bind(shopHandle, id, state, JSON.stringify([...new Set(campaignIds)].sort()), nowIso(this.clock), syncedAt ?? null).run();
  }

  async getCollectionConflict(shopHandle: string, id: string): Promise<CollectionConflict> {
    const row = await this.database.prepare('SELECT state, campaign_ids_json, synced_at FROM quantity_breaks_collection_conflicts WHERE shop_handle = ? AND campaign_id = ?')
      .bind(shopHandle, id).first<CollectionConflictRow>();
    return row ? {
      state: row.state, campaignIds: JSON.parse(row.campaign_ids_json) as string[],
      ...(row.synced_at ? { syncedAt: row.synced_at } : {}),
    } : { state: 'unknown', campaignIds: [] };
  }

  async listShopsWithActiveCollections(): Promise<string[]> {
    const result = await this.database.prepare(`SELECT c.shop_handle, c.campaign_json FROM quantity_breaks_campaigns c
      JOIN quantity_breaks_publications p ON p.shop_handle = c.shop_handle AND p.campaign_id = c.id WHERE p.state = 'active'`).all<{ shop_handle: string; campaign_json: string }>();
    return [...new Set(result.results.filter((row) => (JSON.parse(row.campaign_json) as CampaignDraft).scope.kind === 'collections').map((row) => row.shop_handle))];
  }

  async listRequiredCollectionIds(shopHandle: string, excludingCampaignId = ''): Promise<string[]> {
    const result = await this.database.prepare(`SELECT c.campaign_json FROM quantity_breaks_campaigns c
      JOIN quantity_breaks_publications p ON p.shop_handle = c.shop_handle AND p.campaign_id = c.id
      WHERE c.shop_handle = ? AND p.state <> 'idle' AND c.id <> ?`).bind(shopHandle, excludingCampaignId).all<{ campaign_json: string }>();
    const ids = new Set<string>();
    for (const row of result.results) {
      const scope = (JSON.parse(row.campaign_json) as CampaignDraft).scope;
      if (scope.kind === 'collections') for (const id of scope.collectionIds ?? []) ids.add(id);
    }
    return [...ids].sort();
  }
}
