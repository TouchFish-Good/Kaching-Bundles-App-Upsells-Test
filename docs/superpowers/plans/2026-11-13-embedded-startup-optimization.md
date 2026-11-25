# Embedded Startup Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the Quantity Breaks embedded workspace immediately and remove the serial route-load delay that can leave merchants at a loading spinner.

**Architecture:** The primary Quantity Breaks route becomes a static entry dependency so its module graph is requested with the application entry graph. `index.html` owns a data-free workspace-shaped skeleton and a one-time silent recovery guard. The mounted workspace retains API loading and retry behavior, while records non-sensitive local performance marks at existing readiness boundaries.

**Tech Stack:** React 18, TypeScript, Vite 5, i18next, Node test runner, JSDOM.

**Spec:** `docs/superpowers/specs/2026-11-13-embedded-startup-design.md`

## Global Constraints

- Do not modify OAuth signature validation, token refresh, session token acquisition, or App Bridge authorization navigation.
- Do not add or modify `:focus`, `:focus-visible`, or related focus pseudo-class CSS.
- The initial document must not include merchant data or authenticated API calls.
- A repeated startup timeout must not display an application failure message or enter a reload loop.
- Do not push without explicit user approval for the completed change set.

## Review Focus

- Direct navigation to `/preview/feedback-board` must remain lazy and render its current page, not the Quantity Breaks workspace.
- An OAuth-required start must cancel the static guard before the App Bridge authorization transition.
- A second static timeout must retain the workspace skeleton rather than issue another reload or insert error copy.
- A normal mounted app must remove the recovery marker before a later page refresh.
- Subscription, shop identity, and campaign errors after mount must retain their current explicit retry UI.

---

### Task 1: Static Workspace Startup Shell

**Files:**
- Modify: `web/index.html:8-70`
- Modify: `web/src/prototype/bootstrap-recovery.ts:1-20`
- Test: `web/test/bootstrap-shell.test.mjs`
- Test: `web/test/bootstrap-recovery.test.mjs`

**Interfaces:**
- Consumes: `BOOTSTRAP_TIMEOUT_MS` and recovery-marker semantics from `bootstrap-recovery.ts`.
- Produces: `window.__quantityBreaksBootstrapReady?: () => void`, called after React mount or an expected OAuth transition.

- [ ] **Step 1: Write the failing static-shell tests**

```js
assert.match(html, /app-bootstrap-shell__header/);
assert.match(html, /app-bootstrap-shell__metrics/);
assert.match(html, /app-bootstrap-shell__table/);
assert.doesNotMatch(html, /应用加载失败/);
```

Add a recovery assertion that a second claim returns a `hold` result rather than a second reload command.

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `node --test test/bootstrap-shell.test.mjs test/bootstrap-recovery.test.mjs`

Expected: failure because the current document contains only the spinner and embeds failure copy.

- [ ] **Step 3: Implement the data-free workspace shell and silent recovery**

```ts
export type BootstrapRecovery = 'reload' | 'hold';

export function claimBootstrapRecovery(storage: StorageLike): BootstrapRecovery {
  if (storage.getItem(BOOTSTRAP_RECOVERY_KEY) === '1') {
    storage.removeItem(BOOTSTRAP_RECOVERY_KEY);
    return 'hold';
  }
  storage.setItem(BOOTSTRAP_RECOVERY_KEY, '1');
  return 'reload';
}
```

Use this result in the inline document guard: reload only for `reload`; leave the workspace skeleton untouched for `hold`. Keep the loading shape structural and non-data-bearing.

- [ ] **Step 4: Run focused tests to verify they pass**

Run: `node --test test/bootstrap-shell.test.mjs test/bootstrap-recovery.test.mjs`

Expected: all tests pass.

- [ ] **Step 5: Commit the task after user approval to push**

```bash
git add web/index.html web/src/prototype/bootstrap-recovery.ts web/test/bootstrap-shell.test.mjs web/test/bootstrap-recovery.test.mjs
git commit -m "fix(app): retain workspace shell during startup recovery"
```

### Task 2: Parallelize the Primary Workspace Module

**Files:**
- Modify: `web/src/index.tsx:1-70`
- Test: `web/test/home-entry.test.mjs`
- Test: `web/test/bootstrap-recovery.test.mjs`

**Interfaces:**
- Consumes: `window.__quantityBreaksBootstrapReady` from Task 1.
- Produces: a static `QuantityBreaksPrototype` import for `/quantity-breaks`, while non-primary routes remain dynamically imported.

- [ ] **Step 1: Write the failing entry test**

```js
assert.match(source, /import QuantityBreaksPrototype from "\.\/pages\/quantity-breaks"/);
assert.doesNotMatch(source, /import\("\.\/pages\/quantity-breaks"\)/);
```

Add a test that verifies the readiness callback is called after `createRoot(...).render(...)` and on the OAuth pending path.

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `node --test test/home-entry.test.mjs test/bootstrap-recovery.test.mjs`

Expected: failure because the primary workspace is currently imported at runtime.

- [ ] **Step 3: Implement static primary-route loading**

```ts
import QuantityBreaksPrototype from "./pages/quantity-breaks";

async function getEntryComponent() {
  const entryPath = resolveEntryPath(window.location.pathname);
  if (entryPath === "/quantity-breaks" || entryPath.startsWith("/quantity-breaks/")) {
    return QuantityBreaksPrototype;
  }
  return (await import("./App")).default;
}
```

Preserve special preview route handling and route normalization. Mark the static guard ready only after React has rendered, or once OAuth pending has been intentionally handed to App Bridge.

- [ ] **Step 4: Run focused tests and build**

Run: `node --test test/home-entry.test.mjs test/bootstrap-recovery.test.mjs && npm run build`

Expected: all tests and Vite build pass.

- [ ] **Step 5: Commit the task after user approval to push**

```bash
git add web/src/index.tsx web/test/home-entry.test.mjs web/test/bootstrap-recovery.test.mjs
git commit -m "perf(app): preload embedded workspace entry"
```

### Task 3: Startup Performance Marks

**Files:**
- Create: `web/src/prototype/startup-performance.ts`
- Modify: `web/src/index.tsx:1-70`
- Modify: `web/src/pages/quantity-breaks.tsx:50-130`
- Test: `web/test/startup-performance.test.mjs`

**Interfaces:**
- Produces: `markStartup(name: 'guard' | 'react-mounted' | 'subscription-ready' | 'shop-ready' | 'campaigns-ready'): void`.
- Consumes: the browser Performance API when available; it is a no-op in unavailable environments.

- [ ] **Step 1: Write the failing performance test**

```js
markStartup('react-mounted');
assert.deepEqual(marks, ['quantity-breaks:react-mounted']);
```

Add an assertion that an absent `performance.mark` does not throw.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `node --test test/startup-performance.test.mjs`

Expected: failure because no startup marker module exists.

- [ ] **Step 3: Implement the local-only marker helper and call sites**

```ts
export function markStartup(name: StartupMark): void {
  try { globalThis.performance?.mark?.(`quantity-breaks:${name}`); }
  catch { /* Performance telemetry must never affect rendering. */ }
}
```

Call it after the static guard installs, after React render, and only in the successful subscription, shop, and campaign list branches. Do not send marks to an API and do not include merchant identifiers.

- [ ] **Step 4: Run focused test and production build**

Run: `node --test test/startup-performance.test.mjs && npm run build`

Expected: all tests and Vite build pass.

- [ ] **Step 5: Commit the task after user approval to push**

```bash
git add web/src/prototype/startup-performance.ts web/src/index.tsx web/src/pages/quantity-breaks.tsx web/test/startup-performance.test.mjs
git commit -m "chore(app): mark embedded startup milestones"
```

### Task 4: End-to-End Regression Verification

**Files:**
- Modify: `docs/APP_PROGRESS.md`
- Test: `web/test/*.test.mjs`

**Interfaces:**
- Consumes: all startup behavior from Tasks 1-3.
- Produces: a dated verification record that separates local evidence from SHOPLINE embedded verification.

- [ ] **Step 1: Write the progress record requirement**

Add a dated section requiring the final record to name the focused tests, full prototype suite, production build, and live custom-domain response check.

- [ ] **Step 2: Run the full frontend suite**

Run: `npm run test:prototype`

Expected: zero test failures. Existing JSDOM `attachEvent` warnings and Vite WebSocket port warnings may be reported but must not cause a nonzero exit.

- [ ] **Step 3: Run final build and static deployment checks**

Run: `npm run build && git diff --check && curl -sS --fail https://app.vswwy.cn/`

Expected: build succeeds, diff check is clean, and the live document is reachable. Do not treat the live response as verification until deployment is explicitly approved.

- [ ] **Step 4: Update the progress record with actual results**

Record only commands that actually passed, and explicitly leave real SHOPLINE iframe navigation as post-deploy verification until it has been performed.

- [ ] **Step 5: Commit the task after user approval to push**

```bash
git add docs/APP_PROGRESS.md
git commit -m "docs: record embedded startup verification"
```

## Plan Self-Review

- Spec coverage: Tasks 1-3 implement every selected approach item; Task 4 records all required verification.
- Placeholder scan: no deferred implementation markers or unspecified test steps remain.
- Type consistency: Task 1 produces the browser callback consumed by Task 2; Task 3 has a closed union for all marker call sites.
- Review focus coverage: preview navigation is covered by Task 2; OAuth guard cancellation by Task 2; repeated timeout by Task 1; recovery-marker cleanup by Task 2; post-mount API retries by Task 4's full suite.
