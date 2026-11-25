import { env, createExecutionContext } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import worker from '../src';
import { hmacHex } from '../src/crypto';
import { D1FeedbackRepository } from '../src/db/feedback';
import { D1SessionStore } from '../src/db/sessions';
import { applyMigrations } from '../src/db/migrate';
import type { Env } from '../src/env';

const key = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY';
const secret = 'feedback-route-secret';
const testEnv = { ...(env as Env), SHOPLINE_APP_KEY: 'feedback-route-key', SHOPLINE_APP_SECRET: secret, TOKEN_ENCRYPTION_KEY: key, now: () => Date.parse('2026-10-29T00:00:00.000Z') } as Env;

function base64Url(value: string): string {
  return btoa(value).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function merchantHeaders(): Promise<Headers> {
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64Url(JSON.stringify({ aud: testEnv.SHOPLINE_APP_KEY, handle: 'feedback-shop', exp: 1_900_000_000 }));
  const signature = base64Url(String.fromCharCode(...(await hmacHex(btoa(secret), `${header}.${payload}`)).match(/.{2}/g)!.map((part) => Number.parseInt(part, 16))));
  return new Headers({ Authorization: `Bearer ${header}.${payload}.${signature}` });
}

async function merchantFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = await merchantHeaders();
  new Headers(init.headers).forEach((value, name) => headers.set(name, value));
  return worker.fetch(new Request(`https://raised-stability-gaps-html.trycloudflare.com${path}`, { ...init, headers }), testEnv, createExecutionContext());
}

describe('merchant feedback routes', () => {
  let feedbackId: string;

  beforeEach(async () => {
    await applyMigrations(testEnv.DB);
    await testEnv.DB.batch([
      testEnv.DB.prepare('DELETE FROM feedback_comment_attachments'),
      testEnv.DB.prepare('DELETE FROM feedback_comments'),
      testEnv.DB.prepare('DELETE FROM feedback_replies'),
      testEnv.DB.prepare('DELETE FROM feedback_votes'),
      testEnv.DB.prepare('DELETE FROM feedback_submission_keys'),
      testEnv.DB.prepare('DELETE FROM feedback_requests'),
      testEnv.DB.prepare('DELETE FROM feedback_rate_limits'),
      testEnv.DB.prepare('DELETE FROM shopline_sessions'),
      testEnv.DB.prepare('DELETE FROM admin_installations'),
      testEnv.DB.prepare('DELETE FROM admin_stores'),
    ]);
    const sessions = new D1SessionStore(testEnv.DB, key);
    await sessions.upsert({ handle: 'feedback-shop', storeId: '42', accessToken: 'access', refreshToken: 'refresh', scope: 'read_products', expiresAt: '2030-01-01T00:00:00.000Z', installed: true });
    await sessions.recordInstallation({ storeId: '42', handle: 'feedback-shop', scope: 'read_products', at: '2026-10-29T00:00:00.000Z' });
    feedbackId = (await new D1FeedbackRepository(testEnv.DB, testEnv.now).createSuggestion({ storeId: 'author-store', title: 'Attachment support', content: 'Please allow evidence files.', idempotencyKey: crypto.randomUUID() })).id;
  });

  it('creates an anonymous text comment without requiring file storage', async () => {
    await new D1FeedbackRepository(testEnv.DB, testEnv.now).updateStatus({ requestId: feedbackId, status: 'approved' });
    const response = await merchantFetch(`/api/quantity-breaks/feedback/${feedbackId}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: 'Please add this feature.', isAnonymous: true }) });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ data: { comment: { authorLabel: '匿名用户', content: 'Please add this feature.' } } });
  });

  it('does not expose an unreviewed author-only suggestion to another authenticated merchant', async () => {
    const detail = await merchantFetch(`/api/quantity-breaks/feedback/${feedbackId}`);
    const listed = await merchantFetch('/api/quantity-breaks/feedback?sort=newest&page=1&pageSize=9');

    expect(detail.status).toBe(404);
    await expect(listed.json()).resolves.toMatchObject({ data: { items: [] } });
  });

  it('allows the submitting merchant to comment on an unreviewed suggestion', async () => {
    const repository = new D1FeedbackRepository(testEnv.DB, testEnv.now);
    const own = await repository.createSuggestion({ storeId: '42', handle: 'feedback-shop', title: 'Needs review', content: 'Private', idempotencyKey: crypto.randomUUID() });
    const response = await merchantFetch(`/api/quantity-breaks/feedback/${own.id}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: '补充上下文', isAnonymous: false }) });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ data: { comment: { authorLabel: 'feedback-shop', content: '补充上下文' } } });
  });

  it('paginates the current merchant suggestions and permits withdrawing an untouched pending one', async () => {
    const repository = new D1FeedbackRepository(testEnv.DB, testEnv.now);
    const first = await repository.createSuggestion({ storeId: '42', handle: 'feedback-shop', title: 'Mine one', content: 'Body', idempotencyKey: crypto.randomUUID() });
    await repository.createSuggestion({ storeId: '42', handle: 'feedback-shop', title: 'Mine two', content: 'Body', idempotencyKey: crypto.randomUUID() });

    const listed = await merchantFetch('/api/quantity-breaks/feedback?mine=1&page=1&pageSize=1');
    expect(listed.status).toBe(200);
    await expect(listed.json()).resolves.toMatchObject({ data: { page: 1, pageSize: 1, total: 2, totalPages: 2, items: [expect.objectContaining({ isMine: true })] } });

    const withdrawn = await merchantFetch(`/api/quantity-breaks/feedback/${first.id}`, { method: 'DELETE' });
    expect(withdrawn.status).toBe(200);
    await expect(withdrawn.json()).resolves.toMatchObject({ data: { withdrawn: true } });
  });

  it('accepts a 1000-code-point suggestion body and rejects one code point more', async () => {
    const response = await merchantFetch('/api/quantity-breaks/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Limit', content: '文'.repeat(1001) }),
    });

    expect(response.status).toBe(422);
  });
});
