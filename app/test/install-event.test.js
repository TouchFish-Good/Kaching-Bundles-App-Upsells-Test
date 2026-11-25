const test = require('node:test');
const assert = require('node:assert/strict');
const { parseUninstallEvent } = require('../src/admin-read/install-event');

test('SHOPLINE uninstall payload uses stable store ID and occurrence time', () => {
  const timestamp = Date.parse('2026-10-14T03:00:00Z');
  assert.deepEqual(parseUninstallEvent({ store_id: 'store-42', handle: 'old-handle', operate: 'UNINSTALL', timestamp }), {
    storeId: 'store-42', at: '2026-10-14T03:00:00.000Z',
  });
  assert.equal(parseUninstallEvent({ store_id: 'store-42', operate: 'INSTALL', timestamp }), null);
  assert.throws(() => parseUninstallEvent({ store_id: 'store-42', operate: 'UNINSTALL', timestamp: 'bad' }), /timestamp/);
});
