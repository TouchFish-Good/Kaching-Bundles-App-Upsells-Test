# Native Subscription Gating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the app show its paid Ultra subscription page only when the current SHOPLINE entitlement is not a valid trial, paid Ultra subscription, or grace-period entitlement, while keeping valid merchants in the app.

**Architecture:** The Worker performs an application-scoped `list + detail` reconciliation on the authenticated subscription read, stores the resulting entitlement projection, and exposes a `planPageRequired` decision. The React shell uses that decision and the existing `SUBSCRIPTION_REQUIRED` redirect, while the plan page offers only an explicit paid checkout action. Existing webhook, queue, fail-closed theme, and expiry behavior remains unchanged.

**Tech Stack:** Cloudflare Worker/Hono, D1, TypeScript, React, Vite, Node test runner, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-30-shopline-native-subscription-design.md`

## Global Constraints

- Partner subscription endpoints use `v20260901`.
- Trial activation is owned by SHOPLINE's native subscription page; no `intent=trial` or local trial CTA is sent.
- Only a matching `quantity_breaks_access` feature key grants access.
- `unknown`, `review_pending`, `inactive`, other packages, and missing required features require the paid plan page.
- Do not add or modify `:focus` or `:focus-visible` CSS rules.
- Preserve tenant isolation and existing expiry/pause queue behavior.

## Review Focus

- A valid Ultra trial, paid Ultra, or unexpired grace entitlement must not redirect to the plan page.
- An active subscription for another package must not retain stale Ultra access.
- A successful subscription read must reconcile from Partner `list + detail`, while Partner failures preserve the last confirmed state.
- The plan page must never expose a trial button or send `intent=trial`.
- A direct visit to the plan page with valid access must return to the main app without starting checkout.

### Task 1: Subscription service and route projection

**Files:**
- Modify: `worker/src/services/subscriptions.ts`
- Modify: `worker/src/services/entitlements.ts`
- Modify: `worker/src/routes/subscription.ts`
- Test: `worker/test/subscriptions-service.test.ts`
- Test: `worker/test/subscription-routes.test.ts`

- [ ] Add failing tests for the `v20260901` Partner paths and for a GET subscription read that reconciles an Ultra entitlement from `list + detail`.
- [ ] Add failing tests for an active non-Ultra package and an Ultra detail missing `quantity_breaks_access`; both must return `planPageRequired: true` and `access: false`.
- [ ] Implement the version and documented field normalization, then reconcile before projecting the response; retain the cached entitlement if Partner is unavailable.
- [ ] Return `planPageRequired` and remove trial eligibility as a decision input.
- [ ] Run the focused Worker tests and then the full Worker test suite.

### Task 2: Paid-only checkout API

**Files:**
- Modify: `worker/src/routes/subscription.ts`
- Modify: `web/src/prototype/subscription-api.ts`
- Test: `worker/test/subscription-routes.test.ts`
- Test: `web/test/subscription-api.test.mjs`

- [ ] Add a failing test proving `{ intent: "trial" }` is rejected and no Partner payment call is made.
- [ ] Implement a subscribe-only checkout contract while preserving explicit click-to-checkout behavior and safe request IDs.
- [ ] Run focused API tests.

### Task 3: Plan page and app routing

**Files:**
- Modify: `web/src/pages/quantity-breaks/plan.tsx`
- Modify: `web/test/subscription-plan.test.mjs`

- [ ] Add failing tests for no trial CTA, paid checkout only, and redirecting valid access away from `/quantity-breaks/plan`.
- [ ] Remove trial UI and intent payload; keep loading, failure, review-pending, grace/inactive messaging and localized app plan content.
- [ ] Use `planPageRequired`/`access` to keep valid merchants in the workspace and clear stale campaign data before redirecting invalid access.
- [ ] Run the full frontend test suite and production build.

### Task 4: Documentation and verification

**Files:**
- Modify: `docs/superpowers/specs/2026-10-30-shopline-native-subscription-design.md`
- Modify: `docs/APP_PROGRESS.md`

- [ ] Remove the contradictory rule that retires `/quantity-breaks/plan`; document it as a paid-only page.
- [ ] Record only locally executed verification results.
- [ ] Run `git diff --check`, Worker typecheck, full Worker tests, frontend tests, frontend build, and secret/unrelated-file checks.
