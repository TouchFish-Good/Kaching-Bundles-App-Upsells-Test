const test = require('node:test');
const assert = require('node:assert/strict');
const { createCurrentAdminSessionLoader } = require('../src/auth/admin-session');

const now = Date.parse('2026-10-16T12:00:00.000Z');

test('current Admin session is loaded from storage for each request without needless refresh', async () => {
  let current = { handle: 'shop', accessToken: 'first', expires: new Date(now + 60 * 60_000) };
  let refreshes = 0;
  const load = createCurrentAdminSessionLoader({
    loadSession: async (id) => { assert.equal(id, 'offline_shop'); return current; },
    refreshToken: async () => { refreshes++; return current; },
    storeSession: async () => {},
    now: () => now,
  });
  assert.equal((await load('shop')).accessToken, 'first');
  current = { ...current, accessToken: 'second' };
  assert.equal((await load('shop')).accessToken, 'second');
  assert.equal(refreshes, 0);
});

test('concurrent requests share one refresh shortly before Admin token expiry', async () => {
  const stale = { handle: 'shop', accessToken: 'old', expires: new Date(now + 4 * 60_000) };
  const fresh = { handle: 'shop', accessToken: 'fresh', expires: new Date(now + 60 * 60_000) };
  let refreshes = 0;
  let saved;
  const load = createCurrentAdminSessionLoader({
    loadSession: async () => stale,
    refreshToken: async (handle) => { assert.equal(handle, 'shop'); refreshes++; await Promise.resolve(); return fresh; },
    storeSession: async (session) => { saved = session; },
    now: () => now,
  });
  const [first, second] = await Promise.all([load('shop'), load('shop')]);
  assert.equal(first.accessToken, 'fresh');
  assert.equal(second.accessToken, 'fresh');
  assert.equal(saved, fresh);
  assert.equal(refreshes, 1);
});

test('a failed refresh never returns an expiring Admin token', async () => {
  const load = createCurrentAdminSessionLoader({
    loadSession: async () => ({ handle: 'shop', accessToken: 'old', expires: new Date(now + 60_000) }),
    refreshToken: async () => { throw new Error('refresh rejected'); },
    storeSession: async () => {},
    now: () => now,
  });
  await assert.rejects(() => load('shop'), /refresh rejected/);
});
