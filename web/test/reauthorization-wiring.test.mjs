import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('quantity breaks routes identity and campaign requests through one authenticated fetcher', () => {
  const page = source('../src/pages/quantity-breaks.tsx');
  assert.match(page, /const fetcher = useAuthenticatedFetch\(\)/);
  assert.match(page, /readShopIdentity\(fetcher, signal\)/);
  assert.match(page, /readCampaigns\(fetcher, \{ configurationOnly, signal \}\)/);
  assert.match(page, /persistCampaign\([^;]+, fetcher\)/);
  assert.match(page, /changeCampaignStatus\([^;]+, fetcher\)/);
  assert.match(page, /removeCampaign\([^;]+, fetcher\)/);
  assert.match(page, /<CampaignEditor[\s\S]*?fetcher=\{fetcher\}/);
  assert.match(page, /<Translations[\s\S]*?fetcher=\{fetcher\}/);
});

test('market and translation components use injected fetcher for reads and writes', () => {
  const editor = source('../src/prototype/CampaignEditor.tsx');
  const translations = source('../src/prototype/Translations.tsx');
  assert.match(editor, /fetcher\("\/api\/quantity-breaks\/markets"/);
  assert.match(translations, /fetcher\("\/api\/quantity-breaks\/store-languages"/);
  assert.match(translations, /readTranslations\(locale, fetcher\)/);
  assert.match(translations, /writeTranslations\(locale, Object\.fromEntries\(storefrontCopy\.map/);
  assert.doesNotMatch(editor, /\bfetch\("\/api\/quantity-breaks\//);
  assert.doesNotMatch(translations, /\bfetch\("\/api\/quantity-breaks\//);
});
