# Embedded Startup Optimization Design

## Goal

When a merchant opens the embedded SHOPLINE application, render a recognizable
Quantity Breaks workspace immediately. Slow iframe scheduling, module delivery,
or initial API reads must not leave the merchant on an empty page, a spinner, or
an "application failed" message during normal recovery.

## Current Problem

The root document paints an inline spinner. The entry module then initializes
i18n and dynamically imports the Quantity Breaks workspace. In an embedded
iframe this creates a serial resource path: the browser must start the entry
module before it can request the workspace chunk. The existing five-second
recovery code also starts only after that entry module executes, so it cannot
protect the earlier wait.

## Selected Approach

1. Make the Quantity Breaks workspace a static dependency of the primary app
   entry. Its module graph can download in parallel with the entry graph rather
   than waiting for a runtime `import()`.
2. Replace the static spinner with a lightweight workspace skeleton that matches
   the installed app's activity-list layout: page header, language control,
   metric strip, filter row, and table rows. The skeleton contains no merchant
   data and remains safe before authentication.
3. Keep subscription, shop identity, and campaign reads asynchronous inside the
   mounted workspace. Existing loading-frame behavior continues to replace the
   skeleton with real data when ready.
4. Preserve the one-time static reload only as a silent recovery action. A
   repeated late start remains on the workspace skeleton; it must not render an
   alarming failure message. Explicit API failures remain handled by the
   workspace's existing retry UI.
5. Add client-side performance marks for document guard installation, React
   mount, subscription resolution, shop identity resolution, and campaign list
   resolution. Marks are local initially and do not collect merchant data.

## Authorization Boundary

This change does not modify OAuth signature validation, access-token refresh,
session-token acquisition, or API authorization. If the Worker explicitly asks
for reauthorization, the existing App Bridge redirect remains the only
authorization navigation path.

## Files And Boundaries

- `web/index.html`: renders only the non-data workspace skeleton and owns the
  pre-module silent recovery guard.
- `web/src/index.tsx`: statically imports the Quantity Breaks workspace,
  marks first React mount, and keeps non-workspace routes lazy.
- `web/src/pages/quantity-breaks.tsx`: records non-sensitive lifecycle marks at
  existing data-resolution boundaries; no API contract changes.
- `web/src/prototype/bootstrap-recovery.ts`: defines the shared timing and
  recovery semantics.
- `web/test/*`: verifies the primary route has no runtime workspace import,
  the skeleton has the expected semantic structure, and repeated recovery does
  not inject a failure page.

## Failure Handling

- First startup timeout: reload once without user-visible messaging.
- Second startup timeout: retain the recognizable workspace skeleton; do not
  loop reloads.
- API failures after React mounted: retain current page-specific error and
  retry controls because those represent real data failures, not startup delay.
- OAuth-required response: hand off through the existing App Bridge flow.

## Verification

- Add and observe a failing regression test before implementation.
- Run focused startup tests, full frontend prototype tests, TypeScript/build,
  and `git diff --check`.
- Verify the deployed custom domain serves the changed entry document.
- Verify an actual SHOPLINE embedded navigation after deployment, recording
  whether the skeleton appears and whether it reaches the activity list.
