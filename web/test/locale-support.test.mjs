import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import { readFileSync } from 'node:fs';

test('exposes the requested application and storefront language sets', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { APP_LOCALES, resolveAdminLocale } = await vite.ssrLoadModule('/src/prototype/admin-locale.ts');
    const { STOREFRONT_LOCALES, normalizeStorefrontLocale, resolveStorefrontLocale } = await vite.ssrLoadModule('/src/prototype/storefront-locales.ts');
    for (const locale of ['zh-Hans', 'zh-Hant', 'ms', 'th', 'id', 'vi', 'ja']) assert.ok(APP_LOCALES.includes(locale), `app: ${locale}`);
    assert.equal(STOREFRONT_LOCALES.length, 36);
    for (const locale of ['ar', 'bg', 'cs', 'da', 'de', 'el', 'en', 'es', 'et', 'fi', 'fr', 'hi', 'hr', 'hu', 'id', 'it', 'ja', 'ko', 'lt', 'lv', 'ms', 'nb', 'nl', 'pl', 'pt-BR', 'pt-PT', 'ro', 'ru', 'sk', 'sl', 'sv', 'th', 'tr', 'vi', 'zh-Hans', 'zh-Hant']) {
      assert.ok(STOREFRONT_LOCALES.includes(locale), `storefront: ${locale}`);
    }
    assert.equal(normalizeStorefrontLocale('zh-CN'), 'zh-Hans');
    assert.equal(normalizeStorefrontLocale('zh-HK'), 'zh-Hant');
    assert.equal(normalizeStorefrontLocale('pt-PT'), 'pt-PT');
    assert.equal(resolveAdminLocale({ storeId: null, search: '?lang=zh-hans-cn', storage: { getItem: () => null } }), 'zh-Hans');
    assert.equal(resolveStorefrontLocale('xx-YY'), 'en');
  } finally {
    await vite.close();
  }
});

test('localizes every tier savings badge style control in every application language', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { APP_LOCALES } = await vite.ssrLoadModule('/src/prototype/admin-locale.ts');
    const { campaignText } = await vite.ssrLoadModule('/src/prototype/campaign-editor-messages.ts');
    const keys = ['styleShowTierSavingsBadge', 'styleTierSavingsBadgeRadius', 'styleColorTierSavingsBadge', 'styleColortierSavingsBadgeBackground', 'styleColortierSavingsBadgeText', 'styleTypetierSavingsBadge'];

    for (const locale of APP_LOCALES) for (const key of keys) {
      assert.ok(campaignText(locale, key).trim(), `${locale} has an empty ${key}`);
    }
  } finally { await vite.close(); }
});

test('localizes the automatic market-conversion notice in every application language', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { APP_LOCALES } = await vite.ssrLoadModule('/src/prototype/admin-locale.ts');
    const { campaignText } = await vite.ssrLoadModule('/src/prototype/campaign-editor-messages.ts');
    for (const locale of APP_LOCALES) assert.ok(campaignText(locale, 'marketConversionUnavailable').trim(), `${locale} has an empty marketConversionUnavailable`);
    assert.equal(campaignText('zh-Hans', 'marketConversionUnavailable'), '以实际界面价格为准。');
  } finally { await vite.close(); }
});

test('new application languages contain real admin, subscription, and storefront copy', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { subscriptionText } = await vite.ssrLoadModule('/src/prototype/subscription-messages.ts');
    const { initialTranslationDraft } = await vite.ssrLoadModule('/src/prototype/storefront-translation-defaults.ts');
    const { storefrontCopy } = await vite.ssrLoadModule('/src/prototype/storefront-copy.ts');
    const { workspaceText } = await vite.ssrLoadModule('/src/prototype/admin-workspace-messages.ts');
    const { campaignText } = await vite.ssrLoadModule('/src/prototype/campaign-editor-messages.ts');
    const english = JSON.parse(readFileSync(new URL('../src/locales/en.json', import.meta.url), 'utf8'));
    for (const locale of ['id', 'ja', 'ms', 'th', 'vi']) {
      const dictionary = JSON.parse(readFileSync(new URL(`../src/locales/${locale}.json`, import.meta.url), 'utf8'));
      assert.notEqual(dictionary.overview, english.overview, `admin ${locale}`);
      assert.notEqual(subscriptionText(locale, 'title'), subscriptionText('en', 'title'), `subscription ${locale}`);
      const draft = initialTranslationDraft(locale, {});
      assert.notEqual(draft['widget.title'], storefrontCopy.find((entry) => entry.key === 'widget.title').source, `storefront ${locale}`);
      assert.notEqual(workspaceText(locale, 'campaignStatus'), workspaceText('en', 'campaignStatus'), `workspace ${locale}`);
      assert.notEqual(campaignText(locale, 'styleLayout'), campaignText('en', 'styleLayout'), `editor ${locale}`);
      assert.notEqual(campaignText(locale, 'styleLayoutstacked'), campaignText('en', 'styleLayoutstacked'), `editor style ${locale}`);
    }
  } finally {
    await vite.close();
  }
});
