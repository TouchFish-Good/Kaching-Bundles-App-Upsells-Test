import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';

test('an OAuth callback loaded in an iframe remains embedded without a lang query parameter', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { isEmbeddedContext } = await vite.ssrLoadModule('/src/prototype/embedded-context.ts');
    assert.equal(isEmbeddedContext({}, {}), true);
  } finally {
    await vite.close();
  }
});

test('a standalone page is not treated as embedded', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { isEmbeddedContext } = await vite.ssrLoadModule('/src/prototype/embedded-context.ts');
    const windowReference = {};
    assert.equal(isEmbeddedContext(windowReference, windowReference), false);
  } finally {
    await vite.close();
  }
});

test('uses the payment return context for App Bridge identity and host', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { getAppBridgeContext } = await vite.ssrLoadModule('/src/prototype/embedded-context.ts');
    assert.deepEqual(getAppBridgeContext('?appkey=app-123&host=shop.myshopline.com', 'fallback-app'), {
      appKey: 'app-123',
      host: 'shop.myshopline.com',
    });
  } finally {
    await vite.close();
  }
});
