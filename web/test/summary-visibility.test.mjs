import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';

test('style visibility uses independent cart detail and price summary settings', async () => {
  const [config, editor, widget] = await Promise.all([
    readFile(new URL('../src/prototype/widget-config.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/prototype/CampaignStyleEditor.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/prototype/StorefrontWidget.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(config, /showCartVariantDetails: boolean/);
  assert.match(config, /showPriceSummary: boolean/);
  assert.doesNotMatch(editor, /showOriginalAndDiscountedPrice/);
  assert.match(editor, /showCartVariantDetails/);
  assert.match(editor, /showPriceSummary/);
  assert.match(widget, /showCartVariantDetails/);
  assert.match(widget, /showPriceSummary/);
});
