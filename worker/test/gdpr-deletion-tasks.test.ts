import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import { D1GdprDeletionTasks } from '../src/db/gdpr-deletion-tasks';
import { applyMigrations } from '../src/db/migrate';
import worker from '../src';
import { processGdprDeletionTasks } from '../src/jobs/gdpr-deletion-tasks';
import type { Env } from '../src/env';

const database = (env as Env).DB;
const now = Date.parse('2026-11-12T00:00:00.000Z');

const customerTask = {
  webhookId: 'gdpr-customer-1', kind: 'customer_redact' as const, storeId: '42', shopDomain: 'alpha.myshopline.com',
  customerIdDigest: 'customer-digest-1', receivedAt: now,
};
const merchantTask = {
  webhookId: 'gdpr-merchant-1', kind: 'merchant_redact' as const, storeId: '43', shopDomain: 'beta.myshopline.com',
  receivedAt: now,
};

describe('GDPR deletion task repository', () => {
  beforeEach(async () => {
    await applyMigrations(database);
    await database.batch([
      database.prepare('DELETE FROM feedback_comment_attachments'),
      database.prepare('DELETE FROM feedback_comments'),
      database.prepare('DELETE FROM feedback_votes'),
      database.prepare('DELETE FROM feedback_submission_keys'),
      database.prepare('DELETE FROM feedback_status_history'),
      database.prepare('DELETE FROM feedback_replies'),
      database.prepare('DELETE FROM feedback_admin_audit_logs'),
      database.prepare('DELETE FROM feedback_requests'),
      database.prepare('DELETE FROM application_request_events'),
      database.prepare('DELETE FROM admin_installations'),
      database.prepare('DELETE FROM admin_stores'),
      database.prepare('DELETE FROM quantity_breaks_subscription_snapshots'),
      database.prepare('DELETE FROM quantity_breaks_shop_locks'),
      database.prepare('DELETE FROM gdpr_deletion_tasks'),
    ]);
  });

  it('deduplicates a verified webhook ID without storing raw customer data', async () => {
    const tasks = new D1GdprDeletionTasks(database, () => now);
    await tasks.createVerified(customerTask);
    await tasks.createVerified(customerTask);

    const row = await database.prepare('SELECT webhook_id, customer_id_digest FROM gdpr_deletion_tasks').first<{ webhook_id: string; customer_id_digest: string }>();
    expect(row).toEqual({ webhook_id: customerTask.webhookId, customer_id_digest: customerTask.customerIdDigest });
    expect(JSON.stringify(row)).not.toContain('customer@example.com');
  });

  it('claims a due task once and keeps a failed task retryable before its deadline', async () => {
    const tasks = new D1GdprDeletionTasks(database, () => now);
    await tasks.createVerified(merchantTask);

    expect((await tasks.claimDue(now)).map((task) => task.webhookId)).toEqual([merchantTask.webhookId]);
    expect(await tasks.claimDue(now)).toEqual([]);
    await tasks.retry(merchantTask.webhookId, 'ADMIN_AUDIT_CLEANUP_FAILED', now + 5_000);

    await expect(tasks.list({ kind: 'merchant_redact', limit: 25, offset: 0 })).resolves.toMatchObject({
      total: 1,
      items: [{ webhookId: merchantTask.webhookId, state: 'retrying', lastErrorCode: 'ADMIN_AUDIT_CLEANUP_FAILED' }],
    });
  });

  it('clears the shop domain but retains the handle snapshot until the completed task is purged', async () => {
    const tasks = new D1GdprDeletionTasks(database, () => now);
    await tasks.createVerified(merchantTask);
    await tasks.claimDue(now);
    await tasks.complete(merchantTask.webhookId, now);

    await expect(tasks.get(merchantTask.webhookId)).resolves.toMatchObject({ state: 'completed', shopDomain: null, handleSnapshot: 'beta' });
    await tasks.purgeExpired(now + 30 * 24 * 60 * 60 * 1000 + 1);
    await expect(tasks.get(merchantTask.webhookId)).resolves.toBeNull();
  });

  it('redacts one merchant in dependency order and leaves another store untouched', async () => {
    const tasks = new D1GdprDeletionTasks(database, () => now);
    await tasks.createVerified({ ...merchantTask, storeId: '42', webhookId: 'gdpr-merchant-delete', shopDomain: 'alpha.myshopline.com' });
    await database.batch([
      database.prepare("INSERT INTO admin_stores(store_id, handle, scope, status, installed_at, updated_at) VALUES ('42', 'alpha', '', 'installed', 'x', 'x')"),
      database.prepare("INSERT INTO admin_stores(store_id, handle, scope, status, installed_at, updated_at) VALUES ('43', 'beta', '', 'installed', 'x', 'x')"),
      database.prepare("INSERT INTO quantity_breaks_shop_locks VALUES ('subscription:app-a:alpha', 'owner', 9999999999999)"),
      database.prepare("INSERT INTO quantity_breaks_shop_locks VALUES ('subscription:app-a:beta', 'owner', 9999999999999)"),
      database.prepare("INSERT INTO quantity_breaks_subscription_snapshots VALUES ('app-a', 'alpha', 'null', 1, 1)"),
      database.prepare("INSERT INTO quantity_breaks_subscription_snapshots VALUES ('app-a', 'beta', 'null', 1, 1)"),
      database.prepare("INSERT INTO application_request_events(id, trace_id, store_id, route, method, http_status, duration_ms, outcome, occurred_at, expires_at) VALUES ('a', '00000000-0000-4000-8000-000000000001', '42', '/api/a', 'GET', 200, 1, 'success', 'x', 1)"),
      database.prepare("INSERT INTO application_request_events(id, trace_id, store_id, route, method, http_status, duration_ms, outcome, occurred_at, expires_at) VALUES ('b', '00000000-0000-4000-8000-000000000002', '43', '/api/a', 'GET', 200, 1, 'success', 'x', 1)"),
      database.prepare("INSERT INTO feedback_requests(id, submitter_store_id, title, content, normalized_title, content_hash, status, visibility, vote_count, created_at, updated_at, submitter_handle_snapshot, is_anonymous) VALUES ('feedback-alpha', '42', 'Alpha feedback', 'Body', 'alpha feedback', 'hash-alpha', 'pending', 'public', 0, 'x', 'x', 'alpha', 0)"),
      database.prepare("INSERT INTO feedback_requests(id, submitter_store_id, title, content, normalized_title, content_hash, status, visibility, vote_count, created_at, updated_at, submitter_handle_snapshot, is_anonymous) VALUES ('feedback-beta', '43', 'Beta feedback', 'Body', 'beta feedback', 'hash-beta', 'pending', 'public', 0, 'x', 'x', 'beta', 0)"),
      database.prepare("INSERT INTO feedback_comments(id, request_id, author_store_id, author_handle_snapshot, is_anonymous, content, created_at) VALUES ('comment-alpha', 'feedback-alpha', '42', 'alpha', 0, 'Alpha comment', 'x')"),
      database.prepare("INSERT INTO feedback_comments(id, request_id, author_store_id, author_handle_snapshot, is_anonymous, content, created_at) VALUES ('comment-alpha-on-beta', 'feedback-beta', '42', 'alpha', 0, 'Alpha comment on beta', 'x')"),
      database.prepare("INSERT INTO feedback_comments(id, request_id, author_store_id, author_handle_snapshot, is_anonymous, content, created_at) VALUES ('comment-beta', 'feedback-beta', '43', 'beta', 0, 'Beta comment', 'x')"),
      database.prepare("INSERT INTO feedback_comment_attachments(id, comment_id, object_key, original_filename, content_type, byte_size, created_at) VALUES ('attachment-alpha', 'comment-alpha', 'attachment-alpha', 'a.png', 'image/png', 1, 'x')"),
      database.prepare("INSERT INTO feedback_comment_attachments(id, comment_id, object_key, original_filename, content_type, byte_size, created_at) VALUES ('attachment-alpha-on-beta', 'comment-alpha-on-beta', 'attachment-alpha-on-beta', 'b.png', 'image/png', 1, 'x')"),
      database.prepare("INSERT INTO feedback_votes(request_id, store_id, created_at) VALUES ('feedback-alpha', '42', 'x')"),
      database.prepare("INSERT INTO feedback_votes(request_id, store_id, created_at) VALUES ('feedback-beta', '42', 'x')"),
      database.prepare("INSERT INTO feedback_submission_keys(store_id, idempotency_key, request_id, content_hash, expires_at) VALUES ('42', 'alpha-key', 'feedback-alpha', 'hash-alpha', 1)"),
      database.prepare("INSERT INTO feedback_status_history(id, request_id, next_status, created_at) VALUES ('history-alpha', 'feedback-alpha', 'pending', 'x')"),
      database.prepare("INSERT INTO feedback_replies(id, request_id, content, visibility, author_service, created_at, updated_at) VALUES ('reply-alpha', 'feedback-alpha', 'Official reply', 'public', 'developer-admin', 'x', 'x')"),
      database.prepare("INSERT INTO feedback_admin_audit_logs(id, request_id, target_type, target_id, action, actor_service, created_at) VALUES ('audit-alpha', 'feedback-alpha', 'feedback', 'feedback-alpha', 'create', 'developer-admin', 'x')"),
    ]);
    const envWithAdmin = { ...(env as Env), SHOPLINE_APP_KEY: 'app-a', ADMIN_INTERNAL_SECRET: 'developer-platform-secret', now: () => now,
      DEVELOPER_ADMIN: { fetch: async () => new Response(null, { status: 204 }) } as unknown as Fetcher,
    } as Env;
    const result = await processGdprDeletionTasks(envWithAdmin, now);
    if (result.failed) {
      const task = await tasks.get('gdpr-merchant-delete');
      throw new Error(`GDPR redaction failed: ${task?.lastErrorCode ?? 'unknown'}`);
    }
    expect(result).toEqual({ processed: 1, failed: 0 });
    await expect(database.prepare('SELECT shop_handle FROM quantity_breaks_shop_locks').all()).resolves.toMatchObject({ results: [{ shop_handle: 'subscription:app-a:beta' }] });
    await expect(database.prepare('SELECT shop_handle FROM quantity_breaks_subscription_snapshots').all()).resolves.toMatchObject({ results: [{ shop_handle: 'beta' }] });
    await expect(database.prepare("SELECT count(*) AS total FROM admin_stores WHERE store_id = '42'").first()).resolves.toEqual({ total: 0 });
    await expect(database.prepare("SELECT count(*) AS total FROM admin_stores WHERE store_id = '43'").first()).resolves.toEqual({ total: 1 });
    await expect(database.prepare("SELECT count(*) AS total FROM feedback_requests WHERE submitter_store_id = '42'").first()).resolves.toEqual({ total: 0 });
    await expect(database.prepare("SELECT count(*) AS total FROM feedback_comments WHERE author_store_id = '42'").first()).resolves.toEqual({ total: 0 });
    await expect(database.prepare("SELECT count(*) AS total FROM feedback_votes WHERE store_id = '42'").first()).resolves.toEqual({ total: 0 });
    await expect(database.prepare("SELECT count(*) AS total FROM feedback_comment_attachments WHERE id LIKE 'attachment-alpha%'").first()).resolves.toEqual({ total: 0 });
    await expect(database.prepare("SELECT count(*) AS total FROM feedback_submission_keys WHERE store_id = '42'").first()).resolves.toEqual({ total: 0 });
    await expect(database.prepare("SELECT count(*) AS total FROM feedback_status_history WHERE request_id = 'feedback-alpha'").first()).resolves.toEqual({ total: 0 });
    await expect(database.prepare("SELECT count(*) AS total FROM feedback_replies WHERE request_id = 'feedback-alpha'").first()).resolves.toEqual({ total: 0 });
    await expect(database.prepare("SELECT count(*) AS total FROM feedback_admin_audit_logs WHERE request_id = 'feedback-alpha'").first()).resolves.toEqual({ total: 0 });
    await expect(database.prepare("SELECT count(*) AS total FROM feedback_requests WHERE submitter_store_id = '43'").first()).resolves.toEqual({ total: 1 });
    await expect(database.prepare("SELECT count(*) AS total FROM feedback_comments WHERE id = 'comment-beta'").first()).resolves.toEqual({ total: 1 });
    await expect(tasks.get('gdpr-merchant-delete')).resolves.toMatchObject({ state: 'completed', shopDomain: null });
  });

  it('keeps a merchant task retryable when the private audit cleanup is unavailable', async () => {
    const tasks = new D1GdprDeletionTasks(database, () => now);
    await tasks.createVerified({ ...merchantTask, webhookId: 'gdpr-merchant-audit-failure' });

    const unavailableAdmin = {
      ...(env as Env), ADMIN_INTERNAL_SECRET: 'developer-platform-secret', now: () => now,
      DEVELOPER_ADMIN: { fetch: async () => new Response(null, { status: 503 }) } as unknown as Fetcher,
    } as Env;

    await expect(processGdprDeletionTasks(unavailableAdmin, now)).resolves.toEqual({ processed: 1, failed: 1 });
    await expect(tasks.get('gdpr-merchant-audit-failure')).resolves.toMatchObject({
      state: 'retrying', lastErrorCode: 'ADMIN_AUDIT_CLEANUP_FAILED',
    });
  });

  it('processes due GDPR tasks from the five-minute schedule', async () => {
    const tasks = new D1GdprDeletionTasks(database, () => now);
    await tasks.createVerified({ ...merchantTask, webhookId: 'gdpr-merchant-scheduled' });
    const scheduledEnv = {
      ...(env as Env), ADMIN_INTERNAL_SECRET: 'developer-platform-secret', now: () => now,
      DEVELOPER_ADMIN: { fetch: async () => new Response(null, { status: 204 }) } as unknown as Fetcher,
    } as Env;

    if (!worker.scheduled) throw new Error('Worker scheduled handler is missing');
    await worker.scheduled({ cron: '*/5 * * * *' } as ScheduledController, scheduledEnv);

    await expect(tasks.get('gdpr-merchant-scheduled')).resolves.toMatchObject({ state: 'completed', shopDomain: null });
  });
});
