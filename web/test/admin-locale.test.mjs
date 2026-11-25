import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import { readFileSync } from 'node:fs';

test('admin locale offers the configured application languages and isolates choices by store', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { APP_LOCALES, resolveAdminLocale, setAdminLocale } = await vite.ssrLoadModule('/src/prototype/admin-locale.ts');
    assert.deepEqual(APP_LOCALES, ['en', 'fr', 'de', 'es', 'it', 'nl', 'sv', 'tr', 'pt-BR', 'zh-Hans', 'zh-Hant', 'ms', 'th', 'id', 'vi', 'ja']);
    const entries = new Map();
    const storage = { getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
    setAdminLocale('shop-a', 'fr', storage);
    assert.equal(resolveAdminLocale({ storeId: 'shop-a', search: '?lang=de', storage }), 'fr');
    assert.equal(resolveAdminLocale({ storeId: 'shop-b', search: '?lang=de', storage }), 'de');
    assert.equal(resolveAdminLocale({ storeId: 'shop-b', search: '?lang=xx', storage }), 'zh-Hans');
  } finally { await vite.close(); }
});

test('language selector remains usable when store identity is unavailable', () => {
  const source = readFileSync(new URL('../src/pages/quantity-breaks.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /onChange=\{\(event\) => changeAdminLanguage\(event\.target\.value\)\} disabled=\{!shop\?\.storeId\}/);
});
