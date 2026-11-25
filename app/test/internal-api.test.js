const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { randomUUID } = require('node:crypto');
const { AdminRegistry } = require('../src/admin-read/registry');
const { signRequest } = require('../src/admin-read/signature');
const { createInternalRouter } = require('../src/admin-read/internal-api');

test('internal API serves real stores and explicitly unavailable bundles', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kaching-internal-'));
  const registry = new AdminRegistry(join(dir, 'db.sqlite'));
  await registry.ready();
  await registry.recordInstallation({ storeId: 'store-42', handle: 'real-shop', scope: 'write_products', at: '2026-10-14T01:00:00Z' });
  const app = express();
  app.use('/internal/admin-read/v1', createInternalRouter(registry, 'a-long-secret'));
  const server = app.listen(0);
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const get = async (path, signed = true) => {
      const timestamp = String(Date.now());
      const nonce = randomUUID();
      const headers = signed ? {
        'x-admin-timestamp': timestamp,
        'x-admin-nonce': nonce,
        'x-admin-signature': signRequest('a-long-secret', 'GET', path, timestamp, nonce),
      } : {};
      return fetch(base + path, { headers });
    };
    assert.equal((await get('/internal/admin-read/v1/stores', false)).status, 401);
    const stores = await (await get('/internal/admin-read/v1/stores?query=real')).json();
    assert.equal(stores.data.total, 1);
    assert.equal(stores.data.items[0].storeId, 'store-42');
    const overview = await (await get('/internal/admin-read/v1/overview')).json();
    assert.equal(overview.data.installedStoreCount.value, 1);
    assert.equal(overview.data.activeBundleCount.sourceStatus, 'unavailable');
    const bundles = await get('/internal/admin-read/v1/stores/store-42/bundles');
    assert.equal(bundles.status, 503);
    assert.equal((await bundles.json()).error.code, 'SOURCE_UNAVAILABLE');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await registry.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
