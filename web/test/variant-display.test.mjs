import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createServer } from "vite";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

test("maps localized base color names to stable swatch colors", async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { colorSwatch } = await vite.ssrLoadModule("/src/prototype/color-swatches.ts");
    assert.equal(colorSwatch("red"), "#ef4444");
    assert.equal(colorSwatch("RED"), "#ef4444");
    assert.equal(colorSwatch("红色"), "#ef4444");
    assert.equal(colorSwatch("unknown color"), "#d9e1dd");
  } finally {
    await vite.close();
  }
});

async function loadVariantDisplay() {
  try {
    return await import("../src/prototype/variant-display.js");
  } catch (error) {
    if (error.code === "ERR_MODULE_NOT_FOUND") return null;
    throw error;
  }
}

test("keeps sold-out image choices visible and selectable while showing their status", async () => {
  const display = await loadVariantDisplay();

  assert.ok(display, "variant display helpers should exist");
  const tiles = display.createVariantImageTiles([
    { id: "black-m", color: "Black", size: "M", price: 100, inventory: 2, available: true, image: "/black-m.jpg" },
    { id: "white-m", color: "White", size: "M", price: 112, inventory: 0, available: false, image: "/white-m.jpg" },
  ]);

  assert.deepEqual(tiles.map((tile) => ({ id: tile.id, disabled: tile.disabled, status: tile.status })), [
    { id: "black-m", disabled: false, status: "2 left" },
    { id: "white-m", disabled: false, status: "Sold out" },
  ]);
});

test("allows the merchant's 10px image minimum without expanding its button", async () => {
  const display = await loadVariantDisplay();

  assert.ok(display, "variant display helpers should exist");
  assert.equal(display.normalizeImageTileSize(9), 10);
  assert.equal(display.normalizeImageTileSize(10), 10);
  assert.equal(display.normalizeImageTileSize(28), 28);
  assert.equal(display.normalizeImageTileSize(72), 72);
  assert.equal(display.normalizeImageTileSize(180), 96);
});

test("only exposes an image tile color caption when configured", async () => {
  const display = await loadVariantDisplay();

  assert.ok(display, "variant display helpers should exist");
  const variants = [{ id: "black-m", color: "Black", size: "M", price: 100, inventory: 2, available: true, image: "/black-m.jpg" }];

  assert.equal(display.createVariantImageTiles(variants, { showColorValue: false })[0].colorLabel, null);
  assert.equal(display.createVariantImageTiles(variants, { showColorValue: true })[0].colorLabel, "Black");
});

test("constrains widget font size to its supported preview range", async () => {
  const display = await loadVariantDisplay();

  assert.ok(display, "variant display helpers should exist");
  assert.equal(display.normalizeWidgetFontSize(8), 12);
  assert.equal(display.normalizeWidgetFontSize(14), 14);
  assert.equal(display.normalizeWidgetFontSize(24), 20);
});

test("keeps the selected bundle tier compact while preserving an 8px option rhythm", async () => {
  const css = await readFile(new URL("../src/pages/quantity-breaks.module.css", import.meta.url), "utf8");

  assert.match(css, /\.tierHeader\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,1fr\)\s+auto/);
  assert.match(css, /\.tierComposer\s*\{[\s\S]*padding:\s*0\s+8px\s+8px/);
  assert.match(css, /--variant-option-gap:\s*8px/);
});

test("uses the storefront-style offer hierarchy for the widget", async () => {
  const css = await readFile(new URL("../src/pages/quantity-breaks.module.css", import.meta.url), "utf8");

  assert.match(css, /\.widgetIntro::before,\.widgetIntro::after/);
  assert.match(css, /\.tierChoiceSelected\s*\{[\s\S]*border:\s*2px solid #171717/);
  assert.match(css, /\.tierTag\s*\{[\s\S]*background:#171717/);
  assert.match(css, /\.addBundle\s*\{[\s\S]*background:#171717/);
});

test("offers the merchant the supported non-swatch variant display modes", async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { CampaignStyleEditor } = await vite.ssrLoadModule('/src/prototype/CampaignStyleEditor.tsx');
    const { defaultCampaignWidgetConfig } = await vite.ssrLoadModule('/src/prototype/widget-config.ts');
    const html = renderToStaticMarkup(React.createElement(CampaignStyleEditor, { value: defaultCampaignWidgetConfig(), onChange: () => {} }));
    assert.match(html, /<option value="dropdown"[^>]*>Dropdown<\/option>/);
    assert.match(html, /<option value="image">Original variant images<\/option>/);
    assert.match(html, /<option value="text">Text values<\/option>/);
    assert.doesNotMatch(html, /<option value="swatch">Color swatches<\/option>/);
  } finally { await vite.close(); }
});

test("keeps selected offer inner corners aligned with the outer two-pixel border", async () => {
  const css = await readFile(new URL("../src/pages/quantity-breaks.module.css", import.meta.url), "utf8");

  assert.match(css, /\.tierChoiceSelected\s*\{[\s\S]*border-radius:\s*9px/);
  assert.match(css, /\.tierChoiceSelected \.tierOption\s*\{[\s\S]*border-radius:\s*7px 7px 0 0/);
  assert.match(css, /\.tierChoiceSelected \.tierComposer\s*\{[\s\S]*border-radius:\s*0 0 7px 7px/);
});

test("gives every variant control a full row below its item and inventory header", async () => {
  const css = await readFile(new URL("../src/pages/quantity-breaks.module.css", import.meta.url), "utf8");

  assert.match(css, /\.tierComposer \.variantSlot\s*\{[\s\S]*grid-template-areas:\s*"index stock"\s*"controls controls"/);
  assert.match(css, /\.slotControls\s*\{[\s\S]*grid-area:\s*controls/);
  assert.match(css, /\.slotControls \.dropdownLine select\s*\{[\s\S]*min-width:\s*0[\s\S]*width:\s*100%/);
});

test("renders campaign editor preview tiers from the live form draft", async () => {
  const widgetSource = await readFile(new URL("../src/prototype/StorefrontWidget.tsx", import.meta.url), "utf8");
  const editorSource = await readFile(new URL("../src/prototype/CampaignEditor.tsx", import.meta.url), "utf8");

  assert.match(widgetSource, /tiers\?:\s*Tier\[\]/);
  assert.match(widgetSource, /activeTiers\.map\(/);
  assert.match(editorSource, /<StorefrontWidget[\s\S]*tiers=\{tiers\}/);
});

test("editor preview presents desktop and mobile views with a compact product-only mode", async () => {
  const editor = await readFile(new URL("../src/prototype/CampaignEditor.tsx", import.meta.url), "utf8");
  const widget = await readFile(new URL("../src/prototype/StorefrontWidget.tsx", import.meta.url), "utf8");
  assert.match(editor, /activeStyleDevice/);
  assert.match(editor, /previewDeviceToggle/);
  assert.match(editor, /activeStyleDevice === 'mobile'/);
  assert.match(editor, /device="mobile"/);
  assert.match(editor, /device="desktop"/);
  assert.match(editor, /previewOnly/);
  assert.match(editor, /defaultTierTag/);
  assert.doesNotMatch(widget, /defaultLabel/);
});

test("right corner badges stay in the tier header on narrow previews", async () => {
  const css = await readFile(new URL("../src/pages/quantity-breaks.module.css", import.meta.url), "utf8");
  assert.match(css, /\.storefront \.tierChoices\[data-badge-position="corner"\] \.tierTag\{position:absolute;top:0;right:0/);
  assert.match(css, /\.storefront \.tierChoices\[data-badge-position="below_subtitle"\] \.tierTag\{position:static;display:block/);
});

test("keeps quantity tier descriptions available when their card becomes narrow", async () => {
  const css = await readFile(new URL("../src/pages/quantity-breaks.module.css", import.meta.url), "utf8");

  assert.match(css, /\.tierText small\s*\{[\s\S]*overflow:\s*visible[\s\S]*text-overflow:\s*clip[\s\S]*white-space:\s*normal/);
});

test("removes the template root constraints that cause app-page horizontal overflow", async () => {
  const css = await readFile(new URL("../src/index.css", import.meta.url), "utf8");

  assert.match(css, /body\s*\{[\s\S]*display:\s*block/);
  assert.match(css, /#root\s*\{[\s\S]*max-width:\s*none[\s\S]*padding:\s*0[\s\S]*text-align:\s*start/);
});

test("keeps the live preview wide enough on desktop and stacks it before the compact breakpoint", async () => {
  const css = await readFile(new URL("../src/pages/quantity-breaks.module.css", import.meta.url), "utf8");

  assert.match(css, /\.referenceEditor\s*\{[^}]*width:100%/);
  assert.match(css, /@media \(max-width:900px\)\s*\{\s*\.referenceEditor \.editorContent\s*\{[^}]*grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css, /\.referenceEditor \.editorPreview\s*\{[^}]*margin-top:8px/);
});

test("shows only explicitly configured tier subtitles", async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { tierDescription } = await vite.ssrLoadModule("/src/prototype/StorefrontWidget.tsx");
    const tier = { quantity: 3, label: "Set", discountPercent: 20, discountType: "fixed_amount", discountValue: 1000 };
    assert.equal(tierDescription(tier), "");
    assert.equal(tierDescription({ ...tier, subtitle: "" }), "");
    assert.equal(tierDescription({ ...tier, subtitle: "  " }), "");
    assert.equal(tierDescription({ ...tier, subtitle: "Mix any three" }), "Mix any three");
  } finally {
    await vite.close();
  }
});

test("shows only the selected variant price in a bundle slot header", async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { StorefrontWidget } = await vite.ssrLoadModule("/src/prototype/StorefrontWidget.tsx");
    const html = renderToStaticMarkup(React.createElement(StorefrontWidget, {
      device: "desktop", accent: "#171717", locale: "en", notify: () => {},
      config: { allowMixed: true, showSelectors: true, selectorStyle: "Dropdown", imageTileSize: 48, imageTileRadius: 6, showImageColorValue: true, widgetFontSize: 14, showStock: true, showPricing: true },
    }));
    assert.match(html, /<legend>#1<\/legend><span[^>]*><b>\$80\.00<\/b><del>\$100\.00<\/del><\/span>/);
    assert.doesNotMatch(html, /\d+ left/);
  } finally { await vite.close(); }
});

test("removes the composer heading and all focus styling", async () => {
  const widget = await readFile(new URL("../src/prototype/StorefrontWidget.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/pages/quantity-breaks.module.css", import.meta.url), "utf8");

  assert.doesNotMatch(widget, /styles\.slotHeading/);
  assert.doesNotMatch(css, /:focus(?:-visible|-within)?\b/);
});

test("keeps the recommended action whole and starts item slots without a top gap", async () => {
  const css = await readFile(new URL("../src/pages/quantity-breaks.module.css", import.meta.url), "utf8");

  assert.match(css, /\.recommendButton\s*\{[\s\S]*min-width:\s*118px[\s\S]*white-space:\s*nowrap/);
  assert.match(css, /\.tierComposer \.variantSlots\s*\{[\s\S]*margin-top:\s*0/);
});

test("reserves a readable Recommended column instead of shrinking its label", async () => {
  const css = await readFile(new URL("../src/pages/quantity-breaks.module.css", import.meta.url), "utf8");

  assert.match(css, /\.tierEditRow\s*\{[\s\S]*grid-template-columns:\s*74px\s+minmax\(115px,1fr\)\s+135px\s+minmax\(118px,max-content\)/);
  assert.match(css, /\.recommendButton\s*\{[\s\S]*font:\s*700\s+11px\/1\s+"IBM Plex Sans"/);
});

test("restores the two-column tier editor below the mobile breakpoint", async () => {
  const css = await readFile(new URL("../src/pages/quantity-breaks.module.css", import.meta.url), "utf8");

  assert.match(css, /@media \(max-width:767px\)\s*\{[\s\S]*\.tierEditRow\s*\{\s*grid-template-columns:\s*74px\s+minmax\(0,1fr\)/);
});

test("keeps subtitle and badge copy in the same tier configuration block", async () => {
  const editor = await readFile(new URL("../src/prototype/CampaignEditor.tsx", import.meta.url), "utf8");

  assert.match(editor, /EditorPanel title=\{`\$\{ct\('offerBar'\)\}#\$\{index \+ 1\}[\s\S]*ct\('tierSubtitle'\)[\s\S]*ct\('badgeText'\)/);
  assert.doesNotMatch(editor, /EditorPanel title="Tier copy"/);
});

test("keeps translations available at a direct URL after removing the sidebar", async () => {
  const model = await readFile(new URL("../src/prototype/model.ts", import.meta.url), "utf8");
  const editor = await readFile(new URL("../src/pages/quantity-breaks.tsx", import.meta.url), "utf8");
  const navigation = await readFile(new URL("../src/prototype/navigation.ts", import.meta.url), "utf8");

  assert.match(model, /WorkspacePage\s*=.*"translations"/);
  assert.match(navigation, /if \(path === "\/quantity-breaks\/translations"\)/);
  assert.match(navigation, /if \(page === "translations"\) return "\/quantity-breaks\/translations"/);
  assert.doesNotMatch(editor, /<aside\b/);
  assert.match(editor, /page === "translations"/);
});

test("uses a neutral app canvas with a distinct non-green accent", async () => {
  const css = await readFile(new URL("../src/pages/quantity-breaks.module.css", import.meta.url), "utf8");

  assert.match(css, /--canvas:#ffffff/);
  assert.match(css, /--accent:#000000/);
});

test("editor preview presents desktop and mobile views and default tier labels", async () => {
  const editor = await readFile(new URL("../src/prototype/CampaignEditor.tsx", import.meta.url), "utf8");
  const widget = await readFile(new URL("../src/prototype/StorefrontWidget.tsx", import.meta.url), "utf8");
  assert.match(editor, /device="desktop"/);
  assert.match(editor, /device="mobile"/);
  assert.match(editor, /className=\{styles\.ruleSummaryTiers\}/);
  assert.match(editor, /tier\.recommended && <Check[^>]*aria-label=\{ct\('defaultSelected'\)\}/);
  assert.match(widget, /default/);
});
