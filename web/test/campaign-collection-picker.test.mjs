import assert from 'node:assert/strict';
import { test } from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

test('collection picker exposes a selected-items dialog instead of an inline list above ten selections', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const old = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  try {
    const { CampaignCollectionPicker } = await vite.ssrLoadModule('/src/prototype/CampaignCollectionPicker.tsx');
    const selectedIds = Array.from({ length: 11 }, (_, index) => `c${index + 1}`);
    const fetcher = async (url) => {
      const parsed = new URL(url, 'http://localhost');
      const id = parsed.pathname.split('/').at(-1);
      if (parsed.pathname.startsWith('/api/quantity-breaks/collections/')) return { ok: true, json: async () => ({ collection: { id, title: `Collection ${id.slice(1)}`, kind: 'manual', imageUrl: `https://example.test/${id}.png` } }) };
      return { ok: true, json: async () => ({ collections: [], nextPageInfo: null }) };
    };
    const root = createRoot(document.getElementById('root'));
    await act(async () => root.render(React.createElement(CampaignCollectionPicker, { fetcher, selectedIds, onChange: () => {}, locale: 'en', mode: 'dialog' })));
    const viewSelected = [...document.querySelectorAll('button')].find((button) => button.textContent === 'View selected items (11)');
    assert.ok(viewSelected);
    assert.doesNotMatch(document.body.textContent, /Collection 1.*Collection 2/s);
    await act(async () => viewSelected.click());
    assert.equal(document.querySelector('[role="dialog"]')?.getAttribute('aria-label'), 'Selected collections');
    assert.match(document.querySelector('[role="dialog"]')?.textContent, /Collection 1/);
    await act(async () => root.unmount());
  } finally { Object.assign(globalThis, old); dom.window.close(); await vite.close(); }
});

test('collection picker keeps IDs across 50 item pages and restores titles', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const old = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  try {
    const { CampaignCollectionPicker } = await vite.ssrLoadModule('/src/prototype/CampaignCollectionPicker.tsx');
    const fetcher = async (url) => {
      const parsed = new URL(url, 'http://localhost');
      if (parsed.pathname === '/api/quantity-breaks/collections/c1') return { ok: true, json: async () => ({ collection: { id: 'c1', title: 'Saved collection', kind: 'manual' } }) };
      return { ok: true, json: async () => parsed.searchParams.has('page_info') ? { collections: [{ id: 'c51', title: 'Collection 51', kind: 'manual' }], nextPageInfo: null } : { collections: Array.from({ length: 50 }, (_, i) => ({ id: `c${i + 1}`, title: `Collection ${i + 1}`, kind: 'manual' })), nextPageInfo: 'next' } };
    };
    const root = createRoot(document.getElementById('root'));
    let ids = ['c1'];
    function Wrapper() {
      const [selected, setSelected] = React.useState(ids);
      return React.createElement(CampaignCollectionPicker, { fetcher, selectedIds: selected, onChange: (next) => { ids = next; setSelected(next); }, locale: 'en' });
    }
    await act(async () => root.render(React.createElement(Wrapper)));
    assert.match(document.body.textContent, /Saved collection/);
    assert.equal(document.querySelectorAll('ul[class*="productPickerResults"] li').length, 50);
    await act(async () => [...document.querySelectorAll('button')].find((button) => button.textContent === 'Next').click());
    assert.equal(document.querySelectorAll('ul[class*="productPickerResults"] li').length, 1);
    await act(async () => [...document.querySelectorAll('ul[class*="productPickerResults"] button')][0].click());
    assert.deepEqual(ids, ['c1', 'c51']);
    await act(async () => root.unmount());
  } finally { Object.assign(globalThis, old); dom.window.close(); await vite.close(); }
});

test('collection selector keeps its pagination controls in the dialog footer', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const old = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  try {
    const { CampaignCollectionPicker } = await vite.ssrLoadModule('/src/prototype/CampaignCollectionPicker.tsx');
    const root = createRoot(document.getElementById('root'));
    const fetcher = async () => ({ ok: true, json: async () => ({ collections: [{ id: 'c1', title: 'Collection 1', kind: 'manual', imageUrl: null }], nextPageInfo: 'next' }) });
    await act(async () => root.render(React.createElement(CampaignCollectionPicker, { fetcher, selectedIds: [], onChange: () => {}, locale: 'en', mode: 'dialog' })));
    await act(async () => [...document.querySelectorAll('button')].find((button) => button.textContent === 'Add product collections').click());
    const next = [...document.querySelectorAll('[role="dialog"] button')].find((button) => button.textContent === 'Next');
    assert.equal(next?.closest('footer')?.className.includes('selectionDialogFooter'), true);
    await act(async () => root.unmount());
  } finally { Object.assign(globalThis, old); dom.window.close(); await vite.close(); }
});
