# Test Gifts and Bundles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Follow the checked steps and ledger; do not redo completed tasks.

**Goal:** Implement the approved gift and bundle modules entirely in the independent test checkout.

**Architecture:** A shared pure offer engine defines configuration, eligibility, quantities, and integer pricing. Worker persistence/public projections, React editor and previews, theme cart mapping, and the Go Function consume the same protocol and behavioral fixtures. Gifts automatically include all eligible rules; selectable bundles support single/multiple modes independently.

**Tech Stack:** Existing TypeScript/Hono/D1, React/Vite, theme JavaScript/SLine/Handlebars, Go/easyjson; Node 22 for tooling. No new product dependencies.

**Spec:** `docs/superpowers/specs/2026-11-25-test-gifts-bundles-design.md` (authoritative), with the older design used only for non-conflicting platform details.

## User-directed architecture update

用户在实施中明确要求结合 SHOPLINE AI Suite 使用两代主题的 `all_products` 获取附加商品。以设计稿“商品数据来源修订”为准：不要求额外 Storefront Token；Task3 发布测试专用 shop metafield 引用索引并返回主题目录描述，Task5 渲染原生商品/款式可售状态和本币价格。后台草稿沿用认证 Admin 能力。旧任务文本中的 Storefront transport/凭据条目由此修订替代，其他业务规则与验收要求保留。

## Global Constraints

- Write only `/Users/SL/Desktop/多件折扣-测试环境/duojianzhekou-test`; never write the production checkout or production Cloudflare resources.
- Preserve test credentials and extension identities. No secret output or secret commits.
- Git remote is `https://github.com/TouchFish-Good/Kaching-Bundles-App-Upsells-Test.git`; branch `codex/gifts-bundles-test`. No push, merge, deployment, extension publication, or merchant writes without new authorization.
- Panel order: 设置 → 样式 → 赠品 → 捆绑商品. Match the saved switch reference; switches and expand buttons are siblings.
- Gifts are free and all eligible gifts auto-include without a shopper cancel control. Bundles support multiple selection/cancellation; retain configurable single mode and its maximum-actual-saving fallback.
- Each eligible main Product contributes the gift `rule.quantity` or exactly one bundle unit. Different main Products do not combine to reach a trigger; variants/lines of one Product combine once. Lesser accessory quantities still discount; excess remains normal price. Gift and bundle rules have independent caps.
- Default desktop 3 columns, mobile 1; grid/carousel, independent device styles. No new/modified focus pseudoclasses.
- Titles: `🎁 Free gifts with your order` and `Frequently Bought Together`, editable per storefront locale on translations page; explicit empty title hides only the heading.
- Preserve v1 rules and no-extra-request behavior for legacy/disabled modules. Store-scoped Admin requests always use `shoplineAdminHeaders()`.
- Never invent Storefront fields/ID conversion/availability. Missing trusted availability/price fails closed for that accessory; do not fake integration evidence.

## Execution and Review

User explicitly requested starting implementation after reviewing the evolving design. Execute continuously in this session; the plan is the reviewable work record. Use the existing independent checkout and a feature branch, not a second worktree. Small local commits may contain only reviewed task files; all push approvals remain separate. Reports and ledger live in the plan workspace. Implementation subagents run sequentially; task reviewers are read-only. Respect each task's file ownership and do not modify unrelated draft documentation.

## Review Focus

1. Forged roles/properties, duplicate contexts and same Product used as a gift must never create extra main quantity or double-discount units (Tasks 1, 2, 5).
2. Missing prices/unknown availability/large string IDs must not become free, available, or rounded IDs (Tasks 1, 3, 4, 5).
3. A≥2/B≥3 gifts both accompany main quantity4, while quantity2 includes only A; no cancellation and no tier-highest-only mistake (Tasks 1, 2, 4, 5).
4. Stale locale/market/revision responses, partial pagination and retries must preserve choices without incorrect prices or duplicate cart writes (Tasks 3, 4, 5).
5. Old v1 outputs, mixed money modes, non-gift campaign amounts and independent toggles must retain exact behavior (Tasks 1, 2, 3, 4).

## Shared Protocol

Activity optional fields: `gifts` and `bundles`, each `OfferModuleConfig`:

```ts
type OfferModuleKind = 'gifts' | 'bundles';
type OfferRule = {
  ruleId: string; displayOrder: number; productId: string;
  allowedVariantIds: string[]; quantity: number;
  label: string; labelPosition: 'corner' | 'below_title'; showImage: boolean;
  discountType: 'fixed_amount' | 'fixed_price' | 'percentage'; discountValue: number;
  marketOverrides?: Record<string, {mode:'auto_convert'} | {mode:'specified_amount';currencyCode:string;amountMinor:number}>;
  trigger: {type:'tiers';tierIds:string[]} | {type:'quantity';operator:'gt'|'gte'|'eq';quantity:number};
};
type OfferDeviceStyle = {
  layout: {mode:'grid'|'carousel';columns:1|2|3;columnGapPx:number;rowGapPx:number};
  image: {sizePx:number;radiusPx:number};
  colors?: Record<string,string>;
  typography?: Record<string,{sizePx:number;weight:number}>;
};
type OfferModuleConfig = {
  version:1;enabled:boolean;selectionMode:'all_eligible'|'single'|'multiple';
  quantityMode:'fixed';quotaScope:'main_product';items:OfferRule[];
  style:{desktop:OfferDeviceStyle;mobile:OfferDeviceStyle};
};
```

Gift strategy is always `all_eligible`, fixed_price0. Missing config normalizes disabled. No snapshot price/availability is an authority. Persist only trusted IDs and editable config. CommonJS pure implementation plus declarations is acceptable to support the legacy CommonJS Express build without widening its output root. Browser theme can consume a generated wrapper of the same core.

Cart properties: `_qb_protocol=gift-bundles-v1`, `_qb_campaign`, `_qb_role=main|gift|bundle`, `_qb_rule` for accessory rules, `_qb_source_product`, `_qb_context`. Use SHOPLINE arrays `{name,value,type:'text',show:false,roleVisibility:'none'}`. `context` is not a quota key. Keep actual string IDs. The same actual item cannot be main and accessory simultaneously.

Public capability: `clientFeatures=gift-bundles-v1`; new response version2 and campaign revision, resolved titles, both configs and paths. Public products/prices must revalidate installed shop, entitlement, published activity, main scope, time, revision and configured accessory IDs. No arbitrary upstream URLs or arbitrary product proxy.

### Task 1: Shared configuration and activity persistence

**Files:** Create shared offer core/declarations and Node behavioral tests under `shared/` and `tests/offer-modules/`; modify `worker/src/domain/campaign.ts`, `app/src/service/campaign/model.ts`, `app/src/service/campaign/validate.ts`, `web/src/prototype/model.ts`, `web/src/prototype/campaign-adapter.ts`, and corresponding focused tests only.

**Interfaces:** Export `defaultOfferModule(kind)`, `normalizeOfferModule(raw,kind)`, `validateOfferModule(raw,kind,tiers)`, `offerEligible(rule,tiers,mainQuantity)`, `offerUnlockTier(rule,tiers)`, `offerQuota(rule,tiers,mainProducts)`, `offerDiscountMinor(unitPrice,rule,override?)`, `effectiveOfferColumns(width,layout)` and all protocol types. Function projection keeps this exact config naming, with style/label omitted.

- [x] Write behavior tests that fail because activity drafts currently ignore malformed accessory config and web roundtrip drops it. Also test independent normalization/defaults without mutating input.
- [x] Run failing tests and save output; a missing new module is an initial scaffold failure, add integration assertions against existing APIs so absence is observable behavior.
- [x] Implement core with strict new-input validation, safe integer money/quantities, unique rule IDs/order, real nonempty string IDs/variant whitelist, reachable triggers, valid layouts/colors/fonts and disabled-draft preservation. Explicit0 and empty strings survive normalization; missing mobile defaults1 not desktop3.
- [x] Add optional configs to Worker and legacy Express models/validation and web conversions. JSON repositories already persist the whole DTO; prove create/update/read and roundtrip retain both configs. Reject publishing malformed/empty enabled modules and free-gift mispricing.
- [x] Verify focused tests, Worker typecheck, Express build, and web build; local commit only task files. Report exact red/green commands/results and exported names.

Example assertions:
```js
assert.equal(offerQuota(rule, tiers, [{productId:'A',quantity:3},{productId:'B',quantity:3}]), 2);
assert.equal(offerQuota(rule, tiers, [{productId:'A',quantity:2},{productId:'B',quantity:1}]), 0);
assert.equal(offerEligible(giftA, tiers, 4), true);
assert.equal(offerEligible(giftB, tiers, 4), true);
```

### Task 2: Function v2 authoritative eligibility and quotas

**Files:** `product-discount-customizations/input.graphql`, `internal/discount/discount.go`, new accessory evaluator/tests, `internal/discount/rule_easyjson.go`; generated parsers only if required. Do not alter .env or extension TOML identity.

**Consumes:** Task1 protocol; actual `properties` and `productVariant.sku` from the existing schema. **Produces:** v1/v2 evaluator, v2 accepts gift/bundle projections and returns trusted line quantities/money.

- [x] Add failing Go tests based on real request structures: A≥2 and B≥3 rules both discount at main4; one main Product split variants counts once; two qualifying Products double cap; 1/2/3 accessory units under cap2 discounts1/2/2; forged/crosscampaign/malformed role does not qualify; bundle multiple candidates all apply; single chooses largest actual reduction deterministically.
- [x] Verify v1 current baseline separately (known overlap test failure must be reported, not hidden).
- [x] Implement strict v2 parsing/validation. Segregate all accessory-marked lines before main counting, use authoritative main scope ownership, match actual Product and variant whitelist, deterministic cross-line capped allocation, no duplicate units or context quotas. Gift rules accumulate. Empty/invalid/mixed inputs fail safely per node without granting free items.
- [x] Normalize v2 main and accessory outputs to compatible line total values, cap reductions, exact integer rounding; preserve v1 behavior and one output currency mode. Do not invent conversion rates; unsafe mixed-mode v2 publication must fail closed until verified capability.
- [x] Regenerate serialization for added fields, test serialized JSON parsing (not just Go struct fixtures), compile the host entry, run Go suite, commit only Function task files, report red/green and limitations.

### Task 3: Worker publication, native reference index and translations (complete under native revision)

**Files:** Worker services/routes/env and tests, legacy discount projection where used, web translation copy/default/type files and legacy translation allowlist. Do not edit frontend editor/layout or theme script yet.

**Consumes:** Task1 config and Task2 Function projection. **Produces:** v1 unchanged, v2 projection for enabled modules, public capability DTO/native index and authenticated draft preview (no public product/price endpoints); two title keys accepted and preserved.

- [x] Write failing tests for v2 projection, style exclusion, disabled config omission, trusted currency precision, identity mismatch, arbitrary product rejection, unpublished/expired activity, stale revision409, unknown price, unavailable item, paged whitelist and both title saves/empty strings.
- [x] Superseded by explicit native ruling: implement test-only shop-metafield reference index, exact Admin ownership checks and all_products theme authority; no extra Storefront token or dormant transport. Unknown identities/context remain unavailable.
- [x] Reuse activity authorization/scope/subscription/time resolution for each public path, form POST CORS and bounded selection payloads. Reuse existing rate limits; handle429 Retry-After and cache/deduplicate by shop/market/revision without token refresh in anonymous paths.
- [x] Gate v2 publication on explicit supported test Function capability, validate configured Products/variants belong to shop, build trusted compact projection with no visual fields. Preserve v1 lifecycle and unrelated activity behavior.
- [x] Add `widget.gifts.title` and `widget.bundles.title` to store translation schemas/copy and defaults, exact English source, explicit empty title behavior and previews' field groups; supporting feedback keys must have actual consumers.
- [x] Run Worker relevant suites, full Worker suite (ASCII mirror if Chinese-path workerd restriction reproduces), legacy translation/projection tests, typecheck. Commit task files and report.

### Task 4: React editor, offer preview and translations UI

**Files:** New focused offer panel/style/card components and CSS, editor/model integration, `StorefrontWidget.tsx`, `Translations.tsx`, editor localization and tests. Preserve original CSS focus rules.

**Consumes:** Task1 config/core; Task3 directory and translation contracts. **Produces:** SaveBar-controlled panels after Style, interactive dual-module preview and editable localized titles.

- [x] Add failing DOM/interaction tests that toggle each module independently, retain settings while off, roundtrip save, auto include A/B at main4 with no gift cancel control, select/cancel several bundles, change variants and verify totals/quantity, device styles and carousel state.
- [x] Implement screenshot-faithful header switches with sibling expand controls, existing paginated picker and actual variant whitelist selection; no raw ID fields for merchants. Add quantity/discount/condition/label/image settings and shared style controls; preserve unresolved drafts and error messages.
- [x] Integrate main selection with all eligible gifts and selected bundles; handle unavailable/loading separately, no pretend free/available price. Sum main+accessory summaries using integer units. Preview cart remains simulated and never mutates real carts.
- [x] Add grid1/2/3 and single-row carousel, desktop3/mobile1 defaults, actual-container fallback, touch/keyboard scroll and stable selections. Add both title fields to translations page and actual localized rendering/empty title behavior. Use all existing app languages and theme keys consistently.
- [x] Run focused frontend tests then full frontend suite, build and typecheck; save before/after desktop1440/mobile390/narrow320 screenshots and container400/600/700 screenshots, update page progress honestly. Commit frontend files and screenshot evidence.

### Task 5: Real theme app-block and composite cart semantics

**Files:** theme public JS/CSS, both templates/locales if necessary, shared browser core generation/sync tooling, theme tests; regenerate OS2.1 assets with existing sync script.

**Consumes:** Task1 core, Task3 public protocol and Task4 visual behavior. **Produces:** OS3/2.1 main+gifts+bundles one atomic cart add, correct confirmation and theme notifications.

- [x] Write failing mount/cart tests: capability negotiation, A/B cumulative gifts, no cancel, multiple bundle selection, missing catalog item keeps main intact, no extras when disabled; preserve selected rule/slot across resizing and server revision changes.
- [x] Implement progressive module loads and price demands without blocking main first render. Cache/deduplicate per shop/market/revision and discard stale results. Reject foreign public paths and malformed IDs/amounts.
- [x] Build one flat batch of main/gift/bundle items with hidden structured properties and composite identity. Confirm timed-out writes only by read, never auto-retry POST; normal and gift same variant must not falsely confirm each other. Correct actual product ID/handle per theme event and actual key lookup.
- [x] Render scoped accessible cards/styles with all eligible gifts immutable inside app-block, bundle multiselect, grid/carousel, translated section titles and proper integer price summary. No focus rules and no global style leakage.
- [x] Run full theme suite and compatibility sync/check, capture local OS3/OS2.1 examples with reference, verify dynamic mount/unmount and independent blocks, commit task files.

### Task 6: Integration, review and delivery

**Files:** Plan status/ledger, `docs/APP_PROGRESS.md`, focused integration tests and audit evidence. Fix reviewed defects within scope; never change production resources.

- [x] Run meaningful cross-layer vectors (serialized rule→Go output, activity save→public projection→theme batch); verify title translations and disabled/legacy behavior end-to-end locally.
- [ ] Review complete branch diff against spec and credentials, with a fresh read-only reviewer; fix Critical/Important issues with failing tests first.
- [x] Verify production hash/status snapshot, test identity hashes, no focus pseudoclass changes, exact test remote, secret-free tracked candidates. Record actual suite counts and known baseline failures by name.
- [x] Update progress and audit distinguishing implementation/local tests from actual unperformed merchant OAuth/Storefront/checkout or extension publication. Do not claim remote readiness or fully validated commerce without evidence.
- [ ] Present all affected files and proposed commit/push destination, ask in Chinese: 本次代码/文档已在本地更新，是否推送到 GitHub？ Do not push or deploy yet.


### Task7：用户最新店铺交互裁定（本地完成）

**用户最新交互裁定（Task7已本地验证，取代此前冲突展示约定）：** 捆绑每规则固定1件，新旧配置统一为 `quantity=1`，商家和买家均无捆绑数量选择器，每规则只提供一个款式槽位；赠品配置数量仍可设置。每个合格主Product为捆绑规则贡献1件额度的既有独立额度池语义保持。赠品卡片不显示 Included/已包含/随单加入等重复状态文案；捆绑选择与取消使用原生 `input type="checkbox"`，保留单选/多选配置及锁卡点击解锁并选择。此裁定已在Task7完成本地实现与验证：共享规范化、SQLite/D1读写、公开与Function投影、Go执行、React和两代主题一致；实际本地截图与测试见 `docs/local/gifts-bundles-task7/`。最终独立审阅及真实平台验收仍未完成。

Task6只完成本地整链验证/审计及旧标题测试对齐；最终全分支独立审阅、当前全部改动清单及用户推送询问由控制器在Task7之后执行。Task6跨层测试当前通过 `[data-offer-rule="c"] [data-offer-select]` 和d选择器点击，Task7已采用原生checkbox的change语义，另以真实Chromium验证点击、标签、Space、触摸及整链批量数量。

Task6本地执行结果：跨层5/5、标题两文件10/10；3个旧标题断言先红后绿，剩余8个前端失败在实施前4f5cc26窄基线全部复现。正式725文件/原Git状态、测试9身份哈希一致。审计与完整清单见 [中文交付审计](../../audits/2026-11-25-gifts-bundles-local-integration.md)。Task7本地实现和定向验证已完成，最终审阅/推送询问仍待控制器执行。
