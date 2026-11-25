# Admin API version, tier actions, and 436 diagnosis

Date: 2026-10-19
Status: Design approved in chat; implementation pending plan review

## Goal and boundaries

Bring the app's active SHOPLINE Admin REST calls to `v20260901`, add safe copy/delete actions to each quantity tier in the campaign editor, and determine whether the store-languages 436 comes from request construction or an upstream authorization/platform condition. Do not create or modify a real discount during diagnosis. Preserve unrelated local changes.

## API contracts

- Inventory every active Admin REST call, including store languages, markets, settlement currency, store identity, and the existing template product-create route. Verify each path and required headers against the `v20260901` SHOPLINE REST specification before changing it. The discount GraphQL adapter already targets `v20260901` and is not part of the REST migration.
- Use the documented Bearer `Authorization` header and `Content-Type: application/json; charset=utf-8`. Keep tokens, credentials, and response bodies out of diagnostic logs.
- Keep OAuth callbacks, signature checks, scope validation, token refresh, and webhook security behavior unchanged unless a separately reproduced defect requires a reviewed change. A successful embedded-app session check does not prove that SHOPLINE accepted the downstream REST request.
- A version change is not accepted as a 436 fix without a live request. Compare the same authenticated store session after the change, recording only request ID, endpoint, version, status, duration, and safe upstream trace ID. If 436 persists, report that outcome and investigate upstream response metadata and permissions without guessing at its meaning.

## Tier copy and delete

- Add adjacent icon buttons to each tier's editor header, using the existing Lucide icon set and tooltips/accessible names. The drag handle remains independent so clicking an action cannot start a drag.
- Copy inserts a deep copy immediately after its source, generates a new stable `tierId`, retains the discount type/value, market overrides, labels, subtitle, and badge, and clears `recommended`. Set quantity to the first unused positive integer above the source quantity. Preserve the original tier and all other order positions.
- Delete opens a confirmation dialog naming the tier and its quantity. Cancel leaves the form unchanged; confirm removes only that tier. Disable deletion when exactly one tier remains. Unsaved copy/delete changes stay local until the merchant saves the campaign.
- Closing via Escape, backdrop, or Cancel is non-destructive. Focus moves into the dialog and returns to the triggering action on close. Both buttons remain usable at desktop and 390px widths, including long translated text.
- Remove related per-tier amount-entry errors and draft input state only after a confirmed deletion. Copy must not reuse those transient input-error keys.
- Add the new merchant-facing labels and confirmation copy to the existing eleven-language campaign editor dictionary, preserving key parity and fallback behavior.

## Validation and acceptance

- Test the REST URL/version and required request headers at each affected adapter boundary. Test that credentials never enter diagnostic logs.
- Test copied tier identity, insertion position, unique quantity, independent market overrides, and cleared recommendation. Test cancel, confirm, Escape, last-tier protection, and unchanged state before confirmation.
- Run app tests, prototype tests, both builds, and diff checks. Inspect the editor at desktop and mobile widths and verify drag interactions still work.
- Mark 436 resolved only after the SHOPLINE request returns an expected success response. If a live authenticated session is unavailable, mark the upstream result unverified and provide the precise status and request ID needed for follow-up.

## Existing constraints

`main` contains unrelated modified and untracked files. Do not stage, overwrite, discard, or push them. Git push requires explicit approval for the reviewed change set.
