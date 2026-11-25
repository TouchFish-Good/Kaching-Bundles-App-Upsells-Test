const assert = require('node:assert/strict');
const { test } = require('node:test');
const sqlite3 = require('sqlite3');
const { CampaignRepository } = require('../src/service/campaign/repository');
const { createStorefrontCampaignController } = require('../src/controller/storefront-campaign');

const campaign = (id, productId) => ({
  id, name: `Campaign ${id}`, status: 'draft',
  scope: { kind: 'products', productIds: [productId], excludedProductIds: [] },
  tiers: [{ tierId: 'two', displayOrder: 0, quantity: 2, discountType: 'percentage', discountValue: 1000, label: 'Duo' }],
  combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
  startsAt: '2026-01-01T00:00:00.000Z',
});
const response = () => ({
  headers: {}, status(code) { this.code = code; return this; },
  set(name, value) { this.headers[name] = value; return this; },
  json(body) { this.body = body; return this; },
});
const close = (db) => new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve()));

test('storefront only exposes an active published campaign for the requested shop and product', async () => {
  const db = new sqlite3.Database(':memory:');
  const repository = new CampaignRepository(db);
  try {
    await repository.save('shop-a', campaign('live', 'product-1'), 0);
    await repository.save('shop-a', campaign('draft', 'product-2'), 0);
    await repository.save('shop-b', campaign('other', 'product-1'), 0);
    await repository.beginPublication('shop-a', 'live', 1, 'publish');
    await repository.finishPublication('shop-a', 'live', 1, 'publish', 'discount-private');
    const handler = createStorefrontCampaignController(repository);
    const result = response();
    await handler({ query: { shop: 'shop-a', productId: 'product-1' } }, result);
    assert.equal(result.code, 200);
    assert.equal(result.body.campaign.id, 'live');
    assert.deepEqual(result.body.campaign.tiers, [{ tierId: 'two', quantity: 2, discountType: 'percentage', discountValue: 1000, label: 'Duo' }]);
    assert.equal(JSON.stringify(result.body).includes('discount-private'), false);
    assert.equal(JSON.stringify(result.body).includes('product-2'), false);
    assert.equal(result.headers['Cache-Control'], 'no-store');
    const missing = response();
    await handler({ query: { shop: 'shop-a', productId: 'product-2' } }, missing);
    assert.equal(missing.code, 404);
    const other = response();
    await handler({ query: { shop: 'shop-b', productId: 'product-1' } }, other);
    assert.equal(other.code, 404);
  } finally { await close(db); }
});

test('storefront rejects malformed tenant and product identifiers without querying campaigns', async () => {
  let calls = 0;
  const handler = createStorefrontCampaignController({ list: async () => { calls++; return []; } });
  const result = response();
  await handler({ query: { shop: '../shop-a', productId: 'product-1' } }, result);
  assert.equal(result.code, 400);
  assert.equal(calls, 0);
});

test('public campaign exposes current storefront copy and leaves an unset title empty', async () => {
  const live = { ...campaign('live', 'product-1'), status: 'active' };
  const repository = { list: async () => [live], getPublication: async () => ({ state: 'active' }) };
  const read = async (shop, locale) => shop === 'shop-a' && locale === 'fr' ? { 'widget.title': 'Offre groupée', 'widget.cart_failure': 'Private text' } : {};
  const handler = createStorefrontCampaignController(repository, { read });
  const translated = response();
  await handler({ query: { shop: 'shop-a', productId: 'product-1', locale: 'fr' } }, translated);
  assert.equal(translated.body.campaign.widgetTitle, 'Offre groupée');
  assert.equal(translated.body.campaign.copy['widget.cart_failure'], 'Private text');
  const unset = response();
  await handler({ query: { shop: 'shop-a', productId: 'product-1', locale: 'en' } }, unset);
  assert.equal(unset.body.campaign.widgetTitle, '');
  assert.deepEqual(unset.body.campaign.copy, {});
});

test('storefront still serves a published campaign when its optional title translation cannot be read', async () => {
  const live = { ...campaign('live', 'product-1'), status: 'active' };
  const handler = createStorefrontCampaignController(
    { list: async () => [live], getPublication: async () => ({ state: 'active' }) },
    { read: async () => { throw new Error('translation store unavailable'); } },
  );
  const result = response();
  await handler({ query: { shop: 'shop-a', productId: 'product-1', locale: 'fr' } }, result);
  assert.equal(result.code, 200);
  assert.equal(result.body.campaign.widgetTitle, '');
});

test('storefront hides excluded, future, ended and conflicting campaigns', async () => {
  const base = { ...campaign('active', 'product-1'), status: 'active' };
  const handlerFor = (campaigns) => createStorefrontCampaignController({
    list: async () => campaigns,
    getPublication: async () => ({ state: 'active' }),
  });
  const query = { query: { shop: 'shop-a', productId: 'product-1' } };
  for (const override of [
    { scope: { ...base.scope, excludedProductIds: ['product-1'] } },
    { startsAt: new Date(Date.now() + 60_000).toISOString() },
    { endsAt: new Date(Date.now() - 60_000).toISOString() },
  ]) {
    const result = response();
    await handlerFor([{ ...base, ...override }])(query, result);
    assert.equal(result.code, 404);
  }
  const conflict = response();
  await handlerFor([base, { ...base, id: 'other' }])(query, conflict);
  assert.equal(conflict.code, 409);
});

test('storefront hides a campaign while an online update is awaiting reconciliation', async () => {
  const live = { ...campaign('live', 'product-1'), status: 'active' };
  const handler = createStorefrontCampaignController({ list: async () => [live], getPublication: async () => ({ state: 'updating' }) });
  const result = response();
  await handler({ query: { shop: 'shop-a', productId: 'product-1' } }, result);
  assert.equal(result.code, 404);
});
