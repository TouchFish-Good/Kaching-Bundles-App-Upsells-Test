# Campaign Platform State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Make campaign state, subscription revocation, coverage validation, App Bridge confirmation, and SHOPLINE discount deep links consistent and verifiable.

**Architecture:** Keep campaign configuration in D1 and treat the SHOPLINE automatic discount as the platform state authority. Merchant pauses deactivate and retain the same platform ID; entitlement loss deletes the platform object; list/action reconciliation reads known platform IDs before committing local state. Batch activation returns independent structured outcomes so conflicts do not block unrelated campaigns.

**Tech Stack:** Cloudflare Worker/Hono, D1, SHOPLINE Admin GraphQL/REST adapters, React 18, App Bridge, Vite, Node test runner, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-03-campaign-platform-state-design.md`

## Global Constraints

- Preserve the confirmed product-to-product conflict rule and add blocking collection-to-collection conflicts by collection ID.
- Collection-to-product overlap is not checked or blocked.
- Never invent undocumented SHOPLINE fields or webhook topics; verify platform contracts before relying on them.
- Subscription expiry deletes known application discounts; renewal requires explicit in-app republishing.
- Pause confirmation must use App Bridge Cancel/Confirm and must not add or change CSS focus pseudo-class rules.
- Do not modify unrelated existing Worker diagnostics changes or push without explicit approval.

## Review Focus

- A manually paused SHOPLINE discount must reconcile to paused locally before an enable action is chosen.
- A merchant pause must preserve the same platform discount ID and a subscription expiry must clear it only after confirmed deletion.
- A batch with one product or collection conflict must activate every unrelated campaign and report both campaign names plus overlap details.
- The full embedded SHOPLINE path `/admin/apps/{appKey}/product-discount-customizations/{functionId}/{discountId}` must load the app entry and preserve embedded query context.
- An unknown or deleted platform discount must show a controlled reconciliation state, never a false active state or generic 404.

---

### Task 1: Platform State Adapter and Publication Persistence

**Files:**
- Modify: `worker/src/services/discounts.ts`
- Modify: `worker/src/db/campaigns.ts`
- Modify: `worker/src/domain/campaign.ts`
- Create: `worker/migrations/0011_campaign_platform_state.sql`
- Test: `worker/test/discount-publication.test.ts`
- Test: `worker/test/campaign-repository.test.ts`

**Interfaces:**
- Produce `readAutomaticDiscountState`, `activateAutomaticDiscount`, `deactivateAutomaticDiscount`, and confirmed-delete behavior for route and subscription tasks.
- Produce publication states that preserve `discountId` for merchant pauses and distinguish `entitlement_revoked`/`missing`/`needs_reconciliation`.

- [ ] Write failing tests for platform read-back, activate/deactivate using one ID, delete idempotency, and publication ID retention through pause.
- [ ] Run the focused Worker tests and observe failures against the current delete-only adapter and state model.
- [ ] Implement the smallest adapter using the documented SHOPLINE contract and version already validated for this repository; keep create/update compatibility and remove the future unverified deletion version.
- [ ] Add the migration and repository transitions without changing unrelated campaign JSON or diagnostics records.
- [ ] Run the focused tests and verify all new assertions pass.

### Task 2: Campaign Routes, Reconciliation, Subscription Revocation, and Batch Outcomes

**Files:**
- Modify: `worker/src/routes/campaigns.ts`
- Modify: `worker/src/jobs/subscription-operations.ts`
- Modify: `worker/src/db/campaigns.ts`
- Modify: `worker/src/domain/campaign.ts`
- Create or modify: `worker/src/services/campaign-coverage.ts`
- Test: `worker/test/routes-contract.test.ts`
- Test: `worker/test/campaign-repository.test.ts`
- Test: `worker/test/subscription-webhook-backfill.test.ts`

**Interfaces:**
- Consume Task 1 platform adapter and publication transitions.
- Produce per-campaign activation results with `activated`, `already_active`, `conflict`, `unverified`, and `failed` outcomes.

- [ ] Write failing route tests for external state reconciliation, same-ID activation, collection-ID conflicts, product conflicts, collection/product non-conflicts, and partial batch success.
- [ ] Write failing subscription tests for confirmed deletion, 404 idempotency, retry on uncertainty, and renewal not auto-republishing.
- [ ] Run focused tests and verify they fail for the current generic conflict errors, delete-to-idle behavior, and all-or-nothing batch loop.
- [ ] Implement server-side coverage resolution: product/product compares product IDs; collection/collection compares collection IDs and names; collection/product returns no conflict; collection membership expansion remains only for Function publication.
- [ ] Reconcile known platform IDs before reads and writes; preserve last confirmed state on upstream failure.
- [ ] Implement independent batch results under the shop lock and update subscription expiry to delete and mark entitlement revocation only after confirmed completion.
- [ ] Run route, repository, and subscription tests and verify all focused assertions pass.

### Task 3: App Bridge Confirmation and Batch Feedback

**Files:**
- Modify: `web/src/pages/quantity-breaks.tsx`
- Modify: `web/src/prototype/BridgeConfirmation.tsx`
- Modify: `web/src/prototype/campaign-api.ts`
- Modify: `web/src/prototype/admin-workspace-messages.ts`
- Test: `web/test/campaign-api.test.mjs`
- Test: `web/test/campaign-list-actions.test.mjs`

**Interfaces:**
- Consume Task 2 structured status and batch responses.
- Produce Cancel/Confirm pause behavior and truthful per-outcome activation feedback.

- [ ] Write failing tests proving pause Cancel sends no request, Confirm sends one request, and batch activation continues after a conflict.
- [ ] Run the focused frontend tests and observe the current unconditional success count and direct toggle behavior.
- [ ] Implement App Bridge confirmation for single and batch pauses, disabling duplicate submissions while waiting.
- [ ] Replace client-side loop success counting with structured server outcomes and localized conflict messages naming both campaigns plus overlap products/categories.
- [ ] Run focused frontend tests and verify the UI reports only platform-confirmed successes.

### Task 4: Embedded SHOPLINE Deep-Link Entry and Editor Resolution

**Files:**
- Modify: `web/src/entry-route.ts`
- Modify: `web/src/index.tsx`
- Modify: `web/src/prototype/navigation.ts`
- Modify: `web/src/pages/quantity-breaks.tsx`
- Modify: `web/src/prototype/admin-workspace-messages.ts`
- Test: `web/test/workspace-navigation.test.mjs`
- Test: `web/test/home-entry.test.mjs`

**Interfaces:**
- Consume the existing platform discount ID mapping from campaign list responses.
- Produce a routed Quantity Breaks entry for both `/product-discount-customizations/{functionId}/{discountId}` and `/admin/apps/{appKey}/product-discount-customizations/{functionId}/{discountId}`.

- [x] Write failing tests for the exact full SHOPLINE path, short path compatibility, query preservation, and unknown platform ID state.
- [x] Run navigation and entry tests and observe the full path currently selecting the generic 404 router.
- [x] Add a precise path parser and entry predicate; load the Quantity Breaks page before the generic router handles the path.
- [x] Preserve search/hash context during internal replacement and render a controlled unmanaged-discount message when no local mapping exists.
- [x] Run focused navigation tests and verify both route forms resolve.

### Task 5: Documentation, Visual QA, and Full Verification

**Files:**
- Modify: `docs/REQUIREMENTS.md`
- Modify: `docs/USER_FLOWS.md`
- Modify: `docs/APP_PROGRESS.md`
- Test/build artifacts remain outside the repository.

- [ ] Update the confirmed collection conflict matrix, subscription deletion rule, and automatic coverage-check behavior.
- [ ] Run Worker type checking, focused and full tests, frontend production build, and `git diff --check`.
- [ ] Start the local frontend and verify the exact deep-link entry and campaign list at desktop and mobile sizes; capture screenshots outside the repository.
- [ ] Record only behavior actually executed in `APP_PROGRESS.md`, including any unavailable embedded SHOPLINE verification.
- [ ] Inspect git status, all diffs, untracked files, and secrets; present the complete local change set and proposed commit message without pushing.
