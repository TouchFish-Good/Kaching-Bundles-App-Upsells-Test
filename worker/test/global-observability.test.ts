import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import worker from '../src';
import { hmacHex } from '../src/crypto';
import { applyMigrations } from '../src/db/migrate';
import { D1SessionStore } from '../src/db/sessions';
import type { Env } from '../src/env';

const encryptionKey = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY';
const secret = 'observability-secret';
const testEnv = { ...(env as Env), SHOPLINE_APP_KEY: 'observability-key', SHOPLINE_APP_SECRET: secret, TOKEN_ENCRYPTION_KEY: encryptionKey } as Env;

function base64Url(value: string): string {
  return btoa(value).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function jwt(handle: string): Promise<string> {
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64Url(JSON.stringify({ aud: 'observability-key', handle, exp: 1_900_000_000 }));
  const hex = await hmacHex(btoa(secret), `${header}.${payload}`);
  const signature = base64Url(String.fromCharCode(...(hex.match(/.{2}/g) ?? []).map((part) => Number.parseInt(part, 16))));
  return `${header}.${payload}.${signature}`;
}

describe('global application observability', () => {
  it('returns the response before diagnostic storage finishes and still persists the request', async () => {
    await applyMigrations(testEnv.DB);
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const db = new Proxy(testEnv.DB, {
      get(target, property) {
        if (property === 'prepare') return (sql: string) => {
          const statement = target.prepare(sql);
          if (!sql.includes('INSERT INTO application_request_events')) return statement;
          return { bind: (...values: unknown[]) => ({ run: async () => { await pending; return statement.bind(...values).run(); } }) };
        };
        const value = Reflect.get(target, property);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const ctx = createExecutionContext();
    let responded = false;
    const request = Promise.resolve(worker.fetch(new Request('https://app.test/api/slow-diagnostic-test'), { ...testEnv, DB: db }, ctx)).then((response) => { responded = true; return response; });
    try {
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(responded).toBe(true);
    } finally { release(); await request; await waitOnExecutionContext(ctx); }
    const response = await request;
    expect(response.status).toBe(404);
    await waitOnExecutionContext(ctx);
    await expect(testEnv.DB.prepare('SELECT http_status FROM application_request_events WHERE trace_id = ?').bind(response.headers.get('X-Trace-Id')).first())
      .resolves.toEqual({ http_status: 404 });
  });
  it('records a dynamic API 404 as a client-error request summary without an Error event', async () => {
    await applyMigrations(testEnv.DB);
    await testEnv.DB.batch([
      testEnv.DB.prepare('DELETE FROM application_request_events'),
      testEnv.DB.prepare('DELETE FROM admin_error_events'),
    ]);

    const ctx = createExecutionContext();
    const response = await worker.fetch(new Request('https://app.test/api/not-found'), testEnv, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(404);
    expect(response.headers.get('X-Trace-Id')).toMatch(/^[0-9a-f-]{36}$/);
    await expect(testEnv.DB.prepare('SELECT route, method, http_status, outcome FROM application_request_events').first())
      .resolves.toEqual({ route: '/api/not-found', method: 'GET', http_status: 404, outcome: 'client_error' });
    await expect(testEnv.DB.prepare('SELECT count(*) AS total FROM admin_error_events').first<{ total: number }>()).resolves.toEqual({ total: 0 });
  });

  it('associates an authenticated API summary with the installed store and handle', async () => {
    await applyMigrations(testEnv.DB);
    await testEnv.DB.batch([
      testEnv.DB.prepare('DELETE FROM application_request_events'),
      testEnv.DB.prepare('DELETE FROM admin_stores'),
      testEnv.DB.prepare('DELETE FROM shopline_sessions'),
    ]);
    await new D1SessionStore(testEnv.DB, encryptionKey).upsert({
      handle: 'observability-shop', storeId: '987654', accessToken: 'access', refreshToken: 'refresh', scope: 'read_products',
      expiresAt: '2030-01-01T00:00:00.000Z', installed: true,
    });

    const ctx = createExecutionContext();
    const response = await worker.fetch(new Request('https://app.test/api/quantity-breaks/campaigns', {
      headers: { Authorization: `Bearer ${await jwt('observability-shop')}` },
    }), testEnv, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    await expect(testEnv.DB.prepare('SELECT store_id, shop_handle FROM application_request_events').first())
      .resolves.toEqual({ store_id: '987654', shop_handle: 'observability-shop' });
  });
});
