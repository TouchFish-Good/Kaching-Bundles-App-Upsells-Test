import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "vite";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

test("storefront copy only exposes merchant-editable storefront text and permits omitted placeholders", async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { storefrontCopy, renderStorefrontCopy, validateTranslation } = await vite.ssrLoadModule("/src/prototype/storefront-copy.ts");
    assert.ok(storefrontCopy.some((entry) => entry.key === "widget.title" && entry.location === "Widget header"));
    assert.ok(storefrontCopy.some((entry) => entry.key === "widget.tier_savings_badge" && entry.location === "Widget header" && entry.source.includes("{saving_amount}")));
    assert.ok(storefrontCopy.some((entry) => entry.key === "widget.add_to_cart" && entry.source.includes("{quantity}") && entry.source.includes("{price}")));
    assert.equal(storefrontCopy.some((entry) => /widget\.(color|size|stock_shortage|item_option)/.test(entry.key)), false);
    assert.equal(storefrontCopy.some((entry) => /tier.label|tier.subtitle|tier.badge/.test(entry.key)), false);
    assert.equal(renderStorefrontCopy("widget.add_to_cart", {}, { quantity: 3, price: "$90.00" }), "Add 3 to cart · $90.00");
    assert.equal(renderStorefrontCopy("widget.title", { "widget.title": "Acheter plus" }), "Acheter plus");
    assert.equal(renderStorefrontCopy("widget.title", { "widget.title": "" }), "");
    assert.equal(renderStorefrontCopy("widget.title", {}), "Bundle & save");
    assert.equal(renderStorefrontCopy("widget.tier_savings_badge", { "widget.tier_savings_badge": "Save {saving_amount}" }, { saving_amount: "$40.00" }), "Save $40.00");
    assert.equal(renderStorefrontCopy("widget.add_to_cart", { "widget.add_to_cart": "Ajouter {quantity} au panier" }, { quantity: 3, price: "$90.00" }), "Ajouter 3 au panier");
    assert.equal(validateTranslation("widget.add_to_cart", "Ajouter {quantity} au panier"), "");
    assert.equal(validateTranslation("widget.add_to_cart", "Ajouter {quantity} au panier · {price}"), "");
  } finally { await vite.close(); }
});

test("widget renders a merchant translation and falls back on missing keys", async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { StorefrontWidget } = await vite.ssrLoadModule("/src/prototype/StorefrontWidget.tsx");
    const html = renderToStaticMarkup(React.createElement(StorefrontWidget, {
      device: "desktop", accent: "#171717", locale: "fr", notify: () => {},
      translations: { "widget.title": "Acheter plus", "widget.add_to_cart": "Ajouter {quantity} au panier · {price}" },
      config: { allowMixed: true, showSelectors: true, selectorStyle: "Dropdown", imageTileSize: 48, imageTileRadius: 6, showImageColorValue: true, widgetFontSize: 14, showStock: true, showPricing: true },
    }));
    assert.match(html, /Acheter plus/);
    assert.match(html, /Ajouter 3 au panier/);
    assert.match(html, /Estimated savings/);
  } finally { await vite.close(); }
});

test("preview-only widget retains the configured storefront title", async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { StorefrontWidget } = await vite.ssrLoadModule("/src/prototype/StorefrontWidget.tsx");
    const html = renderToStaticMarkup(React.createElement(StorefrontWidget, {
      device: "desktop", accent: "#171717", locale: "en", notify: () => {}, previewOnly: true,
      translations: {},
      config: { allowMixed: true, showSelectors: true, selectorStyle: "Dropdown", imageTileSize: 48, imageTileRadius: 6, showImageColorValue: true, widgetFontSize: 14, showStock: true, showPricing: true },
    }));
    assert.match(html, /Bundle &amp; save/);
  } finally { await vite.close(); }
});
