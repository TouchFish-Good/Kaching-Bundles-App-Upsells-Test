# Full App Replication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the SHOPLINE application as a set of independently verifiable merchant workflows informed by the observed Kaching Bundles reference, without claiming unverified platform parity.

**Architecture:** Keep React/TypeScript as the embedded admin and storefront preview. Add URL-backed admin modules, a persisted campaign service and validated domain model, then implement the Product Discount Function and theme widget against confirmed SHOPLINE contracts. Each non-Quantity-Breaks template is a separate product/technical subproject; billing and third-party app promotion require SHOPLINE-specific decisions.

**Tech Stack:** Existing Vite/React/TypeScript app, Express backend, Go Function template, SHOPLINE theme extension, existing Node tests; use repository package scripts.

**Spec:** `docs/APP_PAGE_INVENTORY.md`, `APP_FUNCTION_INVENTORY.md`, `APP_VISUAL_REFERENCE.md`, `APP_GAP_ANALYSIS.md`, `REQUIREMENTS.md`, `DESIGN_SPEC.md`, `USER_FLOWS.md`, `COMPONENTS.md`, `SHOPLINE_API_RESEARCH.md`.

## Global Constraints

- Phase-one Quantity Breaks rules remain authoritative until an explicit product change is recorded; other templates are expanded scope, not inferred implementation details.
- Never mutate Shopify reference data, billing or installs during discovery. Never call real SHOPLINE stores without the relevant connection/approval.
- Product discounts do not stack with other product discounts. Market-specific presentment discounts obey the documented exclusive rule.
- Same-Product mixed-Variant quantities may aggregate; different Products do not mix under the current Quantity Breaks rule.
- All page states use `NOT_STARTED`, `IN_PROGRESS`, `IMPLEMENTED`, `VERIFIED`, `BLOCKED`; `VERIFIED` needs screenshot, interaction, tests and no known P0/P1 gap.
- No Git push without explicit approval for the reviewed change set; no force push.

## Review Focus

- Refreshing a nested admin URL must preserve the intended page and avoid losing a merchant's unsaved changes silently.
- A conflict between two scheduled/active product scopes must block publishing even when collections change membership.
- A repeated Variant must be aggregated for inventory and cart input but must retain its independent shopper selections.
- Fixed amounts across markets, different Variant prices and currency minor units must not use floating-point arithmetic.
- Loading, empty, error and disabled states must remain usable on 360px mobile and with long translations.

## Sequence and File Boundaries

### Task 1: URL-backed shared shell and navigation

**Files:** Modify `web/src/pages/quantity-breaks.tsx`, `web/src/Routes.tsx` as needed; create route adapters under `web/src/pages/quantity-breaks/`; test under `web/test/`; update `APP_PAGE_INVENTORY.md`, `APP_PROGRESS.md`.

**Interfaces:** Consume existing `WorkspacePage`, `Dashboard`, `CampaignEditor`, `WidgetStudio`, `Translations`. Produce stable `/quantity-breaks`, `/quantity-breaks/new`, `/quantity-breaks/:id/edit`, `/quantity-breaks/widget`, `/quantity-breaks/translations` (exact route syntax to be checked against file-router rules).

- [x] Add failing navigation tests for direct URL and active item; browser-check back/forward and refresh.
- [x] Run them to confirm failure, implement minimal URL-backed navigation, and rerun.
- [x] Compare Shopify and local edit screenshots at 1037x929; fix shared shell's dark sidebar/purple CTA gap. Check local 390x844; Shopify admin mobile remains unverified.
- [x] Browser-check direct edit, create/publish, mobile navigation and conflict-blocked activation; build and update progress. Search/delete regression remains covered only by the prior visual report, not repeated in this batch.

### Task 2: Quantity Breaks complete admin flow

**Files:** Split only the touched editor sections from `web/src/pages/quantity-breaks.tsx` into focused components; update CSS/tokens, `web/test/`, and the visual reports.

**Interfaces:** Validated `CampaignDraft` with scope, schedule, price modes, per-tier copy, default tier, market/combination intent and widget settings.

- [ ] Add failing tests for all required fields, every price mode, duplicate/invalid quantities, schedule and active-scope collision.
- [ ] Implement create/edit sections and live preview against the validated draft, then test.
- [ ] Compare each reference accordion and local state at the same viewport; verify keyboard, mobile and regression.

### Task 3: Campaign persistence and SHOPLINE contracts

**Files:** Create `app/src/controller/campaign/*`, `app/src/service/campaign/*`, database migration/model as chosen after repository/runtime audit; add backend tests; update `SHOPLINE_API_RESEARCH.md`.

**Interfaces:** Authenticated list/create/get/update/pause/delete. Use idempotent published-discount linkage. SHOPLINE API field names only after official schema confirmation.

- [ ] Write failing request/service tests for CRUD, authorization, validation, scope conflict and rollback.
- [ ] Implement database storage and route handlers. Verify no mock data is treated as persisted.
- [ ] Confirm official SHOPLINE discount creation, combination and market contracts; add contract tests before integration.

### Task 4: Discount Function and theme widget

**Files:** `product-discount-customizations/main.go`, `input.graphql`, `schema.gql` only after verified contract; `theme-app-extension/blocks/*`, `public/*`; Go/unit and browser tests.

**Interfaces:** Campaign rules to Function config; cart lines grouped by Product; per-line targets with Variant-sensitive amount; atomic add payload of merged Variant IDs.

- [ ] Write failing unit tests for 1/2/3/4/5 quantities, mixed Variant prices, currency precision, sold-out and exclusions.
- [ ] Implement Function output and storefront selection using verified SHOPLINE fields only.
- [ ] Test actual cart and checkout in a nonproduction store, including discount coexistence; preserve frontend estimate vs checkout authority distinction.

### Task 5: Translation and settings workflow

**Files:** `web/src/locales/*`, translation UI/module, persistence service and tests; `docs/APP_*` status updates.

**Interfaces:** 11 supported locales, exact-locale fallback, independent admin-language selector and campaign storefront copy. Settings require a verified notification source.

- [ ] Write failing locale/fallback, dirty-state and settings persistence tests.
- [ ] Implement reference-aligned translation table and settings UI; verify long text and responsive layout.
- [ ] Compare reference/local screenshots and exercise save/error states.

### Task 6: Analytics

**Files:** New analytics route/components, event and aggregation service, CSV export and tests.

**Interfaces:** Explicit attribution and denominators for revenue, conversion, visitor and order metrics; campaign/date filters.

- [ ] Define metric contract from actual SHOPLINE data availability; block unprovable metrics instead of inventing them.
- [ ] Write failing aggregation/filter/CSV tests, then implement and verify empty/loading/error states.
- [ ] Compare visual and interaction states with reference at matching viewports.

### Task 7: Additional offer templates, one independently testable template at a time

**Files:** Separate domain, admin, Function/theme changes and tests per BXGY, mixed-product quantity, complete bundle, subscription and tiered gifts.

- [ ] Safely inspect each reference form and verify the corresponding SHOPLINE platform capability.
- [ ] Write a product specification and precise contract/tests for that template.
- [ ] Implement one complete merchant-to-checkout path, visually verify, regress Quantity Breaks, then mark only that template's page status.

### Task 8: Roadmap, billing and other-apps surfaces

**Files:** New routes and services only after data ownership and SHOPLINE billing decisions.

- [ ] Define owned roadmap/feedback service and test voting/state behavior.
- [ ] Validate SHOPLINE billing mechanism before adding plan activation; never wire Shopify billing URLs.
- [ ] Add only owned companion apps, not Kaching's directory; test navigation and external-link safety.

### Task 9: Full application regression and release gate

- [ ] Enumerate every inventory row and run direct-route, navigation, empty/loading/error, form, API and responsive tests.
- [ ] Run calculation and real test-store cart/checkout scenarios; record screenshot pairs and unresolved visual gaps.
- [ ] Run production build and automated suite. Update every page status from evidence; report blocked functions explicitly.
- [ ] Review diff including untracked files, proposed commit/target branch and obtain explicit push approval.

## Execution Rule

Execute tasks in order, one independently testable module at a time. The five non-Quantity-Breaks templates are separate specs by Superpowers scope guidance. User's current instruction authorizes continuing locally after each page; it does not authorize live reference mutations, platform guesses or Git push.
