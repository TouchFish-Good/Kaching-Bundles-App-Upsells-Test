import assert from 'node:assert/strict';
import { test } from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

test('storefront preview defaults to the first catalog product and lets the merchant replace it in a single-product dialog', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/quantity-breaks/new' });
  const previous = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement, ResizeObserver: globalThis.ResizeObserver, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  const previousAttachEvent = dom.window.HTMLElement.prototype.attachEvent;
  class ResizeObserverStub { observe() {} disconnect() {} }
  dom.window.HTMLElement.prototype.attachEvent = () => {};
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, ResizeObserver: ResizeObserverStub, IS_REACT_ACT_ENVIRONMENT: true });
  try {
    const { CampaignEditor } = await vite.ssrLoadModule('/src/prototype/CampaignEditor.tsx');
    const products = [
      { id: 'first', title: 'First catalog product', imageUrl: null, optionNames: [], variants: [] },
      { id: 'second', title: 'Preview replacement', imageUrl: null, optionNames: [], variants: [] },
    ];
    const fetcher = async (url) => {
      const parsed = new URL(url, 'http://localhost');
      if (parsed.pathname === '/api/quantity-breaks/markets') return { ok: true, json: async () => ({ shopCurrencyCode: 'USD', markets: [] }) };
      if (parsed.pathname === '/api/quantity-breaks/products' && parsed.searchParams.get('ids')) return { ok: true, json: async () => ({ products: products.filter((product) => parsed.searchParams.get('ids').split(',').includes(product.id)), missingIds: [] }) };
      if (parsed.pathname === '/api/quantity-breaks/products') return { ok: true, json: async () => ({ products, nextPageInfo: null }) };
      throw new Error(`Unexpected request: ${url}`);
    };
    const root = createRoot(document.getElementById('root'));
    await act(async () => { root.render(React.createElement(CampaignEditor, { campaign: null, campaigns: [], onCancel: () => {}, onSave: async () => {}, notify: () => {}, fetcher })); await Promise.resolve(); });

    assert.match(document.body.textContent, /First catalog product/);
    assert.doesNotMatch(document.body.textContent, /Product:\s*First catalog product/);
    const trigger = [...document.querySelectorAll('button')].find((button) => button.textContent === 'Choose preview product');
    assert.ok(trigger, 'the preview uses a dedicated product-selection trigger');
    assert.doesNotMatch(document.body.textContent, /Product-page offer/);

    await act(async () => trigger.click());
    assert.equal(document.querySelector('[role="dialog"]')?.getAttribute('aria-label'), 'Select products');
    const choices = [...document.querySelectorAll('[role="dialog"] input[type="checkbox"]')];
    assert.equal(choices.length, 2);
    await act(async () => choices[1].click());
    await act(async () => [...document.querySelectorAll('[role="dialog"] button')].find((button) => button.textContent === 'Select 1 item').click());
    assert.match(document.body.textContent, /Preview replacement/);
    assert.doesNotMatch(document.body.textContent, /Product:\s*Preview replacement/);
    await act(async () => root.unmount());
  } finally {
    dom.window.HTMLElement.prototype.attachEvent = previousAttachEvent;
    Object.assign(globalThis, previous);
    dom.window.close();
    await vite.close();
  }
});
