# Discount Names and Coverage Conflicts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate internal campaign names from SHOPLINE discount titles and expose product-level coverage conflicts in the editor.

**Architecture:** `CampaignDraft.name` remains the private admin identifier and gains a `discountName` companion for the SHOPLINE title. A Worker coverage-check route shares the repository conflict rules, resolves product/collection titles through existing store Admin access, and returns display-ready rows. The React editor consumes this route while the list and adapter expose the new name with legacy fallbacks.

**Tech Stack:** TypeScript, Hono, Cloudflare D1, React, react-i18next, Node test runner, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-09-discount-names-and-coverage-conflicts-design.md`

## Global Constraints

- Preserve existing `name` values for legacy campaigns; missing `discountName` resolves to `name`.
- Only `discountName` may be sent as SHOPLINE automatic-discount `title`.
- All store-scoped SHOPLINE requests use `shoplineAdminHeaders()` through existing product and collection helpers.
- Do not modify `:focus` or `:focus-visible` CSS rules.
- Support every existing application locale; product and merchant-entered names are never translated.
- Do not commit or push until the project Git approval workflow is explicitly satisfied.

## Review Focus

- A legacy published campaign without `discountName` must update without changing its current SHOPLINE title.
- A candidate excludes overlapping IDs, so only actually included products appear in conflict rows.
- Product-title lookup failure must return IDs rather than making coverage checking unusable.
- A campaign edited against itself must not report itself as a conflict.
- Long localized labels and product names must not overflow the conflict area or list cells on narrow screens.

---

### Task 1: Campaign Name Contract and SHOPLINE Payload

**Files:**
- Modify: `worker/src/domain/campaign.ts`
- Modify: `worker/src/services/discounts.ts`
- Modify: `worker/test/discount-publication.test.ts`
- Modify: `web/src/prototype/model.ts`
- Modify: `web/src/prototype/campaign-adapter.ts`
- Test: `web/test/campaign-adapter.test.mjs`

**Interfaces:**
- Produces `CampaignDraft.discountName?: string` with `resolvedDiscountName(campaign): string` semantics: trimmed `discountName` or `name`.
- Produces `ServerCampaign.discountName?: string` and `Campaign.discountName: string` for editor and list consumers.
- `discountInput(campaign, ...)` sends `{ title: resolvedDiscountName(campaign) }`.

- [ ] **Step 1: Write failing Worker and adapter tests**

```ts
expect(buildDiscountRequest({ ...draft, name: 'Internal', discountName: 'Checkout offer' }).title).toBe('Checkout offer');
expect(buildDiscountRequest({ ...draft, name: 'Legacy offer' }).title).toBe('Legacy offer');
```

```js
assert.equal(toAdminCampaign({ ...serverCampaign, name: 'Internal', discountName: undefined }).discountName, 'Internal');
assert.equal(toCampaignDraft({ ...adminCampaign, name: 'Internal', discountName: 'Checkout offer' }).discountName, 'Checkout offer');
```

- [ ] **Step 2: Verify the new assertions fail**

Run: `npm --workspace worker test -- discount-publication.test.ts && cd web && node --test test/campaign-adapter.test.mjs`

Expected: FAIL because `discountName` is absent from the Worker type/payload and browser adapter.

- [ ] **Step 3: Implement the contract with legacy fallback**

```ts
export function resolvedDiscountName(campaign: Pick<CampaignDraft, 'name' | 'discountName'>): string {
  return campaign.discountName?.trim() || campaign.name;
}
```

Validate nonblank `discountName` when it is supplied, map server values to `discountName ?? name`, preserve it on draft serialization, and replace `title: campaign.name` with `title: resolvedDiscountName(campaign)`.

- [ ] **Step 4: Verify contract tests pass**

Run: `npm --workspace worker test -- discount-publication.test.ts && cd web && node --test test/campaign-adapter.test.mjs`

Expected: PASS; legacy and explicit-title paths both assert the expected title.

### Task 2: Worker Coverage Detail Endpoint

**Files:**
- Modify: `worker/src/routes/campaigns.ts`
- Modify: `worker/test/routes-contract.test.ts`
- Modify: `web/src/prototype/campaign-api.ts`
- Test: `web/test/campaign-api.test.mjs`

**Interfaces:**
- Produces `POST /api/quantity-breaks/campaigns/coverage`.
- Consumes `{ campaign: Pick<CampaignDraft, 'id' | 'scope' | 'startsAt' | 'endsAt' | 'neverExpires'> }`.
- Returns `{ state: 'clear' | 'conflict' | 'unverified', conflicts: Array<{ campaignId: string; campaignName: string; itemId: string; itemName: string; type: 'products' | 'collections' }> }`.
- `checkCampaignCoverage(candidate, fetcher)` in `campaign-api.ts` exposes this response to the editor.

- [ ] **Step 1: Write failing route and browser-client tests**

```ts
expect(response.conflicts).toEqual([
  { campaignId: 'active-a', campaignName: 'Activity A', itemId: 'product-a', itemName: 'Product A', type: 'products' },
]);
```

```js
assert.match(source, /campaigns\/coverage/);
assert.match(source, /itemName/);
```

Include cases for self exclusion, excluded product IDs, and a failed title lookup returning the product ID.

- [ ] **Step 2: Verify coverage tests fail**

Run: `cd worker && npm test -- routes-contract.test.ts && cd ../web && node --test test/campaign-api.test.mjs`

Expected: FAIL because the route and client function do not yet exist.

- [ ] **Step 3: Add one shared coverage description path**

Implement a route-local helper that constructs an active candidate, filters repository campaigns through `campaignsConflict`, expands product or collection overlap IDs, and resolves titles with `getCampaignProducts` or `fetchCollectionTitles`. On resolution failure, return each ID as `itemName`; do not expose an upstream error. Reuse the helper when forming existing status-operation conflict responses where its shape fits.

- [ ] **Step 4: Add the typed browser request**

```ts
export async function checkCampaignCoverage(
  campaign: CoverageCandidate,
  fetcher: Fetcher = fetch,
): Promise<CampaignCoverage> {
  return request('/api/quantity-breaks/campaigns/coverage', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ campaign }),
  }, fetcher);
}
```

- [ ] **Step 5: Verify coverage tests pass**

Run: `cd worker && npm test -- routes-contract.test.ts && cd ../web && node --test test/campaign-api.test.mjs`

Expected: PASS; returned rows identify both the conflicting activity and product title.

### Task 3: Editor Fields and Conflict Detail Presentation

**Files:**
- Modify: `web/src/prototype/CampaignEditor.tsx`
- Modify: `web/src/pages/quantity-breaks.module.css`
- Modify: `web/test/editor-structure.test.mjs`

**Interfaces:**
- Consumes `Campaign.discountName` and `checkCampaignCoverage` from Tasks 1–2.
- Produces a saved `Campaign` carrying both `name` and `discountName`.
- Renders conflict rows with stable key `${campaignId}:${itemId}`.

- [ ] **Step 1: Write failing editor structure tests**

```js
assert.match(source, /id="campaign-name"[\s\S]*id="campaign-discount-name"/);
assert.match(source, /checkCampaignCoverage\(/);
assert.match(source, /<thead>[\s\S]*Activity name[\s\S]*Product name/);
assert.match(css, /\.overlapClear\.overlapConflict\s*\{[^}]*background:#fff3f0/);
```

The render test must also assert one conflict row per overlapping product and no self-conflict row.

- [ ] **Step 2: Verify the editor tests fail**

Run: `cd web && node --test --test-name-pattern='discount name|coverage conflict' test/editor-structure.test.mjs`

Expected: FAIL because the editor has one name input and only interpolates conflicting campaign names.

- [ ] **Step 3: Implement form state and save mapping**

Add `discountName` state initialized from `campaign?.discountName ?? campaign?.name ?? ''`; validate it separately; pass it through `onSave`. Rename the current field label to the localized internal-name label and insert the localized checkout-name field directly after it.

- [ ] **Step 4: Replace client-only conflict display**

Call `checkCampaignCoverage` from `checkOverlap` for product scopes. Render a semantic table headed by localized activity/product labels when conflicts exist. Add `overlapConflict` to the existing guard only when `checkState === 'conflict'`; define it with the existing red alert palette while `.overlapClear` remains the clear-state green rule. Keep collection priority notices separate.

- [ ] **Step 5: Add responsive containment**

Place the detail table in a dedicated overflow container, use `min-width:0`, `overflow-wrap:anywhere`, and the existing mobile breakpoint so product names do not grow the editor beyond its width.

- [ ] **Step 6: Verify editor tests pass**

Run: `cd web && node --test --test-name-pattern='discount name|coverage conflict|rule summary' test/editor-structure.test.mjs`

Expected: PASS; the two independent inputs, red conflict state, and detail rows are present.

### Task 4: Localized List Column and Translation Coverage

**Files:**
- Modify: `web/src/pages/quantity-breaks.tsx`
- Modify: `web/src/prototype/campaign-editor-messages.ts`
- Modify: `web/src/prototype/workspace-copy.ts`
- Modify: `web/test/campaign-editor-messages.test.mjs`
- Modify: `web/test/home-entry.test.mjs`
- Modify: `docs/APP_PROGRESS.md`

**Interfaces:**
- Consumes `Campaign.discountName` from Task 1.
- Produces localized `internalName`, `discountName`, `discountNameRequired`, `coverageConflictTitle`, `conflictActivityName`, and `conflictProductName` strings for every app locale.

- [ ] **Step 1: Write failing locale and list tests**

```js
for (const key of ['internalName', 'discountName', 'discountNameRequired', 'coverageConflictTitle', 'conflictActivityName', 'conflictProductName']) {
  assert.ok(keys.includes(key), key);
}
assert.match(pageSource, /<th scope="col">\{wt\('campaign'\)\}<\/th><th scope="col">\{wt\('discountName'\)\}/);
```

Also assert mobile cards use the localized label and legacy `campaign.name` fallback.

- [ ] **Step 2: Verify locale/list tests fail**

Run: `cd web && node --test --test-name-pattern='discount name|dictionary' test/campaign-editor-messages.test.mjs test/home-entry.test.mjs`

Expected: FAIL because no discount-name translation keys or adjacent list column exists.

- [ ] **Step 3: Add all locale copy and render the column**

Extend the canonical editor and workspace dictionaries for the existing locale set. Add a `discountName` column immediately after activity in desktop `colgroup`, header, and body; add an equivalent definition row in the mobile card. Use `campaign.discountName || campaign.name` at every read boundary.

- [ ] **Step 4: Update progress documentation**

Record the separate title behavior, exact conflict detail behavior, test evidence, and any remaining visual-test limitation in `docs/APP_PROGRESS.md`.

- [ ] **Step 5: Verify locale/list tests pass**

Run: `cd web && node --test test/campaign-editor-messages.test.mjs test/home-entry.test.mjs`

Expected: PASS; locale completeness and column order are verified.

### Task 5: Integrated Verification

**Files:**
- Modify only if a prior test exposes a specification mismatch.

**Interfaces:**
- Verifies all interfaces produced by Tasks 1–4 without adding new public contracts.

- [ ] **Step 1: Run focused Worker tests**

Run: `cd worker && npm test -- discount-publication.test.ts routes-contract.test.ts`

Expected: PASS.

- [ ] **Step 2: Run focused frontend tests and production build**

Run: `cd web && node --test test/campaign-adapter.test.mjs test/campaign-api.test.mjs test/campaign-editor-messages.test.mjs test/editor-structure.test.mjs test/home-entry.test.mjs && npm run build`

Expected: PASS.

- [ ] **Step 3: Run full project checks and inspect changes**

Run: `npm --workspace worker test && cd web && npm run test:prototype && git diff --check && git status --short`

Expected: record all failures by test name; distinguish existing baseline failures from regressions before reporting.
