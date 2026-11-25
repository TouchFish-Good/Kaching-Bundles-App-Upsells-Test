# Feedback Comments and Attachments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persistent merchant comments, optional anonymous identity, private image attachments and Developer Platform-created official replies to the authenticated feedback detail flow.

**Architecture:** D1 is the source of truth for feedback, comment, attachment and reply metadata; a private R2 binding holds attachment bytes. Merchant routes derive the author from the SHOPLINE session; the signed internal route derives every reply's fixed official identity. The real page lives inside the existing `/quantity-breaks` shell, while `/preview/feedback-board` remains a non-persistent preview.

**Tech Stack:** Cloudflare Workers, Hono, D1, R2, Vitest/Miniflare, React 18, Vite, App Bridge authenticated fetch, CSS Modules, lucide-react.

**Spec:** `docs/superpowers/specs/2026-10-29-feedback-comments-and-attachments-design.md`

## Global Constraints

- Merchant comments are normalized plain text, 1--2,000 Unicode code points; official replies are 1--5,000.
- A comment accepts zero to five attachments, each at most 5 MB and together at most 25 MB; only `.jpeg`, `.jpg`, `.png`, and `.svg` are allowed.
- Non-anonymous comments show the authenticated handle snapshot; anonymous comments show exactly `匿名用户`.
- Merchant DTOs must not contain `store_id`, an anonymous handle, R2 object keys, internal nonces, developer provenance or secrets.
- Official replies are always `多件折扣` and `isOfficial: true`; the UI renders `BadgeCheck`.
- R2 stays private. JPEG/PNG are read through the authenticated Worker; SVG is download-only.
- Do not add or modify `:focus`, `:focus-visible` or related CSS rules.
- Do not provision R2, apply a production migration, deploy, or push without separate user approval.

## Review Focus

- Anonymous comments must not leak the handle through a detail DTO, attachment response or DOM. Tasks 2, 3 and 5.
- Multipart fields, filenames and MIME types must not select identity, official status, object keys or unsupported files. Task 3.
- A D1 failure after R2 upload must delete every newly uploaded object. Task 3.
- Hidden feedback and its attachments must be indistinguishable from nonexistent resources. Task 3.
- A Developer Platform caller cannot forge a visible author or replay a signed official reply. Task 4.

### Task 1: Feedback Schema and Private R2 Binding

**Files:**
- Create: `worker/migrations/0004_feedback_board.sql`
- Modify: `worker/src/db/migrate.ts`, `worker/src/env.ts`, `worker/wrangler.toml`, `worker/vitest.config.ts`
- Modify: `worker/test/migrations.test.ts`, `worker/test/migration-sql-check.mjs`

**Interfaces:** Adds `Env['FEEDBACK_ATTACHMENTS']: R2Bucket`; D1 tables `feedback_requests`, `feedback_votes`, `feedback_submission_keys`, `feedback_status_history`, `feedback_replies`, `feedback_comments`, `feedback_comment_attachments`, `feedback_rate_limits`, and `feedback_admin_audit_logs`.

- [ ] **Step 1: Write the failing test**

```ts
it('creates feedback discussion storage and the attachment binding', async () => {
  await applyMigrations(database);
  const tables = await database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all<{ name: string }>();
  expect(tables.results.map((row) => row.name)).toEqual(expect.arrayContaining([
    'feedback_requests', 'feedback_replies', 'feedback_comments', 'feedback_comment_attachments',
  ]));
  await (env as Env).FEEDBACK_ATTACHMENTS.put('probe', 'ok');
  await expect((env as Env).FEEDBACK_ATTACHMENTS.get('probe')).resolves.toMatchObject({ size: 2 });
});
```

- [ ] **Step 2: Verify RED**

Run: `npm --prefix worker test -- migrations.test.ts`

Expected: FAIL because neither feedback storage nor the R2 binding exists.

- [ ] **Step 3: Implement the schema and binding**

Create the deployed SQL migration and append the same idempotent DDL to `applyMigrations` for the test database. Add FK relationships, CHECK constraints, indexes for visibility/sort/detail traversal, and vote triggers. Add the Worker configuration:

```toml
[[r2_buckets]]
binding = "FEEDBACK_ATTACHMENTS"
bucket_name = "shopline-quantity-breaks-feedback-attachments"
```

Configure Miniflare with `r2Buckets: ['FEEDBACK_ATTACHMENTS']`. The bucket remains private and has no public route.

- [ ] **Step 4: Verify GREEN**

Run: `npm --prefix worker test -- migrations.test.ts && npm --prefix worker run test:module-boundaries`

Expected: PASS with all feedback tables and an isolated R2 object available in tests.

- [ ] **Step 5: Commit**

```bash
git add worker/migrations/0004_feedback_board.sql worker/src/db/migrate.ts worker/src/env.ts worker/wrangler.toml worker/vitest.config.ts worker/test/migrations.test.ts worker/test/migration-sql-check.mjs
git commit -m "feat: add feedback discussion storage"
```

### Task 2: Feedback Domain, Repository and Trusted Store Identity

**Files:**
- Create: `worker/src/domain/feedback.ts`, `worker/src/db/feedback.ts`, `worker/test/feedback-repository.test.ts`
- Modify: `worker/src/db/sessions.ts`, `worker/test/session-auth.test.ts`

**Interfaces:** Adds `normalizeFeedbackText`, `FeedbackValidationError`, `D1FeedbackRepository`, and `D1SessionStore.getActiveStoreIdentity(handle): Promise<{ storeId: string; handle: string } | null>`.

- [ ] **Step 1: Write the failing repository test**

```ts
it('projects anonymous comments without their handle and snapshots visible handles', async () => {
  const feedback = await repository.createSuggestion({ storeId: '1', handle: 'author', title: 'Title', content: 'Body', idempotencyKey: 'key-1' });
  await repository.createComment({ requestId: feedback.id, storeId: '2', handle: 'visible-shop', content: 'Visible', isAnonymous: false, attachments: [] });
  await repository.createComment({ requestId: feedback.id, storeId: '3', handle: 'secret-shop', content: 'Hidden', isAnonymous: true, attachments: [] });
  const detail = await repository.readPublicDetail(feedback.id, '4');
  expect(detail?.comments).toEqual(expect.arrayContaining([
    expect.objectContaining({ authorLabel: 'visible-shop' }),
    expect.objectContaining({ authorLabel: '匿名用户' }),
  ]));
  expect(JSON.stringify(detail)).not.toContain('secret-shop');
});
```

- [ ] **Step 2: Verify RED**

Run: `npm --prefix worker test -- feedback-repository.test.ts`

Expected: FAIL because the repository and safe projection do not exist.

- [ ] **Step 3: Implement the domain boundary**

Normalize plain text, bind every SQL value, generate server IDs, and centralize public DTO mapping. Resolve the active store identity only through the server-side session/admin-store record. Public comments derive their label with:

```ts
const authorLabel = row.is_anonymous === 1 ? '匿名用户' : row.author_handle_snapshot;
```

Implement list/detail/suggestion/vote/comment/attachment/reply repository methods. Detail queries return `null` for hidden feedback and never select trusted identities or object keys into merchant DTOs.

- [ ] **Step 4: Verify GREEN**

Run: `npm --prefix worker test -- feedback-repository.test.ts session-auth.test.ts`

Expected: PASS; identity is server-derived, visible handles are snapshots and anonymous details contain no handle.

- [ ] **Step 5: Commit**

```bash
git add worker/src/domain/feedback.ts worker/src/db/feedback.ts worker/src/db/sessions.ts worker/test/feedback-repository.test.ts worker/test/session-auth.test.ts
git commit -m "feat: add feedback discussion repository"
```

### Task 3: Merchant Feedback and Attachment APIs

**Files:**
- Create: `worker/src/routes/feedback.ts`, `worker/test/feedback-routes.test.ts`
- Modify: `worker/src/auth/rate-limit.ts`, `worker/src/index.ts`, `worker/test/routes-contract.test.ts`

**Interfaces:** Adds list, suggestion submit, detail, vote, `POST /api/quantity-breaks/feedback/:id/comments`, and `GET /api/quantity-breaks/feedback/attachments/:attachmentId`; adds `requireFeedbackRateLimit(database, storeId, route, now)`.

- [ ] **Step 1: Write failing route tests**

```ts
it('creates an anonymous comment with a private PNG attachment', async () => {
  const form = new FormData();
  form.set('content', 'Please add this feature.');
  form.set('isAnonymous', 'true');
  form.append('attachments', new File([new Uint8Array([137, 80, 78, 71])], 'proof.png', { type: 'image/png' }));
  const response = await merchantFetch(`/api/quantity-breaks/feedback/${feedbackId}/comments`, { method: 'POST', body: form });
  expect(response.status).toBe(201);
  await expect(response.json()).resolves.toMatchObject({ data: { comment: { authorLabel: '匿名用户', attachments: [{ filename: 'proof.png' }] } } });
});

it('rejects an unsupported, oversized or signature-mismatched file without storing R2 data', async () => {
  // Submit image/gif, a 5 MB + 1 byte PNG, and text renamed to .png; expect 422 and an empty bucket.
});
```

- [ ] **Step 2: Verify RED**

Run: `npm --prefix worker test -- feedback-routes.test.ts`

Expected: FAIL because the feedback routes are unregistered.

- [ ] **Step 3: Implement authenticated routes and object lifecycle**

Authenticate, resolve store identity, and rate-limit each merchant route. Parse multipart once; validate comment text, five-file count, 25 MB total, filename extension, declared MIME and byte length before R2 write. Verify JPEG begins with `FF D8 FF` and PNG with `89 50 4E 47 0D 0A 1A 0A`; only permit SVG as a UTF-8 XML/text payload because it will always be download-only. Use only generated random object keys. Upload to R2, persist D1 metadata, and delete all newly uploaded keys when metadata persistence fails.

Use this allowlist:

```ts
const allowedTypes = new Map([
  ['image/jpeg', ['.jpeg', '.jpg']],
  ['image/png', ['.png']],
  ['image/svg+xml', ['.svg']],
]);
```

Authenticate attachment reads, return `404` for hidden/missing feedback, send `X-Content-Type-Options: nosniff`, and force SVG to `application/octet-stream` with `Content-Disposition: attachment`. JPEG/PNG must not reveal bucket URLs or object keys.

- [ ] **Step 4: Verify GREEN**

Run: `npm --prefix worker test -- feedback-routes.test.ts routes-contract.test.ts && npm --prefix worker run typecheck`

Expected: PASS; bad uploads leave no object, hidden resources stay hidden, and merchant DTOs are safe.

- [ ] **Step 5: Commit**

```bash
git add worker/src/routes/feedback.ts worker/src/auth/rate-limit.ts worker/src/index.ts worker/test/feedback-routes.test.ts worker/test/routes-contract.test.ts
git commit -m "feat: add merchant feedback discussion APIs"
```

### Task 4: Signed Developer-Platform Official Reply API

**Files:**
- Create: `worker/src/auth/internal-request.ts`, `worker/src/routes/feedback-admin.ts`, `worker/test/feedback-admin-routes.test.ts`
- Modify: `worker/src/routes/internal-admin.ts`, `worker/src/index.ts`

**Interfaces:** Adds `authorizeInternalRequest(request, env): Promise<boolean>` and `POST /internal/admin/v1/feedback/:id/replies`, accepting only `{ content: string }`.

- [ ] **Step 1: Write failing authorization tests**

```ts
it('creates a reply with fixed official identity', async () => {
  const response = await signedInternalFetch('POST', `/internal/admin/v1/feedback/${feedbackId}/replies`, { content: '已加入开发计划。', authorLabel: 'forged' });
  expect(response.status).toBe(201);
  await expect(response.json()).resolves.toEqual({ data: { reply: expect.objectContaining({ authorLabel: '多件折扣', isOfficial: true }) } });
});

it('rejects a replayed nonce', async () => {
  // Reuse a valid signed request and expect 401.
});
```

- [ ] **Step 2: Verify RED**

Run: `npm --prefix worker test -- feedback-admin-routes.test.ts`

Expected: FAIL because no shared internal authorizer or reply route exists.

- [ ] **Step 3: Implement the internal boundary**

Extract the existing method/path/query/timestamp/nonce HMAC verification and one-time nonce storage from `internal-admin.ts`; preserve its 60-second window. Both existing read routes and the new official-reply route use that shared utility. The repository ignores request identity fields and returns only:

```ts
{ authorLabel: '多件折扣', isOfficial: true, content, createdAt }
```

- [ ] **Step 4: Verify GREEN**

Run: `npm --prefix worker test -- feedback-admin-routes.test.ts && npm --prefix worker run typecheck`

Expected: PASS; invalid or replayed signatures fail and accepted replies cannot impersonate another author.

- [ ] **Step 5: Commit**

```bash
git add worker/src/auth/internal-request.ts worker/src/routes/feedback-admin.ts worker/src/routes/internal-admin.ts worker/src/index.ts worker/test/feedback-admin-routes.test.ts
git commit -m "feat: add official feedback replies"
```

### Task 5: Real Board, Detail Dialog and Multipart Composer

**Files:**
- Create: `web/src/prototype/feedback-api.ts`, `web/src/prototype/FeedbackBoard.tsx`, `web/src/prototype/FeedbackDetailDialog.tsx`, `web/test/feedback-board.test.mjs`
- Modify: `web/src/prototype/model.ts`, `web/src/prototype/navigation.ts`, `web/src/pages/quantity-breaks.tsx`, `web/src/pages/quantity-breaks.module.css`

**Interfaces:** Adds typed feedback API helpers plus `FeedbackBoard` and `FeedbackDetailDialog`; adds real workspace route `/quantity-breaks/feedback` but retains `/preview/feedback-board` as a preview-only route.

- [ ] **Step 1: Write the failing UI test**

```js
test('renders official replies, anonymous comments and the safe upload affordance', async () => {
  const { FeedbackDetailDialog } = await vite.ssrLoadModule('/src/prototype/FeedbackDetailDialog.tsx');
  const html = renderToStaticMarkup(React.createElement(FeedbackDetailDialog, {
    detail: fixture({ comments: [{ authorLabel: '匿名用户', content: 'Comment', attachments: [] }], replies: [{ authorLabel: '多件折扣', isOfficial: true, content: 'Reply' }] }),
    onClose: () => {}, onVote: () => {}, onCommentSubmit: async () => {},
  }));
  assert.match(html, /匿名用户/);
  assert.match(html, /多件折扣/);
  assert.match(html, /点击此处进行上传，或者直接拖拽文件至指定位置。/);
  assert.match(html, /\.jpeg、\.jpg、\.png、\.svg/);
  assert.match(html, /5MB/);
});
```

- [ ] **Step 2: Verify RED**

Run: `npm --prefix web exec -- node --test test/feedback-board.test.mjs`

Expected: FAIL because the actual board and detail components do not exist.

- [ ] **Step 3: Implement the real merchant flow**

Add a `feedback` location to the established workspace shell. The typed API client uses `useAuthenticatedFetch`; row titles open the dialog and voting remains a separate button. The dialog shows full suggestion content, status, time, vote count, comments, attachments and replies. It renders `BadgeCheck` with `aria-label="官方回复"` for official replies.

Use a file input with `accept=".jpeg,.jpg,.png,.svg,image/jpeg,image/png,image/svg+xml"`, drag/drop, local 5 MB and five-file checks, and a `FormData` submit with `content`, `isAnonymous` and repeated `attachments`. On success, replace local detail from the server DTO and use existing App Bridge feedback. JPEG/PNG load through authenticated fetch into Blob URLs; SVG has only a download action.

- [ ] **Step 4: Verify GREEN**

Run: `npm --prefix web exec -- node --test test/feedback-board.test.mjs test/feedback-preview.test.mjs`

Expected: PASS; the production view is safe and the preview route remains isolated.

- [ ] **Step 5: Commit**

```bash
git add web/src/prototype/feedback-api.ts web/src/prototype/FeedbackBoard.tsx web/src/prototype/FeedbackDetailDialog.tsx web/src/prototype/model.ts web/src/prototype/navigation.ts web/src/pages/quantity-breaks.tsx web/src/pages/quantity-breaks.module.css web/test/feedback-board.test.mjs
git commit -m "feat: add feedback discussion detail UI"
```

### Task 6: Localization, Visual QA and Progress Evidence

**Files:**
- Create: `web/src/prototype/feedback-messages.ts`, `docs/reference/screenshots/local-feedback-detail-1037.png`, `docs/reference/screenshots/local-feedback-detail-390.png`
- Modify: `web/src/prototype/FeedbackBoard.tsx`, `web/src/prototype/FeedbackDetailDialog.tsx`, `web/test/admin-dictionaries.test.mjs`, `web/test/feedback-board.test.mjs`, `docs/APP_PROGRESS.md`

**Interfaces:** Adds complete feedback copy for the project-supported 11 locales and actual local desktop/mobile evidence.

- [ ] **Step 1: Write failing copy and responsive tests**

```js
test('has complete feedback copy for every supported locale', () => {
  for (const locale of supportedLocales) {
    const copy = feedbackText(locale);
    for (const key of ['comment', 'anonymous', 'publish', 'uploadHelp', 'attachmentTypes', 'officialReply']) assert.ok(copy[key]);
  }
});
```

- [ ] **Step 2: Verify RED**

Run: `npm --prefix web exec -- node --test test/feedback-board.test.mjs test/admin-dictionaries.test.mjs`

Expected: FAIL because feedback copy and responsive assertions are absent.

- [ ] **Step 3: Implement copy and collect evidence**

Follow the existing eleven-locale message pattern. Capture and inspect the real dialog at 1037px and 390px with comments, an official reply, a selected raster file, an SVG download, anonymous toggle and long filename. Add responsive CSS without focus pseudo-rules. Record only demonstrated evidence in `APP_PROGRESS.md`; keep the feature `IN_PROGRESS` until authenticated SHOPLINE, deployed migration and provisioned R2 verification is complete.

- [ ] **Step 4: Verify GREEN and the complete change**

Run: `npm --prefix worker test && npm --prefix worker run typecheck && npm --prefix worker run test:module-boundaries && npm --prefix worker run build && npm --prefix web run test:prototype && npm --prefix web run build && git diff --check`

Expected: every command exits 0; report Vite WebSocket warnings separately from test failures.

- [ ] **Step 5: Commit**

```bash
git add web/src/prototype/feedback-messages.ts web/src/prototype/FeedbackBoard.tsx web/src/prototype/FeedbackDetailDialog.tsx web/test/admin-dictionaries.test.mjs web/test/feedback-board.test.mjs docs/reference/screenshots/local-feedback-detail-1037.png docs/reference/screenshots/local-feedback-detail-390.png docs/APP_PROGRESS.md
git commit -m "feat: localize feedback discussions"
```

## Plan Self-Review

- **Spec coverage:** Tasks 1--4 build storage, private attachments, merchant routes and fixed official replies. Tasks 5--6 build the real route, detail dialog, upload UI, localization and evidence.
- **Placeholder scan:** Every task specifies files, interfaces, failing test, command, implementation boundary, passing command and commit.
- **Type consistency:** Server-derived store identity feeds the repository; safe repository DTOs feed the typed client and dialog; official identity is repository-derived and not client-supplied.
- **Review focus:** Each privacy, upload lifecycle, hidden-resource and HMAC threat listed above has a test in its owning task.
