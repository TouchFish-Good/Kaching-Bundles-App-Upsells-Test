# 需求与建议 API 设计

**阶段：** 接口契约，尚未实现或部署。
**API 基准：** 商家端沿用 `/api/quantity-breaks/*` 命名和 `requireShoplineSession`；管理端沿用现有内部 HMAC 边界而不是暴露未认证的 `/api/admin/*`。

## 通用约定

- 商家请求：`Authorization: Bearer <SHOPLINE session JWT>`，服务端从会话解析可信 `store_id`；请求体绝不接受 `shopId`/`storeId`。
- 成功：`{ "data": ... }`；失败：`{ "error": { "code": "...", "message": "...", "requestId": "..." } }`。消息不得含令牌、店铺身份或内部 SQL。
- 日期为 ISO-8601 UTC 字符串；ID 为服务端 UUID/ULID 文本；JSON 均为 UTF-8。
- 列表使用不透明 `cursor`，`limit` 默认 20、范围 1--50。游标绑定查询形状（排序/筛选/搜索），形状改变则重置游标。

## 商家 API

| 方法与路径 | 输入 | 成功响应 | 规则 |
| --- | --- | --- | --- |
| `GET /api/quantity-breaks/feedback` | `q?`, `status?`, `sort=newest|votes`, `cursor?`, `limit?` | `{data:{items,nextCursor}}` | 仅 public；每项带 `votedByCurrentStore`。 |
| `POST /api/quantity-breaks/feedback` | Header `Idempotency-Key`；`{title,content}` | `201 {data:{feedback}}` | 验证、限流、同店幂等和短时重复保护。重试同键返回 `200` 同资源。 |
| `GET /api/quantity-breaks/feedback/:id` | 无 | `{data:{feedback}}` | public 详情、公开历史和公开回复；隐藏等同不存在。 |
| `PUT /api/quantity-breaks/feedback/:id/vote` | 无 | `{data:{voteCount,votedByCurrentStore:true}}` | D1 唯一约束保证一店一票；重复调用仍为 200。 |
| `DELETE /api/quantity-breaks/feedback/:id/vote` | 无 | `{data:{voteCount,votedByCurrentStore:false}}` | 无票也返回 200；隐藏等同不存在。 |
| `GET /api/quantity-breaks/feedback/similar` | `title`，3--100 字符，`limit?` | `{data:{items}}` | 仅 public，最多 5 条，按文本相关度/新近度返回；不泄露提交者。 |

商家 `feedback` 资源示例：

```json
{
  "id": "fb_01J...",
  "title": "支持活动复制",
  "content": "希望能复制现有活动以节省配置时间。",
  "excerpt": "希望能复制现有活动...",
  "status": "pending",
  "voteCount": 12,
  "votedByCurrentStore": false,
  "hasOfficialReply": true,
  "submittedByLabel": "商家提交",
  "createdAt": "2026-10-29T09:00:00.000Z",
  "updatedAt": "2026-10-29T09:00:00.000Z"
}
```

## 管理 API

建议最终路径为 `/internal/admin/v1/feedback`，而不是用户示例的公开 `/api/admin/feedback`。原因是现有管理面已在此内部边界实现 HMAC、时间窗和 nonce 重放保护；路径不是安全措施，服务端认证才是。

| 方法与路径 | 所需权限 | 行为 |
| --- | --- | --- |
| `GET /internal/admin/v1/feedback` | `feedback:read` | 分页管理列表，可含隐藏项和提交店铺受控字段。 |
| `GET /internal/admin/v1/feedback/:id` | `feedback:read` | 管理详情、投票汇总、内部审计。 |
| `PATCH /internal/admin/v1/feedback/:id/status` | `feedback:write` | `{status,note?}`；状态不同才写公开历史和审计。 |
| `PATCH /internal/admin/v1/feedback/:id/visibility` | `feedback:moderate` | `{visibility:"public"|"hidden",reason?}`；隐藏必须有原因。 |
| `GET /internal/admin/v1/feedback/:id/history` | `feedback:read` | 状态历史和管理审计（按权限过滤）。 |
| `POST /internal/admin/v1/feedback/:id/replies` | `feedback:write` | `{content}` 创建官方回复。 |
| `PATCH /internal/admin/v1/feedback/:id/replies/:replyId` | `feedback:write` | `{content?,visibility?}` 编辑或隐藏回复；写审计。 |

管理请求在现有 `x-admin-timestamp`、`x-admin-nonce`、`x-admin-signature` 外，必须有可信身份声明。**待确认：** 该声明的 issuer、签名算法和角色源。目前共享 secret 只能标识调用服务，不能满足个人管理员 RBAC；在该问题解决前，管理写路由不得上线。

## 错误码

| 状态 | 代码 | 含义 |
| --- | --- | --- |
| 401 | `AUTH_REQUIRED` / `ADMIN_UNAUTHORIZED` | 缺失、过期或无效认证。 |
| 403 | `STORE_NOT_ACTIVE` / `ADMIN_FORBIDDEN` | 商家安装无效或管理员权限不足。 |
| 404 | `NOT_FOUND` | 资源不存在，或对商家而言不可见。 |
| 409 | `DUPLICATE_SUBMISSION` | 短时完全重复内容；含已有资源 ID。 |
| 422 | `VALIDATION_ERROR` | 字段、排序、游标或状态转换不合法。 |
| 429 | `RATE_LIMITED` | 超过相应商家/API 路由限制，含 `Retry-After`。 |
| 503 | `SOURCE_UNAVAILABLE` | D1/依赖暂时不可用；客户端可重试读请求。 |
