export const OPERATION_LEASE_MS = 60_000;

export type CampaignOperationType = 'delete' | 'replace_activate' | 'replace_update';
export type CampaignOperationState = 'queued' | 'running' | 'retrying' | 'succeeded' | 'failed' | 'requires_pause';

type BatchRow = {
  id: string;
  shop_handle: string;
  type: CampaignOperationType;
  state: 'queued' | 'running' | 'completed' | 'failed';
  created_at: number;
  updated_at: number;
};
type OperationRow = {
  id: string;
  batch_id: string;
  shop_handle: string;
  campaign_id: string;
  type: CampaignOperationType;
  expected_revision: number;
  candidate_json: string | null;
  state: CampaignOperationState;
  attempts: number;
  lease_expires_at: number | null;
  next_attempt_at: number;
  last_error: string | null;
  created_at: number;
  updated_at: number;
};

export type CampaignOperation = {
  id: string;
  batchId: string;
  handle: string;
  campaignId: string;
  type: CampaignOperationType;
  expectedRevision: number;
  candidate: Record<string, unknown> | null;
  state: CampaignOperationState;
  attempts: number;
  leaseExpiresAt: number | null;
  nextAttemptAt: number;
  lastError: string | null;
};
export type CampaignOperationBatch = {
  id: string;
  handle: string;
  type: CampaignOperationType;
  state: BatchRow['state'];
  operations: CampaignOperation[];
};
export type EnqueueCampaignOperationBatch = {
  handle: string;
  type: CampaignOperationType;
  campaigns: Array<{ campaignId: string; expectedRevision: number; candidate?: Record<string, unknown> | null }>;
};

function decodeOperation(row: OperationRow): CampaignOperation {
  let candidate: Record<string, unknown> | null = null;
  if (row.candidate_json) {
    try {
      const parsed = JSON.parse(row.candidate_json) as unknown;
      candidate = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
    } catch { /* A malformed candidate is handled as a deterministic job failure. */ }
  }
  return {
    id: row.id, batchId: row.batch_id, handle: row.shop_handle, campaignId: row.campaign_id,
    type: row.type, expectedRevision: row.expected_revision, candidate, state: row.state,
    attempts: row.attempts, leaseExpiresAt: row.lease_expires_at, nextAttemptAt: row.next_attempt_at,
    lastError: row.last_error,
  };
}

export class D1CampaignOperationRepository {
  constructor(private readonly database: D1Database, private readonly clock: () => number = Date.now) {}

  async enqueueBatch(input: EnqueueCampaignOperationBatch): Promise<CampaignOperationBatch> {
    if (!input.handle || !input.campaigns.length) throw new Error('A shop and at least one campaign are required.');
    const now = this.clock();
    const id = crypto.randomUUID();
    const statements: D1PreparedStatement[] = [
      this.database.prepare(`INSERT INTO quantity_breaks_campaign_operation_batches
        (id, shop_handle, type, state, created_at, updated_at) VALUES (?, ?, ?, 'queued', ?, ?)`)
        .bind(id, input.handle, input.type, now, now),
    ];
    for (const [position, campaign] of input.campaigns.entries()) {
      if (!campaign.campaignId || !Number.isInteger(campaign.expectedRevision) || campaign.expectedRevision < 0) {
        throw new Error('Campaign ID and expected revision are required.');
      }
      statements.push(this.database.prepare(`INSERT INTO quantity_breaks_campaign_operations
        (id, batch_id, shop_handle, campaign_id, type, expected_revision, candidate_json, state, attempts, lease_expires_at, next_attempt_at, last_error, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', 0, NULL, ?, NULL, ?, ?)`)
        .bind(crypto.randomUUID(), id, input.handle, campaign.campaignId, input.type, campaign.expectedRevision,
          campaign.candidate ? JSON.stringify(campaign.candidate) : null, now, now + position, now + position));
    }
    await this.database.batch(statements);
    const batch = await this.readBatch(input.handle, id);
    if (!batch) throw new Error('Campaign operation batch was not persisted.');
    return batch;
  }

  async readBatch(handle: string, id: string): Promise<CampaignOperationBatch | null> {
    const batch = await this.database.prepare(`SELECT id, shop_handle, type, state, created_at, updated_at
      FROM quantity_breaks_campaign_operation_batches WHERE id = ? AND shop_handle = ?`).bind(id, handle).first<BatchRow>();
    if (!batch) return null;
    const operations = await this.database.prepare(`SELECT id, batch_id, shop_handle, campaign_id, type, expected_revision, candidate_json,
      state, attempts, lease_expires_at, next_attempt_at, last_error, created_at, updated_at
      FROM quantity_breaks_campaign_operations WHERE batch_id = ? ORDER BY created_at, id`).bind(id).all<OperationRow>();
    return { id: batch.id, handle: batch.shop_handle, type: batch.type, state: batch.state, operations: operations.results.map(decodeOperation) };
  }

  async readOperation(id: string): Promise<CampaignOperation | null> {
    const row = await this.database.prepare(`SELECT id, batch_id, shop_handle, campaign_id, type, expected_revision, candidate_json,
      state, attempts, lease_expires_at, next_attempt_at, last_error, created_at, updated_at
      FROM quantity_breaks_campaign_operations WHERE id = ?`).bind(id).first<OperationRow>();
    return row ? decodeOperation(row) : null;
  }

  async claimDue(now: number, limit: number): Promise<CampaignOperation[]> {
    await this.database.prepare(`UPDATE quantity_breaks_campaign_operations
      SET state = 'retrying', lease_expires_at = NULL, next_attempt_at = ?, updated_at = ?
      WHERE state = 'running' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?`).bind(now, this.clock(), now).run();
    const due = await this.database.prepare(`SELECT id, batch_id, shop_handle, campaign_id, type, expected_revision, candidate_json,
      state, attempts, lease_expires_at, next_attempt_at, last_error, created_at, updated_at
      FROM quantity_breaks_campaign_operations
      WHERE state IN ('queued', 'retrying') AND next_attempt_at <= ? ORDER BY next_attempt_at, created_at, id LIMIT ?`)
      .bind(now, Math.max(1, Math.min(limit, 50))).all<OperationRow>();
    const claimed: CampaignOperation[] = [];
    for (const row of due.results) {
      const update = await this.database.prepare(`UPDATE quantity_breaks_campaign_operations
        SET state = 'running', attempts = attempts + 1, lease_expires_at = ?, updated_at = ?
        WHERE id = ? AND state IN ('queued', 'retrying') AND next_attempt_at <= ?
        AND NOT EXISTS (SELECT 1 FROM quantity_breaks_campaign_operations AS running
          WHERE running.shop_handle = quantity_breaks_campaign_operations.shop_handle AND running.state = 'running')`)
        .bind(now + OPERATION_LEASE_MS, this.clock(), row.id, now).run();
      if ((update.meta.changes ?? 0) !== 1) continue;
      await this.database.prepare(`UPDATE quantity_breaks_campaign_operation_batches SET state = 'running', updated_at = ?
        WHERE id = ? AND state = 'queued'`).bind(this.clock(), row.batch_id).run();
      claimed.push({ ...decodeOperation(row), state: 'running', attempts: row.attempts + 1, leaseExpiresAt: now + OPERATION_LEASE_MS });
    }
    return claimed;
  }

  async finish(id: string): Promise<void> {
    await this.database.prepare(`UPDATE quantity_breaks_campaign_operations
      SET state = 'succeeded', lease_expires_at = NULL, last_error = NULL, updated_at = ? WHERE id = ? AND state = 'running'`)
      .bind(this.clock(), id).run();
    await this.refreshBatch(id);
  }

  async retry(id: string, nextAttemptAt: number, message: string, terminal = false): Promise<void> {
    await this.database.prepare(`UPDATE quantity_breaks_campaign_operations
      SET state = ?, lease_expires_at = NULL, next_attempt_at = ?, last_error = ?, updated_at = ? WHERE id = ? AND state = 'running'`)
      .bind(terminal ? 'failed' : 'retrying', nextAttemptAt, message.slice(0, 256), this.clock(), id).run();
    await this.refreshBatch(id);
  }

  async requirePause(id: string, message = 'Current campaign is active. Pause it before deleting.'): Promise<void> {
    await this.database.prepare(`UPDATE quantity_breaks_campaign_operations
      SET state = 'requires_pause', lease_expires_at = NULL, last_error = ?, updated_at = ? WHERE id = ? AND state = 'running'`)
      .bind(message.slice(0, 256), this.clock(), id).run();
    await this.refreshBatch(id);
  }

  private async refreshBatch(operationId: string): Promise<void> {
    const row = await this.database.prepare('SELECT batch_id FROM quantity_breaks_campaign_operations WHERE id = ?').bind(operationId).first<{ batch_id: string }>();
    if (!row) return;
    const states = await this.database.prepare('SELECT state FROM quantity_breaks_campaign_operations WHERE batch_id = ?').bind(row.batch_id).all<{ state: CampaignOperationState }>();
    const values = states.results.map((entry) => entry.state);
    const state: BatchRow['state'] = values.every((value) => value === 'succeeded' || value === 'requires_pause')
      ? 'completed' : values.some((value) => value === 'failed') ? 'failed' : 'running';
    await this.database.prepare('UPDATE quantity_breaks_campaign_operation_batches SET state = ?, updated_at = ? WHERE id = ?')
      .bind(state, this.clock(), row.batch_id).run();
  }
}
