import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';

test('translation draft baseline includes the initial fallback copy', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { createTranslationDraft } = await vite.ssrLoadModule('/src/prototype/translation-drafts.ts');
    const state = createTranslationDraft('fr', {});

    assert.deepEqual(state.draft, state.saved);
  } finally {
    await vite.close();
  }
});

test('translation draft cache restores an unsaved locale after remounting', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { restoreTranslationDrafts, saveTranslationDrafts } = await vite.ssrLoadModule('/src/prototype/translation-drafts.ts');
    const storage = new Map();
    const session = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
    const drafts = { fr: { saved: { 'widget.title': 'Acheter' }, draft: { 'widget.title': 'Acheter plus' } } };

    saveTranslationDrafts('shop-1', drafts, session);
    assert.deepEqual(restoreTranslationDrafts('shop-1', session), drafts);
  } finally {
    await vite.close();
  }
});

test('translation locale cache restores the selected storefront language for a shop', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { restoreTranslationLocale, saveTranslationLocale } = await vite.ssrLoadModule('/src/prototype/translation-drafts.ts');
    const storage = new Map();
    const session = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };

    saveTranslationLocale('shop-1', 'ja', session);
    assert.equal(restoreTranslationLocale('shop-1', session), 'ja');
  } finally { await vite.close(); }
});

test('translation language cache restores the storefront language configuration after remounting', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { restoreStoreLanguages, saveStoreLanguages } = await vite.ssrLoadModule('/src/prototype/translation-drafts.ts');
    const storage = new Map();
    const session = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
    const languages = { defaultLanguage: 'en', languages: ['en', 'zh-Hant'] };

    saveStoreLanguages('shop-1', languages, session);
    assert.deepEqual(restoreStoreLanguages('shop-1', session), languages);
  } finally { await vite.close(); }
});
