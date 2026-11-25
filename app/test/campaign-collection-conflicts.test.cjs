const assert = require('node:assert/strict');
const { test } = require('node:test');
const sqlite3 = require('sqlite3');
const { CampaignRepository } = require('../src/service/campaign/repository');
const { refreshPublishedCollectionConflicts, scanShopsForCollectionConflicts } = require('../src/service/campaign/collection-conflicts');

const session = { handle: 'shop-a', accessToken: 'test-token' };
const draft = (id, scope) => ({ id, name: id, status: 'draft', scope, tiers: [{ tierId: 'one', displayOrder: 0, quantity: 1, discountType: 'percentage', discountValue: 1000 }], combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false }, startsAt: '2026-01-01T00:00:00.000Z' });
const close = (db) => new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve()));

test('a new collection member covered by a specified-product campaign remains clear because the product rule takes priority', async () => {
  const db = new sqlite3.Database(':memory:');
  const repository = new CampaignRepository(db);
  try {
    await repository.save('shop-a', draft('product', { kind: 'products', productIds: ['p1'], excludedProductIds: [] }), 0);
    await repository.beginPublication('shop-a', 'product', 1, 'publish');
    await repository.finishPublication('shop-a', 'product', 1, 'publish', 'discount-p');
    await repository.save('shop-a', draft('collection', { kind: 'collections', collectionIds: ['c1'], excludedProductIds: [] }), 0);
    await repository.beginPublication('shop-a', 'collection', 1, 'publish', ['p2']);
    await repository.finishPublication('shop-a', 'collection', 1, 'publish', 'discount-c');
    await refreshPublishedCollectionConflicts(repository, session, async () => ['p1', 'p2']);
    assert.deepEqual(await repository.getCollectionConflict('shop-a', 'collection'), { state: 'clear', campaignIds: [] });
    await refreshPublishedCollectionConflicts(repository, session, async () => ['p2']);
    assert.deepEqual(await repository.getCollectionConflict('shop-a', 'collection'), { state: 'clear', campaignIds: [] });
  } finally { await close(db); }
});

test('catalog failure records unknown and keeps the last complete snapshot', async () => {
  const db = new sqlite3.Database(':memory:');
  const repository = new CampaignRepository(db);
  try {
    await repository.save('shop-a', draft('collection', { kind: 'collections', collectionIds: ['c1'], excludedProductIds: [] }), 0);
    await repository.beginPublication('shop-a', 'collection', 1, 'publish', ['p2']);
    await repository.finishPublication('shop-a', 'collection', 1, 'publish', 'discount-c');
    await assert.rejects(() => refreshPublishedCollectionConflicts(repository, session, async () => { throw new Error('catalog unavailable'); }), /catalog unavailable/);
    assert.deepEqual(await repository.getCollectionConflict('shop-a', 'collection'), { state: 'unknown', campaignIds: [] });
    assert.deepEqual((await repository.get('shop-a', 'collection')).scope.resolvedProductIds, ['p2']);
  } finally { await close(db); }
});

test('scheduled scan marks classification unknown when the offline session is unavailable', async () => {
  const db = new sqlite3.Database(':memory:');
  const repository = new CampaignRepository(db);
  try {
    await repository.save('shop-a', draft('collection', { kind: 'collections', collectionIds: ['c1'], excludedProductIds: [] }), 0);
    await repository.beginPublication('shop-a', 'collection', 1, 'publish', ['p2']);
    await repository.finishPublication('shop-a', 'collection', 1, 'publish', 'discount-c');
    await scanShopsForCollectionConflicts(repository, async () => { throw new Error('offline session missing'); });
    assert.deepEqual(await repository.getCollectionConflict('shop-a', 'collection'), { state: 'unknown', campaignIds: [] });
  } finally { await close(db); }
});
