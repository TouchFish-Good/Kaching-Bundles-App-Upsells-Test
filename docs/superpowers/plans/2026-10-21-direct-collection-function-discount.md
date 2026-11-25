# Direct Collection Function Discount Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 发布指定商品和直接使用分类 ID 的 SHOPLINE Function 自动折扣，并验证后台记录及结账命中。

**Architecture:** 每个折扣节点保存自己的范围规则，店铺 Shop Metafield 保存全部需要的分类 ID 并集，Function input 取得实时分类成员关系。服务端串行化同店发布/暂停，先确认并集再创建折扣，平台 ID 确认后才标记成功；不确定结果保持待核对。

**Tech Stack:** TypeScript、Express、SQLite、node-fetch、Node test runner、Go Function、SHOPLINE Admin REST。

**Spec:** `docs/superpowers/specs/2026-10-21-direct-collection-function-discount-design.md`

## Global Constraints

- `all` 范围、未来开始的定时发布继续禁用；发布开关默认关闭。
- 分类只向 Function 规则传 `collectionIds`，`resolvedProductIds` 只能用于冲突快照，不能作为结账匹配依据。
- Shop Metafield `owner_id` 必须是可信数字 `store_id`；不得把 handle 充作 ID。
- 多活动分类 ID 并集必须保留所有 `active`、`publishing`、`unpublishing` 和 `needs_reconciliation` 中可能仍有平台折扣的活动。
- 未核实目标店扩展部署、Shop Metafield 与自动折扣 REST 合同前，不发真实写入请求；未执行的验收不标通过。
- 不修改或混入现有 `shopline.app.toml`、`theme-app-extension/public/app-block.css` 工作区改动；令牌及完整 cURL 不写入文件或 Git。

## Review Focus

- 两条活动共用同一分类：暂停一条不得从店铺变量移除另一条仍需的 ID。
- 平台创建超时但可能成功：保留分类 ID 和待核对锁，重试不得重复 POST。
- 分类为空或上游分页失败：不得把“不知道成员”视为“无冲突”后发布。
- 分类成员变化导致两个节点命中同一商品：Function 对该商品不返回本应用折扣。
- 服务重启或多个进程同时发布：并集不能被旧快照覆盖，恢复时不能清除不确定活动的 ID。

---

### Task 1: Function 分类输入与规则

**Files:** Modify `product-discount-customizations/input.graphql`, `product-discount-customizations/shopline.function.extension.toml`, `product-discount-customizations/internal/discount/discount.go`; test `product-discount-customizations/internal/discount/discount_test.go`.

**Interfaces:** TOML `[input.variables]` 指向应用私有 Shop Metafield；GraphQL 声明 `$inCollections: [String]`，在 `cart(inCollections: $inCollections)` 中请求每条商品的 `inCollections { collectionId isMember }`。规则 `scope.collectionIds: string[]` 是单节点名单。

- [ ] **Step 1:** 在 Go 测试构造两个分类节点和两个商品：相同分类的 `isMember=true` 命中，仅 `isMember=false`、缺失字段、非本节点分类 ID 不命中；排除商品优先，同商品多个 Variant 汇总，重叠节点对同商品不返回折扣，非冲突商品继续折扣。
- [ ] **Step 2:** 运行 `cd product-discount-customizations && go test ./internal/discount -count=1`，确认新增断言失败。
- [ ] **Step 3:** 修改 TOML、GraphQL 和 Go 的 `ruleScope.CollectionIDs`、规则校验及 `appliesToProduct(scope, productID, memberships)`；通过 `membership.CollectionId` 与 `membership.IsMember` 同时匹配本节点 ID。重叠检测按商品 ID 聚合各节点候选，再从输出中剔除有两个以上命中节点的商品；不更改金额及市场计算。
- [ ] **Step 4:** 运行 `go test ./... -count=1` 和项目现有 Function build 命令，确认 input 生成模型字段与查询结果一致；本地 build 不能记作扩展已部署。

### Task 2: 可信店铺身份、Shop Metafield 与并集

**Files:** Create `app/src/service/campaign/collection-variables.ts`; modify `app/src/admin-read/registry.ts` to expose an installed-store lookup by handle; test `app/test/campaign-collection-variables.test.cjs`.

**Interfaces:** `readTrustedStoreId(handle): Promise<string>` 只返回已安装店铺的数字 ID；`writeCollectionVariables(session, storeId, ids, fetcher?, requestId?): Promise<void>` 将排序去重 ID 写入专用 Shop JSON Metafield 并核对确认。网络或含混响应抛不确定错误，不返回假成功。

- [ ] **Step 1:** 在测试中覆盖未知 handle、非数字店铺 ID、两个活动 ID 并集、重复 ID、空并集、4xx 拒绝、5xx/超时、缺失确认和读回不匹配；断言完整令牌不出现在普通日志。
- [ ] **Step 2:** 运行 `cd app && node --test -r ts-node/register test/campaign-collection-variables.test.cjs`，确认缺失接口导致失败。
- [ ] **Step 3:** 对照本地 OAS 中 `POST /metafields_set.json` 的请求/响应及目标店文档，按已确认的 `namespace`、`key`、`type=json`、`owner_resource=Shop`、数字 `owner_id` 实现独立适配器；使用现有 REST 版本和公共请求头。若平台不支持读回，必须由有明确成功合同的响应确认，不能虚构读接口。
- [ ] **Step 4:** 运行聚焦测试及 `cd app && npm run build`；保留 `read_store_information`，直到可信 ID 来源已验证。

### Task 3: 完整成员核验与持久化发布协调

**Files:** Modify `app/src/service/campaign/collection-catalog.ts`, `app/src/service/campaign/validate.ts`, `app/src/service/campaign/repository.ts`; create `app/src/service/campaign/collection-publication.ts`; test `app/test/campaign-collection-catalog.test.cjs`, `app/test/campaign-repository.test.cjs`, `app/test/campaign-publish.test.cjs`.

**Interfaces:** `resolveCollectionMembers(session, ids, fetcher?): Promise<string[]>` 遍历所有页；`beginPublication` 用实际成员快照做冲突检查。店铺级持久化协调序列化并集写入与发布状态，提供 `listRequiredCollectionIds(handle)`，包含不确定状态。

- [ ] **Step 1:** 写失败测试：50 条以上跨页、重复商品、空分类、重复/坏游标、上游错误；分类与商品/分类活动相交阻止发布；两个并发发布不能用过期并集覆盖彼此；重启后不确定活动 ID 仍在并集。
- [ ] **Step 2:** 运行上述三个聚焦测试，确认预期失败。
- [ ] **Step 3:** 复用既有分类详情和 50 条分页接口，遍历到无游标并限制重复游标与最大页数；每次发布用完整成员集合重算快照。将仓储的分类发布拒绝改成经服务端已验证快照才允许，Function 规则仍只用 `collectionIds`。协调采用 SQLite 事务中的店铺级持久状态/租约和版本检查，跨进程不得只靠内存 mutex；失败时保留锁与并集，不覆盖其他活动。
- [ ] **Step 4:** 运行聚焦测试、`cd app && npm test` 和 `npm run build`；确保现有指定商品发布回归通过。

### Task 4: 发布/暂停编排与管理反馈

**Files:** Modify `app/src/controller/campaigns.ts`, `app/src/service/campaign/publish.ts`, `app/src/service/campaign/discount-adapter.ts` only for rule contract, `app/src/service/campaign/storefront-campaign.ts` if分类前台可见性仍使用快照； modify existing API and storefront tests.

**Interfaces:** 分类发布顺序为分类存在及成员核验、冲突检查、持久化保留分类 ID、Metafield 确认、折扣 REST 创建、确认 `app_discount_id`、本地 active。暂停先确认折扣删除，再在店铺互斥下收缩并集。API 对未验证、冲突及待核对提供可操作错误，不能把平台失败报成功。

- [ ] **Step 1:** 写失败 API 测试：指定商品与分类各创建一次；Meta 写入失败时不 POST；HTTP 明确拒绝可回到草稿；超时/5xx/无 ID 锁定且再次请求不重复 POST；暂停失败保留并集；两活动共用分类时暂停一条不移除 ID。
- [ ] **Step 2:** 运行 `cd app && node --test -r ts-node/register test/campaign-api.test.cjs test/campaign-publish.test.cjs`，确认断言失败。
- [ ] **Step 3:** 按受控顺序连接适配器、仓储与 API。对分类前台投影若需要判断当前商品归属，必须用可信实时分类成员数据；不可让旧 `resolvedProductIds` 决定 Function 折扣范围或误报可用。明确 409/502 对应本地冲突与上游失败。
- [ ] **Step 4:** 运行后端全量测试和构建、Function 全量测试、前端类型检查与构建；检查已有 UI 对分类发布的禁用标记，必要时用现有组件启用并加加载/失败状态，保留参考界面布局与桌面/移动截图。

### Task 5: 成员变化复查与真实店验收

**Files:** Create `app/src/service/campaign/collection-conflicts.ts`; modify `app/src/index.ts` to start the scan, `app/src/controller/campaigns.ts` to expose conflict state, `web/src/pages/quantity-breaks.tsx` to display it, and `docs/APP_PROGRESS.md`; test `app/test/campaign-collection-conflicts.test.cjs`.

**Interfaces:** 定期完整复查已发布分类活动，持久化冲突状态供管理页读取；失败标记“未能确认”而非无冲突。Function 在购物车当次请求提供多节点时按 Task 1 拒绝重叠商品。

- [ ] **Step 1:** 写失败测试：成员新增后产生冲突并显示、成员移出后复查清除、分页失败保留未知状态、复查重复运行幂等。
- [ ] **Step 2:** 运行聚焦测试确认失败，启动时复查一次，此后每 5 分钟复查；单店扫描不重入、单次上游请求有超时，进程退出时清理计时器。API 返回 `clear | conflict | unknown` 及冲突活动 ID，管理页用既有消息组件展示，再运行全量测试。若无法证明多节点 Function 合同，分类功能继续关闭并在进度文档记录平台阻断。
- [ ] **Step 3:** 只读核对目标店扩展部署、Function ID、所需权限及 REST 合同；未确认时停止平台写入。确认后只做一次指定商品及一次分类真实发布，核对平台折扣 ID、后台列表、分类内外购物车/结账、成员新增/移出与暂停。记录 request ID，不把 token/cURL 贴入文档。
- [ ] **Step 4:** 对照 Shopify 原应用参考截图与本地桌面/移动截图完成 UI 验收；更新 `docs/APP_PROGRESS.md`，未访问/未验证项明确标未验收。运行 `git diff --check`，检查所有修改和未跟踪文件、敏感信息与无关改动；按项目 Git 审批流程仅提交和推送获批文件。
