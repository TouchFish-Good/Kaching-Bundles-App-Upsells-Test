const assert = require('node:assert/strict');
const { test } = require('node:test');
const { searchCampaignProducts, getCampaignProduct, getCampaignProducts, verifyCampaignProducts } = require('../src/service/campaign/product-catalog');

const session = { handle: 'shop-a', accessToken: 'test-token' };
const result = (products, link = null, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name) => name === 'link' ? link : null },
  json: async () => ({ products }),
});

test('catalog search uses authenticated SHOPLINE product IDs and a validated next cursor', async () => {
  let sent;
  const page = await searchCampaignProducts(session, 'Serum', undefined, async (url, options) => {
    sent = { url: new URL(url), options };
    return result([
      { id: '100', title: 'Serum', image: { src: 'https://img.example/1.png' } },
      { id: '100', title: 'Serum duplicate' },
    ], '<https://shop-a.myshopline.com/admin/openapi/v20260901/products/products.json?limit=50&page_info=next>; rel="next"');
  });
  assert.equal(sent.url.pathname, '/admin/openapi/v20260901/products/products.json');
  assert.equal(sent.url.searchParams.get('title'), 'Serum');
  assert.equal(sent.url.searchParams.get('limit'), '50');
  assert.equal(sent.options.headers.Authorization, 'Bearer test-token');
  assert.equal(sent.options.headers.Accept, 'application/json');
  assert.equal(sent.options.headers['User-Agent'], 'SHOPLINE-Quantity-Breaks-App/1.0');
  assert.deepEqual(page.products, [{ id: '100', title: 'Serum', imageUrl: 'https://img.example/1.png', variants: [] }]);
  assert.equal(page.nextPageInfo, 'next');
});

test('catalog uses only the next cursor and never fetches the link destination', async () => {
  const page = await searchCampaignProducts(session, '', undefined, async () =>
    result([], '<https://other.example/products/products.json?page_info=x>; rel="next"'));
  assert.equal(page.nextPageInfo, 'x');
  let requestedUrl;
  await searchCampaignProducts(session, '', page.nextPageInfo, async (url) => {
    requestedUrl = new URL(url);
    return result([]);
  });
  assert.equal(requestedUrl.hostname, 'shop-a.myshopline.com');
  assert.equal(requestedUrl.pathname, '/admin/openapi/v20260901/products/products.json');
  await assert.rejects(() => searchCampaignProducts(session, '', 'same', async () =>
    result([], '<https://shop-a.myshopline.com/admin/openapi/v20260901/products/products.json?page_info=same>; rel="next"')), /pagination/i);
});

test('batch lookup uses ids, preserves selection order, and reports missing products', async () => {
  const urls = [];
  const catalog = await getCampaignProducts(session, ['200', '100', '300'], async (url) => {
    urls.push(new URL(url));
    return result([{ id: '100', title: 'First' }, { id: '200', title: 'Second' }]);
  });
  assert.equal(urls.length, 1);
  assert.equal(urls[0].pathname, '/admin/openapi/v20260901/products/products.json');
  assert.equal(urls[0].searchParams.get('ids'), '200,100,300');
  assert.deepEqual(catalog.products.map((item) => item.id), ['200', '100']);
  assert.deepEqual(catalog.missingIds, ['300']);
  await assert.rejects(() => verifyCampaignProducts(session, ['200', '300'], async () => result([{ id: '200' }])), /300/);
});

test('batch lookup splits more than 50 products without individual requests', async () => {
  const ids = Array.from({ length: 51 }, (_, index) => String(index + 1));
  const sizes = [];
  const catalog = await getCampaignProducts(session, ids, async (url) => {
    const batch = new URL(url).searchParams.get('ids').split(',');
    sizes.push(batch.length);
    return result(batch.map((id) => ({ id, title: `Product ${id}` })));
  });
  assert.deepEqual(sizes, [50, 1]);
  assert.deepEqual(catalog.products.map((item) => item.id), ids);
});

test('selected product details restore a saved product title', async () => {
  const item = await getCampaignProduct(session, '100', async () => ({
    ok: true, status: 200, json: async () => ({ product: { id: '100', title: 'Saved Serum', image: { src: 'https://img.example/saved.png' } } }),
  }));
  assert.deepEqual(item, { id: '100', title: 'Saved Serum', imageUrl: 'https://img.example/saved.png', variants: [] });
});

test('catalog maps real variants and honours the requested page size', async () => {
  let sent;
  const page = await searchCampaignProducts(session, '', undefined, async (url) => {
    sent = new URL(url);
    return result([{
      id: 'shirt-1', title: 'Linen shirt', image: { src: 'https://img.example/shirt.png' }, variants: [{
        id: 'variant-1', title: 'Ocean / Medium', price: '29.50', compare_at_price: '39.00',
        option1: 'Ocean', option2: 'Medium', inventory_quantity: 3, available: true,
        image: { src: 'https://img.example/ocean.png' },
      }],
    }]);
  }, undefined, 10);
  assert.equal(sent.searchParams.get('limit'), '10');
  assert.match(sent.searchParams.get('fields'), /(?:^|,)options(?:,|$)/);
  assert.deepEqual(page.products[0].variants, [{
    id: 'variant-1', title: 'Ocean / Medium', price: 29.5, compareAtPrice: 39,
    options: [{ name: 'Option 1', value: 'Ocean' }, { name: 'Option 2', value: 'Medium' }],
    imageUrl: 'https://img.example/ocean.png', inventory: 3, inventoryPolicy: 'deny', available: true,
  }]);
});

test('catalog uses product option names for variant selectors', async () => {
  const page = await searchCampaignProducts(session, '', undefined, async () =>
    result([{ id: 'dress-1', title: 'Example dress', options: [
      { name: 'COLOR', option_values: [{ value: 'RED' }, { value: 'BLUE' }] },
      { name: 'SIZE', option_values: [{ value: 'M' }, { value: 'L' }] },
    ], variants: [{ id: 'variant-red-m', option1: 'RED', option2: 'M', price: 10, available: true }] }])
  );
  assert.deepEqual(page.products[0].optionNames, ['COLOR', 'SIZE']);
  assert.deepEqual(page.products[0].variants[0].options, [
    { name: 'COLOR', value: 'RED' },
    { name: 'SIZE', value: 'M' },
  ]);
});

test('catalog preserves inventory policy and allows overselling variants', async () => {
  const page = await searchCampaignProducts(session, '', undefined, async () =>
    result([{ id: 'shirt-1', title: 'Linen shirt', variants: [{
      id: 'variant-continue', title: 'Ocean / Medium', price: '29.50',
      option1: 'Ocean', option2: 'Medium', inventory_quantity: 0,
      inventory_policy: 'continue', available: false,
    }] }])
  );
  assert.deepEqual(page.products[0].variants[0], {
    id: 'variant-continue', title: 'Ocean / Medium', price: 29.5, compareAtPrice: null,
    options: [{ name: 'Option 1', value: 'Ocean' }, { name: 'Option 2', value: 'Medium' }],
    imageUrl: null, inventory: 0, inventoryPolicy: 'continue', available: true,
  });
});

test('catalog treats variants with inventory tracking disabled as purchasable even when quantity is zero', async () => {
  const page = await searchCampaignProducts(session, '', undefined, async () =>
    result([{ id: 'shirt-1', title: 'Tracked shirt', variants: [{
      id: 'variant-tracked', title: 'Red / X', price: '29.50', option1: 'Red', option2: 'X',
      inventory_quantity: 0, inventory_tracker: false, available: false,
    }] }])
  );
  assert.deepEqual(page.products[0].variants[0], {
    id: 'variant-tracked', title: 'Red / X', price: 29.5, compareAtPrice: null,
    options: [{ name: 'Option 1', value: 'Red' }, { name: 'Option 2', value: 'X' }],
    imageUrl: null, inventory: 0, inventoryPolicy: 'deny', inventoryTracker: false, available: true,
  });
});

test('catalog failure trace reports upstream status and request ID without secrets or query', async () => {
  const entries = [];
  const originalInfo = console.info;
  const originalError = console.error;
  console.info = (...parts) => entries.push(parts);
  console.error = (...parts) => entries.push(parts);
  try {
    await assert.rejects(() => searchCampaignProducts(session, 'Private title', undefined, async () => ({
      ok: false, status: 403, headers: { get: (name) => name === 'traceId' ? 'trace-123' : null },
    }), 'request-products'), /403/);
  } finally {
    console.info = originalInfo;
    console.error = originalError;
  }
  assert.deepEqual(entries.map((entry) => entry[1].stage), ['upstream_request', 'upstream_response']);
  assert.equal(entries[1][1].status, 403);
  assert.equal(entries[1][1].traceId, 'trace-123');
  assert.equal(entries[1][1].requestId, 'request-products');
  assert.doesNotMatch(JSON.stringify(entries), /test-token|Private title/);
});

test('HTTP 200 invalid catalog response logs a bounded reason without body data', async () => {
  const entries = [];
  const originalError = console.error;
  console.error = (...parts) => entries.push(parts);
  try {
    await assert.rejects(() => searchCampaignProducts(session, '', undefined, async () => result(undefined), 'request-invalid'), /invalid/i);
  } finally { console.error = originalError; }
  assert.equal(entries[0][1].stage, 'invalid_response');
  assert.equal(entries[0][1].reason, 'missing_products');
  assert.equal(entries[0][1].requestId, 'request-invalid');
  assert.doesNotMatch(JSON.stringify(entries), /test-token/);
});

test('catalog accepts bare and relative next links', async () => {
  const bare = await searchCampaignProducts(session, '', undefined, async () =>
    result([], 'https://shop-a.myshopline.com/admin/openapi/v20260901/products/products.json?page_info=next-one; rel=next'));
  assert.equal(bare.nextPageInfo, 'next-one');
  const relative = await searchCampaignProducts(session, '', undefined, async () =>
    result([], '</admin/openapi/v20260901/products/products.json?page_info=next-two>; rel="next"'));
  assert.equal(relative.nextPageInfo, 'next-two');
});

test('catalog accepts an upstream pagination path alias and extracts its cursor', async () => {
  const page = await searchCampaignProducts(session, '', undefined, async () =>
    result([], '<https://shop-a.myshopline.com/admin/openapi/v20260901/products.json?page_info=next>; rel="next"'));
  assert.equal(page.nextPageInfo, 'next');
});

test('catalog accepts documented escaped angle brackets in the next link', async () => {
  const page = await searchCampaignProducts(session, '', undefined, async () =>
    result([], '\\<https://shop-a.myshopline.com/admin/openapi/v20260901/products/products.json?page_info=escaped-next\\>; rel=\'next\''));
  assert.equal(page.nextPageInfo, 'escaped-next');
});

test('catalog extracts next cursor from an HTML-encoded SHOPLINE link', async () => {
  const page = await searchCampaignProducts(session, '', undefined, async () =>
    result([], '<https://shop-a.myshopline.com/admin/openapi/v20260901/products/products.json?limit=50&amp;page_info=encoded-next>; rel=\'next\''));
  assert.equal(page.nextPageInfo, 'encoded-next');
});

test('missing cursor trace reports query key names without link values', async () => {
  const entries = [];
  const originalError = console.error;
  console.error = (...parts) => entries.push(parts);
  try {
    await assert.rejects(() => searchCampaignProducts(session, '', undefined, async () =>
      result([], '<https://shop-a.myshopline.com/admin/openapi/v20260901/products/products.json?limit=50&opaque=secret-cursor>; rel="next"'), 'request-no-cursor'), /pagination/i);
  } finally { console.error = originalError; }
  assert.equal(entries[0][1].paginationReason, 'missing_cursor');
  assert.deepEqual(entries[0][1].paginationQueryKeys, ['limit', 'other']);
  assert.equal(entries[0][1].paginationHasPageInfoText, false);
  assert.doesNotMatch(JSON.stringify(entries), /secret-cursor|test-token/);
});

test('catalog accepts a cursor-only next link', async () => {
  const page = await searchCampaignProducts(session, '', undefined, async () =>
    result([], 'page_info=cursor-only; rel=next'));
  assert.equal(page.nextPageInfo, 'cursor-only');
});
