const assert = require('node:assert/strict');
const { test } = require('node:test');

const { validateCampaign, scopesOverlap } = require('../src/service/campaign/validate');
const { defaultCampaignWidgetConfig, normalizeCampaignWidgetConfig, validateCampaignWidgetConfig } = require('../src/service/campaign/widget-config');

const draft = () => ({
  id: 'campaign-a', name: 'Volume offer', status: 'draft',
  scope: { kind: 'products', productIds: ['product-a'], excludedProductIds: [] },
  tiers: [
    { tierId: 'one', displayOrder: 0, quantity: 1, discountType: 'none' },
    { tierId: 'three', displayOrder: 1, quantity: 3, discountType: 'percentage', discountValue: 2000, recommended: true },
  ],
  combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
  startsAt: '2026-01-01T00:00:00.000Z',
});

test('campaign validation keeps display order independent of quantity thresholds', () => {
  const value = draft();
  value.tiers.reverse();
  assert.deepEqual(validateCampaign(value), []);
  value.tiers[0].quantity = 1;
  assert.match(validateCampaign(value).join(' '), /unique/i);
  value.tiers[0].quantity = 0;
  assert.match(validateCampaign(value).join(' '), /positive integer/i);
});

test('campaign validation requires an explicit valid start time for drafts and published campaigns', () => {
  const value = draft();
  delete value.startsAt;
  assert.match(validateCampaign(value).join(' '), /startsAt is required/i);
  value.startsAt = 'not-a-date';
  assert.match(validateCampaign(value).join(' '), /invalid startsAt/i);
  value.startsAt = '2026-10-23T09:30:00.000Z';
  assert.deepEqual(validateCampaign(value), []);
});

test('campaign validation enforces discount amount and known market mode', () => {
  const value = draft();
  value.tiers[1].discountValue = 10001;
  assert.match(validateCampaign(value).join(' '), /percentage/i);
  value.tiers[1].discountType = 'fixed_amount';
  value.tiers[1].discountValue = -1;
  assert.match(validateCampaign(value).join(' '), /non-negative integer/i);
  value.tiers[1].discountValue = 100;
  value.tiers[1].marketOverrides = { marketA: { mode: 'specified_amount', currencyCode: 'USD' } };
  assert.match(validateCampaign(value).join(' '), /amountMinor/i);
});

test('campaign validation accepts total fixed discount strategies and their market amounts', () => {
  const value = draft();
  value.tiers[1] = { ...value.tiers[1], discountType: 'bundle_fixed_amount', discountValue: 500,
    marketOverrides: { marketA: { mode: 'specified_amount', currencyCode: 'EUR', amountMinor: 400 } } };
  assert.deepEqual(validateCampaign(value), []);
  value.tiers[1] = { ...value.tiers[1], discountType: 'bundle_fixed_price', discountValue: 1500 };
  assert.deepEqual(validateCampaign(value), []);
});

test('campaign validation rejects mixed market and shop currency modes in one market', () => {
  const value = draft();
  value.tiers[1] = { ...value.tiers[1], discountType: 'fixed_amount', discountValue: 500,
    marketOverrides: { marketA: { mode: 'specified_amount', currencyCode: 'EUR', amountMinor: 400 } } };
  value.tiers.push({ tierId: 'five', displayOrder: 2, quantity: 5, discountType: 'fixed_price', discountValue: 2000 });
  assert.match(validateCampaign(value).join(' '), /mixed.*currency modes/i);
  value.tiers[2].marketOverrides = { marketA: { mode: 'specified_amount', currencyCode: 'EUR', amountMinor: 1600 } };
  assert.deepEqual(validateCampaign(value), []);
  value.tiers[2].marketOverrides.marketA.currencyCode = 'GBP';
  assert.match(validateCampaign(value).join(' '), /same currency/i);
});

test('campaign validation rejects market amounts on percentage tiers', () => {
  const value = draft();
  value.tiers[1].marketOverrides = { marketA: { mode: 'specified_amount', currencyCode: 'EUR', amountMinor: 400 } };
  assert.match(validateCampaign(value).join(' '), /fixed discount/i);
});

test('active collection scope requires resolved membership and exclusions take priority', () => {
  const value = draft();
  value.status = 'active';
  value.scope = { kind: 'collections', collectionIds: ['collection-a'], excludedProductIds: [] };
  assert.match(validateCampaign(value).join(' '), /resolvedProductIds/i);
  value.scope.resolvedProductIds = ['product-a'];
  assert.deepEqual(validateCampaign(value), []);
  assert.equal(scopesOverlap(value.scope, { kind: 'products', productIds: ['product-a'], excludedProductIds: ['product-a'] }), false);
  assert.equal(scopesOverlap(value.scope, { kind: 'products', productIds: ['product-a'], excludedProductIds: [] }), true);
  assert.equal(scopesOverlap({ kind: 'all', excludedProductIds: [] }, value.scope), true);
});

test('campaign widget settings default safely and enforce image and color boundaries', () => {
  const fixture = require('./fixtures/campaign-widget-config.json');
  assert.deepEqual(defaultCampaignWidgetConfig(), fixture);
  assert.deepEqual(normalizeCampaignWidgetConfig(undefined), fixture);
  const olderColors = { ...fixture.colors };
  delete olderColors.cardBorder;
  delete olderColors.savingsLabel;
  delete olderColors.addButtonBorder;
  const upgraded = normalizeCampaignWidgetConfig({ ...fixture, colors: olderColors });
  assert.equal(upgraded.colors.border, fixture.colors.border);
  assert.equal(upgraded.colors.cardBorder, '#D4D4D4');
  assert.equal(upgraded.colors.savingsLabel, '#A13D29');
  assert.equal(upgraded.colors.addButtonBorder, '#171717');
  assert.deepEqual(validateCampaignWidgetConfig({ ...fixture, variants: { ...fixture.variants, imageSizePx: 10 } }), []);
  assert.deepEqual(validateCampaignWidgetConfig({ ...fixture, variants: { ...fixture.variants, imageSizePx: 96 } }), []);
  for (const imageSizePx of [9, 97]) {
    assert.match(validateCampaignWidgetConfig({ ...fixture, variants: { ...fixture.variants, imageSizePx } }).join(' '), /image size/i);
  }
  assert.match(validateCampaignWidgetConfig({ ...fixture, colors: { ...fixture.colors, card: 'url(x)' } }).join(' '), /color/i);
  assert.deepEqual(validateCampaignWidgetConfig({ ...fixture, colors: { ...fixture.colors, card: '#12345680' } }), []);
  assert.match(validateCampaignWidgetConfig({ ...fixture, colors: { ...fixture.colors, card: '#1234568' } }).join(' '), /color/i);
  assert.deepEqual(validateCampaignWidgetConfig({ ...fixture, typography: { ...fixture.typography, comparePrice: { sizePx: 11, weight: 400 }, addButton: { sizePx: 14, weight: 700 } } }), []);
  const legacy = structuredClone(fixture);
  delete legacy.typography.comparePrice;
  delete legacy.typography.addButton;
  assert.deepEqual(validateCampaignWidgetConfig(legacy), []);
  assert.deepEqual(normalizeCampaignWidgetConfig(legacy).typography.comparePrice, fixture.typography.comparePrice);
  const detailedLegacy = structuredClone(fixture);
  delete detailedLegacy.badgePosition;
  delete detailedLegacy.showTierSavingsBadge;
  delete detailedLegacy.colors.variantBorder;
  delete detailedLegacy.typography.variantValue;
  assert.deepEqual(validateCampaignWidgetConfig(detailedLegacy), []);
  assert.equal(normalizeCampaignWidgetConfig(detailedLegacy).badgePosition, 'corner');
  assert.equal(normalizeCampaignWidgetConfig(detailedLegacy).showTierSavingsBadge, false);
  assert.equal(normalizeCampaignWidgetConfig(detailedLegacy).colors.variantBorder, fixture.colors.variantBorder);
  delete detailedLegacy.colors.summaryLabel;
  delete detailedLegacy.colors.summaryAmount;
  assert.deepEqual(validateCampaignWidgetConfig(detailedLegacy), []);
  assert.equal(normalizeCampaignWidgetConfig(detailedLegacy).colors.summaryLabel, '#666666');
  assert.equal(normalizeCampaignWidgetConfig(detailedLegacy).colors.summaryAmount, '#171717');
  assert.equal(normalizeCampaignWidgetConfig(detailedLegacy).typography.variantValue.sizePx, fixture.typography.variantValue.sizePx);
  delete detailedLegacy.typography.summaryLabel;
  delete detailedLegacy.typography.summaryAmount;
  delete detailedLegacy.typography.checkoutNote;
  assert.deepEqual(validateCampaignWidgetConfig(detailedLegacy), []);
  assert.equal(normalizeCampaignWidgetConfig(detailedLegacy).typography.checkoutNote.sizePx, 10);
  assert.match(validateCampaignWidgetConfig({ ...fixture, badgePosition: 'center' }).join(' '), /badge position/i);
  for (const weight of [100, 900]) {
    assert.deepEqual(validateCampaignWidgetConfig({ ...fixture, typography: { ...fixture.typography, title: { ...fixture.typography.title, weight } } }), []);
  }
  assert.match(validateCampaignWidgetConfig({ ...fixture, typography: { ...fixture.typography, title: { ...fixture.typography.title, weight: 950 } } }).join(' '), /weight/i);
  assert.match(validateCampaignWidgetConfig({ ...fixture, surprise: true }).join(' '), /unknown/i);
  assert.match(validateCampaign({ ...draft(), widget: { ...fixture, surprise: true } }).join(' '), /unknown/i);
  assert.notStrictEqual(normalizeCampaignWidgetConfig(undefined), normalizeCampaignWidgetConfig(undefined));
});

test('campaign widget validation checks the independent mobile style configuration', () => {
  const fixture = require('./fixtures/campaign-widget-config.json');
  const mobile = structuredClone(fixture);
  delete mobile.version;
  const value = { ...fixture, mobile };
  assert.deepEqual(validateCampaignWidgetConfig(value), []);
  value.mobile = { ...mobile, colors: { ...mobile.colors, card: 'url(x)' } };
  assert.match(validateCampaignWidgetConfig(value).join(' '), /mobile.*color/i);
  value.mobile = { ...mobile, surprise: true };
  assert.match(validateCampaignWidgetConfig(value).join(' '), /mobile.*unknown/i);
});

test('campaign widget typography accepts five pixel sizes', () => {
  const fixture = require('./fixtures/campaign-widget-config.json');
  const typography = { ...fixture.typography, bodyPx: 5, title: { ...fixture.typography.title, sizePx: 5 } };
  assert.deepEqual(validateCampaignWidgetConfig({ ...fixture, typography }), []);
});
