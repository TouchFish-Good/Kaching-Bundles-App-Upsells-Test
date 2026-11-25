import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "vite";

test("tier pricing applies each supported mode per variant in minor units", async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { calculateTierPricing, validateTierPricing } = await vite.ssrLoadModule("/src/prototype/tier-pricing.ts");
    const prices = [10000, 11600, 9800];
    assert.deepEqual(calculateTierPricing(prices, { quantity: 3, label: "Three", discountPercent: 20 }), { original: 31400, discounted: 25120, savings: 6280 });
    assert.deepEqual(calculateTierPricing(prices, { quantity: 3, label: "Three", discountPercent: 0, discountType: "fixed_amount", discountValue: 1000 }), { original: 31400, discounted: 28400, savings: 3000 });
    assert.deepEqual(calculateTierPricing(prices, { quantity: 3, label: "Three", discountPercent: 0, discountType: "fixed_price", discountValue: 8000 }), { original: 31400, discounted: 24000, savings: 7400 });
    assert.deepEqual(calculateTierPricing(prices, { quantity: 3, label: "Three", discountPercent: 0, discountType: "fixed_price", discountValue: 10000 }), { original: 31400, discounted: 29800, savings: 1600 });
    assert.deepEqual(calculateTierPricing(prices, { quantity: 3, label: "Three", discountPercent: 0, discountType: "bundle_fixed_amount", discountValue: 1000 }), { original: 31400, discounted: 30400, savings: 1000 });
    assert.deepEqual(calculateTierPricing(prices, { quantity: 3, label: "Three", discountPercent: 0, discountType: "bundle_fixed_price", discountValue: 8000 }), { original: 31400, discounted: 8000, savings: 23400 });
    assert.deepEqual(calculateTierPricing(prices, { quantity: 3, label: "Three", discountPercent: 0, discountType: "bundle_fixed_price", discountValue: 40000 }), { original: 31400, discounted: 31400, savings: 0 });
    assert.deepEqual(calculateTierPricing(prices, { quantity: 3, label: "Three", discountPercent: 0, discountType: "none" }), { original: 31400, discounted: 31400, savings: 0 });
    assert.equal(validateTierPricing({ quantity: 3, label: "Three", discountPercent: 0, discountType: "fixed_price", discountValue: 12000 }, prices), "");
    assert.equal(validateTierPricing({ quantity: 3, label: "Three", discountPercent: 0, discountType: "fixed_amount", discountValue: -1 }), "Discount amount must be zero or greater.");
    assert.equal(validateTierPricing({ quantity: 3, label: "Three", discountPercent: 101 }), "Percentage must be between 0 and 100.");
    assert.equal(validateTierPricing({ quantity: 2, label: "Two", discountPercent: 0, discountType: "none" }, [10000, 10000]), "");
    assert.equal(validateTierPricing({ quantity: 2, label: "Two", discountPercent: -1, discountType: "percentage" }), "Percentage must be between 0 and 100.");
    assert.deepEqual(calculateTierPricing([10000], { quantity: 1, label: "One", discountPercent: 10, discountType: "percentage", discountValue: 25 }), { original: 10000, discounted: 7500, savings: 2500 });
    assert.equal(validateTierPricing({ quantity: 1, label: "One", discountPercent: 10, discountType: "percentage", discountValue: 101 }), "Percentage must be between 0 and 100.");
    assert.equal(validateTierPricing({ quantity: 2, label: "Two", discountPercent: 0, discountType: "fixed_price", discountValue: undefined }), "Fixed price must be zero or greater.");
  } finally {
    await vite.close();
  }
});
