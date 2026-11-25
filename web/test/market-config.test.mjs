import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "vite";

test("switching market amount modes clears stale specified values", async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { setMarketOverrideMode } = await vite.ssrLoadModule("/src/prototype/market-config.ts");
    const specified = setMarketOverrideMode({}, "eu", "specified_amount", "EUR");
    assert.deepEqual(specified, { eu: { mode: "specified_amount", currencyCode: "EUR" } });
    assert.deepEqual(setMarketOverrideMode({ eu: { mode: "specified_amount", currencyCode: "EUR", amountMinor: 1200 } }, "eu", "auto_convert", "EUR"), { eu: { mode: "auto_convert" } });
    const { validateMarketOverrides } = await vite.ssrLoadModule("/src/prototype/market-config.ts");
    assert.match(validateMarketOverrides(specified), /required/);
    assert.equal(validateMarketOverrides({ eu: { mode: "specified_amount", currencyCode: "EUR", amountMinor: 1200 } }), "");
  } finally { await vite.close(); }
});

test("selects a usable preview market and resolves fixed amounts in that market", async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { selectPreviewMarket, resolveMarketPreviewTier } = await vite.ssrLoadModule("/src/prototype/market-preview.ts");
    const markets = [
      { id: "off", name: "Disabled", enabled: false, primary: true, currencyCode: "USD", regionCurrencyCodes: ["USD"], regionCodes: ["US"], defaultLocale: "en", specifiedAmountSupported: true },
      { id: "jp", name: "Japan", enabled: true, primary: false, currencyCode: "JPY", regionCurrencyCodes: ["JPY"], regionCodes: ["JP"], defaultLocale: "ja", specifiedAmountSupported: true },
      { id: "us", name: "United States", enabled: true, primary: true, currencyCode: "USD", regionCurrencyCodes: ["USD"], regionCodes: ["US"], defaultLocale: "en", specifiedAmountSupported: true },
    ];
    assert.equal(selectPreviewMarket(markets)?.id, "us");
    assert.equal(selectPreviewMarket([{ ...markets[0], primary: false }, { ...markets[1], enabled: false }])?.id, "off");

    const base = { quantity: 2, label: "Two", discountPercent: 0, discountType: "fixed_amount", discountValue: 100, marketOverrides: { jp: { mode: "specified_amount", currencyCode: "JPY", amountMinor: 800 } } };
    const primary = { primary: true, shopCurrencyCode: 'USD', marketCurrencyCode: 'USD', autoExchangeRate: true, exchangeRate: null };
    const japanWithFixedRate = { primary: false, shopCurrencyCode: 'USD', marketCurrencyCode: 'JPY', autoExchangeRate: false, exchangeRate: 6.6 };
    const japanWithLiveRate = { ...japanWithFixedRate, autoExchangeRate: true, exchangeRate: null };
    assert.deepEqual(resolveMarketPreviewTier(base, "jp", japanWithFixedRate), { status: "ready", tier: { ...base, discountValue: 800 } });
    for (const discountType of ["fixed_price", "bundle_fixed_amount", "bundle_fixed_price"]) {
      assert.deepEqual(resolveMarketPreviewTier({ ...base, discountType }, "jp", japanWithFixedRate), { status: "ready", tier: { ...base, discountType, discountValue: 800 } });
    }
    assert.deepEqual(resolveMarketPreviewTier({ ...base, discountType: "percentage" }, "jp", japanWithFixedRate), { status: "ready", tier: { ...base, discountType: "percentage" } });
    assert.deepEqual(resolveMarketPreviewTier({ ...base, discountType: "none" }, "jp", japanWithFixedRate), { status: "ready", tier: { ...base, discountType: "none" } });
    const auto = { ...base, marketOverrides: { jp: { mode: "auto_convert" } } };
    assert.deepEqual(resolveMarketPreviewTier(auto, "us", primary), { status: "ready", tier: auto });
    assert.deepEqual(resolveMarketPreviewTier(auto, "jp", japanWithFixedRate), { status: "auto_convert", tier: { ...auto, discountValue: 7 } });
    assert.deepEqual(resolveMarketPreviewTier(auto, "jp", japanWithLiveRate), { status: "auto_convert", tier: auto });
  } finally { await vite.close(); }
});

test('mixed preview tier resolution keeps each fixed amount and market independent', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { resolveMarketPreviewTier } = await vite.ssrLoadModule('/src/prototype/market-preview.ts');
    for (const discountType of ['fixed_amount', 'fixed_price', 'bundle_fixed_amount', 'bundle_fixed_price']) {
      const tiers = [
        { quantity: 1, label: 'Original', discountType: 'none', discountPercent: 0 },
        { quantity: 2, label: 'Percentage', discountType: 'percentage', discountPercent: 15, discountValue: 15 },
        { quantity: 3, label: 'Auto', discountType, discountPercent: 0, discountValue: 1234, marketOverrides: { us: { mode: 'auto_convert' }, eu: { mode: 'auto_convert' } } },
        { quantity: 4, label: 'Specified', discountType, discountPercent: 0, discountValue: 9876, marketOverrides: { us: { mode: 'specified_amount', currencyCode: 'USD', amountMinor: 1111 }, eu: { mode: 'specified_amount', currencyCode: 'EUR', amountMinor: 4321 } } },
      ];
      const saved = structuredClone(tiers);
      for (const [marketId, primary, amounts, statuses] of [
        ['us', true, [undefined, 15, 1234, 1111], ['ready', 'ready', 'ready', 'ready']],
        ['eu', false, [undefined, 15, 617, 4321], ['ready', 'ready', 'auto_convert', 'ready']],
      ]) {
        tiers.forEach((tier, index) => {
          const result = resolveMarketPreviewTier(tier, marketId, { primary, shopCurrencyCode: 'USD', marketCurrencyCode: primary ? 'USD' : 'EUR', autoExchangeRate: false, exchangeRate: 0.5 });
          assert.equal(result.status, statuses[index], `${marketId}: ${discountType} ${tier.label}`);
          assert.equal(result.tier.discountValue, amounts[index], `${marketId}: ${discountType} ${tier.label}`);
        });
      }
      assert.deepEqual(tiers, saved, 'market preview must not overwrite another market or the saved base amounts');
    }
  } finally { await vite.close(); }
});
