# Feedback Review Visibility and Board Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make merchant feedback moderation-safe while delivering the confirmed responsive cards, suggestion dialog, detail dialog, comments, and withdrawal interaction.

**Architecture:** A D1 migration adds a durable review timestamp and moves legacy unreviewed public records to hidden. The Worker repository owns public, author-visible, and withdrawal predicates and returns a server-computed DTO. The React board consumes that contract through `feedback-api.ts`; its local CSS module implements the required shadcn-inspired visual treatment without adding shadcn or Tailwind dependencies.

**Tech Stack:** Cloudflare Workers, Hono, D1, TypeScript, Vitest, React 18, Vite, CSS Modules, Lucide.

**Spec:** `docs/superpowers/specs/2026-11-01-feedback-review-visibility-and-board-polish-design.md`

## Global Constraints

- Preserve the user-owned `.workspace` removal changes in `docs/APP_PROGRESS.md`, `web/src/pages/quantity-breaks.module.css`, `web/src/pages/quantity-breaks.tsx`, and `web/test/home-layout.test.mjs`.
- New feedback suggestions insert as `pending`, `hidden`, and `reviewed_at = NULL`; client values never select visibility, ownership, or review state.
- Public records are exactly `approved`, `in_progress`, or `released` records with `visibility = 'public'`.
- Author-visible records are current-store records excluding `hidden_reason = 'withdrawn_by_submitter'`; they may be hidden pending or rejected records.
- A withdrawal requires ownership, hidden pending status, null `reviewed_at`, and no prior withdrawal. The status endpoint writes `reviewed_at`, derived visibility, history, and audit data together.
- Suggestion limits are title `1..100` and content `1..400` Unicode code points; comments remain `1..2000` code points.
- No R2, attachment route, file uploader, or merchant-side official reply UI is added.
- Use existing local UI primitives and CSS Modules. Do not add a shadcn dependency, Tailwind, global design tokens, or a second component library.
- Do not add or modify `:focus`, `:focus-visible`, or related CSS rules.
- Do not stage, commit, push, deploy, or discard files until the user explicitly approves the fully reviewed final change set. The final approved commit includes only reviewed files.

## Review Focus

- A different authenticated store guessing a hidden pending/rejected ID receives `404`; route tests own this.
- Legacy public pending content is hidden by migration and does not appear in public list/search/count results; migration and repository tests own this.
- A same-status Developer Platform status write still locks withdrawal by setting `reviewed_at`; admin-route tests own this.
- A CJK IME composition reaches the final controlled draft without an interim character limit truncating it; jsdom component tests own this.
- A failed comment submission preserves the comment draft and never dereferences a null form reference; jsdom component tests own this.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `worker/migrations/0006_feedback_review_visibility.sql` | Production D1 schema migration, `reviewed_at`, indexes, and historical pending visibility conversion. |
| `worker/src/db/migrate.ts` | Test-schema compatibility and migration application equivalent to the production migration. |
| `worker/src/domain/feedback.ts` | 400-code-point suggestion validation and public-status visibility helper. |
| `worker/src/db/feedback.ts` | Viewer-scoped list/detail/count queries, comment counts, review transitions, server-computed withdrawal eligibility. |
| `worker/src/routes/feedback.ts` | Merchant route wiring for viewer-scoped repository calls and non-leaking unavailable withdrawal response. |
| `worker/src/routes/feedback-admin.ts` | Signed Developer Platform status transition integration. |
| `worker/test/migrations.test.ts` | Regression test for the review visibility migration. |
| `worker/test/feedback-repository.test.ts` | Repository behaviour, visibility isolation, migration data, and withdrawal tests. |
| `worker/test/feedback-routes.test.ts` | Authenticated merchant HTTP contract and secret-record isolation tests. |
| `worker/test/feedback-admin-routes.test.ts` | Internal status-to-visibility and reviewed-at HTTP contract tests. |
| `web/src/prototype/feedback-api.ts` | Shared merchant DTO types and feedback HTTP functions. |
| `web/src/prototype/FeedbackBoard.tsx` | Board cards, suggestion controlled form, counts, App Bridge success notification, and dialog coordination. |
| `web/src/prototype/FeedbackDetailDialog.tsx` | Detail metadata, comment counter/list, controlled comment form, and server-driven withdrawal action. |
| `web/src/prototype/FeedbackStatusFilters.tsx` | Semantic status-coloured filter buttons and count labels. |
| `web/src/pages/quantity-breaks.module.css` | Responsive card, dialog, form, border, badge, and contact-note styling. |
| `web/test/feedback-board.test.mjs` | Board and suggestion dialog render/interaction tests. |
| `web/test/feedback-preview.test.mjs` | CSS contract and detail dialog rendering tests. |
| `docs/APP_PROGRESS.md` | Evidence-backed completion note after code and UI verification. |

## Task 1: Lock the migration and input-validation contract

**Files:**
- Create: `worker/migrations/0006_feedback_review_visibility.sql`
- Modify: `worker/src/db/migrate.ts:186-208`
- Modify: `worker/src/domain/feedback.ts:21-27`
- Modify: `worker/test/migrations.test.ts`
- Modify: `worker/test/feedback-repository.test.ts`

**Interfaces:**
- Produces `isPublicFeedbackStatus(status: FeedbackStatus): boolean` and `visibilityForFeedbackStatus(status: FeedbackStatus): 'public' | 'hidden'` for repository status transitions.
- Produces `feedback_requests.reviewed_at TEXT` and indexes supporting public and author-only feedback queries.

- [ ] **Step 1: Write failing migration and validation tests**

```ts
it('hides legacy public pending feedback while keeping it unreviewed', async () => {
  await database.prepare("INSERT INTO feedback_requests (id, submitter_store_id, title, content, normalized_title, content_hash, status, visibility, vote_count, created_at, updated_at) VALUES ('legacy', 'store-a', 'Title', 'Body', 'title', 'hash', 'pending', 'public', 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')").run();
  await applyMigrations(database);
  await expect(database.prepare("SELECT visibility, reviewed_at FROM feedback_requests WHERE id = 'legacy'").first())
    .resolves.toEqual({ visibility: 'hidden', reviewed_at: null });
});

it('rejects a 401-code-point suggestion body', () => {
  expect(() => normalizeSuggestionContent('文'.repeat(401))).toThrow('Content must be between 1 and 400 characters.');
});
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `cd worker && npm test -- --run test/migrations.test.ts test/feedback-repository.test.ts`

Expected: the queried `reviewed_at` column is missing and the 401-character body is accepted.

- [ ] **Step 3: Add the production and test migration**

```sql
ALTER TABLE feedback_requests ADD COLUMN reviewed_at TEXT;
UPDATE feedback_requests
SET visibility = 'hidden', hidden_reason = COALESCE(hidden_reason, 'awaiting_review')
WHERE status = 'pending' AND visibility = 'public' AND COALESCE(hidden_reason, '') <> 'withdrawn_by_submitter';
CREATE INDEX IF NOT EXISTS idx_feedback_author_visible
  ON feedback_requests (submitter_store_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_public_reviewed
  ON feedback_requests (visibility, status, created_at DESC, id DESC);
```

Mirror the column check and update in `applyMigrations()` so Miniflare test databases that start from older schema definitions get the same result. Change `normalizeSuggestionContent` to call `normalizeFeedbackText(value, 1, 400, 'Content')`.

- [ ] **Step 4: Add status helpers and pass the focused tests**

```ts
export function isPublicFeedbackStatus(status: FeedbackStatus): boolean {
  return status === 'approved' || status === 'in_progress' || status === 'released';
}

export function visibilityForFeedbackStatus(status: FeedbackStatus): 'public' | 'hidden' {
  return isPublicFeedbackStatus(status) ? 'public' : 'hidden';
}
```

Run: `cd worker && npm test -- --run test/migrations.test.ts test/feedback-repository.test.ts`

Expected: PASS.

## Task 2: Make repository visibility and review predicates authoritative

**Files:**
- Modify: `worker/src/db/feedback.ts:1-285`
- Modify: `worker/test/feedback-repository.test.ts`

**Interfaces:**
- Consumes `visibilityForFeedbackStatus` and the schema from Task 1.
- Produces `PublicFeedbackSummary.commentCount: number`, `PublicFeedbackDetail.canWithdraw: boolean`, `listForViewer(viewerStoreId, filters)`, `countForViewer(viewerStoreId, mineOnly)`, and `readDetailForViewer(id, viewerStoreId)`.

- [ ] **Step 1: Write failing repository tests for visibility isolation and server DTOs**

```ts
it('returns a hidden pending submission only to its author in the mine scope', async () => {
  await repository.createSuggestion({ storeId: 'store-a', handle: 'a-shop', title: 'Private', content: 'Needs review', idempotencyKey: 'private-key' });
  await expect(repository.listForViewer('store-b', {})).resolves.toMatchObject({ items: [] });
  await expect(repository.listForViewer('store-a', { mine: true })).resolves.toMatchObject({
    items: [{ title: 'Private', status: 'pending', isMine: true, commentCount: 0 }],
  });
});

it('does not let a reviewed pending record be withdrawn', async () => {
  const created = await repository.createSuggestion({ storeId: 'store-a', handle: 'a-shop', title: 'Private', content: 'Needs review', idempotencyKey: 'review-key' });
  await repository.updateStatus({ requestId: created.id, status: 'pending', note: 'Reviewed but held.' });
  await expect(repository.withdrawSuggestion(created.id, 'store-a')).resolves.toBe(false);
});
```

- [ ] **Step 2: Run the repository test and verify it fails**

Run: `cd worker && npm test -- --run test/feedback-repository.test.ts`

Expected: creation is still public, hidden author records cannot be read, and a same-status review leaves the item withdrawable.

- [ ] **Step 3: Replace public-only repository reads with explicit viewer scopes**

```ts
const publicWhere = "f.visibility = 'public' AND f.status IN ('approved', 'in_progress', 'released')";
const mineWhere = "f.submitter_store_id = ? AND COALESCE(f.hidden_reason, '') <> 'withdrawn_by_submitter'";

async listForViewer(viewerStoreId: string, filters: FeedbackFilters = {}): Promise<PublicFeedbackList> {
  const where = [filters.mine ? mineWhere : publicWhere];
  // Bind viewerStoreId only for mine scope; retain parameterized status and search filters.
}

const canWithdraw = row.submitter_store_id === viewerStoreId
  && row.status === 'pending'
  && row.visibility === 'hidden'
  && row.reviewed_at === null
  && row.hidden_reason !== 'withdrawn_by_submitter';
```

Expand `FeedbackRow` to include `visibility`, `hidden_reason`, `reviewed_at`, and `comment_count`. Select `COUNT(*)` from `feedback_comments` for each list/detail row, map it to `commentCount`, and map the predicate to `canWithdraw` only in the detail DTO. Use the same scope in `countForViewer`; `mineCount` excludes merchant-withdrawn data.

- [ ] **Step 4: Change write operations to match review policy**

```ts
VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'hidden', 0, ?, ?)

UPDATE feedback_requests
SET status = ?, visibility = ?, reviewed_at = ?, updated_at = ?
WHERE id = ?

UPDATE feedback_requests
SET visibility = 'hidden', hidden_reason = 'withdrawn_by_submitter', hidden_at = ?, hidden_by_admin_id = 'submitter', updated_at = ?
WHERE id = ? AND submitter_store_id = ? AND status = 'pending'
  AND visibility = 'hidden' AND reviewed_at IS NULL
  AND COALESCE(hidden_reason, '') <> 'withdrawn_by_submitter'
```

`updateStatus` always writes a status-history and audit row, even when the requested status equals the stored status. It derives visibility through `visibilityForFeedbackStatus`, writes the current timestamp to `reviewed_at`, and returns a repository DTO without requiring public visibility. Vote, merchant-comment, and official-reply lookups use the public predicate, not merely `visibility = 'public'`.

- [ ] **Step 5: Run repository tests and typecheck**

Run: `cd worker && npm test -- --run test/feedback-repository.test.ts && npm run typecheck`

Expected: PASS.

## Task 3: Wire the merchant and Developer Platform HTTP contracts

**Files:**
- Modify: `worker/src/routes/feedback.ts:34-124`
- Modify: `worker/src/routes/feedback-admin.ts:12-40`
- Modify: `worker/test/feedback-routes.test.ts`
- Modify: `worker/test/feedback-admin-routes.test.ts`

**Interfaces:**
- Consumes Task 2 `listForViewer`, `countForViewer`, `readDetailForViewer`, and `updateStatus`.
- Produces stable REST responses with `commentCount` and `canWithdraw`, while non-owner hidden lookups remain `404`.

- [ ] **Step 1: Write failing route tests**

```ts
it('returns 404 when another authenticated merchant reads an author-only suggestion', async () => {
  const response = await worker.fetch(new Request(`${origin}/api/quantity-breaks/feedback/${privateId}`, { headers: otherMerchantHeaders }), testEnv, ctx);
  expect(response.status).toBe(404);
});

it('publishes approved status and records its review timestamp', async () => {
  const response = await worker.fetch(await signedRequest(`/internal/admin/v1/feedback/${feedbackId}/status`, { status: 'approved' }, crypto.randomUUID(), 'PATCH'), testEnv, ctx);
  expect(response.status).toBe(200);
  await expect(testEnv.DB.prepare('SELECT visibility, reviewed_at FROM feedback_requests WHERE id = ?').bind(feedbackId).first())
    .resolves.toMatchObject({ visibility: 'public', reviewed_at: expect.any(String) });
});
```

- [ ] **Step 2: Run focused routes and verify failure**

Run: `cd worker && npm test -- --run test/feedback-routes.test.ts test/feedback-admin-routes.test.ts`

Expected: a non-owner can still receive public-pending content or approved status does not update visibility/review timestamp.

- [ ] **Step 3: Use viewer-scoped repository calls and avoid policy leaks**

```ts
const mineOnly = mine === '1';
const [result, counts, ownCounts] = await Promise.all([
  repository.listForViewer(store.storeId, { status: status as FeedbackStatus | undefined, sort: sort as 'newest' | 'votes' | undefined, query: query || undefined, mine: mineOnly, page, pageSize }),
  repository.countForViewer(store.storeId, mineOnly),
  repository.countForViewer(store.storeId, true),
]);

const feedback = await repository.readDetailForViewer(id, store.storeId);
return feedback ? c.json({ data: { feedback } }) : c.json({ error: 'Not found' }, 404);
```

Keep POST validation in the Worker. Keep the authenticated ID and HMAC checks unchanged. Change an ineligible withdrawal response to `404` so it does not reveal a record's review condition. Do not create a browser route for official replies.

- [ ] **Step 4: Run route tests and Worker typecheck**

Run: `cd worker && npm test -- --run test/feedback-routes.test.ts test/feedback-admin-routes.test.ts && npm run typecheck`

Expected: PASS.

## Task 4: Extend the frontend feedback API contract

**Files:**
- Modify: `web/src/prototype/feedback-api.ts:1-76`
- Modify: `web/test/feedback-board.test.mjs`

**Interfaces:**
- Consumes Worker DTO fields `commentCount` and `canWithdraw`.
- Produces typed `FeedbackSummary.commentCount`, `FeedbackDetail.commentCount`, `FeedbackDetail.canWithdraw`, and `formatFeedbackTimestamp(iso: string): string`.

- [ ] **Step 1: Write failing type/render contract tests**

```js
assert.match(html, /2 条评论/);
assert.match(html, /2026\/10\/29 08:00:00/);
```

Use deterministic ISO input (`2026-10-29T00:00:00.000Z`) and mock `Intl.DateTimeFormat` or test the pure formatter with an explicit `timeZone: 'Asia/Shanghai'` so the assertion is host-independent.

- [ ] **Step 2: Run the frontend focused test and verify failure**

Run: `cd web && npm run test:prototype -- --test-name-pattern "comment count|timestamp"`

Expected: FAIL because the DTO has no comment count and card dates omit seconds.

- [ ] **Step 3: Add the DTO fields and safe timestamp helper**

```ts
export type FeedbackSummary = { /* existing fields */ commentCount: number };
export type FeedbackDetail = { /* existing fields */ commentCount: number; canWithdraw: boolean };

export function formatFeedbackTimestamp(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(new Date(value));
}
```

Do not infer `canWithdraw` on the client. Retain `postComment` JSON payload and all App Bridge-aware fetch behaviour.

- [ ] **Step 4: Run the focused frontend test**

Run: `cd web && npm run test:prototype -- --test-name-pattern "comment count|timestamp"`

Expected: PASS.

## Task 5: Implement controlled composition-safe suggestion submission

**Files:**
- Modify: `web/src/prototype/FeedbackBoard.tsx:1-200`
- Modify: `web/test/feedback-board.test.mjs`

**Interfaces:**
- Consumes `createSuggestion({ title, content, isAnonymous, idempotencyKey })` and App Bridge `notify`.
- Produces a `SubmitFeedbackDialog` with controlled `title`, `content`, `isAnonymous`, composition state, counters, disabled submit state, and icon-only close action.

- [ ] **Step 1: Write failing jsdom tests for form state**

```js
assert.equal(submit.disabled, true);
title.dispatchEvent(new dom.window.CompositionEvent('compositionstart', { bubbles: true }));
title.value = '多件优惠';
title.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
title.dispatchEvent(new dom.window.CompositionEvent('compositionend', { bubbles: true }));
assert.match(document.body.textContent, /4\/100/);
assert.equal(submit.disabled, false);
```

Cover blank title, blank content, 400-code-point content counter, anonymous payload, close control label, and success calling `notify('提交成功', 'success')` after the POST resolves.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `cd web && npm run test:prototype -- --test-name-pattern "composition|提交建议|counter"`

Expected: FAIL because the existing uncontrolled form has no counter or composition state.

- [ ] **Step 3: Convert the dialog to controlled input state**

```tsx
const [title, setTitle] = useState('');
const [content, setContent] = useState('');
const [isComposing, setIsComposing] = useState(false);
const canSubmit = title.trim().length > 0 && content.trim().length > 0 && !isSubmitting;

<input value={title} onCompositionStart={() => setIsComposing(true)}
  onCompositionEnd={(event) => { setIsComposing(false); setTitle(limitCodePoints(event.currentTarget.value, 100)); }}
  onChange={(event) => setTitle(isComposing ? event.target.value : limitCodePoints(event.target.value, 100))} />
```

Use `Array.from()` in `limitCodePoints` and `countCodePoints`. Do not use `maxLength` to truncate an active IME composition. Apply the same composition-safe approach to content at 400 code points. Disable submit until both trimmed fields are present; retain server error text and do not clear user drafts on failure.

- [ ] **Step 4: Run form tests**

Run: `cd web && npm run test:prototype -- --test-name-pattern "composition|提交建议|counter"`

Expected: PASS.

## Task 6: Implement detail dialog metadata, safe comments, and withdrawal control

**Files:**
- Modify: `web/src/prototype/FeedbackDetailDialog.tsx:1-180`
- Modify: `web/src/prototype/FeedbackBoard.tsx:115-178`
- Modify: `web/test/feedback-board.test.mjs`

**Interfaces:**
- Consumes `FeedbackDetail.canWithdraw`, `FeedbackDetail.commentCount`, and `formatFeedbackTimestamp`.
- Produces `onWithdraw` only when server permission is true and uses controlled comment state (`content`, `isAnonymous`) rather than a form `reset()` reference.

- [ ] **Step 1: Write failing detail-dialog tests**

```js
assert.match(html, /2 条评论/);
assert.match(html, /提交评论/);
assert.match(html, /多件折扣/);
assert.match(html, /撤销建议/);
assert.doesNotMatch(renderWithoutPermission, /撤销建议/);
assert.equal(commentSubmit.disabled, true);
```

Add a rejecting `onCommentSubmit` test that asserts the textarea still contains its text and an error is rendered. Keep the existing success test but assert the controlled state clears without any `.reset()` call.

- [ ] **Step 2: Run the focused dialog tests and verify failure**

Run: `cd web && npm run test:prototype -- --test-name-pattern "comment composer|撤销建议|评论"`

Expected: FAIL because the action is derived from local state and the current component uses a form reset reference.

- [ ] **Step 3: Implement the final dialog sequence**

```tsx
{detail.canWithdraw && <Button type="button" variant="quiet" className={styles.feedbackWithdrawButton} onClick={() => setConfirmingWithdraw(true)}>撤销建议</Button>}
<div className={styles.feedbackCommentDivider}><span />{detail.commentCount} 条评论<span /></div>
<Button type="submit" disabled={!comment.trim() || isSubmitting}>{isSubmitting ? '提交中' : '提交评论'}</Button>
```

Render title, status, full content, author, and second-precision timestamp before actions. Render merchant comments and official replies in chronological order. Use the existing `BadgeCheck` icon for `多件折扣`; do not add a merchant official-reply affordance. In `FeedbackBoard`, increase `detail.commentCount` after successful comment creation and call the existing success notification. On withdrawal, close the detail, remove the card/count through a reload, and show the existing success notification.

- [ ] **Step 4: Run detail-dialog tests**

Run: `cd web && npm run test:prototype -- --test-name-pattern "comment composer|撤销建议|评论"`

Expected: PASS.

## Task 7: Complete card/filter/contact visual treatment

**Files:**
- Modify: `web/src/prototype/FeedbackBoard.tsx:152-179`
- Modify: `web/src/prototype/FeedbackStatusFilters.tsx:1-57`
- Modify: `web/src/pages/quantity-breaks.module.css:961-1054`
- Modify: `web/test/feedback-preview.test.mjs`
- Modify: `web/test/feedback-board.test.mjs`

**Interfaces:**
- Consumes `commentCount`, `isMine`, `feedbackStatusLabels`, and `formatFeedbackTimestamp`.
- Produces status-specific card borders/filter classes, 3/2/1 responsive columns, a centered seconds timestamp, and a visible contact note.

- [ ] **Step 1: Write failing render and CSS tests**

```js
assert.doesNotMatch(html, /id="feedback-list-title"/);
assert.match(html, /2458472041@qq\.com/);
assert.match(html, /评论 2/);
assert.match(css, /\.feedbackCardapproved\s*\{[^}]*border-color/);
assert.match(css, /\.feedbackStatusFilterpending\s*\{[^}]*color/);
assert.match(css, /@media \(max-width: 767px\)[^]*\.feedbackList\s*\{[^}]*column-count:\s*1/);
```

- [ ] **Step 2: Run the focused visual contract tests and verify failure**

Run: `cd web && npm run test:prototype -- --test-name-pattern "feedback cards|feedback styles|contact|状态"`

Expected: FAIL because the old heading remains, cards omit comment count/seconds, and status-specific border/filter selectors are absent.

- [ ] **Step 3: Update semantic markup and styles**

```tsx
<article className={`${styles.feedbackCard} ${styles[`feedbackCard${item.status}`]}`}>
  <div className={styles.feedbackCardTop}>
    <span className={`${styles.feedbackStatus} ${styles[`feedbackStatus${item.status}`]}`}>{feedbackStatusLabels[item.status]}</span>
    {item.isMine && <span className={styles.feedbackMineBadge}><UserRoundCheck size={12} aria-hidden="true" />我的</span>}
  </div>
  <footer className={styles.feedbackCardFooter}>
    <span><MessageCircle size={14} aria-hidden="true" />评论 {item.commentCount}</span>
    <button className={styles.feedbackVote}>{item.voted ? `已投票 ${item.voteCount}` : `投票 ${item.voteCount}`}</button>
  </footer>
  <time className={styles.feedbackCardTime}>{formatFeedbackTimestamp(item.createdAt)}</time>
</article>
```

Remove the `aria-labelledby="feedback-list-title"` dependency and its heading. Add a neutral contact-note element with `2458472041@qq.com`. Use CSS columns with `column-count: 3`, `2` at `1100px`, and `1` at `767px`; maintain `break-inside: avoid`. Implement semantic border and filter text classes for all five statuses. Do not add focus pseudo-class declarations or change unrelated user CSS.

- [ ] **Step 4: Run the focused visual contract tests**

Run: `cd web && npm run test:prototype -- --test-name-pattern "feedback cards|feedback styles|contact|状态"`

Expected: PASS.

## Task 8: Full verification, visual evidence, and progress record

**Files:**
- Modify: `docs/APP_PROGRESS.md`
- Verify: all files from Tasks 1--7 plus preserved `.workspace` files.

**Interfaces:**
- Consumes the completed Worker and web application.
- Produces test/build evidence and an accurate progress note; it does not assert an unexecuted SHOPLINE or Developer Platform integration.

- [ ] **Step 1: Run targeted and full automated verification**

Run:

```bash
cd worker && npm test -- --run test/migrations.test.ts test/feedback-repository.test.ts test/feedback-routes.test.ts test/feedback-admin-routes.test.ts
cd worker && npm run typecheck
cd web && npm run test:prototype
cd web && npm run build
git diff --check
```

Expected: every completed command exits `0`. If the known Cloudflare fake-timer bootstrap failure prevents the Worker suite from beginning, capture the exact command/error and run the unaffected typecheck and web checks; do not claim Worker tests passed.

- [ ] **Step 2: Capture desktop and mobile UI evidence**

Start Vite on an unused local port, open `/quantity-breaks/feedback`, and capture screenshots at `1037px` and `390px` with deterministic board data. Retain them in the project evidence location or document the actual tooling constraint if a browser capture tool is unavailable. Inspect the three/two/one-column transitions, two-line body clamp, full title, status border, bottom timestamp, form disabled states, CJK composition, dialog scroll, and blurred backdrop.

- [ ] **Step 3: Update progress only with completed evidence**

Add one dated `docs/APP_PROGRESS.md` entry naming the route, user-visible behaviour, exact test/build results, screenshot locations or unavailable-tool limitation, and unverified real SHOPLINE/Developer Platform integration boundaries.

- [ ] **Step 4: Review the final change set before requesting release approval**

Run:

```bash
git status --short
git diff --stat
git diff --check
git diff -- docs/superpowers/specs/2026-11-01-feedback-review-visibility-and-board-polish-design.md docs/superpowers/plans/2026-11-01-feedback-review-visibility-and-board-polish.md worker web
```

List modified and untracked files, distinguish preserved user changes from this feature, scan staged candidates for secrets, propose one commit message, and ask exactly: `本次代码/文档已在本地更新，是否推送到 GitHub？` Do not deploy until the approved commit is pushed and deployment credentials/configuration have been inspected.
