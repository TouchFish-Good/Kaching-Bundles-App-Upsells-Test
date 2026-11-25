# 指定商品 Function 折扣发布 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让商家选择真实 SHOPLINE Product ID，保存草稿并发布可在后台核对的 Function 自动折扣。

**Architecture:** 受鉴权的商品目录代理提供真实 ID；编辑器与服务端均使用 ID 判断范围，服务端在发布前再次核对。独立 REST 适配器创建和删除 Function 折扣，确认平台折扣 ID 后才提交本地状态；开发环境显式开关打印包含令牌的完整创建 cURL。

**Tech Stack:** Express、TypeScript、node-fetch、SQLite、React、Vite、Node test runner、Go Function。

**Spec:** `docs/superpowers/specs/2026-10-20-specified-product-function-discount-design.md`

## Global Constraints

- 第一阶段只发布 `scope.kind = "products"`；`all` 与 `collections` 发布返回明确拒绝。
- 使用现有 `v20260901` Admin REST 请求头和 `read_products` 会话授权；不允许浏览器传任意上游 URL。
- SHOPLINE 折扣 REST 创建/删除路径缺少本地 OAS 定义。实际请求前须用目标店文档/平台响应核对合同；不能从积分应用照搬后宣称已验证。
- 只有开发环境且 `SHOPLINE_LOG_FULL_CURL=1` 时输出未脱敏的完整创建 cURL。不得输出到持久文件、测试快照或 Git。
- 保留 `needs_reconciliation` 防重保护；不能因一次平台错误自动重复创建。
- 保留已有 `shopline.app.toml` 本地隧道改动，不把它并入本任务。任何推送需本批单独批准。

## Review Focus

- 已选择商品被删除或不可读取时，发布必须在平台 POST 前失败，草稿仍可查看。
- 目录代理只从 `link` 提取 `page_info`，下一次请求仍由服务端构造固定 SHOPLINE 商品接口 URL，不跟随链接目的地；空或重复游标必须拒绝。
- 搜索结果跨页重复出现同一 Product ID 时，编辑器和服务端只保存一次。
- 平台超时、5xx、缺少折扣 ID 时，本地状态必须锁定为 `needs_reconciliation`，不能再次 POST。
- `SHOPLINE_LOG_FULL_CURL=1` 在生产环境必须无效；开发日志中的 shell quoting 必须保留引号和换行的实际 JSON 值。

---

### Task 1: 商品目录读取与发布前核验

**Files:**
- Create: `app/src/service/campaign/product-catalog.ts`
- Create: `app/src/controller/campaign-products.ts`
- Create: `app/test/campaign-product-catalog.test.cjs`
- Modify: `app/src/index.ts`

**Interfaces:**
- Produce: `searchCampaignProducts(session, title, pageInfo?, fetcher?) -> { products: { id, title, imageUrl }[], nextPageInfo }`。
- Produce: `verifyCampaignProducts(session, productIds, fetcher?) -> Promise<void>`；缺失 ID 抛 `CampaignValidationError`，上游错误向外传播。
- Route: `GET /api/quantity-breaks/products?title=...&page_info=...`，只返回上述投影。

- [ ] **Step 1: Write failing catalog tests.** Use an injected fetcher, assert the generated URL is `/admin/openapi/v20260901/products/products.json?fields=id,title,image&limit=50...`, has the existing Accept/User-Agent/Bearer headers, and returns only `id/title/imageUrl`. Supply a response with `link: <...page_info=next>; rel="next"`; assert `nextPageInfo === 'next'`. Supply a link to another host and assert only its cursor is used in a subsequent request to the fixed SHOPLINE endpoint; reject a next cursor equal to the requested cursor. Supply duplicate IDs within one response; assert one ID is returned.
- [ ] **Step 2: Run** `cd app && node --test -r ts-node/register test/campaign-product-catalog.test.cjs`; expect the new module import to fail.
- [ ] **Step 3: Implement catalog service.** Build each request URL with the fixed SHOPLINE host and `v20260901` products path using `URL`/`URLSearchParams`; use only the `page_info` value from an upstream pagination link. Send `Authorization`, `Content-Type`, `Accept`, `User-Agent`. Parse `products` as a structured array; reject invalid or missing `id`. Bound searches to one page per browser request. For `verifyCampaignProducts`, query the requested IDs in groups of at most 50 using the documented `ids` parameter, compare returned IDs with the requested set, and reject missing products.
- [ ] **Step 4: Implement authenticated route** using the same `response.locals.shopline.session` check as `app/src/controller/campaigns.ts`; register it beside the other Quantity Breaks routes in `app/src/index.ts`. Reject overlong `title` and invalid `page_info` with 400.
- [ ] **Step 5: Run the focused test and** `cd app && npm run build`; expect both to pass. Review route response for token leakage.

### Task 2: 真实商品选择和草稿往返

**Files:**
- Modify: `web/src/prototype/model.ts`
- Modify: `web/src/prototype/campaign-adapter.ts`
- Modify: `web/src/prototype/CampaignEditor.tsx`
- Modify: `web/src/pages/quantity-breaks.tsx`
- Modify: `web/src/pages/quantity-breaks.module.css`
- Modify: `web/src/prototype/campaign-editor-messages.ts`
- Create: `web/src/prototype/CampaignProductPicker.tsx`
- Modify: `web/test/campaign-adapter.test.mjs`
- Create: `web/test/campaign-product-picker.test.mjs`

**Interfaces:**
- `Campaign.scope?: { kind: 'all' | 'products' | 'collections'; productIds?: string[]; collectionIds?: string[]; excludedProductIds: string[] }` is the editor's identity source; `products` remains a display label.
- `toAdminCampaign` copies server scope; `toCampaignDraft` writes selected `productIds` instead of inferring identity from `products` text.
- `CampaignProductPicker` receives `fetcher`, `selectedIds`, `onChange`; returns selected IDs and display metadata to the editor.

- [ ] **Step 1: Write failing conversion tests.** Start from a server draft with `scope: { kind: 'products', productIds: ['p1', 'p2'], excludedProductIds: [] }`; assert admin conversion preserves those IDs and `toCampaignDraft` returns the same scope after a tier edit. Assert duplicate IDs collapse to one and an empty specified selection fails before save.
- [ ] **Step 2: Write picker interaction tests** with jsdom, `react-dom/test-utils`, and an injected fetcher: search `Serum`, choose two real results, remove one, reopen with `['p2']`, and verify keyboard/focus and loading/empty/error states. Return `p2` again on a second page and assert one selected ID. Assert no sample product names are sent to `onChange`.
- [ ] **Step 3: Run** `cd web && npm run test:prototype`; expect the new tests to fail for missing selection support.
- [ ] **Step 4: Implement a compact picker** in the existing scope panel style; keep only Product IDs in campaign data. Enable the “Specific products” radio, keep the other two modes visibly unavailable for publishing. Replace the sample `selectedProduct`/`excludeSample` path and use real IDs in `checkOverlap` and submit. Add localized messages through existing editor message infrastructure.
- [ ] **Step 5: Run** `cd web && npm run test:prototype && npx tsc --noEmit && npm run build`; expect all to pass. Capture desktop and 390px mobile screenshots with the reference view beside the local editor; record any visual mismatch before marking UI accepted.

### Task 3: REST Function 折扣适配器与 cURL

**Files:**
- Modify: `app/src/service/campaign/discount-adapter.ts` or replace its GraphQL transport with `app/src/service/campaign/discount-rest.ts` while retaining `buildDiscountRule`.
- Modify: `app/test/campaign-discount-adapter.test.cjs`
- Create: `app/test/campaign-discount-rest.test.cjs` if the transport is split.

**Interfaces:**
- Preserve `createAutomaticDiscount(session, campaign, currency, functionId, fetcher?, requestId?) -> Promise<string>` and `deleteAutomaticDiscount(session, id, fetcher?, requestId?) -> Promise<void>` so `publish.ts` keeps its existing state protocol.
- Request body uses `function_id`, `title`, `starts_at`, `ends_at`, `metafields` with the existing `sale/quantity_breaks` JSON rule; map combination flags only after checking the target REST contract.

- [ ] **Step 1: Verify platform contract before any mutation.** Read the Product Discount Functions Admin REST contract available to the target app and compare its version, create/delete path, body, response ID and required scopes with the reference points app. Use an authenticated read-only lookup if available. If create/delete cannot be verified, stop platform writes and record the unsupported contract; do not substitute a price-rule endpoint.
- [ ] **Step 2: Write failing transport tests.** Inject a fetcher and assert one POST to the verified REST path, precise JSON body and headers, returned `app_discount_id`, and a matching DELETE to the verified path. Assert 4xx business rejection is definitive, while timeout/5xx/missing ID is uncertain. Test response body size bound and safe trace ID parsing.
- [ ] **Step 3: Write failing cURL tests.** With `NODE_ENV=development` and `SHOPLINE_LOG_FULL_CURL=1`, capture console output and assert method, URL, original JSON body, all explicit headers, exact test Bearer token and request ID appear. Assert shell-safe quoting preserves a campaign title containing `'` and a newline. With the flag off or `NODE_ENV=production`, assert the token and body never appear.
- [ ] **Step 4: Run** `cd app && node --test -r ts-node/register test/campaign-discount-adapter.test.cjs test/campaign-discount-rest.test.cjs`; expect failures in the new REST/cURL assertions.
- [ ] **Step 5: Implement only the verified REST contract.** Keep request construction and cURL formatting in one place so they cannot diverge. Use a shell argument quoting function equivalent to wrapping each argument in single quotes and replacing embedded `'` with `'"'"'`. Log full cURL only at the approved gate; default traces remain redacted. Return `DiscountRejectedError` only for confirmed rejection.
- [ ] **Step 6: Run focused tests and** `cd app && npm run build`; expect both to pass. Inspect captured logs to ensure the full token is absent from default/production paths.

### Task 4: 发布编排、锁和端到端验收

**Files:**
- Modify: `app/src/controller/campaigns.ts`
- Modify: `app/src/service/campaign/publish.ts` only if transport return semantics require it.
- Modify: `app/test/campaign-api.test.cjs`
- Modify: `app/test/campaign-publish.test.cjs`
- Modify: `docs/APP_PROGRESS.md`

**Interfaces:**
- `PublicationDependencies.verifyProducts?` injects `verifyCampaignProducts` for controller tests; production uses the catalog service.
- `publishCampaign` persists `active` only after `createAutomaticDiscount` returns a confirmed platform ID.

- [ ] **Step 1: Write failing publication tests.** A products draft with valid IDs calls `verifyProducts`, then create once, and stores the returned ID. Missing/deleted ID, `all`, and `collections` never call create. A timeout after POST leaves `needs_reconciliation`; a second status POST returns 409 and does not retry. A confirmed 4xx remains editable as draft.
- [ ] **Step 2: Run** `cd app && node --test -r ts-node/register test/campaign-api.test.cjs test/campaign-publish.test.cjs`; expect failures for the changed scope rule.
- [ ] **Step 3: Implement server checks.** Replace the all-only check in `app/src/controller/campaigns.ts`; verify IDs before currency lookup and before `beginPublication`. Preserve repository transaction and lock behavior. Do not clear existing locks as a side effect of the code change.
- [ ] **Step 4: Run** `cd app && npm test && npm run build`, `cd web && npm run test:prototype && npx tsc --noEmit && npm run build`, and `cd product-discount-customizations && go test ./... -count=1`; expect green checks. Run `git diff --check` and inspect every changed/untracked file for secrets and unrelated edits.
- [ ] **Step 5: Validate the actual Function deployment** through SHOPLINE extension upload/version records and a matching Function ID. For the existing locked campaign, read local publication state and SHOPLINE discounts; if absent, back up `app/quantity-breaks.sqlite` and clear only that record's lock. Do not send a second create request until the platform state is known.
- [ ] **Step 6: Perform one real specified-product publication** from the embedded editor with full cURL logging explicitly enabled. Verify platform response ID, SHOPLINE discount list, product page and cart/checkout discount. Capture reference/local desktop and mobile screenshots. If a platform gate fails, record the exact stage and request ID in `docs/APP_PROGRESS.md` and leave the feature unverified.
- [ ] **Step 7: Review the complete local change set** and ask in Chinese, “本次代码/文档已在本地更新，是否推送到 GitHub？” Do not stage, commit or push implementation files before the user reviews the set and explicitly approves the push.
