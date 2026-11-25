import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { hmacHex } from '../src/crypto';
import { requireShoplineSession, withFreshAccessToken } from '../src/auth/session';
import { applyMigrations } from '../src/db/migrate';
import { D1SessionStore } from '../src/db/sessions';
import type { Env } from '../src/env';

const key = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY';
const secret = 'session-secret';
const testEnv = { ...(env as Env), SHOPLINE_APP_KEY: 'test-key', SHOPLINE_APP_SECRET: secret, TOKEN_ENCRYPTION_KEY: key, now: () => Date.parse('2026-10-27T00:00:00.000Z') } as Env;

function base64Url(value: string): string {
  return btoa(value).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function jwt(payload: Record<string, unknown>, signingSecret = secret, header: Record<string, unknown> = { alg: 'HS256', typ: 'JWT' }): Promise<string> {
  const encodedHeader = base64Url(JSON.stringify(header));
  const body = base64Url(JSON.stringify(payload));
  const signature = base64Url(await hexToBytes(await hmacHex(btoa(signingSecret), `${encodedHeader}.${body}`)));
  return `${encodedHeader}.${body}.${signature}`;
}

async function hexToBytes(value: string): Promise<string> {
  const bytes = value.match(/.{2}/g)?.map((part) => String.fromCharCode(Number.parseInt(part, 16))) ?? [];
  return bytes.join('');
}

describe('SHOPLINE session authentication', () => {
  beforeEach(async () => {
    await applyMigrations(testEnv.DB);
    await testEnv.DB.prepare('DELETE FROM shopline_sessions').run();
    await new D1SessionStore(testEnv.DB, key).upsert({ handle: 'demo', accessToken: 'access', refreshToken: 'refresh', scope: 'read_products', expiresAt: '2030-01-01T00:00:00.000Z', installed: true });
  });

  it('returns 401 before an altered JWT can access a protected route', async () => {
    const valid = await jwt({ aud: 'test-key', handle: 'demo', iat: 1_798_000_000, exp: 1_798_021_600 });
    const tampered = `${valid.slice(0, -1)}${valid.endsWith('a') ? 'b' : 'a'}`;
    const response = await requireShoplineSession(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/campaigns', { headers: { Authorization: `Bearer ${tampered}` } }), testEnv);
    expect(response).toMatchObject({ status: 401 });
  });

  it('rejects a JWT whose header algorithm or audience does not match this app', async () => {
    const wrongAlgorithm = await jwt({ aud: 'test-key', handle: 'demo', exp: 1_900_000_000 }, secret, { alg: 'none', typ: 'JWT' });
    const wrongAudience = await jwt({ aud: 'another-app', handle: 'demo', exp: 1_900_000_000 });

    await expect(requireShoplineSession(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/campaigns', { headers: { Authorization: `Bearer ${wrongAlgorithm}` } }), testEnv)).resolves.toMatchObject({ status: 401 });
    await expect(requireShoplineSession(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/campaigns', { headers: { Authorization: `Bearer ${wrongAudience}` } }), testEnv)).resolves.toMatchObject({ status: 401 });
  });

  it('accepts a valid JWT whose audience array contains this app key', async () => {
    const token = await jwt({ aud: ['another-app', 'test-key'], handle: 'demo', exp: 1_900_000_000 });

    await expect(requireShoplineSession(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/subscription', { headers: { Authorization: `Bearer ${token}` } }), testEnv))
      .resolves.toEqual({ handle: 'demo', accessToken: 'access', scope: 'read_products' });
  });

  it('asks App Bridge to renew authorization when a valid session cannot refresh its expired Admin token', async () => {
    const store = new D1SessionStore(testEnv.DB, key);
    await store.upsert({ handle: 'demo', accessToken: 'expired', refreshToken: 'refresh', scope: 'read_products', expiresAt: '2026-10-26T00:00:00.000Z', installed: true });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 401 })));

    const response = await requireShoplineSession(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/subscription', {
      headers: { Authorization: `Bearer ${await jwt({ aud: 'test-key', handle: 'demo', exp: 1_900_000_000 })}` },
    }), testEnv);

    expect(response).toBeInstanceOf(Response);
    const denied = response as Response;
    expect(denied.status).toBe(403);
    expect(denied.headers.get('X-SHOPLINE-API-Request-Failure-Reauthorize')).toBe('1');
    expect(denied.headers.get('X-SHOPLINE-API-Request-Failure-Reauthorize-Url')).toContain('/?uninstalled=true&embedded=1&appkey=test-key&handle=demo');
    await expect(denied.json()).resolves.toEqual({ error: 'SHOPLINE authorization needs to be renewed.' });
  });

  it.each([429, 503])('does not ask App Bridge to renew authorization when token refresh is temporarily unavailable (%i)', async (status) => {
    const store = new D1SessionStore(testEnv.DB, key);
    await store.upsert({ handle: 'demo', accessToken: 'expired', refreshToken: 'refresh', scope: 'read_products', expiresAt: '2026-10-26T00:00:00.000Z', installed: true });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status })));

    const response = await requireShoplineSession(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/subscription', {
      headers: { Authorization: `Bearer ${await jwt({ aud: 'test-key', handle: 'demo', exp: 1_900_000_000 })}` },
    }), testEnv);

    expect(response).toBeInstanceOf(Response);
    const failure = response as Response;
    expect(failure.status).toBe(503);
    expect(failure.headers.get('X-SHOPLINE-API-Request-Failure-Reauthorize')).toBeNull();
  });

  it('refreshes an expired store session exactly once under concurrency', async () => {
    const store = new D1SessionStore(testEnv.DB, key);
    await store.upsert({ handle: 'demo', accessToken: 'expired', refreshToken: 'refresh', scope: 'read_products', expiresAt: '2026-10-26T00:00:00.000Z', installed: true });
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      code: 200,
      data: { accessToken: 'fresh', expireTime: '2030-01-01T00:00:00.000Z', scope: 'read_products' },
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);

    const [left, right] = await Promise.all([withFreshAccessToken('demo', testEnv), withFreshAccessToken('demo', testEnv)]);
    expect(left.accessToken).toBe('fresh');
    expect(right.accessToken).toBe('fresh');
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(store.get('demo')).resolves.toMatchObject({ expiresAt: '2030-01-01T00:00:00.000Z' });
  });

  it.each([false, true])('waits for a new token instead of returning the still-valid old token (force=%s)', async (force) => {
    const store = new D1SessionStore(testEnv.DB, key);
    await store.upsert({ handle: 'demo', accessToken: 'near-expiry', refreshToken: 'refresh', scope: 'read_products', expiresAt: '2026-10-27T00:02:00.000Z', installed: true });
    const fetcher = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 650));
      return Response.json({ data: { accessToken: 'fresh', expireTime: '2030-01-01T00:00:00.000Z' } });
    });
    vi.stubGlobal('fetch', fetcher);
    const result = await Promise.all([withFreshAccessToken('demo', testEnv, { force }), withFreshAccessToken('demo', testEnv, { force })]);
    expect(result.map((item) => item.accessToken)).toEqual(['fresh', 'fresh']);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('returns a temporary failure rather than unauthorized when refresh has a network failure', async () => {
    await new D1SessionStore(testEnv.DB, key).upsert({ handle: 'demo', accessToken: 'expired', refreshToken: 'refresh', scope: 'read_products', expiresAt: '2026-10-26T00:00:00.000Z', installed: true });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Network failure'); }));
    const response = await requireShoplineSession(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/subscription', {
      headers: { Authorization: `Bearer ${await jwt({ aud: 'test-key', handle: 'demo', exp: 1_900_000_000 })}` },
    }), testEnv) as Response;
    expect(response.status).toBe(503);
    expect(response.headers.get('X-SHOPLINE-API-Request-Failure-Reauthorize')).toBeNull();
  });

  it('does not return a refreshed token after the installation is removed while waiting for another refresh', async () => {
    const store = new D1SessionStore(testEnv.DB, key);
    await store.upsert({ handle: 'demo', accessToken: 'expired', refreshToken: 'refresh', scope: 'read_products', expiresAt: '2026-10-26T00:00:00.000Z', installed: true });
    await testEnv.DB.prepare('INSERT INTO token_refresh_locks (shop_handle, owner, expires_at) VALUES (?, ?, ?)').bind('demo', 'other-request', testEnv.now!() + 30_000).run();

    const pending = withFreshAccessToken('demo', testEnv);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await store.markUninstalled('demo');

    await expect(pending).rejects.toThrow('installation is not active');
  });

  it('resolves only installed server-side store identities for feedback authors', async () => {
    const store = new D1SessionStore(testEnv.DB, key);
    await store.recordInstallation({ storeId: '42', handle: 'demo', scope: 'read_products', at: '2026-10-29T00:00:00.000Z' });

    await expect(store.getActiveStoreIdentity('demo')).resolves.toEqual({ storeId: '42', handle: 'demo' });
    await store.recordUninstalled({ handle: 'demo', storeId: '42', webhookId: 'feedback-uninstall', topic: 'app/uninstalled', occurredAt: '2026-10-29T01:00:00.000Z' });
    await expect(store.getActiveStoreIdentity('demo')).resolves.toBeNull();
  });
});
