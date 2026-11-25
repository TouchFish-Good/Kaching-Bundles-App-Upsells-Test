# 嵌入式应用启动修复与变更审查

状态：本地完成修复与复审，用户已明确批准本次推送并部署。下列为发布前的验证记录，实际提交与部署结果以本轮执行输出为准。

仓库：`https://github.com/TouchFish-Good/Kaching-Bundles-App-Upsells.git`

分支：`main`；基线提交：`15d10d313b1ad031ec537428e3124baf9e79c0d0`。

拟定提交消息：`fix(app): stabilize embedded startup and token recovery`

## 范围与结果

此次用户在启动全链路复盘后授权“开始修复”。本次补充此前骨架方案的数据链路和 Token 恢复，不修改 OAuth 验签算法、店铺隔离或业务写入规则。

1. 保留编码/未编码的 `path` 入口；翻译与建议不再被首页覆盖。
2. Session Token 5 秒共享等待预算；写操作不重发。启动订阅/身份并行，单阶段有界读取与临时重试。
3. D1 中的可信已安装店铺身份优先；活动先读配置，关联折扣保持未核验，后台权威核验。
4. 恢复可见时保留已加载内容；业务切页后台重新检查订阅；换店清旧快照，权益拒绝清内容并进入套餐页。
5. Storage 不可用时继续挂载，防止恢复循环；第二次文档超时不再丢弃迟到的初始化。
6. Worker 刷新网络 8 秒、竞争等待 10 秒；要求新版本 Token，临时错误为 503，真正 401/403 仍重新 OAuth。
7. 新增启动阶段诊断关联；未取得 Session Token 的摘要先保留在内存，不新增匿名入口。

没有删除任何文件。未修改 CSS、数据库迁移、应用活动配置业务规则或开发者管理后台仓库。

## 验证证据

- Worker Vitest：44 文件、299 项通过；Worker TypeScript、模块边界检查、dry-run 构建通过。
- 前端生产构建通过，仍有大于 500KB chunk 提示。
- 启动定向回归 43/43；最新全量中的页面恢复、隔离、权益失效和路由复核组 18/18；补充路由切页权益和旧翻译入口断言 2/2。
- 独立代码审查发现并复现了切页不复核订阅的问题；补回非破坏性复核后复审无未解决 Critical/Important。
- 完整 Web 最终结果：342 项，336 通过、6 项失败；全部失败与下述修改前基线一致，启动相关回归均通过。
- 前端 TypeScript 仍有 3 项已有错误：`storefront-translation-defaults.ts:188` 的两个索引类型错误，`StorefrontWidget.tsx:298` 的 Variant null 错误。已在同基线验证，不在本次修改文件中。
- 在临时 `git archive` 基线目录以相同 Node 22 运行编辑器/预览/CSS 三组 90 项测试，84 项通过、下述 6 项同样失败；没有修改这些业务/CSS文件。

现有失败：

- duplicate quantities in an unsaved draft keep preview radio IDs unique
- style editor exposes badge placement and separate variant, cart, savings and button controls
- right corner badges stay in the tier header on narrow previews
- shows only the selected variant price in a bundle slot header
- reserves a readable Recommended column instead of shrinking its label
- inherit-family font shorthands use individual font properties

## 视觉与实际环境的边界

本地浏览器使用模拟接口，已验证编码翻译/建议入口、首页配置先显示而核验延迟、订阅接口失败后中文恢复按钮以及接口恢复后重试。四张本地截图位于下方新增文件中；建议页最终截图为正常空数据状态。参考沿用已有 Shopify 首页/翻译页截图和建议页截图，不改变页面布局。

尚未在真实 SHOPLINE iframe 发布本次改动；店铺首次安装、已订阅和试用状态、三页切换、Token 临期、Token刷新慢和受限Storage的真实组合场景仍需部署后验收。自动化/本地模拟通过不能等同于“任何网络条件都必定进入”。没有执行真实商家写操作。

## 修改的文件

- `docs/APP_PROGRESS.md`
- `docs/SHOPLINE_AUTHORIZATION_RUNBOOK.md`
- `web/index.html`
- `web/src/entry-route.ts`
- `web/src/index.tsx`
- `web/src/observability/request-failure.mjs`
- `web/src/pages/quantity-breaks.tsx`
- `web/src/prototype/Translations.tsx`
- `web/src/prototype/authenticated-fetch.ts`
- `web/src/prototype/bootstrap-recovery.ts`
- `web/src/prototype/campaign-api.ts`
- `web/src/prototype/shop-identity-api.ts`
- `web/src/prototype/subscription-api.ts`
- `web/test/authenticated-fetch.test.mjs`
- `web/test/bootstrap-recovery.test.mjs`
- `web/test/home-entry.test.mjs`
- `web/test/reauthorization-wiring.test.mjs`
- `web/test/translations-fallback.test.mjs`
- `worker/src/auth/session.ts`
- `worker/src/db/sessions.ts`
- `worker/src/routes/campaigns.ts`
- `worker/src/routes/catalog.ts`
- `worker/src/routes/observability.ts`
- `worker/src/routes/subscription.ts`
- `worker/test/routes-contract.test.ts`
- `worker/test/session-auth.test.ts`

## 新增的文件

- `docs/reference/screenshots/startup-feedback-2026-11-13.png`
- `docs/reference/screenshots/startup-home-2026-11-13.png`
- `docs/reference/screenshots/startup-recovery-2026-11-13.png`
- `docs/reference/screenshots/startup-translations-2026-11-13.png`
- `docs/superpowers/plans/2026-11-13-startup-stability-review.md`
- `web/src/prototype/browser-storage.ts`
- `web/src/prototype/startup-messages.ts`
- `web/src/prototype/startup-read.ts`
- `web/test/bootstrap-entry.test.mjs`
- `web/test/startup-read.test.mjs`
- `web/test/startup-resilience.test.mjs`
