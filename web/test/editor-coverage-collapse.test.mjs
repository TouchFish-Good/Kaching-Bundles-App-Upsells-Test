import assert from 'node:assert/strict';
import { test } from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

test('coverage check remains available when scope is collapsed and opens the scope before checking', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/quantity-breaks/new' });
  const previous = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement, ResizeObserver: globalThis.ResizeObserver, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  class ResizeObserverStub { observe() {} disconnect() {} }
  dom.window.requestAnimationFrame = (callback) => setTimeout(callback, 0);
  dom.window.HTMLElement.prototype.attachEvent = () => {};
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, ResizeObserver: ResizeObserverStub, IS_REACT_ACT_ENVIRONMENT: true });
  try {
    const { CampaignEditor } = await vite.ssrLoadModule('/src/prototype/CampaignEditor.tsx');
    const root = createRoot(document.getElementById('root'));
    await act(() => root.render(React.createElement(CampaignEditor, {
      campaign: null, campaigns: [], onCancel: () => {}, onSave: async () => {}, notify: () => {},
      fetcher: async () => ({ ok: true, json: async () => ({ shopCurrencyCode: 'USD', markets: [] }) }),
    })));
    const panel = [...document.querySelectorAll('details')].find((item) => item.querySelector('summary')?.textContent.includes('Product scope'));
    assert.ok(panel);
    panel.open = false;
    const button = [...document.querySelectorAll('button')].find((item) => item.textContent === 'Check campaign coverage');
    assert.ok(button);
    assert.equal(panel.contains(button), false, 'the check action must remain rendered outside closed details');
    await act(() => button.click());
    assert.equal(panel.open, true);
    assert.ok(panel.querySelector('[class*="overlapGuard"]'));
    assert.ok(panel.querySelector('[class*="overlapGuard"]').compareDocumentPosition(panel.querySelector('[class*="scopeOptions"]')) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING);
    await act(() => root.unmount());
  } finally {
    Object.assign(globalThis, previous);
    dom.window.close();
    await vite.close();
  }
});

test('saving a campaign automatically checks product coverage', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/quantity-breaks/new' });
  const previous = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement, ResizeObserver: globalThis.ResizeObserver, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  class ResizeObserverStub { observe() {} disconnect() {} }
  dom.window.requestAnimationFrame = (callback) => setTimeout(callback, 0);
  dom.window.HTMLElement.prototype.attachEvent = () => {};
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, ResizeObserver: ResizeObserverStub, IS_REACT_ACT_ENVIRONMENT: true });
  try {
    const { CampaignEditor } = await vite.ssrLoadModule('/src/prototype/CampaignEditor.tsx');
    let saved = 0;
    let coverageRequests = 0;
    const root = createRoot(document.getElementById('root'));
    await act(() => root.render(React.createElement(CampaignEditor, {
      campaign: null, campaigns: [], onCancel: () => {}, onSave: async () => { saved += 1; }, notify: () => {},
      fetcher: async (url) => {
        if (url.includes('/campaigns/coverage')) {
          coverageRequests += 1;
          return { ok: true, json: async () => ({ state: 'clear', conflicts: [] }) };
        }
        return { ok: true, json: async () => url.includes('/products') ? { products: [{ id: 'product-1', title: 'Winter serum', imageUrl: null }], nextPageInfo: null, missingIds: [] } : { shopCurrencyCode: 'USD', markets: [] } };
      },
    })));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    const addProducts = [...document.querySelectorAll('button')].find((button) => button.textContent.includes('Add products'));
    await act(() => addProducts.click());
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    const product = document.querySelector('[role="dialog"] input[type="checkbox"]');
    assert.ok(product);
    await act(() => Simulate.change(product, { target: { checked: true } }));
    const confirm = [...document.querySelectorAll('button')].find((button) => button.textContent === 'Select 1 item');
    await act(() => confirm.click());
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    const name = document.getElementById('campaign-name');
    const discountName = document.getElementById('campaign-discount-name');
    const startsAt = document.getElementById('schedule-starts-at');
    await act(async () => { Simulate.change(name, { target: { value: 'Winter offer' } }); Simulate.change(discountName, { target: { value: 'Winter offer at checkout' } }); Simulate.change(startsAt, { target: { value: '2026-12-01T10:00' } }); });
    const save = [...document.querySelectorAll('button')].find((button) => button.textContent === 'Create');
    assert.ok(save);
    await act(() => save.click());
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    assert.equal(coverageRequests, 1);
    assert.equal(saved, 1);
    await act(() => root.unmount());
  } finally {
    Object.assign(globalThis, previous);
    dom.window.close();
    await vite.close();
  }
});

test('saving a collection campaign blocks on a collection coverage conflict and shows collection details', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/quantity-breaks/campaigns/c1' });
  const previous = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement, ResizeObserver: globalThis.ResizeObserver, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  class ResizeObserverStub { observe() {} disconnect() {} }
  dom.window.requestAnimationFrame = (callback) => setTimeout(callback, 0);
  dom.window.HTMLElement.prototype.attachEvent = () => {};
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, ResizeObserver: ResizeObserverStub, IS_REACT_ACT_ENVIRONMENT: true });
  try {
    const { CampaignEditor } = await vite.ssrLoadModule('/src/prototype/CampaignEditor.tsx');
    let saved = 0;
    let coverageCandidate;
    const root = createRoot(document.getElementById('root'));
    await act(() => root.render(React.createElement(CampaignEditor, {
      campaign: { id: 'c1', name: 'Collection offer', discountName: 'Collection checkout offer', products: '1 collection', scope: { kind: 'collections', collectionIds: ['collection-1'], excludedProductIds: [] }, tiers: [{ tierId: 'tier-1', quantity: 1, label: 'Single', discountPercent: 0 }], status: 'Draft', schedule: '', updated: '', startsAt: '2026-12-01T10:00:00.000Z', neverExpires: true },
      campaigns: [], onCancel: () => {}, onSave: async () => { saved += 1; }, notify: () => {},
      fetcher: async (url, options) => {
        if (url.includes('/campaigns/coverage')) {
          coverageCandidate = JSON.parse(options.body).campaign;
          return { ok: true, json: async () => ({ state: 'conflict', conflicts: [{ campaignId: 'c2', campaignName: 'Active collection campaign', itemId: 'collection-1', itemName: 'Winter collection', type: 'collections' }] }) };
        }
        if (url.includes('/collections/collection-1/products')) return { ok: true, json: async () => ({ products: [], nextPageInfo: null }) };
        if (url.includes('/collections/collection-1')) return { ok: true, json: async () => ({ collection: { id: 'collection-1', title: 'Winter collection', kind: 'manual', imageUrl: null } }) };
        if (url.startsWith('/api/quantity-breaks/collections')) return { ok: true, json: async () => ({ collections: [], nextPageInfo: null }) };
        return { ok: true, json: async () => ({ shopCurrencyCode: 'USD', markets: [] }) };
      },
    })));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    const name = document.getElementById('campaign-name');
    await act(() => Simulate.change(name, { target: { value: 'Collection offer updated' } }));
    const save = [...document.querySelectorAll('button')].find((button) => button.textContent === 'Save');
    assert.ok(save);
    await act(() => save.click());
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    assert.deepEqual(coverageCandidate.scope, { kind: 'collections', collectionIds: ['collection-1'], excludedProductIds: [] });
    assert.equal(saved, 0);
    assert.match(document.body.textContent, /Active collection campaign/);
    assert.match(document.body.textContent, /Winter collection/);
    assert.match(document.body.textContent, /Product collections/);
    await act(() => root.unmount());
  } finally {
    Object.assign(globalThis, previous);
    dom.window.close();
    await vite.close();
  }
});
