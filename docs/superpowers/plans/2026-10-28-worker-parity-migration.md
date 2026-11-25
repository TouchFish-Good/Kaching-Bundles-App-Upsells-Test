# Worker Parity Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Port the current Quantity Breaks behavior from the desktop checkout to the deployed Cloudflare Worker, its D1 database, the React admin UI, and the separately published SHOPLINE theme block.

**Architecture:** Keep \`worker/src/**\` as the only production backend. Translate the desktop Express/SQLite behavior into Hono routes, D1 repository state transitions, and Worker-native SHOPLINE clients; do not import or deploy \`app/**\`. Port only UI code whose API contract exists in Worker, and treat the theme extension as an independently tested and published artifact.

**Tech Stack:** TypeScript, Hono, Cloudflare Workers, D1, React/Vite, Node test runner, SHOPLINE Admin APIs, SHOPLINE theme app extension.

**Spec:** \`docs/superpowers/specs/2026-10-28-worker-parity-migration-design.md\`

## Global Constraints

- Implement and test in \`/Users/SL/.codex/worktrees/cloudflare-workers-d1/bundles-app-upsells-new\` on branch \`codex/cloudflare-workers-d1\`; do not deploy from the desktop \`main\` checkout.
- \`worker/\` is the only deployed backend; \`app/\` remains a behavior reference and must not become a Worker runtime dependency.
- Preserve OAuth signature verification, session-token verification, encrypted D1 session storage, existing Function configuration, and published application route unless a separately verified requirement requires a change.
- Product lookup accepts exactly one of \`id\` or comma-separated \`ids\`; each upstream request has at most 50 product IDs, caller order is retained, and missing IDs are explicit.
- Published campaigns preserve their stored \`active\` or \`scheduled\` status when edited and update the same confirmed platform discount ID.
- A definitive platform rejection restores the editable active state; an uncertain result transitions to \`needs_reconciliation\` and blocks retries until resolved.
- Collection scopes are revalidated before published updates. Reject changed collection membership until the collection-variable workflow has been verified for update semantics.
- Public storefront data exposes only validated campaign display data and saved copy; it never exposes tokens, platform discount IDs, or other admin-only data.
- Keep monetary calculations in integer minor units; do not invent SHOPLINE API capabilities.
- Keep generated \`web/dist\` out of Git. Build in the Worker worktree immediately before a separately approved Wrangler deployment.
- Do not merge to \`main\`, deploy with Wrangler, push Git commits, or publish the theme extension without that specific user approval.

## Review Focus

- A 51-item product selection must issue \`50 + 1\` upstream batches and return caller order even when SHOPLINE returns a different order; Task 2 owns this test.
- An upstream timeout after the update request begins must retain the staged candidate, preserve the confirmed campaign, and block a second update; Task 3 owns this test.
- An upstream response whose returned discount ID differs from the stored one must be uncertain rather than treated as a successful replacement; Task 3 owns this test.
- A published collection campaign whose resolved members differ from its persisted \`resolvedProductIds\` must be rejected before any discount-update request; Task 4 owns this test.
- A malformed translation/upstream response must return a safe HTTP error with a request identifier only, while an active campaign without optional copy remains renderable; Task 5 owns this test.

---

## File Map

| Desktop behavior reference | Worker implementation target | Responsibility |
| --- | --- | --- |
| \`app/src/service/campaign/product-catalog.ts\`, \`app/src/controller/campaign-products.ts\` | \`worker/src/services/shopline-admin.ts\`, \`worker/src/routes/catalog.ts\` | Validated single/batch product lookup and missing-product view model. |
| \`app/src/service/campaign/repository.ts\`, \`app/src/controller/campaigns.ts\`, \`app/src/service/campaign/discount-adapter.ts\` | \`worker/migrations/0002_published_campaign_updates.sql\`, \`worker/src/db/migrate.ts\`, \`worker/src/db/campaigns.ts\`, \`worker/src/routes/campaigns.ts\`, \`worker/src/services/discounts.ts\` | D1 update staging, locks, platform update, and safe failure recovery. |
| \`app/src/controller/translations.ts\`, \`app/src/controller/storefront-campaign.ts\` | \`worker/src/routes/translations.ts\`, \`worker/src/routes/storefront.ts\`, \`worker/src/db/translations.ts\` | Safe translation errors and public saved copy. |
| \`web/src/**\`, \`web/test/**\` | Same paths in Worker worktree | Worker-aware admin requests, selected-item hydration, campaign detail/list behavior, and locale-safe navigation. |
| \`theme-app-extension/**\`, \`tests/theme-app-extension/**\` | Same paths in Worker worktree | Product metadata, integer pricing summary, translated copy, cart-refresh event, and responsive block layout. |

### Task 1: Establish the Worker Migration Baseline and D1 Schema Contract

**Files:**
- Create: \`worker/src/domain/campaign.ts\`
- Create: \`worker/migrations/0002_published_campaign_updates.sql\`
- Modify: \`worker/src/db/migrate.ts\`
- Modify: \`worker/src/db/campaigns.ts\`
- Modify: \`worker/src/routes/campaigns.ts\`
- Modify: \`worker/src/routes/storefront.ts\`
- Modify: \`worker/src/services/discounts.ts\`
- Modify: \`worker/src/jobs/collection-conflicts.ts\`
- Modify: \`worker/test/campaign-repository.test.ts\`
- Modify: \`worker/test/discount-publication.test.ts\`
- Modify: \`worker/test/collection-conflicts-job.test.ts\`
- Modify: \`worker/test/migrations.test.ts\`
- Create: \`worker/test/no-legacy-runtime-imports.test.ts\`
- Create: \`docs/superpowers/specs/2026-10-28-worker-parity-migration-design.md\`
- Create: \`docs/superpowers/plans/2026-10-28-worker-parity-migration.md\`

**Interfaces:**
- Consumes: current D1 \`quantity_breaks_campaigns\`, \`quantity_breaks_publications\`, and \`quantity_breaks_shop_locks\`.
- Produces: \`PublicationState\` includes \`updating\`; table \`quantity_breaks_staged_updates(shop_handle, campaign_id, candidate_json, expected_revision, discount_id)\` exists in local Miniflare and remote D1 migrations.

- [ ] **Step 1: Add the approved spec and plan to the Worker worktree**

Use \`apply_patch\` to create the two documentation files in the Worker worktree with the exact approved contents from the desktop checkout:
\`/Users/SL/Desktop/Kaching Bundles App & Upsells New/bundles-app-upsells-new/docs/superpowers/specs/2026-10-28-worker-parity-migration-design.md\` and
\`/Users/SL/Desktop/Kaching Bundles App & Upsells New/bundles-app-upsells-new/docs/superpowers/plans/2026-10-28-worker-parity-migration.md\`.

- [ ] **Step 2: Write a failing Worker isolation test**

\`\`\`ts
test('Worker sources have no runtime dependency on the retired app backend', () => {
  for (const file of workerSourceFiles) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /from ['"][^'"]*app\\/src\\//);
  }
});
\`\`\`

- [ ] **Step 3: Run the isolation test to verify it fails**

Run: \`npm test -- no-legacy-runtime-imports.test.ts\`

Expected: FAIL because the Worker imports campaign types or validation functions from \`app/src/service/campaign/*\`.

- [ ] **Step 4: Move the shared campaign domain contract into Worker ownership**

Create \`worker/src/domain/campaign.ts\` by copying the current public exports of \`app/src/service/campaign/model.ts\` and \`app/src/service/campaign/validate.ts\`, plus the widget type/validator they require from \`app/src/service/campaign/widget-config.ts\`. Its required exports are \`CampaignStatus\`, \`CampaignScope\`, \`MarketOverride\`, \`CampaignTier\`, \`CampaignDraft\`, \`Campaign\`, \`validateCampaign\`, \`scopesOverlap\`, \`campaignsConflict\`, and \`campaignCurrencyConflict\`. Preserve all current validation rules: starts-at required, unique non-empty IDs, positive/unique tier quantities, integer minor-unit discounts, valid market override currencies/modes, widget validation, schedule order, collection resolved-members requirement for live campaigns, and product-versus-collection priority behavior.

Replace every \`app/src/service/campaign/model\` and \`app/src/service/campaign/validate\` import under \`worker/src\` and \`worker/test\` with this Worker-owned module. The completed Worker source and tests must contain no import path pointing to \`app/src\`.

- [ ] **Step 5: Run the isolation and existing Worker tests**

Run: \`npm test -- no-legacy-runtime-imports.test.ts campaign-repository.test.ts discount-publication.test.ts collection-conflicts-job.test.ts\`

Expected: PASS.

- [ ] **Step 6: Write the failing migration and repository test**

\`\`\`ts
test('migration accepts updating publications and stores staged update metadata', async () => {
  await applyMigrations(database);
  await database.prepare(
    "INSERT INTO quantity_breaks_publications (shop_handle, campaign_id, state, discount_id, owner, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).bind('shop-a', 'offer-a', 'updating', 'discount-1', 'owner-1', '2026-10-28T00:00:00.000Z').run();
  await database.prepare('INSERT INTO quantity_breaks_staged_updates (shop_handle, campaign_id, candidate_json, expected_revision, discount_id) VALUES (?, ?, ?, ?, ?)')
    .bind('shop-a', 'offer-a', JSON.stringify(draft), 2, 'discount-1').run();
  assert.equal((await repository.getPublication('shop-a', 'offer-a')).state, 'updating');
});
\`\`\`

- [ ] **Step 7: Run the focused test to verify it fails**

Run: \`npm test -- migrations.test.ts campaign-repository.test.ts\`

Expected: FAIL because \`updating\` violates the initial D1 CHECK constraint or the staged table is missing.

- [ ] **Step 8: Add an additive production migration and mirror it in local setup**

\`\`\`sql
CREATE TABLE quantity_breaks_staged_updates (
  shop_handle TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  candidate_json TEXT NOT NULL,
  expected_revision INTEGER NOT NULL,
  discount_id TEXT NOT NULL,
  PRIMARY KEY (shop_handle, campaign_id)
);
\`\`\`

Use a D1-compatible table replacement transaction to change the existing publication state constraint to include \`updating\`, copy all current rows, and recreate \`idx_publications_shop_state\`. Update \`worker/src/db/migrate.ts\` so Miniflare receives the same final schema without applying the production migration twice.

- [ ] **Step 9: Run focused migration tests**

Run: \`npm test -- migrations.test.ts campaign-repository.test.ts\`

Expected: PASS.

- [ ] **Step 10: Commit Worker isolation and schema contract**

\`\`\`zsh
git add worker/src/domain/campaign.ts worker/src/db/campaigns.ts worker/src/routes/campaigns.ts worker/src/routes/storefront.ts worker/src/services/discounts.ts worker/src/jobs/collection-conflicts.ts worker/test/no-legacy-runtime-imports.test.ts worker/test/campaign-repository.test.ts worker/test/discount-publication.test.ts worker/test/collection-conflicts-job.test.ts worker/migrations/0002_published_campaign_updates.sql worker/src/db/migrate.ts worker/test/migrations.test.ts docs/superpowers/specs/2026-10-28-worker-parity-migration-design.md docs/superpowers/plans/2026-10-28-worker-parity-migration.md
git commit -m "feat(worker): own campaign domain and update schema"
\`\`\`

### Task 2: Port Product Batch Lookup and Missing-Product Handling

**Files:**
- Modify: \`worker/src/services/shopline-admin.ts\`
- Modify: \`worker/src/routes/catalog.ts\`
- Modify: \`worker/test/shopline-admin.test.ts\`
- Modify: \`worker/test/routes-contract.test.ts\`
- Modify: \`web/src/prototype/campaign-api.ts\`
- Modify: \`web/src/prototype/CampaignProductPicker.tsx\`
- Modify: \`web/test/campaign-product-picker.test.mjs\`

**Interfaces:**
- Consumes: authenticated \`AuthContext\` and existing SHOPLINE product catalog response normalization.
- Produces: \`getCampaignProducts(session, ids, requestId?): Promise<{ products: CampaignProduct[]; missingIds: string[] }>\` and \`GET /api/quantity-breaks/products?ids=<csv>\` response \`{ products, missingIds }\`.

- [ ] **Step 1: Write failing Worker service tests for validated batches**

\`\`\`ts
test('gets selected products in caller order and reports missing IDs', async () => {
  const result = await getCampaignProducts(session, ['200', '100', '300'], fetchStub);
  assert.deepEqual(result.products.map((product) => product.id), ['200', '100']);
  assert.deepEqual(result.missingIds, ['300']);
});

test('splits fifty-one selected products into a fifty-ID and one-ID request', async () => {
  const result = await getCampaignProducts(session, ids51, fetchStub);
  assert.deepEqual(requestBatchSizes, [50, 1]);
  assert.equal(result.missingIds.length, 0);
});
\`\`\`

- [ ] **Step 2: Run the focused service test to verify it fails**

Run: \`npm test -- shopline-admin.test.ts\`

Expected: FAIL because Worker catalog lookup only accepts one \`id\` or lacks the ordered batch result.

- [ ] **Step 3: Implement the Worker-native product lookup**

\`\`\`ts
export async function getCampaignProducts(session: ShoplineSession, ids: string[], requestId?: string) {
  const unique = validateUniqueProductIds(ids);
  const byId = new Map<string, CampaignProduct>();
  for (const batch of chunks(unique, 50)) {
    const response = await shoplineGet(session, \`/products/products.json?ids=\${encodeURIComponent(batch.join(','))}&limit=\${batch.length}&fields=id,title,image,options,variants\`, requestId);
    for (const raw of parseProducts(response)) byId.set(raw.id, normalizeProduct(raw));
  }
  return { products: unique.flatMap((id) => byId.has(id) ? [byId.get(id)!] : []), missingIds: unique.filter((id) => !byId.has(id)) };
}
\`\`\`

Reject empty lists, lists over 500, duplicate/invalid IDs, both \`id\` and \`ids\`, and blank CSV entries. Never use an individual product endpoint for this hydration path.

- [ ] **Step 4: Add route and UI regression tests**

\`\`\`ts
test('catalog route rejects id and ids together and returns missing IDs explicitly', async () => {
  assert.equal((await request('/api/quantity-breaks/products?id=1&ids=2')).status, 400);
  assert.deepEqual(await json('/api/quantity-breaks/products?ids=2,1,3'), { products: [product2, product1], missingIds: ['3'] });
});
\`\`\`

\`\`\`js
test('selected product hydration labels missing products unavailable instead of displaying raw IDs', () => {
  assert.match(renderedSelectionText, /Unavailable product/);
  assert.doesNotMatch(renderedSelectionText, /^product-missing$/m);
});
\`\`\`

- [ ] **Step 5: Run focused Worker and web tests**

Run: \`npm test -- shopline-admin.test.ts routes-contract.test.ts\`

Run: \`npm test -- campaign-product-picker.test.mjs\`

Expected: PASS.

- [ ] **Step 6: Commit the lookup contract and hydration behavior**

\`\`\`zsh
git add worker/src/services/shopline-admin.ts worker/src/routes/catalog.ts worker/test/shopline-admin.test.ts worker/test/routes-contract.test.ts web/src/prototype/campaign-api.ts web/src/prototype/CampaignProductPicker.tsx web/test/campaign-product-picker.test.mjs
git commit -m "feat(worker): batch selected product lookup"
\`\`\`

### Task 3: Implement Atomic Updates for Published Campaigns

**Files:**
- Modify: \`worker/src/db/campaigns.ts\`
- Modify: \`worker/src/routes/campaigns.ts\`
- Modify: \`worker/src/services/discounts.ts\`
- Modify: \`worker/test/campaign-repository.test.ts\`
- Modify: \`worker/test/discount-publication.test.ts\`
- Modify: \`worker/test/routes-contract.test.ts\`

**Interfaces:**
- Consumes: \`CampaignDraft\`, revision number, publication \`{ state: 'active', discountId }\`, and the Task 1 staged-update table.
- Produces: \`beginUpdate(handle, candidate, expectedRevision, discountId)\`, \`finishUpdate(handle, id, expectedRevision, discountId, owner)\`, \`markUpdateFailure(handle, id, uncertain, owner)\`, and \`updateAutomaticDiscount(session, discountId, campaign, env, currency)\`.

- [ ] **Step 1: Write failing repository state-transition tests**

\`\`\`ts
test('stages an active campaign update and preserves the old campaign until finish', async () => {
  await repository.beginUpdate('shop-a', { ...draft, name: 'Changed', status: 'paused' }, 2, 'discount-1');
  assert.equal((await repository.get('shop-a', 'offer-a'))?.name, 'Original');
  assert.equal((await repository.getPublication('shop-a', 'offer-a')).state, 'updating');
  assert.equal((await repository.getStagedUpdate('shop-a', 'offer-a'))?.candidate.name, 'Changed');
});

test('uncertain update preserves stage and blocks another update', async () => {
  await repository.markUpdateFailure('shop-a', 'offer-a', true, owner);
  assert.equal((await repository.getPublication('shop-a', 'offer-a')).state, 'needs_reconciliation');
  await assert.rejects(() => repository.beginUpdate('shop-a', draft, 2, 'discount-1'), /reconciliation/i);
});
\`\`\`

- [ ] **Step 2: Run repository tests to verify they fail**

Run: \`npm test -- campaign-repository.test.ts\`

Expected: FAIL because current \`save\` rejects every active/scheduled campaign and no update staging API exists.

- [ ] **Step 3: Implement D1 CAS and lease-checked staging**

\`\`\`ts
type UpdateLease = { campaign: Campaign; owner: string; discountId: string };
async beginUpdate(handle: string, candidate: CampaignDraft, expectedRevision: number, discountId: string): Promise<UpdateLease>
async finishUpdate(handle: string, id: string, expectedRevision: number, discountId: string, owner: string): Promise<Campaign>
async markUpdateFailure(handle: string, id: string, uncertain: boolean, owner: string): Promise<void>
\`\`\`

Acquire the shop lock before reading state. Validate the candidate, preserve \`current.status\`, require exact active publication/discount/revision, insert the stage, and mark publication \`updating\`. \`finishUpdate\` rechecks owner, expiry, revision, stage, and discount ID before incrementing revision/clearing stage. A definitive rejection clears the stage/restores \`active\`; uncertainty keeps the stage/sets \`needs_reconciliation\`.

- [ ] **Step 4: Add failing platform-update tests**

\`\`\`ts
test('uses GraphQL update and only accepts the same platform discount ID', async () => {
  await assert.rejects(() => updateAutomaticDiscount(session, 'discount-1', campaign, env, 'USD', responseWith('discount-2')), /uncertain/i);
});

test('routes a definitive user error back to active and a timeout to reconciliation', async () => {
  assert.equal((await putPublishedCampaign(rejectedUpdate)).status, 502);
  assert.equal((await repository.getPublication('shop-a', 'offer-a')).state, 'active');
  assert.equal((await putPublishedCampaign(timeoutUpdate)).status, 409);
  assert.equal((await repository.getPublication('shop-a', 'offer-a')).state, 'needs_reconciliation');
});
\`\`\`

- [ ] **Step 5: Implement the GraphQL update and Hono PUT path**

\`\`\`ts
if (current.status === 'active' || current.status === 'scheduled') {
  const lease = await repository.beginUpdate(session.handle, campaign, expectedRevision, publication.discountId!);
  try {
    await updateAutomaticDiscount(session, lease.discountId, lease.campaign, c.env, currency);
    return c.json({ campaign: await repository.finishUpdate(session.handle, campaign.id, expectedRevision, lease.discountId, lease.owner) });
  } catch (error) {
    await repository.markUpdateFailure(session.handle, campaign.id, !(error instanceof DiscountRejectedError), lease.owner);
    throw error;
  }
}
\`\`\`

POST SHOPLINE Admin GraphQL, bound response size, treat GraphQL \`userErrors\` as \`DiscountRejectedError\`, and treat timeout, non-definitive status, malformed JSON, missing payload, GraphQL errors, or changed discount ID as uncertain. Do not log tokens, GraphQL request bodies, or upstream response bodies.

- [ ] **Step 6: Run focused tests**

Run: \`npm test -- campaign-repository.test.ts discount-publication.test.ts routes-contract.test.ts\`

Expected: PASS.

- [ ] **Step 7: Commit published-update reliability**

\`\`\`zsh
git add worker/src/db/campaigns.ts worker/src/routes/campaigns.ts worker/src/services/discounts.ts worker/test/campaign-repository.test.ts worker/test/discount-publication.test.ts worker/test/routes-contract.test.ts
git commit -m "feat(worker): update published campaigns safely"
\`\`\`

### Task 4: Revalidate Collection Scopes Before Published Updates

**Files:**
- Modify: \`worker/src/services/collection-publication.ts\`
- Modify: \`worker/src/routes/campaigns.ts\`
- Modify: \`worker/test/collection-publication.test.ts\`
- Modify: \`worker/test/routes-contract.test.ts\`

**Interfaces:**
- Consumes: active/scheduled collection campaign, persisted \`scope.resolvedProductIds\`, and \`resolveCollectionMembers(session, collectionIds)\`.
- Produces: \`assertPublishedCollectionScopeUnchanged(session, campaign): Promise<string[]>\`, which resolves unique product IDs or throws \`CampaignConflictError\` before an update side effect.

- [ ] **Step 1: Write the failing collection-change test**

\`\`\`ts
test('rejects published collection updates when current members differ from published members', async () => {
  mockResolvedMembers(['product-1', 'product-3']);
  const response = await putPublishedCollectionCampaign({ ...campaign, name: 'Changed' });
  assert.equal(response.status, 409);
  assert.equal(updateAutomaticDiscountCalls, 0);
  assert.match(await response.text(), /collection membership/i);
});
\`\`\`

- [ ] **Step 2: Run the focused test to verify it fails**

Run: \`npm test -- collection-publication.test.ts routes-contract.test.ts\`

Expected: FAIL because Worker only resolves collection members for publication, not update.

- [ ] **Step 3: Implement exact member-set comparison before \`beginUpdate\`**

\`\`\`ts
export async function assertPublishedCollectionScopeUnchanged(session: ShoplineSession, campaign: Campaign): Promise<string[]> {
  const current = uniqueSorted(await resolveCollectionMembers(session, campaign.scope.collectionIds ?? []));
  const published = uniqueSorted(campaign.scope.resolvedProductIds ?? []);
  if (!current.length || current.join('\\u0000') !== published.join('\\u0000')) {
    throw new CampaignConflictError('Collection membership changed; pause and republish after reviewing the product scope.');
  }
  return current;
}
\`\`\`

Call it before staging. Do not call \`writeCollectionVariables\` on the update path because safe changed-member update semantics have not been verified.

- [ ] **Step 4: Run focused tests**

Run: \`npm test -- collection-publication.test.ts routes-contract.test.ts\`

Expected: PASS.

- [ ] **Step 5: Commit collection update guard**

\`\`\`zsh
git add worker/src/services/collection-publication.ts worker/src/routes/campaigns.ts worker/test/collection-publication.test.ts worker/test/routes-contract.test.ts
git commit -m "fix(worker): verify collection scope before updates"
\`\`\`

### Task 5: Safely Expose Storefront Copy and Isolate Translation Failures

**Files:**
- Modify: \`worker/src/routes/translations.ts\`
- Modify: \`worker/src/routes/storefront.ts\`
- Modify: \`worker/src/db/translations.ts\`
- Modify: \`worker/test/translation-repository.test.ts\`
- Modify: \`worker/test/routes-contract.test.ts\`

**Interfaces:**
- Consumes: locale-normalized translation records from D1, request identifiers, and active/public campaign data.
- Produces: public \`campaign\` JSON with the existing public fields plus \`widgetTitle: string\` and \`copy: Record<string, string>\`, only for a confirmed active publication; translation route errors retain only safe class/message and request ID.

- [ ] **Step 1: Write failing translation safety tests**

\`\`\`ts
test('translation failure returns a request identifier without exposing upstream body', async () => {
  const response = await request('/api/quantity-breaks/translations', failingUpstream);
  const json = await response.json();
  assert.equal(response.status, 502);
  assert.match(json.requestId, /^[a-z0-9-]+$/i);
  assert.doesNotMatch(JSON.stringify(json), /access_token|upstream-private-body/);
});

test('public campaign returns saved copy but no publication ID or tokens', async () => {
  const json = await requestPublicCampaign('shop-a', 'product-1', 'fr').then((r) => r.json());
  assert.equal(json.campaign.copy['widget.total'], 'Total');
  assert.equal('platformDiscountId' in json.campaign, false);
  assert.doesNotMatch(JSON.stringify(json), /token|discountId/i);
});
\`\`\`

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: \`npm test -- translation-repository.test.ts routes-contract.test.ts\`

Expected: FAIL because public responses omit saved copy or route errors cannot preserve safe class boundaries.

- [ ] **Step 3: Implement safe copy selection and error boundaries**

\`\`\`ts
const copy = await translations.read(session.handle, requestedLocale).catch((error) => {
  recordSafeDiagnostic({ requestId, kind: 'translation_read', error });
  return {};
});
return c.json({ campaign: toPublicCampaign(campaign, { widgetTitle: copy['widget.title'] ?? '', copy }) });
\`\`\`

Validate every returned copy value is a string under the existing size limit. For admin translation requests preserve 400 validation, 401 authentication, 404 absence, and 409 conflicts; return 502 only for a verified upstream failure and use a generated request ID, never upstream bodies.

- [ ] **Step 4: Add reconciliation visibility test**

\`\`\`ts
test('does not serve a campaign while publication is updating or needs reconciliation', async () => {
  for (const state of ['updating', 'needs_reconciliation']) {
    await setPublicationState(state);
    assert.equal((await requestPublicCampaign('shop-a', 'product-1')).status, 404);
  }
});
\`\`\`

- [ ] **Step 5: Run focused tests**

Run: \`npm test -- translation-repository.test.ts routes-contract.test.ts\`

Expected: PASS.

- [ ] **Step 6: Commit storefront and translation hardening**

\`\`\`zsh
git add worker/src/routes/translations.ts worker/src/routes/storefront.ts worker/src/db/translations.ts worker/test/translation-repository.test.ts worker/test/routes-contract.test.ts
git commit -m "feat(worker): return safe storefront translation copy"
\`\`\`

### Task 6: Port the Admin UI Against Worker Contracts

**Files:**
- Modify: \`web/src/pages/quantity-breaks.tsx\`
- Modify: \`web/src/pages/quantity-breaks.module.css\`
- Modify: \`web/src/prototype/campaign-adapter.ts\`
- Modify: \`web/src/prototype/campaign-api.ts\`
- Modify: \`web/src/prototype/CampaignEditor.tsx\`
- Modify: \`web/src/prototype/CampaignProductPicker.tsx\`
- Modify: \`web/src/prototype/navigation.ts\`
- Modify: \`web/src/prototype/translations-api.ts\`
- Modify: \`web/src/prototype/model.ts\`
- Modify: \`web/test/campaign-adapter.test.mjs\`
- Modify: \`web/test/campaign-detail.test.mjs\`
- Modify: \`web/test/campaign-list-formatting.test.mjs\`
- Modify: \`web/test/campaign-product-picker.test.mjs\`
- Modify: \`web/test/editor-preview-product.test.mjs\`
- Modify: \`web/test/editor-structure.test.mjs\`
- Modify: \`web/test/admin-i18n.test.mjs\`

**Interfaces:**
- Consumes: Task 2 products response, Task 3 update response, and Task 5 public copy/translation response shapes.
- Produces: unavailable selected product display, read-only campaign detail from row clicks, locale/campaign-timezone summaries, and cleared transient campaign dialogs on translation navigation.

- [ ] **Step 1: Write failing adapter tests for Worker responses**

\`\`\`js
test('maps an active update response without changing stored status to paused', () => {
  const campaign = toCampaign({ ...activePayload, name: 'Changed' });
  assert.equal(campaign.status, 'active');
});

test('maps missing selected products to unavailable display items', () => {
  assert.deepEqual(hydrateProducts(['1', '2'], { products: [product1], missingIds: ['2'] }), [product1, { id: '2', unavailable: true }]);
});
\`\`\`

- [ ] **Step 2: Run focused UI tests to verify they fail**

Run: \`npm run test:prototype -- campaign-adapter.test.mjs campaign-product-picker.test.mjs\`

Expected: FAIL because current UI assumes single-ID hydration or loses Worker update state.

- [ ] **Step 3: Implement Worker response adaptation and editor behavior**

\`\`\`ts
const response = await authenticatedFetch(\`/api/quantity-breaks/products?ids=\${encodeURIComponent(ids.join(','))}\`);
const hydrated = hydrateProducts(ids, await response.json());
\`\`\`

When saving active/scheduled campaigns use the original revision and editable values only; render Worker \`409 needs_reconciliation\` as a blocking error without retrying. Call \`event.stopPropagation()\` on inner menu/actions so they do not trigger the row detail navigation. Preserve the approved layout and tokens; do not redesign the page.

- [ ] **Step 4: Add UI behavior regression tests**

\`\`\`js
test('campaign row opens detail while row action does not navigate', () => {
  row.click();
  assert.equal(navigation.current, 'campaign-detail');
  actionButton.click();
  assert.equal(navigation.current, 'campaign-detail');
});

test('translation navigation clears campaign dialogs and preserves translation load state', () => {
  navigateToTranslations();
  assert.equal(editorState.productDialogOpen, false);
  assert.equal(translationsState.loading, true);
});
\`\`\`

- [ ] **Step 5: Run all affected web tests and build**

Run: \`npm run test:prototype -- campaign-adapter.test.mjs campaign-detail.test.mjs campaign-list-formatting.test.mjs campaign-product-picker.test.mjs editor-preview-product.test.mjs editor-structure.test.mjs admin-i18n.test.mjs\`

Run: \`npm run build\`

Expected: PASS; \`web/dist\` is regenerated but untracked/ignored.

- [ ] **Step 6: Capture local visual evidence**

Use the existing local preview to capture desktop 1440px and mobile 390px screenshots of list/detail, picker with unavailable selection, and translation navigation. Save screenshots under \`reference/screenshots/\` only when they show a verified state; otherwise retain prior evidence and record command results in \`docs/APP_PROGRESS.md\`.

- [ ] **Step 7: Commit UI parity**

\`\`\`zsh
git add web/src/pages/quantity-breaks.tsx web/src/pages/quantity-breaks.module.css web/src/prototype/campaign-adapter.ts web/src/prototype/campaign-api.ts web/src/prototype/CampaignEditor.tsx web/src/prototype/CampaignProductPicker.tsx web/src/prototype/navigation.ts web/src/prototype/translations-api.ts web/src/prototype/model.ts web/test/campaign-adapter.test.mjs web/test/campaign-detail.test.mjs web/test/campaign-list-formatting.test.mjs web/test/campaign-product-picker.test.mjs web/test/editor-preview-product.test.mjs web/test/editor-structure.test.mjs web/test/admin-i18n.test.mjs docs/APP_PROGRESS.md
git commit -m "feat(web): align campaign editor with worker APIs"
\`\`\`

### Task 7: Port Theme App Extension Pricing, Copy, and Cart Feedback

**Files:**
- Modify: \`theme-app-extension/blocks/app-block.html\`
- Modify: \`theme-app-extension/public/app-block.js\`
- Modify: \`theme-app-extension/public/app-block.css\`
- Modify: \`tests/theme-app-extension/app-block.test.mjs\`
- Modify: \`tests/theme-app-extension/widget-mount.test.mjs\`

**Interfaces:**
- Consumes: Task 5 public campaign \`{ copy, widget, tiers }\`, theme product/variant attributes, and documented theme cart endpoints.
- Produces: \`calculateSummary(tier, selections, variants)\`, \`notifyThemeCartUpdated(items, host)\`, and a mounted block with translated copy, actual product/variant/compare-at metadata, and one atomic cart add request.

- [ ] **Step 1: Write failing pricing and cart-notification tests**

\`\`\`js
test('calculates integer-minor-unit summaries for every discount type', () => {
  assert.equal(calculateSummary({ discountType: 'bundle_fixed_price', discountValue: 15000 }, ['a', 'b'], catalog).discounted, 15000);
});

test('notifies supported theme cart refresh and dispatches the application event after success', () => {
  notifyThemeCartUpdated([{ id: 'a', quantity: 2 }], host);
  assert.equal(host.cart.refreshCalls, 1);
  assert.equal(events[0].type, 'quantity-breaks:cart-updated');
});
\`\`\`

- [ ] **Step 2: Run theme tests to verify they fail**

Run: \`node --test tests/theme-app-extension/app-block.test.mjs tests/theme-app-extension/widget-mount.test.mjs\`

Expected: FAIL because pricing relies on floating display values, saved copy is not fully applied, or no post-add cart event is emitted.

- [ ] **Step 3: Add product metadata and integer pricing helpers**

\`\`\`js
function normalizePriceMinor(value) { return Math.round(Number(value) * 100); }
function calculateSummary(tier, ids, variants) {
  const original = ids.reduce((sum, id) => sum + compareAtOrPriceMinor(id, variants), 0);
  const subtotal = ids.reduce((sum, id) => sum + priceMinor(id, variants), 0);
  return applyTierToMinorUnits(tier, original, subtotal, ids.length, variants);
}
\`\`\`

Expose product title, variant title, compare-at price, price, availability, inventory policy/quantity, and image metadata from the block. Keep frontend totals explicitly estimated; checkout remains authoritative.

- [ ] **Step 4: Apply saved copy and cart notification after confirmed add**

\`\`\`js
if (result.status === 'added') {
  const items = buildCartItems(selectedItems, catalog.variants);
  notifyThemeCartUpdated(items, globalThis);
  status.textContent = copy('widget.cart_success', '{quantity} items were added as {lines} cart lines.', { quantity, lines: items.length });
}
\`\`\`

Use saved copy only as a validated override with stable fallbacks. Call a detected native theme cart adapter only after a complete confirmed result; dispatch \`quantity-breaks:cart-updated\` and a local \`cart:refresh\` fallback.

- [ ] **Step 5: Add narrow-layout test and adjust scoped CSS**

\`\`\`js
test('keeps each corner badge inside its own tier card at narrow width', async () => {
  await mountBlock(blockAt390px);
  assert.equal(block.querySelector('[data-tier-id="trio"] .qb-tier-badge')?.closest('[data-tier-id]')?.dataset.tierId, 'trio');
});
\`\`\`

Scope all variables under \`.quantity-breaks-app-block\`, make summary rows content-driven rather than fixed-height, and ensure 390px badges cannot overlap another tier.

- [ ] **Step 6: Run the complete theme test suite**

Run: \`node --test tests/theme-app-extension/app-block.test.mjs tests/theme-app-extension/widget-mount.test.mjs tests/theme-app-extension/structure.test.mjs\`

Expected: PASS.

- [ ] **Step 7: Commit theme extension parity**

\`\`\`zsh
git add theme-app-extension/blocks/app-block.html theme-app-extension/public/app-block.js theme-app-extension/public/app-block.css tests/theme-app-extension/app-block.test.mjs tests/theme-app-extension/widget-mount.test.mjs
git commit -m "feat(theme): align quantity break widget with worker data"
\`\`\`

### Task 8: Verify the Branch and Prepare, But Do Not Perform, Release Actions

**Files:**
- Modify: \`docs/APP_PROGRESS.md\`
- Modify: \`docs/superpowers/plans/2026-10-28-worker-parity-migration.md\`

**Interfaces:**
- Consumes: Tasks 1-7 and Worker worktree \`/Users/SL/.codex/worktrees/cloudflare-workers-d1/bundles-app-upsells-new\`.
- Produces: verified test evidence, a clean reviewable change set, and user-facing deployment/publish instructions without changing remote state.

- [ ] **Step 1: Run the full Worker, frontend, and theme verification matrix**

\`\`\`zsh
cd worker && npm test && npm run typecheck
cd ../web && npm run test:prototype && npm run build
cd .. && npm run test:theme
\`\`\`

Expected: all pass. Record actual results, test counts, Worker commit SHA, and screenshot paths in \`docs/APP_PROGRESS.md\`; do not claim real SHOPLINE store checks that did not happen.

- [ ] **Step 2: Inspect final diff and generated-artifact boundaries**

\`\`\`zsh
git status --short
git diff --check
git diff --stat
git ls-files --others --exclude-standard
git diff --cached --check
\`\`\`

Confirm \`web/dist\`, \`.env*\`, tokens, D1 exports, Wrangler logs, and \`node_modules\` are not staged. Confirm each source change belongs to the migration file map.

- [ ] **Step 3: Perform local visual QA**

Start the documented Worker-local preview. Inspect authenticated admin list/detail/editor, product picker, translations, and local theme fixture at 1440px and 390px. Capture screenshots and record only observations actually made. Fix verified visual defects with focused tests before proceeding.

- [ ] **Step 4: Update checkboxes and prepare the final migration commit**

\`\`\`zsh
git add docs/APP_PROGRESS.md docs/superpowers/plans/2026-10-28-worker-parity-migration.md
git commit -m "docs: record worker parity verification"
\`\`\`

Do not combine pre-existing Worker-worktree CSS changes unless they were reviewed as this migration's scope.

- [ ] **Step 5: Request explicit release approval**

Report branch, commits, changed files, passing commands, visual evidence, remaining real SHOPLINE checks, and the following approved-next-action commands:

\`\`\`zsh
npx wrangler@4.153.0 d1 migrations apply shopline-quantity-breaks --remote
npm run build --prefix web
npx wrangler@4.153.0 deploy
\`\`\`

Explain that \`sl extension push\` and partner-dashboard version publication are separate from Wrangler. Do not deploy, push Git, merge to \`main\`, or publish the extension until the user explicitly approves each external action.

## Self-Review

### Spec Coverage

- Worker-only runtime boundary and no Express import: Global Constraints, Tasks 1 and 8.
- Batch product lookup, order, and missing IDs: Task 2.
- Status-preserving same-ID update and definitive/uncertain failure boundaries: Task 3.
- Collection revalidation: Task 4.
- Safe translation errors and public saved copy: Task 5.
- Admin UI behavior and layout preservation: Task 6.
- Theme metadata, integer pricing, copy, cart event, and narrow layout: Task 7.
- Automated checks, visual evidence, artifact boundaries, and approval-only release: Task 8.

### Placeholder Scan

No \`TBD\`, \`TODO\`, “implement later”, “add appropriate error handling”, or undefined handoff appears in this plan. Every task names files, inputs/outputs, a failing-test command, a passing-test command, and its commit boundary.

### Type Consistency

- Task 1 defines \`updating\` and staged persistence for Tasks 3 and 5.
- Task 2 defines \`getCampaignProducts\` and \`{ products, missingIds }\` for Task 6.
- Task 3 defines update state APIs for the Hono campaign route.
- Task 4 performs collection verification before Task 3's \`beginUpdate\` side effect.
- Task 5's \`{ widgetTitle, copy }\` response is consumed by Task 7.

### Review Focus Coverage

- 51-ID batch: Task 2, Step 1.
- Timeout and retry block: Task 3, Steps 1 and 4.
- Changed discount ID: Task 3, Step 4.
- Changed collection member: Task 4, Step 1.
- Malformed or optional translation: Task 5, Step 1.
