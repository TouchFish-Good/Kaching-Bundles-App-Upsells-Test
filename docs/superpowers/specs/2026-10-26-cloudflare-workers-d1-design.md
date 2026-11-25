# Cloudflare Workers and D1 Migration Design

## Goal

Move the SHOPLINE Quantity Breaks application backend from Express and local SQLite to Cloudflare Workers, D1, and the existing production hostname `https://app.vswwy.cn`.

The migrated application must preserve the existing API contract for the React administration UI and storefront widget, while requiring merchants to authorize again and create new campaigns after cutover.

## Scope

Included:

- A single Worker deployment named `shopline-quantity-breaks` serving the React static assets and all backend routes.
- D1 storage for OAuth installation state, encrypted SHOPLINE tokens, campaigns, publications, translations, webhook events, collection conflict snapshots, and internal-admin diagnostics.
- Worker-native SHOPLINE OAuth, session-token verification, Admin API access, and webhook verification.
- A Cron Trigger replacement for the current in-process collection-conflict monitor.
- Build, local test, staging, production rollout, and rollback procedures.

Excluded:

- Importing `quantity-breaks.sqlite`, `database.sqlite`, or `admin-read.sqlite` data.
- Changing discount business rules, Function rule format, storefront-widget behavior, or existing API response shapes.
- Moving the SHOPLINE Product Discount Function WASM to Cloudflare. It remains deployed through the existing SHOPLINE Function build and extension-push workflow.

## Constraints

- The production hostname is `https://app.vswwy.cn`, already attached to the existing Worker in Cloudflare.
- The migrated service must not rely on persistent local files, `app.listen()`, Express middleware, Node `sqlite3`, or the Express-specific SHOPLINE app SDK.
- The frontend must keep its current `/api/*` and `/public/*` URLs.
- Existing merchants and legacy campaigns do not need to be preserved; every merchant reauthorizes and recreates campaigns after cutover.
- SHOPLINE endpoint paths, signing requirements, and token-exchange fields must be derived from verified current SDK behavior and documented protocol contracts, never guessed.
- Application secrets, access tokens, refresh tokens, and executable cURL output must not be logged, committed, emitted to the frontend, or stored as unencrypted D1 values.

## Architecture

```text
SHOPLINE Admin / Storefront
  -> https://app.vswwy.cn
      -> Cloudflare Worker: shopline-quantity-breaks
          -> React static assets from web/dist
          -> Hono routes
              -> Worker-native SHOPLINE OAuth and session verification
              -> D1 repositories
              -> SHOPLINE Admin API
          -> Worker-native webhook HMAC verification
          -> scheduled() collection conflict refresh

SHOPLINE Product Discount Function
  -> remains a separately deployed WASM Function
```

Create a new `worker/` package rather than adapting the existing `app/` Express process. The old `app/` package remains available during migration as the compatibility reference, but does not receive production traffic after cutover.

The Worker package has focused modules:

```text
worker/
  src/index.ts                 Worker entry, Hono app, static-asset fallback
  src/env.ts                   Validated bindings and non-secret configuration
  src/auth/                    OAuth, JWT, signing, token encryption, webhook verification
  src/db/                      D1 schema access and repositories
  src/routes/                  HTTP adapters for existing APIs
  src/services/                SHOPLINE Admin API and domain-service adapters
  migrations/                  Ordered D1 schema migrations
  test/                        Worker, crypto, D1, and route contract tests
  wrangler.toml                Worker, D1, assets, and Cron configuration
```

Pure business logic is reused or moved only when it does not depend on Express, `sqlite3`, or Node-only APIs. Route handlers receive a Worker request context and return Web `Response` objects; domain repositories receive a D1 binding rather than a filesystem database handle.

## API Compatibility

The following externally consumed paths remain stable:

```text
GET  /api/auth
GET  /api/auth/callback
POST /api/webhooks

GET  /api/quantity-breaks/campaigns
POST /api/quantity-breaks/campaigns
GET  /api/quantity-breaks/campaigns/:id
POST /api/quantity-breaks/campaigns/:id/status

GET  /api/quantity-breaks/products
GET  /api/quantity-breaks/collections
GET  /api/quantity-breaks/collections/:id
GET  /api/quantity-breaks/collections/:id/products
GET  /api/quantity-breaks/markets
GET  /api/quantity-breaks/shop
GET  /api/quantity-breaks/store-languages
GET  /api/quantity-breaks/translations/:locale
POST /api/quantity-breaks/translations/:locale

GET  /public/quantity-breaks/campaign
GET  /internal/admin-read/v1/*
```

`/api/*` requires a valid SHOPLINE session token and an active installation record. `/public/*` is tenant-scoped and returns only active, eligible storefront data. The internal-admin routes retain their existing shared-secret protection and never become public storefront endpoints.

## D1 Data Model

The initial migration creates these tables and constraints:

| Table | Responsibility |
| --- | --- |
| `shopline_sessions` | One active installation per store handle; encrypted refresh/access tokens, expiry, scopes, installation state and timestamps. |
| `quantity_breaks_campaigns` | Campaign JSON, optimistic revision and update timestamp, keyed by store handle and campaign ID. |
| `quantity_breaks_publications` | Current SHOPLINE discount activity ID and state for each campaign. |
| `quantity_breaks_shop_locks` | Expiring store-level publication lock for create, update, pause and reconciliation actions. |
| `quantity_breaks_collection_conflicts` | Last verified conflict state for category-based campaigns. |
| `quantity_breaks_translations` | Store-scoped locale copy JSON and update timestamp. |
| `webhook_events` | Idempotency key for received webhook IDs. |
| `admin_stores` | Shop installation status used by internal diagnostics. |
| `admin_installations` | Installation and uninstallation history. |
| `admin_error_events` | Sanitized operational error events. |
| `token_refresh_locks` | Short-lived lock preventing duplicate token refreshes across Worker isolates. |
| `public_rate_limits` | Windowed counter for public OAuth and webhook request limits. |

No legacy SQLite data is imported. D1 migrations are immutable, ordered SQL files and run before any Worker version is made production.

## Authentication and Security

OAuth, session authentication, and webhook validation are security-critical code paths.

- OAuth entry and callback routes validate the signed query and reject timestamps outside the documented ten-minute window.
- The callback exchanges the code only after validation, persists the new installation atomically, and redirects the embedded app using the documented session-token flow.
- API middleware extracts the JWT audience only to locate the app configuration, then verifies the full signature and expiry using Web Crypto before injecting a tenant context.
- The middleware checks that the tenant is still installed before any protected route runs.
- Webhook handling reads the raw body before parsing JSON and uses a constant-time HMAC comparison. Uninstall events invalidate the installation and remove cached token state.
- SHOPLINE refresh tokens and access tokens are encrypted with AES-GCM before storage in D1. `TOKEN_ENCRYPTION_KEY` is a Worker secret, not a D1 value.
- Token refresh uses an expiring D1 lock so concurrent Worker requests cannot issue duplicate refresh calls.
- OAuth and webhook endpoints receive basic per-IP window limiting and return `429` with `Retry-After` when exceeded.
- The embedded frontend must use SHOPLINE App Bridge for reauthorization navigation; it must not use `window.location.href` or `window.open` to escape the iframe.

## Background Processing

The Worker `scheduled()` handler replaces the Node process monitor. It loads active or scheduled collection-scoped campaigns, resolves their current members through the SHOPLINE Admin API, recalculates persisted conflict snapshots, and records bounded sanitized failures. It must not issue duplicate discount updates merely because a scheduled scan ran.

## Cloudflare Configuration

Worker binding and deployment configuration:

```text
Worker name:      shopline-quantity-breaks
Custom domain:    app.vswwy.cn
D1 binding:       DB
Static assets:    ../web/dist
Cron trigger:     collection-conflict refresh schedule
```

Worker Secrets:

```text
SHOPLINE_APP_KEY
SHOPLINE_APP_SECRET
TOKEN_ENCRYPTION_KEY
ADMIN_INTERNAL_SECRET
SHOPLINE_PRODUCT_DISCOUNT_FUNCTION_ID
```

Non-secret Worker variables:

```text
SHOPLINE_APP_URL=https://app.vswwy.cn
SCOPES=read_products,write_products,read_discounts,write_discounts,read_store_information,read_markets,read_translation,read_orders
SHOPLINE_QUANTITY_BREAKS_PUBLICATION_ENABLED=true
```

`SHOPLINE_LOG_FULL_CURL` is not configured in production. Secrets are added through the Cloudflare dashboard or `wrangler secret put`; no source file contains their values.

## Rollout

1. Implement and test the Worker package locally against an isolated D1 database.
2. Create the production D1 database, configure its `DB` binding, and apply migrations.
3. Set production secrets in Cloudflare, build `web/dist`, and deploy the Worker without changing SHOPLINE application settings.
4. Verify the Worker health endpoint, static assets, protected-route rejection behavior, and public route isolation on `app.vswwy.cn`.
5. Update the SHOPLINE application address to `https://app.vswwy.cn` and callback URL to `https://app.vswwy.cn/api/auth/callback`, then publish that configuration using the established SHOPLINE workflow.
6. Reauthorize a test merchant, create a campaign, publish it, pause it, verify storefront data, and exercise the Product Discount Function at checkout.
7. Mark the deployed Worker version as the production baseline only after all acceptance checks pass.

If cutover fails, roll back to the prior Cloudflare Worker deployment, restore the prior SHOPLINE application URL/callback configuration if it was changed, and keep D1 intact for diagnosis. No destructive D1 operation is part of rollback.

## Testing and Acceptance

Automated coverage must include:

- Query-signature, timestamp-window, session JWT, token-encryption and webhook-HMAC positive and negative tests.
- D1 repository tests for campaign revisions, publication states, tenant isolation, token-refresh locking, and webhook idempotency.
- Route-contract tests ensuring current URLs, statuses and response shapes remain compatible with the frontend and widget.
- Tests for current business rules: same-level scope conflict rejection, direct-product precedence over category scope, highest reached tier behavior, and Function publication lifecycle.
- Cron tests ensuring collection scans persist a result without publishing duplicate discounts.
- Worker build, frontend build, D1 migration validation, and static-asset fallback tests.

Manual production acceptance requires a real SHOPLINE reauthorization, campaign lifecycle exercise, storefront public-data verification, checkout Function output verification, uninstall webhook verification, and a post-uninstall rejection of protected APIs.
