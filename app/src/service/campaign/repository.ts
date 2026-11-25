import { normalizeOfferModules } from '../../../../shared/offer-core.cjs';
import type { Database } from 'sqlite3';
import { randomUUID } from 'node:crypto';
import type { Campaign, CampaignDraft } from './model';
import { campaignCurrencyConflict, campaignsConflict, validateCampaign } from './validate';

export class CampaignValidationError extends Error {}
export class CampaignConflictError extends Error {}
type Row = { campaign_json: string; revision: number; updated_at: string };
export type PublicationState = 'idle' | 'publishing' | 'active' | 'updating' | 'unpublishing' | 'needs_reconciliation';
export type Publication = { state: PublicationState; discountId: string | null };

export class CampaignRepository {
  private ready: Promise<void>;
  private pending: Promise<unknown> = Promise.resolve();

  constructor(private db: Database) {
    this.ready = this.run('CREATE TABLE IF NOT EXISTS quantity_breaks_campaigns (shop_handle TEXT NOT NULL, id TEXT NOT NULL, campaign_json TEXT NOT NULL, revision INTEGER NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (shop_handle, id))')
      .then(() => this.run('CREATE TABLE IF NOT EXISTS quantity_breaks_publications (shop_handle TEXT NOT NULL, campaign_id TEXT NOT NULL, state TEXT NOT NULL, discount_id TEXT, PRIMARY KEY (shop_handle, campaign_id))'))
      .then(() => this.run('CREATE TABLE IF NOT EXISTS quantity_breaks_shop_locks (shop_handle TEXT PRIMARY KEY, owner TEXT NOT NULL, expires_at INTEGER NOT NULL)'))
      .then(() => this.run('CREATE TABLE IF NOT EXISTS quantity_breaks_collection_conflicts (shop_handle TEXT NOT NULL, campaign_id TEXT NOT NULL, state TEXT NOT NULL, campaign_ids_json TEXT NOT NULL, checked_at TEXT NOT NULL, PRIMARY KEY (shop_handle, campaign_id))'))
      .then(() => this.run('CREATE TABLE IF NOT EXISTS quantity_breaks_staged_updates (shop_handle TEXT NOT NULL, campaign_id TEXT NOT NULL, candidate_json TEXT NOT NULL, expected_revision INTEGER NOT NULL, discount_id TEXT NOT NULL, PRIMARY KEY (shop_handle, campaign_id))'));
  }

  private run(sql: string, parameters: unknown[] = []): Promise<void> {
    return new Promise((resolve, reject) => this.db.run(sql, parameters, (error) => error ? reject(error) : resolve()));
  }

  private runChanges(sql: string, parameters: unknown[] = []): Promise<number> {
    return new Promise((resolve, reject) => this.db.run(sql, parameters, function (error) { error ? reject(error) : resolve(this.changes); }));
  }

  async withShopPublicationLock<T>(shopHandle: string, action: (assertHeld: () => Promise<void>) => Promise<T>): Promise<T> {
    await this.ready;
    const owner = randomUUID();
    const deadline = Date.now() + 30000;
    let acquired = false;
    while (Date.now() < deadline) {
      const now = Date.now();
      acquired = (await this.runChanges(`INSERT INTO quantity_breaks_shop_locks (shop_handle, owner, expires_at) VALUES (?, ?, ?)
        ON CONFLICT(shop_handle) DO UPDATE SET owner = excluded.owner, expires_at = excluded.expires_at
        WHERE quantity_breaks_shop_locks.expires_at < ?`, [shopHandle, owner, now + 60000, now])) === 1;
      if (acquired) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    if (!acquired) throw new CampaignConflictError('Another publication is already in progress for this shop.');
    let lost = false;
    const heartbeat = setInterval(() => {
      this.runChanges('UPDATE quantity_breaks_shop_locks SET expires_at = ? WHERE shop_handle = ? AND owner = ?', [Date.now() + 60000, shopHandle, owner])
        .then((changes) => { if (changes !== 1) lost = true; }, () => { lost = true; });
    }, 20000);
    heartbeat.unref();
    const assertHeld = async () => {
      const row = await this.getRow('SELECT owner FROM quantity_breaks_shop_locks WHERE shop_handle = ?', [shopHandle]) as unknown as { owner: string } | undefined;
      if (lost || row?.owner !== owner) throw new CampaignConflictError('Shop publication lock was lost; reconcile before retry.');
    };
    try {
      const result = await action(assertHeld);
      await assertHeld();
      return result;
    } finally {
      clearInterval(heartbeat);
      await this.run('DELETE FROM quantity_breaks_shop_locks WHERE shop_handle = ? AND owner = ?', [shopHandle, owner]);
    }
  }

  private getRow(sql: string, parameters: unknown[]): Promise<Row | undefined> {
    return new Promise((resolve, reject) => this.db.get(sql, parameters, (error, row) => error ? reject(error) : resolve(row as Row | undefined)));
  }

  private getRows(sql: string, parameters: unknown[]): Promise<Row[]> {
    return new Promise((resolve, reject) => this.db.all(sql, parameters, (error, rows) => error ? reject(error) : resolve(rows as Row[])));
  }

  private decode(row: Row): Campaign {
    return { ...normalizeOfferModules(JSON.parse(row.campaign_json) as CampaignDraft), revision: row.revision, updatedAt: row.updated_at };
  }

  async list(shopHandle: string): Promise<Campaign[]> {
    await this.ready;
    return (await this.getRows('SELECT campaign_json, revision, updated_at FROM quantity_breaks_campaigns WHERE shop_handle = ? ORDER BY updated_at DESC', [shopHandle])).map((row) => this.decode(row));
  }

  async get(shopHandle: string, id: string): Promise<Campaign | undefined> {
    await this.ready;
    const row = await this.getRow('SELECT campaign_json, revision, updated_at FROM quantity_breaks_campaigns WHERE shop_handle = ? AND id = ?', [shopHandle, id]);
    return row ? this.decode(row) : undefined;
  }

  async getPublication(shopHandle: string, id: string): Promise<Publication> {
    await this.ready;
    const row = await this.getRow('SELECT state, discount_id FROM quantity_breaks_publications WHERE shop_handle = ? AND campaign_id = ?', [shopHandle, id]) as unknown as { state: PublicationState; discount_id: string | null } | undefined;
    return row ? { state: row.state, discountId: row.discount_id } : { state: 'idle', discountId: null };
  }

  async getStagedUpdate(shopHandle: string, id: string): Promise<{ candidate: CampaignDraft; expectedRevision: number; discountId: string } | null> {
    await this.ready;
    const row = await this.getRow('SELECT candidate_json, expected_revision, discount_id FROM quantity_breaks_staged_updates WHERE shop_handle = ? AND campaign_id = ?', [shopHandle, id]) as unknown as { candidate_json: string; expected_revision: number; discount_id: string } | undefined;
    return row ? { candidate: normalizeOfferModules(JSON.parse(row.candidate_json) as CampaignDraft), expectedRevision: row.expected_revision, discountId: row.discount_id } : null;
  }

  async beginUpdate(shopHandle: string, candidate: CampaignDraft, expectedRevision: number, discountId: string): Promise<void> {
    const errors = validateCampaign(candidate);
    if (errors.length) throw new CampaignValidationError(errors.join(' '));
    candidate = normalizeOfferModules(candidate);
    await this.ready;
    await this.enqueue(async () => {
      await this.run('BEGIN IMMEDIATE');
      try {
        const rows = await this.getRows('SELECT campaign_json, revision, updated_at FROM quantity_breaks_campaigns WHERE shop_handle = ?', [shopHandle]);
        const campaigns = rows.map((row) => this.decode(row));
        const current = campaigns.find((item) => item.id === candidate.id);
        if (!current || current.revision !== expectedRevision) throw new CampaignConflictError('Campaign revision has changed.');
        const publication = await this.getPublication(shopHandle, candidate.id);
        if (publication.state !== 'active' || publication.discountId !== discountId || !['active', 'scheduled'].includes(current.status)) throw new CampaignConflictError('Published discount needs reconciliation before update.');
        if (candidate.status !== current.status) throw new CampaignConflictError('Campaign status cannot change during update.');
        if (campaigns.some((item) => item.id !== candidate.id && campaignsConflict(item, candidate))) throw new CampaignConflictError('Campaign product scope overlaps another enabled campaign.');
        if (campaigns.some((item) => item.id !== candidate.id && campaignCurrencyConflict(item, candidate))) throw new CampaignConflictError('Campaign currency modes conflict with another enabled Function rule.');
        await this.run('INSERT INTO quantity_breaks_staged_updates (shop_handle, campaign_id, candidate_json, expected_revision, discount_id) VALUES (?, ?, ?, ?, ?)', [shopHandle, candidate.id, JSON.stringify(candidate), expectedRevision, discountId]);
        await this.run('UPDATE quantity_breaks_publications SET state = ? WHERE shop_handle = ? AND campaign_id = ?', ['updating', shopHandle, candidate.id]);
        await this.run('COMMIT');
      } catch (error) { await this.run('ROLLBACK'); throw error; }
    });
  }

  async finishUpdate(shopHandle: string, id: string, expectedRevision: number, discountId: string): Promise<Campaign> {
    await this.ready;
    return this.enqueue(async () => {
      await this.run('BEGIN IMMEDIATE');
      try {
        const row = await this.getRow('SELECT campaign_json, revision, updated_at FROM quantity_breaks_campaigns WHERE shop_handle = ? AND id = ?', [shopHandle, id]);
        const staged = await this.getStagedUpdate(shopHandle, id);
        const publication = await this.getPublication(shopHandle, id);
        if (!row || row.revision !== expectedRevision || !staged || staged.expectedRevision !== expectedRevision || staged.discountId !== discountId || publication.state !== 'updating' || publication.discountId !== discountId) throw new CampaignConflictError('Campaign update needs reconciliation.');
        const next: Campaign = { ...staged.candidate, status: this.decode(row).status, revision: expectedRevision + 1, updatedAt: new Date().toISOString() };
        await this.run('UPDATE quantity_breaks_campaigns SET campaign_json = ?, revision = ?, updated_at = ? WHERE shop_handle = ? AND id = ?', [JSON.stringify(next), next.revision, next.updatedAt, shopHandle, id]);
        await this.run('DELETE FROM quantity_breaks_staged_updates WHERE shop_handle = ? AND campaign_id = ?', [shopHandle, id]);
        await this.run('UPDATE quantity_breaks_publications SET state = ? WHERE shop_handle = ? AND campaign_id = ?', ['active', shopHandle, id]);
        await this.run('COMMIT');
        return next;
      } catch (error) { await this.run('ROLLBACK'); throw error; }
    });
  }

  async markUpdateFailure(shopHandle: string, id: string, uncertain: boolean): Promise<void> {
    await this.ready;
    await this.enqueue(async () => {
      await this.run('BEGIN IMMEDIATE');
      try {
        if (!uncertain) await this.run('DELETE FROM quantity_breaks_staged_updates WHERE shop_handle = ? AND campaign_id = ?', [shopHandle, id]);
        await this.run('UPDATE quantity_breaks_publications SET state = ? WHERE shop_handle = ? AND campaign_id = ? AND state = ?', [uncertain ? 'needs_reconciliation' : 'active', shopHandle, id, 'updating']);
        await this.run('COMMIT');
      } catch (error) { await this.run('ROLLBACK'); throw error; }
    });
  }

  async listRequiredCollectionIds(shopHandle: string, excludingCampaignId?: string): Promise<string[]> {
    await this.ready;
    const rows = await this.getRows(`SELECT c.campaign_json, c.revision, c.updated_at
      FROM quantity_breaks_campaigns c JOIN quantity_breaks_publications p
      ON p.shop_handle = c.shop_handle AND p.campaign_id = c.id
      WHERE c.shop_handle = ? AND p.state <> 'idle' AND c.id <> ?`, [shopHandle, excludingCampaignId || '']);
    const ids = new Set<string>();
    for (const row of rows) {
      const scope = this.decode(row).scope;
      if (scope.kind === 'collections') for (const id of scope.collectionIds || []) ids.add(id);
    }
    return [...ids].sort();
  }

  async listShopsWithActiveCollections(): Promise<string[]> {
    await this.ready;
    const rows = await this.getRows(`SELECT c.shop_handle, c.campaign_json FROM quantity_breaks_campaigns c
      JOIN quantity_breaks_publications p ON p.shop_handle = c.shop_handle AND p.campaign_id = c.id
      WHERE p.state = 'active'`, []) as unknown as { shop_handle: string; campaign_json: string }[];
    return [...new Set(rows.filter((row) => (JSON.parse(row.campaign_json) as CampaignDraft).scope.kind === 'collections').map((row) => row.shop_handle))];
  }

  async updateCollectionSnapshot(shopHandle: string, id: string, members: string[]): Promise<void> {
    await this.ready;
    await this.enqueue(async () => {
      const row = await this.getRow(`SELECT c.campaign_json, c.revision, c.updated_at FROM quantity_breaks_campaigns c
        JOIN quantity_breaks_publications p ON p.shop_handle = c.shop_handle AND p.campaign_id = c.id
        WHERE c.shop_handle = ? AND c.id = ? AND p.state = 'active'`, [shopHandle, id]);
      if (!row) throw new CampaignConflictError('Published collection campaign changed during membership refresh.');
      const campaign = this.decode(row);
      if (campaign.scope.kind !== 'collections') throw new CampaignConflictError('Campaign is not a collection campaign.');
      await this.run('UPDATE quantity_breaks_campaigns SET campaign_json = ? WHERE shop_handle = ? AND id = ?', [JSON.stringify({ ...campaign, scope: { ...campaign.scope, resolvedProductIds: [...new Set(members)].sort() } }), shopHandle, id]);
    });
  }

  async setCollectionConflict(shopHandle: string, id: string, state: 'clear' | 'conflict' | 'unknown', campaignIds: string[]): Promise<void> {
    await this.ready;
    await this.run(`INSERT INTO quantity_breaks_collection_conflicts (shop_handle, campaign_id, state, campaign_ids_json, checked_at)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(shop_handle, campaign_id) DO UPDATE SET
      state = excluded.state, campaign_ids_json = excluded.campaign_ids_json, checked_at = excluded.checked_at`,
    [shopHandle, id, state, JSON.stringify([...new Set(campaignIds)].sort()), new Date().toISOString()]);
  }

  async getCollectionConflict(shopHandle: string, id: string): Promise<{ state: 'clear' | 'conflict' | 'unknown'; campaignIds: string[] }> {
    await this.ready;
    const row = await this.getRow('SELECT state, campaign_ids_json FROM quantity_breaks_collection_conflicts WHERE shop_handle = ? AND campaign_id = ?', [shopHandle, id]) as unknown as { state: 'clear' | 'conflict' | 'unknown'; campaign_ids_json: string } | undefined;
    return row ? { state: row.state, campaignIds: JSON.parse(row.campaign_ids_json) as string[] } : { state: 'unknown', campaignIds: [] };
  }

  async beginPublication(shopHandle: string, id: string, expectedRevision: number, action: 'publish' | 'pause', resolvedProductIds?: string[]): Promise<Campaign> {
    await this.ready;
    return this.enqueue(async () => {
      await this.run('BEGIN IMMEDIATE');
      try {
        const rows = await this.getRows('SELECT c.campaign_json, c.revision, c.updated_at, p.state AS publication_state FROM quantity_breaks_campaigns c LEFT JOIN quantity_breaks_publications p ON p.shop_handle = c.shop_handle AND p.campaign_id = c.id WHERE c.shop_handle = ?', [shopHandle]) as (Row & { publication_state?: PublicationState })[];
        const campaigns = rows.map((row) => ({
          ...this.decode(row),
          ...(row.publication_state && row.publication_state !== 'idle' ? { status: 'active' as const } : {}),
        }));
        const campaign = campaigns.find((item) => item.id === id);
        if (!campaign) throw new CampaignConflictError('Campaign not found.');
        if (campaign.revision !== expectedRevision) throw new CampaignConflictError('Campaign revision has changed.');
        const publication = await this.getPublication(shopHandle, id);
        if (publication.state === 'needs_reconciliation' || publication.state === 'publishing' || publication.state === 'updating' || publication.state === 'unpublishing') throw new CampaignConflictError('Publication needs reconciliation before retry.');
        if (action === 'publish') {
          if (!['draft', 'paused', 'ended'].includes(campaign.status) || publication.discountId) throw new CampaignConflictError('Campaign is already active or has a platform discount.');
          if (campaign.scope.kind === 'collections' && (!resolvedProductIds || !resolvedProductIds.length || resolvedProductIds.some((productId) => typeof productId !== 'string' || !productId.trim()))) {
            throw new CampaignConflictError('Collection membership verification is required before publication.');
          }
          if (campaign.startsAt && Date.parse(campaign.startsAt) > Date.now()) throw new CampaignConflictError('Future startsAt requires scheduled publication, which is not available yet.');
          if (campaign.endsAt && Date.parse(campaign.endsAt) <= Date.now()) throw new CampaignConflictError('Campaign has already ended and cannot be published.');
          const candidate: Campaign = { ...campaign, status: 'active', scope: campaign.scope.kind === 'collections'
            ? { ...campaign.scope, resolvedProductIds: [...new Set(resolvedProductIds)] }
            : campaign.scope };
          const errors = validateCampaign(candidate);
          if (errors.length) throw new CampaignValidationError(errors.join(' '));
          if (campaigns.some((item) => item.id !== id && campaignsConflict(item, candidate))) throw new CampaignConflictError('Campaign product scope overlaps another enabled campaign.');
          if (campaigns.some((item) => item.id !== id && campaignCurrencyConflict(item, candidate))) throw new CampaignConflictError('Campaign currency modes conflict with another enabled Function rule.');
          if (campaigns.filter((item) => item.id !== id && (item.status === 'active' || item.status === 'scheduled')).length >= 35) throw new CampaignConflictError('A SHOPLINE Function supports at most 35 enabled rules.');
          if (campaign.scope.kind === 'collections') {
            await this.run('UPDATE quantity_breaks_campaigns SET campaign_json = ? WHERE shop_handle = ? AND id = ?', [JSON.stringify({ ...candidate, status: campaign.status }), shopHandle, id]);
            campaign.scope = candidate.scope;
          }
        } else if (campaign.status !== 'active' || !publication.discountId || publication.state !== 'active') throw new CampaignConflictError('Campaign is not published.');
        await this.run('INSERT INTO quantity_breaks_publications (shop_handle, campaign_id, state, discount_id) VALUES (?, ?, ?, ?) ON CONFLICT(shop_handle, campaign_id) DO UPDATE SET state = excluded.state', [shopHandle, id, action === 'publish' ? 'publishing' : 'unpublishing', publication.discountId]);
        await this.run('COMMIT');
        return campaign;
      } catch (error) { await this.run('ROLLBACK'); throw error; }
    });
  }

  async finishPublication(shopHandle: string, id: string, expectedRevision: number, action: 'publish' | 'pause', discountId: string | null): Promise<Campaign> {
    await this.ready;
    return this.enqueue(async () => {
      await this.run('BEGIN IMMEDIATE');
      try {
        const row = await this.getRow('SELECT campaign_json, revision, updated_at FROM quantity_breaks_campaigns WHERE shop_handle = ? AND id = ?', [shopHandle, id]);
        if (!row || row.revision !== expectedRevision) throw new CampaignConflictError('Campaign revision changed during publication.');
        const publication = await this.getPublication(shopHandle, id);
        if (publication.state !== (action === 'publish' ? 'publishing' : 'unpublishing')) throw new CampaignConflictError('Publication transition is not in progress.');
        if (action === 'publish' && !discountId) throw new CampaignValidationError('Confirmed platform discount ID is required.');
        const campaign = this.decode(row);
        const next: Campaign = { ...campaign, status: action === 'publish' ? 'active' : 'paused', revision: expectedRevision + 1, updatedAt: new Date().toISOString() };
        await this.run('UPDATE quantity_breaks_campaigns SET campaign_json = ?, revision = ?, updated_at = ? WHERE shop_handle = ? AND id = ?', [JSON.stringify(next), next.revision, next.updatedAt, shopHandle, id]);
        await this.run('UPDATE quantity_breaks_publications SET state = ?, discount_id = ? WHERE shop_handle = ? AND campaign_id = ?', [action === 'publish' ? 'active' : 'idle', discountId, shopHandle, id]);
        await this.run('COMMIT');
        return next;
      } catch (error) { await this.run('ROLLBACK'); throw error; }
    });
  }

  async markPublicationFailure(shopHandle: string, id: string, uncertain: boolean, action: 'publish' | 'pause'): Promise<void> {
    await this.ready;
    await this.enqueue(async () => {
      const state = uncertain ? 'needs_reconciliation' : action === 'publish' ? 'idle' : 'active';
      await this.run('UPDATE quantity_breaks_publications SET state = ? WHERE shop_handle = ? AND campaign_id = ?', [state, shopHandle, id]);
    });
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.pending.then(task);
    this.pending = result.catch(() => undefined);
    return result;
  }

  async save(shopHandle: string, draft: CampaignDraft, expectedRevision: number): Promise<Campaign> {
    const errors = validateCampaign(draft);
    if (errors.length) throw new CampaignValidationError(errors.join(' '));
    draft = normalizeOfferModules(draft);
    if (!shopHandle || !Number.isInteger(expectedRevision) || expectedRevision < 0) throw new CampaignValidationError('Shop and expected revision are required.');
    await this.ready;
    return this.enqueue(async () => {
      await this.run('BEGIN IMMEDIATE');
      try {
        const rows = await this.getRows('SELECT campaign_json, revision, updated_at FROM quantity_breaks_campaigns WHERE shop_handle = ?', [shopHandle]);
        const existing = rows.map((row) => this.decode(row));
        const current = existing.find((campaign) => campaign.id === draft.id);
        if ((current?.revision || 0) !== expectedRevision) throw new CampaignConflictError('Campaign revision has changed.');
        const publication = await this.getPublication(shopHandle, draft.id);
        if (current && (current.status === 'active' || current.status === 'scheduled') && (publication.state !== 'active' || !publication.discountId)) throw new CampaignConflictError('Published campaign needs reconciliation before editing.');
        if (publication.state === 'needs_reconciliation' || publication.state === 'publishing' || publication.state === 'updating' || publication.state === 'unpublishing') throw new CampaignConflictError('Publication needs reconciliation before editing.');
        const preserved = { ...draft, status: current?.status ?? draft.status };
        if (existing.some((campaign) => campaign.id !== draft.id && campaignsConflict(campaign, preserved))) throw new CampaignConflictError('Campaign product scope overlaps another enabled campaign.');
        if (existing.some((campaign) => campaign.id !== draft.id && campaignCurrencyConflict(campaign, preserved))) throw new CampaignConflictError('Campaign currency modes conflict with another enabled Function rule.');
        if ((preserved.status === 'active' || preserved.status === 'scheduled') && existing.filter((campaign) => campaign.id !== draft.id && (campaign.status === 'active' || campaign.status === 'scheduled')).length >= 35) {
          throw new CampaignConflictError('A SHOPLINE Function supports at most 35 enabled rules.');
        }
        const revision = expectedRevision + 1;
        const updatedAt = new Date().toISOString();
        await this.run('INSERT INTO quantity_breaks_campaigns (shop_handle, id, campaign_json, revision, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(shop_handle, id) DO UPDATE SET campaign_json = excluded.campaign_json, revision = excluded.revision, updated_at = excluded.updated_at', [shopHandle, draft.id, JSON.stringify(preserved), revision, updatedAt]);
        await this.run('COMMIT');
        return { ...preserved, revision, updatedAt };
      } catch (error) { await this.run('ROLLBACK'); throw error; }
    });
  }

  async delete(shopHandle: string, id: string, expectedRevision: number): Promise<boolean> {
    await this.ready;
    return this.enqueue(async () => {
      await this.run('BEGIN IMMEDIATE');
      try {
        const row = await this.getRow('SELECT campaign_json, revision, updated_at FROM quantity_breaks_campaigns WHERE shop_handle = ? AND id = ?', [shopHandle, id]);
        if (!row) { await this.run('COMMIT'); return false; }
        if (row.revision !== expectedRevision) throw new CampaignConflictError('Campaign revision has changed.');
        const publication = await this.getPublication(shopHandle, id);
        if (publication.state !== 'idle' || publication.discountId || ['active', 'scheduled'].includes(this.decode(row).status)) throw new CampaignConflictError('Pause or reconcile the published campaign before deletion.');
        await this.run('DELETE FROM quantity_breaks_campaigns WHERE shop_handle = ? AND id = ?', [shopHandle, id]);
        await this.run('COMMIT');
        return true;
      } catch (error) { await this.run('ROLLBACK'); throw error; }
    });
  }

  async end(shopHandle: string, id: string, expectedRevision: number): Promise<Campaign> {
    await this.ready;
    return this.enqueue(async () => {
      await this.run('BEGIN IMMEDIATE');
      try {
        const row = await this.getRow('SELECT campaign_json, revision, updated_at FROM quantity_breaks_campaigns WHERE shop_handle = ? AND id = ?', [shopHandle, id]);
        if (!row) throw new CampaignConflictError('Campaign not found.');
        if (row.revision !== expectedRevision) throw new CampaignConflictError('Campaign revision has changed.');
        const campaign = this.decode(row);
        const next: Campaign = { ...campaign, status: 'ended', revision: expectedRevision + 1, updatedAt: new Date().toISOString() };
        await this.run('UPDATE quantity_breaks_campaigns SET campaign_json = ?, revision = ?, updated_at = ? WHERE shop_handle = ? AND id = ?', [JSON.stringify(next), next.revision, next.updatedAt, shopHandle, id]);
        await this.run('COMMIT');
        return next;
      } catch (error) { await this.run('ROLLBACK'); throw error; }
    });
  }
}
