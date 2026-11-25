import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { Simulate } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import i18next from "i18next";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { readFile } from "node:fs/promises";

test('mixed market modes preserve editable combination settings, scoped notices and saved booleans', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/quantity-breaks/edit' });
  const previous = Object.fromEntries(['window', 'document', 'HTMLElement', 'ResizeObserver', 'IS_REACT_ACT_ENVIRONMENT'].map((key) => [key, globalThis[key]]));
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, ResizeObserver: class { observe() {} disconnect() {} }, IS_REACT_ACT_ENVIRONMENT: true });
  let root;
  try {
    const { CampaignEditor } = await vite.ssrLoadModule('/src/prototype/CampaignEditor.tsx');
    const { I18nextProvider, initReactI18next } = await vite.ssrLoadModule('react-i18next');
    const i18n = i18next.createInstance();
    await i18n.use(initReactI18next).init({ lng: 'en', resources: { en: { translation: {} } } });
    const campaign = {
      id: 'mixed', name: 'Mixed offer', discountName: 'Mixed checkout offer', products: '1 product',
      scope: { kind: 'products', productIds: ['product-1'], excludedProductIds: [] },
      status: 'Draft', schedule: '', updated: '', startsAt: '2026-11-04T10:00:00.000Z', neverExpires: true,
      combineProduct: true, combineOrder: true, combineShipping: true,
      tiers: [
        { tierId: 'auto', label: 'Automatic tier', quantity: 2, discountType: 'fixed_amount', discountValue: 100, discountPercent: 0, marketOverrides: { jp: { mode: 'auto_convert' } } },
        { tierId: 'specified', label: 'Specified tier', quantity: 3, discountType: 'fixed_price', discountValue: 500, discountPercent: 0, marketOverrides: { jp: { mode: 'specified_amount', currencyCode: 'JPY', amountMinor: 400 }, eu: { mode: 'auto_convert' } } },
      ],
    };
    const market = (id, name, currencyCode, primary) => ({ id, name, currencyCode, primary, enabled: true, regionCurrencyCodes: [currencyCode], specifiedAmountSupported: true, defaultLocale: 'en', regionCodes: [], autoExchangeRate: true, exchangeRate: null });
    const fetcher = async (url) => {
      if (url === '/api/quantity-breaks/markets') return { ok: true, json: async () => ({ shopCurrencyCode: 'USD', markets: [market('jp', 'Japan', 'JPY', true), market('eu', 'Europe', 'EUR', false)] }) };
      if (url.includes('coverage')) return { ok: true, json: async () => ({ state: 'clear', conflicts: [] }) };
      if (url.includes('translations')) return { ok: true, json: async () => ({ translations: {} }) };
      return { ok: false };
    };
    const saved = [];
    const notices = [];
    root = createRoot(document.getElementById('root'));
    await act(async () => root.render(React.createElement(I18nextProvider, { i18n }, React.createElement(CampaignEditor, {
      campaign, campaigns: [], fetcher, onCancel: () => {}, onSave: async (...args) => saved.push(args), notify: (...args) => notices.push(args),
    }))));
    for (const label of ['Product discounts', 'Order discounts', 'Shipping discounts']) {
      const control = document.querySelector(`[role="switch"][aria-label="${label}"]`);
      assert.ok(control, `${label} control is present`);
      assert.equal(control.disabled, false);
      assert.equal(control.getAttribute('aria-checked'), 'true');
    }
    const notice = document.querySelector('[class*="marketNotice"]');
    assert.ok(notice, 'the specified tier has a combination notice');
    assert.deepEqual([...notice.querySelectorAll('tbody tr')].map((row) => [...row.cells].map((cell) => cell.textContent)), [['Specified tier', 'Japan']]);
    const name = document.getElementById('campaign-name');
    await act(() => Simulate.change(name, { target: { value: 'Mixed offer updated' } }));
    const save = [...document.querySelectorAll('button')].find((button) => button.textContent === 'Save');
    assert.ok(save);
    await act(async () => save.click());
    assert.equal(saved.length, 1, JSON.stringify(notices));
    const [payload, intent] = saved[0];
    assert.equal(intent, 'update');
    assert.deepEqual([payload.combineProduct, payload.combineOrder, payload.combineShipping], [true, true, true]);
    const summary = [...document.querySelectorAll('dt')].find((node) => node.textContent === 'Combination').nextElementSibling;
    assert.deepEqual([...summary.querySelectorAll('span')].map((node) => node.textContent), ['Product discounts', 'Order discounts', 'Shipping discounts']);
  } finally {
    if (root) await act(async () => root.unmount());
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
    dom.window.close();
    await vite.close();
  }
});

test("campaign editor follows the reference section order with per-tier controls", async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  const previousWindow = globalThis.window;
  try {
    globalThis.window = { location: { pathname: "/quantity-breaks/new" } };
    const { CampaignEditor } = await vite.ssrLoadModule("/src/prototype/CampaignEditor.tsx");
    const html = renderToStaticMarkup(React.createElement(CampaignEditor, { campaign: null, campaigns: [], onCancel: () => {}, onSave: () => {}, notify: () => {} }));
    const headings = ["Product scope", "Settings", "Style", "Tier#1  Single", "Tier#2  Duo", "Live storefront preview"];
    let previous = -1;
    for (const heading of headings) {
      const current = html.indexOf(heading);
      assert.ok(current > previous, `${heading} should follow the previous editor section`);
      previous = current;
    }
    assert.match(html, /<details[^>]*open=""[^>]*><summary>[\s\S]*?Product scope<\/span>/);
    assert.match(html, /Exit editor/);
    assert.match(html, /saveDraft/);
    assert.doesNotMatch(html, /<button[^>]*value="publish"/);
    assert.match(html, /Add tier/);
    assert.match(html, /<option value="fixed_amount">Amount off per item<\/option>/);
    assert.match(html, /<option value="fixed_price">Fixed price per item<\/option>/);
    assert.match(html, /<option value="bundle_fixed_amount">Amount off entire bundle<\/option>/);
    assert.match(html, /<option value="bundle_fixed_price">Fixed price for entire bundle<\/option>/);
    assert.match(html, /Percentage off/);
    assert.doesNotMatch(html, /lucide-badge-percent/);
    assert.match(html, /Layout/);
    assert.match(html, /Card spacing/);
    assert.match(html, /Image size/);
    assert.doesNotMatch(html, /Allow mixed variants/);
    assert.doesNotMatch(html, /Show stock status/);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    await vite.close();
  }
});

test('campaign editor keeps the start time empty by default and requires it before saving', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { CampaignEditor } = await vite.ssrLoadModule('/src/prototype/CampaignEditor.tsx');
    const html = renderToStaticMarkup(React.createElement(CampaignEditor, { campaign: null, campaigns: [], onCancel: () => {}, onSave: async () => {}, notify: () => {} }));
    assert.match(html, /id="schedule-starts-at"[^>]*required=""[^>]*value=""/);
    const source = await readFile(new URL('../src/prototype/CampaignEditor.tsx', import.meta.url), 'utf8');
    assert.match(source, /!startsAt \? ct\('startRequired'\)/);
  } finally { await vite.close(); }
});

test('campaign editor defaults a new continuous campaign to never expires and labels its end time as required when unchecked', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { CampaignEditor } = await vite.ssrLoadModule('/src/prototype/CampaignEditor.tsx');
    const initial = renderToStaticMarkup(React.createElement(CampaignEditor, { campaign: null, campaigns: [], onCancel: () => {}, onSave: async () => {}, notify: () => {} }));
    assert.match(initial, /id="schedule-never-expires"[^>]*checked=""/);
    assert.match(initial, /id="schedule-ends-at"[^>]*disabled=""/);
    const scheduled = renderToStaticMarkup(React.createElement(CampaignEditor, { campaign: { id: 'c1', name: 'Offer', products: 'All eligible products', scope: { kind: 'all', excludedProductIds: [] }, tiers: [], status: 'Draft', schedule: '', updated: '', startsAt: '2026-11-04T10:00:00.000Z', endsAt: '2026-11-05T10:00:00.000Z' }, campaigns: [], onCancel: () => {}, onSave: async () => {}, notify: () => {} }));
    assert.match(scheduled, /id="schedule-never-expires"[^>]*(?!checked)/);
    assert.match(scheduled, /id="schedule-ends-at"[^>]*required=""/);
    assert.doesNotMatch(scheduled, /Ends at \(optional\)/);
  } finally { await vite.close(); }
});

test('rule summary lists enabled discount combinations one per row and includes schedule boundaries', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { CampaignEditor } = await vite.ssrLoadModule('/src/prototype/CampaignEditor.tsx');
    const campaign = {
      id: 'c1', name: 'Scheduled offer', discountName: 'Cart checkout offer', products: 'All eligible products', scope: { kind: 'all', excludedProductIds: [] },
      tiers: [{ tierId: 'single', quantity: 1, label: 'Single', discountPercent: 10 }], status: 'Scheduled', schedule: '', updated: '',
      startsAt: '2026-11-04T10:00:00.000Z', endsAt: '2026-11-05T10:00:00.000Z',
      combineProduct: true, combineOrder: true, combineShipping: true,
    };
    const html = renderToStaticMarkup(React.createElement(CampaignEditor, { campaign, campaigns: [], onCancel: () => {}, onSave: async () => {}, notify: () => {} }));
    assert.match(html, /<dt>Name \(visible only to you\)<\/dt><dd>Scheduled offer<\/dd>/);
    assert.match(html, /<dt>Discount name \(shown in cart \/ checkout\)<\/dt><dd>Cart checkout offer<\/dd>/);
    assert.doesNotMatch(html, /<span class="[^"]*eyebrow[^"]*">Rule summary<\/span>/);
    assert.doesNotMatch(html, /This is for preview only; actual discounts are calculated by SHOPLINE checkout\./);
    const source = await readFile(new URL('../src/prototype/CampaignEditor.tsx', import.meta.url), 'utf8');
    assert.match(source, /<section className=\{styles\.ruleSummary\}><dl>/);
    assert.match(source, /summaryScope[\s\S]*summaryCombination[\s\S]*summaryTiers/);
    assert.match(source, /<th>\{ct\('tierLabel'\)\}<\/th>/);
    assert.doesNotMatch(source, /<th>\{ct\('offerBar'\)\} \{ct\('tierLabel'\)\}<\/th>/);
    const combination = html.match(/<dt>Combination<\/dt><dd>([\s\S]*?)<\/dd>/)?.[1] ?? '';
    assert.deepEqual([...combination.matchAll(/<span>([^<]+)<\/span>/g)].map((match) => match[1]), ['Product discounts', 'Order discounts', 'Shipping discounts']);
    assert.match(html, /<dt>Starts at<\/dt><dd><time dateTime="2026-11-04T10:00:00\.000Z">/);
    assert.match(html, /<dt>Ends at<\/dt><dd><time dateTime="2026-11-05T10:00:00\.000Z">/);

    const continuous = renderToStaticMarkup(React.createElement(CampaignEditor, { campaign: { ...campaign, neverExpires: true }, campaigns: [], onCancel: () => {}, onSave: async () => {}, notify: () => {} }));
    assert.match(continuous, /<dt>Ends at<\/dt><dd>Never expires<\/dd>/);
  } finally { await vite.close(); }
});

test('schedule controls and rule summary retain their intended cursor and divider treatments', async () => {
  const css = await readFile(new URL('../src/pages/quantity-breaks.module.css', import.meta.url), 'utf8');
  assert.match(css, /\.scheduleFields input:disabled\s*\{[^}]*cursor:not-allowed/);
  assert.match(css, /label:has\(:global\(input#schedule-never-expires\)\)\s*\{[^}]*width:max-content[^}]*cursor:pointer/);
  assert.match(css, /label:has\(:global\(input#schedule-never-expires\)\) input\s*\{[^}]*cursor:pointer/);
  assert.match(css, /\.scheduleFields \.field input:not\(:disabled\)\s*\{[^}]*cursor:pointer/);
  assert.match(css, /\.ruleSummary dl\s*\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /\.ruleSummary dl>div:nth-child\(1\)[\s\S]*nth-child\(7\)\s*\{[^}]*grid-column:auto/);
  const summaryRows = [...css.matchAll(/\.ruleSummary dl>div\s*\{([^}]*)\}/g)]
    .filter((match) => match[1].includes('border-top'));
  assert.match(summaryRows.at(-1)?.[1] ?? '', /border-top:0/);
  assert.doesNotMatch(css, /\.ruleSummary dl>div:nth-child\(4\)\s*\{[^}]*(?:border-left|padding-left)/);
  assert.match(css, /\.ruleSummaryTiers th,\.ruleSummaryTiers td\s*\{[^}]*padding:8px 6px[^}]*padding-left:0/);
  assert.doesNotMatch(css, /\.ruleSummaryTiers th,\.ruleSummaryTiers td\s*\{[^}]*border-top/);
  assert.doesNotMatch(css, /\.ruleSummaryTiers th:nth-child\(4\),\.ruleSummaryTiers th:nth-child\(5\),\.ruleSummaryTiers td:nth-child\(4\),\.ruleSummaryTiers td:nth-child\(5\)/);
});

test('campaign editor separates the internal and checkout discount names and renders coverage detail rows', async () => {
  const source = await readFile(new URL('../src/prototype/CampaignEditor.tsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/pages/quantity-breaks.module.css', import.meta.url), 'utf8');
  assert.match(source, /id="campaign-name"[\s\S]*id="campaign-discount-name"/);
  assert.match(source, /checkCampaignCoverage\(/);
  assert.match(source, /scope === 'Product collections'[\s\S]*?loadSelectedCollectionProducts[\s\S]*?checkCampaignCoverage\(\{[\s\S]*?kind: 'collections'[\s\S]*?collectionIds: selectedCollectionIds/);
  assert.match(source, /key=\{`\$\{conflict\.campaignId\}:\$\{conflict\.itemId\}`\}/);
  assert.match(source, /<thead>[\s\S]*conflictActivityName[\s\S]*coverageConflicts\.every\(\(conflict\) => conflict\.type === 'collections'\) \? 'productCollections' : 'conflictProductName'/);
  assert.match(css, /\.overlapClear\.overlapConflict\s*\{[^}]*background:#fff3f0/);
  assert.match(css, /\.coverageConflictTable\s*\{[^}]*overflow-x:auto/);
});

test('existing collection campaign exposes an exit action and no legacy save actions', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { CampaignEditor } = await vite.ssrLoadModule('/src/prototype/CampaignEditor.tsx');
    const campaign = { id: 'c1', name: 'Collection offer', products: '1 collection', scope: { kind: 'collections', collectionIds: ['123'], excludedProductIds: [] }, tiers: [{ tierId: 'one', quantity: 1, label: 'Single', discountPercent: 0 }], status: 'Draft', schedule: 'No schedule', updated: 'Now' };
    const html = renderToStaticMarkup(React.createElement(CampaignEditor, { campaign, campaigns: [], onCancel: () => {}, onSave: async () => {}, notify: () => {} }));
    assert.match(html, /Exit editor/);
    assert.doesNotMatch(html, /value="update"|value="publish"|value="draft"/);
  } finally { await vite.close(); }
});

test('style editor keeps the selected device style namespace separate', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { CampaignStyleEditor } = await vite.ssrLoadModule('/src/prototype/CampaignStyleEditor.tsx');
    const { defaultCampaignWidgetConfig } = await vite.ssrLoadModule('/src/prototype/widget-config.ts');
    const html = renderToStaticMarkup(React.createElement(CampaignStyleEditor, {
      device: 'mobile', value: defaultCampaignWidgetConfig(), onChange: () => {},
    }));
    assert.match(html, /id="widget-color-mobile-card"/);
    assert.doesNotMatch(html, /id="widget-color-desktop-card"/);
  } finally { await vite.close(); }
});

test('style device switch stays in the style panel header and opens the panel before switching', async () => {
  const editor = await readFile(new URL('../src/prototype/CampaignEditor.tsx', import.meta.url), 'utf8');
  const styleEditor = await readFile(new URL('../src/prototype/CampaignStyleEditor.tsx', import.meta.url), 'utf8');
  assert.match(editor, /title=\{ct\('style'\)\}[\s\S]*?headerAction=\{<div className=\{styles\.styleDeviceToggle\}/);
  assert.match(editor, /styleRef\.current\?\.setAttribute\("open", ""\)[\s\S]*?setActiveStyleDevice\(device\)/);
  assert.doesNotMatch(styleEditor, /className=\{styles\.styleDeviceToggle\}/);
});

test('style editor places variant controls before colors and rule summary uses tier columns', async () => {
  const styleEditor = await readFile(new URL('../src/prototype/CampaignStyleEditor.tsx', import.meta.url), 'utf8');
  const editor = await readFile(new URL('../src/prototype/CampaignEditor.tsx', import.meta.url), 'utf8');
  assert.ok(styleEditor.indexOf("label('styleVariants'") < styleEditor.indexOf("label('styleColors'"));
  assert.match(editor, /className=\{styles\.ruleSummaryTiers\}/);
  for (const column of ['tierLabel', 'discountType', 'discountValue', 'quantity', 'defaultSelected']) {
    assert.match(editor, new RegExp(`ct\\('${column}'\\)`));
  }
  assert.match(editor, /tier\.recommended && <Check[^>]*aria-label=\{ct\('defaultSelected'\)\}/);
  assert.doesNotMatch(editor, /✅/);
  const messages = await readFile(new URL('../src/prototype/campaign-editor-messages.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(messages, /Discount value \(%\)|折扣数值（%）/);
});

test('rule summary keeps its wide tier table inside the mobile scroll container', async () => {
  const css = await readFile(new URL('../src/pages/quantity-breaks.module.css', import.meta.url), 'utf8');
  assert.match(css, /\.ruleSummary\s*\{[^}]*min-width:0/);
  assert.match(css, /\.ruleSummary dl>div\s*\{[^}]*min-width:0/);
  assert.match(css, /\.ruleSummary dd\s*\{[^}]*min-width:0/);
  assert.match(css, /\.ruleSummaryTiers\s*\{[^}]*max-width:100%/);
});

test('each tier has separate copy and delete actions, and the only tier cannot be deleted', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { CampaignEditor } = await vite.ssrLoadModule('/src/prototype/CampaignEditor.tsx');
    const props = { campaigns: [], onCancel: () => {}, onSave: async () => {}, notify: () => {}, fetcher: async () => ({ ok: false }) };
    const two = renderToStaticMarkup(React.createElement(CampaignEditor, { ...props, campaign: null }));
    assert.equal((two.match(/aria-label="Copy tier"/g) ?? []).length, (two.match(/aria-label="Delete tier"/g) ?? []).length);
    assert.ok((two.match(/aria-label="Copy tier"/g) ?? []).length >= 2);
    const one = renderToStaticMarkup(React.createElement(CampaignEditor, { ...props, campaign: { id: 'one', name: 'One', products: 'All eligible products', tiers: [{ tierId: 'one', quantity: 1, label: 'Single', discountPercent: 0 }], status: 'Draft', schedule: 'No schedule', updated: 'Now' } }));
    assert.match(one, /aria-label="Delete tier"[^>]*disabled=""/);
  } finally { await vite.close(); }
});

test('coverage check stays beside the product scope heading outside collapsible content', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { CampaignEditor } = await vite.ssrLoadModule('/src/prototype/CampaignEditor.tsx');
    const html = renderToStaticMarkup(React.createElement(CampaignEditor, { campaign: null, campaigns: [], onCancel: () => {}, onSave: async () => {}, notify: () => {} }));
    assert.match(html, /<summary>[\s\S]*?Product scope<\/span><\/summary>[\s\S]*?<\/details><div[^>]*><button[^>]*>Check campaign coverage<\/button>/);
    assert.equal((html.match(/Check campaign coverage<\/button>/g) ?? []).length, 1);
  } finally { await vite.close(); }
});

test('recommended tier badge precedes its copy action outside the selection button', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { CampaignEditor } = await vite.ssrLoadModule('/src/prototype/CampaignEditor.tsx');
    const html = renderToStaticMarkup(React.createElement(CampaignEditor, { campaign: null, campaigns: [], onCancel: () => {}, onSave: async () => {}, notify: () => {} }));
    assert.match(html, /<div class="[^"]*tierPanelActions[^"]*"><span class="[^"]*defaultTierTag[^"]*">Default selected<\/span><button[^>]*aria-label="Copy tier"/);
    assert.doesNotMatch(html, /aria-pressed="true">Default selected<em/);
  } finally { await vite.close(); }
});

test('mobile preview has a local phone shell with camera and home indicator', async () => {
  const editor = await readFile(new URL('../src/prototype/CampaignEditor.tsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/pages/quantity-breaks.module.css', import.meta.url), 'utf8');
  assert.match(editor, /previewPhoneFrame[^\n]*previewPhoneCamera/);
  assert.match(css, /\.previewPhoneCamera\s*\{/);
  assert.match(css, /\.previewPhoneFrame::after\s*\{/);
});

test("mobile rule summary stays after the campaign editor and live preview", async () => {
  const css = await readFile(new URL("../src/pages/quantity-breaks.module.css", import.meta.url), "utf8");
  assert.match(css, /\.referenceEditor \.ruleSummary\s*\{[^}]*order:initial/);
});

test("duplicate quantities in an unsaved draft keep preview radio IDs unique", async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { StorefrontWidget } = await vite.ssrLoadModule("/src/prototype/StorefrontWidget.tsx");
    const html = renderToStaticMarkup(React.createElement(StorefrontWidget, {
      device: "desktop", accent: "#171717", locale: "en", compact: true, notify: () => {},
      config: { allowMixed: true, showSelectors: false, selectorStyle: "Dropdown", imageTileSize: 48, imageTileRadius: 6, showImageColorValue: true, widgetFontSize: 14, showStock: true, showPricing: true },
      tiers: [{ quantity: 2, label: "Pair", discountPercent: 10 }, { quantity: 2, label: "Second pair", discountPercent: 20 }],
    }));
    const ids = [...html.matchAll(/id="(tier-desktop-[^"]+)"/g)].map((match) => match[1]);
    assert.equal(ids.length, 2);
    assert.equal(new Set(ids).size, 2);
  } finally {
    await vite.close();
  }
});

test("horizontal and grid tier layouts do not render desktop tier radio inputs", async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { StorefrontWidget } = await vite.ssrLoadModule("/src/prototype/StorefrontWidget.tsx");
    const { defaultCampaignWidgetConfig } = await vite.ssrLoadModule("/src/prototype/widget-config.ts");
    const props = { device: "desktop", accent: "#171717", locale: "en", compact: true, notify: () => {}, config: { allowMixed: true, showSelectors: false, selectorStyle: "Dropdown", imageTileSize: 48, imageTileRadius: 6, showImageColorValue: true, widgetFontSize: 14, showStock: true, showPricing: true }, tiers: [{ quantity: 2, label: "Pair", discountPercent: 10 }] };
    const horizontal = renderToStaticMarkup(React.createElement(StorefrontWidget, { ...props, campaignConfig: { ...defaultCampaignWidgetConfig(), layout: "horizontal" } }));
    const grid = renderToStaticMarkup(React.createElement(StorefrontWidget, { ...props, campaignConfig: { ...defaultCampaignWidgetConfig(), layout: "grid" } }));
    assert.doesNotMatch(horizontal, /name="tier-desktop"/);
    assert.doesNotMatch(grid, /name="tier-desktop"/);
    assert.doesNotMatch(horizontal, /class="[^"]*radioMark/);
    assert.doesNotMatch(grid, /class="[^"]*radioMark/);
  } finally { await vite.close(); }
});

test("horizontal and grid tiers only expand selectors for the selected tier", async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { StorefrontWidget } = await vite.ssrLoadModule("/src/prototype/StorefrontWidget.tsx");
    const { defaultCampaignWidgetConfig } = await vite.ssrLoadModule("/src/prototype/widget-config.ts");
    const props = {
      device: "desktop", accent: "#171717", locale: "en", compact: true, previewOnly: true, notify: () => {},
      config: { allowMixed: true, showSelectors: true, selectorStyle: "Dropdown", imageTileSize: 48, imageTileRadius: 6, showImageColorValue: true, widgetFontSize: 14, showStock: true, showPricing: true },
      tiers: [{ quantity: 1, label: "Single", subtitle: "One item", discountPercent: 0, tag: "Default" }, { quantity: 2, label: "Duo", subtitle: "Two items", discountPercent: 10 }],
    };
    const html = renderToStaticMarkup(React.createElement(StorefrontWidget, { ...props, campaignConfig: { ...defaultCampaignWidgetConfig(), layout: "horizontal" } }));
    assert.match(html, /One item/);
    assert.match(html, /Default/);
    assert.match(html, /tierComposer/);
    assert.match(html, /<select/);
    assert.match(html, /Original price|\$[0-9]/);
    assert.equal((html.match(/tierComposer/g) ?? []).length, 1);
  } finally { await vite.close(); }
});

test('invalid campaign color has an inline error without passing it to the color picker', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { CampaignStyleEditor } = await vite.ssrLoadModule('/src/prototype/CampaignStyleEditor.tsx');
    const { defaultCampaignWidgetConfig } = await vite.ssrLoadModule('/src/prototype/widget-config.ts');
    const widget = defaultCampaignWidgetConfig();
    widget.colors.card = '#12';
    const html = renderToStaticMarkup(React.createElement(CampaignStyleEditor, { value: widget, onChange: () => {} }));
    assert.match(html, /id="widget-color-desktop-card"[^>]*aria-invalid="true"/);
    assert.match(html, /Enter a 6- or 8-digit HEX color/);
    assert.match(html, /aria-label="Card background picker"/);
  } finally { await vite.close(); }
});

test('desktop campaign editor separates configuration from live preview', async () => {
  const css = await readFile(new URL('../src/pages/quantity-breaks.module.css', import.meta.url), 'utf8');
  assert.match(css, /\.referenceEditor\s*\{[^}]*width:100%/);
  assert.match(css, /\.referenceEditor \.editorContent\s*\{[^}]*grid-template-columns:minmax\(0,1fr\) minmax\(/);
  assert.match(css, /\.editorFormColumn,\.editorPreviewColumn\s*\{/);
});

test('style editor offers 100 through 900 weights and compact color controls', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { CampaignStyleEditor } = await vite.ssrLoadModule('/src/prototype/CampaignStyleEditor.tsx');
    const { defaultCampaignWidgetConfig } = await vite.ssrLoadModule('/src/prototype/widget-config.ts');
    const html = renderToStaticMarkup(React.createElement(CampaignStyleEditor, { value: defaultCampaignWidgetConfig(), onChange: () => {} }));
    assert.match(html, /<option value="100">100<\/option>/);
    assert.match(html, /<option value="900">900<\/option>/);
    assert.match(html, /<details[^>]*><summary[^>]*aria-label="Card background color"/);
    assert.match(html, /#[0-9A-F]{6}/);
  } finally { await vite.close(); }
});

test('style editor exposes badge placement and separate variant, cart, savings and button controls', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { CampaignStyleEditor } = await vite.ssrLoadModule('/src/prototype/CampaignStyleEditor.tsx');
    const { defaultCampaignWidgetConfig } = await vite.ssrLoadModule('/src/prototype/widget-config.ts');
    const html = renderToStaticMarkup(React.createElement(CampaignStyleEditor, { value: defaultCampaignWidgetConfig(), onChange: () => {} }));
    for (const label of ['Badge position', 'Top right', 'Below subtitle', 'Variant title', 'Variant value', 'Variant price', 'Item number', 'Variant border', 'Selected variant border', 'Add button background', 'Add button text', 'Savings price', 'Cart item']) {
      assert.ok(html.includes(label), `Missing ${label}`);
    }
    assert.match(html, /name="badge-position"/);
  } finally { await vite.close(); }
});

test('style editor exposes the opt-in tier savings badge setting', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { CampaignStyleEditor } = await vite.ssrLoadModule('/src/prototype/CampaignStyleEditor.tsx');
    const { defaultCampaignWidgetConfig } = await vite.ssrLoadModule('/src/prototype/widget-config.ts');
    const html = renderToStaticMarkup(React.createElement(CampaignStyleEditor, { value: defaultCampaignWidgetConfig(), onChange: () => {} }));
    assert.match(html, /Show tier savings badge/);
    assert.match(html, /type="checkbox"/);
  } finally { await vite.close(); }
});

test('right-column color popovers stay inside the narrow editor', async () => {
  const css = await readFile(new URL('../src/pages/quantity-breaks.module.css', import.meta.url), 'utf8');
  assert.match(css, /\.styleColorField:nth-child\(5n\) \.styleColorPopover\s*\{[^}]*right:0/);
  assert.match(css, /@media\(max-width:600px\)\s*\{[^}]*\.styleColorField:nth-child\(2n\) \.styleColorPopover\s*\{[^}]*right:0/);
});

test('expanded color control shows a visible spectrum even for white', async () => {
  const css = await readFile(new URL('../src/pages/quantity-breaks.module.css', import.meta.url), 'utf8');
  const component = await readFile(new URL('../src/prototype/CampaignStyleEditor.tsx', import.meta.url), 'utf8');
  assert.match(component, /className=\{styles\.styleColorSpectrum\}/);
  assert.match(css, /\.styleColorSpectrum\s*\{[^}]*linear-gradient/);
  assert.match(css, /\.styleColorCursor\s*\{[^}]*pointer-events:none/);
});

test('color controls expose current color and opacity without spinner arrows', async () => {
  const component = await readFile(new URL('../src/prototype/CampaignStyleEditor.tsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/pages/quantity-breaks.module.css', import.meta.url), 'utf8');
  assert.match(component, /aria-label=\{`\$\{name\} opacity`\}/);
  assert.match(component, /aria-label=\{`\$\{name\} hue`\}/);
  assert.match(component, /onPointerDown=\{.*updateSpectrum/);
  assert.match(component, /onKeyDown=\{.*Escape/);
  assert.match(component, /pointerdown/);
  assert.doesNotMatch(component, /ChevronsUpDown/);
  assert.match(css, /\.styleTypeGrid\s*\{[^}]*grid-template-columns:repeat\(3/);
  assert.doesNotMatch(css, /\.styleFieldGrid,\.styleTypeGrid\s*\{grid-template-columns:minmax\(0,1fr\)/);
  const editor = await readFile(new URL('../src/prototype/CampaignEditor.tsx', import.meta.url), 'utf8');
  assert.match(editor, /invalidDesktopColorKey/);
  assert.match(editor, /styleRef\.current\?\.setAttribute\("open", ""\)/);
  assert.match(css, /\.styleTypeRow input\[type="number"\]::-webkit-inner-spin-button/);
});
