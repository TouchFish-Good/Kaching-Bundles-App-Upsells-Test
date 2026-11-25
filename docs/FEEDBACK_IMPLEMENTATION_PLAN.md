# 需求与建议分阶段实施计划

**状态：** 仅方案，未获开发批准。此文件不是已执行记录。
**前置阻断：** 确认 Developer Admin Console 的可信身份与角色来源；确认反馈功能是否需要订阅 entitlement；批准阶段 2 UI/UX。

## 阶段 1：需求与架构（本次）

- [x] 审查 Worker、D1 迁移、商家认证、现有内部管理 HMAC、React 路由、设计 tokens 和 Roadmap 参考截图。
- [x] 输出需求、用户流程、UI/UX、API、数据库、测试和实施方案。
- [x] 明确当前未实现、待确认和风险。
- [ ] 用户审阅文档并明确批准进入阶段 2。

## 阶段 2：UI/UX 设计（需要单独批准）

1. 在现有 `/quantity-breaks` 壳中制作仅供预览的反馈列表、提交对话框和详情交互，不接入 mock 业务数据以冒充完成。
2. 复用 `quantity-breaks.module.css`、`Button`、toast、语言和导航模式；增加路由及 11 种 locale 的文案键。
3. 取得并保留 1037px 参考/本地对比与 390px 本地截图，逐项检查搜索、状态、投票、空/错/加载和键盘焦点。
4. 更新 `docs/APP_PROGRESS.md`，状态只能记录实际通过的视觉或交互验证。
5. 停止，等待用户确认正式开发。

## 阶段 3：数据和商家 API（需要单独批准）

1. 先为 repository/route 写失败测试：认证、可靠 `store_id` 派生、字段验证、幂等提交、短时重复、隐藏不可见、相似搜索、分页。
2. 新建 D1 `0004_feedback_board.sql`，包含表、索引、投票触发器和约束；扩展迁移测试以验证全量 schema。
3. 新建 `worker/src/db/feedback.ts` 和 `worker/src/domain/feedback.ts`，将输入规范化、公开 DTO 映射和查询边界集中；不让路由拼接未经约束的 SQL。
4. 新建 `worker/src/routes/feedback.ts` 并在 `worker/src/index.ts` 注册。每条商家路由先认证、再解析可信 store ID、再执行限流和仓储操作。
5. 以目标 Vitest、Worker typecheck、完整 Worker Vitest、module-boundaries 和 dry-run build 验证；不得运行生产迁移或部署。

## 阶段 4：受保护管理 API（需要单独批准）

1. 在身份方案已确认后，扩展现有 HMAC 验证以验证 issuer、管理员 ID、角色和 nonce；共享密钥单独不能作为最终 RBAC 实现。
2. 实现管理查询、状态、可见性、回复和审计仓储方法；先写未授权、越权、重放、隐藏理由、状态历史和回复伪造的失败测试。
3. 只注册内部 Worker 路径，不添加临时商家可访问入口或管理 UI。
4. 运行完整 API 权限/并发回归与 typecheck/build。

## 阶段 5：商家页面和端到端行为（需要单独批准）

1. 实现 `FeedbackPage`、`FeedbackSubmitDialog`、`FeedbackList`、`FeedbackDetail` 和类型化 API client；所有数据来自真实已认证 API。
2. 相似建议以取消旧请求/延迟输入避免竞态；投票乐观更新必须从服务端回包收敛并在失败时回滚。
3. 为每种加载、空、错误、重复、限流和隐藏状态写组件/DOM 测试；新增翻译完整性检查。
4. 运行完整前端 Node 测试、生产构建，并在 1037px/390px 做实际截图和交互验证。
5. 更新 `APP_PROGRESS.md`，随后进行需求缺口、安全和 UI 复审。

## 阶段 6：发布前测试、审查与 Git 工作流

1. 执行测试计划中的自动化、手动、性能和安全项；区分本地通过与真实 SHOPLINE 开发店已验证。
2. 审查 `git status`、全部 diff、未跟踪文件和 `git diff --check`；确认没有密钥、`.env` 或无关变更。
3. 汇总文件、验证结果和风险；按项目规则询问“本次代码/文档已在本地更新，是否推送到 GitHub？”。
4. 仅在该变更集获得明确“推送”批准后，暂存经审查文件、提交并推送；生产 D1 迁移和部署仍需独立批准。

## 拟修改文件清单

| 分类 | 文件 | 目的 |
| --- | --- | --- |
| 迁移 | `worker/migrations/0004_feedback_board.sql` | 新表、索引、投票触发器。 |
| Worker | `worker/src/domain/feedback.ts`、`worker/src/db/feedback.ts`、`worker/src/routes/feedback.ts` | 类型、持久化和商家 API。 |
| Worker | `worker/src/routes/internal-admin.ts` 或拆分的 `worker/src/routes/feedback-admin.ts`、`worker/src/index.ts` | 受保护管理 API 和路由注册。 |
| Worker 测试 | `worker/test/feedback-*.test.ts`、`worker/test/migrations.test.ts` | 迁移、认证、权限、并发、可见性和回复测试。 |
| Web | `web/src/pages/quantity-breaks.tsx`、`web/src/prototype/navigation.ts`、新增 `web/src/prototype/feedback-*.ts(x)` | 路由、真实 API 客户端和页面。 |
| Web | `web/src/pages/quantity-breaks.module.css`、`web/src/prototype/admin-workspace-messages.ts`、11 个 `web/src/locales/*.json` | 视觉、可访问性和本地化。 |
| 文档 | `docs/APP_PROGRESS.md`、本组 `FEEDBACK_*.md` | 实际进度、截图链接、设计和测试证据。 |

实际文件名可因第二阶段的已批准组件边界微调；不应扩展到 Theme Extension、Product Discount Function 或 SHOPLINE 管理 API。
