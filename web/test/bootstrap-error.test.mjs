import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { test } from 'node:test';
import { createServer } from 'vite';

test('bootstrap failures render a retry state instead of an OAuth pending state', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
  try {
    const { renderAppBootstrapError } = await vite.ssrLoadModule('/src/prototype/bootstrap-error.ts');
    renderAppBootstrapError(dom.window.document);
    assert.match(dom.window.document.body.textContent, /应用加载失败/);
    assert.match(dom.window.document.body.textContent, /重新加载/);
    assert.doesNotMatch(dom.window.document.body.textContent, /正在打开 SHOPLINE 授权页面/);
    assert.ok(dom.window.document.querySelector('button'));
  } finally {
    dom.window.close();
    await vite.close();
  }
});
