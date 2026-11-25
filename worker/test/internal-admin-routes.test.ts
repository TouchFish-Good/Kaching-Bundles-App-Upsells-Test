import { env, createExecutionContext } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import worker from '../src';
import { hmacHex } from '../src/crypto';
import { D1FeedbackRepository } from '../src/db/feedback';
import { D1GdprDeletionTasks } from '../src/db/gdpr-deletion-tasks';
import { applyMigrations } from '../src/db/migrate';
import type { Env } from '../src/env';

const testEnv = { ...(env as Env), ADMIN_INTERNAL_SECRET: 'developer-platform-secret', now: () => Date.parse('2026-10-29T00:00:00.000Z') } as Env;

async function signedRequest(path: string, method: 'GET' | 'POST' = 'GET', nonce = crypto.randomUUID(), traceId = crypto.randomUUID()): Promise<Request> {
  const timestamp = String(testEnv.now!());
  const signature = await hmacHex(testEnv.ADMIN_INTERNAL_SECRET, `${method}\n${path}\n${timestamp}\n${nonce}\n${traceId}`);
  return new Request(`https://raised-stability-gaps-html.trycloudflare.com${path}`, {
    method,
    headers: {
      'x-admin-timestamp': timestamp,
      'x-admin-nonce': nonce,
      'x-admin-signature': signature,
      'x-trace-id': traceId,
    },
  });
}

describe('developer-platform feedback reads', () => {
  let feedbackId: string;

  beforeEach(async () => {
    await applyMigrations(testEnv.DB);
    await testEnv.DB.batch([
      testEnv.DB.prepare('DELETE FROM internal_request_nonces'),
      testEnv.DB.prepare('DELETE FROM gdpr_deletion_tasks'),
      testEnv.DB.prepare('DELETE FROM feedback_admin_audit_logs'),
      testEnv.DB.prepare('DELETE FROM feedback_comment_attachments'),
      testEnv.DB.prepare('DELETE FROM feedback_comments'),
      testEnv.DB.prepare('DELETE FROM feedback_status_history'),
      testEnv.DB.prepare('DELETE FROM feedback_replies'),
      testEnv.DB.prepare('DELETE FROM feedback_submission_keys'),
      testEnv.DB.prepare('DELETE FROM feedback_requests'),
    ]);
    feedbackId = (await new D1FeedbackRepository(testEnv.DB, testEnv.now).createSuggestion({
      storeId: 'shop-1',
      handle: 'alpha',
      isAnonymous: true,
      title: '匿名建议',
      content: '请支持更多折扣组合。',
      idempotencyKey: crypto.randomUUID(),
    })).id;
  });

  it('returns the real handle and anonymous marker only to a signed Owner list request', async () => {
    const response = await worker.fetch(
      await signedRequest('/internal/admin-read/v1/feedback?status=pending&limit=25&offset=0'),
      testEnv,
      createExecutionContext(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { total: 1, items: [expect.objectContaining({ id: feedbackId, handle: 'alpha', isAnonymous: true, status: 'pending' })] },
    });
  });

  it('returns Owner detail including private source content and a rejected-display lifecycle', async () => {
    const repository = new D1FeedbackRepository(testEnv.DB, testEnv.now);
    await repository.updateStatus({ requestId: feedbackId, status: 'rejected', hideFromMerchants: true, note: '不予显示' });

    const response = await worker.fetch(await signedRequest(`/internal/admin-read/v1/feedback/${feedbackId}`), testEnv, createExecutionContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        id: feedbackId,
        handle: 'alpha',
        isAnonymous: true,
        content: '请支持更多折扣组合。',
        displayStatus: 'rejected_hidden',
        statusHistory: [expect.objectContaining({ nextStatus: 'rejected', note: '不予显示' })],
      },
    });
  });

  it('rejects an invalid feedback display filter', async () => {
    const response = await worker.fetch(await signedRequest('/internal/admin-read/v1/feedback?display=private'), testEnv, createExecutionContext());

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({ error: { code: 'INVALID_DISPLAY' } });
  });

  it('rejects a replayed Owner read nonce', async () => {
    const nonce = crypto.randomUUID();
    const path = '/internal/admin-read/v1/feedback?limit=25&offset=0';

    const first = await worker.fetch(await signedRequest(path, 'GET', nonce), testEnv, createExecutionContext());
    const replay = await worker.fetch(await signedRequest(path, 'GET', nonce), testEnv, createExecutionContext());

    expect(first.status).toBe(200);
    expect(replay.status).toBe(401);
  });

  it('lists only the safe merchant-redact task projection for a signed internal request', async () => {
    const tasks = new D1GdprDeletionTasks(testEnv.DB, testEnv.now);
    await tasks.createVerified({ webhookId: 'merchant-task', kind: 'merchant_redact', storeId: '42', shopDomain: 'alpha.myshopline.com', receivedAt: testEnv.now!() });

    const response = await worker.fetch(await signedRequest('/internal/admin-read/v1/gdpr-tasks?kind=merchant_redact&limit=25&offset=0'), testEnv, createExecutionContext());

    expect(response.status).toBe(200);
    const body = JSON.stringify(await response.json());
    expect(body).toContain('merchant_redact');
    expect(body).toContain('alpha');
    expect(body).not.toContain('myshopline.com');
  });

  it('keeps a completed merchant task handle and store ID in the Owner-only projection', async () => {
    const tasks = new D1GdprDeletionTasks(testEnv.DB, testEnv.now);
    await tasks.createVerified({ webhookId: 'completed-merchant-task', kind: 'merchant_redact', storeId: '42', shopDomain: 'alpha.myshopline.com', receivedAt: testEnv.now!() });
    await tasks.claimDue(testEnv.now!());
    await tasks.complete('completed-merchant-task', testEnv.now!());

    const response = await worker.fetch(await signedRequest('/internal/admin-read/v1/gdpr-tasks?kind=merchant_redact&limit=25&offset=0'), testEnv, createExecutionContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { items: [expect.objectContaining({ webhookId: 'completed-merchant-task', storeId: '42', handle: 'alpha', state: 'completed' })] },
    });
  });

  it('rejects retry of a completed task and accepts a signed retry of a failed task', async () => {
    const tasks = new D1GdprDeletionTasks(testEnv.DB, testEnv.now);
    await tasks.createVerified({ webhookId: 'done-task', kind: 'merchant_redact', storeId: '42', shopDomain: 'alpha.myshopline.com', receivedAt: testEnv.now!() });
    await tasks.createVerified({ webhookId: 'failed-task', kind: 'merchant_redact', storeId: '42', shopDomain: 'alpha.myshopline.com', receivedAt: testEnv.now!() });
    await tasks.claimDue(testEnv.now!());
    await tasks.complete('done-task', testEnv.now!());
    await testEnv.DB.prepare("UPDATE gdpr_deletion_tasks SET state = 'failed' WHERE webhook_id = 'failed-task'").run();

    const done = await worker.fetch(await signedRequest('/internal/admin/v1/gdpr-tasks/done-task/retry', 'POST'), testEnv, createExecutionContext());
    const failed = await worker.fetch(await signedRequest('/internal/admin/v1/gdpr-tasks/failed-task/retry', 'POST'), testEnv, createExecutionContext());

    expect(done.status).toBe(409);
    expect(failed.status).toBe(200);
    await expect(tasks.get('failed-task')).resolves.toMatchObject({ state: 'pending' });
  });
});
