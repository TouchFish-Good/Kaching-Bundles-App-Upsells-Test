import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';

test('lists enabled combination types in storefront discount order', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { getEnabledCombinationTypes } = await vite.ssrLoadModule('/src/prototype/combination-policy.ts');
    assert.deepEqual(getEnabledCombinationTypes({ combineOrder: true, combineProduct: true, combineShipping: false }), ['product', 'order']);
    assert.deepEqual(getEnabledCombinationTypes({ combineOrder: true, combineProduct: true, combineShipping: true }), ['product', 'order', 'shipping']);
    assert.deepEqual(getEnabledCombinationTypes({ combineOrder: false, combineProduct: false, combineShipping: false }), []);
  } finally { await vite.close(); }
});

test('lists only fixed specified-market tiers and resolves their market names', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { getSpecifiedMarketCombinationRows } = await vite.ssrLoadModule('/src/prototype/combination-policy.ts');
    const rows = getSpecifiedMarketCombinationRows([
      { tierId: 'two', label: 'two', quantity: 2, discountPercent: 10, discountType: 'percentage', marketOverrides: { jp: { mode: 'specified_amount', currencyCode: 'JPY', amountMinor: 100 } } },
      { tierId: 'three', label: 'three', quantity: 3, discountPercent: 0, discountType: 'fixed_amount', marketOverrides: { jp: { mode: 'specified_amount', currencyCode: 'JPY', amountMinor: 100 }, kr: { mode: 'specified_amount', currencyCode: 'KRW', amountMinor: 100 }, eu: { mode: 'auto_convert' } } },
      { tierId: 'four', label: 'four', quantity: 4, discountPercent: 0, discountType: 'fixed_price', discountValue: 1000, marketOverrides: { jp: { mode: 'auto_convert' } } },
    ], { jp: 'Japan', kr: 'Korea', eu: 'Europe' });
    assert.deepEqual(rows, [{ tierId: 'three', label: 'three', marketNames: ['Japan', 'Korea'] }]);
  } finally { await vite.close(); }
});
