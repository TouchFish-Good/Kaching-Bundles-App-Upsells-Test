const assert = require('node:assert/strict');
const { test } = require('node:test');
const { writeCollectionVariables, readCollectionVariables } = require('../src/service/campaign/collection-variables');
const { DiscountRejectedError } = require('../src/service/campaign/discount-adapter');

const session = { handle: 'test-shop', accessToken: 'test-secret' };
const reply = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => 'trace-test' }, json: async () => body });

test('writes sorted collection IDs as a Shop metafield and confirms readback', async () => {
  const requests = [];
  const fetcher = async (url, options) => {
    requests.push({ url, options });
    if (options.method === 'POST') {
      const field = JSON.parse(options.body).metafields[0];
      assert.equal(field.owner_id, '12345');
      assert.equal(field.owner_resource, 'Shop');
      assert.equal(field.namespace, '$app:quantity-breaks');
      assert.equal(field.key, 'collection-membership');
      assert.equal(field.type, 'json');
      assert.deepEqual(JSON.parse(field.value), { inCollections: ['c1', 'c2'] });
      return reply({ metafields: [field], fail_metafields: [] });
    }
    return reply({ metafields: [{ namespace: '$app:quantity-breaks', key: 'collection-membership', owner_id: '12345', value: JSON.stringify({ inCollections: ['c1', 'c2'] }) }] });
  };
  await writeCollectionVariables(session, '12345', ['c2', 'c1', 'c2'], fetcher);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].options.headers.Authorization, 'Bearer test-secret');
  assert.equal(new URL(requests[0].url).pathname, '/admin/openapi/v20260901/metafields_set.json');
  assert.equal(new URL(requests[1].url).pathname, '/admin/openapi/v20260901/metafields.json');
});

test('rejects invalid store ID and incomplete platform acknowledgement', async () => {
  await assert.rejects(() => writeCollectionVariables(session, 'test-shop', ['c1'], async () => reply({})), /store ID/i);
  await assert.rejects(() => writeCollectionVariables(session, '12345', ['c1'], async () => reply({ metafields: [], fail_metafields: [{ key: 'collection-membership' }] })), /metafield/i);
  await assert.rejects(() => writeCollectionVariables(session, '12345', ['c1'], async (_url, options) => options.method === 'POST'
    ? reply({ metafields: [{ namespace: '$app:quantity-breaks', key: 'collection-membership', owner_id: '12345' }], fail_metafields: [] })
    : reply({ metafields: [{ namespace: '$app:quantity-breaks', key: 'collection-membership', owner_id: '12345', value: '{"inCollections":[]}' }] })), /readback/i);
  await assert.rejects(() => writeCollectionVariables(session, '12345', ['c1'], async () => reply({ error: 'forbidden' }, 403)), (error) => error instanceof DiscountRejectedError);
});

test('read rejects malformed or duplicated metafield values', async () => {
  await assert.rejects(() => readCollectionVariables(session, '12345', async () => reply({ metafields: [{ namespace: '$app:quantity-breaks', key: 'collection-membership', owner_id: '12345', value: 'not-json' }] })), /invalid/i);
  await assert.rejects(() => readCollectionVariables(session, '12345', async () => reply({ metafields: [
    { namespace: '$app:quantity-breaks', key: 'collection-membership', owner_id: '12345', value: '{"inCollections":[]}' },
    { namespace: '$app:quantity-breaks', key: 'collection-membership', owner_id: '12345', value: '{"inCollections":[]}' },
  ] })), /duplicate/i);
});
