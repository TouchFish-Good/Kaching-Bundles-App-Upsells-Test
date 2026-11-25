import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "vite";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from 'jsdom';

test("marks option values using the selected value from the other option", async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { hasPurchasableOption } = await vite.ssrLoadModule("/src/prototype/slot-selection.ts");
    const variants = [
      { color: "red", size: "X", inventory: 2, available: true },
      { color: "yellow", size: "M", inventory: 3, available: true },
    ];
    assert.equal(hasPurchasableOption(variants, "size", "X", { color: "red", size: "X" }), true);
    assert.equal(hasPurchasableOption(variants, "size", "M", { color: "red", size: "X" }), false);
    assert.equal(hasPurchasableOption(variants, "size", "M", { color: "yellow", size: "M" }), true);
  } finally {
    await vite.close();
  }
});

test("keeps continue-policy variants purchasable at zero inventory", async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { hasPurchasableOption } = await vite.ssrLoadModule("/src/prototype/slot-selection.ts");
    assert.equal(hasPurchasableOption([{ color: "red", size: "X", inventory: 0, available: false, inventoryPolicy: "continue" }], "color", "red", null), true);
  } finally {
    await vite.close();
  }
});

test("treats variants with inventory tracking disabled as purchasable at zero inventory", async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { isVariantSoldOut, extendSlotsWithInventory } = await vite.ssrLoadModule("/src/prototype/slot-selection.ts");
    const variant = { color: "red", size: "X", inventory: 0, inventoryTracker: false, available: false };
    assert.equal(isVariantSoldOut(variant), false);
    assert.deepEqual(extendSlotsWithInventory([], 2, [variant]), [{ color: "red", size: "X" }, { color: "red", size: "X" }]);
  } finally {
    await vite.close();
  }
});

test("extends quantity tiers beyond five slots without losing selections", async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { extendSlots, retainSlotsForTier } = await vite.ssrLoadModule("/src/prototype/slot-selection.ts");
    const seed = { color: "Black", size: "M" };
    const firstFive = [seed, { color: "White", size: "L" }, { color: "Black", size: "S" }, { color: "Black", size: "L" }, { color: "White", size: "S" }];
    const six = extendSlots(firstFive, 6, seed);
    assert.equal(six.length, 6);
    assert.deepEqual(six.slice(0, 5), firstFive);
    assert.equal(extendSlots(firstFive, 10, seed).length, 10);
    assert.deepEqual(extendSlots(firstFive, 1, seed), [seed]);
    assert.deepEqual(retainSlotsForTier(firstFive, 3, seed), firstFive);
    assert.throws(() => extendSlots(firstFive, 0, seed), /positive integer/);
    assert.throws(() => extendSlots(firstFive, 2.5, seed), /positive integer/);
  } finally {
    await vite.close();
  }
});

test("switching to a smaller tier retains hidden selections for switching back", async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { retainSlotsForTier } = await vite.ssrLoadModule("/src/prototype/slot-selection.ts");
    const seed = { color: "Black", size: "M" };
    const chosen = [seed, { color: "White", size: "L" }, { color: "Black", size: "S" }];
    const afterSmallerTier = retainSlotsForTier(chosen, 1, seed);
    assert.deepEqual(afterSmallerTier, chosen);
    assert.deepEqual(retainSlotsForTier(afterSmallerTier, 3, seed), chosen);
  } finally {
    await vite.close();
  }
});

test("a six-item tier renders six independent variant positions", async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { StorefrontWidget } = await vite.ssrLoadModule("/src/prototype/StorefrontWidget.tsx");
    const html = renderToStaticMarkup(React.createElement(StorefrontWidget, {
      device: "desktop",
      accent: "#171717",
      locale: "en",
      notify: () => {},
      tiers: [{ quantity: 6, label: "Six", discountPercent: 20, discountType: "percentage", recommended: true }],
      config: { allowMixed: true, showSelectors: true, selectorStyle: "Dropdown", imageTileSize: 64, imageTileRadius: 8, showImageColorValue: true, widgetFontSize: 14, showStock: true, showPricing: true },
    }));
    assert.match(html, /<legend>#6<\/legend>/);
    assert.equal((html.match(/<legend>#[1-6]<\/legend>/g) ?? []).length, 6);
    assert.match(html, /\$626\.00/);
    assert.match(html, /\$500\.80/);
  } finally {
    await vite.close();
  }
});

test("a tier beyond total inventory leaves excess slots unselected and blocks adding", async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { StorefrontWidget } = await vite.ssrLoadModule("/src/prototype/StorefrontWidget.tsx");
    const html = renderToStaticMarkup(React.createElement(StorefrontWidget, {
      device: "desktop", accent: "#171717", locale: "en", notify: () => {},
      tiers: [{ quantity: 20, label: "Twenty", discountPercent: 20, recommended: true }],
      config: { allowMixed: true, showSelectors: true, selectorStyle: "Dropdown", imageTileSize: 64, imageTileRadius: 8, showImageColorValue: true, widgetFontSize: 14, showStock: true, showPricing: true },
    }));
    assert.match(html, /<legend>#20<\/legend>/);
    assert.match(html, /Not enough available variants for this quantity/);
    const button = new JSDOM(html).window.document.querySelector('button[class*="addBundle"]');
    assert.equal(button.disabled, true);
    assert.match(button.textContent, /^Add 20 to cart/);
  } finally {
    await vite.close();
  }
});

test("new positions use remaining variant stock and stay empty when all stock is exhausted", async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { extendSlotsWithInventory } = await vite.ssrLoadModule("/src/prototype/slot-selection.ts");
    const inventory = [
      { color: "Black", size: "M", inventory: 2, available: true },
      { color: "White", size: "L", inventory: 1, available: true },
    ];
    assert.deepEqual(extendSlotsWithInventory([{ color: "Black", size: "M" }], 4, inventory), [
      { color: "Black", size: "M" }, { color: "Black", size: "M" },
      { color: "White", size: "L" }, null,
    ]);
  } finally { await vite.close(); }
});

test("changing an option can select a sold-out combination for the add-to-cart guard", async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { chooseAvailableVariant } = await vite.ssrLoadModule("/src/prototype/slot-selection.ts");
    const inventory = [
      { color: "Black", size: "M", inventory: 2, available: true },
      { color: "White", size: "M", inventory: 0, available: false },
      { color: "White", size: "L", inventory: 4, available: true },
    ];
    assert.deepEqual(chooseAvailableVariant({ color: "Black", size: "M" }, { color: "White", size: "M" }, inventory), { color: "White", size: "M" });
  } finally { await vite.close(); }
});

test("overselling policy treats zero inventory as purchasable", async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { isVariantSoldOut } = await vite.ssrLoadModule("/src/prototype/slot-selection.ts");
    assert.equal(isVariantSoldOut({ color: "Black", size: "M", inventory: 0, available: false, inventoryPolicy: "continue" }), false);
    assert.equal(isVariantSoldOut({ color: "Black", size: "M", inventory: 0, available: false, inventoryPolicy: "deny" }), true);
  } finally { await vite.close(); }
});

test("each inactive tier prices only its own quantity of selected slots", async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { StorefrontWidget } = await vite.ssrLoadModule("/src/prototype/StorefrontWidget.tsx");
    const html = renderToStaticMarkup(React.createElement(StorefrontWidget, {
      device: "desktop", accent: "#171717", locale: "en", notify: () => {},
      tiers: [{ quantity: 1, label: "Single", discountPercent: 0 }, { quantity: 3, label: "Three", discountPercent: 20, recommended: true }],
      config: { allowMixed: true, showSelectors: true, selectorStyle: "Dropdown", imageTileSize: 64, imageTileRadius: 8, showImageColorValue: true, widgetFontSize: 14, showStock: true, showPricing: true },
    }));
    assert.match(html, /Single[\s\S]*?\$100\.00[\s\S]*?Three/);
  } finally { await vite.close(); }
});
