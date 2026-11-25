import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const codes = ['en', 'fr', 'de', 'es', 'it', 'nl', 'sv', 'tr', 'pt-BR', 'zh-Hans', 'zh-Hant', 'ms', 'th', 'id', 'vi', 'ja'];
const read = (code) => JSON.parse(readFileSync(new URL(`../src/locales/${code}.json`, import.meta.url), 'utf8'));
test('all admin dictionaries contain the same nonempty keys and placeholders', () => {
  const source = read('en');
  for (const code of codes) {
    const language = read(code);
    assert.deepEqual(Object.keys(language).sort(), Object.keys(source).sort(), `${code} keys`);
    for (const key of Object.keys(source)) {
      assert.ok(language[key], `${code}: ${key}`);
      assert.deepEqual([...language[key].matchAll(/\{\{([^}]+)\}\}/g)].map((item) => item[1]).sort(), [...source[key].matchAll(/\{\{([^}]+)\}\}/g)].map((item) => item[1]).sort(), `${code}: ${key} placeholders`);
    }
  }
});
