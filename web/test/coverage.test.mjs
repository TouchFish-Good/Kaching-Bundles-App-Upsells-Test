import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "vite";

test("prototype coverage blocks an active or scheduled campaign for the same product", async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { findPrototypeCoverageConflicts } = await vite.ssrLoadModule("/src/prototype/coverage.ts");
    const { campaignData } = await vite.ssrLoadModule("/src/prototype/data.ts");
    assert.equal(findPrototypeCoverageConflicts(campaignData, "Specific products", "Renewal Serum").state, "conflict");
    assert.equal(findPrototypeCoverageConflicts(campaignData, "Specific products", "Daily Cleanser").state, "conflict");
    assert.equal(findPrototypeCoverageConflicts(campaignData, "Specific products", "Night Cream").state, "clear");
    assert.equal(findPrototypeCoverageConflicts(campaignData, "All products", "Night Cream").state, "conflict");
    assert.equal(findPrototypeCoverageConflicts(campaignData, "Product collections", "Night Cream").state, "unverified");
    assert.equal(findPrototypeCoverageConflicts(campaignData, "Specific products", "Renewal Serum", "serum").state, "clear");
  } finally {
    await vite.close();
  }
});

test("collection coverage reports specified-product precedence without treating it as a blocking conflict", async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { findCollectionPriorityNotices } = await vite.ssrLoadModule("/src/prototype/coverage.ts");
    const campaigns = [{ id: "direct", name: "Direct offer", products: "1 selected product", scope: { kind: "products", productIds: ["p1"], excludedProductIds: [] }, status: "Active" }];
    assert.deepEqual(findCollectionPriorityNotices(campaigns, [{ id: "p1", title: "Product A" }]), [{ productTitle: "Product A", campaignName: "Direct offer" }]);
  } finally {
    await vite.close();
  }
});
