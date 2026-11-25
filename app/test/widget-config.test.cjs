const test = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { defaultCampaignWidgetConfig, normalizeCampaignWidgetConfig, validateCampaignWidgetConfig } = require('../src/service/campaign/widget-config.ts');

test('widget normalization preserves typography outside the previous ranges on both devices', () => {
  const widget = defaultCampaignWidgetConfig();
  const mobile = defaultCampaignWidgetConfig();
  for (const config of [widget, mobile]) {
    config.typography.bodyPx = 4;
    for (const item of Object.values(config.typography)) {
      if (typeof item === 'object') item.sizePx = config === widget ? 48 : 4;
    }
  }
  widget.mobile = mobile;
  assert.deepEqual(normalizeCampaignWidgetConfig(widget), widget);
});

test('widget typography still rejects nonpositive, fractional and nonnumeric sizes', () => {
  for (const size of [0, -1, 1.5, NaN, Infinity, '16', null]) {
    const widget = defaultCampaignWidgetConfig();
    widget.typography.addButton.sizePx = size;
    assert.ok(validateCampaignWidgetConfig(widget).includes('addButton size must be a positive integer in px.'));
  }
});

test('widget validation accepts independent visibility fields and new variant original price styles', async () => {
  const fixture = JSON.parse(await readFile(path.join(__dirname, 'fixtures/campaign-widget-config.json'), 'utf8'));
  fixture.colors.variantOriginalPrice = '#8A8A8A';
  fixture.typography.variantOriginalPrice = { sizePx: 11, weight: 600 };
  fixture.showCartVariantDetails = false;
  fixture.showPriceSummary = false;
  delete fixture.showOriginalAndDiscountedPrice;
  assert.deepEqual(validateCampaignWidgetConfig(fixture), []);
});

test('widget validation remains compatible with legacy comparison visibility', async () => {
  const fixture = JSON.parse(await readFile(path.join(__dirname, 'fixtures/campaign-widget-config.json'), 'utf8'));
  assert.deepEqual(validateCampaignWidgetConfig(fixture), []);
});


test('legacy widget styles default savings label typography without sharing the amount style', () => {
  const widget = defaultCampaignWidgetConfig();
  delete widget.typography.savingsLabel;
  widget.typography.savingsPrice = { sizePx: 18, weight: 800 };
  const normalized = normalizeCampaignWidgetConfig(widget);
  assert.deepEqual(normalized.typography.savingsLabel, { sizePx: 11, weight: 400 });
  assert.deepEqual(normalized.typography.savingsPrice, { sizePx: 18, weight: 800 });
});
