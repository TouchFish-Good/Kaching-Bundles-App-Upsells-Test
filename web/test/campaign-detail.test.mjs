import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';

test('campaign list and SHOPLINE platform discount links resolve to the same editor', async () => {
  const source = await readFile(new URL('../src/pages/quantity-breaks.tsx', import.meta.url), 'utf8');
  assert.match(source, /href=\{workspaceHref\('editor', campaign\.id\)\}/);
  assert.match(source, /const href = workspaceHref\('editor', campaign\.id\)/);
  assert.match(source, /window\.history\.replaceState\(null, '', `\$\{href\}\$\{window\.location\.search\}\$\{window\.location\.hash\}`\)/);
  assert.match(source, /campaign\.combineOrder/);
  assert.match(source, /campaign\.widget\?\.layout/);
});
