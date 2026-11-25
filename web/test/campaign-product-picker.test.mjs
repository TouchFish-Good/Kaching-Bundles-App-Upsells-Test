import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

test('product picker localizes the modal entry point outside Chinese and English', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const old = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  try {
    const { CampaignProductPicker } = await vite.ssrLoadModule('/src/prototype/CampaignProductPicker.tsx');
    const root = createRoot(document.getElementById('root'));
    await act(async () => root.render(React.createElement(CampaignProductPicker, { fetcher: async () => ({ ok: true, json: async () => ({ products: [], nextPageInfo: null }) }), selectedIds: [], onChange: () => {}, locale: 'fr', mode: 'dialog' })));
    assert.match(document.body.textContent, /Ajouter des produits/);
    await act(async () => root.unmount());
  } finally { Object.assign(globalThis, old); dom.window.close(); await vite.close(); }
});

test('product picker keeps modal selections as a draft until the merchant confirms', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const old = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  try {
    const { CampaignProductPicker } = await vite.ssrLoadModule('/src/prototype/CampaignProductPicker.tsx');
    const changes = [];
    const fetcher = async () => ({ ok: true, json: async () => ({ products: Array.from({ length: 10 }, (_, index) => ({ id: `p${index + 1}`, title: `Product ${index + 1}`, imageUrl: `https://example.test/${index + 1}.png` })), nextPageInfo: null }) });
    const root = createRoot(document.getElementById('root'));
    function Wrapper() {
      const [selectedIds, setSelectedIds] = React.useState([]);
      return React.createElement(CampaignProductPicker, { fetcher, selectedIds, onChange: (ids) => { changes.push(ids); setSelectedIds(ids); }, locale: 'en', mode: 'dialog' });
    }
    await act(async () => root.render(React.createElement(Wrapper)));
    const add = [...document.querySelectorAll('button')].find((button) => button.textContent === 'Add products');
    await act(async () => add.click());
    assert.equal(document.querySelector('[role="dialog"]')?.getAttribute('aria-label'), 'Select products');
    assert.equal(document.querySelectorAll('[role="dialog"] input[type="checkbox"]').length, 10);
    await act(async () => document.querySelector('[role="dialog"] input[type="checkbox"]').click());
    assert.deepEqual(changes, []);
    await act(async () => [...document.querySelectorAll('[role="dialog"] button')].find((button) => button.textContent === 'Select 1 item').click());
    assert.deepEqual(changes, [['p1']]);
    assert.match(document.body.textContent, /Product 1/);
    assert.equal(document.querySelector('img')?.getAttribute('src'), 'https://example.test/1.png');
    await act(async () => root.unmount());
  } finally { Object.assign(globalThis, old); dom.window.close(); await vite.close(); }
});

test('product selector keeps its pagination controls in the dialog footer', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const old = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  try {
    const { CampaignProductPicker } = await vite.ssrLoadModule('/src/prototype/CampaignProductPicker.tsx');
    const root = createRoot(document.getElementById('root'));
    const fetcher = async () => ({ ok: true, json: async () => ({ products: [{ id: 'p1', title: 'Product 1', imageUrl: null }], nextPageInfo: 'next' }) });
    await act(async () => root.render(React.createElement(CampaignProductPicker, { fetcher, selectedIds: [], onChange: () => {}, locale: 'en', mode: 'dialog' })));
    await act(async () => [...document.querySelectorAll('button')].find((button) => button.textContent === 'Add products').click());
    const next = [...document.querySelectorAll('[role="dialog"] button')].find((button) => button.textContent === 'Next');
    assert.equal(next?.closest('footer')?.className.includes('selectionDialogFooter'), true);
    await act(async () => root.unmount());
  } finally { Object.assign(globalThis, old); dom.window.close(); await vite.close(); }
});

test('product picker saves real IDs and restores a saved selection', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const old = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  try {
    const { CampaignProductPicker } = await vite.ssrLoadModule('/src/prototype/CampaignProductPicker.tsx');
    const fetcher = async (url) => {
      const query = new URL(url, 'http://localhost').searchParams;
      if (query.get('ids')) return { ok: true, json: async () => ({ products: [{ id: 'p2', title: 'Saved Serum', imageUrl: null }], missingIds: [] }) };
      return { ok: true, json: async () => ({ products: [{ id: 'p1', title: 'Fresh Serum', imageUrl: null }, { id: 'p2', title: 'Saved Serum', imageUrl: null }], nextPageInfo: null }) };
    };
    const changes = [];
    const root = createRoot(document.getElementById('root'));
    function Wrapper() {
      const [ids, setIds] = React.useState(['p2']);
      return React.createElement(CampaignProductPicker, { fetcher, selectedIds: ids, locale: 'en', onChange: (next) => { changes.push(next); setIds(next); } });
    }
    await act(async () => root.render(React.createElement(Wrapper)));
    assert.match(document.body.textContent, /Saved Serum/);
    const search = document.querySelector('input[type="search"]');
    await act(async () => { search.value = 'Serum'; search.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
    const select = [...document.querySelectorAll('button')].find((button) => button.textContent.includes('Fresh Serum'));
    await act(async () => select.click());
    assert.deepEqual(changes.at(-1), ['p2', 'p1']);
    const remove = document.querySelector('button[aria-label="Remove Fresh Serum"]');
    await act(async () => remove.click());
    assert.deepEqual(changes.at(-1), ['p2']);
    await act(async () => root.unmount());
  } finally {
    Object.assign(globalThis, old);
    dom.window.close();
    await vite.close();
  }
});

test('product picker hydrates selected products in one batch and labels missing products as unavailable', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const old = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  try {
    const { CampaignProductPicker } = await vite.ssrLoadModule('/src/prototype/CampaignProductPicker.tsx');
    const requests = [];
    const fetcher = async (url) => {
      requests.push(String(url));
      const query = new URL(url, 'http://localhost').searchParams;
      if (query.get('ids')) return { ok: true, json: async () => ({ products: [{ id: 'p1', title: 'Available Serum', imageUrl: null }], missingIds: ['p2'] }) };
      return { ok: true, json: async () => ({ products: [], nextPageInfo: null }) };
    };
    const root = createRoot(document.getElementById('root'));
    await act(async () => root.render(React.createElement(CampaignProductPicker, { fetcher, selectedIds: ['p1', 'p2'], locale: 'en', onChange: () => {} })));

    assert.match(document.body.textContent, /Available Serum/);
    assert.match(document.body.textContent, /Unavailable product \(p2\)/);
    assert.equal(requests.filter((url) => new URL(url, 'http://localhost').searchParams.has('ids')).length, 1);
    assert.equal(requests.some((url) => new URL(url, 'http://localhost').searchParams.has('id')), false);
    await act(async () => root.unmount());
  } finally {
    Object.assign(globalThis, old);
    dom.window.close();
    await vite.close();
  }
});

test('product picker replaces results on the next page while keeping selections', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const old = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  try {
    const { CampaignProductPicker } = await vite.ssrLoadModule('/src/prototype/CampaignProductPicker.tsx');
    const fetcher = async (url) => {
      const cursor = new URL(url, 'http://localhost').searchParams.get('page_info');
      return { ok: true, json: async () => cursor === 'next' ? { products: [{ id: 'p11', title: 'Product 11', imageUrl: null }], nextPageInfo: null } : { products: Array.from({ length: 10 }, (_, i) => ({ id: `p${i + 1}`, title: `Product ${i + 1}`, imageUrl: null })), nextPageInfo: 'next' } };
    };
    const root = createRoot(document.getElementById('root'));
    function Wrapper() {
      const [ids, setIds] = React.useState([]);
      return React.createElement(CampaignProductPicker, { fetcher, selectedIds: ids, locale: 'en', onChange: setIds });
    }
    await act(async () => root.render(React.createElement(Wrapper)));
    assert.equal(document.querySelectorAll('ul[class*="productPickerResults"] li').length, 10);
    await act(async () => document.querySelector('ul[class*="productPickerResults"] button').click());
    await act(async () => [...document.querySelectorAll('button')].find((button) => button.textContent === 'Next').click());
    assert.equal(document.querySelectorAll('ul[class*="productPickerResults"] li').length, 1);
    assert.match(document.body.textContent, /Product 1/);
    assert.match(document.body.textContent, /Product 11/);
    await act(async () => [...document.querySelectorAll('button')].find((button) => button.textContent === 'Previous').click());
    assert.equal(document.querySelectorAll('ul[class*="productPickerResults"] li').length, 10);
    await act(async () => root.unmount());
  } finally { Object.assign(globalThis, old); dom.window.close(); await vite.close(); }
});

test('product picker requests the next SHOPLINE page with its returned cursor', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const old = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  try {
    const { CampaignProductPicker } = await vite.ssrLoadModule('/src/prototype/CampaignProductPicker.tsx');
    const requests = [];
    const cursor = 'eyJkaXJlY3Rpb24iOiJuZXh0IiwibGltaXQiOjEwfQ';
    const fetcher = async (url) => {
      const request = new URL(url, 'http://localhost');
      requests.push(request);
      return { ok: true, json: async () => request.searchParams.get('page_info') ? { products: [{ id: 'p11', title: 'Product 11', imageUrl: null }], nextPageInfo: null } : { products: [{ id: 'p1', title: 'Product 1', imageUrl: null }], nextPageInfo: cursor } };
    };
    const root = createRoot(document.getElementById('root'));
    await act(async () => root.render(React.createElement(CampaignProductPicker, { fetcher, selectedIds: [], locale: 'en', onChange: () => {} })));
    await act(async () => [...document.querySelectorAll('button')].find((button) => button.textContent === 'Next').click());

    assert.equal(requests[0].searchParams.get('limit'), '50');
    assert.equal(requests[1].searchParams.get('page_info'), cursor);
    await act(async () => root.unmount());
  } finally { Object.assign(globalThis, old); dom.window.close(); await vite.close(); }
});

test('product search waits for completed composition and the final debounce', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const old = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  try {
    const { CampaignProductPicker } = await vite.ssrLoadModule('/src/prototype/CampaignProductPicker.tsx');
    const searches = [];
    const fetcher = async (url) => {
      searches.push(new URL(url, 'http://localhost').searchParams.get('title') ?? '');
      return { ok: true, json: async () => ({ products: [], nextPageInfo: null }) };
    };
    const root = createRoot(document.getElementById('root'));
    await act(async () => root.render(React.createElement(CampaignProductPicker, { fetcher, selectedIds: [], onChange: () => {}, locale: 'en' })));
    const input = document.querySelector('input[type="search"]');
    await act(async () => {
      Simulate.compositionStart(input);
      for (const value of ['z', 'zu', 'zui']) {
        Simulate.change(input, { target: { value } });
      }
    });
    await act(async () => new Promise((resolve) => setTimeout(resolve, 340)));
    assert.deepEqual(searches, ['']);
    await act(async () => {
      Simulate.change(input, { target: { value: '最新' } });
      Simulate.compositionEnd(input, { target: { value: '最新' } });
    });
    await act(async () => new Promise((resolve) => setTimeout(resolve, 340)));
    assert.deepEqual(searches, ['', '最新']);
    await act(async () => root.unmount());
  } finally { Object.assign(globalThis, old); dom.window.close(); await vite.close(); }
});

test('product pagination disables navigation while a page is loading', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/prototype/CampaignProductPicker.tsx', import.meta.url), 'utf8');
  assert.match(source, /disabled=\{state === 'loading' \|\| pageIndex === 0\}/);
  assert.match(source, /disabled=\{state === 'loading' \|\| !nextPageInfo/);
});

test('product and collection pagination keep controls visible while loading', async () => {
  const product = await readFile(new URL('../src/prototype/CampaignProductPicker.tsx', import.meta.url), 'utf8');
  const collection = await readFile(new URL('../src/prototype/CampaignCollectionPicker.tsx', import.meta.url), 'utf8');
  assert.match(product, /state === 'ready' \|\| state === 'loading'/);
  assert.match(collection, /state === 'ready' \|\| state === 'loading'/);
  assert.match(collection, /disabled=\{state === 'loading' \|\| pageIndex === 0\}/);
});
