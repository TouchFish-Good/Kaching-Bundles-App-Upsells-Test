const assert = require('node:assert/strict');
const { test } = require('node:test');

test('internal shop identity uses the approved Admin REST version', () => {
  const { buildAdminShopUrl } = require('../src/admin-read/shop-identity');
  assert.equal(buildAdminShopUrl('demo'), 'https://demo.myshopline.com/admin/openapi/v20260901/merchants/shop.json');
  assert.throws(() => buildAdminShopUrl('bad.handle'), /handle/i);
});

test('template product create uses the approved Admin REST version', () => {
  const { buildProductCreateUrl } = require('../src/service/product/create');
  assert.equal(buildProductCreateUrl('demo'), 'https://demo.myshopline.com/admin/openapi/v20260901/products/products.json');
  assert.throws(() => buildProductCreateUrl('bad.handle'), /handle/i);
});
