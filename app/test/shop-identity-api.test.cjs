const assert = require('node:assert/strict');
const { test } = require('node:test');

test('shop identity accepts only a usable name and HTTPS logo', async () => {
  const { parseShopIdentity } = require('../src/service/shop-identity');
  assert.deepEqual(parseShopIdentity({ data: { id: '7', name: ' My Shop ', standard_logo: '' } }), { storeId: '7', displayName: 'My Shop', logoUrl: null });
  assert.deepEqual(parseShopIdentity({ data: { id: 7, name: 'My Shop', standard_logo: 'http://example.com/logo.png' } }), { storeId: '7', displayName: 'My Shop', logoUrl: null });
  assert.equal(parseShopIdentity({ data: { id: 7, name: 'My Shop', standard_logo: 'https://example.com/logo.png' } }).logoUrl, 'https://example.com/logo.png');
  assert.throws(() => parseShopIdentity({ data: { id: 7, name: ' ' } }), /name/i);
});

test('shop identity endpoint requires a session and never exposes token', async () => {
  const { createShopIdentityController } = require('../src/controller/shop-identity');
  const controller = createShopIdentityController();
  const response = { locals: {}, status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } };
  await controller({}, response);
  assert.equal(response.code, 401);
  response.locals.shopline = { session: { handle: 'shop', accessToken: 'secret' } };
  await controller({}, response);
  assert.deepEqual(response.body, { shop: { storeId: 'shop' } });
  assert.equal(JSON.stringify(response.body).includes('secret'), false);
});

test('shop identity request sends SHOPLINE required JSON content type', async () => {
  const { fetchShopIdentity } = require('../src/service/shop-identity');
  let headers;
  let requestedUrl;
  const fetcher = async (url, options) => {
    requestedUrl = url;
    headers = options.headers;
    return { ok: true, json: async () => ({ data: { id: 7, name: 'My Shop', standard_logo: '' } }) };
  };
  await fetchShopIdentity('shop', 'test-token', fetcher);
  if (process.env.NODE_ENV !== 'development') assert.match(requestedUrl, /\/admin\/openapi\/v20260901\/merchants\/shop\.json$/);
  assert.equal(headers['Content-Type'], 'application/json; charset=utf-8');
  assert.equal(headers.Accept, 'application/json');
  assert.equal(headers['User-Agent'], 'SHOPLINE-Quantity-Breaks-App/1.0');
});

test('development diagnostic identity uses handle without calling the shop API', async () => {
  const { fetchShopIdentity } = require('../src/service/shop-identity');
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  try {
    const identity = await fetchShopIdentity('demo', 'test-token', async () => { throw new Error('shop API must not be called'); });
    assert.deepEqual(identity, { storeId: 'demo', displayName: 'demo', logoUrl: null });
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});
