import type { SubscriptionRecord } from '../services/subscriptions';
import { selectStoreSubscription } from '../domain/store-subscription';

export type EntitlementState = 'unknown' | 'trial' | 'active' | 'grace' | 'review_pending' | 'inactive';
export type SubscriptionOperationKind = 'reconcile' | 'pause_campaign' | 'disable_storefront' | 'resume_check';
export type SubscriptionOperationState = 'pending' | 'running' | 'succeeded' | 'retrying' | 'blocked' | 'failed';

type Clock = () => number;
type EntitlementLease = { key: string; owner: string; appKey: string; handle: string };
const ENTITLEMENT_LEASE_MS = 20 * 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const OPERATION_TIMEOUT_MS = 15 * 60 * 1000;
type EntitlementRow = {
  app_key: string; shop_handle: string; state: EntitlementState; feature_keys_json: string; active_subscription_id: string | null; active_spu_key: string | null;
  valid_from: number | null; valid_until: number | null; next_valid_from: number | null; next_valid_until: number | null; next_display_from: number | null; next_display_until: number | null; grace_until: number | null; auto_recurring: number | null; absence_confirmations: number; last_verified_at: number; version: number;
};
type OperationRow = {
  operation_key: string; app_key: string; shop_handle: string; entitlement_version: number; kind: SubscriptionOperationKind; state: SubscriptionOperationState;
  attempts: number; next_attempt_at: number; last_error: string | null; campaign_id: string | null;
};

export type Entitlement = {
  appKey: string; handle: string; state: EntitlementState; featureKeys: string[]; activeSubscriptionId: string | null; activeSpuKey: string | null;
  validFrom: number | null; validUntil: number | null; nextValidFrom: number | null; nextValidUntil: number | null; nextDisplayFrom?: number | null; nextDisplayUntil?: number | null; graceUntil: number | null; autoRecurring: boolean | null; absenceConfirmations: number; lastVerifiedAt: number; version: number;
};
export type WriteEntitlement = Omit<Entitlement, 'lastVerifiedAt' | 'version' | 'nextValidFrom' | 'nextValidUntil'> & Partial<Pick<Entitlement, 'nextValidFrom' | 'nextValidUntil'>>;
export type SubscriptionOperation = {
  operationKey: string; appKey: string; handle: string; entitlementVersion: number; kind: SubscriptionOperationKind; state: SubscriptionOperationState;
  attempts: number; nextAttemptAt: number; lastError: string | null; campaignId: string | null;
};
export type SubscriptionOrder = {
  outTradeNo: string;
  appKey: string;
  handle: string;
  spuKey: 'ultra';
  skuId: string;
  status: string;
  subscriptionId: string | null;
  createdAt: number;
  updatedAt: number;
};
export type EnqueueSubscriptionOperation = Omit<SubscriptionOperation, 'state' | 'attempts' | 'lastError'>;

function decodeEntitlement(row: EntitlementRow): Entitlement {
  let featureKeys: string[] = [];
  try { featureKeys = JSON.parse(row.feature_keys_json) as string[]; } catch { /* Invalid rows never grant access. */ }
  return {
    appKey: row.app_key, handle: row.shop_handle, state: row.state, featureKeys: Array.isArray(featureKeys) ? featureKeys.filter((key): key is string => typeof key === 'string') : [],
    activeSubscriptionId: row.active_subscription_id, activeSpuKey: row.active_spu_key, validFrom: row.valid_from, validUntil: row.valid_until, nextValidFrom: row.next_valid_from, nextValidUntil: row.next_valid_until, nextDisplayFrom: row.next_display_from, nextDisplayUntil: row.next_display_until, graceUntil: row.grace_until,
    autoRecurring: row.auto_recurring === null ? null : row.auto_recurring === 1, absenceConfirmations: row.absence_confirmations, lastVerifiedAt: row.last_verified_at, version: row.version,
  };
}

function decodeOperation(row: OperationRow): SubscriptionOperation {
  return { operationKey: row.operation_key, appKey: row.app_key, handle: row.shop_handle, entitlementVersion: row.entitlement_version, kind: row.kind, state: row.state, attempts: row.attempts, nextAttemptAt: row.next_attempt_at, lastError: row.last_error, campaignId: row.campaign_id };
}

type SubscriptionOrderRow = {
  out_trade_no: string; app_key: string; shop_handle: string; spu_key: 'ultra'; sku_id: string; status: string;
  subscription_id: string | null; created_at: number; updated_at: number;
};

function decodeOrder(row: SubscriptionOrderRow): SubscriptionOrder {
  return {
    outTradeNo: row.out_trade_no, appKey: row.app_key, handle: row.shop_handle, spuKey: row.spu_key,
    skuId: row.sku_id, status: row.status, subscriptionId: row.subscription_id, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export class D1SubscriptionRepository {
  constructor(private readonly database: D1Database, private readonly clock: Clock = Date.now, private readonly entitlementLease?: EntitlementLease) {}

  get hasEntitlementLease(): boolean { return this.entitlementLease !== undefined; }

  async withEntitlementLock<T>(appKey: string, handle: string, work: (repository: D1SubscriptionRepository) => Promise<T>): Promise<T> {
    const key = `subscription:${appKey}:${handle}`;
    const owner = crypto.randomUUID();
    const now = this.clock();
    const acquired = await this.database.prepare(`INSERT INTO quantity_breaks_shop_locks (shop_handle, owner, expires_at)
      VALUES (?, ?, ?) ON CONFLICT(shop_handle) DO UPDATE SET owner = excluded.owner, expires_at = excluded.expires_at
      WHERE quantity_breaks_shop_locks.expires_at < ?`).bind(key, owner, now + ENTITLEMENT_LEASE_MS, now).run();
    if ((acquired.meta.changes ?? 0) !== 1) throw new Error('Subscription reconciliation or invalidation is in progress.');
    try { return await work(new D1SubscriptionRepository(this.database, this.clock, { key, owner, appKey, handle })); }
    finally { await this.database.prepare('DELETE FROM quantity_breaks_shop_locks WHERE shop_handle = ? AND owner = ?').bind(key, owner).run(); }
  }

  async assertEntitlementLease(appKey: string, handle: string): Promise<void> {
    const lease = this.entitlementLease;
    if (!lease || lease.appKey !== appKey || lease.handle !== handle) throw new Error('Subscription entitlement lease is required.');
    const row = await this.database.prepare('SELECT 1 AS held FROM quantity_breaks_shop_locks WHERE shop_handle = ? AND owner = ? AND expires_at > ?')
      .bind(lease.key, lease.owner, this.clock()).first();
    if (!row) throw new Error('Subscription entitlement lease expired.');
  }

  async readRunningOperation(operation: SubscriptionOperation): Promise<SubscriptionOperation | null> {
    const row = await this.database.prepare(`SELECT operation_key, app_key, shop_handle, entitlement_version, kind, state, attempts, next_attempt_at, last_error, campaign_id
      FROM quantity_breaks_subscription_operations WHERE operation_key = ? AND state = 'running' AND attempts = ?`)
      .bind(operation.operationKey, operation.attempts).first<OperationRow>();
    return row ? decodeOperation(row) : null;
  }

  async isOperationRunning(operation: SubscriptionOperation): Promise<boolean> {
    return (await this.readRunningOperation(operation))?.entitlementVersion === operation.entitlementVersion;
  }

  async advanceInvalidationVersion(appKey: string, handle: string, previous: number, next: number): Promise<void> {
    await this.assertEntitlementLease(appKey, handle);
    // Keep each task's identity, attempts, state and backoff. Reverification must not
    // drop other campaigns or create immediately-due replacements for throttled work.
    await this.database.prepare(`UPDATE quantity_breaks_subscription_operations SET entitlement_version = ?, updated_at = ?
      WHERE app_key = ? AND shop_handle = ? AND entitlement_version = ? AND kind IN ('pause_campaign', 'disable_storefront')
        AND state IN ('pending', 'retrying', 'running')`).bind(next, this.clock(), appKey, handle, previous).run();
  }

  async writeSubscriptionSnapshot(appKey: string, handle: string, subscriptions: SubscriptionRecord[]): Promise<void> {
    const now = this.clock();
    const selected = selectStoreSubscription(subscriptions, handle, now);
    // Store only the normalized fields, including a confirmed empty result. Never persist tokens or raw payloads.
    const snapshot = selected ? {
      subId: selected.subId, status: selected.status, type: selected.type, spuKey: selected.spuKey, handle,
      startAt: selected.startAt, endAt: selected.endAt, autoRecurring: selected.autoRecurring, isTrial: selected.isTrial,
    } : null;
    await this.database.prepare(`INSERT INTO quantity_breaks_subscription_snapshots
      (app_key, shop_handle, subscription_json, last_verified_at, last_attempt_at)
      SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM admin_stores WHERE handle = ?)
      ON CONFLICT(app_key, shop_handle) DO UPDATE SET subscription_json = excluded.subscription_json,
        last_verified_at = excluded.last_verified_at, last_attempt_at = excluded.last_attempt_at
      WHERE quantity_breaks_subscription_snapshots.last_verified_at IS NULL
        OR excluded.last_verified_at >= quantity_breaks_subscription_snapshots.last_verified_at`)
      .bind(appKey, handle, JSON.stringify(snapshot), now, now, handle).run();
  }

  async subscriptionSnapshotShops(appKey: string, now: number, limit = 10): Promise<string[]> {
    const rows = await this.database.prepare(`SELECT s.handle FROM admin_stores s
      LEFT JOIN quantity_breaks_subscription_snapshots p ON p.app_key = ? AND p.shop_handle = s.handle
      WHERE s.status = 'installed' AND (p.last_verified_at IS NULL OR p.last_verified_at <= ?)
        AND (p.last_attempt_at IS NULL OR p.last_attempt_at <= ?)
      ORDER BY COALESCE(p.last_attempt_at, 0), s.handle LIMIT ?`)
      .bind(appKey, now - 15 * 60_000, now - 5 * 60_000, limit).all<{ handle: string }>();
    return rows.results.map(row => row.handle);
  }

  async recordSubscriptionSnapshotAttempt(appKey: string, handle: string): Promise<void> {
    await this.database.prepare(`INSERT INTO quantity_breaks_subscription_snapshots (app_key, shop_handle, last_attempt_at)
      SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM admin_stores WHERE handle = ?)
      ON CONFLICT(app_key, shop_handle) DO UPDATE SET last_attempt_at = MAX(last_attempt_at, excluded.last_attempt_at)`)
      .bind(appKey, handle, this.clock(), handle).run();
  }

  async readEntitlement(appKey: string, handle: string): Promise<Entitlement | null> {
    const row = await this.database.prepare(`SELECT app_key, shop_handle, state, feature_keys_json, active_subscription_id, active_spu_key,
      valid_from, valid_until, next_valid_from, next_valid_until, next_display_from, next_display_until, grace_until, auto_recurring, absence_confirmations, last_verified_at, version
      FROM quantity_breaks_entitlements WHERE app_key = ? AND shop_handle = ?`).bind(appKey, handle).first<EntitlementRow>();
    return row ? decodeEntitlement(row) : null;
  }

  async writeEntitlement(entitlement: WriteEntitlement): Promise<Entitlement> {
    const now = this.clock();
    const lease = this.entitlementLease;
    if (lease && (lease.appKey !== entitlement.appKey || lease.handle !== entitlement.handle)) throw new Error('Subscription entitlement lease belongs to another shop.');
    const fence = `(? IS NULL OR EXISTS (SELECT 1 FROM quantity_breaks_shop_locks WHERE shop_handle = ? AND owner = ? AND expires_at > ?))`;
    const fenced = [lease?.key ?? null, lease?.key ?? null, lease?.owner ?? null, now];
    const result = await this.database.prepare(`INSERT INTO quantity_breaks_entitlements
      (app_key, shop_handle, state, feature_keys_json, active_subscription_id, active_spu_key, valid_from, valid_until, next_valid_from, next_valid_until, next_display_from, next_display_until, grace_until, auto_recurring, absence_confirmations, last_verified_at, version)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1 WHERE ${fence}
      ON CONFLICT(app_key, shop_handle) DO UPDATE SET state = excluded.state, feature_keys_json = excluded.feature_keys_json,
        active_subscription_id = excluded.active_subscription_id, active_spu_key = excluded.active_spu_key, valid_from = excluded.valid_from,
        valid_until = excluded.valid_until, next_valid_from = excluded.next_valid_from, next_valid_until = excluded.next_valid_until,
        next_display_from = excluded.next_display_from, next_display_until = excluded.next_display_until,
        grace_until = excluded.grace_until, auto_recurring = excluded.auto_recurring,
        absence_confirmations = excluded.absence_confirmations, last_verified_at = excluded.last_verified_at, version = quantity_breaks_entitlements.version + 1 WHERE ${fence}`)
      .bind(entitlement.appKey, entitlement.handle, entitlement.state, JSON.stringify([...new Set(entitlement.featureKeys)]), entitlement.activeSubscriptionId, entitlement.activeSpuKey,
        entitlement.validFrom, entitlement.validUntil, entitlement.nextValidFrom ?? null, entitlement.nextValidUntil ?? null,
        entitlement.nextDisplayFrom === undefined ? entitlement.nextValidFrom ?? null : entitlement.nextDisplayFrom,
        entitlement.nextDisplayUntil === undefined ? entitlement.nextValidUntil ?? null : entitlement.nextDisplayUntil,
        entitlement.graceUntil, entitlement.autoRecurring === null ? null : entitlement.autoRecurring ? 1 : 0, entitlement.absenceConfirmations, now, ...fenced, ...fenced).run();
    if ((result.meta.changes ?? 0) !== 1) throw new Error('Subscription entitlement lease expired before write.');
    const saved = await this.readEntitlement(entitlement.appKey, entitlement.handle);
    if (!saved) throw new Error('Subscription entitlement was not persisted.');
    return saved;
  }

  async consumeTrialOnce(input: { appKey: string; handle: string; subscriptionId: string; sourceEventId: string | null }): Promise<boolean> {
    const result = await this.database.prepare(`INSERT OR IGNORE INTO quantity_breaks_trial_ledger
      (app_key, shop_handle, trial_consumed_at, trial_subscription_id, source_event_id) VALUES (?, ?, ?, ?, ?)`)
      .bind(input.appKey, input.handle, this.clock(), input.subscriptionId, input.sourceEventId).run();
    return (result.meta.changes ?? 0) === 1;
  }

  async hasConsumedTrial(appKey: string, handle: string): Promise<boolean> {
    const row = await this.database.prepare('SELECT 1 AS consumed FROM quantity_breaks_trial_ledger WHERE app_key = ? AND shop_handle = ?')
      .bind(appKey, handle).first<{ consumed: number }>();
    return row?.consumed === 1;
  }

  async createOrderOnce(input: { outTradeNo: string; appKey: string; handle: string; spuKey: 'ultra'; skuId: string; status: string; subscriptionId?: string | null }): Promise<boolean> {
    const now = this.clock();
    const result = await this.database.prepare(`INSERT OR IGNORE INTO quantity_breaks_subscription_orders
      (out_trade_no, app_key, shop_handle, spu_key, sku_id, status, subscription_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(input.outTradeNo, input.appKey, input.handle, input.spuKey, input.skuId, input.status, input.subscriptionId ?? null, now, now).run();
    return (result.meta.changes ?? 0) === 1;
  }

  async readOrder(outTradeNo: string): Promise<SubscriptionOrder | null> {
    const row = await this.database.prepare(`SELECT out_trade_no, app_key, shop_handle, spu_key, sku_id, status, subscription_id, created_at, updated_at
      FROM quantity_breaks_subscription_orders WHERE out_trade_no = ?`).bind(outTradeNo).first<SubscriptionOrderRow>();
    return row ? decodeOrder(row) : null;
  }

  async updateOrderStatus(outTradeNo: string, status: string, subscriptionId?: string | null): Promise<SubscriptionOrder | null> {
    const existing = await this.readOrder(outTradeNo);
    if (!existing) return null;
    const rank = (value: string) => ({
      pending: 0,
      created: 1,
      paid: 2,
      success: 2,
      completed: 2,
      failed: 3,
      cancelled: 3,
      expired: 3,
    })[value.toLowerCase()] ?? -1;
    const currentRank = rank(existing.status);
    const nextRank = rank(status);
    const nextStatus = currentRank >= 0 && nextRank >= 0 && nextRank < currentRank ? existing.status : status;
    await this.database.prepare(`UPDATE quantity_breaks_subscription_orders
      SET status = ?, subscription_id = COALESCE(?, subscription_id), updated_at = ? WHERE out_trade_no = ?`)
      .bind(nextStatus, subscriptionId ?? null, this.clock(), outTradeNo).run();
    return this.readOrder(outTradeNo);
  }

  async cancelInvalidationOperations(appKey: string, handle: string, reason = 'Superseded by active entitlement.'): Promise<void> {
    await this.database.prepare(`UPDATE quantity_breaks_subscription_operations
      SET state = 'succeeded', last_error = ?, updated_at = ?
      WHERE app_key = ? AND shop_handle = ? AND kind IN ('pause_campaign', 'disable_storefront')
      AND state IN ('pending', 'retrying', 'running')`).bind(reason.slice(0, 256), this.clock(), appKey, handle).run();
  }

  async enqueueExpiryOperations(appKey: string, handle: string, entitlementVersion: number, nextAttemptAt: number): Promise<number> {
    const campaigns = await this.database.prepare(`SELECT campaign_id
      FROM quantity_breaks_publications
      WHERE shop_handle = ? AND discount_id IS NOT NULL
      AND state NOT IN ('entitlement_revoked', 'missing')`)
      .bind(handle).all<{ campaign_id: string }>();
    let created = 0;
    for (const row of campaigns.results) {
      if (await this.enqueueOperationOnce({ operationKey: `subscription-expired:${appKey}:${handle}:${entitlementVersion}:${row.campaign_id}`, appKey, handle, entitlementVersion, kind: 'pause_campaign', campaignId: row.campaign_id, nextAttemptAt })) created += 1;
    }
    if (await this.enqueueOperationOnce({ operationKey: `subscription-expired:${appKey}:${handle}:${entitlementVersion}:storefront`, appKey, handle, entitlementVersion, kind: 'disable_storefront', campaignId: null, nextAttemptAt })) created += 1;
    return created;
  }

  async pendingOperationShops(appKey: string): Promise<string[]> {
    const result = await this.database.prepare(`SELECT DISTINCT shop_handle FROM quantity_breaks_subscription_operations
      WHERE app_key = ? AND state IN ('pending', 'retrying')`).bind(appKey).all<{ shop_handle: string }>();
    return [...new Set(result.results.map((row) => row.shop_handle))];
  }

  async listEntitlementsByStates(appKey: string, states: EntitlementState[]): Promise<Entitlement[]> {
    if (!states.length) return [];
    const placeholders = states.map(() => '?').join(', ');
    const result = await this.database.prepare(`SELECT app_key, shop_handle, state, feature_keys_json, active_subscription_id, active_spu_key,
      valid_from, valid_until, next_valid_from, next_valid_until, next_display_from, next_display_until, grace_until, auto_recurring, absence_confirmations, last_verified_at, version
      FROM quantity_breaks_entitlements WHERE app_key = ? AND state IN (${placeholders})`)
      .bind(appKey, ...states).all<EntitlementRow>();
    return result.results.map(decodeEntitlement);
  }

  async enqueueOperationOnce(input: EnqueueSubscriptionOperation): Promise<boolean> {
    const now = this.clock();
    const result = await this.database.prepare(`INSERT OR IGNORE INTO quantity_breaks_subscription_operations
      (operation_key, app_key, shop_handle, entitlement_version, kind, state, attempts, next_attempt_at, last_error, campaign_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, NULL, ?, ?, ?)`)
      .bind(input.operationKey, input.appKey, input.handle, input.entitlementVersion, input.kind, input.nextAttemptAt, input.campaignId, now, now).run();
    return (result.meta.changes ?? 0) === 1;
  }

  async enqueueReconcileOnce(input: { appKey: string; handle: string; operationKey: string; nextAttemptAt: number }): Promise<boolean> {
    return this.enqueueOperationOnce({
      operationKey: input.operationKey,
      appKey: input.appKey,
      handle: input.handle,
      entitlementVersion: 0,
      kind: 'reconcile',
      campaignId: null,
      nextAttemptAt: input.nextAttemptAt,
    });
  }

  async claimDueOperations(now: number, limit: number): Promise<SubscriptionOperation[]> {
    const due = await this.database.prepare(`SELECT operation_key, app_key, shop_handle, entitlement_version, kind, state, attempts, next_attempt_at, last_error, campaign_id
      FROM quantity_breaks_subscription_operations WHERE state IN ('pending', 'retrying') AND next_attempt_at <= ? ORDER BY next_attempt_at, operation_key LIMIT ?`)
      .bind(now, Math.max(1, Math.min(limit, 100))).all<OperationRow>();
    const claimed: SubscriptionOperation[] = [];
    for (const row of due.results) {
      const result = await this.database.prepare(`UPDATE quantity_breaks_subscription_operations SET state = 'running', attempts = attempts + 1, updated_at = ?
        WHERE operation_key = ? AND state IN ('pending', 'retrying') AND next_attempt_at <= ?`).bind(this.clock(), row.operation_key, now).run();
      if ((result.meta.changes ?? 0) === 1) claimed.push({ ...decodeOperation(row), state: 'running', attempts: row.attempts + 1 });
    }
    return claimed;
  }

  async finishOperation(operationKey: string, attempts: number): Promise<void> {
    await this.database.prepare(`UPDATE quantity_breaks_subscription_operations SET state = 'succeeded', updated_at = ?
      WHERE operation_key = ? AND state = 'running' AND attempts = ?`).bind(this.clock(), operationKey, attempts).run();
  }

  async retryOperation(operationKey: string, nextAttemptAt: number, message: string, attempts: number): Promise<void> {
    await this.database.prepare(`UPDATE quantity_breaks_subscription_operations
      SET state = CASE WHEN attempts >= 3 THEN 'failed' ELSE 'retrying' END, next_attempt_at = ?, last_error = ?, updated_at = ?
      WHERE operation_key = ? AND state = 'running' AND attempts = ?`)
      .bind(nextAttemptAt, message.slice(0, 256), this.clock(), operationKey, attempts).run();
  }

  async purgeOperationHistory(now = this.clock(), limit = 100): Promise<{ deleted: number; compacted: number }> {
    const batchSize = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 100)) : 100;
    const [deleted, compacted] = await this.database.batch([
      this.database.prepare(`DELETE FROM quantity_breaks_subscription_operations WHERE rowid IN (
        SELECT rowid FROM quantity_breaks_subscription_operations
        WHERE kind = 'reconcile' AND ((state = 'succeeded' AND updated_at <= ?) OR (state = 'failed' AND updated_at <= ?))
        ORDER BY updated_at, rowid LIMIT ?
      )`).bind(now - 7 * DAY_MS, now - 30 * DAY_MS, batchSize),
      // Other task rows remain the idempotency record for platform mutations.
      // Remove old error text, retaining keys and outcome; blocked work still needs investigation.
      this.database.prepare(`UPDATE quantity_breaks_subscription_operations SET last_error = NULL WHERE rowid IN (
        SELECT rowid FROM quantity_breaks_subscription_operations
        WHERE kind != 'reconcile' AND state IN ('succeeded', 'failed') AND updated_at <= ? AND last_error IS NOT NULL
        ORDER BY updated_at, rowid LIMIT ?
      )`).bind(now - 30 * DAY_MS, batchSize),
    ]);
    return { deleted: deleted.meta.changes ?? 0, compacted: compacted.meta.changes ?? 0 };
  }

  async recoverStalledOperations(now = this.clock(), limit = 100): Promise<number> {
    const batchSize = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 100)) : 100;
    const result = await this.database.prepare(`UPDATE quantity_breaks_subscription_operations
      SET state = CASE WHEN kind != 'reconcile' THEN 'blocked' WHEN attempts >= 3 THEN 'failed' ELSE 'retrying' END,
          last_error = CASE WHEN kind != 'reconcile' THEN 'OPERATION_OUTCOME_UNCERTAIN' ELSE 'OPERATION_LEASE_EXPIRED' END,
          next_attempt_at = ?, updated_at = ?
      WHERE rowid IN (
        SELECT rowid FROM quantity_breaks_subscription_operations WHERE state = 'running' AND updated_at <= ?
        ORDER BY updated_at, rowid LIMIT ?
      )`).bind(now, now, now - OPERATION_TIMEOUT_MS, batchSize).run();
    return result.meta.changes ?? 0;
  }
}
