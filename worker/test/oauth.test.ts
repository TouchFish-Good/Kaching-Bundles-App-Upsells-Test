import { env } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';

import { hmacHex } from '../src/crypto';
import { beginOAuth, finishOAuth } from '../src/auth/oauth';
import { applyMigrations } from '../src/db/migrate';
import { D1SessionStore } from '../src/db/sessions';
import { app } from '../src/index';
import type { Env } from '../src/env';

const appSecret = 'test-secret';
const testEnv = {
  ...(env as Env),
  SHOPLINE_APP_KEY: 'test-key',
  SHOPLINE_APP_SECRET: appSecret,
  SHOPLINE_APP_URL: 'https://raised-stability-gaps-html.trycloudflare.com',
  SCOPES: 'read_products',
  TOKEN_ENCRYPTION_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY',
  now: () => Date.parse('2026-10-27T00:00:00.000Z'),
} as Env;

async function signedCallback(timestamp: number): Promise<Request> {
  const query = new URLSearchParams({
    appkey: 'test-key',
    code: 'code-value',
    handle: 'demo',
    timestamp: String(timestamp),
  });
  const payload = [...query.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  query.set('sign', await hmacHex(appSecret, payload));
  return new Request(`https://raised-stability-gaps-html.trycloudflare.com/api/auth/callback?${query}`);
}

describe('SHOPLINE OAuth', () => {
  it('starts OAuth when SHOPLINE opens the app entry for an uninstalled store', async () => {
    await applyMigrations(testEnv.DB);
    await testEnv.DB.prepare('DELETE FROM shopline_sessions WHERE handle = ?').bind('new-store').run();

    const response = await app.request(
      'https://raised-stability-gaps-html.trycloudflare.com/?shop=new-store.myshopline.com&embedded=1',
      undefined,
      testEnv,
    );

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('location')!);
    expect(location.origin).toBe('https://raised-stability-gaps-html.trycloudflare.com');
    expect(location.pathname).toBe('/');
    expect(location.searchParams.get('uninstalled')).toBe('true');
    expect(location.searchParams.get('embedded')).toBe('1');
    expect(location.searchParams.get('appkey')).toBe('test-key');
    expect(location.searchParams.get('handle')).toBe('new-store');
    expect(location.searchParams.get('host')).toBe('new-store.myshopline.com');
    expect(location.searchParams.get('scope')).toBe('read_products');
    expect(location.searchParams.get('redirectUri')).toBe('https://raised-stability-gaps-html.trycloudflare.com/api/auth/callback');
  });

  it('serves the embedded OAuth handoff after redirecting an uninstalled store once', async () => {
    await applyMigrations(testEnv.DB);
    await testEnv.DB.prepare('DELETE FROM shopline_sessions WHERE handle = ?').bind('oauth-loop-store').run();

    const entry = await app.request('https://raised-stability-gaps-html.trycloudflare.com/?handle=oauth-loop-store&lang=zh-hans-cn', undefined, testEnv);
    expect(entry.status).toBe(302);

    const handoff = await app.request(entry.headers.get('location')!, undefined, testEnv);
    expect(handoff.status).toBe(200);
    expect(handoff.headers.get('location')).toBeNull();
  });

  it('does not restart OAuth for an already installed store', async () => {
    await applyMigrations(testEnv.DB);
    await new D1SessionStore(testEnv.DB, testEnv.TOKEN_ENCRYPTION_KEY).upsert({
      handle: 'installed-store', accessToken: 'access', refreshToken: 'refresh', scope: 'read_products',
      expiresAt: '2030-01-01T00:00:00.000Z', installed: true,
    });

    const response = await app.request(
      'https://raised-stability-gaps-html.trycloudflare.com/quantity-breaks?handle=installed-store&embedded=1',
      undefined,
      testEnv,
    );

    expect(response.status).not.toBe(302);
  });

  it('clears a stale embedded reauthorization marker for an installed store', async () => {
    await applyMigrations(testEnv.DB);
    await new D1SessionStore(testEnv.DB, testEnv.TOKEN_ENCRYPTION_KEY).upsert({
      handle: 'installed-store', accessToken: 'access', refreshToken: 'refresh', scope: 'read_products',
      expiresAt: '2030-01-01T00:00:00.000Z', installed: true,
    });

    const response = await app.request(
      'https://raised-stability-gaps-html.trycloudflare.com/?uninstalled=true&embedded=1&appkey=test-key&handle=installed-store&shop=installed-store&host=installed-store.myshopline.com&scope=read_products&redirectUri=https%3A%2F%2Fraised-stability-gaps-html.trycloudflare.com%2Fapi%2Fauth%2Fcallback&lang=zh-hans-cn',
      undefined,
      testEnv,
    );

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('location')!);
    expect(location.searchParams.get('uninstalled')).toBeNull();
    expect(location.searchParams.get('handle')).toBe('installed-store');
    expect(location.searchParams.get('embedded')).toBe('1');
    expect(location.searchParams.get('lang')).toBe('zh-hans-cn');
  });

  it('routes a trailing-slash callback to OAuth validation instead of the API 404 fallback', async () => {
    const response = await app.request('https://raised-stability-gaps-html.trycloudflare.com/api/auth/callback/', undefined, testEnv);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid OAuth callback' });
  });

  it('redirects authorization to the SDK-equivalent SHOPLINE URL', async () => {
    const response = await beginOAuth(
      new Request('https://raised-stability-gaps-html.trycloudflare.com/api/auth?handle=demo'),
      testEnv,
    );

    expect(response.headers.get('location')).toBe(
      'https://demo.myshopline.com/admin/oauth-web/#/oauth/authorize?appKey=test-key&responseType=code&scope=read_products&redirectUri=https%3A%2F%2Fraised-stability-gaps-html.trycloudflare.com%2Fapi%2Fauth%2Fcallback&customField=',
    );
  });

  it('rejects a future callback timestamp outside ten minutes before exchanging its code', async () => {
    const request = await signedCallback(testEnv.now!() + 600_001);

    expect((await finishOAuth(request, testEnv)).status).toBe(400);
  });

  it('records a non-sensitive token exchange failure code', async () => {
    await applyMigrations(testEnv.DB);
    await testEnv.DB.prepare('DELETE FROM admin_error_events').run();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })));

    expect((await finishOAuth(await signedCallback(testEnv.now!()), testEnv)).status).toBe(502);
    await expect(testEnv.DB.prepare("SELECT code FROM admin_error_events WHERE kind = 'oauth' ORDER BY id DESC LIMIT 1").first<{ code: string }>()).resolves.toEqual({ code: 'OAUTH_TOKEN_EXCHANGE_FAILED' });
  });

  it('records the authenticated store and installation cycle after a successful callback', async () => {
    await applyMigrations(testEnv.DB);
    await testEnv.DB.batch([
      testEnv.DB.prepare('DELETE FROM shopline_sessions'),
      testEnv.DB.prepare('DELETE FROM admin_installations'),
      testEnv.DB.prepare('DELETE FROM admin_stores'),
    ]);
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/oauth/token/create')) return new Response(JSON.stringify({ code: 200, i18nCode: 'SUCCESS', data: { accessToken: 'access', expireTime: '2030-01-01T00:00:00.000Z', scope: 'read_products' } }));
      if (url.includes('/merchants/shop.json')) return new Response(JSON.stringify({ data: { id: '42' } }));
      if (url.includes('/webhooks.json')) return new Response(JSON.stringify({ id: 'webhook-1' }));
      throw new Error(`Unexpected request: ${url}`);
    }));

    const response = await finishOAuth(await signedCallback(testEnv.now!()), testEnv);

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('location')!);
    expect(location.origin).toBe('https://raised-stability-gaps-html.trycloudflare.com');
    expect(location.searchParams.get('appkey')).toBe('test-key');
    expect(location.searchParams.get('handle')).toBe('demo');
    expect(location.searchParams.get('embedded')).toBe('0');
    expect(location.searchParams.get('isFromAppListPage')).toBe('1');
    expect(location.searchParams.get('host')).toBe('demo.myshopline.com');
    await expect(testEnv.DB.prepare('SELECT handle, status FROM admin_stores WHERE store_id = ?').bind('42').first<{ handle: string; status: string }>()).resolves.toEqual({ handle: 'demo', status: 'installed' });
    await expect(testEnv.DB.prepare('SELECT count(*) AS count FROM admin_installations WHERE store_id = ?').bind('42').first<{ count: number }>()).resolves.toEqual({ count: 1 });
  });

  it('preserves embedded host and locale after an embedded callback', async () => {
    await applyMigrations(testEnv.DB);
    await testEnv.DB.batch([
      testEnv.DB.prepare('DELETE FROM shopline_sessions'),
      testEnv.DB.prepare('DELETE FROM admin_installations'),
      testEnv.DB.prepare('DELETE FROM admin_stores'),
    ]);
    const query = new URLSearchParams({ appkey: 'test-key', code: 'code-value', handle: 'demo', lang: 'zh-hans-cn', timestamp: String(testEnv.now!()) });
    const payload = [...query.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${key}=${value}`).join('&');
    query.set('sign', await hmacHex(appSecret, payload));
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/oauth/token/create')) return new Response(JSON.stringify({ code: 200, data: { accessToken: 'access', expireTime: '2030-01-01T00:00:00.000Z', scope: 'read_products' } }));
      if (url.includes('/merchants/shop.json')) return new Response(JSON.stringify({ data: { id: '42' } }));
      if (url.includes('/webhooks.json')) return new Response(JSON.stringify({ id: 'webhook-1' }));
      throw new Error(`Unexpected request: ${url}`);
    }));

    const response = await finishOAuth(new Request(`https://raised-stability-gaps-html.trycloudflare.com/api/auth/callback?${query}`), testEnv);
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('location')!);
    expect(location.searchParams.get('embedded')).toBe('1');
    expect(location.searchParams.get('lang')).toBe('zh-hans-cn');
    expect(location.searchParams.get('host')).toBe('demo.myshopline.com');
  });
});
