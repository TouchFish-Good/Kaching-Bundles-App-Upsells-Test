const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  REQUIRED_SHOPLINE_SCOPES,
  resolveShoplineScopes,
  assertAuthorizedSessionScopes,
} = require('../src/auth/scopes');

const expected = [
  'read_products',
  'write_products',
  'read_discounts',
  'write_discounts',
  'read_store_information',
  'read_markets',
  'read_translation',
  'read_orders',
];

test('missing SCOPES requests all required permissions', () => {
  assert.deepEqual(resolveShoplineScopes(undefined), expected);
  assert.deepEqual(REQUIRED_SHOPLINE_SCOPES, expected);
});

test('configured old scopes fail with every missing permission', () => {
  assert.throws(
    () => resolveShoplineScopes(expected.slice(0, 4).join(',')),
    /read_store_information.*read_markets.*read_translation/,
  );
});

test('complete scopes accept arbitrary order and whitespace', () => {
  assert.deepEqual(resolveShoplineScopes(` ${expected.toReversed().join(' , ')} `), expected.toReversed());
});

test('authorization callback rejects incomplete session scope', () => {
  assert.throws(() => assertAuthorizedSessionScopes(undefined), /read_products/);
  assert.throws(() => assertAuthorizedSessionScopes(expected.slice(0, 4).join(',')), /read_store_information/);
  assert.throws(() => assertAuthorizedSessionScopes(expected.filter((scope) => scope !== 'read_orders').join(',')), /read_orders/);
  assert.doesNotThrow(() => assertAuthorizedSessionScopes(expected.join(',')));
});

test('app manifest requests the same permissions as the SDK', () => {
  const manifest = fs.readFileSync(path.join(__dirname, '../../shopline.app.toml'), 'utf8');
  const declared = manifest.match(/^scopes\s*=\s*"([^"]+)"/m);
  assert.ok(declared);
  assert.deepEqual(new Set(declared[1].split(',')), new Set(expected));
});
