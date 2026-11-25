const assert = require('node:assert/strict');
const { test } = require('node:test');
const sqlite3 = require('sqlite3');
const { CampaignRepository, CampaignValidationError } = require('../src/service/campaign/repository');
const { createCampaignsController } = require('../src/controller/campaigns');
const { DiscountRejectedError } = require('../src/service/campaign/discount-adapter');

const draft = () => ({ id: 'offer-a', name: 'Offer A', status: 'draft', scope: { kind: 'products', productIds: ['product-1'], excludedProductIds: [] }, tiers: [{ tierId: 'one', displayOrder: 0, quantity: 1, discountType: 'none' }], combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false }, startsAt: '2026-01-01T00:00:00.000Z' });
const allProductDraft = () => ({ ...draft(), scope: { kind: 'all', excludedProductIds: [] } });
const response = (shop) => ({ locals: { shopline: shop ? { session: { handle: shop, accessToken: 'token' } } : {} }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });

test('campaign API requires session, isolates shops and saves a draft', async () => {
  const db = new sqlite3.Database(':memory:');
  try {
    const handler = createCampaignsController(new CampaignRepository(db));
    const denied = response();
    await handler({ method: 'GET', params: {}, body: '' }, denied);
    assert.equal(denied.code, 401);
    const created = response('shop-a');
    await handler({ method: 'POST', params: {}, body: JSON.stringify({ campaign: draft(), expectedRevision: 0 }) }, created);
    assert.equal(created.code, 201);
    assert.equal(created.body.campaign.revision, 1);
    const otherShop = response('shop-b');
    await handler({ method: 'GET', params: {}, body: '' }, otherShop);
    assert.deepEqual(otherShop.body.campaigns, []);
  } finally { db.close(); }
});

test('campaign list exposes persisted collection conflict state without changing activity status', async () => {
  const db = new sqlite3.Database(':memory:');
  const repository = new CampaignRepository(db);
  try {
    await repository.save('shop-a', { ...draft(), scope: { kind: 'collections', collectionIds: ['c1'], excludedProductIds: [] } }, 0);
    await repository.setCollectionConflict('shop-a', 'offer-a', 'conflict', ['other']);
    const result = response('shop-a');
    await createCampaignsController(repository)({ method: 'GET', params: {}, body: '' }, result);
    assert.deepEqual(result.body.campaigns[0].collectionConflict, { state: 'conflict', campaignIds: ['other'] });
    assert.equal(result.body.campaigns[0].status, 'draft');
  } finally { await new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve())); }
});

test('campaign list exposes a platform discount ID only to the authenticated admin', async () => {
  const db = new sqlite3.Database(':memory:');
  const repository = new CampaignRepository(db);
  try {
    await repository.save('shop-a', draft(), 0);
    await repository.beginPublication('shop-a', 'offer-a', 1, 'publish');
    await repository.finishPublication('shop-a', 'offer-a', 1, 'publish', '7757655103080239428');
    const result = response('shop-a');
    await createCampaignsController(repository)({ method: 'GET', params: {}, body: '' }, result);
    assert.equal(result.body.campaigns[0].platformDiscountId, '7757655103080239428');
  } finally { await new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve())); }
});

test('campaign API rejects direct active writes and requires the status endpoint', async () => {
  const db = new sqlite3.Database(':memory:');
  const repository = new CampaignRepository(db);
  try {
    const handler = createCampaignsController(repository);
    const campaign = draft(); campaign.status = 'active';
    const result = response('shop-a');
    await handler({ method: 'POST', params: {}, body: JSON.stringify({ campaign, expectedRevision: 0 }) }, result);
    assert.equal(result.code, 409);
    assert.match(result.body.error, /saved as Draft/i);
  } finally { await repository.list('shop-a'); await new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve())); }
});

test('active campaign updates the same platform discount and retains its status', async () => {
  const db = new sqlite3.Database(':memory:');
  const repository = new CampaignRepository(db);
  try {
    await repository.save('shop-a', draft(), 0);
    await repository.beginPublication('shop-a', 'offer-a', 1, 'publish');
    await repository.finishPublication('shop-a', 'offer-a', 1, 'publish', 'discount-1');
    const calls = [];
    const handler = createCampaignsController(repository, {
      functionId: 'function-1', getShopCurrencyCode: async () => 'USD', verifyProducts: async () => {},
      updateDiscount: async (_session, id, candidate) => { calls.push({ id, name: candidate.name }); return id; },
    });
    const updated = response('shop-a');
    await handler({ method: 'PUT', params: { id: 'offer-a' }, body: JSON.stringify({ campaign: { ...draft(), name: 'Updated', status: 'paused' }, expectedRevision: 2 }) }, updated);
    assert.equal(updated.code, 200);
    assert.equal(updated.body.campaign.status, 'active');
    assert.equal(updated.body.campaign.name, 'Updated');
    assert.deepEqual(calls, [{ id: 'discount-1', name: 'Updated' }]);
    assert.equal((await repository.getPublication('shop-a', 'offer-a')).discountId, 'discount-1');
  } finally { await new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve())); }
});

test('rejected platform update leaves published campaign and revision unchanged', async () => {
  const db = new sqlite3.Database(':memory:');
  const repository = new CampaignRepository(db);
  try {
    await repository.save('shop-a', draft(), 0);
    await repository.beginPublication('shop-a', 'offer-a', 1, 'publish');
    await repository.finishPublication('shop-a', 'offer-a', 1, 'publish', 'discount-1');
    const handler = createCampaignsController(repository, {
      functionId: 'function-1', getShopCurrencyCode: async () => 'USD', verifyProducts: async () => {},
      updateDiscount: async () => { throw new DiscountRejectedError('Platform rejected update.'); },
    });
    const rejected = response('shop-a');
    await handler({ method: 'PUT', params: { id: 'offer-a' }, body: JSON.stringify({ campaign: { ...draft(), name: 'Rejected' }, expectedRevision: 2 }) }, rejected);
    assert.equal(rejected.code, 502);
    assert.equal((await repository.get('shop-a', 'offer-a')).name, 'Offer A');
    assert.equal((await repository.get('shop-a', 'offer-a')).revision, 2);
    assert.equal((await repository.getPublication('shop-a', 'offer-a')).state, 'active');
  } finally { await new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve())); }
});

test('uncertain platform update locks publication for reconciliation', async () => {
  const db = new sqlite3.Database(':memory:');
  const repository = new CampaignRepository(db);
  try {
    await repository.save('shop-a', draft(), 0);
    await repository.beginPublication('shop-a', 'offer-a', 1, 'publish');
    await repository.finishPublication('shop-a', 'offer-a', 1, 'publish', 'discount-1');
    const handler = createCampaignsController(repository, {
      functionId: 'function-1', getShopCurrencyCode: async () => 'USD', verifyProducts: async () => {},
      updateDiscount: async () => { throw new Error('Network timeout'); },
    });
    const uncertain = response('shop-a');
    await handler({ method: 'PUT', params: { id: 'offer-a' }, body: JSON.stringify({ campaign: { ...draft(), name: 'Uncertain' }, expectedRevision: 2 }) }, uncertain);
    assert.equal(uncertain.code, 409);
    assert.equal((await repository.get('shop-a', 'offer-a')).name, 'Offer A');
    assert.equal((await repository.getPublication('shop-a', 'offer-a')).state, 'needs_reconciliation');
    assert.equal((await repository.getStagedUpdate('shop-a', 'offer-a')).candidate.name, 'Uncertain');
  } finally { await new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve())); }
});

test('active update stages the candidate before the platform call and commits it afterward', async () => {
  const db = new sqlite3.Database(':memory:');
  const repository = new CampaignRepository(db);
  try {
    await repository.save('shop-a', draft(), 0);
    await repository.beginPublication('shop-a', 'offer-a', 1, 'publish');
    await repository.finishPublication('shop-a', 'offer-a', 1, 'publish', 'discount-1');
    const handler = createCampaignsController(repository, {
      functionId: 'function-1', getShopCurrencyCode: async () => 'USD', verifyProducts: async () => {},
      updateDiscount: async () => {
        assert.equal((await repository.get('shop-a', 'offer-a')).name, 'Offer A');
        assert.equal((await repository.getPublication('shop-a', 'offer-a')).state, 'updating');
        assert.equal((await repository.getStagedUpdate('shop-a', 'offer-a')).candidate.name, 'Updated');
        return 'discount-1';
      },
    });
    const result = response('shop-a');
    await handler({ method: 'PUT', params: { id: 'offer-a' }, body: JSON.stringify({ campaign: { ...draft(), name: 'Updated' }, expectedRevision: 2 }) }, result);
    assert.equal(result.code, 200);
    assert.equal((await repository.getPublication('shop-a', 'offer-a')).state, 'active');
    assert.equal(await repository.getStagedUpdate('shop-a', 'offer-a'), null);
  } finally { await new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve())); }
});

test('staged update survives repository restart and blocks another write', async () => {
  const db = new sqlite3.Database(':memory:');
  try {
    const first = new CampaignRepository(db);
    await first.save('shop-a', draft(), 0);
    await first.beginPublication('shop-a', 'offer-a', 1, 'publish');
    await first.finishPublication('shop-a', 'offer-a', 1, 'publish', 'discount-1');
    await first.beginUpdate('shop-a', { ...draft(), name: 'Staged', status: 'active' }, 2, 'discount-1');
    const restarted = new CampaignRepository(db);
    assert.equal((await restarted.get('shop-a', 'offer-a')).name, 'Offer A');
    assert.equal((await restarted.getStagedUpdate('shop-a', 'offer-a')).candidate.name, 'Staged');
    assert.equal((await restarted.getPublication('shop-a', 'offer-a')).state, 'updating');
    await assert.rejects(() => restarted.save('shop-a', draft(), 2), /reconciliation/i);
  } finally { await new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve())); }
});

test('campaign status API publishes only a saved draft and rejects stale revisions', async () => {
  const db = new sqlite3.Database(':memory:');
  try {
    let platformCalls = 0;
    const handler = createCampaignsController(new CampaignRepository(db), {
      getShopCurrencyCode: async () => 'USD', functionId: 'function-1',
      publicationEnabled: true, verifyProducts: async () => {},
      createDiscount: async () => { platformCalls++; return 'discount-1'; },
    });
    const created = response('shop-a');
    await handler({ method: 'POST', params: {}, body: JSON.stringify({ campaign: draft(), expectedRevision: 0 }) }, created);
    const stale = response('shop-a');
    await handler({ method: 'POST', params: { id: 'offer-a' }, path: '/api/quantity-breaks/campaigns/offer-a/status', body: JSON.stringify({ status: 'active', expectedRevision: 0 }) }, stale);
    assert.equal(stale.code, 409);
    assert.equal(platformCalls, 0);
    const active = response('shop-a');
    await handler({ method: 'POST', params: { id: 'offer-a' }, path: '/api/quantity-breaks/campaigns/offer-a/status', body: JSON.stringify({ status: 'active', expectedRevision: 1 }) }, active);
    assert.equal(active.code, 200);
    assert.equal(active.body.campaign.status, 'active');
    assert.equal(platformCalls, 1);
    const directDelete = response('shop-a');
    await handler({ method: 'DELETE', params: { id: 'offer-a' }, body: JSON.stringify({ expectedRevision: 2 }) }, directDelete);
    assert.equal(directDelete.code, 409);
  } finally { db.close(); }
});

test('manual publication of selected products uses the configured Function ID by default', async () => {
  const db = new sqlite3.Database(':memory:');
  const repository = new CampaignRepository(db);
  try {
    await repository.save('shop-a', draft(), 0);
    let suppliedFunctionId;
    let suppliedScope;
    let suppliedRequestId;
    const handler = createCampaignsController(repository, {
      publicationEnabled: true,
      getShopCurrencyCode: async () => 'USD', verifyProducts: async () => {},
      createDiscount: async (_session, campaign, _currency, functionId, _fetcher, requestId) => {
        suppliedFunctionId = functionId;
        suppliedScope = campaign.scope;
        suppliedRequestId = requestId;
        return 'discount-1';
      },
    });
    const result = response('shop-a');
    result.locals.quantityBreaksRequestId = 'request-discount';
    await handler({ method: 'POST', params: { id: 'offer-a' }, path: '/api/quantity-breaks/campaigns/offer-a/status', body: JSON.stringify({ status: 'active', expectedRevision: 1 }) }, result);
    assert.equal(result.code, 200);
    assert.equal(result.body.campaign.status, 'active');
    assert.equal(suppliedFunctionId, '754292a155d740809a5437a3f8c59231');
    assert.equal(suppliedRequestId, 'request-discount');
    assert.deepEqual(suppliedScope, draft().scope);
    assert.equal((await repository.getPublication('shop-a', 'offer-a')).discountId, 'discount-1');
  } finally { await new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve())); }
});

test('publication logs the failing currency lookup stage without attempting a discount', async () => {
  const db = new sqlite3.Database(':memory:');
  const repository = new CampaignRepository(db);
  const entries = [];
  const previousInfo = console.info;
  const previousError = console.error;
  let platformCalls = 0;
  try {
    await repository.save('shop-a', draft(), 0);
    const handler = createCampaignsController(repository, {
      publicationEnabled: true,
      getShopCurrencyCode: async () => { throw new Error('SHOPLINE Admin API /currency/currencies.json returned 436.'); }, verifyProducts: async () => {},
      createDiscount: async () => { platformCalls++; return 'discount-1'; },
    });
    console.info = (...parts) => entries.push(parts);
    console.error = (...parts) => entries.push(parts);
    const result = response('shop-a');
    result.locals.quantityBreaksRequestId = 'request-publish';
    await handler({ method: 'POST', params: { id: 'offer-a' }, path: '/api/quantity-breaks/campaigns/offer-a/status', body: JSON.stringify({ status: 'active', expectedRevision: 1 }) }, result);
    assert.equal(result.code, 502);
    assert.equal(platformCalls, 0);
    assert.equal((await repository.getPublication('shop-a', 'offer-a')).state, 'idle');
    assert.deepEqual(entries.map((entry) => entry[1].stage), ['currency_lookup_start', 'failed']);
    assert.equal(entries[1][1].phase, 'currency_lookup');
    assert.equal(entries[1][1].upstreamStatus, 436);
    assert.equal(entries.every((entry) => entry[1].requestId === 'request-publish'), true);
    assert.equal(JSON.stringify(entries).includes('token'), false);
  } finally {
    console.info = previousInfo;
    console.error = previousError;
    await new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve()));
  }
});

test('manual publication rejects all products before platform calls', async () => {
  const db = new sqlite3.Database(':memory:');
  const repository = new CampaignRepository(db);
  try {
    await repository.save('shop-a', allProductDraft(), 0);
    let platformCalls = 0;
    const handler = createCampaignsController(repository, {
      publicationEnabled: true,
      getShopCurrencyCode: async () => 'USD',
      createDiscount: async () => { platformCalls++; return 'discount-1'; },
    });
    const result = response('shop-a');
    await handler({ method: 'POST', params: { id: 'offer-a' }, path: '/api/quantity-breaks/campaigns/offer-a/status', body: JSON.stringify({ status: 'active', expectedRevision: 1 }) }, result);
    assert.equal(result.code, 409);
    assert.match(result.body.error, /specified products or collections/i);
    assert.equal(platformCalls, 0);
    assert.equal((await repository.getPublication('shop-a', 'offer-a')).state, 'idle');
  } finally { await new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve())); }
});

test('manual publication of selected collections delegates current membership verification to the service', async () => {
  const db = new sqlite3.Database(':memory:');
  const repository = new CampaignRepository(db);
  try {
    await repository.save('shop-a', { ...draft(), scope: { kind: 'collections', collectionIds: ['c1'], excludedProductIds: [] } }, 0);
    let calls = 0;
    const handler = createCampaignsController(repository, {
      publicationEnabled: true,
      getShopCurrencyCode: async () => 'USD',
      collection: { resolve: async () => ['product-1'], storeId: async () => '12345', write: async () => {} },
      createDiscount: async () => { calls++; return 'discount-c1'; },
    });
    const result = response('shop-a');
    await handler({ method: 'POST', params: { id: 'offer-a' }, path: '/api/quantity-breaks/campaigns/offer-a/status', body: JSON.stringify({ status: 'active', expectedRevision: 1 }) }, result);
    assert.equal(result.code, 200);
    assert.equal(result.body.campaign.status, 'active');
    assert.equal(calls, 1);
  } finally { await new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve())); }
});

test('missing selected product fails before currency lookup and publication lock', async () => {
  const db = new sqlite3.Database(':memory:');
  const repository = new CampaignRepository(db);
  try {
    await repository.save('shop-a', draft(), 0);
    let currencyCalls = 0;
    let platformCalls = 0;
    const handler = createCampaignsController(repository, {
      publicationEnabled: true,
      verifyProducts: async (_session, ids) => { assert.deepEqual(ids, ['product-1']); throw new CampaignValidationError('Selected SHOPLINE product product-1 is unavailable.'); },
      getShopCurrencyCode: async () => { currencyCalls++; return 'USD'; },
      createDiscount: async () => { platformCalls++; return 'discount-1'; },
    });
    const result = response('shop-a');
    await handler({ method: 'POST', params: { id: 'offer-a' }, path: '/api/quantity-breaks/campaigns/offer-a/status', body: JSON.stringify({ status: 'active', expectedRevision: 1 }) }, result);
    assert.equal(result.code, 400);
    assert.match(result.body.error, /unavailable/i);
    assert.equal(currencyCalls, 0);
    assert.equal(platformCalls, 0);
    assert.equal((await repository.getPublication('shop-a', 'offer-a')).state, 'idle');
  } finally { await new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve())); }
});

test('manual publication of a missing campaign reports missing', async () => {
  const db = new sqlite3.Database(':memory:');
  const repository = new CampaignRepository(db);
  try {
    const handler = createCampaignsController(repository, { publicationEnabled: true, getShopCurrencyCode: async () => 'USD', createDiscount: async () => 'discount-1' });
    const result = response('shop-a');
    await handler({ method: 'POST', params: { id: 'missing' }, path: '/api/quantity-breaks/campaigns/missing/status', body: JSON.stringify({ status: 'active', expectedRevision: 1 }) }, result);
    assert.equal(result.code, 409);
    assert.match(result.body.error, /not found/i);
  } finally { await new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve())); }
});

test('an explicit server setting can disable publication', async () => {
  const db = new sqlite3.Database(':memory:');
  const repository = new CampaignRepository(db);
  try {
    await repository.save('shop-a', draft(), 0);
    let platformCalls = 0;
    const handler = createCampaignsController(repository, {
      publicationEnabled: false, functionId: 'function-1', getShopCurrencyCode: async () => 'USD',
      createDiscount: async () => { platformCalls++; return 'discount-1'; },
    });
    const result = response('shop-a');
    await handler({ method: 'POST', params: { id: 'offer-a' }, path: '/api/quantity-breaks/campaigns/offer-a/status', body: JSON.stringify({ status: 'active', expectedRevision: 1 }) }, result);
    assert.equal(result.code, 409);
    assert.match(result.body.error, /disabled/i);
    assert.equal(platformCalls, 0);
    assert.equal((await repository.getPublication('shop-a', 'offer-a')).state, 'idle');
  } finally { await new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve())); }
});

test('publication proceeds when the server does not define a publication gate', async () => {
  const db = new sqlite3.Database(':memory:');
  const repository = new CampaignRepository(db);
  const oldSetting = process.env.SHOPLINE_QUANTITY_BREAKS_PUBLICATION_ENABLED;
  try {
    delete process.env.SHOPLINE_QUANTITY_BREAKS_PUBLICATION_ENABLED;
    await repository.save('shop-a', draft(), 0);
    let platformCalls = 0;
    const handler = createCampaignsController(repository, {
      functionId: 'function-1',
      getShopCurrencyCode: async () => 'USD',
      verifyProducts: async () => {},
      createDiscount: async () => { platformCalls++; return 'discount-1'; },
    });
    const result = response('shop-a');
    await handler({ method: 'POST', params: { id: 'offer-a' }, path: '/api/quantity-breaks/campaigns/offer-a/status', body: JSON.stringify({ status: 'active', expectedRevision: 1 }) }, result);
    assert.equal(result.code, 200);
    assert.equal(platformCalls, 1);
    assert.equal(result.body.campaign.status, 'active');
    assert.equal((await repository.getPublication('shop-a', 'offer-a')).discountId, 'discount-1');
  } finally {
    if (oldSetting === undefined) delete process.env.SHOPLINE_QUANTITY_BREAKS_PUBLICATION_ENABLED; else process.env.SHOPLINE_QUANTITY_BREAKS_PUBLICATION_ENABLED = oldSetting;
    await new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve()));
  }
});

test('disabled publication still permits emergency pause of an active campaign', async () => {
  const db = new sqlite3.Database(':memory:');
  const repository = new CampaignRepository(db);
  try {
    await repository.save('shop-a', draft(), 0);
    await repository.beginPublication('shop-a', 'offer-a', 1, 'publish');
    await repository.finishPublication('shop-a', 'offer-a', 1, 'publish', 'discount-1');
    let removed;
    const handler = createCampaignsController(repository, {
      publicationEnabled: false,
      deleteDiscount: async (_session, discountId) => { removed = discountId; },
    });
    const result = response('shop-a');
    await handler({ method: 'POST', params: { id: 'offer-a' }, path: '/api/quantity-breaks/campaigns/offer-a/status', body: JSON.stringify({ status: 'paused', expectedRevision: 2 }) }, result);
    assert.equal(result.code, 200);
    assert.equal(result.body.campaign.status, 'paused');
    assert.equal(removed, 'discount-1');
  } finally { await new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve())); }
});
