import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../../theme-app-extension/public/app-block.js', import.meta.url), 'utf8');
const context = { globalThis: {} };
vm.runInNewContext(source, context);
const theme = context.globalThis.QuantityBreaksTheme;

const variants = [
  { id: 'black-s', options: { Color: 'Black', Size: 'S' }, available: true, inventoryQuantity: 2 },
  { id: 'white-l', options: { Color: 'White', Size: 'L' }, available: true, inventoryQuantity: 1 },
  { id: 'black-m', options: { Color: 'Black', Size: 'M' }, available: false, inventoryQuantity: 0 },
];

test('resolves actual combinations including sold-out choices for selection', () => {
  assert.equal(theme.resolveVariant(variants, { Color: 'Black', Size: 'S' }).id, 'black-s');
  assert.equal(theme.resolveVariant(variants, { Color: 'Black', Size: 'L' }), null);
  assert.equal(theme.resolveVariant(variants, { Color: 'Black', Size: 'M' }).id, 'black-m');
});

test('retains hidden selections when quantity tier shrinks and expands', () => {
  const selection = ['black-s', 'white-l', 'black-s'];
  assert.deepEqual(Array.from(theme.visibleSelections(selection, 2)), ['black-s', 'white-l']);
  assert.deepEqual(Array.from(theme.visibleSelections(selection, 3)), selection);
});

test('merges repeated available SKUs and leaves quantity limits to SHOPLINE', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(theme.buildCartItems(['black-s', 'white-l', 'black-s'], variants))), [
    { id: 'black-s', quantity: 2 }, { id: 'white-l', quantity: 1 },
  ]);
  assert.equal(theme.validateSelections(['black-s', 'black-s', 'black-s'], variants).reason, null);
  assert.deepEqual(JSON.parse(JSON.stringify(theme.buildCartItems(['black-s', 'black-s', 'black-s'], variants))), [{ id: 'black-s', quantity: 3 }]);
  assert.equal(theme.validateSelections(['black-m'], variants).reason, 'unavailable');
  assert.equal(theme.validateSelections(['unknown'], variants).reason, 'invalid_variant');
});

test('uses available as the sole saleability flag despite contradictory stock metadata', () => {
  for (const inventory of [
    { inventoryQuantity: 0 },
    { inventoryTracker: true, inventoryPolicy: 'deny', inventoryQuantity: 0 },
    { inventoryTracker: false, inventoryPolicy: 'continue', inventoryQuantity: 100 },
  ]) {
    assert.equal(theme.validateSelections(['sku'], [{ id: 'sku', available: true, ...inventory }]).reason, null);
    assert.equal(theme.validateSelections(['sku'], [{ id: 'sku', available: false, ...inventory }]).reason, 'unavailable');
  }
});

test('sends one documented batch add request and checks every returned SKU', async () => {
  const calls = [];
  const result = await theme.addBundle(['black-s', 'white-l', 'black-s'], variants, async (url, options) => {
    calls.push({ url, options });
    if (options.method === 'GET') return { ok: true, json: async () => ({ items: [] }) };
    return { ok: true, json: async () => ({ items: [{ id: 'black-s', quantity: 2 }, { id: 'white-l', quantity: 1 }] }) };
  });
  assert.equal(result.status, 'added');
  assert.equal(calls.filter((call) => call.options.method === 'POST').length, 1);
  assert.equal(calls[1].url, '/cart/add');
  assert.deepEqual(JSON.parse(calls[1].options.body), { items: [{ id: 'black-s', quantity: 2 }, { id: 'white-l', quantity: 1 }] });
});

test('does not claim success for incomplete or uncertain add results', async () => {
  const incomplete = await theme.addBundle(['black-s', 'white-l'], variants, async () => ({
    ok: true, json: async () => ({ items: [{ id: 'black-s', quantity: 1 }] }),
  }));
  assert.equal(incomplete.status, 'uncertain');

  const rejected = await theme.addBundle(['black-s'], variants, async () => ({ ok: false, status: 422 }));
  assert.equal(rejected.status, 'failed');

  const timeout = await theme.addBundle(['black-s'], variants, async () => { throw new Error('timeout'); });
  assert.equal(timeout.status, 'uncertain');
});

test('does not send a cart request when a variant is sold out', async () => {
  let called = false;
  const result = await theme.addBundle(['black-m'], variants, async () => { called = true; });
  assert.equal(result.status, 'invalid');
  assert.equal(called, false);
});

test('reports stock rejection when a previously available variant sells out during add', async () => {
  for (const [status, message, description] of [
    [422, 'Out of stock', 'stock not enough'],
    [200, 'Out of stock', 'stock not enough'],
    [422, ' OUT OF STOCK. ', ''],
    [422, '', 'stock not enough'],
  ]) {
    const selections = ['black-s', 'white-l', 'black-s'];
    let posts = 0;
    const result = await theme.addBundle(selections, variants, async () => {
      posts++;
      return new Response(JSON.stringify({
        cart_id: null, cart_sign: null, cart_dta: null, items: null,
        message, description, currency: null, sections: null,
      }), { status, headers: { 'Content-Type': 'application/json' } });
    }, async () => ({ items: [] }));
    assert.equal(result.status, 'invalid', `HTTP ${status}`);
    assert.equal(result.reason, 'unavailable');
    assert.equal(posts, 1, 'does not automatically retry a cart write');
    assert.deepEqual(selections, ['black-s', 'white-l', 'black-s']);
  }
});

test('keeps other cart errors failed and unreadable successful responses uncertain', async () => {
  for (const response of [
    new Response(JSON.stringify({ message: 'Invalid request', description: 'stock service unavailable' }), { status: 422 }),
    new Response('<html>Unavailable</html>', { status: 503 }),
  ]) {
    const result = await theme.addBundle(['black-s'], variants, async () => response, async () => ({ items: [] }));
    assert.equal(result.status, 'failed');
  }
  const result = await theme.addBundle(['black-s'], variants, async () => new Response('invalid json'), async () => ({ items: [] }));
  assert.equal(result.status, 'uncertain');
});

test('confirms an uncertain POST only when cart quantities grew by the requested amounts', async () => {
  const reads = [
    { items: [{ id: 'black-s', quantity: 1 }] },
    { items: [{ id: 'black-s', quantity: 3 }, { id: 'white-l', quantity: 1 }] },
  ];
  let posts = 0;
  const result = await theme.addBundle(
    ['black-s', 'white-l', 'black-s'], variants,
    async () => { posts += 1; throw new Error('connection lost'); },
    async () => reads.shift(),
  );
  assert.equal(result.status, 'added');
  assert.equal(posts, 1);
});

test('does not mistake pre-existing cart quantity for a completed add', async () => {
  const reads = [
    { items: [{ id: 'black-s', quantity: 2 }] },
    { items: [{ id: 'black-s', quantity: 2 }] },
  ];
  const result = await theme.addBundle(
    ['black-s'], variants,
    async () => { throw new Error('timeout'); },
    async () => reads.shift(),
  );
  assert.equal(result.status, 'uncertain');
});

test('uses the documented cart detail GET by default and keeps unreadable results uncertain', async () => {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, method: options.method });
    if (options.method === 'GET') return { ok: false, status: 503 };
    throw new Error('timeout');
  };
  const result = await theme.addBundle(['black-s'], variants, fetcher);
  assert.equal(result.status, 'uncertain');
  assert.deepEqual(calls.map((call) => call.method), ['GET', 'POST', 'GET']);
  assert.equal(calls[0].url, '/api/carts/ajax-cart');
});

test('theme pricing uses selected variant prices and every discount mode', () => {
  const catalog = [{ id: 'a', price: 99, compareAtPrice: 110 }, { id: 'b', price: 99, compareAtPrice: 110 }];
  const cases = [
    ['none', undefined, 19800], ['percentage', 1000, 17820],
    ['fixed_amount', 1000, 17800], ['fixed_price', 8000, 16000],
    ['bundle_fixed_amount', 1000, 18800], ['bundle_fixed_price', 15000, 15000],
  ];
  for (const [discountType, discountValue, expected] of cases) {
    const summary = theme.calculateSummary({ discountType, discountValue }, ['a', 'b'], catalog);
    assert.equal(summary.original, 19800);
    assert.equal(summary.discounted, expected, discountType);
    assert.equal(summary.savings, 19800 - expected);
  }
});

test('allocates bundle totals across slots and honors exact specified market amounts', () => {
  const variants = [{ id: 'a', price: 10 }, { id: 'b', price: 7 }];
  const bundle = theme.calculateDisplayPricing({ discountType: 'bundle_fixed_price', discountValue: 1001 }, ['a', 'b'], variants);
  assert.equal(bundle.originalMinor, 1700);
  assert.equal(bundle.discountedMinor, 1001);
  assert.deepEqual(bundle.lineDiscountedMinor, [589, 412]);
  assert.equal(bundle.lineDiscountedMinor.reduce((sum, value) => sum + value, 0), bundle.discountedMinor);

  const market = theme.calculateDisplayPricing({ discountType: 'fixed_amount', discountValue: 600 }, ['a', 'b'], variants, { mode: 'specified_amount', amountMinor: 400, currencyCode: 'EUR' });
  assert.equal(market.discountedMinor, 900);
});

test('uses the active currency precision when converting storefront variant prices to minor units', () => {
  const variants = [{ id: 'yen-item', price: 1200 }];
  const summary = theme.calculateSummary({ discountType: 'percentage', discountValue: 2500 }, ['yen-item'], variants, undefined, 'JPY');

  assert.equal(summary.original, 1200);
  assert.equal(summary.discounted, 900);
  assert.equal(theme.moneyMinor(summary.discounted, 'JPY', 'ja-JP'), '\uFFE5900');
});

test('successful cart notification calls an available theme refresh and emits the app event', () => {
  const events = [];
  let refreshed = 0;
  const host = {
    cart: { refresh: () => { refreshed++; } },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    Event: class { constructor(type) { this.type = type; } },
    document: { dispatchEvent: (event) => events.push(event) },
  };
  theme.notifyThemeCartUpdated([{ id: 'a', quantity: 2 }], host);
  assert.equal(refreshed, 1);
  assert.equal(events[0].type, 'quantity-breaks:cart-updated');
  assert.deepEqual(events[0].detail.items, [{ id: 'a', quantity: 2 }]);
  assert.equal(events[1].type, 'cart:refresh');
});
