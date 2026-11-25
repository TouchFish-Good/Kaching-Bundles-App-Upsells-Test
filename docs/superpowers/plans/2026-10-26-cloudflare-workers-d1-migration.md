# Cloudflare Workers and D1 Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the Quantity Breaks app at `https://app.vswwy.cn` from a Cloudflare Worker backed by D1, without retaining legacy SQLite data.

**Architecture:** Create a new `worker/` Hono application that serves `web/dist`, implements Worker-native SHOPLINE OAuth and API authentication with Web Crypto, and stores all application state in a D1 binding named `DB`. Reuse platform-independent campaign rules and preserve all current HTTP API paths and response contracts.

**Tech Stack:** TypeScript, Hono, Cloudflare Workers, Cloudflare D1, Wrangler, Web Crypto, Vite static assets, Node test runner with the Cloudflare Workers test pool.

**Spec:** `docs/superpowers/specs/2026-10-26-cloudflare-workers-d1-design.md`

## Global Constraints

- Serve the existing `app.vswwy.cn` custom domain from the `shopline-quantity-breaks` Worker.
- Do not import any data from `quantity-breaks.sqlite`, `database.sqlite`, or `admin-read.sqlite`; merchants reauthorize and recreate campaigns.
- Do not use Express, `app.listen()`, Node `sqlite3`, filesystem persistence, or `@shoplineos/shopline-app-express` in `worker/`.
- Keep the existing `/api/*`, `/public/*`, and `/internal/admin-read/v1/*` endpoint paths and response shapes.
- Preserve all confirmed Quantity Breaks business rules and the separately deployed SHOPLINE Product Discount Function workflow.
- Derive SHOPLINE OAuth request paths and headers from the installed SDK characterization tests: authorization at `/admin/oauth-web/#/oauth/authorize`, code exchange at `/admin/oauth/token/create`, refresh at `/admin/oauth/token/refresh`.
- Store access tokens and refresh tokens only after AES-GCM encryption with `TOKEN_ENCRYPTION_KEY`; never write secrets or full curl output to logs.
- Verify OAuth query signatures, JWT signatures, token expiry, installation state, and webhook HMACs with Web Crypto and constant-time comparisons.
- Do not change SHOPLINE developer-console URLs until the Worker, D1 migrations, secrets, and local checks pass.

## Review Focus

- An OAuth callback with a valid signature but a timestamp more than ten minutes in the future must return `400`; Task 4 owns this test.
- A JWT whose `aud` field is valid but whose signature was altered must never reach a protected route; Task 5 owns this test.
- A D1 token ciphertext copied from one store record to another must fail decryption because the store handle is authenticated additional data; Task 3 owns this test.
- Two simultaneous publication attempts for one shop must permit one lock holder and return a conflict to the other; Task 6 owns this test.
- A scheduled collection scan with an expired OAuth token must refresh once and must not make a second discount-creation request; Task 9 owns this test.

## File Structure

| Path | Responsibility |
| --- | --- |
| `worker/package.json` | Worker scripts and Worker-compatible dependencies. |
| `worker/wrangler.toml` | Worker name, D1 binding, static assets, compatibility date, and Cron Trigger. |
| `worker/migrations/0001_initial.sql` | Immutable D1 schema for sessions, campaigns, translations, locks, webhooks, diagnostics, and rate limiting. |
| `worker/src/env.ts` | Runtime binding validation and non-secret configuration parsing. |
| `worker/src/crypto.ts` | Web Crypto HMAC, constant-time equality, JWT verification, and AES-GCM token encryption. |
| `worker/src/auth.ts` | OAuth begin/callback, session middleware, token refresh, and rate limiting. |
| `worker/src/db/*.ts` | D1 repositories with tenant scoping and transactional publication operations. |
| `worker/src/services/*.ts` | SHOPLINE Admin REST/OAuth client and webhook registration. |
| `worker/src/routes/*.ts` | Hono adapters for API, public storefront, webhook, and internal-admin routes. |
| `worker/src/index.ts` | Hono route registration, static asset fallback, and `scheduled()` handler. |
| `worker/test/*.test.ts` | Crypto, database, route-contract, job, and integration tests. |
| `shopline.app.多件优惠.toml` | Final stable application URL and OAuth callback URL. |

### Task 1: Worker Scaffold and Local D1 Harness

**Files:**
- Create: `worker/package.json`
- Create: `worker/tsconfig.json`
- Create: `worker/wrangler.toml`
- Create: `worker/src/index.ts`
- Create: `worker/src/env.ts`
- Create: `worker/test/health.test.ts`
- Modify: `.gitignore`

**Interfaces:**
- Produces `Env` with `DB: D1Database`, Worker secrets, `ASSETS: Fetcher`, and a `now(): number` test seam.
- Produces `app.fetch(request, env, ctx): Promise<Response>` and `scheduled(event, env, ctx): Promise<void>`.

- [ ] **Step 1: Write the failing health and environment tests**

```ts
import { describe, expect, it } from 'vitest';
import worker from '../src';

describe('worker health', () => {
  it('returns a non-secret readiness response', async () => {
    const response = await worker.fetch(new Request('https://app.vswwy.cn/health'), env, createExecutionContext());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, service: 'shopline-quantity-breaks' });
  });
});
```

- [ ] **Step 2: Run the test and verify it fails because `worker/src` does not exist**

Run: `cd worker && npm test -- health.test.ts`
Expected: FAIL with module-not-found for `../src`.

- [ ] **Step 3: Add the Worker package and minimal implementation**

```ts
export type Env = { DB: D1Database; ASSETS: Fetcher };

const worker: ExportedHandler<Env> = {
  async fetch(request) {
    if (new URL(request.url).pathname === '/health') {
      return Response.json({ ok: true, service: 'shopline-quantity-breaks' });
    }
    return new Response('Not found', { status: 404 });
  },
};

export default worker;
```

Configure the Worker name as `shopline-quantity-breaks`, the D1 binding as `DB`, static assets as `../web/dist`, and a daily Cron Trigger. Add local D1 state directories to `.gitignore`.

- [ ] **Step 4: Run the test and type/build checks**

Run: `cd worker && npm test -- health.test.ts && npm run typecheck && npm run build`
Expected: PASS and a Worker bundle that has no Node-only imports.

- [ ] **Step 5: Commit the scaffold**

```bash
git add worker/package.json worker/tsconfig.json worker/wrangler.toml worker/src/index.ts worker/src/env.ts worker/test/health.test.ts .gitignore
git commit -m "feat(worker): add Cloudflare Worker scaffold"
```

### Task 2: D1 Schema and Migration Validation

**Files:**
- Create: `worker/migrations/0001_initial.sql`
- Create: `worker/src/db/migrate.ts`
- Create: `worker/test/migrations.test.ts`
- Modify: `worker/wrangler.toml`

**Interfaces:**
- Produces `applyMigrations(db: D1Database): Promise<void>` for local integration tests.
- Produces the tables declared in the design document, including unique keys for `(shop_handle, id)`, `(shop_handle, campaign_id)`, `(shop_handle, locale)`, and `webhook_id`.

- [ ] **Step 1: Write the failing schema test**

```ts
it('creates all tenant and operational tables', async () => {
  await applyMigrations(env.DB);
  const result = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table'").all<{ name: string }>();
  expect(result.results.map((row) => row.name)).toEqual(expect.arrayContaining([
    'shopline_sessions', 'quantity_breaks_campaigns', 'quantity_breaks_publications',
    'quantity_breaks_shop_locks', 'quantity_breaks_collection_conflicts',
    'quantity_breaks_translations', 'webhook_events', 'admin_stores',
    'admin_installations', 'admin_error_events', 'token_refresh_locks', 'public_rate_limits',
  ]));
});
```

- [ ] **Step 2: Run the test and verify it fails because the migration is absent**

Run: `cd worker && npm test -- migrations.test.ts`
Expected: FAIL with `no such table` or missing migration module.

- [ ] **Step 3: Implement the migration**

Use `CREATE TABLE IF NOT EXISTS` only in the initial migration. Add `CHECK` constraints for session install state and publication state, expiry indexes for locks and rate-limit windows, and foreign keys only where the related lifecycle cannot require independent cleanup. Store encrypted fields in `TEXT` columns named `access_token_ciphertext` and `refresh_token_ciphertext`; do not add plaintext token columns.

- [ ] **Step 4: Validate local and remote migration commands**

Run: `cd worker && npx wrangler d1 migrations apply shopline-quantity-breaks --local`
Expected: migration `0001_initial.sql` applies once and a second run reports no pending migrations.

- [ ] **Step 5: Commit the schema**

```bash
git add worker/migrations/0001_initial.sql worker/src/db/migrate.ts worker/test/migrations.test.ts worker/wrangler.toml
git commit -m "feat(worker): add D1 application schema"
```

### Task 3: Web Crypto, Token Encryption, and D1 Session Store

**Files:**
- Create: `worker/src/crypto.ts`
- Create: `worker/src/db/sessions.ts`
- Create: `worker/test/crypto.test.ts`
- Create: `worker/test/sessions.test.ts`

**Interfaces:**

```ts
export type ShoplineSession = {
  handle: string; accessToken: string; scope: string; expiresAt: string; installed: boolean;
};
export function hmacHex(secret: string, input: string): Promise<string>;
export function timingSafeEqual(left: string, right: string): boolean;
export function encryptToken(key: string, handle: string, token: string): Promise<string>;
export function decryptToken(key: string, handle: string, ciphertext: string): Promise<string>;
export class D1SessionStore { get(handle: string): Promise<ShoplineSession | null>; upsert(session: ShoplineSession): Promise<void>; markUninstalled(handle: string): Promise<void>; }
```

- [ ] **Step 1: Write failing crypto and session tests**

```ts
it('rejects ciphertext authenticated for another store', async () => {
  const cipher = await encryptToken(TEST_KEY, 'alpha', 'token-value');
  await expect(decryptToken(TEST_KEY, 'beta', cipher)).rejects.toThrow('Token decryption failed');
});

it('never exposes plaintext tokens from D1 rows', async () => {
  await store.upsert({ handle: 'alpha', accessToken: 'secret', scope: 'read_products', expiresAt: '2030-01-01T00:00:00.000Z', installed: true });
  const row = await env.DB.prepare('SELECT access_token_ciphertext FROM shopline_sessions WHERE handle=?').bind('alpha').first<{ access_token_ciphertext: string }>();
  expect(row?.access_token_ciphertext).not.toContain('secret');
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd worker && npm test -- crypto.test.ts sessions.test.ts`
Expected: FAIL with missing crypto/session modules.

- [ ] **Step 3: Implement Web Crypto primitives and the repository**

Import AES-GCM keys from a base64url `TOKEN_ENCRYPTION_KEY`; generate a fresh 96-bit IV for every encryption; serialize `version.iv.ciphertext` as base64url; authenticate `handle` as additional data. Use `crypto.subtle.importKey` and `crypto.subtle.sign`, not Node `crypto`. The session store decrypts only after selecting by the authenticated `handle` and never includes token fields in public return values.

- [ ] **Step 4: Run tests and a production Worker build**

Run: `cd worker && npm test -- crypto.test.ts sessions.test.ts && npm run build`
Expected: PASS with no plaintext token present in test database output.

- [ ] **Step 5: Commit crypto and session persistence**

```bash
git add worker/src/crypto.ts worker/src/db/sessions.ts worker/test/crypto.test.ts worker/test/sessions.test.ts
git commit -m "feat(worker): secure SHOPLINE session storage"
```

### Task 4: SHOPLINE OAuth and Webhook Authentication

**Files:**
- Create: `worker/src/auth/oauth.ts`
- Create: `worker/src/auth/webhook.ts`
- Create: `worker/src/auth/rate-limit.ts`
- Create: `worker/src/services/shopline-oauth.ts`
- Create: `worker/test/oauth.test.ts`
- Create: `worker/test/webhook.test.ts`

**Interfaces:**

```ts
export function beginOAuth(request: Request, env: Env): Promise<Response>;
export function finishOAuth(request: Request, env: Env): Promise<Response>;
export function verifyWebhook(request: Request, env: Env): Promise<{ handle: string; topic: string; webhookId: string; body: unknown }>;
export function requirePublicRateLimit(request: Request, env: Env): Promise<Response | null>;
```

- [ ] **Step 1: Write characterization and security tests before implementation**

```ts
it('redirects authorization to the SDK-equivalent SHOPLINE URL', async () => {
  const response = await beginOAuth(new Request('https://app.vswwy.cn/api/auth?handle=demo'), env);
  expect(response.headers.get('location')).toBe('https://demo.myshopline.com/admin/oauth-web/#/oauth/authorize?appKey=test-key&responseType=code&scope=read_products&redirectUri=https%3A%2F%2Fapp.vswwy.cn%2Fapi%2Fauth%2Fcallback&customField=');
});

it('rejects a future callback timestamp outside ten minutes', async () => {
  const request = signedCallback({ timestamp: String(Date.now() + 600_001) });
  expect((await finishOAuth(request, env)).status).toBe(400);
});

it('rejects a webhook with one altered HMAC byte', async () => {
  await expect(verifyWebhook(webhookRequest({ hmac: '0'.repeat(64) }), env)).rejects.toThrow('Invalid webhook signature');
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd worker && npm test -- oauth.test.ts webhook.test.ts`
Expected: FAIL with missing OAuth and webhook modules.

- [ ] **Step 3: Implement the verified OAuth protocol**

Implement query signing as lexicographically sorted parameters excluding `sign`, HMAC-SHA256 hex, and constant-time comparison. Begin OAuth with `appKey`, `responseType=code`, the required scopes, and `redirectUri=https://app.vswwy.cn/api/auth/callback`. Exchange a validated callback code with `POST https://{handle}.myshopline.com/admin/oauth/token/create`, JSON body `{"code":"..."}`, and headers `appkey`, `timestamp`, and `sign=HMAC(appSecret, JSON.stringify({code}) + timestamp)`. Persist the returned offline session and register `/api/webhooks` after successful authorization. Verify webhook raw bytes before JSON parsing, record `webhook_id` before state mutation, and mark the store uninstalled for uninstall events.

- [ ] **Step 4: Run the security suite**

Run: `cd worker && npm test -- oauth.test.ts webhook.test.ts crypto.test.ts`
Expected: PASS for valid requests and `400`, `401`, or `429` for invalid timestamp, signature, webhook HMAC, and rate-limit scenarios.

- [ ] **Step 5: Commit authentication paths**

```bash
git add worker/src/auth worker/src/services/shopline-oauth.ts worker/test/oauth.test.ts worker/test/webhook.test.ts
git commit -m "feat(worker): implement SHOPLINE OAuth and webhooks"
```

### Task 5: API Session Middleware and SHOPLINE Admin Client

**Files:**
- Create: `worker/src/auth/session.ts`
- Create: `worker/src/services/shopline-admin.ts`
- Create: `worker/test/session-auth.test.ts`
- Create: `worker/test/shopline-admin.test.ts`

**Interfaces:**

```ts
export type AuthContext = { handle: string; accessToken: string; scope: string };
export function requireShoplineSession(request: Request, env: Env): Promise<AuthContext | Response>;
export function withFreshAccessToken(handle: string, env: Env): Promise<AuthContext>;
export class ShoplineAdminClient { constructor(session: AuthContext, fetcher?: typeof fetch); get(path: string): Promise<Response>; post(path: string, body: unknown): Promise<Response>; put(path: string, body: unknown): Promise<Response>; delete(path: string): Promise<Response>; }
```

- [ ] **Step 1: Write failing middleware and refresh-lock tests**

```ts
it('returns 401 before an altered JWT can access a campaign route', async () => {
  const response = await protectedRequest('Bearer ' + tamper(validJwt));
  expect(response.status).toBe(401);
});

it('refreshes an expired store session exactly once under concurrency', async () => {
  const [left, right] = await Promise.all([withFreshAccessToken('demo', env), withFreshAccessToken('demo', env)]);
  expect(left.accessToken).toBe(right.accessToken);
  expect(tokenFetcher).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd worker && npm test -- session-auth.test.ts shopline-admin.test.ts`
Expected: FAIL with missing session middleware.

- [ ] **Step 3: Implement middleware and client**

Decode JWT payload only to obtain `aud`, verify HS256 using `base64(appSecret)`, reject missing/expired/tampered JWTs, then read the installed D1 session by `handle`. Refresh expired tokens through `POST https://{handle}.myshopline.com/admin/oauth/token/refresh` using the observed `appkey`, `timestamp`, and HMAC headers. Acquire and release `token_refresh_locks` with an expiry; poll the session row briefly when another request owns a valid lock. The Admin client sets `Authorization: Bearer ` followed by the decrypted session token and the repository's established Admin REST version header.

- [ ] **Step 4: Run tests and check no token leaks**

Run: `cd worker && npm test -- session-auth.test.ts shopline-admin.test.ts && rg -n 'accessToken|refreshToken' worker/src --glob '!**/*.test.ts'`
Expected: tests PASS; token identifiers occur only in storage, encryption, and outgoing SHOPLINE request code.

- [ ] **Step 5: Commit middleware and Admin client**

```bash
git add worker/src/auth/session.ts worker/src/services/shopline-admin.ts worker/test/session-auth.test.ts worker/test/shopline-admin.test.ts
git commit -m "feat(worker): authenticate SHOPLINE API requests"
```

### Task 6: D1 Campaign, Translation, and Publication Repositories

**Files:**
- Create: `worker/src/db/campaigns.ts`
- Create: `worker/src/db/translations.ts`
- Create: `worker/src/db/admin-registry.ts`
- Create: `worker/test/campaign-repository.test.ts`
- Create: `worker/test/translation-repository.test.ts`

**Interfaces:**

```ts
export class D1CampaignRepository { list(shop: string): Promise<Campaign[]>; get(shop: string, id: string): Promise<Campaign | null>; save(shop: string, draft: CampaignDraft, expectedRevision: number): Promise<Campaign>; beginPublication(shop: string, id: string, revision: number, action: 'publish' | 'pause', collectionIds: string[]): Promise<void>; finishPublication(shop: string, id: string, revision: number, action: 'publish' | 'pause', discountId?: string): Promise<Campaign>; }
export class D1TranslationRepository { read(shop: string, locale: string): Promise<Record<string, string>>; write(shop: string, locale: string, copy: Record<string, string>): Promise<void>; }
```

- [ ] **Step 1: Port failing tests from the SQLite repositories**

```ts
it('rejects a second publication lock for the same store', async () => {
  await repository.beginPublication('shop-a', 'offer-a', 1, 'publish', []);
  await expect(repository.beginPublication('shop-a', 'offer-b', 1, 'publish', [])).rejects.toThrow('publication in progress');
});

it('allows product and collection overlap but blocks same-level overlap', async () => {
  await repository.save('shop-a', directProductCampaign, 0);
  await expect(repository.save('shop-a', collectionCampaignContainingProduct, 0)).resolves.toMatchObject({ id: collectionCampaignContainingProduct.id });
  await expect(repository.save('shop-a', anotherDirectProductCampaign, 0)).rejects.toThrow('overlaps');
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd worker && npm test -- campaign-repository.test.ts translation-repository.test.ts`
Expected: FAIL with missing D1 repositories.

- [ ] **Step 3: Implement repositories by reusing pure model validation**

Move or import only Worker-compatible campaign model and validation modules from `app/src/service/campaign`. Use D1 batches or explicit conditional updates for revision and lock changes. Preserve publication states, collection conflict snapshots, translation placeholder validation, tenant scoping, and the 35 enabled Function-rule capacity.

- [ ] **Step 4: Run repository tests**

Run: `cd worker && npm test -- campaign-repository.test.ts translation-repository.test.ts`
Expected: PASS, including stale revision, cross-tenant isolation, product precedence, lock conflict, and translation placeholder failures.

- [ ] **Step 5: Commit repositories**

```bash
git add worker/src/db worker/test/campaign-repository.test.ts worker/test/translation-repository.test.ts
git commit -m "feat(worker): persist Quantity Breaks data in D1"
```

### Task 7: Route Adapters and Static Application Delivery

**Files:**
- Create: `worker/src/routes/campaigns.ts`
- Create: `worker/src/routes/catalog.ts`
- Create: `worker/src/routes/translations.ts`
- Create: `worker/src/routes/storefront.ts`
- Create: `worker/src/routes/admin-read.ts`
- Modify: `worker/src/index.ts`
- Create: `worker/test/routes-contract.test.ts`
- Modify: `web/src/lib/authenticated-fetch.ts` only if contract tests prove a Worker-safe reauthorization header change is required

**Interfaces:**
- Produces exact route registrations for every path listed in the design document.
- Protected handlers consume `AuthContext`; public storefront handlers consume validated `shop`, `productId`, and optional `locale` query values.

- [ ] **Step 1: Write failing contract tests for representative endpoints**

```ts
it('keeps the campaign list response shape', async () => {
  const response = await app.request('/api/quantity-breaks/campaigns', { headers: { Authorization: `Bearer ${validJwt}` } }, env);
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ campaigns: [] });
});

it('does not return campaigns from another shop through the public endpoint', async () => {
  const response = await app.request('/public/quantity-breaks/campaign?shop=shop-a&productId=product-b', {}, env);
  expect(response.status).toBe(404);
});
```

- [ ] **Step 2: Run the route tests and verify they fail**

Run: `cd worker && npm test -- routes-contract.test.ts`
Expected: FAIL with routes missing or returning `404`.

- [ ] **Step 3: Implement Hono adapters**

Adapt the logic in the current Express controllers without changing request validation or status mapping. Reuse the established product, collection, market, language, discount-publication, and storefront business services after injecting `AuthContext` and Worker `fetch`. Set public response headers to `Cache-Control: no-store` and `Access-Control-Allow-Origin: *`. Send unrecognized non-API routes to `env.ASSETS.fetch(request)` so Vite SPA navigation works.

- [ ] **Step 4: Run route tests, frontend tests, and builds**

Run: `cd worker && npm test -- routes-contract.test.ts && cd ../web && npm run test:prototype && npm run build && cd ../worker && npm run build`
Expected: all tests PASS and all existing frontend API calls target unchanged paths.

- [ ] **Step 5: Commit API compatibility**

```bash
git add worker/src/routes worker/src/index.ts worker/test/routes-contract.test.ts web/src/lib/authenticated-fetch.ts
git commit -m "feat(worker): serve Quantity Breaks API routes"
```

### Task 8: Function Publication and Webhook Registration Integration

**Files:**
- Create: `worker/src/services/discounts.ts`
- Create: `worker/src/services/webhooks.ts`
- Create: `worker/test/discount-publication.test.ts`
- Create: `worker/test/webhook-registration.test.ts`

**Interfaces:**

```ts
export function createAutomaticDiscount(session: AuthContext, campaign: Campaign, env: Env): Promise<string>;
export function deleteAutomaticDiscount(session: AuthContext, activityId: string, env: Env): Promise<void>;
export function registerInstallationWebhook(session: AuthContext, env: Env): Promise<void>;
```

- [ ] **Step 1: Write failing Admin API request-shape tests**

```ts
it('uses the configured Function ID and returns the platform activity ID', async () => {
  await expect(createAutomaticDiscount(session, campaign, env)).resolves.toBe('7757655103080239428');
  expect(fetcher).toHaveBeenCalledWith(expect.stringContaining(`/sales/discount_apps/${env.SHOPLINE_PRODUCT_DISCOUNT_FUNCTION_ID}/`), expect.objectContaining({ method: 'POST' }));
});

it('registers the uninstall webhook at the Worker callback URL', async () => {
  await registerInstallationWebhook(session, env);
  expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('/webhooks.json'), expect.objectContaining({ method: 'POST', body: expect.stringContaining('https://app.vswwy.cn/api/webhooks') }));
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd worker && npm test -- discount-publication.test.ts webhook-registration.test.ts`
Expected: FAIL with missing service modules.

- [ ] **Step 3: Port the existing verified REST adapters**

Reuse the request body validation and response-ID validation from `app/src/service/campaign/discount-adapter.ts`. Preserve Function ID `66a964153c3c4b42a6713162369e0df9` as the default and allow the Worker secret to override it. Register `apps/installed_uninstalled` at `https://app.vswwy.cn/api/webhooks`; never log authorization headers or response bodies.

- [ ] **Step 4: Run API adapter tests**

Run: `cd worker && npm test -- discount-publication.test.ts webhook-registration.test.ts`
Expected: PASS for successful activity IDs, rejected malformed IDs, 403 definitive failures, and network-uncertain publication state.

- [ ] **Step 5: Commit platform integration**

```bash
git add worker/src/services/discounts.ts worker/src/services/webhooks.ts worker/test/discount-publication.test.ts worker/test/webhook-registration.test.ts
git commit -m "feat(worker): publish SHOPLINE Function discounts"
```

### Task 9: Cron-Based Collection Conflict Monitor

**Files:**
- Create: `worker/src/jobs/collection-conflicts.ts`
- Modify: `worker/src/index.ts`
- Create: `worker/test/collection-conflicts-job.test.ts`

**Interfaces:**

```ts
export async function refreshCollectionConflicts(env: Env, now?: Date): Promise<{ scanned: number; refreshed: number; failed: number }>;
```

- [ ] **Step 1: Write failing scheduled-job tests**

```ts
it('refreshes active collection snapshots without creating another discount', async () => {
  const result = await refreshCollectionConflicts(env, new Date('2026-10-26T00:00:00.000Z'));
  expect(result).toEqual({ scanned: 1, refreshed: 1, failed: 0 });
  expect(discountCreate).not.toHaveBeenCalled();
});

it('uses one token refresh for an expired session during one scan', async () => {
  await refreshCollectionConflicts(env);
  expect(tokenFetcher).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd worker && npm test -- collection-conflicts-job.test.ts`
Expected: FAIL with missing job module.

- [ ] **Step 3: Implement the `scheduled()` path**

Query only active or scheduled collection campaigns, obtain a fresh tenant session, resolve current collection members using the existing pagination rules, persist the conflict snapshot, and record a bounded diagnostic event on per-shop failure. Do not call discount create, update, or delete from this job.

- [ ] **Step 4: Run job and full Worker tests**

Run: `cd worker && npm test`
Expected: PASS, including duplicate-run safety and expiry refresh coverage.

- [ ] **Step 5: Commit the scheduled monitor**

```bash
git add worker/src/jobs/collection-conflicts.ts worker/src/index.ts worker/test/collection-conflicts-job.test.ts
git commit -m "feat(worker): refresh collection conflicts on Cron"
```

### Task 10: Deployment Configuration, Cutover, and Production Verification

**Files:**
- Modify: `shopline.app.多件优惠.toml`
- Create: `docs/cloudflare-workers-runbook.md`
- Modify: `docs/APP_PROGRESS.md`
- Create: `worker/test/deployment-config.test.ts`

**Interfaces:**
- Produces a runbook with exact Cloudflare dashboard and Wrangler commands, secret names, migration command, rollback action, and manual SHOPLINE verification checklist.

- [ ] **Step 1: Write failing deployment configuration tests**

```ts
it('uses the stable Worker domain in SHOPLINE configuration', async () => {
  const manifest = await readFile('../shopline.app.多件优惠.toml', 'utf8');
  expect(manifest).toContain('appUrl = "https://app.vswwy.cn"');
  expect(manifest).toContain('"https://app.vswwy.cn/api/auth/callback"');
  expect(manifest).not.toContain('trycloudflare.com');
});
```

- [ ] **Step 2: Run the test and verify it fails before changing the manifest**

Run: `cd worker && npm test -- deployment-config.test.ts`
Expected: FAIL because the manifest still references the temporary tunnel.

- [ ] **Step 3: Prepare Cloudflare resources and deployment files**

Create the D1 database in the Cloudflare dashboard named `shopline-quantity-breaks`, copy its generated database ID into the `DB` binding, then set `SHOPLINE_APP_KEY`, `SHOPLINE_APP_SECRET`, `TOKEN_ENCRYPTION_KEY`, `ADMIN_INTERNAL_SECRET`, and `SHOPLINE_PRODUCT_DISCOUNT_FUNCTION_ID` as Worker Secrets. Apply the migration with `npx wrangler d1 migrations apply shopline-quantity-breaks --remote`, build `web`, and deploy with `npx wrangler deploy`. Update the SHOPLINE manifest only after the deployed Worker passes `/health` and static-asset checks.

- [ ] **Step 4: Run final automated verification**

Run: `cd worker && npm test && npm run typecheck && npm run build && cd ../app && npm test && npm run build && cd ../web && npm run test:prototype && npm run build && cd .. && git diff --check`
Expected: all suites and builds PASS, with no whitespace failures.

- [ ] **Step 5: Perform the manual production checklist**

Verify in order: `https://app.vswwy.cn/health`; embedded SHOPLINE OAuth; one new draft; one published product campaign; pause; storefront campaign lookup; cart Function output; an uninstall webhook; and a protected API request rejected after uninstall. If any check fails, use Cloudflare Workers Deployments to roll back to the preceding version before changing additional SHOPLINE settings.

- [ ] **Step 6: Commit release configuration and documentation**

```bash
git add shopline.app.多件优惠.toml docs/cloudflare-workers-runbook.md docs/APP_PROGRESS.md worker/test/deployment-config.test.ts
git commit -m "docs: document Worker deployment and cutover"
```

## Plan Self-Review

- Spec coverage: Tasks 1-2 create the Worker and D1 base; Tasks 3-5 implement secure persistence, OAuth, JWT validation, refresh locks, and Admin API access; Tasks 6-8 preserve state, routes, Function publication, and webhooks; Task 9 replaces the Node monitor; Task 10 covers deployment, cutover, rollback, and manual production verification.
- Failure coverage: Every item in Review Focus has an explicit test in Tasks 3-6 and 9.
- Compatibility coverage: Task 7 asserts API paths and representative response shapes before replacing Express route adapters.
- Scope control: No task imports legacy data, moves Function WASM hosting, changes business rules, or changes frontend behavior without a route-contract failure that requires an adaptation.
- Security coverage: Tasks 3-5 test encryption, signature validation, timestamp windows, JWT tampering, active-installation checks, raw-body webhook verification, and refresh concurrency.
