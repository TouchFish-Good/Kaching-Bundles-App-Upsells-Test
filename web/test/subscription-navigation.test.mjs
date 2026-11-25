import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';

test('opens the SHOPLINE native package purchase page with the current app key', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { openNativePackagePurchase } = await vite.ssrLoadModule('/src/prototype/subscription-navigation.ts');
    const calls = [];
    const app = { config: { appKey: 'current-app' } };
    openNativePackagePurchase(app, () => ({ toAdminPage(section, params) { calls.push({ section, params }); } }));
    assert.deepEqual(calls, [{ section: 'packagepurchase', params: { appKey: 'current-app' } }]);
  } finally { await vite.close(); }
});
