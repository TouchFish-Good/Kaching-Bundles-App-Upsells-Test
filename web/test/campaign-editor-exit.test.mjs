import assert from 'node:assert/strict';
import { test } from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';

test('creation offers Create and keeps unsaved edits on Cancel, while Exit leaves without saving', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/quantity-breaks/new' });
  const previous = Object.fromEntries(['window', 'document', 'HTMLElement', 'ResizeObserver', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, globalThis[key]]));
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, ResizeObserver: class { observe() {} disconnect() {} }, IS_REACT_ACT_ENVIRONMENT: true });
  dom.window.HTMLElement.prototype.attachEvent = () => {};
  let root;
  try {
    const { CampaignEditor } = await vite.ssrLoadModule('/src/prototype/CampaignEditor.tsx');
    const i18n = createInstance();
    await i18n.init({ lng: 'zh-Hans', resources: { 'zh-Hans': { translation: { saveDraft: '保存草稿' } } } });
    let exited = 0;
    let saved = 0;
    root = createRoot(document.getElementById('root'));
    await act(async () => root.render(React.createElement(I18nextProvider, { i18n }, React.createElement(CampaignEditor, {
      campaign: null, campaigns: [], onCancel: () => exited++, onSave: async () => saved++, notify: () => {},
      fetcher: async () => ({ ok: true, json: async () => ({ shopCurrencyCode: 'USD', markets: [], products: [], translations: {} }) }),
    }))));
    await act(() => Simulate.change(document.getElementById('campaign-name'), { target: { value: '尚未保存的活动' } }));
    const button = (text, scope = document) => [...scope.querySelectorAll('button')].find(node => node.textContent === text);
    assert.ok(button('创建'));
    assert.ok(button('保存草稿'));
    await act(() => button('退出编辑').click());
    let dialog = document.querySelector('[role="dialog"]');
    assert.equal(dialog.querySelector('h2').textContent, '退出编辑？');
    assert.deepEqual([...dialog.querySelectorAll('button')].map(node => node.textContent), ['取消', '退出']);
    await act(() => button('取消', dialog).click());
    assert.equal(document.querySelector('[role="dialog"]'), null);
    assert.equal(document.getElementById('campaign-name').value, '尚未保存的活动');
    assert.equal(exited, 0);
    await act(() => button('退出编辑').click());
    dialog = document.querySelector('[role="dialog"]');
    await act(() => button('退出', dialog).click());
    assert.equal(exited, 1);
    assert.equal(saved, 0);
  } finally {
    if (root) await act(() => root.unmount());
    Object.assign(globalThis, previous);
    dom.window.close();
    await vite.close();
  }
});
