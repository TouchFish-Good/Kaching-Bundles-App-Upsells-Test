# Campaign Detail and Live Update Design

Status: awaiting merchant review. This document defines the campaign navigation and update flow; it does not claim that the target SHOPLINE store has passed integration testing.

## Goal and confirmed behavior

Clicking an existing campaign row opens a read-only detail page. Editing an existing campaign never pauses it. The edit page has one primary action, **Update**, and has neither **Save draft** nor **Publish**. Update preserves the campaign's current Draft, Paused, Active, Scheduled, or Ended status. A previously paused or draft campaign is activated through the list's existing Activate action. Only the new-campaign page offers **Save draft** and **Publish**.

The Active update changes the existing SHOPLINE automatic app discount in place, retaining its platform discount ID. It must not delete and recreate the discount. A failed update must not report success or silently change the campaign to Paused.

## Scope and existing constraints

This is the first implementation unit of the broader eight-item optimization request. Product batch lookup, storefront summary and cart integration, badge placement, list time and tier formatting, and translation loading remain in the overall request but have separate API and visual acceptance work.

Current code routes both row names and Edit to `openEditor`, where Active and Scheduled campaigns trigger `pauseBeforeEdit`. `CampaignEditor` always displays Save draft and Publish. `CampaignRepository.save` rejects published campaigns. The discount adapter contains an unused REST PUT path that the available REST specification did not confirm. SHOPLINE's documented Admin GraphQL `discountAutomaticAppUpdate(id: ID!, automaticAppDiscount: DiscountAutomaticAppInput!)` requires `write_discounts` and returns `automaticAppDiscount` and `userErrors`. Documentation confirms the operation's existence, while the target store's API version, accepted ID form, and runtime response still need verification before live acceptance.

## Merchant flow

1. Clicking anywhere in a campaign's data row navigates to `/quantity-breaks/campaigns/:id`. Row action buttons continue to perform their own actions and do not also navigate. The campaign name remains a keyboard-accessible link; keyboard users can also enter the detail page without relying on a pointer-only row handler.
2. The detail page displays the persisted status, product scope, tiers and values, start and end time, combination policy, and widget settings in the established admin visual system. Its Edit action opens `/quantity-breaks/campaigns/:id/edit` without a status mutation. The existing platform discount detail redirect resolves to this read-only detail page.
3. Existing-campaign editor loads the saved values and shows Cancel and Update. New-campaign editor shows Cancel, Save draft, and Publish. The form uses the same field validation and preview in both modes.
4. Update of Draft, Paused, or Ended records saves the validated replacement under the same ID and revision, preserving status. Update of Active or Scheduled records uses the live-update transaction below. No existing-campaign editor action publishes or activates an inactive record.

## Live-update transaction

The authenticated `PUT /api/quantity-breaks/campaigns/:id` request includes the candidate campaign and `expectedRevision`. The server derives the existing status from storage rather than trusting a client-supplied status. It acquires the existing per-shop publication lock and checks revision, publication state and platform discount ID, candidate validation, actual selected products or collection members, overlap and currency conflicts, Function rule validity, and schedule validity. A confirmed platform discount ID is mandatory for Active or Scheduled updates.

The repository stages the candidate separately from the currently published campaign and marks an update transition without changing the campaign's visible status or deleting its discount. The service updates the same platform discount ID with the validated title, schedule, combination policy, and rule metafield through the documented Admin GraphQL mutation. It checks HTTP and GraphQL errors, nonempty `userErrors`, and the returned discount ID. Only after confirmed success does it replace the persisted campaign, increment its revision, and clear the update transition. The public storefront continues to read the last committed campaign during the request; after commit it reads the new version. Cross-system atomicity is impossible, so the brief interval between platform acknowledgement and local commit is tracked and handled as an update in progress.

A definitive platform rejection discards the staged candidate, restores the prior publication state, leaves the prior persisted campaign and platform discount intact, and shows the platform error. A timeout, malformed response, ID mismatch, lost lock, or local commit failure after the platform call has uncertain effect: retain the old committed campaign, mark reconciliation required, block further writes and repeat platform calls, and show a distinct recovery error. The storefront must not present an unverified price promise while reconciliation is required. Reconciliation may compare the platform discount with the staged candidate only through a read operation verified for the target store and API version. If that read is unavailable or insufficient to establish the effective rule, require controlled manual recovery; never infer that a timeout means failure or replay the update blindly.

Updating an Active collection campaign also refreshes its resolved members and collection variables under the same shop lock. If these dependencies cannot be verified, Update fails before the platform mutation. A status or publication conflict returns a non-success response and prompts a reload, preserving the merchant's entered form values.

## Interface and data boundaries

- Add a detail route to `navigation.ts` and a read-only detail view in the admin workspace. Row navigation and row actions remain separate.
- Parameterize `CampaignEditor` by create or existing mode. The existing mode submits `update` intent and never constructs a Draft as a publishing intermediate.
- Extend the campaign API/controller and publication service with an explicit live-update operation. Reuse rule construction and validation. Do not use the unverified REST PUT path for this operation.
- Extend the repository with durable staged-update state so a process restart cannot erase an ambiguous platform result. Keep the prior committed campaign and platform ID available for reconciliation.
- Keep authenticated platform IDs out of public storefront responses. Preserve shop isolation, revision checks, and the existing publication lock.

## Acceptance evidence

Automated tests cover row and keyboard navigation, event isolation for row actions, create versus edit action labels, and preservation of each existing status. Service tests cover same-ID platform update, validation before mutation, stale revision, definitive rejection, ambiguous response, process restart with a staged update, local commit failure, and collection conflict. The GraphQL request and response shape must be validated against the deployed SHOPLINE API version.

Browser checks use the retained Shopify reference screenshot and local desktop/mobile screenshots. In an authorized test store, inspect an Active campaign before and after Update: its platform discount ID and Active status must remain unchanged while the title/rule changes take effect. Check a rejected and an uncertain update separately. Mark the page complete in `APP_PROGRESS.md` only after visual and functional evidence exists; do not label a mock or local-only test as a live SHOPLINE verification. Push requires separate approval for the reviewed change set.
