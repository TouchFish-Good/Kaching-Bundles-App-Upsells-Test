import { env, createExecutionContext } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import worker from '../src';
import { hmacHex } from '../src/crypto';
import { D1FeedbackRepository } from '../src/db/feedback';
import { applyMigrations } from '../src/db/migrate';
import type { Env } from '../src/env';

const testEnv = { ...(env as Env), ADMIN_INTERNAL_SECRET: 'developer-platform-secret', now: () => Date.parse('2026-10-29T00:00:00.000Z') } as Env;

async function signedRequest(path: string, body: unknown, nonce = crypto.randomUUID(), method = 'POST'): Promise<Request> {
  const timestamp = String(testEnv.now!());
  const traceId = crypto.randomUUID();
  const signature = await hmacHex(testEnv.ADMIN_INTERNAL_SECRET, `${method}\n${path}\n${timestamp}\n${nonce}\n${traceId}`);
  return new Request(`https://raised-stability-gaps-html.trycloudflare.com${path}`, { method, headers: { 'Content-Type': 'application/json', 'x-admin-timestamp': timestamp, 'x-admin-nonce': nonce, 'x-admin-signature': signature, 'x-trace-id': traceId }, body: JSON.stringify(body) });
}

describe('developer-platform feedback replies', () => {
  let feedbackId: string;

  beforeEach(async () => {
    await applyMigrations(testEnv.DB);
    await testEnv.DB.batch([
      testEnv.DB.prepare('DELETE FROM internal_request_nonces'),
      testEnv.DB.prepare('DELETE FROM feedback_admin_audit_logs'),
      testEnv.DB.prepare('DELETE FROM feedback_comment_attachments'),
      testEnv.DB.prepare('DELETE FROM feedback_comments'),
      testEnv.DB.prepare('DELETE FROM feedback_status_history'),
      testEnv.DB.prepare('DELETE FROM feedback_replies'),
      testEnv.DB.prepare('DELETE FROM feedback_submission_keys'),
      testEnv.DB.prepare('DELETE FROM feedback_requests'),
    ]);
    feedbackId = (await new D1FeedbackRepository(testEnv.DB, testEnv.now).createSuggestion({ storeId: '1', title: 'Title', content: 'Body', idempotencyKey: crypto.randomUUID() })).id;
  });

  it('creates a reply with fixed official identity', async () => {
    await new D1FeedbackRepository(testEnv.DB, testEnv.now).updateStatus({ requestId: feedbackId, status: 'approved' });
    const request = await signedRequest(`/internal/admin/v1/feedback/${feedbackId}/replies`, { content: '已加入开发计划。', authorLabel: 'forged', isOfficial: false });
    const response = await worker.fetch(request, testEnv, createExecutionContext());

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ data: { reply: expect.objectContaining({ authorLabel: '多件折扣', isOfficial: true, content: '已加入开发计划。' }) } });
  });

  it('rejects a replayed nonce', async () => {
    await new D1FeedbackRepository(testEnv.DB, testEnv.now).updateStatus({ requestId: feedbackId, status: 'approved' });
    const nonce = crypto.randomUUID();
    const path = `/internal/admin/v1/feedback/${feedbackId}/replies`;
    const first = await worker.fetch(await signedRequest(path, { content: 'First reply.' }, nonce), testEnv, createExecutionContext());
    const replay = await worker.fetch(await signedRequest(path, { content: 'Replay reply.' }, nonce), testEnv, createExecutionContext());

    expect(first.status).toBe(201);
    expect(replay.status).toBe(401);
  });

  it('updates the public status and records its public note', async () => {
    const path = `/internal/admin/v1/feedback/${feedbackId}/status`;
    const response = await worker.fetch(
      await signedRequest(path, { status: 'in_progress', note: '已进入本期开发计划。' }, crypto.randomUUID(), 'PATCH'),
      testEnv,
      createExecutionContext(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { feedback: { id: feedbackId, status: 'in_progress' } },
    });
    await expect(testEnv.DB.prepare('SELECT previous_status, next_status, public_note FROM feedback_status_history WHERE request_id = ?').bind(feedbackId).first())
      .resolves.toEqual({ previous_status: 'pending', next_status: 'in_progress', public_note: '已进入本期开发计划。' });
    await expect(testEnv.DB.prepare('SELECT visibility, reviewed_at FROM feedback_requests WHERE id = ?').bind(feedbackId).first())
      .resolves.toMatchObject({ visibility: 'public', reviewed_at: expect.any(String) });
  });

  it('records a review even when the developer keeps the status pending', async () => {
    const path = `/internal/admin/v1/feedback/${feedbackId}/status`;
    const response = await worker.fetch(
      await signedRequest(path, { status: 'pending', note: '已人工审核，暂不公开。' }, crypto.randomUUID(), 'PATCH'),
      testEnv,
      createExecutionContext(),
    );

    expect(response.status).toBe(200);
    await expect(testEnv.DB.prepare('SELECT visibility, reviewed_at FROM feedback_requests WHERE id = ?').bind(feedbackId).first())
      .resolves.toMatchObject({ visibility: 'hidden', reviewed_at: expect.any(String) });
  });

  it('rejects an unknown feedback status', async () => {
    const path = `/internal/admin/v1/feedback/${feedbackId}/status`;
    const response = await worker.fetch(
      await signedRequest(path, { status: 'published' }, crypto.randomUUID(), 'PATCH'),
      testEnv,
      createExecutionContext(),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({ error: { code: 'INVALID_STATUS' } });
  });

  it('allows rejected feedback to be hidden from every merchant', async () => {
    const path = `/internal/admin/v1/feedback/${feedbackId}/status`;
    const response = await worker.fetch(
      await signedRequest(path, { status: 'rejected', hideFromMerchants: true, note: '违规内容' }, crypto.randomUUID(), 'PATCH'),
      testEnv,
      createExecutionContext(),
    );

    expect(response.status).toBe(200);
    await expect(testEnv.DB.prepare('SELECT status, visibility, hidden_reason FROM feedback_requests WHERE id = ?').bind(feedbackId).first())
      .resolves.toEqual({ status: 'rejected', visibility: 'hidden', hidden_reason: 'owner_rejected_display' });
  });

  it('rejects merchant hiding for statuses other than rejected', async () => {
    const response = await worker.fetch(
      await signedRequest(`/internal/admin/v1/feedback/${feedbackId}/status`, { status: 'approved', hideFromMerchants: true }, crypto.randomUUID(), 'PATCH'),
      testEnv,
      createExecutionContext(),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({ error: { code: 'INVALID_DISPLAY_MODE' } });
  });

  it('deletes a comment once and rejects a replayed signed request', async () => {
    const repository = new D1FeedbackRepository(testEnv.DB, testEnv.now);
    await repository.updateStatus({ requestId: feedbackId, status: 'approved' });
    const comment = await repository.createComment({ requestId: feedbackId, storeId: '2', handle: 'beta', isAnonymous: true, content: '人身攻击' });
    const nonce = crypto.randomUUID();
    const path = `/internal/admin/v1/feedback/${feedbackId}/comments/${comment!.id}`;

    const first = await worker.fetch(await signedRequest(path, { reason: '人身攻击' }, nonce, 'DELETE'), testEnv, createExecutionContext());
    const replay = await worker.fetch(await signedRequest(path, { reason: '人身攻击' }, nonce, 'DELETE'), testEnv, createExecutionContext());

    expect(first.status).toBe(200);
    expect(replay.status).toBe(401);
    await expect(testEnv.DB.prepare('SELECT visibility, deletion_reason FROM feedback_comments WHERE id = ?').bind(comment!.id).first())
      .resolves.toEqual({ visibility: 'hidden', deletion_reason: '人身攻击' });
  });

  it('does not delete a comment belonging to another suggestion', async () => {
    const repository = new D1FeedbackRepository(testEnv.DB, testEnv.now);
    await repository.updateStatus({ requestId: feedbackId, status: 'approved' });
    const other = await repository.createSuggestion({ storeId: '3', title: 'Other', content: 'Another request', idempotencyKey: crypto.randomUUID() });
    await repository.updateStatus({ requestId: other.id, status: 'approved' });
    const comment = await repository.createComment({ requestId: other.id, storeId: '2', handle: 'beta', isAnonymous: false, content: 'Another comment' });

    const response = await worker.fetch(
      await signedRequest(`/internal/admin/v1/feedback/${feedbackId}/comments/${comment!.id}`, { reason: '跨建议删除' }, crypto.randomUUID(), 'DELETE'),
      testEnv,
      createExecutionContext(),
    );

    expect(response.status).toBe(404);
  });
});
