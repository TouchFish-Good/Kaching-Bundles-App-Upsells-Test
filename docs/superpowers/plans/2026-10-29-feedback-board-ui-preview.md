# Feedback Board UI Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a locally reviewable, explicitly non-production UI preview for the approved Roadmap & Feedback list and suggestion dialog.

**Architecture:** A typed `FeedbackPreviewPage` under `web/src/prototype/` owns preview-only filtering, local vote state and dialog state. `/preview/feedback-board` is intentionally isolated from all merchant `/quantity-breaks/*` routes, Worker APIs and D1 data.

**Tech Stack:** React 18, TypeScript, Vite SSR, Node test runner, CSS Modules, App Bridge helpers.

**Spec:** `docs/FEEDBACK_DESIGN_SPEC.md`, `docs/FEEDBACK_USER_FLOWS.md`, `docs/FEEDBACK_REQUIREMENTS.md`

## Global Constraints

- Header action is exactly `建议`; its dialog presents title, content, cancel and submit.
- Submission success uses existing App Bridge success feedback; it never renders a local success toast.
- Fixtures are phase-2 visual-preview data only, visibly labelled as such; no implementation may imply persistence, authentication, voting integrity or production readiness.
- Reuse Sea/Mint/Coral styling in `quantity-breaks.module.css`; do not add a framework, gradients, a hero layout, or `:focus`/`:focus-visible` rules.
- Do not modify Worker, D1, API, Theme Extension, Function, production configuration or deployment.
- Record phase-2 result as `IN_PROGRESS` in `docs/APP_PROGRESS.md`, with actual 1037px and 390px screenshots; do not claim `VERIFIED`.

## Review Focus

- Preview data never appears at `/quantity-breaks/feedback`; Task 1 covers it.
- Vote button markup is not nested in a detail link; Task 2 covers it.
- A successful submit boundary has no `ToastRegion`; Task 3 covers it.
- Mobile CSS leaves title, metadata and vote controls in normal flow without focus pseudo-rules; Task 3 covers it.
- Status/filter/sort state changes must not retain stale page metadata; Task 2 covers it.

### Task 1: Isolated Route and Component Boundary

**Files:**
- Create: `web/src/prototype/feedback-preview.tsx`
- Create: `web/src/pages/feedback-preview.tsx`
- Modify: `web/src/index.tsx`
- Test: `web/test/feedback-preview.test.mjs`

**Interfaces:** Produces `FeedbackPreviewItem`, `FeedbackPreviewPage`, and `isFeedbackPreviewPath(pathname: string): boolean`.

- [ ] **Step 1: Write the failing test**

```js
test('feedback preview is isolated from merchant feedback routes', async () => {
  const { isFeedbackPreviewPath } = await vite.ssrLoadModule('/src/pages/feedback-preview.tsx');
  assert.equal(isFeedbackPreviewPath('/preview/feedback-board'), true);
  assert.equal(isFeedbackPreviewPath('/quantity-breaks/feedback'), false);
});
```


- [ ] **Step 2: Verify RED**

Run from `web/`: `node --test test/feedback-preview.test.mjs`

Expected: FAIL because the preview module does not exist.

- [ ] **Step 3: Implement the minimum route boundary**

```ts
export function isFeedbackPreviewPath(pathname: string): boolean {
  return pathname === '/preview/feedback-board';
}
```

Route only the exact preview pathname in `web/src/index.tsx`; preserve existing Quantity Breaks route behavior.


- [ ] **Step 4: Verify GREEN**

Run from `web/`: `node --test test/feedback-preview.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add web/src/index.tsx web/src/pages/feedback-preview.tsx web/src/prototype/feedback-preview.tsx web/test/feedback-preview.test.mjs && git commit -m "feat: add isolated feedback UI preview route"`

### Task 2: List, Controls and Detail-Safe Vote Markup

**Files:**
- Modify: `web/src/prototype/feedback-preview.tsx`
- Modify: `web/src/pages/quantity-breaks.module.css`
- Test: `web/test/feedback-preview.test.mjs`

**Interfaces:** Consumes `FeedbackPreviewItem`; produces `FeedbackPreviewPage({ items, notifySuccess })` and separated detail/vote controls.

- [ ] **Step 1: Write the failing test**

```js
const html = renderToStaticMarkup(React.createElement(FeedbackPreviewPage, {
  items: [{ id: 'one', title: '复制活动', excerpt: '...', status: 'pending', voteCount: 12, voted: false, createdAt: '2026-10-29', hasOfficialReply: true }],
  notifySuccess: () => {},
}));
assert.match(html, /需求与建议/);
assert.match(html, />建议<\/button>/);
assert.match(html, /待定/);
assert.match(html, /投票 12/);
assert.doesNotMatch(html, /<a[^>]*>[^]*<button[^>]*>投票/);
```


- [ ] **Step 2: Verify RED**

Run from `web/`: `node --test test/feedback-preview.test.mjs`

Expected: FAIL because list markup does not exist.

- [ ] **Step 3: Implement the minimum list behavior**

```tsx
<article className={styles.feedbackCard}>
  <a href={`#${item.id}`} className={styles.feedbackDetailLink}>{item.title}</a>
  <button type="button" aria-pressed={item.voted} onClick={() => toggleVote(item.id)}>
    {item.voted ? `已投票 ${item.voteCount}` : `投票 ${item.voteCount}`}
  </button>
</article>
```

Use controlled state for filters, sorting and preview votes. Do not call `fetch` or claim persistence.


- [ ] **Step 4: Verify GREEN**

Run from `web/`: `node --test test/feedback-preview.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add web/src/prototype/feedback-preview.tsx web/src/pages/quantity-breaks.module.css web/test/feedback-preview.test.mjs && git commit -m "feat: add feedback preview list interactions"`

### Task 3: Suggestion Dialog, Responsive Evidence and Progress

**Files:**
- Modify: `web/src/pages/feedback-preview.tsx`
- Modify: `web/src/prototype/feedback-preview.tsx`
- Modify: `web/src/pages/quantity-breaks.module.css`
- Modify: `docs/APP_PROGRESS.md`
- Create: `docs/reference/screenshots/local-feedback-preview-1037.png`
- Create: `docs/reference/screenshots/local-feedback-preview-390.png`
- Test: `web/test/feedback-preview.test.mjs`

**Interfaces:** Consumes `notifySuccess(message: string): void`; produces `FeedbackSubmitPreviewDialog({ open, onCancel, onSubmit })`.

- [ ] **Step 1: Write the failing tests**

```js
const html = renderToStaticMarkup(React.createElement(FeedbackSubmitPreviewDialog, { open: true, onCancel: () => {}, onSubmit: () => {} }));
assert.match(html, /<label[^>]*>标题/);
assert.match(html, /<label[^>]*>内容/);
assert.match(html, />取消<\/button>/);
assert.match(html, />提交<\/button>/);
assert.doesNotMatch(html, /提交成功/);
const css = readFileSync(new URL('../src/pages/quantity-breaks.module.css', import.meta.url), 'utf8');
assert.match(css, /@media \(max-width: 767px\)[^]*feedbackCard/);
assert.doesNotMatch(css, /\.feedback[^\n]*:(?:focus|focus-visible)/);
```


- [ ] **Step 2: Verify RED**

Run from `web/`: `node --test test/feedback-preview.test.mjs`

Expected: FAIL because dialog and feedback responsive styles do not exist.

- [ ] **Step 3: Implement dialog, bridge boundary and responsive layout**

```tsx
const submitPreview = (event: FormEvent<HTMLFormElement>) => {
  event.preventDefault();
  setDialogOpen(false);
  notifySuccess('提交成功');
};
```

`pages/feedback-preview.tsx` passes `showAdminMessage(app, message, 'success')` when embedded and a test-only no-op otherwise. Never import/render `ToastRegion` for success. Capture and inspect screenshots at 1037px and 390px before updating `APP_PROGRESS.md` as `IN_PROGRESS`.


- [ ] **Step 4: Verify GREEN and the full frontend**

Run: `npm --prefix web exec -- node --test test/feedback-preview.test.mjs`, then `npm --prefix web run test:prototype`, then `npm --prefix web run build`

Expected: focused tests, full suite and build exit 0. Existing Vite WebSocket `EPERM` warnings are reportable only when the command exits 0.

- [ ] **Step 5: Commit**

Run: `git add web/src/pages/feedback-preview.tsx web/src/prototype/feedback-preview.tsx web/src/pages/quantity-breaks.module.css web/test/feedback-preview.test.mjs docs/APP_PROGRESS.md docs/reference/screenshots/local-feedback-preview-1037.png docs/reference/screenshots/local-feedback-preview-390.png && git commit -m "feat: add feedback suggestion dialog preview"`

## Plan Self-Review

- **Spec coverage:** header action, dialog fields/actions, App Bridge success boundary, list/status/vote states, responsive evidence and progress are mapped to Tasks 1--3. API/D1/auth/real voting remain outside phase 2.
- **Placeholder scan:** every task has exact paths, RED/GREEN commands and implementation boundary.
- **Type consistency:** `FeedbackPreviewItem` feeds `FeedbackPreviewPage`; `notifySuccess` flows from page route to dialog; dialog owns no API state.
- **Review focus:** every listed risk has a named task and test.
