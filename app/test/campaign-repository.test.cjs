const assert = require('node:assert/strict');
const { test } = require('node:test');
const sqlite3 = require('sqlite3');
const { CampaignRepository, CampaignConflictError } = require('../src/service/campaign/repository');

const draft = (id, productId, status = 'active') => ({
  id, name: id, status,
  scope: { kind: 'products', productIds: [productId], excludedProductIds: [] },
  tiers: [
    { tierId: 'three', displayOrder: 0, quantity: 3, discountType: 'percentage', discountValue: 2000 },
    { tierId: 'one', displayOrder: 1, quantity: 1, discountType: 'none' },
  ],
  combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
  startsAt: '2026-01-01T00:00:00.000Z',
});

test('campaign repository persists display order and isolates shops', async () => {
  const db = new sqlite3.Database(':memory:');
  try {
    const repository = new CampaignRepository(db);
    const saved = await repository.save('shop-a', draft('a', 'p1'), 0);
    assert.equal(saved.revision, 1);
    assert.deepEqual((await repository.get('shop-a', 'a')).tiers.map(t => t.quantity), [3, 1]);
    assert.equal(await repository.get('shop-b', 'a'), undefined);
    assert.deepEqual(await repository.list('shop-b'), []);
    const otherShop = await repository.save('shop-b', draft('a', 'p1'), 0);
    assert.equal(otherShop.revision, 1);
  } finally { db.close(); }
});

test('campaign repository preserves independent widget styles and legacy rows', async () => {
  const db = new sqlite3.Database(':memory:');
  try {
    const repository = new CampaignRepository(db);
    const fixture = require('./fixtures/campaign-widget-config.json');
    const first = { ...draft('first', 'p1', 'draft'), widget: { ...fixture, colors: { ...fixture.colors, card: '#123456' } } };
    const second = { ...draft('second', 'p2', 'draft'), widget: { ...fixture, colors: { ...fixture.colors, card: '#ABCDEF' } } };
    await repository.save('shop-a', first, 0);
    await repository.save('shop-a', second, 0);
    assert.equal((await repository.get('shop-a', 'first')).widget.colors.card, '#123456');
    assert.equal((await repository.get('shop-a', 'second')).widget.colors.card, '#ABCDEF');
    await repository.save('shop-a', draft('legacy', 'p3', 'draft'), 0);
    assert.equal((await repository.get('shop-a', 'legacy')).widget, undefined);
    const raw = await new Promise((resolve, reject) => db.get('SELECT campaign_json FROM quantity_breaks_campaigns WHERE id = ?', ['legacy'], (error, row) => error ? reject(error) : resolve(row)));
    assert.equal(Object.hasOwn(JSON.parse(raw.campaign_json), 'widget'), false);
  } finally { db.close(); }
});

test('campaign repository prevents overlapping active scopes and stale revisions', async () => {
  const db = new sqlite3.Database(':memory:');
  try {
    const repository = new CampaignRepository(db);
    await repository.save('shop-a', draft('a', 'p1'), 0);
    await assert.rejects(() => repository.save('shop-a', draft('b', 'p1', 'scheduled'), 0), CampaignConflictError);
    await repository.save('shop-a', draft('b', 'p1', 'paused'), 0);
    await assert.rejects(() => repository.save('shop-a', draft('a', 'p2'), 0), CampaignConflictError);
    await assert.rejects(() => repository.save('shop-a', draft('a', 'p2'), 1), /reconciliation/i);
    await assert.rejects(() => repository.delete('shop-a', 'a', 1), CampaignConflictError);
    await assert.rejects(() => repository.delete('shop-a', 'a', 1), /pause or reconcile/i);
  } finally { db.close(); }
});

test('campaign repository blocks incompatible currency modes across concurrent rules', async () => {
  const db = new sqlite3.Database(':memory:');
  try {
    const repository = new CampaignRepository(db);
    const market = draft('market', 'p1');
    market.tiers[0] = { ...market.tiers[0], discountType: 'fixed_amount', discountValue: 500,
      marketOverrides: { marketEU: { mode: 'specified_amount', currencyCode: 'EUR', amountMinor: 400 } } };
    await repository.save('shop-a', market, 0);
    await assert.rejects(() => repository.save('shop-a', draft('shop', 'p2'), 0), /currency modes/i);
    await repository.save('shop-a', draft('shop', 'p2', 'paused'), 0);
    const matching = draft('matching', 'p3');
    matching.tiers[0] = { ...matching.tiers[0], discountType: 'fixed_amount', discountValue: 500,
      marketOverrides: { marketEU: { mode: 'specified_amount', currencyCode: 'EUR', amountMinor: 400 } } };
    await repository.save('shop-a', matching, 0);
  } finally { db.close(); }
});

test('campaign repository respects the 35 enabled Function rule limit', async () => {
  const db = new sqlite3.Database(':memory:');
  try {
    const repository = new CampaignRepository(db);
    for (let index = 0; index < 35; index++) await repository.save('shop-a', draft(`offer-${index}`, `p${index}`), 0);
    await assert.rejects(() => repository.save('shop-a', draft('offer-35', 'p35'), 0), /35.*rules/i);
    await repository.save('shop-a', draft('offer-35', 'p35', 'draft'), 0);
  } finally { db.close(); }
});

test('collection publication checks the current server-resolved members against active products', async () => {
  const db = new sqlite3.Database(':memory:');
  try {
    const repository = new CampaignRepository(db);
    await repository.save('shop-a', draft('live', 'p2'), 0);
    const collection = { ...draft('collection', 'unused', 'draft'), scope: { kind: 'collections', collectionIds: ['c1'], excludedProductIds: [] } };
    await repository.save('shop-a', collection, 0);
    const priorityStarted = await repository.beginPublication('shop-a', 'collection', 1, 'publish', ['p1', 'p2']);
    assert.deepEqual(priorityStarted.scope.resolvedProductIds, ['p1', 'p2']);
    await repository.finishPublication('shop-a', 'collection', 1, 'publish', 'discount-collection');
  } finally { db.close(); }
});

test('active and uncertain classifications remain in the required shop variable union', async () => {
  const db = new sqlite3.Database(':memory:');
  try {
    const repository = new CampaignRepository(db);
    for (const [id, collectionId] of [['a', 'c1'], ['b', 'c2']]) {
      await repository.save('shop-a', { ...draft(id, 'unused', 'draft'), scope: { kind: 'collections', collectionIds: [collectionId], excludedProductIds: [] } }, 0);
      await repository.beginPublication('shop-a', id, 1, 'publish', [id]);
    }
    await repository.finishPublication('shop-a', 'a', 1, 'publish', 'discount-a');
    await repository.markPublicationFailure('shop-a', 'b', true, 'publish');
    assert.deepEqual(await repository.listRequiredCollectionIds('shop-a'), ['c1', 'c2']);
  } finally { db.close(); }
});

test('shop publication lock serializes concurrent external operations and releases on failure', async () => {
  const db = new sqlite3.Database(':memory:');
  try {
    const repository = new CampaignRepository(db);
    const order = [];
    let releaseFirst;
    const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
    const first = repository.withShopPublicationLock('shop-a', async () => { order.push('first-start'); await firstGate; order.push('first-end'); });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const second = repository.withShopPublicationLock('shop-a', async () => { order.push('second'); });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.deepEqual(order, ['first-start']);
    releaseFirst();
    await Promise.all([first, second]);
    assert.deepEqual(order, ['first-start', 'first-end', 'second']);
    await assert.rejects(() => repository.withShopPublicationLock('shop-a', async () => { throw new Error('failed'); }), /failed/);
    await repository.withShopPublicationLock('shop-a', async () => { order.push('after-failure'); });
    assert.equal(order.at(-1), 'after-failure');
  } finally { db.close(); }
});
