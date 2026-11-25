import { D1GdprDeletionTasks } from '../db/gdpr-deletion-tasks';
import type { Env } from '../env';
import { deleteDeveloperAdminAudit } from '../internal/admin-cleanup-client';

function merchantScopedDeleteStatements(database: D1Database, storeId: string, handle: string, webhookId: string, appKey: string): D1PreparedStatement[] {
  return [
    database.prepare(`DELETE FROM feedback_comment_attachments WHERE comment_id IN (
      SELECT id FROM feedback_comments WHERE author_store_id = ? OR request_id IN (
        SELECT id FROM feedback_requests WHERE submitter_store_id = ?
      )
    )`).bind(storeId, storeId),
    database.prepare(`DELETE FROM feedback_comments WHERE author_store_id = ? OR request_id IN (
      SELECT id FROM feedback_requests WHERE submitter_store_id = ?
    )`).bind(storeId, storeId),
    database.prepare(`DELETE FROM feedback_votes WHERE store_id = ? OR request_id IN (
      SELECT id FROM feedback_requests WHERE submitter_store_id = ?
    )`).bind(storeId, storeId),
    database.prepare(`DELETE FROM feedback_submission_keys WHERE store_id = ? OR request_id IN (
      SELECT id FROM feedback_requests WHERE submitter_store_id = ?
    )`).bind(storeId, storeId),
    database.prepare(`DELETE FROM feedback_status_history WHERE request_id IN (
      SELECT id FROM feedback_requests WHERE submitter_store_id = ?
    )`).bind(storeId),
    database.prepare(`DELETE FROM feedback_replies WHERE request_id IN (
      SELECT id FROM feedback_requests WHERE submitter_store_id = ?
    )`).bind(storeId),
    database.prepare(`DELETE FROM feedback_admin_audit_logs WHERE request_id IN (
      SELECT id FROM feedback_requests WHERE submitter_store_id = ?
    )`).bind(storeId),
    database.prepare('DELETE FROM feedback_requests WHERE submitter_store_id = ?').bind(storeId),
    database.prepare('DELETE FROM application_request_events WHERE store_id = ? OR shop_handle = ?').bind(storeId, handle),
    database.prepare('DELETE FROM admin_error_events WHERE store_id = ?').bind(storeId),
    database.prepare('DELETE FROM campaign_diagnostic_events WHERE store_id = ? OR shop_handle = ?').bind(storeId, handle),
    database.prepare('DELETE FROM webhook_events WHERE shop_handle = ?').bind(handle),
    database.prepare('DELETE FROM quantity_breaks_campaign_operations WHERE shop_handle = ?').bind(handle),
    database.prepare('DELETE FROM quantity_breaks_campaign_operation_batches WHERE shop_handle = ?').bind(handle),
    database.prepare('DELETE FROM quantity_breaks_staged_updates WHERE shop_handle = ?').bind(handle),
    database.prepare('DELETE FROM quantity_breaks_publications WHERE shop_handle = ?').bind(handle),
    database.prepare('DELETE FROM quantity_breaks_campaigns WHERE shop_handle = ?').bind(handle),
    database.prepare('DELETE FROM quantity_breaks_collection_conflicts WHERE shop_handle = ?').bind(handle),
    database.prepare('DELETE FROM quantity_breaks_shop_locks WHERE shop_handle IN (?, ?)').bind(handle, `subscription:${appKey}:${handle}`),
    database.prepare('DELETE FROM quantity_breaks_translations WHERE shop_handle = ?').bind(handle),
    database.prepare('DELETE FROM quantity_breaks_entitlements WHERE shop_handle = ?').bind(handle),
    database.prepare('DELETE FROM quantity_breaks_subscription_snapshots WHERE shop_handle = ?').bind(handle),
    database.prepare('DELETE FROM quantity_breaks_trial_ledger WHERE shop_handle = ?').bind(handle),
    database.prepare('DELETE FROM quantity_breaks_subscription_operations WHERE shop_handle = ?').bind(handle),
    database.prepare('DELETE FROM quantity_breaks_subscription_orders WHERE shop_handle = ?').bind(handle),
    database.prepare('DELETE FROM admin_installations WHERE store_id = ?').bind(storeId),
    database.prepare('DELETE FROM shopline_sessions WHERE handle = ?').bind(handle),
    database.prepare('DELETE FROM admin_stores WHERE store_id = ?').bind(storeId),
    database.prepare('UPDATE gdpr_deletion_tasks SET shop_domain = NULL WHERE webhook_id = ?').bind(webhookId),
  ];
}

export async function processGdprDeletionTasks(env: Env, now = env.now?.() ?? Date.now()): Promise<{ processed: number; failed: number }> {
  const tasks = new D1GdprDeletionTasks(env.DB, () => now);
  const claimed = await tasks.claimDue(now);
  let failed = 0;
  for (const task of claimed) {
    try {
      if (task.kind === 'merchant_redact') {
        const row = await env.DB.prepare('SELECT handle FROM admin_stores WHERE store_id = ?').bind(task.storeId).first<{ handle: string }>();
        const handle = row?.handle ?? task.shopDomain?.replace(/\.myshopline\.com$/i, '') ?? '';
        if (handle) {
          await deleteDeveloperAdminAudit(env, { storeId: task.storeId, shopHandle: handle });
          await env.DB.batch(merchantScopedDeleteStatements(env.DB, task.storeId, handle, task.webhookId, env.SHOPLINE_APP_KEY));
        }
      }
      await tasks.complete(task.webhookId, now);
    } catch (error) {
      failed += 1;
      await tasks.retry(task.webhookId, error instanceof Error && error.message === 'ADMIN_AUDIT_CLEANUP_FAILED' ? error.message : 'GDPR_DELETE_FAILED', now + 5_000);
    }
  }
  await tasks.purgeExpired(now);
  return { processed: claimed.length, failed };
}
