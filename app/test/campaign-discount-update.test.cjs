const assert = require('node:assert/strict');
const { test } = require('node:test');
const { updateAutomaticDiscount, DiscountRejectedError } = require('../src/service/campaign/discount-adapter');

const campaign = { id: 'offer-a', name: 'Offer A', status: 'active', scope: { kind: 'products', productIds: ['p1'], excludedProductIds: [] }, tiers: [{ tierId: 'one', displayOrder: 0, quantity: 1, discountType: 'none' }], combinesWith: { orderDiscounts: true, productDiscounts: false, shippingDiscounts: false }, startsAt: '2026-01-01T00:00:00.000Z' };
const session = { handle: 'test-shop', accessToken: 'secret-token' };
const reply = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => null }, text: async () => JSON.stringify(body) });

test('automatic app update uses Admin GraphQL and confirms the same discount ID', async () => {
  let request;
  const id = await updateAutomaticDiscount(session, 'discount-1', campaign, 'USD', 'function-1', async (url, options) => {
    request = { url, options };
    return reply({ data: { discountAutomaticAppUpdate: { automaticAppDiscount: { discountId: 'discount-1' }, userErrors: [] } } });
  });
  assert.equal(id, 'discount-1');
  assert.match(request.url, /\/admin\/graph\/v20260901\/graphql\.json$/);
  assert.equal(request.options.method, 'POST');
  const body = JSON.parse(request.options.body);
  assert.match(body.query, /discountAutomaticAppUpdate/);
  assert.equal(body.variables.id, 'discount-1');
  assert.equal(body.variables.automaticAppDiscount.functionId, 'function-1');
  assert.equal(body.variables.automaticAppDiscount.metafields[0].key, 'quantity_breaks');
});

test('automatic app update distinguishes user rejection from uncertain GraphQL errors', async () => {
  await assert.rejects(() => updateAutomaticDiscount(session, 'discount-1', campaign, 'USD', 'function-1', async () => reply({ data: { discountAutomaticAppUpdate: { automaticAppDiscount: null, userErrors: [{ code: 'INVALID', message: 'Invalid title' }] } } })), DiscountRejectedError);
  await assert.rejects(() => updateAutomaticDiscount(session, 'discount-1', campaign, 'USD', 'function-1', async () => reply({ errors: [{ message: 'REMOTE_ERROR' }] })), /uncertain/i);
});
