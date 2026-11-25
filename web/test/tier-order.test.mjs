import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "vite";

test("moving a recommended tier changes display order without changing its pricing threshold", async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { reorderTier } = await vite.ssrLoadModule("/src/prototype/tier-order.ts");
    const tiers = [
      { tierId: "one", quantity: 1, recommended: false },
      { tierId: "two", quantity: 2, recommended: false },
      { tierId: "five", quantity: 5, recommended: true },
    ];
    const moved = reorderTier(tiers, "five", "two");
    assert.deepEqual(moved.map((tier) => tier.tierId), ["one", "five", "two"]);
    assert.equal(moved[1].recommended, true);
    assert.equal(moved[1].quantity, 5);
    assert.deepEqual(tiers.map((tier) => tier.tierId), ["one", "two", "five"]);
    assert.equal(reorderTier(tiers, "five", "missing"), tiers);
    assert.equal(reorderTier(tiers, "two", "two"), tiers);
  } finally {
    await vite.close();
  }
});

test("a card drag reorders only when released over another tier", async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { reorderFromDragEnd } = await vite.ssrLoadModule("/src/prototype/tier-order.ts");
    const tiers = [{ tierId: "one" }, { tierId: "two" }, { tierId: "three" }];
    assert.deepEqual(reorderFromDragEnd(tiers, "one", "three").map((tier) => tier.tierId), ["two", "three", "one"]);
    assert.equal(reorderFromDragEnd(tiers, "one", null), tiers);
    assert.equal(reorderFromDragEnd(tiers, "one", "one"), tiers);
  } finally {
    await vite.close();
  }
});
