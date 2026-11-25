# 指定商品 Function 折扣发布设计

日期：2026-10-20

## 目标与范围

让商家在 Quantity Breaks 编辑页选择店铺真实商品，保存指定商品活动，并创建一条可在 SHOPLINE 折扣后台核对的 Function 自动折扣。第一阶段只发布 `scope.kind = "products"` 的活动。`all` 和 `collections` 草稿可以保留，但发布入口明确拒绝这两种范围，直到后续完成商品 ID 展开和成员同步。

用户要求诊断创建请求时能取得不脱敏的完整 cURL。该输出仅在本地开发进程显式设置 `SHOPLINE_LOG_FULL_CURL=1` 时启用，不在生产环境输出，也不写入文件或数据库。

## 已核对的现状

- 当前编辑器仅允许选择全部商品；`toCampaignDraft` 对其他范围直接抛错。服务端发布控制器也仅放行 `all`。
- 当前发布调用 Admin GraphQL `discountAutomaticAppCreate`。真实调用曾返回 HTTP 200 和 GraphQL `REMOTE_ERROR` / `Service call fail.`，本地活动进入 `needs_reconciliation`，并未获得折扣 ID。
- 桌面公测指南要求先创建并发布 Function，再用 Admin REST 创建和管理 Function 折扣活动。本地 Go Function 有计算测试，但缺少目标店扩展部署和结账验证。
- 参考积分应用调用 `POST /sales/discount_automatic_app.json`，包含 `function_id`、`metafields` 等字段。该路径未出现在本地 `v20260901` OAS 中，因此第一阶段把目标店 REST 契约验证列为发布前门槛，不把参考代码本身当作平台保证。
- 官方本地 OAS 确认 `GET /products/products.json` 支持分页，响应的 `link` 提供下一页 `page_info`；读取商品需要现有 `read_products` 授权。

## 方案

### 商品选择与持久化

在现有编辑器的商品范围面板启用“指定商品”。通过受会话保护的后端商品目录接口，按名称搜索并分页选择真实 Product ID；界面显示商品标题、缩略图和已选择数量。选择结果以 `scope.kind = "products"` 和唯一的 `productIds` 保存，不用商品名称作为身份。重新打开草稿时保留已选 ID；商品已删除或不可读取时显示明确状态，并阻止发布。

新增目录代理沿用现有鉴权、Admin REST 版本和请求头，限制返回字段与页数/结果大小。代理只接受预期搜索和分页参数，不允许前端提供任意上游 URL。编辑器的重叠检查以实际 ID 为准，发布时由服务端重新核对目录和应用内活动冲突；前端结果只是提前反馈。

### 发布与平台状态

发布前校验非空、去重的 Product ID 列表，逐项核对这些商品仍存在，并确认配置的 Function ID 对应目标店已部署的 Product Discount Function。`all` 和 `collections` 在本阶段返回明确的未支持错误。生成的 Function metafield 规则只包含所选 Product ID，Go Function 继续按相同 Product 的不同 Variant 合并数量，不跨 Product 合并。

折扣创建改由独立的 Admin REST 适配器处理，按目标店验证过的 Function 自动折扣请求格式提交。先用注入响应的测试验证请求体与返回值；仅在平台明确返回折扣 ID 后，仓储才完成 `active` 转换。HTTP/业务拒绝与结果不确定分别处理；网络超时、5xx 或缺少确认 ID 时保留 `needs_reconciliation`，不自动重复创建。暂停和删除所需的 REST 操作必须与创建契约一并核验，避免新建成功后无法管理。

当前目标活动若仍处于 `needs_reconciliation`，先只读核对 SHOPLINE 折扣列表与本地发布记录；确认无对应折扣后，备份 SQLite，再仅清除该活动的发布锁。不会通过重复点击发布来试探平台状态。

### 完整 cURL 诊断

在折扣创建适配器构造请求后，只有 `NODE_ENV` 非 `production` 且 `SHOPLINE_LOG_FULL_CURL=1` 时，才向 `shopline app dev` 终端打印可执行 cURL：精确 URL、方法、应用设置的请求头、原始 JSON 请求体及未脱敏 Bearer token。参数使用可靠的 shell quoting，确保复现请求与实际发送内容一致。日志包含应用 request ID。普通日志继续只记录方法、端点、HTTP 状态、耗时、平台 trace ID 与错误摘要；完整 cURL 不写入持久日志、测试快照或 Git 文件。开发终端输出需要按访问令牌保管，不应粘贴到公开工单。

## 验收与限制

先验证目标店 Function 扩展确实完成构建、上传、版本发布，并确认 Function ID 与配置一致。之后以一个真实指定商品活动执行一次发布，核对创建响应的折扣 ID、SHOPLINE 折扣列表、商品页与购物车/结账折扣结果；保留参考和本地桌面/移动截图，更新 `docs/APP_PROGRESS.md`。自动化测试覆盖目录分页、选择持久化、服务端复核、REST 请求格式与失败状态、cURL 开关与 quoting、Go Function 商品范围。未执行过的平台与 UI 验证不得标记通过。

`all` 和 `collections` 是第二阶段：发布时把当时所有商品或分类成员分页展开为实际 Product ID，并为新增/移出商品同步已发布规则、重新检查范围冲突。全部商品新增商品必须自动加入。第二阶段需单独设计与验收，不在第一阶段把动态 `all` 规则冒充已实现的 ID 快照。
