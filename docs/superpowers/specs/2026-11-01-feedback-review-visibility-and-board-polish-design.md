# Feedback Review Visibility and Board Polish Design

## Goal

Make the `需求与建议` board a moderated, reliable merchant-feedback channel:

- New merchant suggestions remain private until a developer reviews them.
- Approved work is public; rejected work remains visible only to its author.
- A merchant may withdraw only a suggestion that has not been reviewed yet.
- The board, suggestion dialog, and detail dialog present this behaviour with a compact shadcn-inspired interface that works as a three-column masonry feed on desktop and one column on mobile.

The merchant application continues to use the existing React components, local button primitives, CSS Modules, and App Bridge notification path. The repository does not contain a shadcn installation, Tailwind, or `components.json`; this change intentionally adopts shadcn interaction and visual conventions without adding a second UI framework.

## Product Rules

### Visibility and review state

`feedback_requests.status` continues to use `pending`, `approved`, `in_progress`, `released`, and `rejected`. Visibility is derived by the developer review workflow, not selected by the browser.

| State | Visibility to other merchants | Visibility to author in `我的建议` | Can author withdraw? |
| --- | --- | --- | --- |
| New `pending` submission | Hidden | Yes | Yes |
| `approved` | Public | Yes | No |
| `in_progress` | Public | Yes | No |
| `released` | Public | Yes | No |
| `rejected` | Hidden | Yes | No |
| Withdrawn by author | Hidden | No | Already withdrawn |

The Developer Platform is authoritative for a review outcome. Its existing signed status endpoint sets a persistent review timestamp whenever it records a review. `approved`, `in_progress`, and `released` make the suggestion public; `rejected` makes it hidden. A developer cannot make a merchant-selected visibility decision through that endpoint.

The public board contains only `approved`, `in_progress`, and `released` suggestions whose visibility is `public`. It never exposes a pending or rejected suggestion, including its title, content, counts, comments, or detail route.

`我的建议` is an authenticated, server-filtered view rather than a browser-side filter over public data. It includes the current store's non-withdrawn suggestions, including its hidden pending and rejected records. No other store can discover those records by ID, query, count, comment, vote, official reply, or pagination side channel.

### Withdrawal

A withdrawal is allowed only when all server-side conditions are true:

1. The authenticated store owns the suggestion.
2. Its status is `pending`.
3. Its visibility is `hidden`.
4. `reviewed_at` is null.
5. It was not already withdrawn.

The request is idempotent only for the first successful withdrawal; retrying after success returns the normal unavailable result. The Worker records a merchant-withdrawal audit event and `hidden_reason = 'withdrawn_by_submitter'`. Withdrawn records remain available to protected audit tooling but are excluded from merchant list, count, and detail responses. Existing vote, comment, or reply records do not change these rules; the trusted review timestamp is the sole boundary for merchant withdrawal.

### Historical migration

The migration changes every existing `pending` and `public` request to hidden, provided it has not already been explicitly withdrawn. This prevents historical unreviewed posts from staying public. It does not invent a review timestamp, so their original authors can still withdraw them until a developer records a review. Existing approved, in-progress, released, and rejected records retain their previous status and visibility unless separately moderated later.

The same migration adds nullable `reviewed_at` to `feedback_requests`. Existing status history is not retroactively treated as a developer review because it cannot reliably establish the requested review boundary. Future Developer Platform status writes set this field in the same D1 batch as the status history and audit record.

## Merchant API Contract

All merchant feedback routes retain `requireShoplineSession` and resolve the trusted `store_id` and `handle` from the server-side session. Browser request fields never decide ownership, display name, review status, visibility, or withdrawal eligibility.

| Route | Change |
| --- | --- |
| `POST /api/quantity-breaks/feedback` | Validate title at 1--100 code points and content at 1--400 code points. Insert `pending`, `hidden`, and `reviewed_at = NULL`. Store the authenticated handle snapshot unless `isAnonymous` is true. Return the author-visible detail. |
| `GET /api/quantity-breaks/feedback` | Without `mine=1`, return public review-complete records only. With `mine=1`, return only the authenticated store's non-withdrawn records, including its hidden pending and rejected records. Counts are calculated in the same visibility scope as the selected view. |
| `GET /api/quantity-breaks/feedback/:id` | Return public records to any authenticated store. Return an otherwise hidden record only to its submitter when it is not withdrawn. Return `404` to every other caller. Include `commentCount` and a server-computed `canWithdraw` flag. |
| `POST /api/quantity-breaks/feedback/:id/vote` | Continue to require a public suggestion. Hidden author-only suggestions cannot be voted on. |
| `POST /api/quantity-breaks/feedback/:id/comments` | Continue to require a public suggestion. Hidden author-only suggestions cannot be commented on. The response receives the same safe author display-label rules. |
| `DELETE /api/quantity-breaks/feedback/:id` | Apply the five withdrawal checks above in the SQL update. Return unavailable/`404` when any check fails so review state is not exposed to a non-owner. |
| `PATCH /internal/admin/v1/feedback/:id/status` | In one batched transition, write status, derived visibility, `reviewed_at`, history, and audit data. Return the author-visible or public DTO only when the caller needs it; the Developer Platform must not rely on merchant visibility to identify the record. |

All list and detail DTOs add `commentCount`. List cards continue to receive `voteCount`, `voted`, `isMine`, and `hasOfficialReply`; details additionally receive `canWithdraw`. SQL uses a correlated `COUNT(*)` for comments so the new count remains authoritative without adding an error-prone denormalized column.

The existing anonymous identity policy remains unchanged: a non-anonymous suggestion or comment displays its authenticated SHOPLINE store handle snapshot, and an anonymous one displays exactly `匿名用户`. The developer-side reply route remains outside the merchant application and always renders `多件折扣` with the established developer icon.

## UI and Interaction Design

### Board

The board keeps its current route and App Bridge-aware page shell. It removes the `feedback-list-title` heading and retains search, sort, status filters, pagination, and the `我的建议` toggle.

- Status filters are direct buttons, not a select. Each text label uses that status's semantic color and displays a count for the active visibility scope.
- The `我的建议` filter includes the authenticated merchant's hidden pending and rejected records. Its count includes all non-withdrawn records the merchant may see.
- Desktop uses CSS columns for three variable-height card columns; it falls back to two columns at the existing medium breakpoint and exactly one column on mobile.
- Each card is one click target except its vote control. It has a status-specific border, status badge at top left, and a more distinctive `我的` badge at top right when owned by the current store.
- Each card shows its full title, a two-line clamped body, comment count, vote control/count, and a timestamp with seconds centered over the bottom border. It must not add a title clamp.
- A successful vote updates the card and detail state optimistically, then shows the existing compact vote pulse. Failed requests restore the previous vote state.
- A visible page-level contact note includes `2458472041@qq.com` for questions.

### Suggestion dialog

The suggestion dialog is a compact, shadcn-inspired modal with a translucent blurred backdrop. It contains:

1. `提交建议` and an icon-only close control.
2. Title field with a live `current/100` indicator.
3. Content field with a live `current/400` indicator.
4. Anonymous checkbox. Checked means the public label is `匿名用户`; unchecked means the store handle is displayed after approval.
5. Cancel and submit actions.

The submit action is disabled until both normalized title and normalized content are nonblank, then disabled while the request is in flight. Composition events are handled so a Chinese IME composition is not truncated, rejected, or submitted before the final composed character is committed. Client counters count Unicode code points; the Worker remains the validation authority. On success, the dialog closes and the existing App Bridge success prompt is used. The submitted record appears only in `我的建议` until reviewed.

### Detail dialog and comments

Opening a card shows a blurred-overlay detail dialog with the following order:

1. Full title and status badge.
2. Full content.
3. Author label (store handle or `匿名用户`) and localised timestamp including seconds.
4. Vote button/count; for an eligible author, a withdrawal action with confirmation.
5. A divider labelled with the exact comment total.
6. Merchant comments: author label and timestamp including seconds, followed by comment text.
7. Official replies: `多件折扣`, the existing developer icon, timestamp including seconds, and reply text.
8. Comment textarea, anonymous checkbox, and `提交评论` action.

The comment action remains disabled while its normalized text is blank or a request is in flight. Form refs are optional implementation details; submission must never call `.reset()` on a null ref. The implementation uses controlled inputs and resets draft state after a successful response, which removes the current null-ref failure. The dialog scrolls internally on narrow viewports without moving the close control out of reach.

Attachments stay explicitly out of scope. The prior merchant attachment design is superseded because this release must not introduce R2 or attachment UI.

### Visual language and accessibility

The existing Sea/Mint/Coral app tokens remain the reference. The feedback-only refinements borrow shadcn conventions: restrained 6--10px radii, thin neutral borders, semantic badges, compact button height, soft elevation, grouped form fields, and an explicit disabled state. They do not install shadcn or replace global styling.

Status color is always paired with Chinese status text. Buttons retain accessible names, dialogs retain modal semantics and labels, and the close action has a tooltip/title. No new or modified `:focus`, `:focus-visible`, or related CSS rules are allowed.

## Data and Repository Boundaries

The Worker repository owns all permission predicates and DTO shaping. Route handlers only authenticate, validate request syntax, and translate results into HTTP responses. React renders `canWithdraw` rather than reconstructing eligibility from stale client values.

The feedback migration adds `reviewed_at` and indexes the list paths used by public and own-only queries. It also updates the schema test fixtures and migration registration. The repository separates three query predicates:

- `public`: `visibility = 'public'` and status in `approved`, `in_progress`, `released`.
- `author-visible`: current `submitter_store_id`, not `withdrawn_by_submitter`; may be public or hidden.
- `withdrawable`: author-visible plus hidden pending and `reviewed_at IS NULL`.

This separation prevents a future UI change from leaking pending/rejected records through search, counts, pagination, votes, comments, or detail lookup.

## Errors and Compatibility

- Invalid 101+ code point titles or 401+ code point contents receive the existing validation response shape and retain the draft in the dialog.
- A hidden non-owner lookup is indistinguishable from a nonexistent record (`404`).
- An unavailable withdrawal does not disclose which condition failed. The UI refreshes the selected detail/list after a conflict so stale actions disappear.
- A Developer Platform status request is audit-visible even where a status has the same value; it is a review event for withdrawal eligibility. A future API may make this transition explicit, but this release preserves the current endpoint shape.
- Existing approved/in-progress/released records remain readable. Existing public pending records are intentionally removed from public discovery when the migration runs.

## Verification

### Worker tests

- Migration tests verify `reviewed_at`, indexes, and historical public-pending migration behaviour.
- Repository tests verify creation as hidden pending, public-vs-author query isolation, counts, comment counts, and public detail access.
- Withdrawal tests cover owner, non-owner, pending/reviewed, status, visibility, repeated withdrawal, and legacy records with votes/comments/replies.
- Internal status tests verify the status-to-visibility mapping, `reviewed_at` writes, status history, and audit data.
- Route tests verify 400-character content validation, hidden `404` responses, author-visible details, and no listing/search/count leakage.

### Frontend tests

- Board rendering tests verify no `feedback-list-title`, status-coloured filters, contact text, three/two/one-column CSS breakpoints, title/body constraints, comment count, and timestamp rendering contract.
- Dialog tests verify counters, disabled submission rules, composition-safe input handling, anonymous intent, App Bridge success invocation, comment submit wording, blank-comment disablement, and controlled-state reset after successful comments.
- Detail tests verify status, author, second-precision timestamp, vote, server-driven withdrawal, comment divider/count, merchant comments, and official reply icon/content.

### Visual and runtime checks

- Run the existing prototype test suite, Worker targeted tests, production build, and `git diff --check`.
- Capture and retain authenticated or deterministic local screenshots at desktop 1037px and mobile 390px for the board, suggestion dialog, and detail dialog. Inspect card columns, text overflow, dialog scrolling, status borders, disabled actions, and modal backdrop.
- Do not report SHOPLINE or Developer Platform integration as verified until a real authenticated session and signed developer status request have been exercised.

## Out of Scope

- Merchant attachment upload, R2, image previews, download APIs, and drag/drop upload.
- Merchant editing of published suggestions or comments.
- Merchant deletion of reviewed, approved, rejected, in-progress, or released suggestions.
- Public exposure of store IDs, email addresses, session identities, audit fields, reviewer identities, or developer-platform credentials.
- A merchant-facing Developer Platform reply composer or a new administrator console.
