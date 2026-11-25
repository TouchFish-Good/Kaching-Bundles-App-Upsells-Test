# Subscription Entitlements Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete the SHOPLINE subscription entitlement lifecycle for Quantity Breaks, including checkout, plan routing, fail-closed API/UI access, webhook reconciliation, expiry pausing, daily reconciliation, and release verification.

**Architecture:** Keep the Worker as the authority for subscription state. D1 stores entitlements, checkout orders, webhook idempotency, and durable operations; Partner API reads are normalized by the existing subscription client. The React admin consumes a single subscription gate and routes every denied API response to `/quantity-breaks/plan`; public theme endpoints never expose campaigns unless the entitlement is active/trial/grace and verified.

**Tech Stack:** Cloudflare Workers, Hono, D1, TypeScript, Vitest, React 18, React Router 6, Vite, i18next, SHOPLINE Partner/Admin APIs.

**Spec:** `docs/REQUIREMENTS.md`, `docs/USER_FLOWS.md`, `docs/DESIGN_SPEC.md`, `docs/COMPONENTS.md`, and the requested nine-step implementation sequence.

## Global Constraints

- Preserve the confirmed Quantity Breaks rules and do not invent SHOPLINE API capabilities.
- `unknown`, `review_pending`, and `inactive` never grant access; public theme routes fail closed.
- All monetary calculations remain integer/minor-unit based; subscription SKU selection is exactly one Ultra USD 30-day SKU.
- All 11 application locales must have non-empty plan-page copy.
- No production code is added without a failing test first.
- Do not push or deploy without explicit user approval; local verification may proceed.

## Review Focus

- Duplicate or out-of-order subscription webhooks must be idempotent and must not regress a newer entitlement.
- A forged signature, wrong app key, or cross-shop event must not mutate another shop.
- Partner API timeout/malformed JSON must preserve fail-closed access and enter bounded backoff instead of infinite retry.
- A 403 from any authenticated API must clear stale UI data before routing to the plan page.
- Theme scripts must remove stale DOM for every non-200, invalid JSON, no-campaign, or non-entitled response.

### Task 1: Subscription read, checkout, callback, and order persistence

**Files:**
- Create/modify: `worker/src/routes/subscription.ts`, `worker/src/services/subscriptions.ts`, `worker/src/db/subscriptions.ts`, `worker/src/index.ts`
- Test: `worker/test/subscription-routes.test.ts`, `worker/test/subscriptions-service.test.ts`

- [ ] Write failing route tests for `GET /api/quantity-breaks/subscription`, `POST /api/quantity-breaks/subscription/checkout`, and the payment callback status path.
- [ ] Implement authenticated subscription projection, exact Ultra SKU selection, unique order number persistence, Partner `create_pay`, status lookup, and reconcile enqueue.
- [ ] Verify route tests and existing subscription client tests.

### Task 2: Admin plan page and unified frontend access gate

**Files:**
- Create: `web/src/pages/quantity-breaks/plan.tsx`, `web/src/prototype/subscription-api.ts`, `web/src/prototype/subscription-gate.tsx`
- Modify: `web/src/Routes.tsx`, `web/src/index.tsx`, authenticated API callers, `web/src/locales/*.json`, `web/test/*.test.mjs`

- [ ] Write failing tests for plan states, checkout redirect only after CTA, callback/review-pending/grace messaging, and 403 redirect with stale data clearing.
- [ ] Implement the plan route, 11-locale copy, centralized fetch wrapper, and route-level access guard.
- [ ] Render and inspect desktop/mobile plan page; update `docs/APP_PROGRESS.md` with only observed verification.

### Task 3: Complete server-side guards and public theme fail-closed behavior

**Files:**
- Modify: `worker/src/routes/catalog.ts`, `worker/src/routes/translations.ts`, `worker/src/routes/campaigns.ts`, `worker/src/routes/storefront.ts`, `app/src/controller/storefront-campaign.ts`
- Test: `worker/test/routes-contract.test.ts`, `app/test/storefront-campaign.test.cjs`, `web/test/storefront*.test.mjs`

- [ ] Add failing tests covering every catalog, collection, component-style, translation, campaign, and publish write endpoint.
- [ ] Apply the shared subscription guard only to writes, preserving health, OAuth, plan, checkout, callback, webhook, and static assets.
- [ ] Make public endpoints return no activity for missing/unknown/review_pending/inactive entitlements and make theme scripts clear/hide on all invalid responses.

### Task 4: Reconciliation worker, webhook ordering, and expiry pause executor

**Files:**
- Create/modify: `worker/src/jobs/subscription-reconciliation.ts`, `worker/src/jobs/subscription-operations.ts`, `worker/src/services/entitlements.ts`, `worker/src/services/discounts.ts`, `worker/src/db/subscriptions.ts`, `worker/src/index.ts`
- Test: `worker/test/subscription-reconciliation.test.ts`, `worker/test/subscription-operations.test.ts`, `worker/test/webhook.test.ts`

- [ ] Write failing tests for valid/forged/duplicate/乱序/cross-shop events, Partner list/detail reconciliation, bounded retry, and two-confirmation expiry pausing.
- [ ] Implement queue consumption, per-shop isolation, platform discount deletion, local campaign pause with `subscription_expired`, and stale-task cancellation after renewal without auto-republish.
- [ ] Wire `appsubscription/create`, `expiration`, and `paid` to reconcile-only operations.

### Task 5: Daily cron and release verification

**Files:**
- Modify: `worker/src/index.ts`, `worker/src/jobs/subscription-reconciliation.ts`, `worker/wrangler.toml`, `docs/APP_PROGRESS.md`
- Test: `worker/test/daily-reconciliation.test.ts`, migration/type/build suites

- [ ] Write failing cron tests for active/grace/review_pending shops and pending operations, proving one-shop failure does not block others.
- [ ] Implement bounded per-shop reconciliation and operation processing in `scheduled`.
- [ ] Run Worker tests/typecheck/build, frontend tests/build, theme tests, `git diff --check`, and secret scan. Execute remote migration/deploy and SHOPLINE dev-store validation only after explicit approval.
