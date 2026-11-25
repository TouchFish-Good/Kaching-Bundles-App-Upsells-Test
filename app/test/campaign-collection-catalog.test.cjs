const assert = require('node:assert/strict');
const { test } = require('node:test');
const { searchCampaignCollections, getCampaignCollection, searchCollectionProducts } = require('../src/service/campaign/collection-catalog');

const session = { handle: 'shop-a', accessToken: 'test-token' };
const response = (body, link = null, status = 200) => ({
  ok: status >= 200 && status < 300, status,
  headers: { get: (key) => key === 'link' ? link : null },
  json: async () => body,
});

test('manual and smart collections use fixed endpoints, headers, and 50 item pages', async () => {
  for (const [kind, segment, field] of [['manual', 'custom', 'custom_collections'], ['smart', 'smart', 'smart_collections']]) {
    let sent;
    const page = await searchCampaignCollections(session, kind, 'Summer', undefined, async (url, options) => {
      sent = { url: new URL(url), options };
      return response({ [field]: [{ id: '123', title: 'Summer' }] }, '<https://other.example/?page_info=next>; rel="next"');
    });
    assert.equal(sent.url.pathname, `/admin/openapi/v20260901/products/${segment}_collections.json`);
    assert.equal(sent.url.searchParams.get('limit'), '50');
    assert.equal(sent.url.searchParams.get('title'), 'Summer');
    assert.equal(sent.options.headers.Authorization, 'Bearer test-token');
    assert.equal(sent.options.headers.Accept, 'application/json');
    assert.equal(sent.options.headers['User-Agent'], 'SHOPLINE-Quantity-Breaks-App/1.0');
    assert.deepEqual(page.collections, [{ id: '123', title: 'Summer', kind, imageUrl: null }]);
    assert.equal(page.nextPageInfo, 'next');
  }
});

test('collection paging only reuses cursor, never the upstream link URL', async () => {
  let sent;
  await searchCampaignCollections(session, 'manual', '', 'cursor-2', async (url) => {
    sent = new URL(url);
    return response({ custom_collections: [] });
  });
  assert.equal(sent.hostname, 'shop-a.myshopline.com');
  assert.equal(sent.searchParams.get('page_info'), 'cursor-2');
  await assert.rejects(() => searchCampaignCollections(session, 'manual', '', 'same', async () => response({ custom_collections: [] }, 'page_info=same; rel=next')), /pagination/i);
});

test('collection detail restores title and type; products preview is paged', async () => {
  const collection = await getCampaignCollection(session, '123', async (url) => {
    assert.equal(new URL(url).pathname, '/admin/openapi/v20260901/products/collections/123.json');
    return response({ collection: { id: '123', title: 'Summer', collection_type: 'custom' } });
  });
  assert.deepEqual(collection, { id: '123', title: 'Summer', kind: 'manual', imageUrl: null });
  const products = await searchCollectionProducts(session, '123', undefined, async (url) => {
    assert.equal(new URL(url).pathname, '/admin/openapi/v20260901/products/collections/123/products.json');
    assert.equal(new URL(url).searchParams.get('limit'), '50');
    return response({ products: [{ id: 'p1', title: 'Item', image: { src: 'https://img.example/p.png' } }] });
  });
  assert.deepEqual(products.products, [{ id: 'p1', title: 'Item', imageUrl: 'https://img.example/p.png' }]);
});

test('collection search and detail preserve SHOPLINE collection cover images', async () => {
  const page = await searchCampaignCollections(session, 'manual', '', undefined, async () => response({
    custom_collections: [{ id: '123', title: 'Summer', image: { src: 'https://img.example/summer.png' } }],
  }));
  assert.equal(page.collections[0].imageUrl, 'https://img.example/summer.png');
  const collection = await getCampaignCollection(session, '123', async () => response({
    collection: { id: '123', title: 'Summer', collection_type: 'custom', image: { src: 'https://img.example/summer.png' } },
  }));
  assert.equal(collection.imageUrl, 'https://img.example/summer.png');
});

test('invalid collection input and oversized upstream pages are rejected', async () => {
  await assert.rejects(() => getCampaignCollection(session, '../bad', async () => response({})), /invalid/i);
  await assert.rejects(() => searchCampaignCollections(session, 'manual', '', undefined, async () => response({ custom_collections: Array.from({ length: 51 }, (_, i) => ({ id: String(i), title: 'A' })) })), /50|invalid/i);
  await assert.rejects(() => searchCollectionProducts(session, '123', undefined, async () => response({ products: null })), /invalid/i);
});
