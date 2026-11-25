# SHOPLINE GDPR 必需 Webhook 与开发者后台设计

## 目标

为公有应用接入 SHOPLINE 要求的 GDPR 删除通知，并让唯一的 Owner 能在开发者后台查看和重试已经由 SHOPLINE 签名发起的删除任务。

本设计不提供手工伪造客户或店铺删除请求的入口。删除是不可逆操作，后台只能执行或重试已验证、已持久化的任务。

## 已配置的公开回调

Partner Portal 已配置以下 HTTPS 回调，均由商家应用 Worker `app.vswwy.cn` 接收：

| SHOPLINE 事件 | Topic | 回调 |
| --- | --- | --- |
| 客户数据删除 | `customers/redact` | `/api/webhooks/gdpr/customers-redact` |
| 店铺数据删除 | `merchants/redact` | `/api/webhooks/gdpr/merchants-redact` |

开发者后台 `admin.vswwy.cn` 不是 SHOPLINE 回调端点。它通过现有 Service Binding 从商家 Worker 读取任务，并通过已有的签名内部请求执行重试。

## 安全边界

1. 两个公开端点仅接受 `POST`。
2. 使用请求的原始 body 验证 `X-Shopline-Hmac-Sha256`；验证必须使用常量时间比较。
3. 以 `X-Shopline-Topic`、`X-Shopline-Webhook-Id`、`X-Shopline-Shop-Id`、`X-Shopline-Shop-Domain` 为可信事件身份。不得要求 GDPR payload 中存在普通安装 Webhook 才有的 `handle`。
4. 事件 ID 是幂等键。重复投递返回成功，不重复创建或执行删除。
5. 不持久化原始 payload、客户邮箱、手机号、姓名、订单 ID 或请求头。客户任务只保存不可逆的 customer ID 摘要，后台只展示摘要，不展示原 ID。
6. 仅有通过 Owner Cookie 和 CSRF 校验的开发者后台可请求重试；操作必须记录后台审计日志，并要求确认对话框。
7. 所有平台回调只在任务成功持久化后返回空 body 的 `200`。任务必须在收到后 30 天内完成；任务调度器每 5 分钟处理到期前的待执行任务。

## 任务模型

商家 D1 新增 `gdpr_deletion_tasks`，一条任务代表一条经验证的 SHOPLINE GDPR 事件：

| 字段 | 用途 |
| --- | --- |
| `webhook_id` | 唯一幂等键，不保存 raw payload |
| `kind` | `customer_redact` 或 `merchant_redact` |
| `store_id` | 删除范围的稳定店铺 ID |
| `shop_domain` | 仅用于解析当前店铺 handle；完成后清空 |
| `customer_id_digest` | 客户 ID 的带密钥摘要，仅用于任务辨识 |
| `state` | `pending`、`running`、`completed`、`retrying`、`failed` |
| `received_at`、`deadline_at`、`completed_at` | 30 天合规时限和操作时间 |
| `attempts`、`next_attempt_at` | 可恢复重试 |
| `last_error_code` | 固定、非 PII 的失败代码 |

成功完成的客户任务保留最少元数据至 30 天，以满足重放幂等和审计；店铺任务在完成后立即清除 `shop_domain` 与任何可关联字段，仅保留事件 ID、状态和完成时间至 30 天。超过 30 天的任务记录清理。

## 删除范围

### `customers/redact`

当前应用不存储 SHOPLINE Customer ID、订单、地址、邮箱、电话或客户档案。收到该事件时，任务将验证、持久化、标记完成，不执行无关联的全店数据删除。

后续如引入客户数据，所有按 customer ID 存储的 D1 行、KV/R2 对象和任何索引必须登记到同一删除器中，并使用该客户 ID 的原值仅在 Worker 内存中匹配，绝不写入日志或后台响应。

### `merchants/redact`

按 `store_id` 找到对应 `handle` 后，删除商家应用 D1 中该店铺的：

- OAuth session、加密 access/refresh token、安装登记和 Webhook 去重记录；
- 活动、发布状态、暂存更新、店铺锁、token 刷新锁、分类冲突、翻译，以及活动异步操作和操作批次；
- 套餐权益、订单、试用账本和异步订阅操作；
- 建议、评论、投票、附件元数据、状态历史、官方回复和管理员针对这些对象的审计行；
- 应用请求摘要、错误、SHOPLINE 诊断和其他店铺级技术记录；
- 当前店铺的 GDPR 删除任务数据本身，仅保留当前任务的最小完成记录。

删除必须先清理具有外键依赖的反馈附件、评论、投票、回复和状态历史，再删除主建议记录。若实际启用了 R2，删除器必须同时删除该店铺前缀下的对象；目前生产环境未启用 R2，因此不新增 R2 依赖。

开发者后台 D1 保留 Owner 账号、会话、登录限流和与其他商家无关的审计数据。若其 `admin_audit.target_id` 引用了被删除的店铺、活动、建议或评论，商家 Worker 将通过一个仅 Service Binding 可调用的后台内部清理端点删除这些审计行。该端点不对公网开放。IP 级 `public_rate_limits`、无店铺归属的 `internal_request_nonces` 和管理员登录限流不属于商家数据，按既有短期 TTL 清理。

## 执行流程

```text
SHOPLINE HTTPS callback
  -> Merchant Worker: raw-body HMAC + topic/header/schema validation
  -> INSERT OR IGNORE gdpr_deletion_tasks
  -> HTTP 200 (empty body)

5-minute schedule or Owner retry
  -> claim one pending task atomically
  -> customer: mark completed (current system has no customer-linked data)
  -> merchant: redact admin audit via private binding, then delete scoped merchant D1 data
  -> mark completed or schedule bounded retry

Developer Admin
  -> Service Binding read endpoints by kind/status/store/date
  -> two task-list pages
  -> Owner confirmation + CSRF-protected retry endpoint
```

商店删除与后台审计清理是一个逻辑任务：后台清理失败时商家数据不应被标记为完成；任务进入 `retrying`。已删除商家数据的重试必须是幂等的，缺失数据视为成功。

## 开发者后台界面

侧栏新增：

- `客户数据删除`
- `商店数据删除`

两页使用现有 Shadcn 风格表格和移动记录卡，字段为：接收时间、商家、事件 ID、状态、尝试次数、截止时间、完成时间、失败代码和操作。

客户页的客户列只显示不可逆摘要的前后片段，例如 `cst_12…9af`，不显示客户原始 ID、邮箱、电话或订单号。商店页显示已知的 `handle` 和店铺 ID；任务完成并清理关联后显示“已清除”。

仅 `pending`、`retrying` 和 `failed` 的任务显示“执行/重试”图标按钮。点击后必须显示删除范围、不可逆提示、取消和确认；确认请求携带 CSRF token。`running` 和 `completed` 无执行按钮。

## 验证

1. 单元测试：raw-body HMAC、topic/header 验证、重复 webhook、客户 ID 不落库、敏感字段不出现在响应或诊断中。
2. D1 集成测试：客户任务完成、商店任务对每张店铺表的删除范围、外键顺序、失败重试、30 天清理。
3. Service Binding 测试：后台只能读取投影字段，Owner 重试需 CSRF，普通公网请求不能调用内部清理。
4. 前端测试：两页的状态、筛选、确认取消、重试、空态、桌面和移动布局。
5. 真实 SHOPLINE 开发店：Partner Portal 的两个 endpoint 可达；为两种 topic 验证签名格式与 `200` 空响应。只有此项完成后才标记平台实测通过。

## 非目标

- 不向开发者后台提供输入 customer ID、店铺 ID 后直接删除数据的能力。
- 不在 GDPR 任务、错误日志、请求摘要或诊断页保存/展示原始客户个人信息。
- 不修改折扣创建、暂停、删除、订阅或活动状态业务逻辑。
