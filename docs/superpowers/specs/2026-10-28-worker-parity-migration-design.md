# Worker Parity Migration Design

## Goal

Move the current uncommitted Quantity Breaks behavior from the desktop `main`
checkout into the deployed `codex/cloudflare-workers-d1` Worker branch without
copying the retired Express/SQLite runtime into production. The resulting
Worker and D1 application must preserve the intended admin, storefront, and
theme-extension behavior while keeping the existing OAuth and session model.

## Current Architecture

The desktop checkout contains three implementation areas:

- `web/`: React/Vite admin UI and local preview.
- `app/`: legacy Express and SQLite implementation. It is no longer deployed.
- `theme-app-extension/`: SHOPLINE product-page app block.

The deployed branch runs a different server boundary:

- `worker/src/`: Hono routes, D1 repositories, OAuth sessions, and SHOPLINE
  API clients.
- `web/`: the same React application, served from Worker assets after build.
- `theme-app-extension/`: uploaded and published independently of Wrangler.

`worker/` is the sole backend runtime after this migration. Changes under
`app/` are source behavior references only and must be translated to the
matching Worker module and D1 contract. No Express route, SQLite file, or
server-side session implementation is copied into the Worker.

## Scope

### Worker API Parity

The Worker must incorporate the intended behavior represented by the desktop
changes, using existing Hono/D1 conventions:

1. Product lookup accepts either a single `id` or validated comma-separated
   `ids`, never both. Batch requests are limited to 50 product IDs per
   upstream SHOPLINE request, preserve requested order, and report missing
   IDs explicitly rather than rendering raw IDs as product titles.
2. Existing campaigns support a status-preserving update. Draft, Paused,
   Active, Scheduled, and Ended records retain their stored status. An active
   or scheduled campaign updates the same confirmed platform discount ID only
   after D1 revision and publication-state checks succeed.
3. A definitive SHOPLINE update rejection restores the previous editable
   state. A timeout, malformed response, network failure, or a changed
   platform discount ID enters `needs_reconciliation`; retries remain blocked
   until the state is resolved.
4. Published collection scopes are revalidated before updates. A changed
   collection scope is rejected until a separately verified collection-variable
   workflow exists.
5. Translation routes retain HTTP error classes, do not expose credentials or
   upstream bodies, and use request identifiers only in safe server-side
   diagnostics.
6. The public storefront campaign response includes validated saved copy so the
   theme extension can translate its visible strings. It never exposes OAuth
   tokens, platform discount IDs, or admin-only data.

### Admin UI Parity

The Worker branch receives the current `web/` behavior only after its API
contracts exist:

- selected-product hydration uses batched IDs and represents missing products
  as unavailable;
- campaign rows open a read-only detail view while row actions do not trigger
  navigation;
- existing campaigns show Update rather than create-only actions;
- list dates and tier summaries use the current locale and campaign timezone;
- translation navigation clears campaign-only transient dialogs and retains a
  translation-specific loading/error state;
- preview product, widget summary, and localized UI copy continue to consume
  the Worker API through authenticated fetch.

The UI must continue to preserve the approved Quantity Breaks layout and
accessibility rules. This migration does not redesign the application.

### Theme App Extension Parity

The theme block changes are migrated separately from Worker deployment:

- provide product title, variant title, and compare-at price to the block;
- calculate original price, estimated savings, and total using integer minor
  units for all supported per-item and bundle discount types;
- preserve the distinction between preview pricing and checkout authority;
- render translated copy with saved copy as an optional override and stable
  fallback strings;
- notify a theme cart adapter only after confirmed atomic cart add, dispatch
  `quantity-breaks:cart-updated`, and retain an accessible local fallback;
- keep badges positioned inside their own tier card and avoid overlap at
  narrow widths.

Publishing the theme extension remains a separate SHOPLINE action (`sl
extension push` followed by partner-dashboard version publication). Wrangler
does not publish theme extension files.

## Explicit Non-Goals

- Do not merge the Worker feature branch into `main` in this migration.
- Do not claim a real SHOPLINE discount update, storefront add-to-cart, theme
  render, Function checkout output, or browser visual state as verified until
  it has been performed in an authenticated test store.
- Do not change OAuth signature checks, timestamp validation, session token
  verification, token encryption, D1 secrets, or Function deployment unless a
  separate verified requirement demands it.
- Do not deploy `app/`, migrate SQLite data, or copy its tests verbatim where
  they rely on Express or SQLite internals.
- Do not upload a Function or publish a theme extension as part of code
  migration without a separate explicit request.

## Data and Failure Boundaries

```text
React admin UI
  -> authenticated Worker API
  -> D1 campaign/publication/translation state
  -> SHOPLINE Admin APIs

Theme App Block
  -> public Worker storefront endpoint
  -> D1 active campaign and saved copy
  -> theme cart endpoint/event bridge
```

The Worker owns validation, D1 state transitions, and SHOPLINE calls. React
and the theme block treat API values as untrusted and render only validated
view models. A failed upstream call must not overwrite a confirmed campaign,
silently retry a side effect, or reveal confidential data.

## Migration Method

1. Map each changed desktop file to an existing Worker counterpart or mark it
   as theme-only, UI-only, test-only, or documentation-only.
2. Port Worker API behavior test-first using Hono route tests and D1
   repositories. Preserve Worker revision/CAS and publication-lock semantics.
3. Port matching React changes and adapt their tests to Worker response
   contracts. Do not add a compatibility dependency on `app/`.
4. Port theme extension files and extend its Node tests for pricing, copy, and
   cart-event behavior.
5. Run Worker tests/type-check, frontend tests/build, and theme tests before
   preparing a deployment artifact.
6. Keep generated `web/dist` out of Git. Build it inside the Worker worktree
   immediately before the user-authorized Wrangler deployment.

## Acceptance Criteria

- No runtime Worker import depends on `app/`.
- All migrated route behavior has focused regression tests that fail before
  implementation and pass after it.
- The Worker suite, type-check, web test suite/build, and theme test suite
  pass on the feature branch.
- The theme extension only requires its configured HTTPS API origin and does
  not rely on Worker deployment to publish block files.
- Git review lists only migrated source, tests, and truthful documentation.
- Any deployment or Git push occurs only after explicit user approval for the
  reviewed change set.
