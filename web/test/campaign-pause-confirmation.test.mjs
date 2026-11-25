import assert from 'node:assert/strict';
import { test } from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { createInstance } from 'i18next';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

test('campaign status changes are available only from the multi-select confirmation flow', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/quantity-breaks' });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT,
  };
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  try {
    const { Dashboard } = await vite.ssrLoadModule('/src/pages/quantity-breaks.tsx');
    const i18n = createInstance();
    await i18n.init({ lng: 'en', resources: { en: { translation: {} } } });
    const batchActions = [];
    const root = createRoot(document.getElementById('root'));
    const campaign = {
      id: 'summer-offer', name: 'Summer offer', products: 'Renewal Serum', status: 'Active', listStatus: 'Active',
      tiers: [], schedule: 'No schedule', updated: 'Now', startsAt: undefined, endsAt: undefined,
    };
    await act(async () => root.render(React.createElement(I18nextProvider, { i18n }, React.createElement(Dashboard, {
      campaigns: [campaign], onCreate: () => {}, onEdit: () => {}, onBatchAction: async (ids, action) => { batchActions.push({ ids, action }); },
    }))));

    assert.doesNotMatch(document.body.textContent, /Actions/);
    assert.equal([...document.querySelectorAll('button')].some((button) => button.textContent === 'Disable'), false);

    await act(async () => document.querySelector('input[aria-label="Select Summer offer"]').click());
    const pauseButton = [...document.querySelectorAll('button')].find((button) => button.textContent === 'Disable');
    assert.ok(pauseButton);
    await act(async () => pauseButton.click());
    assert.deepEqual(batchActions, []);
    assert.match(document.body.textContent, /Disable selected campaigns\?/);
    assert.match(document.body.textContent, /1 campaigns will stop/);

    await act(async () => [...document.querySelectorAll('[role="dialog"] button')].find((button) => button.textContent?.toLowerCase() === 'cancel').click());
    assert.deepEqual(batchActions, []);
    assert.equal(document.querySelector('input[aria-label="Select Summer offer"]').checked, true);

    const secondPauseButton = [...document.querySelector('[role="toolbar"]').querySelectorAll('button')].find((button) => button.textContent === 'Disable');
    await act(async () => secondPauseButton.click());
    const dialogPause = [...document.querySelectorAll('[role="dialog"] button')].find((button) => button.textContent === 'Disable');
    await act(async () => dialogPause.click());
    assert.deepEqual(batchActions, [{ ids: ['summer-offer'], action: 'pause' }]);
    await act(async () => i18n.changeLanguage('zh-Hans'));
    assert.match(document.querySelector('tbody').textContent, /生效中/);
    assert.doesNotMatch(document.querySelector('tbody').textContent, /进行中/);
    await act(async () => document.querySelector('input[aria-label="选择 Summer offer"]').click());
    assert.ok([...document.querySelectorAll('[role="toolbar"] button')].some((button) => button.textContent === '禁用'));
    await act(async () => [...document.querySelectorAll('[role="toolbar"] button')].find((button) => button.textContent === '删除').click());
    assert.match(document.querySelector('[role="dialog"]').textContent, /需先禁用活动，才能删除。/);
    await act(async () => [...document.querySelectorAll('[role="dialog"] button')].find((button) => button.textContent === 'cancel').click());
    assert.equal(batchActions.length, 1, 'canceling deletion must not send another action');
    await act(async () => root.unmount());
  } finally {
    Object.assign(globalThis, previous);
    dom.window.close();
    await vite.close();
  }
});
