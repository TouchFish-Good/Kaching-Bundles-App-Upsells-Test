import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { createServer } from 'vite';
import { readFileSync } from 'node:fs';

const traditionalChinese = JSON.parse(readFileSync(new URL('../src/locales/zh-Hant.json', import.meta.url), 'utf8'));
const dashboardStyles = readFileSync(new URL('../src/pages/quantity-breaks.module.css', import.meta.url), 'utf8');

test('overview renders status metrics and empty state in the selected app language', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { Dashboard } = await vite.ssrLoadModule('/src/pages/quantity-breaks.tsx');
    const i18n = createInstance();
    await i18n.init({ lng: 'zh-Hant', resources: { 'zh-Hant': { translation: traditionalChinese } } });
    const html = renderToStaticMarkup(React.createElement(I18nextProvider, { i18n }, React.createElement(Dashboard, {
      campaigns: [], onCreate: () => {}, onEdit: () => {}, onToggle: () => {}, onDelete: () => {},
    })));
    assert.doesNotMatch(html, /<span[^>]*>活動狀態<\/span>/);
    assert.doesNotMatch(html, /campaignHeading/);
    assert.doesNotMatch(html, /overviewHeading/);
    assert.doesNotMatch(dashboardStyles, /overviewHeading|campaignHeading/);
    assert.match(html, /生效中的活動/);
    assert.match(html, /尚無活動/);
    assert.match(html, /所有活動/);
    assert.doesNotMatch(html, /Campaign status|Active campaigns|Currently running|All campaigns|Filter by campaign status/);
  } finally { await vite.close(); }
});

test('campaign rows, status and actions follow the selected app language', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { Dashboard } = await vite.ssrLoadModule('/src/pages/quantity-breaks.tsx');
    const i18n = createInstance();
    await i18n.init({ lng: 'zh-Hant', resources: { 'zh-Hant': { translation: traditionalChinese } } });
    const campaign = { id: 'one', name: 'Merchant campaign', products: 'Merchant product', tiers: [{ quantity: 2, discountPercent: 10 }], status: 'Active', schedule: 'Merchant schedule', updated: 'Merchant date' };
    const html = renderToStaticMarkup(React.createElement(I18nextProvider, { i18n }, React.createElement(Dashboard, {
      campaigns: [campaign], onCreate: () => {}, onEdit: () => {}, onToggle: () => {}, onDelete: () => {},
    })));
    assert.match(html, /<th scope="col">商品<\/th>/);
    assert.match(html, /2件 百分比折扣 10/);
    assert.match(html, />生效中<\/span>/);
    assert.match(html, /href="\/quantity-breaks\/campaigns\/one\/edit"[^>]*>Merchant campaign<\/a>/);
    assert.doesNotMatch(html, />Edit<\/button>|>Delete<\/button>|>Active<\/span>/);
    assert.match(html, /Merchant campaign/);
  } finally { await vite.close(); }
});

test('translation SaveBar actions follow the app language', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { workspaceText } = await vite.ssrLoadModule('/src/prototype/admin-workspace-messages.ts');
    const source = readFileSync(new URL('../src/prototype/Translations.tsx', import.meta.url), 'utf8');
    assert.equal(workspaceText('zh-Hant', 'discardChanges'), '放棄更改');
    assert.equal(workspaceText('zh-Hans', 'discardChangesConfirm'), '确认放弃当前已更改的内容？');
    assert.match(source, /translationSaveBar/);
    assert.match(source, /BridgeConfirmation/);
  } finally { await vite.close(); }
});

test('workspace copy has complete dictionaries for all eleven application languages', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { workspaceMessages, workspaceText } = await vite.ssrLoadModule('/src/prototype/admin-workspace-messages.ts');
    const sourceKeys = Object.keys(workspaceMessages.en).sort();
    assert.ok(sourceKeys.length > 30);
    for (const locale of ['en', 'fr', 'de', 'es', 'it', 'nl', 'sv', 'tr', 'pt-BR', 'zh-Hans', 'zh-Hant']) {
      assert.deepEqual(Object.keys(workspaceMessages[locale]).sort(), sourceKeys, locale);
      assert.ok(sourceKeys.every((key) => workspaceMessages[locale][key].trim()), locale);
    }
    assert.equal(workspaceText('de', 'campaignStatus'), 'Kampagnenstatus');
    assert.equal(workspaceText('zh-Hans', 'dialogStay'), '留在当前语言');
  } finally { await vite.close(); }
});

test('unknown workspace routes show localized recovery actions', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const previousWindow = globalThis.window;
  try {
    const { default: QuantityBreaksPrototype } = await vite.ssrLoadModule('/src/pages/quantity-breaks.tsx');
    globalThis.window = { location: { pathname: '/quantity-breaks/not-a-page' } };
    const i18n = createInstance();
    await i18n.init({ lng: 'zh-Hant', resources: { 'zh-Hant': { translation: traditionalChinese } } });
    const html = renderToStaticMarkup(React.createElement(I18nextProvider, { i18n }, React.createElement(QuantityBreaksPrototype)));
    assert.match(html, /找不到頁面/);
    assert.match(html, /返回總覽/);
    assert.doesNotMatch(html, /Page not found|Back to overview/);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    await vite.close();
  }
});

test('campaign tier drag handle is announced in the selected app language', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { CampaignEditor } = await vite.ssrLoadModule('/src/prototype/CampaignEditor.tsx');
    const i18n = createInstance();
    await i18n.init({ lng: 'zh-Hant', resources: { 'zh-Hant': { translation: traditionalChinese } } });
    const html = renderToStaticMarkup(React.createElement(I18nextProvider, { i18n }, React.createElement(CampaignEditor, {
      campaign: null, campaigns: [], fetcher: fetch, onCancel: () => {}, onSave: async () => {}, notify: () => {},
    })));
    assert.match(html, /aria-label="重新排序/);
    assert.doesNotMatch(html, /Drag or use arrow keys to reorder|Reorder .*use up and down arrow keys/);
  } finally { await vite.close(); }
});
