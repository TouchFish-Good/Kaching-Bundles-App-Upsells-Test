import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';

async function loadRecovery() {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try { return await vite.ssrLoadModule('/src/prototype/bootstrap-recovery.ts'); }
  finally { await vite.close(); }
}

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test('a stalled bootstrap gets one automatic recovery reload then holds its workspace shell', async () => {
  const { BOOTSTRAP_TIMEOUT_MS, claimBootstrapRecovery, clearBootstrapRecovery } = await loadRecovery();
  const sessionStorage = storage();

  assert.equal(BOOTSTRAP_TIMEOUT_MS, 5_000);
  assert.equal(claimBootstrapRecovery(sessionStorage), 'reload');
  assert.equal(claimBootstrapRecovery(sessionStorage), 'hold');
  clearBootstrapRecovery(sessionStorage);
  assert.equal(claimBootstrapRecovery(sessionStorage), 'reload');
});

test('blocked storage cannot interrupt mounting or cause an unbounded recovery reload', async () => {
  const { claimBootstrapRecovery, clearBootstrapRecovery } = await loadRecovery();
  const blocked = { getItem() { throw new Error('SecurityError'); }, removeItem() { throw new Error('SecurityError'); } };
  assert.doesNotThrow(() => clearBootstrapRecovery(blocked));
  assert.equal(claimBootstrapRecovery(blocked), 'hold');
});
