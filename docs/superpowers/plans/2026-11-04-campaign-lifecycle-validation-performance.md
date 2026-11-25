# Campaign Lifecycle, Validation, and Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make paused Function discounts cleanly replaceable, enforce campaign schedule fields in the editor, and make live-state reads fast and authoritative.

**Architecture:** A merchant pause continues to schedule the platform discount to expire in ten seconds. Reconciliation converts the confirmed expired record into an idempotent delete transition; a later activation creates a fresh `ends_at: null` discount from the saved campaign configuration. D1 gains batch projections and transitions so one paginated SHOPLINE list request is paired with bounded D1 work, while the editor owns immediate localized field validation.

**Tech Stack:** Cloudflare Workers, Hono, D1, TypeScript, Vitest, React, SHOPLINE App Bridge, Node test runner.

**Spec:** `docs/superpowers/specs/2026-11-04-campaign-lifecycle-validation-performance-design.md`

## Global Constraints

- Use SHOPLINE's live Function discount-list state as runtime truth; D1 stores configuration, mapping, and operation/reconciliation state only.
- Merchant pause sets `ends_at` to exactly `now + 10 seconds`; it does not immediately fake a paused platform state.
- Restart creates a new continuous (`ends_at: null`) discount only after old expired mapping cleanup is confirmed.
- Subscription expiration keeps its existing direct deletion and `subscription_expired` reason.
- Never create a new discount after rejected or uncertain old-record deletion.
- Required campaign title, start time, and end time messages must support every existing app locale.
- Do not add or modify CSS `:focus`, `:focus-visible`, or `:focus-within` rules.
- Do not push, deploy, or make any external SHOPLINE mutation without explicit user approval for the completed change set.

## Review Focus

- An active read during the ten-second pause window must remain `Pausing`, not become immediately `Paused`.
- A repeated list refresh after deletion must not issue a second platform delete or create a second replacement discount.
- A deleted/expired scheduled campaign must render Paused rather than its stale local Scheduled label.
- An unchecked blank end time must block both save and publish, but a checked Never expires box must serialize `endsAt` as absent.
- A batch restart with one deletion failure must not create a replacement for that campaign while independent safe campaigns continue.

---

### Task 1: Replace Expired Merchant Discounts on Restart

**Files:**
- Modify: `worker/src/services/discounts.ts`
- Modify: `worker/src/db/campaigns.ts`
- Modify: `worker/src/routes/campaigns.ts`
- Modify: `worker/src/routes/internal-admin.ts`
- Test: `worker/test/discount-publication.test.ts`
- Test: `worker/test/routes-contract.test.ts`
- Test: `worker/test/internal-campaign-admin.test.ts`

**Interfaces:**
- Consumes: `pauseAutomaticDiscount(session, discountId, env)` and `readAutomaticDiscountState(session, discountId, env)`.
- Produces: `cleanupExpiredAutomaticDiscount(session, discountId, env, nodeId?)` with a confirmed missing result; `D1CampaignRepository.finishExpiredPauseCleanup(...)`; publish paths that create a fresh `PublishedAutomaticDiscount` instead of calling `resumeAutomaticDiscount`.

- [ ] **Step 1: Write the failing worker tests**

```ts
it('deletes a confirmed expired merchant-paused discount and clears its mapping', async () => {
  // first GET returns expired, GraphQL delete succeeds, final GET returns no row
  await expect(cleanupExpiredAutomaticDiscount(session, 'old-id', env)).resolves.toMatchObject({ upstreamStatus: 200 });
});

it('restarts a cleaned paused campaign by creating a new continuous discount', async () => {
  // old mapping is removed; POST body has ends_at: null; new ID is persisted
  expect(JSON.parse(String(createRequest.body))).toMatchObject({ ends_at: null });
  await expect(repository.getPublication('merchant-alpha', 'campaign-1')).resolves.toMatchObject({ state: 'active', discountId: 'new-id' });
});

it('does not create a replacement when expired-discount cleanup is rejected', async () => {
  expect(fetcher.mock.calls.some(([url, init]) => String(url).endsWith('/sales/discount_automatic_app.json') && init?.method === 'POST')).toBe(false);
});
```

- [ ] **Step 2: Run the targeted tests and verify RED**

Run: `npm test -- discount-publication.test.ts routes-contract.test.ts internal-campaign-admin.test.ts`

Expected: FAIL because cleanup/replacement behavior and repository transition do not exist; the current resume assertion expects a PUT with `ends_at: null`.

- [ ] **Step 3: Implement the minimal lifecycle transition**

```ts
export async function cleanupExpiredAutomaticDiscount(session: AuthContext, discountId: string, env: Env, nodeId?: string | null) {
  const current = await readAutomaticDiscountState(session, discountId, env, nodeId);
  if (current.state === 'missing') return current.metadata;
  if (current.state !== 'paused') throw new DiscountUncertainError('SHOPLINE expired discount cleanup was not confirmed.', current.metadata);
  return deleteAutomaticDiscount(session, discountId, env, current.nodeId);
}

// On restart: only after the publication contains no old mapping, call
// createAutomaticDiscount(session, { ...campaign, status: 'active', endsAt: undefined }, env, currency).
```

Implement a repository method that atomically records merchant-pause cleanup as
`state: 'removed'`, clears `discount_id`/node ID, sets campaign `status:
'paused'`, and records `state_reason: 'merchant_paused'`. Reuse this transition
from reconciliation. Change activation guards so `paused + removed + no ID`
is a creation state. Remove `resumeAutomaticDiscount` from normal and internal
admin activation paths; both must fetch currency and create a new discount.

- [ ] **Step 4: Run targeted tests and verify GREEN**

Run: `npm test -- discount-publication.test.ts routes-contract.test.ts internal-campaign-admin.test.ts`

Expected: PASS; create requests contain `ends_at: null`, old IDs are deleted
before replacement, and rejected cleanup never performs POST creation.

- [ ] **Step 5: Record task completion**

Run: `git diff --check`

Expected: exit 0.

### Task 2: Batch Reconciliation and Correct Status Projection

**Files:**
- Modify: `worker/src/db/campaigns.ts`
- Modify: `worker/src/routes/campaigns.ts`
- Modify: `worker/src/services/discounts.ts`
- Modify: `web/src/prototype/campaign-adapter.ts`
- Test: `worker/test/campaign-repository.test.ts`
- Test: `worker/test/routes-contract.test.ts`
- Test: `web/test/campaign-adapter.test.mjs`

**Interfaces:**
- Consumes: Task 1 cleanup transition and `listAutomaticDiscountStates`.
- Produces: a batch campaign/publication projection and batch reconcile write API; response `platformStatus` that overrides stale `status` and `resumeStatus`.

- [ ] **Step 1: Write the failing tests**

```ts
it('reconciles an expired scheduled discount as paused and clears its stale resume status', async () => {
  await repository.reconcilePlatformStates('merchant-alpha', [{ campaignId: 'campaign-1', state: 'paused', nodeId: null }]);
  await expect(repository.get('merchant-alpha', 'campaign-1')).resolves.toMatchObject({ status: 'paused' });
  await expect(repository.getPublication('merchant-alpha', 'campaign-1')).resolves.toMatchObject({ state: 'removed', discountId: null, resumeStatus: undefined });
});

it('projects a campaign list from one SHOPLINE list request without per-campaign status reads', async () => {
  expect(fetcher.mock.calls.filter(([url]) => String(url).includes('/sales/discount_app.json'))).toHaveLength(1);
});
```

```js
test('a live paused platform status overrides stale scheduled campaign status', () => {
  assert.equal(toAdminCampaign({ ...scheduled, platformStatus: 'paused' }).status, 'Paused');
});
```

- [ ] **Step 2: Run targeted tests and verify RED**

Run: `npm test -- campaign-repository.test.ts routes-contract.test.ts && node --test web/test/campaign-adapter.test.mjs`

Expected: FAIL because no batch projection/reconcile method exists and the
previous paused record retains the old mapping/resume status.

- [ ] **Step 3: Implement bounded batch reads and writes**

```ts
type CampaignPublicationProjection = { campaign: Campaign; publication: Publication; collectionConflict?: CollectionConflict };
async listProjections(shopHandle: string): Promise<CampaignPublicationProjection[]>;
async reconcilePlatformStates(shopHandle: string, states: ReadonlyArray<{ campaignId: string; state: 'active' | 'paused' | 'missing'; nodeId: string | null }>): Promise<void>;
```

Have list reconciliation load projections once, call the paginated Function
list once, calculate states in memory, and batch the D1 state updates. Queue
confirmed expired merchant records for cleanup without serial SHOPLINE status
reads. Return response objects from the already loaded projection instead of
calling `get`, `getPublication`, and `getCollectionConflict` for each row.
For the detail route, load one projection and issue only its one state read.

- [ ] **Step 4: Run targeted tests and verify GREEN**

Run: `npm test -- campaign-repository.test.ts routes-contract.test.ts && node --test web/test/campaign-adapter.test.mjs`

Expected: PASS; the live expired/paused state renders Paused and list reads use
one Function endpoint call.

- [ ] **Step 5: Record task completion**

Run: `git diff --check`

Expected: exit 0.

### Task 3: Required Schedule Fields and Never Expires Editor Control

**Files:**
- Modify: `worker/src/domain/campaign.ts`
- Modify: `web/src/prototype/CampaignEditor.tsx`
- Modify: `web/src/prototype/campaign-editor-messages.ts`
- Modify: `web/src/prototype/campaign-adapter.ts`
- Test: `worker/test/campaign-repository.test.ts`
- Test: `web/test/editor-structure.test.mjs`
- Test: `web/test/campaign-editor-messages.test.mjs`
- Test: `web/test/campaign-api.test.mjs`

**Interfaces:**
- Consumes: the persisted `CampaignDraft.startsAt` and `CampaignDraft.endsAt` mapping.
- Produces: `neverExpires` UI state derived from `endsAt`, locale-safe missing-field feedback, and a server validator requiring dates unless `endsAt` is absent by explicit Never expires serialization.

- [ ] **Step 1: Write the failing tests**

```js
test('publish with a blank title expands Settings and shows a localized title-required Bridge message', async () => {
  // render collapsed editor, click publish, assert settings content and locale message are visible
});

test('an unchecked blank end time blocks publication while Never expires serializes a null end time', async () => {
  // first save rejects, then check the checkbox and assert endsAt is undefined in payload
});
```

```ts
it('rejects a draft without a start time or an unchecked end time', () => {
  expect(validateCampaign({ ...campaign, startsAt: undefined })).toContain('Campaign start time is required.');
  expect(validateCampaign({ ...campaign, endsAt: '' })).toContain('Campaign end time is required unless it never expires.');
});
```

- [ ] **Step 2: Run targeted tests and verify RED**

Run: `npm test -- campaign-repository.test.ts && node --test web/test/editor-structure.test.mjs web/test/campaign-editor-messages.test.mjs web/test/campaign-api.test.mjs`

Expected: FAIL because end time remains optional, the checkbox does not exist,
and missing time fields do not expand Settings or use complete localized keys.

- [ ] **Step 3: Implement validation and UI**

```tsx
<label>
  <input type="checkbox" checked={neverExpires} onChange={(event) => {
    setNeverExpires(event.target.checked);
    if (event.target.checked) setEndsAt('');
  }} />
  {ct('neverExpires')}
</label>
```

Derive `neverExpires` from a persisted missing end time. Require title and
start time in the existing validation chain; require an end time when
`neverExpires` is false. Before calling `notify`, expand the Settings details
element and pass the matching locale message key. Add keys and translated
values for all existing locales rather than falling back to English. Normalize
the checked value to undefined in `toCampaignDraft`, which becomes `null` in
the SHOPLINE create/update request body. Tighten server validation to reject
empty strings and invalid chronology.

- [ ] **Step 4: Run targeted tests and verify GREEN**

Run: `npm test -- campaign-repository.test.ts && node --test web/test/editor-structure.test.mjs web/test/campaign-editor-messages.test.mjs web/test/campaign-api.test.mjs`

Expected: PASS; every required-field failure opens Settings, message lookup
works in every locale, and Never expires sends no end date.

- [ ] **Step 5: Record task completion**

Run: `git diff --check`

Expected: exit 0.

### Task 4: Full Regression and Evidence Update

**Files:**
- Modify: `docs/APP_PROGRESS.md`
- Test: `worker/test/*.test.ts`
- Test: `web/test/*.test.mjs`

**Interfaces:**
- Consumes: all Task 1-3 implementations.
- Produces: verified test/build evidence and a truthful progress record that distinguishes local checks from real embedded SHOPLINE verification.

- [ ] **Step 1: Run complete worker verification**

Run: `npm test && npm run typecheck && npm run test:module-boundaries && npm run build`

Expected: all worker tests, type checking, module-boundary test, and dry-run
deployment build pass.

- [ ] **Step 2: Run complete web verification**

Run: `npm run test:prototype && npm run build`

Expected: all frontend prototype tests and production build pass.

- [ ] **Step 3: Update the evidence record**

```markdown
2026-11-04 lifecycle and editor validation: [record exact passing local commands].
Real embedded SHOPLINE verification remains required for the ten-second expiry,
expired-record deletion, and replacement creation; do not mark it verified
without an authorized merchant-session check.
```

- [ ] **Step 4: Inspect the final change set**

Run: `git diff --check && git status --short && git diff --stat`

Expected: no whitespace errors; only planned worker, web, test, specification,
plan, and progress-record files are changed.
