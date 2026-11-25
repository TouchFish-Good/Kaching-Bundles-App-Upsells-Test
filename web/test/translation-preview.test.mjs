import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';

const sourceUrl = new URL('../src/prototype/Translations.tsx', import.meta.url);
const stylesUrl = new URL('../src/pages/quantity-breaks.module.css', import.meta.url);

test('translations render a draft-aware storefront preview that follows the page language', async () => {
  const source = await readFile(sourceUrl, 'utf8');

  assert.match(source, /const translationPreviewStyle = \{ \.\.\.defaultCampaignWidgetConfig\(\), showTierSavingsBadge: true, showCartVariantDetails: true, showPriceSummary: true \};/);
  assert.match(source, /<StorefrontWidget[\s\S]*locale=\{locale\}[\s\S]*translations=\{previewTranslations\}/);
  assert.match(source, /<StorefrontWidget[\s\S]*campaignProduct=\{previewProduct\}/);
  assert.match(source, /<CampaignProductPicker[\s\S]*onPreviewProduct=\{setPreviewProduct\}[\s\S]*autoPreviewFirst/);
  assert.match(source, /className=\{styles\.translationPreviewColumn\}/);
  assert.doesNotMatch(source, /translationListColumns/);
  assert.doesNotMatch(source, /className=\{styles\.translationLanguagePicker\}/);
  assert.doesNotMatch(source, /wt\('defaultLanguage'/);
  assert.match(source, /data-preview-control="device"[\s\S]*previewLanguageSelect[\s\S]*data-preview-control="product"/);
});

test('translations use an icon and concise label for the language refresh action', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  const styles = await readFile(stylesUrl, 'utf8');

  assert.match(source, /import \{ RefreshCw \} from ['"]lucide-react['"]/);
  assert.match(source, /className=\{styles\.headerButtons\}>\{languageControl\}<button[\s\S]*translationRefreshButton/);
  assert.doesNotMatch(source, /load\.status === "ready" && <button[^>]*translationRefreshButton/);
  assert.match(source, /className=\{styles\.translationRefreshButton\}[\s\S]*<RefreshCw[\s\S]*\{t\('translationRefresh'\)\}/);
  assert.match(styles, /\.translationRefreshButton\s*\{[^}]*display:inline-flex/);
});

test('translations provide matching editor and preview skeleton columns while languages load', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  const styles = await readFile(stylesUrl, 'utf8');

  assert.match(source, /translationLoadingWorkspaceGrid/);
  assert.match(source, /translationLoadingEditor/);
  assert.match(source, /translationLoadingPreview/);
  assert.match(styles, /\.translationLoadingWorkspaceGrid\s*\{[^}]*grid-template-columns:/);
  assert.match(styles, /\.translationWorkspaceGrid,\.translationLoadingWorkspaceGrid\s*\{[^}]*grid-template-columns:minmax\(0,1fr\) minmax\(320px,42%\)/);
});

test('translations refresh the storefront language list after restoring cached languages', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  const languageEffect = source.slice(source.indexOf('const cached ='), source.indexOf('  }, [refresh, shopId, fetcher]);'));

  assert.match(languageEffect, /if \(cached\) \{[\s\S]*setLoad\(\{ status: 'ready', data: cached \}\);[\s\S]*setLocale\([\s\S]*\);[\s\S]*\}\s*if \(!cached\) setLoad\(\{ status: "loading" \}\);\s*fetcher\("\/api\/quantity-breaks\/store-languages"/);
  assert.doesNotMatch(languageEffect, /if \(cached\) \{[\s\S]*setLocale\([\s\S]*\);\s*return \(\) => controller\.abort\(\);\s*\}/);
});

test('translation preview shows inline cart outcomes without examples or real cart writes', async () => {
  const { createServer } = await import('vite');
  const { default: React, act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { Simulate } = await import('react-dom/test-utils');
  const { JSDOM } = await import('jsdom');
  const { createInstance } = await import('i18next');
  const { initReactI18next } = await import('react-i18next');
  const english = JSON.parse(await readFile(new URL('../src/locales/en.json', import.meta.url), 'utf8'));
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/quantity-breaks/translations' });
  const previous = Object.fromEntries(['window', 'document', 'HTMLElement', 'ResizeObserver', 'IS_REACT_ACT_ENVIRONMENT'].map((key) => [key, globalThis[key]]));
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, ResizeObserver: class { observe() {} disconnect() {} }, IS_REACT_ACT_ENVIRONMENT: true });
  let root;
  try {
    const i18n = createInstance();
    await i18n.use(initReactI18next).init({ lng: 'en', resources: { en: { translation: english } } });
    const { I18nextProvider } = await vite.ssrLoadModule('react-i18next');
    const { Translations } = await vite.ssrLoadModule('/src/prototype/Translations.tsx');
    const { translationCopy } = await vite.ssrLoadModule('/src/prototype/translation-preview.ts');
    const requests = [];
    const fetcher = async (url, options) => {
      requests.push({ url, method: options?.method ?? 'GET' });
      return { ok: true, json: async () => url.includes('store-languages') ? { defaultLanguage: 'en', languages: ['en'] } : url.includes('/products') ? { products: [], nextPageInfo: null, missingIds: [] } : { translations: {} } };
    };
    root = createRoot(document.getElementById('root'));
    await act(async () => { root.render(React.createElement(I18nextProvider, { i18n }, React.createElement(Translations, { shopId: 'preview-shop', notify: () => {}, fetcher }))); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    assert.equal(document.querySelector('[data-translation-example]'), null);
    assert.equal(document.querySelectorAll('textarea').length, 16);
    assert.equal(document.querySelector('textarea[aria-label$="Adding bundle..."]'), null);
    for (const text of ['Bundle & save', 'Save {saving_amount}', 'Original', 'Estimated savings', 'Bundle total', 'Add {quantity} to cart · {price}']) {
      const row = [...document.querySelectorAll('textarea')].find((field) => field.getAttribute('aria-label').endsWith(text)).parentElement.parentElement;
      assert.equal(row.querySelector('p'), null, text);
    }
    const widget = document.querySelector('[class*="storefront"]');
    for (const [sourceTitle, editedTitle] of [['🎁 Free gifts with your order', 'My gifts'], ['Frequently Bought Together', 'My additions']]) {
      const titleField = [...document.querySelectorAll('textarea')].find(field => field.getAttribute('aria-label').endsWith(sourceTitle));
      assert.ok(titleField, sourceTitle);
      await act(() => { Simulate.change(titleField, { target: { value: editedTitle } }); });
      assert.match(widget.textContent, new RegExp(editedTitle));
      await act(() => { Simulate.change(titleField, { target: { value: '' } }); });
      assert.doesNotMatch(widget.textContent, new RegExp(editedTitle));
      assert.ok(widget.querySelector('[data-offer-kind]'), 'empty heading retains offer preview');
    }

    assert.ok(widget.querySelector('[class*="grandTotal"]'));
    assert.ok(widget.querySelector('[class*="summarySalePrice"]'));
    const field = document.querySelector('textarea[aria-label$="Bundle total"]');
    await act(() => { Simulate.change(field, { target: { value: 'My bundle total' } }); });
    assert.match(widget.textContent, /My bundle total/);
    const outcome = document.querySelector('[data-preview-control="cart-result"] select');
    const button = widget.querySelector('button[class*="addBundle"]');
    for (const [value, text] of [
      ['success', /\d+ items were added as \d+ cart lines\./],
      ['failure', /Bundle could not be added/],
      ['uncertain', /We could not confirm your cart/],
      ['no_stock', /Not enough available variants/],
    ]) {
      await act(() => { Simulate.change(outcome, { target: { value } }); });
      await act(() => { Simulate.click(button); });
      assert.equal(button.getAttribute('aria-busy'), 'true');
      assert.ok(button.querySelector('svg'));
      assert.doesNotMatch(widget.textContent, /Adding bundle/);
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 750)); });
      const status = widget.querySelector('[data-cart-feedback]');
      assert.match(status.textContent, text);
      assert.equal(button.nextElementSibling, status);
      assert.equal(button.getAttribute('aria-busy'), 'false');
    }
    const stockField = document.querySelector('textarea[aria-label$="Not enough available variants for this quantity."]');
    await act(() => { Simulate.change(stockField, { target: { value: '库存不足，请重选' } }); });
    assert.equal(widget.querySelector('[data-cart-feedback]').textContent, '库存不足，请重选');
    await act(() => { Simulate.change(outcome, { target: { value: 'success' } }); });
    await act(() => { Simulate.click(button); });
    await act(() => { Simulate.change(outcome, { target: { value: 'failure' } }); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 750)); });
    assert.equal(button.getAttribute('aria-busy'), 'false');
    assert.equal(widget.querySelector('[data-cart-feedback]').textContent, '', 'switching scenarios cancels the pending result');
    assert.ok(requests.every(({ method }) => method === 'GET'));
  } finally {
    if (root) await act(() => root.unmount());
    Object.assign(globalThis, previous);
    dom.window.close();
    await vite.close();
  }
});

test('translation hints only describe conditional copy and cart outcome controls are localized', async () => {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { translationCopy, translationUsageKeys } = await vite.ssrLoadModule('/src/prototype/translation-preview.ts');
    const { APP_LOCALES } = await vite.ssrLoadModule('/src/prototype/admin-locale.ts');
    assert.equal(translationCopy.length, 16);
    for (const key of ['widget.gifts.title', 'widget.bundles.title']) assert.ok(translationCopy.some(entry => entry.key === key && entry.location === 'Widget header'));
    for (const key of ['widget.title', 'widget.tier_savings_badge', 'widget.original', 'widget.savings', 'widget.total', 'widget.add_to_cart']) assert.equal(translationUsageKeys[key], undefined);
    for (const key of ['widget.description', 'widget.tier_rule', 'widget.checkout_note', 'widget.adding']) assert.equal(translationCopy.some((entry) => entry.key === key), false);
    for (const locale of APP_LOCALES) {
      const messages = JSON.parse(await readFile(new URL(`../src/locales/${locale}.json`, import.meta.url), 'utf8'));
      for (const key of ['translationCartResult', 'translationCartSuccess', 'translationCartFailure', 'translationCartUncertain', 'translationCartNoStock', ...translationCopy.map((entry) => translationUsageKeys[entry.key]).filter(Boolean)]) assert.ok(messages[key]?.trim(), `${locale}: ${key}`);
    }
  } finally { await vite.close(); }
});
