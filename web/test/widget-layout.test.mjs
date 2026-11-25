import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

test('each campaign widget applies its own layout and appearance tokens', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { StorefrontWidget } = await vite.ssrLoadModule('/src/prototype/StorefrontWidget.tsx');
    const { defaultCampaignWidgetConfig } = await vite.ssrLoadModule('/src/prototype/widget-config.ts');
    const campaignConfig = defaultCampaignWidgetConfig();
    campaignConfig.layout = 'grid';
    campaignConfig.card.gapPx = 12;
    campaignConfig.card.radiusPx = 5;
    campaignConfig.colors.card = '#123456';
    campaignConfig.colors.selected = '#12345680';
    campaignConfig.colors.summaryLabel = '#345678';
    campaignConfig.colors.summaryAmount = '#987654';
    campaignConfig.colors.cardBorder = '#112233';
    campaignConfig.colors.border = '#223344';
    campaignConfig.colors.savingsLabel = '#334455';
    campaignConfig.colors.addButtonBorder = '#445566';
    campaignConfig.colors.tierSavingsBadgeText = '#556677';
    campaignConfig.colors.tierSavingsBadgeBackground = '#667788';
    campaignConfig.card.tierSavingsBadgeRadiusPx = 13;
    campaignConfig.typography.comparePrice = { sizePx: 11, weight: 500 };
    campaignConfig.typography.addButton = { sizePx: 15, weight: 700 };
    campaignConfig.typography.tierSavingsBadge = { sizePx: 16, weight: 800 };
    campaignConfig.typography.summaryLabel = { sizePx: 13, weight: 500 };
    campaignConfig.typography.checkoutNote = { sizePx: 12, weight: 400 };
    campaignConfig.typography.savingsLabel = { sizePx: 24, weight: 900 };
    campaignConfig.typography.savingsPrice = { sizePx: 13, weight: 500 };
    const html = renderToStaticMarkup(React.createElement(StorefrontWidget, {
      device: 'desktop', accent: '#171717', locale: 'en', compact: true, notify: () => {},
      campaignConfig,
      config: { allowMixed: true, showSelectors: true, selectorStyle: 'Dropdown', imageTileSize: 10, imageTileRadius: 4, showImageColorValue: true, widgetFontSize: 14, showStock: false, showPricing: true },
    }));
    assert.match(html, /data-layout="grid"/);
    assert.match(html, /--card-gap:12px/);
    assert.match(html, /--card-radius:5px/);
    assert.match(html, /--card-color:#123456/);
    assert.match(html, /--selected-color:#12345680/);
    assert.match(html, /--summary-label-color:#345678/);
    assert.match(html, /--summary-amount-color:#987654/);
    assert.match(html, /--card-border-color:#112233/);
    assert.match(html, /--border-color:#223344/);
    assert.match(html, /--savings-label-color:#334455/);
    assert.match(html, /--add-button-border:#445566/);
    assert.match(html, /--tier-savings-badge-text:#556677/);
    assert.match(html, /--tier-savings-badge-background:#667788/);
    assert.match(html, /--tier-savings-badge-radius:13px/);
    assert.match(html, /--compare-price-size:11px/);
    assert.match(html, /--add-button-size:15px/);
    assert.match(html, /--tier-savings-badge-size:16px/);
    assert.match(html, /--tier-savings-badge-weight:800/);
    assert.match(html, /--summary-label-size:13px/);
    assert.match(html, /--checkout-note-size:12px/);
    assert.match(html, /--savings-label-size:24px/);
    assert.match(html, /--savings-label-weight:900/);
    assert.match(html, /--savings-price-size:13px/);
    assert.match(html, /--savings-price-weight:500/);
  } finally { await vite.close(); }
});

test('tier savings badges are opt-in, localized, and omitted when a tier has no savings', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { StorefrontWidget } = await vite.ssrLoadModule('/src/prototype/StorefrontWidget.tsx');
    const { defaultCampaignWidgetConfig } = await vite.ssrLoadModule('/src/prototype/widget-config.ts');
    const campaignConfig = defaultCampaignWidgetConfig();
    campaignConfig.showTierSavingsBadge = false;
    const props = {
      device: 'desktop', accent: '#171717', locale: 'en', compact: true, previewOnly: true, notify: () => {},
      config: { allowMixed: true, showSelectors: true, selectorStyle: 'Dropdown', imageTileSize: 48, imageTileRadius: 6, showImageColorValue: true, widgetFontSize: 14, showStock: false, showPricing: true },
      tiers: [
        { quantity: 1, label: 'Single', discountPercent: 0 },
        { quantity: 2, label: 'Double', discountPercent: 20, recommended: true },
      ],
      translations: { 'widget.tier_savings_badge': 'Save {saving_amount}' },
      campaignProduct: { id: 'product-1', title: 'Product', imageUrl: null, optionNames: [], variants: [{ id: 'variant-1', title: 'Default', price: 100, compareAtPrice: 100, inventory: 5, available: true, imageUrl: null, options: [] }] },
    };
    const disabled = renderToStaticMarkup(React.createElement(StorefrontWidget, { ...props, campaignConfig }));
    assert.doesNotMatch(disabled, /Save \$40\.00/);
    campaignConfig.showTierSavingsBadge = true;
    const enabled = renderToStaticMarkup(React.createElement(StorefrontWidget, { ...props, campaignConfig }));
    assert.match(enabled, /Save \$40\.00/);
    assert.doesNotMatch(enabled, /Save \$0\.00/);
    assert.match(enabled, /tierTitleRow[^>]*><strong>Double<\/strong><span[^>]*tierSavingsBadge[^>]*>Save \$40\.00<\/span>/);
  } finally { await vite.close(); }
});

test('market preview uses specified fixed amounts and shows automatic conversion without blocking', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { StorefrontWidget } = await vite.ssrLoadModule('/src/prototype/StorefrontWidget.tsx');
    const { defaultCampaignWidgetConfig } = await vite.ssrLoadModule('/src/prototype/widget-config.ts');
    const props = {
      device: 'desktop', accent: '#171717', locale: 'ja', compact: true, previewOnly: true, notify: () => {}, campaignConfig: defaultCampaignWidgetConfig(),
      config: { allowMixed: true, showSelectors: true, selectorStyle: 'Dropdown', imageTileSize: 48, imageTileRadius: 6, showImageColorValue: true, widgetFontSize: 14, showStock: false, showPricing: true },
      campaignProduct: { id: 'product-1', title: 'Product', imageUrl: null, optionNames: [], variants: [{ id: 'variant-1', title: 'Default', price: 10, compareAtPrice: 10, inventory: 5, available: true, imageUrl: null, options: [] }] },
      previewPricing: { state: 'ready', amountsByVariant: { 'variant-1': 1000 }, currencyCode: 'JPY', isPrimaryMarket: false, shopCurrencyCode: 'USD', autoExchangeRate: false, exchangeRate: 6.6 }, previewMarketId: 'jp',
      previewMessages: { loading: 'Loading', unavailable: 'Unavailable', conversionUnavailable: 'Actual price prevails.' },
    };
    for (const discountType of ['fixed_amount', 'fixed_price', 'bundle_fixed_amount', 'bundle_fixed_price']) {
      const html = renderToStaticMarkup(React.createElement(StorefrontWidget, { ...props, tiers: [{ quantity: 1, label: discountType, discountPercent: 0, discountType, discountValue: 999, marketOverrides: { jp: { mode: 'specified_amount', currencyCode: 'JPY', amountMinor: 800 } } }] }));
      assert.match(html, /￥/);
      assert.doesNotMatch(html, /\$/);
    }
    const autoConverted = renderToStaticMarkup(React.createElement(StorefrontWidget, { ...props, tiers: [{ quantity: 1, label: 'Auto', discountPercent: 0, discountType: 'fixed_price', discountValue: 999, marketOverrides: { jp: { mode: 'auto_convert' } } }] }));
    assert.match(autoConverted, /Actual price prevails\./);
    assert.doesNotMatch(autoConverted, /disabled=""/);
  } finally { await vite.close(); }
});

test('market preview keeps rendering while a fixed discount amount is incomplete', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { StorefrontWidget } = await vite.ssrLoadModule('/src/prototype/StorefrontWidget.tsx');
    const { defaultCampaignWidgetConfig } = await vite.ssrLoadModule('/src/prototype/widget-config.ts');
    const props = {
      device: 'desktop', accent: '#171717', locale: 'ja', compact: true, previewOnly: true, notify: () => {}, campaignConfig: defaultCampaignWidgetConfig(),
      config: { allowMixed: true, showSelectors: true, selectorStyle: 'Dropdown', imageTileSize: 48, imageTileRadius: 6, showImageColorValue: true, widgetFontSize: 14, showStock: false, showPricing: true },
      previewPricing: { state: 'ready', amountsByVariant: { 'black-m': 1000 }, currencyCode: 'JPY', isPrimaryMarket: false, shopCurrencyCode: 'USD', autoExchangeRate: true, exchangeRate: null },
      previewMarketId: 'jp',
    };
    for (const discountType of ['fixed_amount', 'fixed_price']) {
      assert.doesNotThrow(() => renderToStaticMarkup(React.createElement(StorefrontWidget, {
        ...props,
        tiers: [{ quantity: 1, label: discountType, discountPercent: 0, discountType, marketOverrides: { jp: { mode: 'auto_convert' } } }],
      })));
    }
  } finally { await vite.close(); }
});

test('primary-market preview keeps rendering when a nonselected tier has an incomplete specified amount', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { StorefrontWidget } = await vite.ssrLoadModule('/src/prototype/StorefrontWidget.tsx');
    const { defaultCampaignWidgetConfig } = await vite.ssrLoadModule('/src/prototype/widget-config.ts');
    const props = {
      device: 'desktop', accent: '#171717', locale: 'en', compact: true, previewOnly: true, notify: () => {}, campaignConfig: defaultCampaignWidgetConfig(),
      config: { allowMixed: true, showSelectors: true, selectorStyle: 'Dropdown', imageTileSize: 48, imageTileRadius: 6, showImageColorValue: true, widgetFontSize: 14, showStock: false, showPricing: true },
      previewPricing: { state: 'ready', amountsByVariant: { 'black-m': 1000 }, currencyCode: 'USD', isPrimaryMarket: true, shopCurrencyCode: 'USD', autoExchangeRate: true, exchangeRate: null },
      previewMarketId: 'us',
      tiers: [
        { quantity: 1, label: 'Ready', discountPercent: 0, discountType: 'fixed_amount', discountValue: 100, recommended: true, marketOverrides: { us: { mode: 'specified_amount', currencyCode: 'USD', amountMinor: 80 } } },
        { quantity: 2, label: 'Incomplete', discountPercent: 0, discountType: 'fixed_amount', discountValue: 100, marketOverrides: { us: { mode: 'specified_amount', currencyCode: 'USD' } } },
      ],
    };

    assert.doesNotThrow(() => renderToStaticMarkup(React.createElement(StorefrontWidget, props)));
  } finally { await vite.close(); }
});

test('mixed market preview prices every rendered and selected tier from its own override', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { StorefrontWidget } = await vite.ssrLoadModule('/src/prototype/StorefrontWidget.tsx');
    const { defaultCampaignWidgetConfig } = await vite.ssrLoadModule('/src/prototype/widget-config.ts');
    // Literal totals are hand-calculated from USD 100 / EUR 60 per item and a 0.5 fixed rate.
    const rows = [
      ['Original', 'none', 0, null, null, '$100.00', '€60.00'],
      ['Percentage', 'percentage', 10, null, null, '$180.00', '€108.00'],
      ['Auto amount', 'fixed_amount', 1000, null, null, '$270.00', '€165.00'],
      ['Specified amount', 'fixed_amount', 900, 700, 2000, '$372.00', '€160.00'],
      ['Auto price', 'fixed_price', 8000, null, null, '$400.00', '€200.00'],
      ['Specified price', 'fixed_price', 9900, 6500, 3500, '$390.00', '€210.00'],
      ['Auto bundle amount', 'bundle_fixed_amount', 3000, null, null, '$670.00', '€405.00'],
      ['Specified bundle amount', 'bundle_fixed_amount', 800, 4000, 2500, '$760.00', '€455.00'],
      ['Auto bundle price', 'bundle_fixed_price', 70000, null, null, '$700.00', '€350.00'],
      ['Specified bundle price', 'bundle_fixed_price', 90000, 75000, 45000, '$750.00', '€450.00'],
    ];
    const tiers = rows.map(([label, discountType, discountValue, us, eu], index) => ({
      quantity: index + 1, label, discountType, discountValue, discountPercent: 0,
      marketOverrides: us === null ? { us: { mode: 'auto_convert' }, eu: { mode: 'auto_convert' } } : {
        us: { mode: 'specified_amount', currencyCode: 'USD', amountMinor: us },
        eu: { mode: 'specified_amount', currencyCode: 'EUR', amountMinor: eu },
      },
    }));
    const campaignConfig = defaultCampaignWidgetConfig();
    campaignConfig.showCartVariantDetails = false;
    campaignConfig.showPriceSummary = true;
    const props = {
      device: 'desktop', accent: '#171717', locale: 'en', compact: true, previewOnly: true, notify: () => {}, campaignConfig,
      config: { allowMixed: true, showSelectors: true, selectorStyle: 'Dropdown', imageTileSize: 48, imageTileRadius: 6, showImageColorValue: true, widgetFontSize: 14, showStock: false, showPricing: true },
      campaignProduct: { id: 'product-1', title: 'Product', imageUrl: null, optionNames: [], variants: [{ id: 'variant-1', title: 'Default', price: 100, compareAtPrice: 100, inventory: 100, available: true, imageUrl: null, options: [] }] },
      previewMessages: { loading: 'Loading', unavailable: 'Unavailable', conversionUnavailable: 'Actual price prevails.' },
    };
    for (const market of [
      { id: 'us', currencyCode: 'USD', isPrimaryMarket: true, amount: 10000, expectedColumn: 5 },
      { id: 'eu', currencyCode: 'EUR', isPrimaryMarket: false, amount: 6000, expectedColumn: 6 },
    ]) {
      for (const selected of tiers) {
        const html = renderToStaticMarkup(React.createElement(StorefrontWidget, {
          ...props, tiers: tiers.map((tier) => ({ ...tier, recommended: tier === selected })), previewMarketId: market.id,
          previewPricing: { state: 'ready', amountsByVariant: { 'variant-1': market.amount }, currencyCode: market.currencyCode, isPrimaryMarket: market.isPrimaryMarket, shopCurrencyCode: 'USD', autoExchangeRate: false, exchangeRate: 0.5 },
        }));
        const dom = new JSDOM(html);
        try {
          const document = dom.window.document;
          const options = [...document.querySelectorAll('button[aria-pressed]')];
          assert.equal(options.length, tiers.length);
          options.forEach((option, index) => {
            const message = `${market.id}: ${rows[index][0]}, selected ${selected.label}`;
            assert.equal(option.querySelector('[class*="tierAmount"] b').textContent, rows[index][market.expectedColumn], message);
            const autoNotice = !market.isPrimaryMarket && rows[index][3] === null && !['none', 'percentage'].includes(rows[index][1]);
            assert.equal(option.querySelector('[class*="tierConversionNotice"]')?.textContent ?? '', autoNotice ? 'Actual price prevails.' : '', message);
          });
          assert.equal(document.querySelector('button[aria-pressed="true"] strong').textContent, selected.label);
          assert.equal(document.querySelector('[class*="grandTotal"] b').textContent, rows[selected.quantity - 1][market.expectedColumn]);
          assert.equal(document.querySelector('[class*="addBundle"]').disabled, false);
        } finally { dom.window.close(); }
      }
    }
  } finally { await vite.close(); }
});

test('campaign style editor keeps tier savings controls in the active device style', () => {
  const editor = readFileSync(new URL('../src/prototype/CampaignStyleEditor.tsx', import.meta.url), 'utf8');
  assert.match(editor, /tierSavingsBadgeText/);
  assert.match(editor, /tierSavingsBadgeBackground/);
  assert.match(editor, /tierSavingsBadgeRadiusPx/);
  assert.match(editor, /key: 'tierSavingsBadge'/);
  assert.match(editor, /styles\.styleSavingsBadgeControl/);
});

test('campaign appearance applies detailed variant, cart and button tokens and switches badge placement', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { StorefrontWidget } = await vite.ssrLoadModule('/src/prototype/StorefrontWidget.tsx');
    const { defaultCampaignWidgetConfig } = await vite.ssrLoadModule('/src/prototype/widget-config.ts');
    const campaignConfig = defaultCampaignWidgetConfig();
    campaignConfig.badgePosition = 'below_subtitle';
    campaignConfig.colors.variantBorder = '#123456';
    campaignConfig.colors.variantSelectedBorder = '#234567';
    campaignConfig.colors.addButtonBackground = '#345678';
    campaignConfig.colors.addButtonText = '#FFFFFF';
    campaignConfig.typography.variantValue = { sizePx: 15, weight: 500 };
    campaignConfig.typography.cartLine = { sizePx: 13, weight: 400 };
    const html = renderToStaticMarkup(React.createElement(StorefrontWidget, {
      device: 'desktop', accent: '#171717', locale: 'en', compact: true, notify: () => {}, campaignConfig,
      config: { allowMixed: true, showSelectors: true, selectorStyle: 'Dropdown', imageTileSize: 48, imageTileRadius: 6, showImageColorValue: true, widgetFontSize: 14, showStock: false, showPricing: true },
    }));
    assert.match(html, /data-badge-position="below_subtitle"/);
    assert.match(html, /--variant-border:#123456/);
    assert.match(html, /--variant-selected-border:#234567/);
    assert.match(html, /--add-button-bg:#345678/);
    assert.match(html, /--add-button-color:#FFFFFF/);
    assert.match(html, /--variant-value-size:15px/);
    assert.match(html, /--cart-line-size:13px/);
  } finally { await vite.close(); }
});

test('selected variant controls keep their configured border above sold-out styling', () => {
  const css = readFileSync(new URL('../src/pages/quantity-breaks.module.css', import.meta.url), 'utf8');
  assert.match(css, /\.storefront \.slotControls :is\(\.swatchActive,\.sizeActive,\.imageTileActive\)\[aria-pressed="true"\][^}]*box-shadow:inset 0 0 0 1px var\(--variant-selected-border/);
  assert.match(css, /\.storefront \.slotControls \.optionSoldOut\[aria-pressed="true"\][^}]*box-shadow:inset 0 0 0 1px var\(--variant-selected-border/);
  assert.doesNotMatch(css, /\.swatchActive,\.sizeActive \{[^}]*box-shadow:inset 0 0 0 1px var\(--accent/);
});

test('campaign preview retains the reference radio marker borders', () => {
  const css = readFileSync(new URL('../src/pages/quantity-breaks.module.css', import.meta.url), 'utf8');
  assert.match(css, /\.radioMark\s*\{[^}]*width:16px;[^}]*height:16px;[^}]*border-color:#8f8f8f;/);
  assert.match(css, /\.tierChoiceSelected \.radioMark\s*\{\s*border-color:var\(--accent,#171717\);\s*\}/);
});

test('button tier choices reset browser defaults without a pseudo radio marker', () => {
  const css = readFileSync(new URL('../src/pages/quantity-breaks.module.css', import.meta.url), 'utf8');
  assert.match(css, /\.storefront \.tierOption\{[^}]*width:100%;[^}]*border:0;[^}]*color:inherit;[^}]*background:transparent;[^}]*font:inherit;[^}]*text-align:left;/);
  assert.doesNotMatch(css, /\.tierOption::before/);
});

test('market conversion notices are centered and prominent', () => {
  const css = readFileSync(new URL('../src/pages/quantity-breaks.module.css', import.meta.url), 'utf8');
  const rule = css.match(/\.tierConversionNotice\s*\{([^}]*)\}/)?.[1] ?? '';
  assert.match(rule, /text-align:\s*center/);
  assert.match(rule, /color:\s*red!important/);
  assert.match(rule, /font-size:\s*15px!important/);
});

test('inherit-family font shorthands use individual font properties', () => {
  const css = readFileSync(new URL('../src/pages/quantity-breaks.module.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /font\s*:\s*\d{3}\s+[\d.]+(?:px|rem|em)\s*\/\s*[^\s;]+\s+inherit/);
  for (const selector of ['.previewDeviceToggle button', '.styleDeviceToggle button']) {
    const rule = new RegExp(`${selector.replace('.', '\\.')}(?:\\s*)\\{([^}]*)\\}`);
    const declaration = css.match(rule)?.[1] ?? '';
    assert.match(declaration, /font-weight:\s*600/);
    assert.match(declaration, /font-size:\s*11px/);
    assert.match(declaration, /line-height:\s*1/);
    assert.match(declaration, /font-family:\s*inherit/);
  }
});

test('preview uses the selected product option names and values instead of demo variants', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { StorefrontWidget } = await vite.ssrLoadModule('/src/prototype/StorefrontWidget.tsx');
    const { defaultCampaignWidgetConfig } = await vite.ssrLoadModule('/src/prototype/widget-config.ts');
    const campaignConfig = defaultCampaignWidgetConfig();
    campaignConfig.variants.selectorStyle = 'dropdown';
    const html = renderToStaticMarkup(React.createElement(StorefrontWidget, {
      device: 'desktop', accent: '#171717', locale: 'en', compact: true, previewOnly: true, notify: () => {}, campaignConfig,
      campaignProduct: {
        id: 'product-1', title: 'Linen shirt', imageUrl: null, optionNames: ['COLOR', 'SIZE'],
        variants: [
          { id: 'variant-1', title: 'Ocean / Medium', price: 29, compareAtPrice: 39, inventory: 4, available: true, imageUrl: null, options: [{ name: 'Colour', value: 'Ocean' }, { name: 'Fit', value: 'Medium' }] },
          { id: 'variant-2', title: 'Sand / Large', price: 31, compareAtPrice: null, inventory: 2, available: true, imageUrl: null, options: [{ name: 'Colour', value: 'Sand' }, { name: 'Fit', value: 'Large' }] },
        ],
      },
      config: { allowMixed: true, showSelectors: true, selectorStyle: 'Dropdown', imageTileSize: 10, imageTileRadius: 4, showImageColorValue: true, widgetFontSize: 14, showStock: false, showPricing: true },
    }));
    assert.match(html, />COLOR<select/);
    assert.match(html, />SIZE<select/);
    assert.match(html, /<option value="Ocean"(?: selected="")?>Ocean<\/option>/);
    assert.match(html, /<option value="Medium"(?: selected="")?>Medium<\/option>/);
    assert.doesNotMatch(html, />Black<\/option>/);
  } finally { await vite.close(); }
});

test('compact preview omits the selected product image and heading', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { StorefrontWidget } = await vite.ssrLoadModule('/src/prototype/StorefrontWidget.tsx');
    const { defaultCampaignWidgetConfig } = await vite.ssrLoadModule('/src/prototype/widget-config.ts');
    const html = renderToStaticMarkup(React.createElement(StorefrontWidget, {
      device: 'desktop', accent: '#171717', locale: 'en', compact: true, previewOnly: true, notify: () => {},
      campaignConfig: defaultCampaignWidgetConfig(),
      campaignProduct: {
        id: 'product-preview', title: 'Preview-only product', imageUrl: '/preview-only-product.jpg',
        variants: [{ id: 'preview-variant', title: 'Default title', price: 20, compareAtPrice: null, inventory: 5, available: true, imageUrl: null, options: [] }],
      },
      config: { allowMixed: true, showSelectors: true, selectorStyle: 'Dropdown', imageTileSize: 48, imageTileRadius: 6, showImageColorValue: true, widgetFontSize: 14, showStock: false, showPricing: true },
    }));
    assert.doesNotMatch(html, /preview-only-product\.jpg/);
    assert.doesNotMatch(html, /<h3[^>]*>Preview-only product<\/h3>/);
  } finally { await vite.close(); }
});

test('preview renders every returned option in all selector styles', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { StorefrontWidget } = await vite.ssrLoadModule('/src/prototype/StorefrontWidget.tsx');
    const product = {
      id: 'table', title: 'Dining table', imageUrl: null,
      optionNames: ['カラー', '木材', 'サイズ(cm)', 'Material', 'Style'],
      variants: [
        { id: 'a', title: 'White / Cherry / 120', price: 632.9, compareAtPrice: null, inventory: 2, available: true, imageUrl: '/table.jpg', options: [{ name: 'カラー', value: 'ホワイト' }, { name: '木材', value: 'チェリー材' }, { name: 'サイズ(cm)', value: '[A]L120×W75×H75' }, { name: 'Material', value: 'Solid wood' }, { name: 'Style', value: 'Modern' }] },
        { id: 'b', title: 'White / Cherry / 140', price: 715.9, compareAtPrice: null, inventory: 2, available: true, imageUrl: '/table.jpg', options: [{ name: 'カラー', value: 'ホワイト' }, { name: '木材', value: 'チェリー材' }, { name: 'サイズ(cm)', value: '[B]L140×W85×H75' }, { name: 'Material', value: 'Veneer' }, { name: 'Style', value: 'Classic' }] },
      ],
    };
    for (const selectorStyle of ['Dropdown', 'Text values', 'Color swatches', 'Original variant images']) {
      const html = renderToStaticMarkup(React.createElement(StorefrontWidget, {
        device: 'desktop', accent: '#171717', locale: 'en', compact: true, previewOnly: true, notify: () => {}, campaignProduct: product,
        tiers: [{ quantity: 1, label: 'Single', discountPercent: 0, recommended: true }],
        config: { allowMixed: true, showSelectors: true, selectorStyle, imageTileSize: 48, imageTileRadius: 6, showImageColorValue: true, widgetFontSize: 14, showStock: false, showPricing: true },
      }));
      for (const name of product.optionNames) assert.match(html, new RegExp(name.replace(/[()]/g, '\\$&')));
      assert.match(html, /\[B\]L140×W85×H75/);
      for (const value of ['Solid wood', 'Veneer', 'Modern', 'Classic']) assert.ok(html.includes(value), `${selectorStyle}: ${value}`);
    }
  } finally { await vite.close(); }
});

test('preview survives the catalog transition after selecting a different product', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const previous = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement, ResizeObserver: globalThis.ResizeObserver, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  class ResizeObserverStub { observe() {} disconnect() {} }
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, ResizeObserver: ResizeObserverStub, IS_REACT_ACT_ENVIRONMENT: true });
  try {
    const { StorefrontWidget } = await vite.ssrLoadModule('/src/prototype/StorefrontWidget.tsx');
    const { defaultCampaignWidgetConfig } = await vite.ssrLoadModule('/src/prototype/widget-config.ts');
    const props = { device: 'desktop', accent: '#171717', locale: 'en', compact: true, previewOnly: true, notify: () => {}, campaignConfig: { ...defaultCampaignWidgetConfig(), showCartVariantDetails: true }, config: { allowMixed: true, showSelectors: true, selectorStyle: 'Dropdown', imageTileSize: 48, imageTileRadius: 6, showImageColorValue: true, widgetFontSize: 14, showStock: false, showPricing: true } };
    const root = createRoot(document.getElementById('root'));
    await act(() => root.render(React.createElement(StorefrontWidget, props)));
    await act(() => root.render(React.createElement(StorefrontWidget, { ...props, campaignProduct: { id: 'selected', title: 'Selected product', imageUrl: null, variants: [{ id: 'selected-variant', title: 'Red / L', price: 20, compareAtPrice: null, options: [{ name: 'Option 1', value: 'Red' }, { name: 'Option 2', value: 'L' }], imageUrl: null, inventory: 1, inventoryPolicy: 'deny', available: true }] } })));
    assert.match(document.body.textContent, /Red \/ L/);
    await act(() => root.unmount());
  } finally { Object.assign(globalThis, previous); dom.window.close(); await vite.close(); }
});

test('a product with only its default variant shows tier totals without variant slots or demo images', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { StorefrontWidget } = await vite.ssrLoadModule('/src/prototype/StorefrontWidget.tsx');
    const { defaultCampaignWidgetConfig } = await vite.ssrLoadModule('/src/prototype/widget-config.ts');
    const html = renderToStaticMarkup(React.createElement(StorefrontWidget, {
      device: 'desktop', accent: '#171717', locale: 'en', compact: true, previewOnly: true, notify: () => {},
      campaignConfig: { ...defaultCampaignWidgetConfig(), showCartVariantDetails: true },
      campaignProduct: {
        id: 'product-default', title: 'Plain tee', imageUrl: null,
        variants: [{ id: 'default', title: 'Default title', price: 24, compareAtPrice: 30, inventory: 8, available: true, imageUrl: null, options: [] }],
      },
      config: { allowMixed: true, showSelectors: true, selectorStyle: 'Original variant images', imageTileSize: 48, imageTileRadius: 6, showImageColorValue: true, widgetFontSize: 14, showStock: false, showPricing: true },
    }));
    assert.match(html, /Plain tee × 3/);
    assert.match(html, /\$24\.00/);
    assert.doesNotMatch(html, /<legend>#1<\/legend>/);
    assert.doesNotMatch(html, /tierComposer/);
    assert.doesNotMatch(html, /images\.unsplash\.com/);
  } finally { await vite.close(); }
});

test('preview remains renderable when a selected product omits variant options', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { StorefrontWidget } = await vite.ssrLoadModule('/src/prototype/StorefrontWidget.tsx');
    const { defaultCampaignWidgetConfig } = await vite.ssrLoadModule('/src/prototype/widget-config.ts');
    const html = renderToStaticMarkup(React.createElement(StorefrontWidget, {
      device: 'desktop', accent: '#171717', locale: 'en', compact: true, previewOnly: true, notify: () => {},
      campaignConfig: { ...defaultCampaignWidgetConfig(), showCartVariantDetails: true },
      campaignProduct: { id: 'product-missing-options', title: 'Product without option metadata', imageUrl: null, variants: [{ id: 'variant-1', title: 'Default', price: 20, compareAtPrice: null, inventory: 2, available: true, imageUrl: null }] },
      config: { allowMixed: true, showSelectors: true, selectorStyle: 'Dropdown', imageTileSize: 48, imageTileRadius: 6, showImageColorValue: true, widgetFontSize: 14, showStock: false, showPricing: true },
    }));
    assert.match(html, /Product without option metadata ×/);
  } finally { await vite.close(); }
});

test('preview keeps rendering when product lookup returns no variant list', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { StorefrontWidget } = await vite.ssrLoadModule('/src/prototype/StorefrontWidget.tsx');
    const { defaultCampaignWidgetConfig } = await vite.ssrLoadModule('/src/prototype/widget-config.ts');
    const html = renderToStaticMarkup(React.createElement(StorefrontWidget, {
      device: 'desktop', accent: '#171717', locale: 'en', compact: true, previewOnly: true, notify: () => {},
      campaignConfig: defaultCampaignWidgetConfig(),
      campaignProduct: { id: 'product-no-variants', title: 'Catalog response without variants', imageUrl: null },
      config: { allowMixed: true, showSelectors: true, selectorStyle: 'Dropdown', imageTileSize: 48, imageTileRadius: 6, showImageColorValue: true, widgetFontSize: 14, showStock: false, showPricing: true },
    }));
    assert.match(html, /<legend>#1<\/legend>/);
  } finally { await vite.close(); }
});

test('image selector leaves a missing real variant image blank', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { StorefrontWidget } = await vite.ssrLoadModule('/src/prototype/StorefrontWidget.tsx');
    const html = renderToStaticMarkup(React.createElement(StorefrontWidget, {
      device: 'desktop', accent: '#171717', locale: 'en', compact: true, previewOnly: true, notify: () => {},
      campaignProduct: {
        id: 'product-images', title: 'Image-free shirt', imageUrl: null,
        variants: [
          { id: 'small', title: 'Small', price: 20, compareAtPrice: null, inventory: 2, available: true, imageUrl: null, options: [{ name: 'Size', value: 'S' }] },
          { id: 'large', title: 'Large', price: 22, compareAtPrice: null, inventory: 2, available: true, imageUrl: null, options: [{ name: 'Size', value: 'L' }] },
        ],
      },
      config: { allowMixed: true, showSelectors: true, selectorStyle: 'Original variant images', imageTileSize: 48, imageTileRadius: 6, showImageColorValue: true, widgetFontSize: 14, showStock: false, showPricing: true },
    }));
    assert.match(html, /class="[^"]*imageTile[^"]*"/);
    assert.doesNotMatch(html, /<img[^>]*images\.unsplash\.com/);
  } finally { await vite.close(); }
});

test('image selector uses variant images only for the first option', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { StorefrontWidget } = await vite.ssrLoadModule('/src/prototype/StorefrontWidget.tsx');
    const html = renderToStaticMarkup(React.createElement(StorefrontWidget, {
      device: 'desktop', accent: '#171717', locale: 'en', compact: true, previewOnly: true, notify: () => {},
      campaignProduct: {
        id: 'product-image-options', title: 'Two-option shirt', imageUrl: null, optionNames: ['Color', 'Size'],
        variants: [
          { id: 'black-s', title: 'Black / S', price: 20, compareAtPrice: null, inventory: 2, available: true, imageUrl: '/black-s.jpg', options: [{ name: 'Color', value: 'Black' }, { name: 'Size', value: 'S' }] },
          { id: 'white-l', title: 'White / L', price: 22, compareAtPrice: null, inventory: 2, available: true, imageUrl: '/white-l.jpg', options: [{ name: 'Color', value: 'White' }, { name: 'Size', value: 'L' }] },
        ],
      },
      config: { allowMixed: true, showSelectors: true, selectorStyle: 'Original variant images', imageTileSize: 48, imageTileRadius: 6, showImageColorValue: true, widgetFontSize: 14, showStock: false, showPricing: true },
    }));
    assert.equal((html.match(/class="[^"]*_imageTile_[^"]*"/g) ?? []).length, 6);
    assert.equal((html.match(/class="[^"]*_sizeButton_[^"]*"/g) ?? []).length, 6);
    const sizeButtons = html.match(/<button[^>]*_sizeButton_[^>]*>[\s\S]*?<\/button>/g) ?? [];
    assert.ok(sizeButtons.length > 0);
    assert.ok(sizeButtons.every((button) => !button.includes('<img')));
  } finally { await vite.close(); }
});

test('all layouts have one final badge placement rule for each badge position', () => {
  const css = readFileSync(new URL('../src/pages/quantity-breaks.module.css', import.meta.url), 'utf8');
  assert.match(css, /\.storefront \.tierChoices\[data-badge-position="corner"\] \.tierOption\{position:relative/);
  assert.doesNotMatch(css, /\.storefront \.tierChoices\[data-badge-position="corner"\] \.tierHeader\{position:relative/);
  assert.match(css, /\.storefront \.tierChoices\[data-badge-position="corner"\] \.tierTag\{position:absolute;top:0;right:12px/);
  assert.match(css, /\.storefront \.tierChoices\[data-badge-position="below_subtitle"\] \.tierHeader\{display:block/);
  assert.match(css, /\.storefront \.tierChoices\[data-badge-position="below_subtitle"\] \.tierTag\{position:static;display:block/);
  assert.doesNotMatch(css, /\.tierChoices\[data-layout="horizontal"\] \.tierAmount,\.storefront \.tierChoices\[data-layout="grid"\] \.tierAmount\{grid-column:2/);
});

test('an unset heading is absent while text selectors render as text buttons', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { StorefrontWidget } = await vite.ssrLoadModule('/src/prototype/StorefrontWidget.tsx');
    const { defaultCampaignWidgetConfig } = await vite.ssrLoadModule('/src/prototype/widget-config.ts');
    const campaignConfig = defaultCampaignWidgetConfig();
    campaignConfig.variants.selectorStyle = 'text';
    const html = renderToStaticMarkup(React.createElement(StorefrontWidget, {
      device: 'desktop', accent: '#171717', locale: 'en', compact: true, notify: () => {}, campaignConfig,
      translations: { 'widget.title': '' },
      config: { allowMixed: true, showSelectors: true, selectorStyle: 'Text values', imageTileSize: 32, imageTileRadius: 6, showImageColorValue: false, widgetFontSize: 14, showStock: false, showPricing: true },
    }));
    assert.doesNotMatch(html, /Bundle &amp; save/);
    assert.match(html, /aria-label="Black"[^>]*class="[^"]*sizeButton/);
  } finally { await vite.close(); }
});

test('legacy campaign appearance receives every detailed default without losing saved colors', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { normalizeCampaignWidgetConfig } = await vite.ssrLoadModule('/src/prototype/widget-config.ts');
    const legacy = { version: 1, layout: 'stacked', card: { radiusPx: 9, gapPx: 8 }, colors: { card: '#123456' }, typography: { bodyPx: 14 }, variants: { allowMixedVariants: true, showSelectors: true, selectorStyle: 'dropdown', imageSizePx: 48, imageRadiusPx: 6, showImageColorValue: true, defaultSelection: 'first_available' }, showOriginalAndDiscountedPrice: true };
    const normalized = normalizeCampaignWidgetConfig(legacy);
    assert.equal(normalized.badgePosition, 'corner');
    assert.equal(normalized.colors.card, '#123456');
    assert.equal(normalized.colors.variantBorder, '#E1E1E1');
    assert.equal(normalized.colors.summaryLabel, '#666666');
    assert.equal(normalized.colors.summaryAmount, '#171717');
    assert.equal(normalized.colors.cardBorder, '#D4D4D4');
    assert.equal(normalized.colors.savingsLabel, '#A13D29');
    assert.equal(normalized.colors.addButtonBorder, '#171717');
    assert.equal(normalized.typography.variantValue.sizePx, 14);
    assert.equal(normalized.typography.summaryAmount.sizePx, 14);
    assert.deepEqual(normalized.typography.savingsLabel, { sizePx: 14, weight: 400 });
  } finally { await vite.close(); }
});

test('no-preselection keeps every item unselected in the campaign preview', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { StorefrontWidget } = await vite.ssrLoadModule('/src/prototype/StorefrontWidget.tsx');
    const { defaultCampaignWidgetConfig } = await vite.ssrLoadModule('/src/prototype/widget-config.ts');
    const campaignConfig = defaultCampaignWidgetConfig();
    campaignConfig.variants.defaultSelection = 'none';
    const html = renderToStaticMarkup(React.createElement(StorefrontWidget, {
      device: 'desktop', accent: '#171717', locale: 'en', compact: true, notify: () => {},
      tiers: [{ quantity: 3, label: 'Three', discountPercent: 20, recommended: true }], campaignConfig,
      config: { allowMixed: true, showSelectors: true, selectorStyle: 'Dropdown', imageTileSize: 10, imageTileRadius: 4, showImageColorValue: true, widgetFontSize: 14, showStock: false, showPricing: true },
    }));
    assert.equal((html.match(/Not enough available variants for this quantity/g) ?? []).length >= 1, true);
    const button = new JSDOM(html).window.document.querySelector('button[class*="addBundle"]');
    assert.equal(button.disabled, true);
    assert.match(button.textContent, /^Add 3 to cart/);
    assert.match(html, /<legend>#1<\/legend>[\s\S]*?<select/);
    assert.doesNotMatch(html, /<legend>#1<\/legend><span[^>]*>Sold out<\/span>/);
  } finally { await vite.close(); }
});

test('legacy campaign widgets receive defaults for newly split typography controls', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { normalizeCampaignWidgetConfig, defaultCampaignWidgetConfig } = await vite.ssrLoadModule('/src/prototype/widget-config.ts');
    const legacy = defaultCampaignWidgetConfig();
    delete legacy.typography.comparePrice;
    delete legacy.typography.addButton;
    assert.equal(normalizeCampaignWidgetConfig(legacy).typography.comparePrice.sizePx, 14);
    assert.equal(normalizeCampaignWidgetConfig(legacy).typography.addButton.weight, 700);
  } finally { await vite.close(); }
});

test('widget normalization creates an independent mobile style fallback', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { normalizeCampaignWidgetConfig } = await vite.ssrLoadModule('/src/prototype/widget-config.ts');
    const legacy = { version: 1, layout: 'grid', card: { radiusPx: 9, gapPx: 8 }, colors: { card: '#123456' }, typography: { bodyPx: 14 }, variants: { allowMixedVariants: true, showSelectors: true, selectorStyle: 'dropdown', imageSizePx: 48, imageRadiusPx: 6, showImageColorValue: true, defaultSelection: 'first_available' }, showOriginalAndDiscountedPrice: true };
    const normalized = normalizeCampaignWidgetConfig(legacy);
    assert.equal(normalized.mobile.layout, 'grid');
    assert.equal(normalized.mobile.colors.card, '#123456');
    normalized.mobile.layout = 'stacked';
    normalized.mobile.colors.card = '#FFFFFF';
    normalized.mobile.typography.title.sizePx = 20;
    assert.equal(normalized.layout, 'grid');
    assert.equal(normalized.colors.card, '#123456');
    assert.notEqual(normalized.mobile.colors, normalized.colors);
    assert.notEqual(normalized.mobile.typography, normalized.typography);
  } finally { await vite.close(); }
});

test('widget normalization preserves an explicitly different mobile style', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { defaultCampaignWidgetConfig, normalizeCampaignWidgetConfig } = await vite.ssrLoadModule('/src/prototype/widget-config.ts');
    const desktop = defaultCampaignWidgetConfig();
    desktop.layout = 'stacked';
    const mobile = structuredClone(desktop);
    mobile.layout = 'list';
    mobile.colors.card = '#EAEAEA';
    const normalized = normalizeCampaignWidgetConfig({ ...desktop, mobile });
    assert.equal(normalized.layout, 'stacked');
    assert.equal(normalized.mobile.layout, 'list');
    assert.equal(normalized.mobile.colors.card, '#EAEAEA');
  } finally { await vite.close(); }
});

test('image buttons can expand for a visible color label at 10px image size', () => {
  const css = readFileSync(new URL('../src/pages/quantity-breaks.module.css', import.meta.url), 'utf8');
  assert.match(css, /\.storefront \.imageTile\s*\{[^}]*flex-basis:auto/);
  assert.match(css, /\.storefront \.imageTile\s*\{[^}]*width:max-content/);
});

test('variant price also styles cart line amounts and add button uses 14px vertical padding', () => {
  const css = readFileSync(new URL('../src/pages/quantity-breaks.module.css', import.meta.url), 'utf8');
  assert.match(css, /\.storefront \.bundleSummary>div:not\(\.totalRow\):not\(\.savingsRow\):not\(\.grandTotal\) b\s*\{[^}]*--variant-price-color[^}]*--variant-price-size[^}]*--variant-price-weight/);
  assert.match(css, /\.storefront \.addBundle\s*\{[^}]*padding-block:14px/);
});

test('campaign style editor has no body size control and orders cart controls after summary', () => {
  const editor = readFileSync(new URL('../src/prototype/CampaignStyleEditor.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(editor, /label\('styleBodySize'/);
  assert.ok(editor.indexOf("key: 'summaryLabel'") < editor.indexOf("key: 'checkoutNote'"));
  assert.ok(editor.indexOf("key: 'checkoutNote'") < editor.indexOf("key: 'addButton'"));
});

test('horizontal and grid keep the selected tier in its column while list removes card borders', () => {
  const css = readFileSync(new URL('../src/pages/quantity-breaks.module.css', import.meta.url), 'utf8');
  assert.match(css, /\.storefront \.tierChoices\[data-layout="horizontal"\]\s*\{[^}]*repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css, /\.storefront \.tierChoices\[data-layout="grid"\]\s*\{[^}]*repeat\(2,minmax\(0,1fr\)\)/);
  assert.doesNotMatch(css, /\.storefront \.tierChoices\[data-layout="horizontal"\] \.tierChoiceSelected[^}]*grid-column:1\/-1/);
  assert.match(css, /\.storefront \.tierChoices\[data-layout="list"\] \.tierChoice\s*\{[^}]*border:0/);
  assert.match(css, /\.storefront \.tierChoices\[data-layout="list"\] \.tierChoice\s*\{[^}]*background:var\(--card-color/);
  assert.match(css, /\.storefront \.tierChoices\[data-layout="list"\] \.tierChoiceSelected\s*\{[^}]*background:var\(--selected-color/);
  assert.match(css, /\.storefront \.tierChoices\[data-layout="horizontal"\] \.tierChoice,\.storefront \.tierChoices\[data-layout="grid"\] \.tierChoice\s*\{[^}]*align-self:start/);
  const widget = readFileSync(new URL('../src/prototype/StorefrontWidget.tsx', import.meta.url), 'utf8');
  assert.match(widget, /ResizeObserver/);
  assert.match(widget, /option\.style\.minHeight/);
  assert.match(css, /\.tierChoice:not\(\.tierChoiceSelected\) \.tierTag\s*\{[^}]*display:block/);
  assert.match(css, /\.tierChoice\s*\{[^}]*position:relative;[^}]*overflow:visible/);
  assert.match(css, /\.tierComposer\s*\{[^}]*border-top:0/);
  assert.match(css, /\.imageTile\s*\{[^}]*justify-content:center/);
  assert.match(css, /\.imageTile\s*\{[^}]*padding:1px/);
  assert.match(css, /\.storefront \.tierChoices:is\(\[data-layout="horizontal"\],\[data-layout="grid"\]\) \.dropdownLine\s*\{[^}]*grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css, /\.storefront \.tierChoices\[data-badge-position="corner"\] \.tierTag\s*\{[^}]*transform:translateY\(-50%\)/);
});

test('hiding original prices removes tier compare prices as well as summary rows', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { StorefrontWidget } = await vite.ssrLoadModule('/src/prototype/StorefrontWidget.tsx');
    const { defaultCampaignWidgetConfig } = await vite.ssrLoadModule('/src/prototype/widget-config.ts');
    const campaignConfig = defaultCampaignWidgetConfig();
    campaignConfig.showOriginalAndDiscountedPrice = false;
    const html = renderToStaticMarkup(React.createElement(StorefrontWidget, {
      device: 'desktop', accent: '#171717', locale: 'en', compact: true, notify: () => {}, campaignConfig,
      tiers: [{ quantity: 2, label: 'Duo', discountPercent: 10, recommended: true }],
      config: { allowMixed: true, showSelectors: true, selectorStyle: 'Dropdown', imageTileSize: 48, imageTileRadius: 6, showImageColorValue: true, widgetFontSize: 14, showStock: false, showPricing: false },
    }));
    assert.doesNotMatch(html, /class="[^"]*tierAmount[^"]*"[^>]*><b>[^<]*<\/b><small>/);
  } finally { await vite.close(); }
});

test('preview option rows and long text values wrap within their cards', () => {
  const css = readFileSync(new URL('../src/pages/quantity-breaks.module.css', import.meta.url), 'utf8');

  assert.match(css, /\.slotControls \.optionLine\s*\{[\s\S]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(50%,\s*1fr\)\)/);
  assert.match(css, /\.tierAmount :is\(b,small\)\s*\{[\s\S]*overflow-wrap:\s*anywhere/);
  assert.match(css, /\.textValues \.sizeButton\s*\{[\s\S]*word-break:\s*break-word/);
});

test('style editor retains the approved compact tier and three-column control layout', () => {
  const css = readFileSync(new URL('../src/pages/quantity-breaks.module.css', import.meta.url), 'utf8');

  assert.match(css, /\.tierOption\s*\{\s*display:grid;\s*grid-template-columns:\s*minmax\(0,\s*1fr\);\s*align-items:center;\s*gap:9px;/);
  assert.match(css, /\.tierAmount\s*\{(?=[^}]*display:flex)(?=[^}]*justify-content:space-between)(?=[^}]*line-height:1\.2)(?=[^}]*flex-wrap:\s*wrap)/);
  assert.match(css, /\.styleColorGrid\s*\{\s*display:grid;\s*grid-template-columns:repeat\(5,minmax\(0,1fr\)\);\s*gap:10px;\s*min-width:0/);
  assert.match(css, /\.styleTypeGrid\s*\{\s*display:grid;\s*grid-template-columns:repeat\(3,minmax\(0,1fr\)\);\s*gap:12px;\s*margin-top:12px/);
});

test('style editor accepts positive typography sizes below and above the former ranges on both devices', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/quantity-breaks/new' });
  const previous = Object.fromEntries(['window', 'document', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT'].map((key) => [key, globalThis[key]]));
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  let root;
  try {
    const { CampaignStyleEditor } = await vite.ssrLoadModule('/src/prototype/CampaignStyleEditor.tsx');
    const { defaultCampaignWidgetConfig } = await vite.ssrLoadModule('/src/prototype/widget-config.ts');
    const { I18nextProvider, initReactI18next } = await vite.ssrLoadModule('react-i18next');
    const { createInstance } = await vite.ssrLoadModule('i18next');
    const { Simulate } = await import('react-dom/test-utils');
    const i18n = createInstance();
    await i18n.use(initReactI18next).init({ lng: 'en', resources: { en: { translation: {} } } });
    function Harness({ device }) {
      const [value, setValue] = React.useState(defaultCampaignWidgetConfig);
      return React.createElement(I18nextProvider, { i18n }, React.createElement('form', null,
        React.createElement(CampaignStyleEditor, { device, value, onChange: setValue }),
        React.createElement('output', { id: 'typography-state' }, JSON.stringify(value.typography))));
    }
    root = createRoot(document.getElementById('root'));
    for (const device of ['desktop', 'mobile']) {
      await act(async () => root.render(React.createElement(Harness, { device, key: device })));
      const controls = [...document.querySelectorAll('input[type="number"][aria-label$=" size"]')];
      assert.equal(controls.length, 20);
      for (const size of [4, 48]) {
        for (const input of controls) {
          await act(async () => Simulate.change(input, { target: { value: String(size) } }));
          assert.equal(input.checkValidity(), true, `${device} ${input.getAttribute('aria-label')} accepts ${size}px`);
        }
        const typography = JSON.parse(document.getElementById('typography-state').textContent);
        assert.equal(typography.addButton.sizePx, size);
        assert.equal(typography.variantPrice.sizePx, size);
        assert.equal(typography.summaryAmount.sizePx, size);
        assert.equal(typography.savingsLabel.sizePx, size);
      }
      const weight = document.querySelector('select[aria-label="Savings label weight"]');
      await act(async () => Simulate.change(weight, { target: { value: '900' } }));
      const saved = JSON.parse(document.getElementById('typography-state').textContent);
      assert.equal(saved.savingsLabel.weight, 900);
      assert.equal(saved.savingsPrice.weight, 700);
      const addButton = document.querySelector('input[aria-label="Add to cart button size"]');
      for (const size of [0, -1, 1.5]) {
        await act(async () => Simulate.change(addButton, { target: { value: String(size) } }));
        assert.equal(addButton.checkValidity(), false);
      }
    }
  } finally {
    if (root) await act(async () => root.unmount());
    Object.assign(globalThis, previous);
    dom.window.close();
    await vite.close();
  }
});

test('partial market prices retain known tier totals and never display missing prices as zero', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { StorefrontWidget } = await vite.ssrLoadModule('/src/prototype/StorefrontWidget.tsx');
    const html = renderToStaticMarkup(React.createElement(StorefrontWidget, {
      device: 'desktop', accent: '#171717', locale: 'en', compact: true, previewOnly: true, notify() {},
      config: { allowMixed: true, showSelectors: true, selectorStyle: 'Dropdown', showPricing: true, imageTileSize: 48, imageTileRadius: 6, widgetFontSize: 14 },
      tiers: [{ quantity: 1, label: 'Known tier', discountType: 'none', recommended: true }, { quantity: 2, label: 'Missing tier', discountType: 'none' }],
      campaignProduct: { id: 'p1', optionNames: ['Style'], variants: [
        { id: 'v1', price: 99, inventory: 1, available: true, options: [{ name: 'Style', value: 'One' }] },
        { id: 'v2', price: 99, inventory: 10, available: true, options: [{ name: 'Style', value: 'Two' }] },
      ] },
      previewMarketId: 'us',
      previewPricing: { state: 'ready', amountsByVariant: { v1: 1000 }, unavailableVariantIds: ['v2'], currencyCode: 'USD', isPrimaryMarket: true },
    }));
    const dom = new JSDOM(html);
    const tierButtons = [...dom.window.document.querySelectorAll('[aria-pressed]')];
    assert.match(tierButtons[0].textContent, /\$10\.00/);
    assert.match(tierButtons[1].textContent, /Market prices are unavailable/);
    assert.doesNotMatch(tierButtons[1].textContent, /\$0\.00|\$99\.00|\$198\.00/);
    assert.doesNotMatch(html, /\$99\.00|\$198\.00/);
    assert.ok(dom.window.document.querySelector('select'), 'valid variant selectors remain usable');
    dom.window.close();
  } finally { await vite.close(); }
});

test('a pending variant does not change the market discount applied to already priced slots', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { StorefrontWidget } = await vite.ssrLoadModule('/src/prototype/StorefrontWidget.tsx');
    const html = renderToStaticMarkup(React.createElement(StorefrontWidget, {
      device: 'desktop', accent: '#171717', locale: 'en', compact: true, previewOnly: true, notify() {},
      config: { showSelectors: true, selectorStyle: 'Dropdown', widgetFontSize: 14 },
      tiers: [{ quantity: 2, label: 'Pair', discountType: 'fixed_amount', discountValue: 100, recommended: true, marketOverrides: { jp: { mode: 'specified_amount', currencyCode: 'JPY', amountMinor: 300 } } }],
      campaignProduct: { id: 'p1', optionNames: ['Style'], variants: [
        { id: 'v1', price: 99, inventory: 1, available: true, options: [{ name: 'Style', value: 'One' }] },
        { id: 'v2', price: 99, inventory: 10, available: true, options: [{ name: 'Style', value: 'Two' }] },
      ] },
      previewMarketId: 'jp',
      previewPricing: { state: 'ready', amountsByVariant: { v1: 1000 }, currencyCode: 'JPY', isPrimaryMarket: false, shopCurrencyCode: 'USD' },
    }));
    const dom = new JSDOM(html);
    assert.match(dom.window.document.querySelector('[class*="stockState"]').textContent, /¥700/);
    assert.doesNotMatch(html, /¥900/);
    dom.window.close();
  } finally { await vite.close(); }
});
