import assert from 'node:assert/strict';
import { test } from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

test('campaign preview uses the selected market for storefront copy and market prices', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/quantity-breaks/new' });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    ResizeObserver: globalThis.ResizeObserver,
    IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT,
  };
  class ResizeObserverStub { observe() {} disconnect() {} }
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    ResizeObserver: ResizeObserverStub,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  try {
    const { CampaignEditor } = await vite.ssrLoadModule('/src/prototype/CampaignEditor.tsx');
    const priceRequests = [];
    let releaseSlow;
    const fetcher = async (url) => {
      const parsed = new URL(url, 'http://localhost');
      if (parsed.pathname === '/api/quantity-breaks/markets') return { ok: true, json: async () => ({ shopCurrencyCode: 'USD', markets: [
        { id: 'us', name: 'United States', enabled: true, primary: true, currencyCode: 'USD', regionCurrencyCodes: ['USD'], regionCodes: ['US', 'CA'], defaultLocale: 'en', specifiedAmountSupported: true },
        { id: 'jp', name: 'Japan', enabled: true, primary: false, currencyCode: 'JPY', regionCurrencyCodes: ['JPY'], regionCodes: ['JP'], defaultLocale: 'ja', specifiedAmountSupported: true },
      ] }) };
      if (/\/variants\/variant-\d+\/market-prices$/.test(parsed.pathname)) {
        priceRequests.push(parsed.pathname + parsed.search);
        if (parsed.pathname.includes('/variant-2/')) return new Promise(resolve => { releaseSlow = () => resolve({ ok: true, json: async () => ({ prices: [{ countryCode: 'JP', amountMinor: 999999999, currencyCode: 'JPY' }] }) }); });
        return { ok: true, json: async () => ({ prices: parsed.searchParams.get('country_codes').split(',').map(countryCode => ({ countryCode, amountMinor: countryCode === 'JP' ? 906687400 : 5739000, currencyCode: countryCode === 'JP' ? 'JPY' : 'USD' })) }) };
      }
      if (parsed.pathname.startsWith('/api/quantity-breaks/translations/')) {
        return { ok: true, json: async () => ({ translations: parsed.pathname.endsWith('/ja') ? { 'widget.add_to_cart': 'カートに追加 {quantity} - {price}' } : {} }) };
      }
      if (parsed.pathname === '/api/quantity-breaks/products' && parsed.searchParams.get('ids')) return { ok: true, json: async () => ({ products: [], missingIds: [] }) };
      if (parsed.pathname === '/api/quantity-breaks/products') return { ok: true, json: async () => ({ products: [{ id: 'product-1', title: 'Preview product', imageUrl: null, optionNames: ['Style'], variants: Array.from({ length: 100 }, (_, index) => ({ id: `variant-${index + 1}`, title: `Style ${index + 1}`, price: 10, compareAtPrice: 10, inventory: 100, available: true, imageUrl: null, options: [{ name: 'Style', value: `Style ${index + 1}` }] })) }], nextPageInfo: null }) };
      throw new Error(`Unexpected request: ${url}`);
    };
    const root = createRoot(document.getElementById('root'));
    await act(async () => {
      root.render(React.createElement(CampaignEditor, { campaign: null, campaigns: [], onCancel: () => {}, onSave: async () => {}, notify: () => {}, fetcher }));
      await new Promise((resolve) => setTimeout(resolve, 60));
    });

    const selector = document.querySelector('[data-preview-control="market"] select');
    assert.ok(selector, 'the preview offers a market selector');
    assert.equal(selector.value, 'us');
    assert.deepEqual([...selector.options].map((option) => option.value), ['us', 'jp']);
    assert.match(document.body.textContent, /\$57,390\.00/);
    assert.equal(priceRequests.length, 1, '100 variants only fetch the variant needed by all displayed tiers');
    assert.match(priceRequests[0], /country_codes=US$/);
    const country = document.querySelector('[data-preview-control="country"] select');
    assert.ok(country, 'preview identifies a specific country within the market');
    await act(async () => { country.value = 'CA'; country.dispatchEvent(new dom.window.Event('change', { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 600)); });
    assert.equal(priceRequests.length, 2);
    assert.match(priceRequests[1], /country_codes=CA$/);
    await act(async () => { country.value = 'US'; country.dispatchEvent(new dom.window.Event('change', { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 60)); });
    assert.equal(priceRequests.length, 2, 'switching back reuses the successful price');

    const toolbar = document.querySelector('[data-preview-toolbar]');
    assert.ok(toolbar, 'the preview groups device, market, and product controls in one toolbar');
    assert.equal(toolbar.querySelectorAll('[data-preview-control]').length, 4, 'the preview exposes device, market, country, and product control groups');
    assert.equal(toolbar.querySelector('[data-preview-control="language"]'), null, 'the editor no longer controls storefront language directly');
    assert.ok(toolbar.querySelector('[data-preview-product-title]'), 'the selected preview product has a dedicated truncation target');

    await act(async () => {
      selector.value = 'jp';
      selector.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 600));
    });
    assert.match(document.body.textContent, /カートに追加/);
    assert.match(document.body.textContent, /￥906,687,400/);
    const variantSelector = document.querySelector('[class*="variantSlot"] select');
    assert.ok(variantSelector);
    await act(async () => { variantSelector.value = 'Style 2'; variantSelector.dispatchEvent(new dom.window.Event('change', { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 600)); });
    assert.equal(priceRequests.length, 4, 'changing a variant only fetches its missing price');
    assert.ok(document.querySelector('[class*="variantSlot"] select'), 'selectors remain usable while a price is pending');
    await act(async () => { const selector = document.querySelector('[class*="variantSlot"] select'); selector.value = 'Style 1'; selector.dispatchEvent(new dom.window.Event('change', { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 60)); });
    await act(async () => { releaseSlow(); await new Promise(resolve => setTimeout(resolve, 60)); });
    assert.match(document.body.textContent, /￥906,687,400/);
    assert.doesNotMatch(document.body.textContent, /999,999,999/, 'a stale response cannot overwrite the new selection');
    assert.equal(priceRequests.length, 4);
    await act(async () => root.unmount());
  } finally {
    Object.assign(globalThis, previous);
    dom.window.close();
    await vite.close();
  }
});
