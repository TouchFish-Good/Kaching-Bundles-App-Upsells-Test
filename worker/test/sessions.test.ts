import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import { D1SessionStore } from '../src/db/sessions';
import { applyMigrations } from '../src/db/migrate';
import type { Env } from '../src/env';

const testKey = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY';

describe('D1 session store', () => {
  it('encrypts both SHOPLINE tokens before persisting them', async () => {
    const database = (env as Env).DB;
    await applyMigrations(database);
    const store = new D1SessionStore(database, testKey);

    await store.upsert({
      handle: 'alpha',
      accessToken: 'access-secret',
      refreshToken: 'refresh-secret',
      scope: 'read_products',
      expiresAt: '2030-01-01T00:00:00.000Z',
      installed: true,
    });

    const row = await database
      .prepare('SELECT access_token_ciphertext, refresh_token_ciphertext FROM shopline_sessions WHERE handle = ?')
      .bind('alpha')
      .first<{ access_token_ciphertext: string; refresh_token_ciphertext: string }>();

    expect(row?.access_token_ciphertext).not.toContain('access-secret');
    expect(row?.refresh_token_ciphertext).not.toContain('refresh-secret');
    await expect(store.get('alpha')).resolves.toMatchObject({
      handle: 'alpha',
      accessToken: 'access-secret',
      refreshToken: 'refresh-secret',
      installed: true,
    });
  });

  it('marks an installed store as uninstalled without deleting its audit row', async () => {
    const database = (env as Env).DB;
    await applyMigrations(database);
    const store = new D1SessionStore(database, testKey);
    await store.upsert({
      handle: 'beta',
      accessToken: 'access',
      refreshToken: 'refresh',
      scope: 'read_products',
      expiresAt: '2030-01-01T00:00:00.000Z',
      installed: true,
    });

    await store.markUninstalled('beta');

    await expect(store.get('beta')).resolves.toMatchObject({ installed: false });
  });

  it('returns only installed sessions in stable pages for subscription webhook backfill', async () => {
    const database = (env as Env).DB;
    await applyMigrations(database);
    await database.prepare('DELETE FROM shopline_sessions').run();
    const store = new D1SessionStore(database, testKey);
    await Promise.all([
      store.upsert({ handle: 'alpha', accessToken: 'access-a', refreshToken: 'refresh-a', scope: 'read_products', expiresAt: '2030-01-01T00:00:00.000Z', installed: true }),
      store.upsert({ handle: 'beta', accessToken: 'access-b', refreshToken: 'refresh-b', scope: 'read_products', expiresAt: '2030-01-01T00:00:00.000Z', installed: true }),
      store.upsert({ handle: 'gamma', accessToken: 'access-c', refreshToken: 'refresh-c', scope: 'read_products', expiresAt: '2030-01-01T00:00:00.000Z', installed: false }),
    ]);

    await expect(store.listInstalled({ limit: 1, offset: 1 })).resolves.toEqual({
      total: 2,
      sessions: [expect.objectContaining({ handle: 'beta', accessToken: 'access-b', installed: true })],
    });
  });
});
