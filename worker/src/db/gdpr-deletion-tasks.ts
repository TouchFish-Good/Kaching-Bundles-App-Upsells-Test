export type GdprDeletionKind = 'customer_redact' | 'merchant_redact';
export type GdprDeletionState = 'pending' | 'running' | 'completed' | 'retrying' | 'failed';

type TaskRow = {
  webhook_id: string; kind: GdprDeletionKind; store_id: string; shop_domain: string | null; handle_snapshot: string | null; customer_id_digest: string | null;
  state: GdprDeletionState; received_at: number; deadline_at: number; completed_at: number | null;
  attempts: number; next_attempt_at: number; last_error_code: string | null;
};

export type GdprDeletionTask = {
  webhookId: string; kind: GdprDeletionKind; storeId: string; shopDomain: string | null; handleSnapshot: string | null; customerIdDigest: string | null;
  state: GdprDeletionState; receivedAt: number; deadlineAt: number; completedAt: number | null;
  attempts: number; nextAttemptAt: number; lastErrorCode: string | null;
};

export type CreateVerifiedGdprTask = {
  webhookId: string; kind: GdprDeletionKind; storeId: string; shopDomain: string; customerIdDigest?: string; receivedAt: number;
};

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function decode(row: TaskRow): GdprDeletionTask {
  return { webhookId: row.webhook_id, kind: row.kind, storeId: row.store_id, shopDomain: row.shop_domain, handleSnapshot: row.handle_snapshot, customerIdDigest: row.customer_id_digest,
    state: row.state, receivedAt: row.received_at, deadlineAt: row.deadline_at, completedAt: row.completed_at,
    attempts: row.attempts, nextAttemptAt: row.next_attempt_at, lastErrorCode: row.last_error_code };
}

function handleFromShopDomain(shopDomain: string): string {
  return shopDomain.replace(/\.myshopline\.com$/i, '');
}

export class D1GdprDeletionTasks {
  constructor(private readonly database: D1Database, private readonly clock: () => number = Date.now) {}

  async createVerified(input: CreateVerifiedGdprTask): Promise<void> {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(input.webhookId) || !/^[0-9]{1,128}$/.test(input.storeId) || !Number.isFinite(input.receivedAt)) throw new Error('INVALID_GDPR_TASK');
    await this.database.prepare(`INSERT INTO gdpr_deletion_tasks
      (webhook_id, kind, store_id, shop_domain, handle_snapshot, customer_id_digest, state, received_at, deadline_at, completed_at, attempts, next_attempt_at, last_error_code)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, NULL, 0, ?, NULL) ON CONFLICT(webhook_id) DO NOTHING`)
      .bind(input.webhookId, input.kind, input.storeId, input.shopDomain, input.kind === 'merchant_redact' ? handleFromShopDomain(input.shopDomain) : null, input.customerIdDigest ?? null, input.receivedAt, input.receivedAt + THIRTY_DAYS_MS, input.receivedAt).run();
  }

  async get(webhookId: string): Promise<GdprDeletionTask | null> {
    const row = await this.database.prepare('SELECT * FROM gdpr_deletion_tasks WHERE webhook_id = ?').bind(webhookId).first<TaskRow>();
    return row ? decode(row) : null;
  }

  async claimDue(now = this.clock(), limit = 20): Promise<GdprDeletionTask[]> {
    const due = await this.database.prepare(`SELECT webhook_id FROM gdpr_deletion_tasks
      WHERE state IN ('pending', 'retrying') AND next_attempt_at <= ? AND deadline_at >= ? ORDER BY next_attempt_at, webhook_id LIMIT ?`)
      .bind(now, now, Math.max(1, Math.min(limit, 100))).all<{ webhook_id: string }>();
    const claimed: GdprDeletionTask[] = [];
    for (const row of due.results) {
      const updated = await this.database.prepare(`UPDATE gdpr_deletion_tasks SET state = 'running', attempts = attempts + 1, last_error_code = NULL
        WHERE webhook_id = ? AND state IN ('pending', 'retrying') AND next_attempt_at <= ?`).bind(row.webhook_id, now).run();
      if ((updated.meta.changes ?? 0) !== 1) continue;
      const task = await this.get(row.webhook_id);
      if (task) claimed.push(task);
    }
    return claimed;
  }

  async complete(webhookId: string, completedAt = this.clock()): Promise<void> {
    await this.database.prepare(`UPDATE gdpr_deletion_tasks SET state = 'completed', shop_domain = NULL, completed_at = ?, next_attempt_at = ?, last_error_code = NULL
      WHERE webhook_id = ? AND state = 'running'`).bind(completedAt, completedAt, webhookId).run();
  }

  async retry(webhookId: string, errorCode: string, nextAttemptAt: number): Promise<void> {
    await this.database.prepare(`UPDATE gdpr_deletion_tasks SET state = 'retrying', last_error_code = ?, next_attempt_at = ?
      WHERE webhook_id = ? AND state = 'running'`).bind(errorCode, nextAttemptAt, webhookId).run();
  }

  async requestRetry(webhookId: string, now = this.clock()): Promise<GdprDeletionTask | null> {
    const result = await this.database.prepare(`UPDATE gdpr_deletion_tasks SET state = 'pending', next_attempt_at = ?, last_error_code = NULL
      WHERE webhook_id = ? AND state IN ('pending', 'retrying', 'failed')`).bind(now, webhookId).run();
    return (result.meta.changes ?? 0) === 1 ? this.get(webhookId) : null;
  }

  async list(input: { kind?: GdprDeletionKind; state?: GdprDeletionState; storeId?: string; limit: number; offset: number }): Promise<{ total: number; items: GdprDeletionTask[] }> {
    const clauses: string[] = []; const values: unknown[] = [];
    if (input.kind) { clauses.push('kind = ?'); values.push(input.kind); }
    if (input.state) { clauses.push('state = ?'); values.push(input.state); }
    if (input.storeId) { clauses.push('store_id = ?'); values.push(input.storeId); }
    const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
    const [count, rows] = await Promise.all([
      this.database.prepare(`SELECT count(*) AS total FROM gdpr_deletion_tasks${where}`).bind(...values).first<{ total: number }>(),
      this.database.prepare(`SELECT * FROM gdpr_deletion_tasks${where} ORDER BY received_at DESC, webhook_id DESC LIMIT ? OFFSET ?`)
        .bind(...values, Math.max(1, Math.min(input.limit, 100)), Math.max(0, input.offset)).all<TaskRow>(),
    ]);
    return { total: Number(count?.total ?? 0), items: rows.results.map(decode) };
  }

  async purgeExpired(now = this.clock()): Promise<void> {
    await this.database.prepare('DELETE FROM gdpr_deletion_tasks WHERE completed_at IS NOT NULL AND completed_at <= ?').bind(now - THIRTY_DAYS_MS).run();
  }
}
