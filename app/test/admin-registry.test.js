const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { AdminRegistry } = require('../src/admin-read/registry');

async function withRegistry(run) {
  const dir = mkdtempSync(join(tmpdir(), 'kaching-registry-'));
  const registry = new AdminRegistry(join(dir, 'test.sqlite'));
  try {
    await registry.ready();
    await run(registry);
  } finally {
    await registry.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

test('installation uses stable store ID and never exposes token', async () => {
  await withRegistry(async (registry) => {
    await registry.recordInstallation({ storeId: 'store-42', handle: 'old-handle', scope: 'write_products', at: '2026-10-14T01:00:00Z' });
    await registry.recordInstallation({ storeId: 'store-42', handle: 'new-handle', scope: 'write_products', at: '2026-10-14T02:00:00Z' });
    const stores = await registry.listStores({ query: 'new-handle', limit: 25, offset: 0 });
    assert.equal(stores.total, 1);
    assert.equal(stores.items[0].storeId, 'store-42');
    assert.equal(stores.items[0].handle, 'new-handle');
    assert.equal(stores.items[0].status, 'installed');
    assert.equal(JSON.stringify(stores).includes('accessToken'), false);
  });
});

test('duplicate uninstall event closes one installation period', async () => {
  await withRegistry(async (registry) => {
    await registry.recordInstallation({ storeId: 'store-42', handle: 'shop', scope: 'write_products', at: '2026-10-14T01:00:00Z' });
    await registry.recordUninstallation({ storeId: 'store-42', webhookId: 'wh-1', at: '2026-10-14T03:00:00Z' });
    await registry.recordUninstallation({ storeId: 'store-42', webhookId: 'wh-1', at: '2026-10-14T03:00:00Z' });
    const store = await registry.getStore('store-42');
    assert.equal(store.status, 'uninstalled');
    assert.equal(store.installations.length, 1);
    assert.equal(store.installations[0].uninstalledAt, '2026-10-14T03:00:00Z');
  });
});

test('delayed uninstall cannot close a newer installation', async () => {
  await withRegistry(async (registry) => {
    await registry.recordInstallation({ storeId: 'store-42', handle: 'shop', scope: '', at: '2026-10-14T01:00:00Z' });
    await registry.recordUninstallation({ storeId: 'store-42', webhookId: 'wh-1', at: '2026-10-14T02:00:00Z' });
    await registry.recordInstallation({ storeId: 'store-42', handle: 'shop', scope: '', at: '2026-10-14T04:00:00Z' });
    assert.equal(await registry.recordUninstallation({ storeId: 'store-42', webhookId: 'wh-old', at: '2026-10-14T03:00:00Z' }), false);
    assert.equal((await registry.getStore('store-42')).status, 'installed');
  });
});

test('sanitized error rejects secret-shaped data', async () => {
  await withRegistry(async (registry) => {
    await registry.recordError({ kind: 'webhook', severity: 'error', code: 'PROCESSING_FAILED', traceId: 'trace-1', at: '2026-10-14T03:00:00Z' });
    const events = await registry.listErrors({ limit: 25, offset: 0 });
    assert.equal(events.items.length, 1);
    assert.equal(events.items[0].code, 'PROCESSING_FAILED');
    assert.equal(JSON.stringify(events).includes('payload'), false);
  });
});
