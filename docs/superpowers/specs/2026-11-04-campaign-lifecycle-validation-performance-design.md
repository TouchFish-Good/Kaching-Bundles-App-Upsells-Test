# Campaign Lifecycle, Validation, and Read Performance Design

## Scope

This change corrects the lifecycle of a merchant-paused Product Function
discount, validates required campaign settings before publication or update,
and removes avoidable serial work from campaign list and detail reads.

The live SHOPLINE Product Function discount state remains the runtime source of
truth. D1 keeps campaign configuration, the current platform discount mapping,
and operation/reconciliation state.

## Confirmed Lifecycle

### Merchant pause

1. The application updates the current automatic discount with
   `ends_at = now + 10 seconds`.
2. The immediate readback may still be `active`; the application reports
   `pausing` and keeps the current mapping only while that transition is
   pending.
3. A subsequent list/detail reconciliation that reads SHOPLINE `expired`
   deletes that expired platform discount. It then clears the platform discount
   ID and records the campaign as locally `paused` with a merchant-pause
   reason.
4. Deletion failure is uncertain, remains retryable, and must not pretend that
   the old platform entity was safely removed.

### Merchant restart

1. A paused campaign has no reusable platform discount ID after the expired
   entity is removed.
2. The restart flow resolves current collection members when applicable,
   performs the existing coverage conflict checks, and creates a new automatic
   discount from the stored campaign configuration.
3. The new request sets `ends_at: null` for a continuously effective discount.
4. Only a confirmed `active` SHOPLINE readback updates D1 with the new discount
   ID and marks the campaign active.

The old `resumeAutomaticDiscount(... ends_at: null)` operation is removed from
merchant restart flows. SHOPLINE rejects updates to an `expired` discount with
HTTP 400, so retaining the ID is not a reliable contract.

### Subscription expiration

Subscription expiration still deletes each associated platform discount and
preserves the campaign configuration. It clears the mapping with
`subscription_expired` as the reason. A later merchant-initiated restart also
creates a new continuous automatic discount. This shares the platform cleanup
and creation mechanics with merchant pause while preserving distinct reason
codes and trigger ownership.

## Status Reconciliation

When SHOPLINE reports `expired` or `inactive`, reconciliation derives the
campaign display state as `paused`, clears stale scheduled/active resume state,
and initiates safe deletion of the expired discount. A current platform state
always supersedes stored campaign `status`; a stale `resumeStatus` must never
produce a "Scheduled" badge after SHOPLINE has expired the discount.

The delete transition is idempotent. A missing discount is treated as already
cleaned up. Uncertain reads or deletes preserve the last confirmed mapping and
show an unverified operation state rather than fabricating success.

## Editor Validation and Scheduling

Campaign title, start time, and end time are required for a create, publish,
or update action unless the merchant selects the new **Never expires** checkbox.

- The checkbox replaces "optional" in the end-time label.
- Checked: the editor sends `endsAt: undefined`/`ends_at: null`.
- Unchecked: a non-empty end time is required and must be after the start time.
- Missing fields expand the collapsed Settings section before feedback is
  displayed.
- The feedback uses the existing App Bridge notification surface and is backed
  by message keys for every supported app locale. The messages identify each
  missing field independently.
- Server validation remains authoritative and uses the same required-time
  contract, so API clients cannot bypass the constraints.

## Read Performance

`GET /campaigns` must keep one paginated SHOPLINE Function discount-list read
for all published campaign mappings, then use batched D1 projection reads and
batch reconciliation writes. It must not issue one D1 get/publication/conflict
sequence per row. `GET /campaigns/:id` should load its campaign and publication
projection once and reconcile no more than its single mapped discount.

The response shape remains compatible. Its `platformStatus` derives from the
fresh SHOPLINE result when available; `platformOperationState` carries local
transition/reconciliation information only.

## Error Handling

- A rejected old-discount deletion fails the restart rather than creating a
  second overlapping platform discount.
- An uncertain deletion leaves the campaign in reconciliation and prevents
  duplicate creation until the state is verified.
- Collection membership and conflict failures retain their current clear
  per-campaign batch result.
- Existing rate-limit handling remains in place; list reconciliation performs
  one Function list call per request and avoids per-row SHOPLINE status calls.

## Tests and Acceptance

Worker tests cover expired cleanup, restart creation with `ends_at: null`, new
mapping replacement, subscription-expired preservation, and stale scheduled
state correction. Route tests cover batch behavior and ensure one list request
for a list projection.

Web tests cover each missing required field, settings expansion, localized
App Bridge messages, the Never expires payload, and mapping of a reconciled
expired platform state to Paused. Automated timing tests assert the list route
uses its batch repository projection rather than serial repository calls.

Before release, run worker and web test suites, type checks, production builds,
and inspect the completed diff. Real embedded SHOPLINE verification remains
required for the 10-second expiry, cleanup, and replacement discount behavior.
