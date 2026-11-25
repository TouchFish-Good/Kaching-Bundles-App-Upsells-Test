import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';

test('shop identity client parses data and classifies authentication failure', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { readShopIdentity } = await vite.ssrLoadModule('/src/prototype/shop-identity-api.ts');
    const shop = await readShopIdentity(async () => ({ ok: true, json: async () => ({ shop: { storeId: 'shop-a' } }) }));
    assert.deepEqual(shop, { storeId: 'shop-a' });
    await assert.rejects(() => readShopIdentity(async () => ({ ok: false, status: 401 })), (error) => error.code === 'AUTH_REQUIRED');
  } finally { await vite.close(); }
});
