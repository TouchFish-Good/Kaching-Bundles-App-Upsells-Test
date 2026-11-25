# Quantity Breaks Production Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Quantity Breaks prototype's local-only behavior with an authenticated campaign flow, a real Product Discount Function, and a product-page Theme App Block, while retaining the approved UI.

**Architecture:** Express owns shop-scoped campaign persistence and publishes versioned rules to SHOPLINE automatic app discounts. The Go Function evaluates only platform-provided cart lines and discount metafields. The Theme App Block reads a public, product-scoped projection of active campaigns and adds grouped Variant IDs to cart; it never calculates checkout authority.

**Tech Stack:** Existing React/TypeScript/Vite frontend, Express/SQLite backend, Go Function template, SLine Theme App Extension, Node and Go tests.

**Spec:** `docs/superpowers/specs/2026-10-14-quantity-breaks-production-path-design.md`

## Global Constraints

- Preserve the uncommitted `shopline.app.toml` change in the main checkout.
- No live shop mutation, Function deployment, Theme Extension release, or Git push as part of local implementation.
- Same Product variants sum quantities; different Products never sum together. The highest reached threshold applies to every eligible item.
- Product discounts do not combine with other product discounts. Market `presentmentFixedAmount` results are exclusive and one Function run cannot mix presentment and shop-currency values.
- Only verified SHOPLINE API and SLine fields may be used; absence of a contract must block activation rather than invent a payload.
- Each module keeps loading, empty, error, accessibility and mobile states; preserve existing Kaching-reference layout and approved design tokens.

## Review Focus

- Reordering a recommended tier preserves its recommendation and numeric threshold, including when validation errors exist.
- Two enabled campaigns cannot cover the same Product, including all-products versus specific-products and scheduled overlap.
- Publishing a rule with a platform error leaves a recoverable local draft and never reports an active discount.
- A cart with two Variant lines of one Product receives the same reached tier, but line discounts reflect each Variant price.
- Market-specific amounts and auto-converted amounts cannot produce mixed output modes in one Function run.

## Task 1: Stable Tier Ordering

**Files:** `web/src/prototype/CampaignEditor.tsx`, `web/src/prototype/model.ts`, `web/src/pages/quantity-breaks.module.css`, `web/src/prototype/tier-order.ts`, `web/test/tier-order.test.mjs`, `docs/APP_PROGRESS.md`.

**Interfaces:** `reorderTier<T extends { tierId: string }>(tiers: T[], sourceId: string, targetId: string): T[]`; `Tier.tierId` is a stable editor identity; order is display-only.

- [x] Add a failing test: moving recommended quantity 5 before quantity 2 keeps both values and the recommendation; invalid/no-op destinations leave the array unchanged.
- [x] Run `node --test test/tier-order.test.mjs` from `web` and record expected failure.
- [x] Implement stable identities, pointer drag on the handle, keyboard up/down buttons, visible drop state and announcement; keep per-tier drafts keyed by `tierId`.
- [ ] Run the targeted test, `npm run test:prototype`, `npx tsc --noEmit`, and `npm run build`; inspect desktop/mobile editor interaction in a browser.
- [ ] Record evidence and commit only Task 1 files.

## Task 2: Shop-Scoped Campaign Domain and Repository

**Files:** `app/src/service/campaign/model.ts`, `app/src/service/campaign/validate.ts`, `app/src/service/campaign/repository.ts`, `app/test/campaign-domain.test.cjs`, `app/test/campaign-repository.test.cjs`.

**Interfaces:** `CampaignDraft` has stable ID, revision, scope IDs, exclusions, tiers and market modes; `CampaignRepository` exposes list/get/save/delete for one authenticated shop. All stored amounts are integers in the currency's minor unit.

- [x] Add failing tests for positive unique thresholds, amount bounds, ordered display persistence, active scope overlap, revision mismatch and two-shop isolation.
- [x] Run tests with `node -r ts-node/register --test test/campaign-*.test.cjs` and record failures caused by missing domain/repository.
- [x] Implement one SQLite transaction per mutation, database migration and explicit validation errors; do not coerce prototype product names into real IDs.
- [ ] Run targeted/full app tests and `npm run build`; commit Task 2 files. Tests/build passed; commit pending review.

## Task 3: Authenticated Campaign API and Admin Wiring

**Files:** `app/src/controller/campaigns.ts`, `app/src/index.ts`, `web/src/prototype/campaigns-api.ts`, `web/src/pages/quantity-breaks.tsx`, `web/src/prototype/CampaignEditor.tsx`, `app/test/campaign-api.test.cjs`, `web/test/campaigns-api.test.mjs`.

**Interfaces:** `GET/POST /api/quantity-breaks/campaigns`, `GET/PUT/DELETE /api/quantity-breaks/campaigns/:id`, and `POST /api/quantity-breaks/campaigns/:id/status` require a validated SHOPLINE session. Frontend API errors retain the form draft. Sample campaigns are only an explicit offline demo state.

- [ ] Write failing API tests for authorization, shop isolation, invalid fields, conflict, stale revision, unavailable server and successful save/reload.
- [ ] Run failing tests, implement controllers and frontend data hooks, and retain unsaved edits on save failure.
- [ ] Run app/web suites, builds, type checks and browser refresh/back/forward checks; commit Task 3 files.

## Task 4: SHOPLINE Discount Adapter and Publication State

**Files:** `app/src/service/campaign/discount-adapter.ts`, `app/src/service/campaign/publish.ts`, `app/src/controller/campaigns.ts`, `app/test/campaign-publish.test.cjs`, `docs/SHOPLINE_API_RESEARCH.md`.

**Interfaces:** The adapter accepts a validated campaign rule and a SHOPLINE session; it uses the verified `discountAutomaticAppCreate`/update/delete contract and `sale` metafield. `publishCampaign` records platform rule ID and published rule version only after successful platform response.

- [ ] Read full official mutation/input/error contracts and verify `functionId`, scopes, version and response fields; capture URLs and exact version in API research.
- [ ] Write failing tests for create/update, userErrors, timeout, retry/idempotency, conflict and the 35-rule limit.
- [ ] Implement the adapter and publication state machine; a missing Function ID or uncertain platform contract blocks publish with a clear error.
- [ ] Run app tests/build and inspect diff; commit Task 4 files.

## Task 5: Go Product Discount Function

**Files:** `product-discount-customizations/input.graphql`, `product-discount-customizations/main.go`, `product-discount-customizations/discount.go`, `product-discount-customizations/discount_test.go`, `docs/SHOPLINE_API_RESEARCH.md`.

**Interfaces:** Decode versioned `sale` rule from `DiscountNodes`, group `Cart.Lines` by Product ID, select highest reached quantity, return one `ProductDiscount` per applicable rule with per-line `CartLineTarget` values. Output uses only fields present in the local generated `module` schema and desktop Function documents.

- [ ] Write failing table tests for quantities 1/2/3/4/5/6, mixed Variant prices, exclusions, malformed rule, percentage/fixed amount/fixed price, zero discount and incompatible market output.
- [ ] Run `go test ./...` and record failures.
- [ ] Extend `input.graphql` with precisely required fields, implement integer calculation and uniform output-mode checks; regenerate `module` only through the documented local generator if the schema requires it.
- [ ] Run `go test ./...`, `go vet ./...` and the Function build command. Commit Task 5 files after reviewing generated changes.

## Task 6: Product-Page Theme App Block

**Files:** `theme-app-extension/blocks/app-block.html`, `theme-app-extension/public/app-block.js`, `theme-app-extension/public/app-block.css`, `theme-app-extension/i18n/*`, `app/src/controller/storefront-campaign.ts`, `app/test/storefront-campaign.test.cjs`, `theme-app-extension/test/*.test.mjs`.

**Interfaces:** The block is restricted to product templates, requests a public projection of currently eligible campaign data, renders exactly N Variant slots for selected quantity, and POSTs grouped `{items:[{id,quantity}]}` to `/cart/add` once. It does not embed a token or alter checkout totals.

- [ ] Verify SLine product ID, product variants/options, locale and extension asset syntax from SHOPLINE docs; write failing DOM/cart-payload tests for mixed SKUs, sold-out choices, repeated SKUs and request failure.
- [ ] Implement block, styling, locale fallback and public projection with explicit input validation and origin/caching policy.
- [ ] Run theme syntax validation, JS tests, app tests/build and browser desktop/mobile checks; commit Task 6 files.

## Task 7: End-to-End Verification and Status

**Files:** `docs/APP_PROGRESS.md`, `docs/APP_GAP_ANALYSIS.md`, `docs/SHOPLINE_API_RESEARCH.md`, screenshots under `docs/reference/screenshots/` only when actually captured.

- [ ] Run all Node/Go tests, TypeScript checks and builds on the final branch.
- [ ] Verify local admin create/edit/reorder/reload and theme UI with available fixture data; retain screenshots at desktop and 390px mobile.
- [ ] In a permitted development store, verify 1/2/3/4/5/6 quantities, market and combination behavior, cart and checkout before any production-readiness claim. If no store is connected, mark these checks BLOCKED rather than VERIFIED.
- [ ] Review every changed and new file, scan secrets, update progress with pass/fail evidence and record remaining platform gaps. Do not push without this batch's explicit approval.
