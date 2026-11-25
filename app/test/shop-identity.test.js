const test = require('node:test');
const assert = require('node:assert/strict');
const { parseShopIdentity } = require('../src/admin-read/shop-identity');

test('store ID comes from documented shop data, not the mutable handle', () => {
  assert.deepEqual(parseShopIdentity({ data: { id: '1672369729606', name: 'A Store' } }, 'old-handle'), {
    storeId: '1672369729606', displayName: 'A Store'
  });
  assert.throws(() => parseShopIdentity({ data: { name: 'A Store' } }, 'old-handle'), /store ID/);
});
