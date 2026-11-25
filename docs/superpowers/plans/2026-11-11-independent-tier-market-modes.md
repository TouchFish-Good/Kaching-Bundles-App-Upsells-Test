# Independent Tier Market Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow one campaign and one SHOPLINE automatic discount to return independent shop-currency or market-presentment outputs for the highest tier matched by each product.

**Architecture:** Keep the existing campaign JSON and `marketOverrides` structure. Remove campaign-wide market-mode validation and the Go Function's global mode rejection, then partition Function results by matched product/tier and output type so `fixedAmount` and `presentmentFixedAmount` can coexist. Preserve activity-level combination settings and keep `marketNotice` as the tier-specific explanation.

**Tech Stack:** React/TypeScript/Vite web editor, Cloudflare Worker TypeScript/D1, Go SHOPLINE Product Discount Function, Node test runner, Vitest, Go test.

**Spec:** `docs/superpowers/specs/2026-11-11-tier-market-mode-independent-design.md`

## Global Constraints

- Keep one campaign and one SHOPLINE automatic discount per activity.
- Preserve `marketOverrides` and do not add a D1 migration.
- `specified_amount` remains valid only for the four fixed discount types.
- Preserve merchant-selected order, product, and shipping combination values.
- Do not disable or lock activity-level combination controls because a tier uses `specified_amount`.
- Keep highest-tier selection, scope priority, bundle allocation, and fail-closed invalid-rule behavior.
- Do not claim mixed output support is production-ready until a real SHOPLINE test-store checkout accepts it.
- Use `shoplineAdminHeaders()` for every Worker SHOPLINE Admin request; never add secrets to fixtures or logs.

## Review Focus

- Mixed market modes in one market save successfully: Worker validation test.
- Activity combination booleans survive a specified-market tier: Worker request and editor tests.
- Two products can return both shop and presentment outputs: Go Function test.
- One Product still selects only its highest achieved tier: existing and extended Go tests.
- Invalid market amount, currency, price data, and bundle data remain fail-closed: table-driven Go tests.

---

### Task 1: Worker Validation and Combination Preservation

**Files:**
- Modify: `worker/src/domain/campaign.ts`
- Modify: `worker/src/db/campaigns.ts`
- Modify: `worker/test/campaign-repository.test.ts`
- Modify: `worker/test/discount-publication.test.ts`

**Interfaces:** Preserve `validateCampaign`, `buildDiscountRule`, `discountInput`, product-scope conflict checks, and the existing combination request shape.

- [ ] **Step 1: Write the failing validation test.** Add a campaign with percentage and fixed tiers where the same market has both `auto_convert` and valid `specified_amount`; assert the old mixed-mode error is absent. Add a percentage tier with `specified_amount`; assert `Specified market amounts require a fixed discount type.` remains.
- [ ] **Step 2: Run the focused test and verify red.** Run `cd worker && npx vitest run test/campaign-repository.test.ts`; it must fail on the old campaign-wide conflict.
- [ ] **Step 3: Remove the campaign-wide mode loop.** Keep per-tier fixed-type validation and same-market currency consistency. Delete the final `specifiedMarkets` mode check. Remove `campaignCurrencyConflict` and its database call sites; keep scope and schedule conflicts.
- [ ] **Step 4: Write the combination preservation test.** Create a mixed-mode campaign with `combinesWith: { orderDiscounts: true, productDiscounts: true, shippingDiscounts: false }`; intercept automatic discount creation; assert all six uploaded `combines_with_modes` values and every tier override are unchanged.
- [ ] **Step 5: Run focused verification.** Run `cd worker && npx vitest run test/campaign-repository.test.ts test/discount-publication.test.ts && npm run typecheck`.
- [ ] **Step 6: Commit.** `git add worker/src worker/test && git commit -m "feat: allow independent tier market modes"`.

### Task 2: Go Function Output Partitioning

**Files:**
- Modify: `product-discount-customizations/internal/discount/discount.go`
- Modify: `product-discount-customizations/internal/discount/discount_test.go`

**Interfaces:** Preserve `EvaluateDiscounts` and `EvaluateDiscountsWithTrace`; remove only candidate-wide mode state. Keep product priority and highest-tier semantics.

- [ ] **Step 1: Write failing mixed-output tests.** Build one rule covering `p-shop` and `p-market`; make one product hit a fixed `auto_convert` tier and the other hit a fixed `specified_amount` tier. Assert the response contains independent `FixedAmount` and `PresentmentFixedAmount` values with their respective currencies. Add table cases for percentage, fixed amount, fixed price, bundle fixed amount, and bundle fixed price.
- [ ] **Step 2: Run the focused Go tests and verify red.** Run `cd product-discount-customizations && go test ./internal/discount -run 'Mixed|Highest|Fixed|Bundle' -count=1`; the mixed case must fail because current code rejects different modes.
- [ ] **Step 3: Remove global mode rejection.** Delete `candidate.mode`, the cross-candidate mode comparison in `evaluateDiscounts`, and both `mode != currentMode` returns in `applyRule`.
- [ ] **Step 4: Partition ordinary targets.** Replace the single `perItemTargets` bucket with buckets keyed by output type, currency, decimal precision, and per-item flag. Emit one `ProductDiscount` per non-empty bucket. Keep bundle output one object per product group and preserve group-level one-time application.
- [ ] **Step 5: Extend highest-tier and fail-closed tests.** Verify quantity 4 uses the quantity-3 tier even when lower tiers use another mode. Add missing presentment money, wrong currency, negative amount, invalid precision, unpriceable bundle, and mixed-valid/invalid rule cases; none may emit a partial result.
- [ ] **Step 6: Run and format.** Run `cd product-discount-customizations && gofmt -w internal/discount/discount.go internal/discount/discount_test.go && go test ./... -count=1`.
- [ ] **Step 7: Commit.** `git add product-discount-customizations/internal/discount/discount.go product-discount-customizations/internal/discount/discount_test.go && git commit -m "feat: partition discount outputs by tier mode"`.

### Task 3: Editor Combination Controls and Notices

**Files:**
- Modify: `web/src/prototype/CampaignEditor.tsx`
- Modify: `web/test/editor-structure.test.mjs`
- Modify: `web/test/combination-policy.test.mjs`

**Interfaces:** Keep `getSpecifiedMarketCombinationRows` for tier notices, `getEnabledCombinationTypes` for configured labels, and the three combination state fields in save payloads.

- [ ] **Step 1: Write failing editor tests.** Render a mixed-mode campaign with all three combination booleans true. Assert controls stay enabled and checked, the notice lists only the specified tier/market, the rule summary shows configured combination labels, and `onSave` receives the original booleans.
- [ ] **Step 2: Run and verify red.** Run `cd web && node --test test/editor-structure.test.mjs test/combination-policy.test.mjs`; current summary locking must fail the new assertion.
- [ ] **Step 3: Remove the global editor lock.** Delete the `hasSpecifiedMarketAmount` summary branch. Always render configured combination labels when present. Keep the tier-specific `marketNotice` table and do not rewrite combination state during submit.
- [ ] **Step 4: Run focused tests and build.** Run `cd web && node --test test/editor-structure.test.mjs test/combination-policy.test.mjs test/widget-layout.test.mjs && npm run build`.
- [ ] **Step 5: Commit.** `git add web/src/prototype/CampaignEditor.tsx web/test/editor-structure.test.mjs web/test/combination-policy.test.mjs && git commit -m "fix: preserve activity combination settings"`.

### Task 4: Preview and Theme Regression Matrix

**Files:**
- Modify: `web/test/widget-layout.test.mjs`
- Modify: existing market-preview test file if present
- Modify: existing `theme-app-extension/test` app-block test file if present
- Modify: `theme-app-extension/public/app-block.js` only if a failing test proves selected-tier override is not used

**Interfaces:** Preview and app block must read `marketOverrides` from the currently rendered tier, not from another tier or the campaign root.

- [ ] **Step 1: Add a preview matrix.** Use tiers for original price, percentage, fixed auto conversion, and fixed specified amount. Render primary and non-primary markets; assert each tier uses its own price/override and only specified tiers show the market notice.
- [ ] **Step 2: Add app-block matrix coverage.** Select each tier in the DOM harness and assert the selected tier's override controls price calculation. Include fixed amount, fixed price, bundle amount, and bundle price cases.
- [ ] **Step 3: Run web/theme tests.** Run `cd web && node --test test/widget-layout.test.mjs` and the existing theme app-block test command. Record the actual test path if no separate market-preview test exists.
- [ ] **Step 4: Commit regression coverage.** `git add web/test theme-app-extension/test theme-app-extension/public/app-block.js && git commit -m "test: cover independent tier market previews"`.

### Task 5: Full Verification and Controlled Platform Gate

**Files:**
- Modify: `docs/APP_PROGRESS.md` only after actual test-store verification.

- [ ] **Step 1: Run all local suites.** Run `cd web && npm run test:prototype && npm run build`; `cd worker && npm test && npm run typecheck && npm run build`; and `cd product-discount-customizations && go test ./... -count=1`.
- [ ] **Step 2: Build the Function artifact.** Run `cd product-discount-customizations && sl-function build`; verify `dist/function.wasm` and the configured Function ID.
- [ ] **Step 3: Review the final diff.** Run `git status --short`, `git diff --check`, `git diff --stat`, and inspect all changed/untracked files for secrets, generated artifacts, unrelated edits, and accidental discount ID changes.
- [ ] **Step 4: Deploy only after explicit approval.** Publish the Function extension using the verified SHOPLINE workflow, then deploy the Worker with the built `web/dist`; do not recreate existing automatic discounts.
- [ ] **Step 5: Run controlled test-store acceptance.** Use two product groups in one activity: original price, percentage, fixed auto conversion, fixed specified amount, bundle fixed amount/price, and all three activity-level combination settings enabled. Verify independent checkout outputs, tier-specific notices, and unchanged uploaded combination settings.
- [ ] **Step 6: Record only observed results.** Update `docs/APP_PROGRESS.md` with Function/Worker versions, market, cart/checkout result, and any platform rejection. If SHOPLINE rejects mixed output, stop and document the exact response.
- [ ] **Step 7: Request final implementation push approval.** Ask exactly: `本次代码/文档已在本地更新，是否推送到 GitHub？` Do not push implementation commits before approval.
