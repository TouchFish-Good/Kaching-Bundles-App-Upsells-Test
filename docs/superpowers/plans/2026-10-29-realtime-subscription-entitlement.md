# Real-Time Subscription Entitlement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make successful SHOPLINE subscription payments, including 0-value partner discount-code payments, grant the `quantity_breaks_access` entitlement within seconds without waiting for the daily Cron.

**Architecture:** Keep D1 operations as the idempotent source of work. Payment callbacks and subscription Webhooks enqueue one shop-scoped reconcile operation and use `executionCtx.waitUntil` to process due work immediately after returning the HTTP response. Partner eventual consistency remains `review_pending` with bounded short retries; the daily Cron remains the recovery and reconciliation path.

**Tech Stack:** Cloudflare Worker, Hono, D1, TypeScript, Vitest, React, Vite, Node test runner.

**Spec:** `docs/superpowers/specs/2026-10-29-realtime-subscription-entitlement-design.md`

## Global Constraints

- Use `(SHOPLINE_APP_KEY, handle)` for every entitlement, order, operation, and Partner lookup tenant boundary.
- Grant access only for an active `ultra` subscription whose detail contains the exact feature key `quantity_breaks_access`.
- Do not invent SHOPLINE Partner request or response fields; reuse the existing `sub_ids`, `list`, and `detail` shapes already implemented.
- Keep the daily `0 3 * * *` Cron as recovery and daily reconciliation; it is not the normal successful-payment path.
- Preserve fail-closed behavior for `unknown`, `review_pending`, and `inactive` entitlements.
- Do not add or modify CSS `:focus`, `:focus-visible`, or related focus pseudo-class rules.
- Do not add Cloudflare Queue resources in this plan; use `waitUntil` plus D1 retries.
- Every production behavior change must have a failing automated test before implementation code is written.

## Review Focus

- A 0-value payment with a subscription ID must follow the same entitlement path as a paid amount; regression test in Task 3.
- Partner list eventual consistency must not turn a paid store into terminal `unknown`; regression test in Task 2.
- A valid subscription missing `quantity_breaks_access` must remain fail-closed; regression test in Task 2.
- Duplicate, reversed, and cross-store Webhooks must remain idempotent and isolated while immediate processing runs; regression test in Task 3.
- The plan page must stop polling on unmount and must not fall back to a purchase CTA during a 30-second verification window; regression tests in Task 4.

### Task 1: Add D1 operation helpers for immediate, bounded reconciliation

**Files:**
- Modify: `worker/src/db/subscriptions.ts`
- Test: `worker/test/subscription-repository.test.ts`

**Interfaces:**
- Consumes: Existing `SubscriptionOperation`, `enqueueOperationOnce`, `claimDueOperations`, and `retryOperation` APIs.
- Produces: `enqueueReconcileOnce(input: { appKey: string; handle: string; operationKey: string; nextAttemptAt: number }): Promise<boolean>` as a small named wrapper, plus an operation retry policy that makes the three-attempt limit observable to callers.

- [ ] **Step 1: Write the failing tests**

Add repository tests that assert the named reconcile wrapper creates one operation for the same key, a second call is a no-op, and `retryOperation` transitions attempts 1 and 2 to `retrying` but attempt 3 to `failed`.

```ts
it('enqueues one immediate reconcile operation per payment event', async () => {
  const input = { appKey: 'app-a', handle: 'shop-a', operationKey: 'payment:trade-1', nextAttemptAt: 1_700_000_000_000 };
  await expect(repository.enqueueReconcileOnce(input)).resolves.toBe(true);
  await expect(repository.enqueueReconcileOnce(input)).resolves.toBe(false);
  await expect(repository.pendingOperationShops('app-a')).resolves.toEqual(['shop-a']);
});

it('moves a reconcile operation to failed after the third attempt', async () => {
  const operationKey = 'payment:trade-retry';
  await repository.enqueueReconcileOnce({ appKey: 'app-a', handle: 'shop-a', operationKey, nextAttemptAt: 1 });
  for (const attempt of [1, 2, 3]) {
    const due = await repository.claimDueOperations(1_700_000_000_000, 1);
    expect(due[0]?.attempts).toBe(attempt);
    await repository.retryOperation(operationKey, 1, `failure-${attempt}`);
  }
  await expect(testEnv.DB.prepare('SELECT state FROM quantity_breaks_subscription_operations WHERE operation_key = ?').bind(operationKey).first<{ state: string }>()).resolves.toEqual({ state: 'failed' });
});
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `npm test -- --run test/subscription-repository.test.ts`

Expected: FAIL because `enqueueReconcileOnce` does not exist and the test cannot call the new operation contract.

- [ ] **Step 3: Implement the minimal repository wrapper**

Add `enqueueReconcileOnce` as a typed wrapper around `enqueueOperationOnce` with `entitlementVersion: 0`, `kind: 'reconcile'`, `campaignId: null`, and the caller-provided operation key and timestamp. Keep the existing SQL uniqueness and retry terminal rule unchanged unless the failing test demonstrates a mismatch.

- [ ] **Step 4: Run the focused tests and the repository suite**

Run: `npm test -- --run test/subscription-repository.test.ts`

Expected: PASS for the new tests and all existing repository tests.

- [ ] **Step 5: Commit the isolated repository change**

```bash
git add worker/src/db/subscriptions.ts worker/test/subscription-repository.test.ts
git commit -m "feat: add immediate subscription reconcile operations"
```

### Task 2: Make entitlement reconciliation distinguish pending visibility from absence

**Files:**
- Modify: `worker/src/services/entitlements.ts`
- Modify: `worker/src/db/subscriptions.ts` only if the operation state query needs a narrow helper from Task 1
- Test: `worker/test/entitlements.test.ts`

**Interfaces:**
- Consumes: `PartnerSubscriptionReader.listSubscriptions`, including `subIds`, and `getSubscriptionDetail`.
- Produces: `reconcileEntitlement(input: { appKey: string; handle: string; subscriptionId?: string | null; sourceEventId?: string; paymentPending?: boolean })`, preserving the existing call shape for Cron callers.

- [ ] **Step 1: Write the failing tests**

Add tests for three outcomes: a payment hint scopes the list call to `sub_ids`; an empty/temporarily invisible payment result writes `review_pending` and creates a retry operation; a subscription without the required feature key never grants access.

```ts
it('keeps a paid store review_pending when Partner has not exposed the subscription yet', async () => {
  let requestedSubIds: string[] | undefined;
  const service = new EntitlementService(repository, {
    listSubscriptions: async ({ subIds }) => { requestedSubIds = subIds; return { subscriptions: [], lastPage: true }; },
    getSubscriptionDetail: async () => ({ featureKeys: [] }),
  }, () => now);
  await service.reconcileEntitlement({ appKey: 'app-a', handle: 'shop-a', subscriptionId: 'sub-paid', paymentPending: true, sourceEventId: 'payment:trade-1' });
  expect(requestedSubIds).toEqual(['sub-paid']);
  await expect(repository.readEntitlement('app-a', 'shop-a')).resolves.toMatchObject({ state: 'review_pending', featureKeys: [] });
  await expect(repository.pendingOperationShops('app-a')).resolves.toEqual(['shop-a']);
});

it('does not grant access when the active Ultra subscription lacks the required feature key', async () => {
  const service = client([{ subId: 'sub-no-feature', status: 'active', spuKey: 'ultra', type: 'paid', handle: 'shop-a', startAt: now, endAt: now + 30_000, autoRecurring: true, isTrial: false }], { featureKeys: [] });
  await service.reconcileEntitlement({ appKey: 'app-a', handle: 'shop-a' });
  await expect(repository.readEntitlement('app-a', 'shop-a')).resolves.toMatchObject({ state: 'unknown', featureKeys: [] });
});
```

The test helper must record the `subIds` argument and return a normal active subscription when the hint is present, so the test observes the real reader contract rather than only asserting a mock call count.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `npm test -- --run test/entitlements.test.ts`

Expected: FAIL because the service currently treats an empty payment list as terminal absence and has no payment hint or pending state behavior.

- [ ] **Step 3: Implement the minimal reconciliation changes**

When `paymentPending` is true, query `listSubscriptions` with `subIds: [subscriptionId]` when a subscription ID exists. If no active candidate is visible, write or retain `review_pending` and enqueue a retry operation with the next short-backoff timestamp. Do not use this pending branch for the normal daily Cron absence path. Keep the existing feature-key and `ultra` checks unchanged.

- [ ] **Step 4: Run entitlement tests and verify no fail-closed regression**

Run: `npm test -- --run test/entitlements.test.ts test/subscription-access.test.ts`

Expected: PASS; `trial`, `active`, and valid `grace` still grant access, while `unknown`, `review_pending`, expired, and missing-feature states remain denied.

- [ ] **Step 5: Commit the entitlement change**

```bash
git add worker/src/services/entitlements.ts worker/test/entitlements.test.ts worker/src/db/subscriptions.ts
git commit -m "fix: retain pending subscription reconciliation state"
```

### Task 3: Execute payment and Webhook reconciliation immediately

**Files:**
- Modify: `worker/src/routes/subscription.ts`
- Modify: `worker/src/index.ts`
- Modify: `worker/src/jobs/subscription-operations.ts` only if a single-shop execution helper is required
- Test: `worker/test/subscription-routes.test.ts`
- Test: `worker/test/webhook.test.ts`

**Interfaces:**
- Consumes: Task 1 repository helper and Task 2 `subscriptionId`/`paymentPending` reconciliation contract.
- Produces: A private `runImmediateSubscriptionOperations(env: Env, now?: number): Promise<void>` helper that is safe to call through `ExecutionContext.waitUntil` from both the callback and Webhook handlers.

- [ ] **Step 1: Write failing callback tests**

Extend the callback test to use an execution context whose `waitUntil` promise is captured. Assert that a successful charge with status `paid`, including a zero-value-compatible status payload, enqueues a reconcile operation and schedules immediate processing. Assert that the callback still returns a redirect without waiting for the Partner detail call.

```ts
it('schedules immediate reconciliation after a successful payment callback', async () => {
  const waits: Promise<unknown>[] = [];
  const execution = { waitUntil(promise: Promise<unknown>) { waits.push(promise); } } as ExecutionContext;
  const response = await worker.fetch(callbackRequest, testEnv, execution);
  expect(response.status).toBe(303);
  expect(waits).toHaveLength(1);
  await Promise.all(waits);
  await expect(repository.readEntitlement(testEnv.SHOPLINE_APP_KEY, 'subscription-shop')).resolves.toMatchObject({ state: 'active', featureKeys: ['quantity_breaks_access'] });
});
```

- [ ] **Step 2: Write failing Webhook tests**

Update the subscription Webhook test to capture `waitUntil`, assert that the first valid paid event schedules immediate reconciliation, and retain assertions for duplicate event suppression, reversed status protection, and cross-store order isolation.

- [ ] **Step 3: Run the focused tests and verify they fail**

Run: `npm test -- --run test/subscription-routes.test.ts test/webhook.test.ts`

Expected: FAIL because the current handlers only enqueue operations and never call `waitUntil`.

- [ ] **Step 4: Implement immediate processing**

After enqueueing a payment reconcile operation, pass `processSubscriptionOperations(c.env)` to `c.executionCtx.waitUntil`, catching only to preserve the operation’s retry state and avoid changing the already-successful payment response. Apply the same pattern after the Webhook handler has passed all signature, app, shop, and duplicate checks. Pass the `subscriptionId` and `paymentPending` context into the operation’s reconciliation input without changing public API payloads.

- [ ] **Step 5: Run the focused tests and the full Worker suite**

Run: `npm test -- --run test/subscription-routes.test.ts test/webhook.test.ts` and then `npm test`.

Expected: Focused tests pass, followed by the complete Worker suite with no new failures. Existing test warnings from the local Cloudflare runtime must be reported if they remain.

- [ ] **Step 6: Commit the Worker real-time path**

```bash
git add worker/src/routes/subscription.ts worker/src/index.ts worker/src/jobs/subscription-operations.ts worker/test/subscription-routes.test.ts worker/test/webhook.test.ts
git commit -m "feat: reconcile subscription payments immediately"
```

### Task 4: Poll the plan page while payment verification is pending

**Files:**
- Modify: `web/src/pages/quantity-breaks/plan.tsx`
- Test: `web/test/subscription-plan.test.mjs` (create if absent)
- Modify: `docs/APP_PROGRESS.md` with the verified implementation status and test evidence

**Interfaces:**
- Consumes: Existing `readSubscription(fetcher)` response states and `payment=review_pending` URL flag.
- Produces: A cancellable 2-second polling loop with a 30-second deadline that updates the existing subscription state without changing API response shapes.

- [ ] **Step 1: Write failing frontend tests**

Add a plan-page test with a fake timer and a fetcher returning `review_pending` twice then `active`; assert the page stops showing the checking message and renders the subscribed message. Add a second test that unmounts before the timer fires and asserts no further fetch is started and no state update warning is emitted.

```js
test('polls review_pending until the entitlement becomes active', async () => {
  // Render with payment=review_pending and return review_pending, review_pending, active.
  // Advance the fake clock by two 2000ms intervals.
  // Assert the localized active message is present and the checking message is absent.
});
```

- [ ] **Step 2: Run the focused frontend test and verify it fails**

Run: `npm run test:prototype -- test/subscription-plan.test.mjs`

Expected: FAIL because the current page reads the subscription only once and has no timer cleanup.

- [ ] **Step 3: Implement the cancellable polling loop**

Use an effect keyed by `paymentState` and `fetcher`; create one `AbortController`/cancel flag and one interval or recursive timeout. Stop on `trial`, `active`, or `grace`; stop at 30 seconds; clear the timer and cancel pending work in the effect cleanup. Keep `review_pending` fail-closed and do not render a purchase CTA during the deadline.

- [ ] **Step 4: Run focused and full frontend tests**

Run: `npm run test:prototype -- test/subscription-plan.test.mjs` and then `npm run test:prototype`.

Expected: New polling tests pass, the full frontend suite passes, and no new CSS focus pseudo-class is introduced.

- [ ] **Step 5: Commit the frontend behavior**

```bash
git add web/src/pages/quantity-breaks/plan.tsx web/test/subscription-plan.test.mjs docs/APP_PROGRESS.md
git commit -m "feat: poll subscription verification in plan page"
```

### Task 5: Cross-component verification and release review

**Files:**
- Modify: none unless verification finds a regression
- Test: existing Worker, frontend, and theme suites

- [ ] **Step 1: Run all required checks**

```bash
cd worker && npm run typecheck && npm test && npm run test:module-boundaries
cd ../web && npm run test:prototype && npm run build
cd .. && npm run test:theme
git diff --check
```

- [ ] **Step 2: Review the final diff for data and security boundaries**

Confirm no API keys, tokens, `.env` values, unrelated generated assets, or changes to the confirmed CSS focus rule are staged. Confirm every operation key includes the app and shop boundary and every Partner error is truncated before D1 persistence or logs.

- [ ] **Step 3: Validate the development-store flow**

Using the deployed Worker and a SHOPLINE development store, verify: 0-value discount-code checkout, callback context, immediate `review_pending` to `active` transition, duplicate paid Webhook, cross-store isolation, and the fail-closed plan page when Partner omits the feature key. Record only flows actually executed in `docs/APP_PROGRESS.md`.

- [ ] **Step 4: Prepare the Git approval review**

Show `git status --short`, the complete changed-file list, test results, and the proposed commit summary. Ask the user exactly: `本次代码/文档已在本地更新，是否推送到 GitHub？` Do not push or deploy until the user approves this specific implementation change set.

## Self-Review

- Spec coverage: real-time callback, Webhook, `review_pending`, bounded retry, frontend polling, fail-closed semantics, Cron fallback, and test acceptance each map to Tasks 1–5.
- Placeholder scan: no `TODO`, `TBD`, or unspecified implementation step is used; all commands, files, and interfaces are named.
- Type consistency: Task 1 exposes the operation wrapper used by Task 3; Task 2 adds optional reconciliation context consumed by Task 3; Task 4 keeps the existing subscription API response unchanged.
- Review focus coverage: 0-value payments and duplicate/cross-store events are in Task 3; Partner eventual consistency and missing feature keys are in Task 2; frontend timer cleanup and timeout behavior are in Task 4.
