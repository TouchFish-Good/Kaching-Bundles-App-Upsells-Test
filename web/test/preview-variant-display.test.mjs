import assert from 'node:assert/strict';
import { test } from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { JSDOM } from 'jsdom';

const product = {
  id: 'stock-preview', title: 'Stock preview', optionNames: ['Size'],
  variants: [
    { id: 'available', price: 20, compareAtPrice: 30, inventory: 10, available: true, options: [{ name: 'Size', value: 'S' }] },
    { id: 'sold-out', price: 42, compareAtPrice: 60, inventory: 0, available: false, options: [{ name: 'Size', value: 'L' }] },
  ],
};
const props = {
  device: 'desktop', accent: '#171717', locale: 'en', compact: true, previewOnly: true, notify: () => {},
  campaignProduct: product,
  tiers: [{ quantity: 1, label: 'Single', discountType: 'percentage', discountPercent: 20, discountValue: 20, recommended: true }],
  config: { allowMixed: true, showSelectors: true, selectorStyle: 'Dropdown', imageTileSize: 48, imageTileRadius: 6, showImageColorValue: true, widgetFontSize: 14, showStock: false, showPricing: true },
};

test('unselected preview dropdown uses the saved choose-option translation or its English default', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { StorefrontWidget } = await vite.ssrLoadModule('/src/prototype/StorefrontWidget.tsx');
    const { defaultCampaignWidgetConfig } = await vite.ssrLoadModule('/src/prototype/widget-config.ts');
    const campaignConfig = defaultCampaignWidgetConfig();
    campaignConfig.variants.defaultSelection = 'none';
    for (const [translations, expected] of [[{}, 'Choose an option'], [{ 'widget.choose_option': '请选择规格' }, '请选择规格']]) {
      const html = renderToStaticMarkup(React.createElement(StorefrontWidget, { ...props, campaignConfig, translations }));
      const document = new JSDOM(html).window.document;
      const placeholder = document.querySelector('select option[value=""]');
      assert.equal(placeholder.textContent, expected);
      assert.ok(placeholder.disabled);
      assert.ok(placeholder.selected);
    }
  } finally { await vite.close(); }
});

test('sold-out preview selection shows its selling price without a discount or stock marker and still blocks cart', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const previous = Object.fromEntries(['window', 'document', 'HTMLElement', 'ResizeObserver', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, globalThis[key]]));
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, ResizeObserver: class { observe() {} disconnect() {} }, IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(document.getElementById('root'));
  try {
    const { StorefrontWidget } = await vite.ssrLoadModule('/src/prototype/StorefrontWidget.tsx');
    const render = (extra = {}) => act(() => root.render(React.createElement(StorefrontWidget, { ...props, ...extra })));
    const select = async value => act(() => {
      const dropdown = document.querySelector('select');
      dropdown.value = value;
      dropdown.dispatchEvent(new window.Event('change', { bubbles: true }));
    });
    const price = () => document.querySelector('[class*="stockState"]');
    const cart = () => document.querySelector('button[class*="addBundle"]');
    await render();
    assert.equal(price().querySelector('b').textContent, '$16.00', 'available variant still receives the tier discount');
    await select('L');
    assert.equal(price().textContent, '$42.00');
    assert.equal(price().querySelector('del'), null);
    assert.doesNotMatch(price().className, /soldOut/);
    assert.equal(cart().textContent, 'Sold out');
    assert.ok(cart().disabled);
    const market = { state: 'ready', currencyCode: 'USD', amountsByVariant: { available: 3000, 'sold-out': 5500 } };
    await render({ previewPricing: market });
    assert.equal(price().textContent, '$55.00', 'use the selected market price, not shop price');
    await render({ previewPricing: { ...market, amountsByVariant: { available: 3000 } } });
    assert.equal(price().textContent, '…', 'missing market price must not fall back to the shop price');
    assert.ok(cart().disabled);
    await render({ previewPricing: market });
    await select('S');
    assert.equal(price().querySelector('b').textContent, '$24.00');
    assert.equal(cart().disabled, false, 'available selection restores cart');
  } finally {
    await act(() => root.unmount());
    Object.assign(globalThis, previous);
    dom.window.close();
    await vite.close();
  }
});


test('preview omits unset subtitle rows and preserves configured subtitles regardless of market price readiness', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { StorefrontWidget } = await vite.ssrLoadModule('/src/prototype/StorefrontWidget.tsx');
    const tiers = [
      { quantity: 1, label: 'Missing', discountPercent: 0 },
      { quantity: 2, label: 'Empty', subtitle: '', discountPercent: 10 },
      { quantity: 3, label: 'Whitespace', subtitle: '  ', discountPercent: 20 },
      { quantity: 4, label: 'Configured', subtitle: '任选四件，享受优惠', discountPercent: 30 },
    ];
    for (const previewPricing of [undefined, { state: 'loading' }, { state: 'unavailable' }, { state: 'ready', currencyCode: 'USD', amountsByVariant: { available: 3000 } }]) {
      const html = renderToStaticMarkup(React.createElement(StorefrontWidget, { ...props, tiers, previewPricing }));
      const dom = new JSDOM(html);
      try {
        const subtitles = [...dom.window.document.querySelectorAll('[class*="tierSubtitle"]')];
        assert.deepEqual(subtitles.map(node => node.textContent), ['任选四件，享受优惠']);
        assert.equal(dom.window.document.querySelectorAll('button[class*="tierOption"]').length, 4, 'keep every tier visible');
      } finally { dom.window.close(); }
    }
  } finally { await vite.close(); }
});
