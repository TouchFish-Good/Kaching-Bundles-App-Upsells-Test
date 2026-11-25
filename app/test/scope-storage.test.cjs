const test = require('node:test');
const assert = require('node:assert/strict');
const { Session } = require('@shoplineos/shopline-api-js');
const { SQLiteSessionStorage } = require('@shoplineos/shopline-app-session-storage-sqlite');
const { scopeCheckedSessionStorage } = require('../src/auth/scope-storage');

const allScopes = 'read_products,write_products,read_discounts,write_discounts,read_store_information,read_markets,read_translation,read_orders';
const oldScopes = 'read_products,write_products,read_discounts,write_discounts';

test('incomplete reauthorization never replaces the prior installed session', async () => {
  const backing = new SQLiteSessionStorage(':memory:');
  const storage = scopeCheckedSessionStorage(backing);
  const initial = new Session({ id: 'offline_test-store', handle: 'test-store', state: 'active', isOnline: false, scope: allScopes, accessToken: 'previous-token' });
  await storage.storeSession(initial);

  const incomplete = new Session({ id: initial.id, handle: initial.handle, state: 'active', isOnline: false, scope: oldScopes, accessToken: 'new-under-scoped-token' });
  await assert.rejects(() => storage.storeSession(incomplete), /read_store_information/);
  const missingOrders = new Session({ id: initial.id, handle: initial.handle, state: 'active', isOnline: false, scope: allScopes.replace(',read_orders', ''), accessToken: 'missing-orders-token' });
  await assert.rejects(() => storage.storeSession(missingOrders), /read_orders/);

  const persisted = await storage.loadSession(initial.id);
  assert.equal(persisted?.accessToken, 'previous-token');
  assert.equal(persisted?.scope, allScopes);
});
