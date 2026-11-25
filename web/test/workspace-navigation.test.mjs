import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "vite";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFile } from "node:fs/promises";

test("workspace URLs identify every existing prototype view", async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { readWorkspaceLocation, workspaceHref } = await vite.ssrLoadModule("/src/prototype/navigation.ts");
    assert.deepEqual(readWorkspaceLocation("/quantity-breaks"), { page: "dashboard", campaignId: null });
    assert.deepEqual(readWorkspaceLocation("/quantity-breaks/new"), { page: "editor", campaignId: null });
    assert.deepEqual(readWorkspaceLocation("/quantity-breaks/campaigns/serum-01/edit"), { page: "editor", campaignId: "serum-01" });
    assert.deepEqual(readWorkspaceLocation("/quantity-breaks/widget"), { page: "dashboard", campaignId: null });
    assert.deepEqual(readWorkspaceLocation("/quantity-breaks/translations"), { page: "translations", campaignId: null });
    assert.deepEqual(readWorkspaceLocation("/product-discount-customizations/66a964153c3c4b42a6713162369e0df9/7757655103080239428"), { page: "discount-detail", campaignId: null, platformDiscountId: "7757655103080239428" });
    assert.deepEqual(readWorkspaceLocation("/admin/apps/6af69be1b1449d792ba337efdc0e7939d19ba90b/product-discount-customizations/66a964153c3c4b42a6713162369e0df9/7773701781885291182"), { page: "discount-detail", campaignId: null, platformDiscountId: "7773701781885291182" });
    assert.equal(workspaceHref("editor", "serum-01"), "/quantity-breaks/campaigns/serum-01/edit");
    assert.equal(workspaceHref("editor"), "/quantity-breaks/new");
    assert.equal(workspaceHref("dashboard"), "/quantity-breaks");
  } finally {
    await vite.close();
  }
});

test("unknown workspace URLs do not silently show a different page", async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { readWorkspaceLocation } = await vite.ssrLoadModule("/src/prototype/navigation.ts");
    assert.deepEqual(readWorkspaceLocation("/quantity-breaks/unknown"), { page: "not-found", campaignId: null });
    assert.deepEqual(readWorkspaceLocation("/quantity-breaks/campaigns/%2F/edit"), { page: "not-found", campaignId: null });
    assert.deepEqual(readWorkspaceLocation("/quantity-breaks/campaigns/%E0/edit"), { page: "not-found", campaignId: null });
    assert.deepEqual(readWorkspaceLocation("/admin/apps/app/product-discount-customizations/function/%E0"), { page: "not-found", campaignId: null });
  } finally {
    await vite.close();
  }
});

test("dashboard places application language before the create action", async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { Dashboard } = await vite.ssrLoadModule("/src/pages/quantity-breaks.tsx");
    const html = renderToStaticMarkup(React.createElement(Dashboard, {
      campaigns: [], onCreate: () => {}, onEdit: () => {}, onToggle: () => {}, onDelete: () => {},
      languageControl: React.createElement("select", { "aria-label": "Application language" }),
    }));
    const language = html.indexOf('aria-label="Application language"');
    const create = html.indexOf('createCampaign');
    assert.ok(language >= 0 && create > language);
    const shell = await readFile(new URL("../src/pages/quantity-breaks.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(shell, /<aside\b|sidebarScrim|mobileBar/);
  } finally { await vite.close(); }
});
