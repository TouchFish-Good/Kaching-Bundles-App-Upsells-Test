# Campaign Platform State Synchronization Design

**Date:** 2026-11-03

## Goal

Make Quantity Breaks campaign state authoritative, safe, and explainable across the app and SHOPLINE. Merchant pauses must preserve the same SHOPLINE automatic discount, subscription expiry must remove access, external SHOPLINE changes must reconcile into the app, batch activation must continue around isolated conflicts, and SHOPLINE discount deep links must resolve to the managed campaign.

## Confirmed Business Rules

- SHOPLINE is the source of truth for a platform discount's active/paused/deleted state. D1 stores campaign configuration, the platform association, and the last verified projection.
- A merchant pause deactivates the existing platform discount and preserves its ID. Reactivation activates that same ID.
- Subscription expiry, cancellation, or confirmed loss of `quantity_breaks_access` deletes the platform discount. The campaign configuration remains locally paused with `pauseReason=subscription_expired`; renewal does not automatically recreate or activate it.
- After renewal, an explicit merchant activation creates a new platform discount from the saved configuration.
- Product-to-product scope overlap is blocking when active time ranges overlap.
- Collection-to-collection overlap is blocking when the selected collection ID sets intersect. The conflict must name both campaigns and the overlapping collection.
- Collection-to-product and product-to-collection overlap is not checked and does not block publication.
- Collection membership is still resolved for the Function publication payload, but product membership is not used to decide collection-to-collection conflicts.
- A pause action requires an App Bridge confirmation with Cancel and Confirm. Cancel must not send a write request.

## State Model

`quantity_breaks_publications` will retain the platform discount ID for merchant-paused campaigns and distinguish the following operational states: `active`, `paused`, `publishing`, `activating`, `pausing`, `unpublishing`, `entitlement_revoked`, `needs_reconciliation`, and `missing`.

`entitlement_revoked` is terminal for the current platform ID: a successful subscription-expiry deletion clears the current association, while the campaign configuration and `pauseReason` remain available for later explicit republishing. A failed deletion remains retryable and is never presented as safely revoked.

Every platform mutation is followed by a read-back verification. A timeout, malformed response, mismatched ID, or failed read-back moves the publication to `needs_reconciliation` and leaves the last confirmed campaign state intact.

## Server Flow

### Merchant pause

The authenticated campaign status route checks entitlement, loads the current publication, verifies the platform association, calls the platform deactivate operation, verifies the platform state, and only then commits `paused` while retaining the same `discount_id`.

### Merchant activation

The route first reconciles the local association with SHOPLINE, verifies entitlement, and runs the server-side coverage check. A merchant-paused campaign with a confirmed existing ID uses platform activate. A subscription-revoked or missing campaign creates a new platform discount and stores the returned ID only after read-back verification.

### External state reconciliation

Campaign list/detail reads and status writes reconcile known platform IDs. Platform paused/active states update the local projection; a missing platform ID becomes `missing`; upstream failure preserves the last confirmed state and exposes an unverified/reconciliation condition rather than inventing success. No discount webhook topic is assumed until verified against SHOPLINE documentation and a development store.

### Subscription revocation

The existing subscription operation queue remains the durable executor. After confirmed entitlement loss, it deletes each known platform discount, accepts a confirmed not-found response as idempotent completion, retries uncertain failures with backoff, and then writes `entitlement_revoked` plus `subscription_expired`. Campaign writes remain gated by the subscription access route. Reinstatement only unlocks explicit activation; it does not recreate campaigns automatically.

## Coverage Checking

Publication will expose structured per-campaign results rather than a single generic conflict error. The batch activation operation evaluates each selected campaign independently under the shop publication lock:

```text
{ campaignId, outcome: "activated" | "already_active" | "conflict" | "unverified" | "failed", conflicts: [{ campaignId, campaignName, productIds, collectionIds }] }
```

For product-to-product conflicts, `productIds` identify the overlap. For collection-to-collection conflicts, `collectionIds` identify the shared collection objects and the response includes their display names when available. Collection/product pairs produce no conflict result. One conflict or unverified campaign does not prevent unrelated selected campaigns from being activated.

The editor's manual coverage check remains a preview aid, but activation never depends on the merchant having clicked it. Collection member expansion remains required for the Function's publication data and is independently reported as `unverified` when SHOPLINE catalog access fails.

## Frontend Behavior

- Single and batch pause actions use the existing App Bridge confirmation boundary. The Confirm path shows loading state and refreshes from the server; Cancel is side-effect free.
- Batch activation uses a server result set. Toast/message counts include only platform-confirmed activations and separate already-active, conflict, unverified, and failed outcomes. Conflict messages name both campaigns and the overlapping product or collection.
- The list refreshes after any status action and does not infer platform state from the previous local row.
- Subscription-revoked campaigns show a locked state and route the merchant to the plan page; the saved configuration remains visible but cannot be activated without entitlement.
- The entry loader treats `/product-discount-customizations/{functionId}/{discountId}` as an embedded Quantity Breaks entry. The resolved campaign editor route preserves `appkey`, `handle`, `shop`, language, and embedded query parameters; active campaigns use the existing published-rule update flow. An unknown association receives a controlled “not managed by this app” state instead of the generic 404.

## Platform Boundary

The app can reliably remove and later recreate discounts that it owns and has recorded. It cannot guarantee that a merchant with unrestricted SHOPLINE admin privileges will never create an unrelated discount using the same Function unless SHOPLINE exposes a documented Function-level entitlement gate. No undocumented store-level entitlement input will be invented.

## Verification Plan

- Worker unit and route tests cover deactivate/activate/delete/read-back, ID preservation, subscription revocation and retry, structured conflict results, and partial batch success.
- Frontend tests cover App Bridge cancellation, confirmation, real batch counts, external-state refresh, deep-link routing, unknown platform IDs, and localized conflict messages.
- Run Worker type checks, targeted tests, full frontend tests, production build, and `git diff --check`.
- Perform embedded SHOPLINE development-store verification for merchant pause/resume, manual SHOPLINE pause/resume reconciliation, subscription expiry deletion, renewal and explicit republish, mixed batch conflicts, and platform deep links. Update `docs/APP_PROGRESS.md` only with behavior actually exercised.

## Non-Goals

- No change to the Quantity Breaks pricing calculation or Function discount math.
- No new unsupported SHOPLINE webhook topic or undocumented API field.
- No automatic republish after subscription renewal.
