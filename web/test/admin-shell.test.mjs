import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/pages/quantity-breaks.tsx', import.meta.url), 'utf8');
test('the connected app uses authenticated identity without its own sidebar', () => {
  assert.doesNotMatch(source, /Store preview|Not connected|Demo data/);
  assert.match(source, /readShopIdentity/);
  assert.doesNotMatch(source, /<aside\b|menuButton|brandName/);
});
