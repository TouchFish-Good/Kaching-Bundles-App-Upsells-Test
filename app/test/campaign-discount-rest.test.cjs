const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createAutomaticDiscount, deleteAutomaticDiscount, DiscountRejectedError } = require('../src/service/campaign/discount-adapter');
const { execFileSync } = require('node:child_process');

const session = { handle: 'test-shop', accessToken: 'private-test-token' };
const campaign = () => ({ id: 'offer-a', name: "Men's\nOffer", status: 'active', scope: { kind: 'products', productIds: ['100'], excludedProductIds: [] }, tiers: [{ tierId: 'two', displayOrder: 0, quantity: 2, discountType: 'percentage', discountValue: 1000 }], combinesWith: { orderDiscounts: true, productDiscounts: false, shippingDiscounts: false }, startsAt: '2026-01-01T00:00:00.000Z' });
const reply = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => 'trace-1' }, text: async () => JSON.stringify(body) });

test('REST Function discount request carries explicit product IDs and confirms the returned activity ID', async () => {
  let sent;
  const id = await createAutomaticDiscount(session, campaign(), 'USD', 'function-1', async (url, options) => {
    sent = { url, options, body: JSON.parse(options.body) };
    return reply({ app_discount_id: 'activity-1' });
  });
  assert.equal(id, 'activity-1');
  assert.equal(new URL(sent.url).pathname, '/admin/openapi/v20260901/sales/discount_automatic_app.json');
  assert.equal(sent.options.method, 'POST');
  assert.equal(sent.options.headers.Authorization, 'Bearer private-test-token');
  assert.equal(sent.body.function_id, 'function-1');
  assert.equal(JSON.parse(sent.body.metafields[0].value).scope.productIds[0], '100');
  assert.equal(sent.body.combines_with_modes.product_automatic_discount, false);
});

test('REST Function discount preserves all combination choices with specified market amounts', async () => {
  let sent;
  await createAutomaticDiscount(session, {
    ...campaign(),
    combinesWith: { orderDiscounts: true, productDiscounts: true, shippingDiscounts: true },
    tiers: [{ tierId: 'three', displayOrder: 0, quantity: 3, discountType: 'fixed_amount', discountValue: 100, marketOverrides: { japan: { mode: 'specified_amount', currencyCode: 'JPY', amountMinor: 100 } } }],
  }, 'JPY', 'function-1', async (_url, options) => {
    sent = JSON.parse(options.body);
    return reply({ app_discount_id: 'activity-1' });
  });
  assert.deepEqual(sent.combines_with_modes, {
    order_discount_code: true,
    order_automatic_discount: true,
    product_discount_code: true,
    product_automatic_discount: true,
    shipping_discount_code: true,
    shipping_automatic_discount: true,
  });
});

test('collection Function rule sends collection IDs without resolved product snapshot', async () => {
  let scope;
  await createAutomaticDiscount(session, { ...campaign(), scope: { kind: 'collections', collectionIds: ['c1'], resolvedProductIds: ['old-product'], excludedProductIds: [] } }, 'USD', 'function-1', async (_url, options) => {
    scope = JSON.parse(JSON.parse(options.body).metafields[0].value).scope;
    return reply({ app_discount_id: 'activity-1' });
  });
  assert.deepEqual(scope, { kind: 'collections', collectionIds: ['c1'], excludedProductIds: [] });
});

test('REST deletion uses the Function activity path and version', async () => {
  let sent;
  await deleteAutomaticDiscount(session, 'activity-1', async (url, options) => {
    sent = { url, options };
    return reply({ success: true });
  }, 'request-1', 'function-1');
  assert.equal(sent.options.method, 'DELETE');
  assert.equal(new URL(sent.url).pathname, '/admin/openapi/v20261201/sales/discount_apps/function-1/activity-1.json');
});

test('only explicit development opt-in prints an executable curl with the original token and JSON', async () => {
  const old = { nodeEnv: process.env.NODE_ENV, flag: process.env.SHOPLINE_LOG_FULL_CURL, info: console.info };
  const logs = [];
  console.info = (...parts) => logs.push(parts);
  try {
    process.env.NODE_ENV = 'development';
    process.env.SHOPLINE_LOG_FULL_CURL = '1';
    await createAutomaticDiscount(session, campaign(), 'USD', 'function-1', async () => reply({ app_discount_id: 'activity-1' }), 'request-1');
    const full = logs.find((entry) => entry[1]?.stage === 'request_curl')?.[1]?.curl;
    assert.match(full, /Authorization: Bearer private-test-token/);
    const args = execFileSync('/bin/sh', ['-c', `set -- ${full}; printf '%s\\n' "$@"`], { encoding: 'utf8' }).trimEnd().split('\n');
    assert.equal(args[0], 'curl');
    assert.equal(JSON.parse(args[args.indexOf('--data-raw') + 1]).title, "Men's\nOffer");
    assert.match(full, /-H 'Content-Type: application\/json; charset=utf-8'/);
    assert.equal(logs.find((entry) => entry[1]?.stage === 'request_curl')[1].requestId, 'request-1');
    logs.length = 0;
    process.env.NODE_ENV = 'production';
    await createAutomaticDiscount(session, campaign(), 'USD', 'function-1', async () => reply({ app_discount_id: 'activity-1' }), 'request-2');
    assert.doesNotMatch(JSON.stringify(logs), /private-test-token|Men's/);
  } finally {
    console.info = old.info;
    if (old.nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = old.nodeEnv;
    if (old.flag === undefined) delete process.env.SHOPLINE_LOG_FULL_CURL; else process.env.SHOPLINE_LOG_FULL_CURL = old.flag;
  }
});

test('REST 403 is definitive while 5xx leaves publication uncertain', async () => {
  await assert.rejects(() => createAutomaticDiscount(session, campaign(), 'USD', 'function-1', async () => reply({ errors: 'no permission' }, 403)), (error) => error instanceof DiscountRejectedError);
  await assert.rejects(() => createAutomaticDiscount(session, campaign(), 'USD', 'function-1', async () => reply({ errors: 'temporary' }, 502)), (error) => !(error instanceof DiscountRejectedError));
});

test('HTTP 200 with errors and no discount ID remains uncertain', async () => {
  await assert.rejects(
    () => createAutomaticDiscount(session, campaign(), 'USD', 'function-1', async () => reply({ errors: 'Service call fail.' })),
    (error) => !(error instanceof DiscountRejectedError) && /Service call fail/.test(error.message),
  );
});

test('malformed activity ID cannot mark a campaign published', async () => {
  await assert.rejects(
    () => createAutomaticDiscount(session, campaign(), 'USD', 'function-1', async () => reply({ app_discount_id: { id: 'activity-1' } })),
    (error) => !(error instanceof DiscountRejectedError) && /discount ID/i.test(error.message),
  );
});
