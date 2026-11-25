import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';

test('copy inserts a distinct tier with the next free quantity and independent market values', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { copyTierAfter } = await vite.ssrLoadModule('/src/prototype/tier-actions.ts');
    const tiers = [
      { tierId: 'two', quantity: 2, label: 'Duo', discountPercent: 10, recommended: true, marketOverrides: { us: { mode: 'specified_amount', currencyCode: 'USD', amountMinor: 100 } } },
      { tierId: 'three', quantity: 3, label: 'Trio', discountPercent: 20 },
      { tierId: 'five', quantity: 5, label: 'Five', discountPercent: 30 },
    ];
    const copied = copyTierAfter(tiers, 'two', 'copy');
    assert.deepEqual(copied.map((tier) => tier.quantity), [2, 4, 3, 5]);
    assert.deepEqual(copied.map((tier) => tier.tierId), ['two', 'copy', 'three', 'five']);
    assert.equal(copied[1].recommended, false);
    assert.equal(copied[1].discountPercent, 10);
    assert.notStrictEqual(copied[1].marketOverrides, copied[0].marketOverrides);
    copied[1].marketOverrides.us.amountMinor = 250;
    assert.equal(tiers[0].marketOverrides.us.amountMinor, 100);
    assert.equal(copyTierAfter(tiers, 'missing', 'copy'), tiers);
    assert.equal(copyTierAfter(tiers, 'two', 'three'), tiers);
  } finally { await vite.close(); }
});

test('delete leaves the last tier and unknown IDs untouched', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { removeTierById } = await vite.ssrLoadModule('/src/prototype/tier-actions.ts');
    const tiers = [{ tierId: 'one', quantity: 1 }, { tierId: 'two', quantity: 2 }];
    assert.deepEqual(removeTierById(tiers, 'two'), [tiers[0]]);
    assert.equal(removeTierById(tiers, 'missing'), tiers);
    assert.equal(removeTierById([tiers[0]], 'one').length, 1);
  } finally { await vite.close(); }
});
