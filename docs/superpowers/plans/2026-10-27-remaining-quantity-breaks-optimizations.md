# Remaining Quantity Breaks Optimizations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make selected-product loading reliable and batched, align the theme widget with the admin preview, improve campaign list readability, and make the translation route independent from campaign editing state.

**Architecture:** Keep the existing React/Express/Theme App Extension boundaries. Add a batched product lookup contract at the app API, define one explicit pricing fixture set consumed by both the admin and theme calculators, and keep list formatting in the admin adapter/view layer. Clear transient campaign modal state whenever navigation changes and give translation loading its own error boundary.

**Tech Stack:** React 18, TypeScript, Express, SQLite-backed repositories, SHOPLINE Admin REST `v20260901`, Theme App Extension JavaScript/CSS, Node test runner, Vite.

**Spec:** `docs/superpowers/specs/2026-10-27-campaign-detail-live-update-design.md` for the related campaign editing rules; this plan covers the four remaining optimization units confirmed in chat.

## Global Constraints

- SHOPLINE product lookup must use the documented `GET /products/products.json` endpoint and its `ids` query parameter; do not invent an undocumented endpoint.
- A failed product lookup must never render a raw product ID as if it were a product title.
- Theme output and admin preview must use the same pricing semantics: minor-unit arithmetic, compare-at price when present, and the configured discount type.
- The theme cart integration must detect available theme behavior before invoking it and retain a local status fallback when no integration is exposed; the app-owned fallback event is `quantity-breaks:cart-updated`.
- Campaign times must include seconds and use the campaign/store timezone and active admin locale.
- Existing user edits in the worktree remain untouched; do not stage unrelated files.
- Real SHOPLINE behavior is not marked verified until an authenticated store check and screenshots exist; update `docs/APP_PROGRESS.md` only with evidence.

## Review Focus

- More than 50 selected product IDs: split requests into documented batches and preserve the original selection order.
- A batch response missing one requested product: show an unavailable state for that product and keep the other products usable.
- A variant with a compare-at price and a fixed or bundle discount: theme and admin must produce the same original, savings, and total values.
- A theme with no cart drawer API but with a native cart form/event: add succeeds without throwing and still gives an accessible success message.
- Translation navigation while an edit confirmation is open or while campaign loading fails: the translation view must render its own state and no stale modal may cover it.

---

### Task 1: Batch Product Lookup and Selected-Items Dialog

**Files:**
- Modify: `app/src/controller/campaign-products.ts`
- Modify: `app/src/service/campaign/product-catalog.ts`
- Modify: `web/src/prototype/CampaignProductPicker.tsx`
- Modify: `app/src/service/campaign/publish.ts`
- Test: `app/test/campaign-products.test.cjs` (create if absent)
- Test: `app/test/campaign-product-catalog.test.cjs` (create if absent)
- Test: `web/test/product-picker.test.mjs` (create if absent)

**Interfaces:**
- Produces `GET /api/quantity-breaks/products?ids=<comma-separated IDs>` returning `{ products: Product[]; missingIds: string[] }`.
- Produces `getCampaignProducts(session, ids, fetcher?, requestId?)`, which validates unique IDs, batches at 50, preserves requested order, and reports missing IDs without substituting IDs for titles.
- `verifyCampaignProducts` consumes `getCampaignProducts` and rejects when any requested product is absent.

- [ ] **Step 1: Write failing API and service tests.** Assert one upstream request for 3 IDs, at most 50 IDs per request, returned order follows the input order, and missing IDs are reported. Assert the controller rejects malformed `ids` values with 400.

```js
assert.equal(calls.length, 1);
assert.equal(calls[0].url.searchParams.get('ids'), 'p1,p2,p3');
assert.deepEqual(result.missingIds, ['p4']);
```

- [ ] **Step 2: Run the focused tests and verify they fail.**

Run: `npm --prefix app test -- --test-name-pattern="batch|ids"`

Expected: FAIL because the controller only accepts `id` and the catalog has no batch lookup.

- [ ] **Step 3: Implement the batch contract.** Add `ids` query parsing with a bounded comma-separated list, use `URLSearchParams` for the upstream `ids` parameter, split input into groups of 50, parse the documented `{ products }` response, and return missing IDs separately. Keep the existing singular `id` path for compatibility, but make the picker use `ids`.

- [ ] **Step 4: Update selected-item hydration.** Replace the per-ID `useEffect` loop in `CampaignProductPicker` with one request for the selected IDs. Render a localized unavailable label and a stable fallback image when an ID is missing; never set `title: id`.

- [ ] **Step 5: Update publish verification to use the same service.** Remove the sequential `for` loop in `verifyCampaignProducts`; reject with the exact missing IDs before publication.

- [ ] **Step 6: Run focused tests and the app suite.**

Run: `npm --prefix app test -- --test-name-pattern="batch|ids|product"`

Expected: PASS, with no singular product request made for the batched picker path.

- [ ] **Step 7: Run `git diff --check` and inspect the API diff.** Confirm no credentials or unrelated files are staged.

### Task 2: Theme Pricing, Summary, Badge, and Cart Integration

**Files:**
- Create: `tests/fixtures/quantity-breaks-pricing.json`
- Modify: `theme-app-extension/blocks/app-block.html`
- Modify: `theme-app-extension/public/app-block.js`
- Modify: `theme-app-extension/public/app-block.css`
- Modify: `web/src/prototype/StorefrontWidget.tsx`
- Modify: `web/src/prototype/storefront-copy.ts`
- Test: `tests/theme-app-extension/widget-mount.test.mjs`
- Test: `tests/theme-app-extension/app-block.test.mjs`
- Test: `web/test/storefront-widget.test.mjs` (create if absent)

**Interfaces:**
- Adds `data-compare-at-price` to theme variant data and reads it as a major-unit value only after explicit normalization.
- Adds pure theme helpers `normalizePriceMinor`, `calculateSummary`, and `notifyThemeCartUpdated` exposed through `QuantityBreaksTheme` for tests; the same fixture cases are asserted against the existing admin pricing calculator.
- Summary DOM contains product rows, Original, Estimated savings, and Bundle total with stable `data-*` hooks.

- [ ] **Step 1: Write failing theme tests.** Verify compare-at prices are read, a two-item percentage tier renders item rows plus all three summary rows, and the badge is positioned relative to its own tier card. Load `tests/fixtures/quantity-breaks-pricing.json` and assert the theme calculation matches each expected total and savings. Verify a successful `/cart/add` calls the detected theme refresh path or dispatches the app-owned `quantity-breaks:cart-updated` event without throwing.

- [ ] **Step 2: Run the focused theme tests and verify they fail.**

Run: `npm run test:theme -- --test-name-pattern="summary|compare|badge|cart"`

Expected: FAIL because the theme currently renders only `Bundle total`, does not pass compare-at prices, and has no theme-cart notification.

- [ ] **Step 3: Implement one pricing summary model.** Add explicit minor-unit normalization and summary calculation for `none`, `percentage`, `fixed_amount`, `fixed_price`, `bundle_fixed_amount`, and `bundle_fixed_price`. Use the same model for item rows and aggregate rows; use compare-at price as Original when supplied, otherwise the catalog price. Add shared JSON fixture cases so the theme helper and the admin `calculateTierPricing` return identical minor-unit totals and savings.

- [ ] **Step 4: Align theme markup with admin preview.** Pass compare-at price from the block template, render the product/variant rows, Original, Estimated savings, and Bundle total, and add localized copy keys with placeholder validation matching `storefront-copy.ts`.

- [ ] **Step 5: Fix badge positioning.** Add a positioning context to `.qb-tier`, keep corner badges absolute against that card, keep below-subtitle badges in flow, and verify long labels wrap without overlapping the header or neighboring cards.

- [ ] **Step 6: Add a theme cart adapter.** After a confirmed add, detect the theme's existing cart drawer refresh/open function or event bridge from the page, invoke only when present, dispatch the app-owned `quantity-breaks:cart-updated` event with the added line items, and always update the component's accessible status. A missing integration must not turn a successful add into an error.

- [ ] **Step 7: Run theme and frontend tests/builds.**

Run: `npm run test:theme`

Run: `npm --prefix web run test:prototype -- --test-name-pattern="widget|summary|cart"`

Run: `npm --prefix web run build`

Expected: PASS and a successful production build.

### Task 3: Campaign List Time and Tier Formatting

**Files:**
- Modify: `web/src/prototype/campaign-adapter.ts`
- Modify: `web/src/pages/quantity-breaks.tsx`
- Modify: `web/src/prototype/admin-workspace-messages.ts`
- Modify: `web/src/locales/zh-Hans.json`
- Modify: `web/src/locales/en.json`
- Modify: remaining locale JSON files using the same message keys
- Test: `web/test/campaign-list-formatting.test.mjs`

**Interfaces:**
- Adds `formatCampaignDateTime(value, locale, timeZone)` with seconds and a deterministic “ongoing” result for missing end times.
- Adds `formatTierSummary(tiers, locale)` covering all discount types and returning `数量 折扣类型 优惠数值`; fixed values use the existing campaign domain units and do not invent a currency symbol when the list response has no currency field.
- `toAdminCampaign` exposes `startTime` and `endTime` display values; the table uses separate columns.

- [ ] **Step 1: Write failing formatting tests.** Assert `2026-10-27T12:34:56Z` includes seconds in the selected locale/timezone; missing `endsAt` returns the localized ongoing label; and all six discount types format correctly.

- [ ] **Step 2: Run the focused tests and verify they fail.**

Run: `npm --prefix web run test:prototype -- --test-name-pattern="format|tier|time"`

Expected: FAIL because the current adapter emits date-only `schedule` and `tierSummary` only handles percentage/full price.

- [ ] **Step 3: Implement shared formatters.** Keep numeric discount values in the existing domain units, format percentages as percentages, render fixed values as their configured numeric value, and use translated labels for each discount type.

- [ ] **Step 4: Update list markup.** Rename “排期” to “开始时间”, add “结束时间”, use the formatter for desktop and mobile layouts, and preserve stable table widths at 390px through the existing scroll container.

- [ ] **Step 5: Add translations for every supported admin locale.** Add the new column labels, ongoing label, and discount-type labels without changing storefront translation keys.

- [ ] **Step 6: Run frontend tests, type-check, and build.**

Run: `npm --prefix web run test:prototype -- --test-name-pattern="format|tier|time|admin"`

Run: `npm --prefix web run build`

Expected: PASS and no clipped list text at desktop or mobile widths.

### Task 4: Translation Route Isolation and Error Handling

**Files:**
- Modify: `web/src/pages/quantity-breaks.tsx`
- Modify: `web/src/prototype/Translations.tsx`
- Modify: `web/src/prototype/translations-api.ts`
- Modify: `app/src/controller/store-languages.ts`
- Modify: `app/src/controller/translations.ts`
- Test: `web/test/translation-navigation.test.mjs`
- Test: `web/test/admin-i18n.test.mjs`
- Test: `app/test/translations.test.cjs`

**Interfaces:**
- Navigation changes clear `campaignToPauseBeforeEdit` and any campaign-only modal state.
- Translation rendering depends only on its own `shopId`, language state, and translation API; campaign list failure cannot replace it with the campaign error screen.
- Translation API errors preserve HTTP status and endpoint context for the translation-specific error state.

- [ ] **Step 1: Write failing navigation tests.** Render the workspace with a pending edit modal, navigate to `/quantity-breaks/translations`, and assert the modal is absent. Mock a campaign-list failure and assert the translation page still renders its language-loading/error state.

- [ ] **Step 2: Run focused tests and verify they fail.**

Run: `npm --prefix web run test:prototype -- --test-name-pattern="translation|navigation"`

Expected: FAIL because `campaignToPauseBeforeEdit` survives route changes and the outer page couples loading/error conditions to campaign state.

- [ ] **Step 3: Isolate route state.** Clear campaign-only transient state in the location effect, render translation content before campaign conditions, and give retry controls separate counters for shop identity, campaigns, store languages, and saved copy.

- [ ] **Step 4: Improve translation error classification.** Preserve 401, 400, 502, and invalid-response distinctions in `translations-api.ts`; show “store languages unavailable” for language loading and “saved translation unavailable” for copy loading. Do not display the campaign error text for either path.

- [ ] **Step 5: Add backend trace-safe errors.** Keep upstream credentials out of responses, but include the request ID header and a stable error category in server logs for language verification and translation reads.

- [ ] **Step 6: Run app/frontend tests and builds.**

Run: `npm --prefix app test -- --test-name-pattern="translation|language"`

Run: `npm --prefix web run test:prototype -- --test-name-pattern="translation|navigation|i18n"`

Run: `npm --prefix app run build && npm --prefix web run build`

Expected: PASS; translation navigation is usable even when campaigns fail to load.

### Task 5: Campaign Detail Navigation and Status-Preserving Update

**Files:**
- Modify: `web/src/prototype/navigation.ts`
- Modify: `web/src/pages/quantity-breaks.tsx`
- Modify: `web/src/prototype/CampaignEditor.tsx`
- Modify: `web/src/prototype/campaign-api.ts`
- Modify: `web/src/prototype/campaign-adapter.ts`
- Modify: `web/src/prototype/admin-workspace-messages.ts`
- Modify: `app/src/controller/campaigns.ts`
- Modify: `app/src/service/campaign/repository.ts`
- Modify: `app/src/service/campaign/discount-adapter.ts`
- Modify: `app/src/service/campaign/publish.ts`
- Test: `web/test/campaign-detail-navigation.test.mjs`
- Test: `web/test/editor-structure.test.mjs`
- Test: `app/test/campaign-api.test.cjs`
- Test: `app/test/campaign-discount-adapter.test.cjs`

**Interfaces:**
- Adds read-only `/quantity-breaks/campaigns/:id` and keeps `/edit` as the existing editor route.
- Existing editor submits `{ intent: "update", campaign, expectedRevision }`; create editor alone exposes `Save draft` and `Publish`.
- Existing Draft, Paused, Active, Scheduled, and Ended records retain their stored status after update. Active/Scheduled updates use the same platform discount ID when the deployed adapter is verified for that store/API version.
- The current Express adapter remains a compatibility implementation; no Worker deployment is claimed until `worker/` exists, passes its own route/D1 tests, and is deployed separately.

- [ ] **Step 1: Write failing navigation and editor tests.** Assert clicking a row body opens read-only detail, row action buttons do not navigate, existing editor markup contains only `Update` and `Cancel`, and create editor contains `Save draft` and `Publish`.

- [ ] **Step 2: Run the focused tests and verify they fail.**

Run: `npm --prefix web run test:prototype -- --test-name-pattern="detail|row|Update|Save draft|Publish"`

Expected: FAIL because row names call `openEditor`, no detail route exists, and the editor always renders create actions.

- [ ] **Step 3: Implement detail navigation and editor modes.** Add the detail route/view, make the whole data row keyboard-accessible while stopping propagation from action buttons, parameterize `CampaignEditor` by create/existing mode, and replace the edit primary action with `Update`.

- [ ] **Step 4: Write failing server status-preservation tests.** Assert PUT of Draft, Paused, Active, Scheduled, and Ended records preserves their stored status; assert Active update sends a same-ID update request and never calls pause/delete first; assert stale revisions and platform rejection leave the prior record unchanged.

- [ ] **Step 5: Run the server tests and verify they fail.**

Run: `npm --prefix app test -- --test-name-pattern="status|update|revision|published"`

Expected: FAIL because the controller rejects active/scheduled writes and the frontend currently pauses before editing.

- [ ] **Step 6: Implement status-preserving update transaction.** Derive status from storage, validate the candidate before any platform mutation, retain the platform ID, update the same platform discount through the verified adapter, commit only after confirmation, and mark reconciliation required on uncertain outcomes. Do not use the unverified REST path as a production claim; keep an adapter seam for the target Worker implementation.

- [ ] **Step 7: Run app/frontend tests and builds.**

Run: `npm --prefix app test -- --test-name-pattern="campaign|status|update|revision|published"`

Run: `npm --prefix web run test:prototype -- --test-name-pattern="detail|editor|Update|draft|publish"`

Run: `npm --prefix app run build && npm --prefix web run build`

Expected: PASS; existing activities update in place and preserve state, while only new activities offer draft/publish actions.

### Final Verification and Documentation

- [ ] Run the focused tests from Tasks 1-5, then run `npm --prefix app test`, `npm --prefix web run test:prototype`, `npm run test:theme`, and both production builds.
- [ ] Inspect `git status --short` and every changed/untracked file; leave the user's existing CSS and migration-plan changes intact.
- [ ] Perform authenticated browser checks for selected-product hydration, translation navigation, list timestamps, theme summary, badge placement, and cart refresh. Capture desktop/mobile screenshots before updating `docs/APP_PROGRESS.md`.
- [ ] Update `docs/APP_PROGRESS.md` only with behaviors actually verified; leave real SHOPLINE integration items marked pending when the browser or upstream contract was not confirmed.
- [ ] Run `git diff --check` and prepare the proposed commit message: `fix(quantity-breaks): batch product hydration and align storefront behavior`.
- [ ] Present the complete local change set for user review and ask: `本次代码/文档已在本地更新，是否推送到 GitHub？`
