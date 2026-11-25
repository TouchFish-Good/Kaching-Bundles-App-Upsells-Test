import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { test } from 'node:test';
import { createServer } from 'vite';

test('embedded OAuth uses App Bridge to leave the iframe for authorization', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { startEmbeddedOAuth } = await vite.ssrLoadModule('/src/prototype/embedded-auth.ts');
    const calls = [];
    const started = startEmbeddedOAuth(
      { id: 'app' },
      '?uninstalled=true&embedded=1&appkey=test-key&host=demo.myshopline.com&handle=demo&scope=read_products&redirectUri=https%3A%2F%2Fapp.example%2Fapi%2Fauth%2Fcallback',
      () => ({ toAdminPage: (...args) => calls.push(args) }),
    );

    assert.equal(started, true);
    assert.deepEqual(calls, [[
      'oauth',
      {
        oauthInfo: {
          appKey: 'test-key',
          scope: 'read_products',
          redirectUri: 'https://app.example/api/auth/callback',
        },
      },
    ]]);
  } finally {
    await vite.close();
  }
});

test('embedded OAuth bootstrap shows an automatic transition state without a manual reauthorization control', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
  try {
    const { renderEmbeddedOAuthPending } = await vite.ssrLoadModule('/src/prototype/embedded-auth.ts');
    renderEmbeddedOAuthPending(dom.window.document);
    assert.match(dom.window.document.body.textContent, /正在打开 SHOPLINE 授权页面/);
    assert.equal(dom.window.document.querySelector('button'), null);
  } finally {
    dom.window.close();
    await vite.close();
  }
});

test('reauthorization response starts SHOPLINE OAuth directly through App Bridge', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { startEmbeddedOAuthFromUrl } = await vite.ssrLoadModule('/src/prototype/embedded-auth.ts');
    const calls = [];
    const started = startEmbeddedOAuthFromUrl(
      { id: 'app' },
      'https://app.example/?uninstalled=true&embedded=1&appkey=test-key&host=demo.myshopline.com&handle=demo&scope=read_products&redirectUri=https%3A%2F%2Fapp.example%2Fapi%2Fauth%2Fcallback',
      'https://app.example',
      () => ({ toAdminPage: (...args) => calls.push(args) }),
    );

    assert.equal(started, true);
    assert.deepEqual(calls, [[
      'oauth',
      {
        oauthInfo: {
          appKey: 'test-key',
          scope: 'read_products',
          redirectUri: 'https://app.example/api/auth/callback',
        },
      },
    ]]);
  } finally {
    await vite.close();
  }
});
