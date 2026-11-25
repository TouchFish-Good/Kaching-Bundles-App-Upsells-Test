# 开发者后台订阅展示修复

2026-11-23。订阅展示修复与发布说明；发布顺序及核验范围见下文。

## 行为

开发者后台以前复用使用权限记录，`unactive` 等状态撤销权限时，展示所需的套餐和历史到期时间也随之丢失。现在独立保存一次完整 Partner 订阅列表查询的展示快照，内部商家列表接口优先投影该快照。权限核验、试用消耗、活动启停和折扣计算规则继续使用原来的权限记录。

示例 `zhenghaonan` 的 `unactive`、`is_trial: true`、`spu_key: ultra`、`end_at: 1795100400000` 在 2026-11-23 显示为“试用已过期 / Ultra / 2026-11-19 23:00（北京时间）”。展示状态结合到期时间判断，原始快照仍保留平台 `unactive` 状态。只有未到期或缺少到期时间的 `unactive` 记录显示“未生效”。试用、正式生效、宽限、未生效、已取消、已过期、待生效和待开始都有明确文案。

## 存储和更新

- 新增独立表 `quantity_breaks_subscription_snapshots`，按应用和商家隔离，仅保存一条供展示的规范化订阅及核验、尝试时间，不保存 token 或原始响应。
- 完整且成功的订阅列表查询附带更新快照。按订阅 ID 过滤的付款查询不覆盖完整快照；它确认的新有效权限可以临时优先于旧快照。展示快照写入失败不影响权限核验结果。
- 接入现有五分钟任务，每批最多 10 家、并发 2 家。已确认记录超过 15 分钟进入刷新候选；失败至少间隔 5 分钟重试，按上次尝试时间排序。实际刷新时间取决于待处理队列。
- 补查只调用 Partner 订阅列表 GET，读取全部分页后才保存；每家分页共享 8 秒请求超时，最多 100 页。查询错误或分页中断保留上次结果。
- 选择当前有效订阅优先于旧记录和未来预订；排除其他商家。`active` 记录按开始/结束时间展示为待开始、当前生效或已过期，`unactive` 记录在到期时显示已过期。已取消继续显示已取消；只有原始 `active` / `expired` 记录匹配同一订阅的已确认有效宽限窗口才显示宽限。
- 管理后台列表只做 D1 关联查询，无逐商家网络请求。没有快照时兼容原有权限摘要。确认空列表后显示未订阅。
- 商家数据删除时同时清理新表；商家身份已经删除后，仍在途的补查不能重新插入快照。

## 本次变更文件

应用仓库：

```text
worker/migrations/0024_subscription_display_snapshots.sql (新增)
worker/src/domain/store-subscription.ts (新增)
worker/src/jobs/subscription-snapshots.ts (新增)
worker/src/db/migrate.ts
worker/src/db/subscriptions.ts
worker/src/index.ts
worker/src/jobs/gdpr-deletion-tasks.ts
worker/src/routes/internal-admin.ts
worker/src/services/entitlements.ts
worker/test/store-subscriptions.test.ts (新增)
worker/test/gdpr-deletion-tasks.test.ts
docs/SUBSCRIPTION_DISPLAY.md (新增)
```

开发者后台仓库：

```text
web/src/api.ts
web/src/store-presentation.ts
web/src/store-presentation.mjs
web/test/admin-presentation.test.mjs
worker/source-projection.ts
worker/test/source-boundary.test.ts
docs/DEVELOPER_ADMIN_API_SPEC.md
```

本次无文件删除。应用仓库已有的 `shopline.app.多件优惠.toml` 修改，以及开发者后台已有的三份未跟踪计划/设计文档，均不属于本次改动。

拟用提交说明：

- 应用：`fix: preserve subscription details for developer admin display`
- 开发者后台：`fix: display inactive and ended subscription details`

## 验证和发布

已通过的基础验证：应用订阅、内部读取、权限撤销、迁移、Webhook 及商家数据删除相关 100 项测试；开发者后台 17 项接口边界测试、8 项展示测试、两侧 TypeScript 检查、应用 Worker 构建（dry-run）及后台生产构建。迁移 SQL 已验证可执行、可重复运行，且与本地运行时建表定义一致。使用本地 API 夹具检查了 1440px、390px 的 Stores 与 Overview 七种订阅状态，确认套餐/到期时间保留，无横向溢出和浏览器错误；未宣称真实线上数据已验证。

发布必须先部署开发者后台，兼容新增状态；再对应用 D1 执行迁移 `0024`，最后部署应用 Worker。后台仓库没有新增迁移。后续五分钟任务会分批补查已有商家，无需编辑或重新发布活动。未经本次变更集的推送批准，不提交或部署这两侧改动。

追加修正验证：按用户确认的“试用已过期”展示规则，已验证 `unactive` 在 `end_at <= 当前时间` 时派生为过期，未来或缺失到期时间保持未生效，原始状态仍保留；已取消文案及宽限范围有独立回归。更新后的订阅展示集成测试 15/15、后台展示测试 9/9、应用 TypeScript 检查及后台生产构建通过。
