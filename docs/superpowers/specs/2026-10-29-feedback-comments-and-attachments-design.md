# Feedback Comments and Attachments Design

## Goal

Extend Roadmap & Feedback from a suggestion and vote board into a persistent discussion flow. Authenticated merchants can publish text comments with an optional anonymous public identity and image attachments. A separately hosted Developer Platform can publish official replies that merchants see as "多件折扣" with a developer icon.

## Scope

### Merchant discussion

- A public feedback detail includes its suggestion, current-store vote state, comments, attachments, and official replies in ascending creation order.
- An authenticated installed merchant can publish a comment containing plain text from 1 to 2,000 Unicode code points and zero to five attachments.
- A comment's combined attachment size is at most 25 MB and each attachment is at most 5 MB.
- Supported attachment filenames and MIME types are `.jpeg` / `.jpg` (`image/jpeg`), `.png` (`image/png`), and `.svg` (`image/svg+xml`). All other files are rejected before any persistent record is created.
- When `isAnonymous` is false, the public comment label is the authenticated SHOPLINE session's `handle`, captured when the comment is published. When it is true, the public label is exactly `匿名用户`; the trusted store identity remains available only in the database for audit and abuse controls.
- Merchants cannot edit or delete comments in this release. There is no public author profile, store ID, email, employee identity, or commenter vote data.

### Official replies

- Official replies are not created by the merchant application.
- The future Developer Platform calls a signed internal Worker endpoint. Every accepted request creates an official reply with the fixed public author label `多件折扣` and `isOfficial: true`.
- The merchant UI renders the installed Lucide `BadgeCheck` icon next to this label. It must not render a claimed developer identity supplied in the request body.
- The existing HMAC timestamp and one-time nonce verification establishes that the configured Developer Platform service called the endpoint. Its secret stays server-side; browsers, the merchant application, and D1 rows never receive it.

## Explicit Non-Goals

- No merchant-side official-reply action, comment editing, comment deletion, moderation UI, reactions, nested threads, rich text, or email notifications.
- No public R2 bucket, guessed file URL, or permanent attachment URL that can bypass Worker session authentication.
- No inline SVG rendering. SVG attachments are downloadable only because an SVG may contain executable content.
- No production migration, R2 bucket creation, Worker deployment, or Git push without separate explicit approval after the reviewed change set exists.

## Architecture

```text
Merchant feedback dialog
  -> authenticated multipart Worker API
  -> Worker validates text, attachment count, extension, MIME and bytes
  -> private R2 object(s) + D1 comment/attachment metadata

Merchant feedback detail
  -> authenticated Worker read API
  -> public DTOs with safe display labels and attachment download metadata
  -> authenticated attachment download route

Developer Platform
  -> HMAC + timestamp + nonce internal Worker API
  -> D1 official-reply record
  -> merchant detail DTO: authorLabel "多件折扣", isOfficial true
```

The Worker remains the authority for identities, visibility, limits and file metadata. React only renders validated public DTOs. D1 stores relational metadata and auditing identities; the private R2 binding stores attachment bytes.

## Data Model

The existing feedback migration design gains these tables in the same feedback migration sequence.

### `feedback_comments`

| Column | Purpose |
| --- | --- |
| `id` | Server-generated UUID text primary key. |
| `request_id` | Foreign key to `feedback_requests`; deleting feedback is restricted. |
| `author_store_id` | Trusted authenticated store identity; never in merchant DTOs. |
| `author_handle_snapshot` | Public non-anonymous label captured at publish time. |
| `is_anonymous` | `0` or `1`; controls the public label only. |
| `content` | Normalized plain text, 1--2,000 code points. |
| `created_at` | ISO-8601 UTC publication timestamp. |

### `feedback_comment_attachments`

| Column | Purpose |
| --- | --- |
| `id` | Server-generated UUID text primary key. |
| `comment_id` | Foreign key to `feedback_comments`. |
| `object_key` | Generated private R2 key, never derived from the original filename. |
| `original_filename` | Sanitized display/download filename. |
| `content_type` | Whitelisted MIME type. |
| `byte_size` | Validated positive byte count, at most 5 MB. |
| `created_at` | ISO-8601 UTC timestamp. |

`feedback_replies` remains a separate table because it has a different trust source and lifecycle. It stores trusted service provenance internally, but merchant DTOs derive its immutable public author and official flag in the repository rather than exposing that provenance.

Indexes cover `(request_id, created_at, id)` for comments and `(comment_id, id)` for attachments. The D1 migration enables foreign keys in tests and constrains all public enum, size and relationship fields.

## API Contracts

All merchant routes require `requireShoplineSession`; the Worker resolves the trusted store ID from the server-side session record using the authenticated handle. Request bodies cannot choose an author, official flag, object key, handle, or store ID. A session without a valid active store identity is rejected before any read or write.

| Method and path | Request | Result |
| --- | --- | --- |
| `GET /api/quantity-breaks/feedback/:id` | none | Existing feedback data plus comments and official replies. |
| `POST /api/quantity-breaks/feedback/:id/comments` | `multipart/form-data`: `content`, `isAnonymous`, zero to five `attachments` | Creates a comment and its attachment metadata. |
| `GET /api/quantity-breaks/feedback/attachments/:attachmentId` | none | Authenticated download or renderable raster response. |
| `POST /internal/admin/v1/feedback/:id/replies` | Signed JSON `{content}` from Developer Platform | Creates an official reply. |

The comment route rejects hidden or nonexistent feedback with the same `404` as public detail. It applies a write limit by trusted store ID and route. It returns `422 VALIDATION_ERROR` for invalid text, attachment count, extension, MIME, size, or malformed multipart input. Failed R2 writes never create a D1 comment. If D1 persistence fails after an R2 upload, the Worker deletes the new object before returning an error; cleanup failures are logged without exposing object keys or provider details.

The attachment read route verifies the caller has an active installed session and that the attachment belongs to a public feedback request. JPEG and PNG are served with their validated MIME type, `X-Content-Type-Options: nosniff`, and a restrictive response CSP. SVG is always served with `Content-Disposition: attachment` and a binary media type so it cannot execute as page content.

The internal reply route reuses HMAC method/path/timestamp/nonce signing and nonce replay protection. It only accepts text content, normalizes it, limits it to 1--5,000 code points, and never accepts `authorLabel` or `isOfficial` from the caller.

## Merchant UI

Selecting a feedback row opens the existing accessible detail dialog. Its header presents the suggestion title, full content, status, published time, and a standalone vote button with the current vote count. The discussion body shows each merchant comment as public display name plus published time, content, and attachment controls. It shows each official reply as `多件折扣`, a `BadgeCheck` developer icon, its publication time, and reply content.

The composer contains a comment text area, an anonymous checkbox, a visible upload affordance labeled `点击此处进行上传，或者直接拖拽文件至指定位置。`, and a file list. The help text names `.jpeg、.jpg、.png、.svg` and the `5MB` per-file maximum. It validates count and size before submission but treats the Worker response as authoritative. The browser sends files only when the user presses `发布`; closing or cancelling leaves no server-side draft.

On narrow screens, dialog content scrolls inside its fixed viewport boundary, the vote control remains reachable before the discussion, attachment filenames wrap safely, and the composer remains after the reply list. Existing project rules prohibit adding or changing `:focus` or `:focus-visible` CSS rules.

## Security and Privacy

- All text is normalized and rendered as React text nodes. No rich text or `dangerouslySetInnerHTML` is allowed.
- Public merchant data never includes `author_store_id`, raw session handle for anonymous comments, tokens, developer secrets, nonce values, object keys, internal reply provenance, or hidden feedback data.
- The public non-anonymous handle is an explicit product decision; it is immutable per published comment to preserve attribution history.
- File names are sanitized for headers and display. Object keys are random server-generated values. Extension, MIME and size are all checked; browsers cannot upgrade a rejected attachment by changing only its filename.
- SVG has no inline thumbnail path. JPEG/PNG previews use an authenticated fetch to a Blob URL rather than a public storage URL.
- The Developer Platform HMAC secret is a service credential. Rotating or revoking it immediately prevents future official replies; individual developer attribution and role-based access require a future verified Developer Platform identity system.

## Verification

- Migration tests cover tables, constraints, foreign keys and indexes.
- Repository and route tests cover store isolation, anonymous/non-anonymous display labels, hidden feedback `404`, text validation, comment write limits, attachment count/type/size validation, R2 rollback, and attachment access.
- Internal-route tests cover missing/expired/invalid/replayed HMAC requests, fixed official identity, and rejection of caller-supplied identity fields.
- Frontend tests cover detail content, official icon semantics, anonymous checkbox, file selection/drop validation, multipart publish, refresh from server results, and error preservation.
- Browser checks at 1037px and 390px cover click-to-open detail, vote, anonymous publish, attachment validation, developer reply display, keyboard navigation and text overflow. A real authenticated SHOPLINE/R2 environment remains required before marking the integration verified.
