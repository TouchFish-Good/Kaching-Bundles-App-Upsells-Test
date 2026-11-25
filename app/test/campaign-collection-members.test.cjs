const assert = require('node:assert/strict');
const { test } = require('node:test');
const { resolveCollectionMembers } = require('../src/service/campaign/collection-members');

const session = { handle: 'test-shop', accessToken: 'test-token' };
const response = (ids, link = null) => ({ ok: true, status: 200, headers: { get: (name) => name === 'link' ? link : null }, json: async () => ({ products: ids.map((id) => ({ id, title: id })) }) });

test('resolves all collection pages and deduplicates product IDs', async () => {
  const seen = [];
  const fetcher = async (url) => {
    const parsed = new URL(url);
    seen.push(parsed);
    return parsed.searchParams.has('page_info') ? response(['p2', 'p3']) : response(['p1', 'p2'], '<https://elsewhere.example/?page_info=next>; rel="next"');
  };
  const ids = await resolveCollectionMembers(session, ['c1'], fetcher);
  assert.deepEqual(ids, ['p1', 'p2', 'p3']);
  assert.equal(seen.length, 2);
  assert.equal(seen[1].host, 'test-shop.myshopline.com');
  assert.equal(seen[1].searchParams.get('page_info'), 'next');
});

test('failed page never returns a partial member snapshot', async () => {
  await assert.rejects(() => resolveCollectionMembers(session, ['c1'], async (url) => new URL(url).searchParams.has('page_info')
    ? { ok: false, status: 502, headers: { get: () => null } }
    : response(['p1'], '<https://elsewhere.example/?page_info=next>; rel="next"')), /502/);
});

test('empty and invalid collection IDs are rejected before network access', async () => {
  let called = false;
  await assert.rejects(() => resolveCollectionMembers(session, [], async () => { called = true; }), /collection/i);
  await assert.rejects(() => resolveCollectionMembers(session, ['bad/id'], async () => { called = true; }), /collection/i);
  assert.equal(called, false);
});
