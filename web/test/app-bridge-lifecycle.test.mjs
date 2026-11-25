import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';

async function loadAppBridge() {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', ssr: { noExternal: ['@shoplineos/app-bridge'] } });
  try { return await vite.ssrLoadModule('/src/hooks/useAppBridge.ts'); }
  finally { await vite.close(); }
}

test('embedded App Bridge creation is deferred until a workspace consumer asks for it', async () => {
  const { createEmbeddedApp } = await loadAppBridge();
  const calls = [];

  const app = createEmbeddedApp({
    embedded: true,
    search: '?appkey=merchant-key&host=merchant.myshopline.com',
    fallbackAppKey: 'fallback-key',
    getHost: () => 'shared-host',
    createApp: (config) => { calls.push(config); return { config }; },
  });

  assert.deepEqual(calls, [{ appKey: 'merchant-key', host: 'merchant.myshopline.com' }]);
  assert.deepEqual(app, { config: calls[0] });
});

test('nonembedded routes do not create an App Bridge client', async () => {
  const { createEmbeddedApp } = await loadAppBridge();
  let calls = 0;

  const app = createEmbeddedApp({
    embedded: false,
    search: '',
    fallbackAppKey: 'fallback-key',
    getHost: () => 'shared-host',
    createApp: () => { calls += 1; return {}; },
  });

  assert.equal(app, null);
  assert.equal(calls, 0);
});

test('a self-referrer after bootstrap recovery cannot redirect App Bridge messages away from the store', async () => {
  const { createEmbeddedApp } = await loadAppBridge();
  for (const search of ['?handle=buchaqian&appkey=merchant-key', '?handle=buchaqian&host=app.vswwy.cn&appkey=merchant-key']) {
    const app = createEmbeddedApp({
      embedded: true, search,
      getHost: () => 'app.vswwy.cn',
      createApp: (config) => ({ config }),
    });
    assert.equal(app.config.host, 'buchaqian.myshopline.com');
  }
});

test('invalid store handles cannot become App Bridge destination origins', async () => {
  const { createEmbeddedApp } = await loadAppBridge();
  for (const handle of ['evil.test/anything', 'shop@evil.test', '../shop', '-shop']) {
    let created = false;
    assert.throws(() => createEmbeddedApp({
      embedded: true, search: `?handle=${encodeURIComponent(handle)}`,
      getHost: () => 'app.vswwy.cn',
      createApp: () => { created = true; return {}; },
    }), /SHOPLINE.*host/i);
    assert.equal(created, false);
  }
});
