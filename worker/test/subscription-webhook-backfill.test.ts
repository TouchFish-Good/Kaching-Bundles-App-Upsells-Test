import { createExecutionContext, env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import worker from '../src';
import { hmacHex } from '../src/crypto';
import { applyMigrations } from '../src/db/migrate';
import { D1SessionStore } from '../src/db/sessions';
import type { Env } from '../src/env';

const now = Date.parse('2026-10-30T00:00:00.000Z');
const testEnv = {
  ...(env as Env),
  ADMIN_INTERNAL_SECRET: 'developer-platform-secret',
  SHOPLINE_APP_URL: 'https://raised-stability-gaps-html.trycloudflare.com',
  TOKEN_ENCRYPTION_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY',
  now: () => now,
} as Env;

const requiredTopics = ['apps/installed_uninstalled', 'appsubscription/create', 'appsubscription/paid', 'appsubscription/expiration'];

async function signedRequest(path: string, nonce = crypto.randomUUID()): Promise<Request> {
  const timestamp = String(now);
  const traceId = crypto.randomUUID();
  const signature = await hmacHex(testEnv.ADMIN_INTERNAL_SECRET, `POST\n${path}\n${timestamp}\n${nonce}\n${traceId}`);
  return new Request(`https://raised-stability-gaps-html.trycloudflare.com${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-timestamp': timestamp, 'x-admin-nonce': nonce, 'x-admin-signature': signature, 'x-trace-id': traceId },
    body: '{}',
  });
}

describe('subscription webhook backfill', () => {
  beforeEach(async () => {
    await applyMigrations(testEnv.DB);
    await testEnv.DB.batch([
      testEnv.DB.prepare('DELETE FROM internal_request_nonces'),
      testEnv.DB.prepare('DELETE FROM shopline_sessions'),
    ]);
  });

  afterEach(() => vi.restoreAllMocks());

  it('uses the protected endpoint to reconcile webhook registrations for installed stores only', async () => {
    const sessions = new D1SessionStore(testEnv.DB, testEnv.TOKEN_ENCRYPTION_KEY, () => new Date(now));
    await Promise.all([
      sessions.upsert({ handle: 'active-shop', accessToken: 'active-access', refreshToken: 'active-refresh', scope: 'read_products', expiresAt: '2030-01-01T00:00:00.000Z', installed: true }),
      sessions.upsert({ handle: 'removed-shop', accessToken: 'removed-access', refreshToken: 'removed-refresh', scope: 'read_products', expiresAt: '2030-01-01T00:00:00.000Z', installed: false }),
    ]);
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({
      webhooks: requiredTopics.map((topic) => ({ topic, address: 'https://raised-stability-gaps-html.trycloudflare.com/api/webhooks' })),
    }));

    const response = await worker.fetch(await signedRequest('/internal/admin/v1/subscription-webhooks/reconcile?limit=100&offset=0'), testEnv, createExecutionContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { processed: 1, failed: 0, registeredTopics: 0, total: 1, nextOffset: null } });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('active-shop.myshopline.com');
  });
});
