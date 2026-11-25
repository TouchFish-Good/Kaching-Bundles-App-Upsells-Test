const assert = require('node:assert/strict');
const { test } = require('node:test');
const { buildDiscountRule, createAutomaticDiscount, updateAutomaticDiscount, deleteAutomaticDiscount, DiscountRejectedError } = require('../src/service/campaign/discount-adapter');

const campaign = () => ({
  id: 'offer-a', name: 'Offer A', status: 'draft',
  scope: { kind: 'products', productIds: ['product-a'], excludedProductIds: [] },
  tiers: [{ tierId: 'three', displayOrder: 0, quantity: 3, discountType: 'fixed_amount', discountValue: 500, marketOverrides: { eu: { mode: 'specified_amount', currencyCode: 'EUR', amountMinor: 400 } } }],
  combinesWith: { orderDiscounts: true, productDiscounts: false, shippingDiscounts: true },
  startsAt: '2026-01-01T00:00:00.000Z',
});
const session = { handle: 'test-shop', accessToken: 'test-token' };
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => null }, text: async () => JSON.stringify(data) });

test('adapter builds the versioned sale rule with currency precision and preserves selected combinations', async () => {
  const rule = buildDiscountRule(campaign(), 'USD');
  assert.equal(rule.schemaVersion, 1);
  assert.equal(rule.storeCurrencyDecimals, 2);
  assert.equal(rule.tiers[0].marketOverrides.eu.currencyDecimals, 2);
  let sent;
  const fetcher = async (url, options) => {
    sent = { url, options, body: JSON.parse(options.body) };
    return response({ app_discount_id: 'discount-1' });
  };
  assert.equal(await createAutomaticDiscount(session, campaign(), 'USD', 'function-1', fetcher), 'discount-1');
  assert.match(sent.url, /\/admin\/openapi\/v20260901\/sales\/discount_automatic_app\.json$/);
  assert.equal(sent.options.headers.Accept, 'application/json');
  assert.equal(sent.options.headers['User-Agent'], 'SHOPLINE-Quantity-Breaks-App/1.0');
  const input = sent.body;
  assert.equal(input.function_id, 'function-1');
  assert.equal(input.combines_with_modes.order_automatic_discount, true);
  assert.equal(input.combines_with_modes.shipping_automatic_discount, true);
  assert.deepEqual(input.metafields[0].namespace, 'sale');
  assert.equal(input.metafields[0].key, 'quantity_breaks');
  assert.equal(JSON.parse(input.metafields[0].value).campaignId, 'offer-a');
});

test('adapter rejects missing Function ID and confirmed REST error', async () => {
  await assert.rejects(() => createAutomaticDiscount(session, campaign(), 'USD', ''), /Function ID/);
  await assert.rejects(() => createAutomaticDiscount(session, campaign(), 'USD', 'function-1', async () => response({ errors: 'Rule rejected' })), /Rule rejected/);
});

test('authorization denial is definitive and can be retried after merchant grants discounts scope', async () => {
  await assert.rejects(
    () => createAutomaticDiscount(session, campaign(), 'USD', 'function-1', async () => response({}, 403)),
    (error) => error instanceof DiscountRejectedError && /403/.test(error.message),
  );
});

test('REST diagnostics correlate a rejected result without logging credentials or payloads', async () => {
  const entries = [];
  const previousInfo = console.info;
  const previousError = console.error;
  console.info = (...parts) => entries.push(parts);
  console.error = (...parts) => entries.push(parts);
  try {
    await assert.rejects(() => createAutomaticDiscount(
      { handle: 'test-shop', accessToken: 'private-token' }, campaign(), 'USD', 'function-1',
      async () => ({
        ok: true, status: 200,
        headers: { get: (name) => name === 'x-trace-id' ? 'trace-graphql' : null },
        text: async () => JSON.stringify({ errors: 'Service call fail. private-response-detail' }),
      }), 'request-discount',
    ), /Service call fail/);
  } finally {
    console.info = previousInfo;
    console.error = previousError;
  }
  assert.deepEqual(entries.map((entry) => entry[1].stage), ['upstream_request', 'upstream_response']);
  assert.equal(entries[0][1].requestId, 'request-discount');
  assert.equal(entries[0][1].method, 'POST');
  assert.equal(entries[1][1].status, 200);
  assert.equal(entries[1][1].traceId, 'trace-graphql');
  assert.equal(typeof entries[1][1].durationMs, 'number');
  assert.doesNotMatch(JSON.stringify(entries), /private-token|private-response-detail|quantity_breaks/);
});

test('adapter uses Admin GraphQL update and Function REST delete paths', async () => {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    return response(url.includes('/graphql.json') ? { data: { discountAutomaticAppUpdate: { automaticAppDiscount: { discountId: 'discount-1' }, userErrors: [] } } } : { success: true });
  };
  await updateAutomaticDiscount(session, 'discount-1', campaign(), 'USD', 'function-1', fetcher);
  await deleteAutomaticDiscount(session, 'discount-1', fetcher, undefined, 'function-1');
  assert.match(calls[0].url, /\/admin\/graph\/v20260901\/graphql\.json$/);
  assert.equal(calls[0].options.method, 'POST');
  assert.match(calls[1].url, /\/sales\/discount_apps\/function-1\/discount-1\.json$/);
});
