# 需求与建议测试计划

**阶段：** 测试设计，尚未执行。
**通过标准：** 真实 API、D1 持久化、认证、权限、并发和已渲染 UI 均有证据；页面截图不能单独证明功能完成。

## 自动化测试

| 层级 | 场景 |
| --- | --- |
| 迁移 | 新表、CHECK/PK/索引/触发器存在；旧表和迁移顺序保持可用。 |
| 仓储 | 公开 DTO 不含 store/admin 身份；隐藏过滤；排序/游标稳定；LIKE 参数转义；相似结果上限。 |
| 提交 | 缺 JWT、无有效安装、空白/过长字段、控制字符、重复 idempotency key、相同内容短时重复、过期限流键。 |
| 投票 | 同店重复 PUT 幂等；不同店可累积；DELETE 无票幂等；并行 PUT 只产生一票；票数不为负。 |
| 可见性 | 隐藏建议不在商家列表/搜索/相似/详情；管理端可读取；恢复后重新可见。 |
| 状态/回复 | 普通商家无法 PATCH；合法状态写历史；管理员回复可读；隐藏回复不可见；编辑写审计。 |
| 管理认证 | 缺/过期签名、重放 nonce、错误 issuer、无角色、错误角色全部拒绝；必须覆盖个人 admin ID 记录。 |
| Web | 迟延相似查询取消陈旧响应；表单错误摘要；投票回滚；加载/空/错误/404；路由返回；locale 键完整。 |

## API 集成测试

使用 Worker Vitest D1 环境与签名过的 SHOPLINE session JWT：

1. 店铺 A 提交建议，店铺 B 列表和详情可见，但响应中没有 A 的 ID/handle。
2. 店铺 A、B 分别投票，`voteCount=2`；A 重复投票仍为 2；A 取消后为 1。
3. 并发 10 个 A 投票请求，只有一条 `(request_id, store_id)` 记录且票数为 1。
4. 管理员从 `pending` 更新到 `approved`，商家详情读取不含 `changed_by_admin_id` 的时间线。
5. 管理员隐藏建议后，商家路径全部为 `404 NOT_FOUND`，D1 中原投票/历史仍存在。
6. 官方回复创建、编辑、隐藏均有审计；商家只见公开版本。

## 手动与视觉验收

- 在嵌入式 SHOPLINE 开发店中，以实际会话完成提交、跨店投票、取消投票、搜索、筛选、分页、隐藏前后可见性和回复阅读。
- 保存 `1037px` 桌面与 `390px` 手机截图，连同参考 `shopify-roadmap-1037.jpg` 放入 `docs/reference/screenshots/`；对照检查标题、工具栏、状态、长内容、投票按钮、对话框和分页无重叠/裁切。
- 键盘完成打开/关闭对话框、表单错误定位、搜索、筛选、详情和投票；用屏幕阅读器核查状态、按钮 pressed state 和异步结果。
- 用长中文、英文、RTL/本项目支持 locale 中最长文本核查换行；使用 200% 浏览器缩放和 reduced motion。

## 性能与安全检查

- 通过参数绑定、长度上限和 LIKE escape 测试 SQL 注入输入；验证内容不会作为 HTML 执行。
- 对提交、投票、搜索分别验证不同速率阈值、`429` 和 `Retry-After`，而非复用当前 600/min 的公共默认值。
- 对 20/50 条分页与最大长度内容执行 Worker 请求基准；记录 p95 和查询计划。数据增长触发 FTS 设计评审，而不是静默扩容。
- 审查 Worker 日志、错误消息、API 响应和浏览器 network 响应，不得泄露 `store_id`、handle、管理员 ID、token、签名或完整隐藏理由。

## 建议命令（实施后）

```bash
npm --prefix worker test -- feedback
npm --prefix worker run typecheck
npm --prefix worker run test:module-boundaries
npm --prefix worker run build
npm --prefix web run test:prototype
npm --prefix web run build
git diff --check
```

命令必须在实现完成后实际运行并记录退出码。没有实际通过的命令、截图或开发店流程一律标记为未验证。
