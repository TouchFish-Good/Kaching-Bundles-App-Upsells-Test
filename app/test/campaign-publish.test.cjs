const assert = require('node:assert/strict');
const { test } = require('node:test');
const sqlite3 = require('sqlite3');
const { CampaignRepository } = require('../src/service/campaign/repository');
const { publishCampaign, pauseCampaign } = require('../src/service/campaign/publish');
const { DiscountRejectedError } = require('../src/service/campaign/discount-adapter');

const draft = () => ({ id: 'offer-a', name: 'Offer A', status: 'draft', scope: { kind: 'products', productIds: ['product-1'], excludedProductIds: [] }, tiers: [{ tierId: 'two', displayOrder: 0, quantity: 2, discountType: 'percentage', discountValue: 1000 }], combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false }, startsAt: '2026-01-01T00:00:00.000Z' });
const session = { handle: 'shop-a', accessToken: 'token' };
const open = async () => {
  const db = new sqlite3.Database(':memory:');
  const repository = new CampaignRepository(db);
  await repository.save(session.handle, draft(), 0);
  return { db, repository };
};
const close = (db) => new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve()));

test('publishing marks active only after platform returns an ID and records it for retries', async () => {
  const { db, repository } = await open();
  try {
    const published = await publishCampaign(repository, session, 'offer-a', 1, { functionId: 'function-1', shopCurrencyCode: 'USD', create: async () => 'discount-1' });
    assert.equal(published.status, 'active');
    assert.equal(published.revision, 2);
    assert.equal((await repository.getPublication('shop-a', 'offer-a')).discountId, 'discount-1');
    assert.equal((await repository.get('shop-a', 'offer-a')).status, 'active');
    await assert.rejects(() => publishCampaign(repository, session, 'offer-a', 2, { functionId: 'function-1', shopCurrencyCode: 'USD', create: async () => 'discount-2' }), /already active/i);
  } finally { await close(db); }
});

test('definitive platform rejection retains draft and permits retry', async () => {
  const { db, repository } = await open();
  try {
    await assert.rejects(() => publishCampaign(repository, session, 'offer-a', 1, { functionId: 'function-1', shopCurrencyCode: 'USD', create: async () => { throw new DiscountRejectedError('SHOPLINE discount rejected: invalid rule'); } }), /invalid rule/);
    assert.equal((await repository.get('shop-a', 'offer-a')).status, 'draft');
    assert.equal((await repository.getPublication('shop-a', 'offer-a')).state, 'idle');
    assert.equal((await publishCampaign(repository, session, 'offer-a', 1, { functionId: 'function-1', shopCurrencyCode: 'USD', create: async () => 'discount-1' })).status, 'active');
  } finally { await close(db); }
});

test('uncertain create response prevents a second platform create', async () => {
  const { db, repository } = await open();
  try {
    let calls = 0;
    await assert.rejects(() => publishCampaign(repository, session, 'offer-a', 1, { functionId: 'function-1', shopCurrencyCode: 'USD', create: async () => { calls++; throw new Error('network timeout'); } }), /reconciliation/i);
    assert.equal((await repository.get('shop-a', 'offer-a')).status, 'draft');
    assert.equal((await repository.getPublication('shop-a', 'offer-a')).state, 'needs_reconciliation');
    await assert.rejects(() => publishCampaign(repository, session, 'offer-a', 1, { functionId: 'function-1', shopCurrencyCode: 'USD', create: async () => { calls++; return 'discount-2'; } }), /reconciliation/i);
    assert.equal(calls, 1);
  } finally { await close(db); }
});

test('pause deletes the platform discount before changing local status', async () => {
  const { db, repository } = await open();
  try {
    await publishCampaign(repository, session, 'offer-a', 1, { functionId: 'function-1', shopCurrencyCode: 'USD', create: async () => 'discount-1' });
    await assert.rejects(() => pauseCampaign(repository, session, 'offer-a', 2, { functionId: 'function-1', remove: async () => { throw new DiscountRejectedError('SHOPLINE discount rejected: cannot delete'); } }), /cannot delete/);
    assert.equal((await repository.get('shop-a', 'offer-a')).status, 'active');
    let removed;
    const paused = await pauseCampaign(repository, session, 'offer-a', 2, { functionId: 'function-1', remove: async (_session, id, _fetcher, _requestId, functionId) => { removed = { id, functionId }; } });
    assert.deepEqual(removed, { id: 'discount-1', functionId: 'function-1' });
    assert.equal(paused.status, 'paused');
    assert.equal((await repository.getPublication('shop-a', 'offer-a')).discountId, null);
  } finally { await close(db); }
});

test('missing Function ID does not reserve a pause transition', async () => {
  const { db, repository } = await open();
  try {
    await publishCampaign(repository, session, 'offer-a', 1, { functionId: 'function-1', shopCurrencyCode: 'USD', create: async () => 'discount-1' });
    await assert.rejects(() => pauseCampaign(repository, session, 'offer-a', 2, { remove: async () => {} }), /Function ID/);
    assert.equal((await repository.getPublication('shop-a', 'offer-a')).state, 'active');
  } finally { await close(db); }
});

test('future startsAt is not published or mislabeled active', async () => {
  const db = new sqlite3.Database(':memory:');
  const repository = new CampaignRepository(db);
  try {
    await repository.save('shop-a', { ...draft(), startsAt: '2099-01-01T00:00:00.000Z' }, 0);
    let calls = 0;
    await assert.rejects(() => publishCampaign(repository, session, 'offer-a', 1, {
      functionId: 'function-1', shopCurrencyCode: 'USD', create: async () => { calls++; return 'discount-1'; },
    }), /future|scheduled/i);
    assert.equal(calls, 0);
    assert.equal((await repository.get('shop-a', 'offer-a')).status, 'draft');
    assert.equal((await repository.getPublication('shop-a', 'offer-a')).state, 'idle');
  } finally { await close(db); }
});

test('past endsAt cannot be published as active', async () => {
  const db = new sqlite3.Database(':memory:');
  const repository = new CampaignRepository(db);
  try {
    await repository.save('shop-a', { ...draft(), startsAt: '2019-01-01T00:00:00.000Z', endsAt: '2020-01-01T00:00:00.000Z' }, 0);
    await assert.rejects(() => publishCampaign(repository, session, 'offer-a', 1, {
      functionId: 'function-1', shopCurrencyCode: 'USD', create: async () => 'discount-1',
    }), /ended|expired/i);
    assert.equal((await repository.get('shop-a', 'offer-a')).status, 'draft');
  } finally { await close(db); }
});

test('collection publication writes current union before creating a discount', async () => {
  const db = new sqlite3.Database(':memory:');
  const repository = new CampaignRepository(db);
  try {
    await repository.save('shop-a', { ...draft(), scope: { kind: 'collections', collectionIds: ['c1'], excludedProductIds: [] } }, 0);
    const stages = [];
    const published = await publishCampaign(repository, session, 'offer-a', 1, {
      functionId: 'function-1', shopCurrencyCode: 'USD',
      collection: {
        resolve: async () => ['p1'], storeId: async () => '12345',
        write: async (_session, id, ids) => { stages.push(['write', id, ids]); },
      },
      create: async (_session, campaign) => { stages.push(['create', campaign.scope.collectionIds]); return 'discount-1'; },
    });
    assert.equal(published.status, 'active');
    assert.deepEqual(stages, [['write', '12345', ['c1']], ['create', ['c1']]]);
    assert.deepEqual(await repository.listRequiredCollectionIds('shop-a'), ['c1']);
  } finally { await close(db); }
});

test('uncertain collection create retains the variable and prevents a second POST', async () => {
  const db = new sqlite3.Database(':memory:');
  const repository = new CampaignRepository(db);
  try {
    await repository.save('shop-a', { ...draft(), scope: { kind: 'collections', collectionIds: ['c1'], excludedProductIds: [] } }, 0);
    let creates = 0;
    const dependencies = {
      functionId: 'function-1', shopCurrencyCode: 'USD',
      collection: { resolve: async () => ['p1'], storeId: async () => '12345', write: async () => {} },
      create: async () => { creates++; throw new Error('network timeout'); },
    };
    await assert.rejects(() => publishCampaign(repository, session, 'offer-a', 1, dependencies), /reconciliation/i);
    assert.equal((await repository.getPublication('shop-a', 'offer-a')).state, 'needs_reconciliation');
    assert.deepEqual(await repository.listRequiredCollectionIds('shop-a'), ['c1']);
    await assert.rejects(() => publishCampaign(repository, session, 'offer-a', 1, dependencies), /reconciliation/i);
    assert.equal(creates, 1);
  } finally { await close(db); }
});

test('collection metafield rejection prevents discount creation', async () => {
  const db = new sqlite3.Database(':memory:');
  const repository = new CampaignRepository(db);
  try {
    await repository.save('shop-a', { ...draft(), scope: { kind: 'collections', collectionIds: ['c1'], excludedProductIds: [] } }, 0);
    let creates = 0;
    await assert.rejects(() => publishCampaign(repository, session, 'offer-a', 1, {
      functionId: 'function-1', shopCurrencyCode: 'USD',
      collection: { resolve: async () => ['p1'], storeId: async () => '12345', write: async () => { throw new DiscountRejectedError('metafield rejected'); } },
      create: async () => { creates++; return 'discount-1'; },
    }), /metafield rejected/);
    assert.equal(creates, 0);
    assert.equal((await repository.getPublication('shop-a', 'offer-a')).state, 'idle');
  } finally { await close(db); }
});

test('uncertain variable write before discount POST leaves draft retryable', async () => {
  const db = new sqlite3.Database(':memory:');
  const repository = new CampaignRepository(db);
  try {
    await repository.save('shop-a', { ...draft(), scope: { kind: 'collections', collectionIds: ['c1'], excludedProductIds: [] } }, 0);
    let creates = 0;
    await assert.rejects(() => publishCampaign(repository, session, 'offer-a', 1, {
      functionId: 'function-1', shopCurrencyCode: 'USD',
      collection: { resolve: async () => ['p1'], storeId: async () => '12345', write: async () => { throw new Error('metafield timeout'); } },
      create: async () => { creates++; return 'discount-1'; },
    }), /metafield timeout/);
    assert.equal(creates, 0);
    assert.equal((await repository.getPublication('shop-a', 'offer-a')).state, 'idle');
  } finally { await close(db); }
});

test('pausing one collection discount retains another active collection ID', async () => {
  const db = new sqlite3.Database(':memory:');
  const repository = new CampaignRepository(db);
  try {
    for (const [id, collectionId] of [['a', 'c1'], ['b', 'c2']]) {
      await repository.save('shop-a', { ...draft(), id, scope: { kind: 'collections', collectionIds: [collectionId], excludedProductIds: [] } }, 0);
    }
    const writes = [];
    const collection = { resolve: async (_session, ids) => ids[0] === 'c1' ? ['p1'] : ['p2'], storeId: async () => '12345', write: async (_session, _storeId, ids) => { writes.push(ids); } };
    await publishCampaign(repository, session, 'a', 1, { functionId: 'function-1', shopCurrencyCode: 'USD', collection, create: async () => 'discount-a' });
    await publishCampaign(repository, session, 'b', 1, { functionId: 'function-1', shopCurrencyCode: 'USD', collection, create: async () => 'discount-b' });
    const paused = await pauseCampaign(repository, session, 'a', 2, { functionId: 'function-1', collection, remove: async () => {} });
    assert.equal(paused.status, 'paused');
    assert.deepEqual(writes, [['c1'], ['c1', 'c2'], ['c2']]);
    assert.deepEqual(await repository.listRequiredCollectionIds('shop-a'), ['c2']);
  } finally { await close(db); }
});

test('pausing a collection discount removes an ID used only by another draft', async () => {
  const db = new sqlite3.Database(':memory:');
  const repository = new CampaignRepository(db);
  try {
    await repository.save('shop-a', { ...draft(), id: 'live', scope: { kind: 'collections', collectionIds: ['c1'], excludedProductIds: [] } }, 0);
    const writes = [];
    const collection = { resolve: async () => ['p1'], storeId: async () => '12345', write: async (_session, _storeId, ids) => { writes.push(ids); } };
    await publishCampaign(repository, session, 'live', 1, { functionId: 'function-1', shopCurrencyCode: 'USD', collection, create: async () => 'discount-1' });
    await repository.save('shop-a', { ...draft(), id: 'draft', scope: { kind: 'collections', collectionIds: ['c1'], excludedProductIds: [] } }, 0);
    await pauseCampaign(repository, session, 'live', 2, { functionId: 'function-1', collection, remove: async () => {} });
    assert.deepEqual(writes, [['c1'], []]);
    assert.deepEqual(await repository.listRequiredCollectionIds('shop-a'), []);
  } finally { await close(db); }
});

test('new specified-product publication takes priority over an active collection member', async () => {
  const db = new sqlite3.Database(':memory:');
  const repository = new CampaignRepository(db);
  try {
    await repository.save('shop-a', { ...draft(), id: 'collection', scope: { kind: 'collections', collectionIds: ['c1'], excludedProductIds: [] } }, 0);
    const collection = { resolve: async () => ['p2'], storeId: async () => '12345', write: async () => {} };
    await publishCampaign(repository, session, 'collection', 1, { functionId: 'function-1', shopCurrencyCode: 'USD', collection, create: async () => 'discount-c' });
    await repository.save('shop-a', { ...draft(), id: 'product', scope: { kind: 'products', productIds: ['product-1'], excludedProductIds: [] } }, 0);
    let creates = 0;
    const published = await publishCampaign(repository, session, 'product', 1, {
      functionId: 'function-1', shopCurrencyCode: 'USD',
      collection: { ...collection, resolve: async () => ['product-1'] },
      create: async () => { creates++; return 'discount-p'; },
    });
    assert.equal(published.status, 'active');
    assert.equal(creates, 1);
  } finally { await close(db); }
});

test('repository refuses to finalize a publication without a matching in-flight transition', async () => {
  const { db, repository } = await open();
  try {
    await assert.rejects(() => repository.finishPublication('shop-a', 'offer-a', 1, 'publish', 'discount-1'), /transition/i);
    assert.equal((await repository.get('shop-a', 'offer-a')).status, 'draft');
  } finally { await close(db); }
});

test('invalid shop currency does not reserve or attempt publication', async () => {
  const { db, repository } = await open();
  try {
    let calls = 0;
    await assert.rejects(() => publishCampaign(repository, session, 'offer-a', 1, {
      functionId: 'function-1', shopCurrencyCode: 'not-a-currency', create: async () => { calls++; return 'discount-1'; },
    }), /currency/i);
    assert.equal(calls, 0);
    assert.equal((await repository.getPublication('shop-a', 'offer-a')).state, 'idle');
  } finally { await close(db); }
});

test('an in-flight publication reserves product scope before the platform responds', async () => {
  const { db, repository } = await open();
  try {
    await repository.save('shop-a', { ...draft(), id: 'offer-b' }, 0);
    await repository.beginPublication('shop-a', 'offer-a', 1, 'publish');
    await assert.rejects(() => repository.beginPublication('shop-a', 'offer-b', 1, 'publish'), /overlap/i);
    assert.equal((await repository.getPublication('shop-a', 'offer-b')).state, 'idle');
  } finally { await close(db); }
});

test('an in-flight market rule reserves its currency mode', async () => {
  const { db, repository } = await open();
  try {
    const market = draft();
    market.id = 'market-offer';
    market.scope.productIds = ['product-2'];
    market.tiers[0] = { ...market.tiers[0], discountType: 'fixed_amount', discountValue: 500,
      marketOverrides: { marketEU: { mode: 'specified_amount', currencyCode: 'EUR', amountMinor: 400 } } };
    await repository.save('shop-a', market, 0);
    await repository.beginPublication('shop-a', 'market-offer', 1, 'publish');
    await assert.rejects(() => repository.beginPublication('shop-a', 'offer-a', 1, 'publish'), /currency modes/i);
  } finally { await close(db); }
});

test('collection campaigns cannot publish from a stale local membership snapshot', async () => {
  const db = new sqlite3.Database(':memory:');
  const repository = new CampaignRepository(db);
  try {
    const collection = draft();
    collection.scope = { kind: 'collections', collectionIds: ['collection-1'], resolvedProductIds: ['product-1'], excludedProductIds: [] };
    await repository.save('shop-a', collection, 0);
    let calls = 0;
    await assert.rejects(() => publishCampaign(repository, session, 'offer-a', 1, {
      functionId: 'function-1', shopCurrencyCode: 'USD',
      collection: { resolve: async () => [], storeId: async () => '12345', write: async () => { throw new Error('should not write'); } },
      create: async () => { calls++; return 'discount-1'; },
    }), /collection membership verification/i);
    assert.equal(calls, 0);
    assert.equal((await repository.getPublication('shop-a', 'offer-a')).state, 'idle');
  } finally { await close(db); }
});

test('in-flight publications consume the 35-rule capacity', async () => {
  const db = new sqlite3.Database(':memory:');
  const repository = new CampaignRepository(db);
  try {
    for (let index = 0; index < 36; index++) {
      const offer = draft();
      offer.id = `offer-${index}`;
      offer.scope.productIds = [`product-${index}`];
      await repository.save('shop-a', offer, 0);
    }
    for (let index = 0; index < 35; index++) await repository.beginPublication('shop-a', `offer-${index}`, 1, 'publish');
    await assert.rejects(() => repository.beginPublication('shop-a', 'offer-35', 1, 'publish'), /35 enabled rules/i);
  } finally { await close(db); }
});
