# SHOPLINE 单套餐订阅实施计划

> **供执行 Agent 使用：** 使用 `superpowers:executing-plans`（Native）逐任务执行。每项任务必须先写失败测试，确认失败原因正确后再写最小实现；完成时运行定向回归、类型检查和差异检查。

**目标：** 为“多件折扣”接入 SHOPLINE 权威订阅。Ultra 首次试用 7 天，之后为 USD 9.99/月，每个“月”固定按 30 天计费；宽恕期固定 1 天。失效后停止前台组件并暂停活动。

**架构：** Cloudflare Worker 是唯一调用 SHOPLINE Partner Subscription API 的位置。Worker 在 D1 为每个店铺保存权益镜像、试用账本、支付订单及可重试的暂停操作；后台写接口和公开商品组件接口共用同一权益守卫。Webhook 与每日定时任务只发起复查，绝不把事件载荷直接当作授权或失效结论。

**技术栈：** Cloudflare Workers、Hono、D1、TypeScript、Vitest、React、SHOPLINE Partner APIs。

**设计依据：** `docs/superpowers/specs/2026-10-28-shopline-single-plan-subscription-design.md`

## 已确认规则

- 当前仅创建 `Ultra` 月付 SKU。平台可支持年付，但本期不新增年付 SKU，也不把当前月付改为 365 天。
- 权益 key 为 `quantity_breaks_access`；只有 SHOPLINE 订阅详情确认该 key 才开放应用。
- `SHOPLINE_PARTNER_ACCESS_TOKEN` 已是 Cloudflare Secret，绝不进入 D1、日志、浏览器、响应正文或测试快照。
- 所有权益、订单、任务、锁和缓存使用 `(SHOPLINE_APP_KEY, handle)` 作为租户边界。
- 只有 `trial`、`active`、`grace` 为有效状态。浏览器回跳、`auto_recurring`、前端缓存和本地时间都不能独立授予权限。
- 续费成功只恢复访问权限；此前因订阅失效暂停的活动由商家手动重新启用。

## Superpowers 执行约束

1. 每任务：先红（失败测试）→ 最小绿（实现）→ 回归验证。
2. 一项任务只处理一个明确边界，不混入无关重构。
3. 每个提交前必须运行 `git diff --check` 并检查暂存内容不存在 Token、密码或真实支付信息。
4. Mock 通过不能标记 SHOPLINE 支付、Webhook、续费、平台折扣或主题行为为真实验证完成。
5. 每批代码完成后，按项目规则等待用户明确说“推送”才推送 GitHub 和部署 Worker。

## 高风险验收点

| 场景 | 必须结果 | 任务 |
| --- | --- | --- |
| 重复或乱序事件 | 不二次试用、不二次暂停 | 2、3、7、8 |
| 自动续费 | 取消旧暂停任务，活动保持启用 | 3、9 |
| Partner API 503 | 保留最近确认状态，不直接失效 | 3、9 |
| 无订阅 | 后台写操作 `403 SUBSCRIPTION_REQUIRED`，前台无活动 | 4、6 |
| 跨店铺事件 | A 永不影响 B | 2、7、8 |

---

### 任务 1：Partner 订阅 API 客户端

**文件：** 新建 `worker/src/services/subscriptions.ts`、`worker/test/subscriptions-service.test.ts`；修改 `worker/src/env.ts`。

**接口：** `listProducts()`、`createPayment()`、`getChargeStatus()`、`listSubscriptions()`、`getSubscriptionDetail()`。

- [ ] 写失败测试：五个已确认接口带服务端 `X-Shopline-Access-Token`；任何返回、错误和日志均不包含 Token。
- [ ] 运行 `cd worker && PATH="/Users/SL/.nvm/versions/node/v22.22.3/bin:$PATH" npx vitest run test/subscriptions-service.test.ts`，确认客户端缺失而失败。
- [ ] 增加 `Env.SHOPLINE_PARTNER_ACCESS_TOKEN` 和类型化客户端，只调用文档确认的 `productList`、`create_pay`、`charges/status`、`list`、`detail`。
- [ ] 从 `productList` 严格选择 `spu_key=ultra`、USD、30 天账期 SKU；缺失或多条匹配都安全失败，禁止硬编码 SKU。
- [ ] 重跑定向测试和 `npm run typecheck`；通过后提交 `feat: add SHOPLINE subscription client`。

### 任务 2：D1 权益、试用、订单与操作队列

**文件：** 新建 `worker/migrations/0003_subscription_entitlements.sql`、`worker/src/db/subscriptions.ts`、`worker/test/subscription-repository.test.ts`；修改 `worker/src/db/migrate.ts`。

**表结构：** `quantity_breaks_entitlements`、`quantity_breaks_trial_ledger`、`quantity_breaks_subscription_orders`、`quantity_breaks_subscription_operations`。权益与试用表主键均为 `(app_key, shop_handle)`；订单 `out_trade_no` 和操作 `operation_key` 必须唯一。

- [ ] 写失败测试：同一店第二次 `consumeTrialOnce()` 返回 `false`；店铺 A 不能读取 B 的权益；同一操作只能入队一次。
- [ ] 运行定向测试，确认表和仓储尚不存在。
- [ ] 实现 `D1SubscriptionRepository.readEntitlement()`、`writeEntitlement()`、`consumeTrialOnce()`、`createOrderOnce()`、`enqueueOperationOnce()`、`claimDueOperations()`。
- [ ] 同步更新 Worker 测试用的 `initialMigration`，确保本地 D1 与远端迁移结构一致。
- [ ] 运行仓储与迁移测试；通过后提交 `feat: persist subscription entitlements`。

### 任务 3：权益状态机与权威复查

**文件：** 新建 `worker/src/services/entitlements.ts`、`worker/test/entitlements.test.ts`；修改 `worker/src/db/subscriptions.ts`。

**状态规则：**

```text
active + quantity_breaks_access + trial -> trial
active + quantity_breaks_access + paid  -> active
平台确认到期，尚未超过 valid_until + 1 天 -> grace
宽恕期后第一次确认无权益 -> review_pending 并入复查队列
宽恕期后第二次确认无权益 -> inactive 并入暂停队列
Partner API 查询失败 -> 保留最后确认状态并重试
```

- [ ] 写失败测试：试用、付费、宽恕期、自动续费、两次确认失效、Partner 503、旧事件晚到、跨店铺隔离。
- [ ] 运行定向测试确认失败。
- [ ] 实现 `reconcileEntitlement({ appKey, handle, sourceEventId? })`。仅订阅状态为 active 且详情带权益 key 才授权；有效权益更新递增版本并取消旧暂停任务。
- [ ] 平台确认首次试用权益后才写试用账本；创建支付链接或关闭收银台不能消耗试用。
- [ ] 运行回归测试；通过后提交 `feat: reconcile subscription entitlements`。

### 任务 4：后台 API 权益守卫

**文件：** 新建 `worker/src/routes/subscriptions.ts`、`worker/test/subscription-routes.test.ts`；修改 `worker/src/routes/campaigns.ts`、`worker/src/routes/translations.ts`、`worker/src/routes/catalog.ts`、`worker/src/index.ts`。

- [ ] 写失败路由测试：无权益店铺创建、更新、发布、暂停、结束、删除活动及保存翻译返回 `403` 和 `{ code: 'SUBSCRIPTION_REQUIRED' }`；订阅读取可访问。
- [ ] 实现 `requireSubscriptionAccess()`，从已认证 session 的 `handle` 读取权益，不接受浏览器传递的订阅状态。
- [ ] 放行健康检查、OAuth、订阅读取/支付/回跳与 Webhook。所有 Quantity Breaks 写路由使用守卫，返回 JSON 而非 HTML 重定向。
- [ ] 运行 `subscription-routes` 和现有 `routes-contract` 测试；通过后提交 `feat: guard Quantity Breaks by entitlement`。

### 任务 5：套餐页、结算创建和 11 语言后台文案

**文件：** 修改 `web/src/pages/quantity-breaks.tsx`、`web/src/prototype/navigation.ts`、`web/src/prototype/admin-workspace-messages.ts`；新建 `web/src/prototype/subscription-api.ts`、`web/test/subscription-plan.test.mjs`；修改任务 4 的订阅路由与测试。

- [ ] 写失败测试：未知、核验中、失效店铺路由到 `/quantity-breaks/plan`；显示“USD 9.99 / 月（每 30 天）”；未点击前不会外跳付款页。
- [ ] 写支付端点失败测试：先持久化唯一 `out_trade_no`，再调 Partner `create_pay`；返回体只有支付 URL。
- [ ] 实现 `GET /api/quantity-breaks/subscription`、`POST /api/quantity-breaks/subscription/checkout` 与支付回跳复查；支付 URL 只在商家点击后导航。
- [ ] 补齐试用、续费、宽恕期和核验状态的 11 种后台文案，沿用现有翻译回退。
- [ ] 运行前端、Worker 定向测试和生产构建；通过后提交 `feat: add subscription plan and checkout`。

### 任务 6：主题组件 fail-closed

**文件：** 修改 `worker/src/routes/storefront.ts`、`worker/test/routes-contract.test.ts`、`theme-app-extension/public/app-block.js`、`tests/theme-app-extension/app-block.test.mjs`。

- [ ] 写失败测试：失效、未知、待复查店铺公开接口无活动；已挂载组件收到非 200 后清空 DOM 并隐藏容器。
- [ ] 在公开活动查询前读取 `(SHOPLINE_APP_KEY, shop)` 权益，仅 `trial`、`active`、`grace` 返回数据；保持 `Cache-Control: no-store`。
- [ ] 主题脚本失败时执行 `replaceChildren()` 并隐藏节点，不能遗留旧价格、优惠或加购按钮。
- [ ] 运行 Worker 路由和主题扩展测试；通过后提交 `feat: hide storefront campaigns without entitlement`。

### 任务 7：订阅 Webhook 接收与入队

**文件：** 修改 `worker/src/auth/webhook.ts`、`worker/src/services/webhooks.ts`、`worker/src/index.ts`；新建 `worker/test/subscription-webhook.test.ts`。

**硬门槛：** 实现前，必须从《应用订阅配置说明.docx》链接的 SHOPLINE v20230901 官方文档确认套餐订阅、套餐失效、支付结果三类事件的精确 topic、请求头、签名串、时间容差、事件 ID、重试语义和成功响应。任何字段缺失时停止此任务；不得套用当前 `apps/installed_uninstalled` 的签名格式。

- [ ] 将官方字段写为测试常量，先写有效签名、伪造签名、重复投递和跨店铺事件测试。
- [ ] 按官方契约实现独立验证器；事件 ID 持久化且 `subscription-reconcile:<appKey>:<handle>:<eventId>` 只入队一次。
- [ ] Webhook 只触发任务 3 复查，不能直接消费试用、启用权限或暂停活动。
- [ ] 运行订阅与既有卸载 Webhook 回归；通过后提交 `feat: reconcile SHOPLINE subscription webhooks`。

### 任务 8：确认失效后的安全暂停队列

**文件：** 新建 `worker/src/jobs/subscription-operations.ts`、`worker/test/subscription-operations.test.ts`；修改 `worker/src/db/subscriptions.ts`、`worker/src/db/campaigns.ts`、`worker/src/index.ts`。

- [ ] 写失败测试：A 店失效只暂停 A；重复任务只删除一次平台折扣；B 店活动保持启用；续费后旧版本任务自动取消。
- [ ] 用 `subscription-expired:<handle>:<entitlementVersion>:<campaignId>` 作为唯一键；先由任务 6 关闭前台，再复用现有安全暂停流程删除平台折扣、清理分类变量并写入 `subscription_expired` 原因。
- [ ] 网络或平台不确定错误进入退避队列；明确错误不无限重试；日志不可泄漏 Token。
- [ ] 运行定向测试和折扣发布回归；通过后提交 `feat: pause campaigns after subscription expiry`。

### 任务 9：每日对账与真实开发店验收

**文件：** 新建 `worker/src/jobs/subscription-reconciliation.ts`、`worker/test/subscription-reconciliation.test.ts`；修改 `worker/src/index.ts`、`docs/APP_PROGRESS.md`。

- [ ] 写失败测试：cron 同时执行现有分类冲突扫描、权益复查和到期操作；单店失败不阻断其他店。
- [ ] 实现每日对账，扫描 active、grace、review_pending 或存在待处理任务的店铺；循环始终使用店铺隔离。
- [ ] 运行全量验证：`web` 完整测试与构建、`worker` 类型检查与测试、主题扩展测试、`git diff --check`。
- [ ] 在 SHOPLINE 开发店逐项验证：首次试用、关闭收银台、成功付费、自动续费、1 天宽恕期、宽恕期后失效、重复 Webhook、跨店铺隔离、主题组件清除及商家手动恢复活动。
- [ ] 只记录非机密 request ID、截图位置和实测结果到 `docs/APP_PROGRESS.md`；通过后提交 `feat: reconcile subscription access daily`。

## 自检结论

计划覆盖月付 30 天 SKU、试用、支付、权益、后台守卫、主题前台、Webhook、宽恕期、自动续费、失效暂停及每日对账。明确不包含年付 SKU、套餐升级/降级、退款/取消和续费后自动恢复活动。

任务 7 的 SHOPLINE Webhook 官方契约是唯一外部硬依赖；其余任务可在不猜测该契约的情况下实施和测试。
