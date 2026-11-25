import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';

test('variant pricing keeps original and sale style variables separate', async () => {
  const source = await readFile(new URL('../src/prototype/StorefrontWidget.tsx', import.meta.url), 'utf8');
  assert.match(source, /--variant-original-price-color/);
  assert.match(source, /--variant-original-price-size/);
  assert.match(source, /--variant-price-color/);
  assert.match(source, /variantOriginalPrice/);
});

test('variant background is wired to the preview style', async () => {
  const [source, css] = await Promise.all([
    readFile(new URL('../src/prototype/StorefrontWidget.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/quantity-breaks.module.css', import.meta.url), 'utf8'),
  ]);
  assert.match(source, /--variant-background/);
  assert.match(css, /\.tierComposer \.variantSlot \{[^}]*background:var\(--variant-background/);
});
