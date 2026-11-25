import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { createServer } from 'vite';

test('storefront translation drafts start in the selected language and preserve merchant edits', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { initialTranslationDraft } = await vite.ssrLoadModule('/src/prototype/storefront-translation-defaults.ts');
    assert.equal(initialTranslationDraft('zh-Hans', {})['widget.savings'], '预计节省');
    assert.equal(initialTranslationDraft('de', {})['widget.savings'], 'Voraussichtliche Ersparnis');
    assert.equal(initialTranslationDraft('zh-hant-tw', {})['widget.savings'], '預計節省');
    assert.equal(initialTranslationDraft('ar', {})['widget.savings'], 'الوفورات المتوقعة');
    assert.equal(initialTranslationDraft('de', { 'widget.savings': 'Meine Ersparnis' })['widget.savings'], 'Meine Ersparnis');
  } finally { await vite.close(); }
});

test('all supplied storefront defaults retain the required placeholders', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { initialTranslationDraft } = await vite.ssrLoadModule('/src/prototype/storefront-translation-defaults.ts');
    const { storefrontCopy, validateTranslation } = await vite.ssrLoadModule('/src/prototype/storefront-copy.ts');
    for (const locale of ['en', 'fr', 'de', 'es', 'it', 'nl', 'sv', 'tr', 'pt-BR', 'zh-Hans', 'zh-Hant', 'ar']) {
      const draft = initialTranslationDraft(locale, {});
      for (const entry of storefrontCopy) {
        assert.ok(draft[entry.key], `${locale}: ${entry.key} is missing`);
        assert.equal(validateTranslation(entry.key, draft[entry.key]), '', `${locale}: ${entry.key}`);
      }
    }
  } finally { await vite.close(); }
});

test('every non-English storefront language starts with localized textarea defaults', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { initialTranslationDraft } = await vite.ssrLoadModule('/src/prototype/storefront-translation-defaults.ts');
    const { storefrontCopy } = await vite.ssrLoadModule('/src/prototype/storefront-copy.ts');
    const { STOREFRONT_LOCALES } = await vite.ssrLoadModule('/src/prototype/storefront-locales.ts');

    for (const locale of STOREFRONT_LOCALES.filter((locale) => locale !== 'en')) {
      const draft = initialTranslationDraft(locale, {});
      for (const entry of storefrontCopy) assert.notEqual(draft[entry.key], entry.source, `${locale}: ${entry.key} fell back to English`);
    }
  } finally { await vite.close(); }
});

test('every non-English theme language localizes the tier savings badge', () => {
  const i18nDirectory = path.resolve(import.meta.dirname, '../../theme-app-extension/i18n');
  const localeFiles = fs.readdirSync(i18nDirectory).filter((file) => file.endsWith('.json') && !file.endsWith('.schema.json') && file !== 'en.json');

  for (const file of localeFiles) {
    const translations = JSON.parse(fs.readFileSync(path.join(i18nDirectory, file), 'utf8'));
    assert.notEqual(translations.app_block.widget.tier_savings_badge, 'Save {saving_amount}', `${file}: tier savings badge fell back to English`);
  }
});
