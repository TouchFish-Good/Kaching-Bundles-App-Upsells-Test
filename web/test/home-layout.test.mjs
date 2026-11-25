import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { readFile } from "node:fs/promises";

test("connected overview waits for real campaigns instead of showing fixture rows", async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { default: QuantityBreaksPrototype } = await vite.ssrLoadModule("/src/pages/quantity-breaks.tsx");
    const html = renderToStaticMarkup(React.createElement(QuantityBreaksPrototype));

    assert.match(html, /Loading campaigns|loadingCampaigns/);
    assert.doesNotMatch(html, /Renewal Serum multi-buy/);
    assert.doesNotMatch(html, /Apps \/ Bundle deals/);
    assert.doesNotMatch(html, /Mora Beauty/);
    assert.doesNotMatch(html, /Demo data/);
  } finally {
    await vite.close();
  }
});

test("the shared shell keeps its white background and compact language control", async () => {
  const css = await readFile(new URL("../src/pages/quantity-breaks.module.css", import.meta.url), "utf8");
  assert.match(css, /\.homeShell\s*\{[^}]*--canvas:#ffffff/);
  assert.match(css, /\.homeShell \.adminLanguage select\s*\{[^}]*background:#fff/);
});

test("the connected app renders its main content without a workspace wrapper", async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { default: QuantityBreaksPrototype } = await vite.ssrLoadModule("/src/pages/quantity-breaks.tsx");
    const html = renderToStaticMarkup(React.createElement(QuantityBreaksPrototype));

    assert.doesNotMatch(html, /workspace/);
  } finally {
    await vite.close();
  }
});

test("empty overview keeps one creation action", async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { Dashboard } = await vite.ssrLoadModule("/src/pages/quantity-breaks.tsx");
    const html = renderToStaticMarkup(React.createElement(Dashboard, {
      campaigns: [], onCreate: () => {}, onEdit: () => {}, onToggle: () => {}, onDelete: () => {},
    }));
    assert.equal((html.match(/>createCampaign<\/button>/g) ?? []).length, 1);
    assert.match(html, /noCampaigns/);
  } finally {
    await vite.close();
  }
});

test("prototype routes use the shared shell without a sidebar; navigation has direct paths", async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { default: QuantityBreaksPrototype } = await vite.ssrLoadModule("/src/pages/quantity-breaks.tsx");
    const previousWindow = globalThis.window;
    try {
      globalThis.window = { location: { pathname: "/quantity-breaks/widget" } };
      const html = renderToStaticMarkup(React.createElement(QuantityBreaksPrototype));
      assert.match(html, /class="[^"]*homeShell/);
      assert.doesNotMatch(html, /<aside\b/);
      const { workspaceHref } = await vite.ssrLoadModule("/src/prototype/navigation.ts");
      assert.equal(workspaceHref("dashboard"), "/quantity-breaks");
      assert.equal(workspaceHref("translations"), "/quantity-breaks/translations");
    } finally {
      if (previousWindow === undefined) delete globalThis.window;
      else globalThis.window = previousWindow;
    }
  } finally {
    await vite.close();
  }
});
