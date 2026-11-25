# SHOPLINE 授权、Token 与订阅运行手册

本文记录多件折扣在 Cloudflare Worker 上的实际授权与订阅处理方式。它描述的是当前代码已实现的行为；未实现的全量重新授权能力会明确标注，不能视为已经上线。

## 三个彼此独立的概念

| 名称 | 用途 | 保存位置 | 失效后的处理 |
| --- | --- | --- | --- |
| App Bridge Session Token | 浏览器 iframe 调用本应用 API 的身份凭据 | 浏览器/App Bridge，不落库 | 前端重新向 App Bridge 获取；不是 OAuth 刷新 |
| SHOPLINE Admin OAuth Token | Worker 调用店铺 Admin API 的 Bearer Token | D1 `shopline_sessions`，加密保存 access/refresh token | 临近过期自动刷新；刷新被 401/403 拒绝时触发重新 OAuth 授权 |
| 订阅权益（Entitlement） | 决定店铺是否可以使用活动功能 | D1 `quantity_breaks_entitlements` 及订阅操作表 | 由 SHOPLINE 订阅事件、读接口后台校验和每日任务同步 |

订阅过期不会使 OAuth Token 失效；OAuth Token 失效也不代表订阅已经到期。这两条链路分别处理。

## 参与端点和组件

| 路径/组件 | 职责 |
| --- | --- |
| `GET /`、`GET /quantity-breaks/*` | 应用 iframe 首次入口；Worker 检查店铺安装会话后返回静态应用或进入 OAuth 引导 |
| `GET /api/auth?handle={handle}` | 服务端发起 SHOPLINE OAuth 授权 |
| `GET /api/auth/callback` | 验签、用 `code` 换取 OAuth Token、保存会话并回到嵌入式应用 |
| `POST /api/webhooks` | 验证 SHOPLINE Webhook；处理卸载及订阅事件 |
| `GET /api/quantity-breaks/subscription` | 返回缓存权益，并在后台触发一次订阅校验 |
| `web/src/prototype/embedded-auth.ts` | 在 iframe 中通过 App Bridge 跳转到 SHOPLINE 原生 OAuth 页面 |
| `web/src/prototype/authenticated-fetch.ts` | 每个前端 API 请求附带 Session Token，处理需要重新授权的响应头 |
| `worker/src/auth/session.ts` | 验证 Session Token，读取、刷新及锁定 Admin OAuth Token |

## 首次安装和首次进入

1. SHOPLINE 后台把应用加载进 iframe，并传入 `appkey`、`handle`、`lang`、`timestamp`、`sign` 等上下文参数。
2. Worker 的 `beginOAuthFromAppEntry()` 查询 `shopline_sessions`：
   - 已有 `installed = 1` 的会话：继续返回前端静态资源；
   - 没有有效安装会话：嵌入式场景 302 回到应用根地址，并带上 `uninstalled=true`、店铺、scope 和 callback 地址。该完整交接地址再次进入 Worker 时直接返回前端页面，不再重复 302。
3. 前端启动时 `initEmbeddedOAuth()` 只在 `uninstalled=true` 的嵌入式场景执行。它使用 `Redirect.toAdminPage(ADMIN_SECTION.OAUTH, ...)` 打开 SHOPLINE 原生授权页，**不会**用 `window.location` 或新窗口跳转。
4. 店铺管理员在 SHOPLINE 原生页确认授权后，SHOPLINE 回调 `/api/auth/callback?handle=...&code=...&timestamp=...&sign=...`。
5. Worker 校验回调的 HMAC-SHA256 签名和 10 分钟时间窗，用 `code` 调用 `/admin/oauth/token/create` 换取 Token，再读取店铺 ID。
6. Worker 以 `TOKEN_ENCRYPTION_KEY` 加密 access/refresh Token 后写入 D1，将 `installed` 设为 `1`，同步开发者后台的安装记录，并注册 Webhook。
7. 回调返回 iframe 应用入口，前端取得 App Bridge Session Token 后加载活动页、翻译页或建议页。

首次进入时，HTML 骨架在 React、App Bridge 或 Session Token 尚未完成前就能显示；它不参与授权，也不会延长 Token 有效期。文档计时器在 5 秒内未挂载时，只在能够保存恢复标记的同一 iframe 会话中自动刷新一次；第二次超时保留骨架，迟到的初始化完成后仍可挂载，不再被另一个模块超时竞赛永久丢弃。浏览器禁止访问 Storage 时不自动刷新，避免刷新循环。

### 页面启动的数据顺序

- `/` 与 `%2F` 表示同一路径；翻译、建议等 `path` 参数会经入口解析后保留对应页面，不再全部被改写为活动首页。无需为了编码差异修改 SHOPLINE 菜单配置。
- 订阅权益和店铺身份并行查询。店铺身份必须来自有效 Session Token 对应的已安装会话；优先使用 D1 中的可信店铺 ID，缺失时才查询 SHOPLINE，不信任浏览器传来的 handle 作为身份。
- 两者通过后才呈现业务内容。翻译和建议页各自加载数据，不再等待活动接口。
- 活动页先读鉴权后的 `GET /api/quantity-breaks/campaigns?view=configuration` 配置快照。有关联 SHOPLINE 折扣的记录先显示“状态暂无法核验”，然后后台用普通活动接口核验实时状态；快照不代表折扣仍在生效。所有写操作仍沿用服务端权限、订阅和权威状态校验。
- 启动中的订阅、身份及活动读取各有 15 秒完整读取预算（包括响应解析）。网络故障、408、429、5xx 或无状态的读取异常最多间隔 250ms 重试一次；401/403 不由该阶段重试。失败提供当前页面的恢复按钮，已完成的其他阶段不因单个自动重试而重新开始。
- 同一 iframe 内切换业务页面时后台复核订阅；从后台切回页面时保留已经显示的内容，再刷新身份、订阅和活动。编辑页不因可见性变化自动刷新，以保留未保存表单。确认店铺 ID 变化时清空旧店铺活动和编辑快照并重新检查订阅；确认订阅不可用时转套餐页。
- 浏览器存储被限制时，应用仍可挂载；本地语言偏好、翻译草稿和一次恢复标记可能无法保存。这不是服务端授权的替代机制。

本文本轮改动为本地实现，真实 SHOPLINE iframe 的首次打开、切页和 Token 到期恢复仍需部署后验收。

## 浏览器 Session Token 链路

浏览器不是直接持有 SHOPLINE Admin OAuth Token。嵌入式页面的每次 API 请求由 `useAuthenticatedFetch()` 调用 `shared.getSessionToken(app)`，并附加：

```http
Authorization: Bearer {App Bridge Session Token}
X-Requested-With: XMLHttpRequest
```

Worker `requireShoplineSession()` 会校验该 JWT：

- 算法必须为 `HS256`；
- `aud` 必须包含当前 `SHOPLINE_APP_KEY`；
- `handle` 必须存在，且 `exp` 未过期；
- 签名使用服务端 `SHOPLINE_APP_SECRET` 校验。

前端行为：

- 同一 App Bridge 实例的 API 请求和浏览器错误上报共享 Session Token 获取。每轮总预算为 5 秒，立即失败时以最多 200ms 间隔重试；已发出的 App Bridge SDK 请求即使超过预算仍会被复用，避免重叠请求。已完成的 JWT 仅在当前 iframe 内存中按实际 `exp` 复用，距到期不超过 30 秒时重新获取；无法解析 `exp` 的令牌不缓存，不写入浏览器持久存储。`401` 或明确要求重新授权的响应使对应缓存失效，店铺/应用上下文变化时清除缓存和待上报记录，旧上下文的未完成请求不能继续发送；
- 只读请求遇到普通 `401` 时最多发送 3 次 HTTP 请求，每次重取 Session Token、间隔 1 秒；写请求不会自动重发，避免重复创建或更新；
- 浏览器 Session Token 过期通常由 App Bridge 重新签发，不需要走 OAuth，也不需要商家再次点击授权。

## Admin OAuth Token 自动刷新

所有店铺范围的 SHOPLINE Admin API 调用都会先经过 `withFreshAccessToken(handle, env)`：

1. 从 D1 解密读取该店铺的 OAuth 会话；会话不存在或 `installed = 0` 时直接拒绝。
2. 若 access token 距到期仍超过 5 分钟，直接使用现有 Token。
3. 若距离到期不足 5 分钟或已到期，Worker 调用：

```http
POST https://{handle}.myshopline.com/admin/oauth/token/refresh
```

4. D1 表 `token_refresh_locks` 以店铺为粒度持有最多 30 秒的锁；同一店铺并发请求只允许一个刷新调用。单次刷新网络请求有 8 秒超时。未持锁请求每 100ms 轮询、最多等待 10 秒，必须看到 Token 或到期时间版本变化，不能把仍未过期的旧 Token 当成刷新结果。持锁者也会重读会话，避免获取锁前其他请求已完成刷新而再次调用上游。
5. 刷新成功后，新的 access token、refresh token（如返回）和到期时间会重新加密写回 D1；旧会话版本不匹配时不会覆盖新安装产生的会话。

因此，**临近过期的正常 Token 不会要求商家重新授权**。

## 何时自动要求重新授权

只有下列条件同时满足时，Worker 才会把需要重新 OAuth 的结果返回给前端：

1. App Bridge Session Token 本身有效；
2. 已保存的 Admin OAuth Token 到期或需要刷新；
3. SHOPLINE 的 refresh 接口返回 `401` 或 `403`。

Worker 返回 `403`，并带：

```http
X-SHOPLINE-API-Request-Failure-Reauthorize: 1
X-SHOPLINE-API-Request-Failure-Reauthorize-Url: /?uninstalled=true&embedded=1&...
```

前端只接受同源根路径、格式为 `/?uninstalled=true&embedded=1&...` 的授权目标，并校验 `appkey`、`handle`、`host`、`scope` 与同源的 `/api/auth/callback` 回调地址；校验通过后，再通过 App Bridge 的 `ADMIN_SECTION.OAUTH` 自动打开 SHOPLINE 原生授权页。商家无需点击应用内“重新授权”按钮。

以下情况不会主动跳 OAuth：

| 情况 | 当前处理 |
| --- | --- |
| refresh 网络/超时/响应解析/锁等待故障，或上游返回除 401/403 外的失败 | 返回 `503 TOKEN_REFRESH_UNAVAILABLE` 和 `Retry-After: 1`；避免把临时故障误判为授权失效 |
| 获取浏览器 Session Token 暂时失败 | 前端短暂重试；失败后展示页面加载/错误状态 |
| 普通 API 请求返回 `401` | 只读请求重取浏览器 Session Token，最多发送 3 次请求；不是 OAuth 刷新 |
| D1 暂时不可用 | 入口不把它当成“未安装”，避免错误触发全量 OAuth |

`TOKEN_REFRESH_UNAVAILABLE` 也可能来自刷新过程中的 D1 写入失败，并不证明已请求 SHOPLINE refresh 接口。尤其是 `token_refresh_locks` 插入失败时，尚未调用上游就会返回这个通用错误。应同时检查 D1 容量、锁和会话更新时间，以及诊断记录是否停止写入。已确认的容量故障及恢复范围见 [2026-11-17 订阅任务编号递归增长排障记录](incidents/2026-11-17-subscription-operation-storage.md)。

### 订阅后台任务的保留与恢复

现有 5 分钟定时器会在商家请求之外分批维护 `quantity_breaks_subscription_operations`，不增加新的外部服务：

- 成功的 `reconcile` 核验任务自最后状态更新起保留 7 天；最终失败的核验任务保留 30 天。每轮最多删除 100 行，积压由后续轮次继续处理。
- 其他任务的记录继续作为平台操作的去重依据保存；成功/失败超过 30 天后，仅清除 `last_error` 旧错误详情，每轮最多 100 行。不是删除操作凭据。待执行、重试中、执行中以及 `blocked` 记录不按保留期删除。
- 执行中任务超过 15 分钟没有更新时，每轮最多处理 100 行。纯核验任务在累计领取不足 3 次时转为重试，已达到 3 次则标记失败；涉及平台变更的任务转为 `blocked`，错误码 `OPERATION_OUTCOME_UNCERTAIN`，必须核对平台实际结果后再处理，不自动重放可能已成功的删除。
- 完成/失败写回必须携带本轮领取次数，旧执行请求不能覆盖重新领取后的任务状态。维护日志使用 `subscription_operation_maintenance`；失败日志使用 `subscription_operation_maintenance_failed`，不输出任务编号或凭据。清理失败会记录日志，并继续尝试其他定时任务。
- 发布时执行迁移 `0020_subscription_operation_retention.sql`，为状态与更新时间增加索引。若数据库已满，先按故障记录备份并清理明确的异常历史，再创建索引。

请求诊断的 30 天保留策略独立于任务历史。此清理不涉及商家活动、订阅订单、权益、试用登记或 OAuth 会话。

## 卸载、重新安装与 Token 保存

首次 OAuth 成功后，Worker 会确保以下 Webhook 指向 `https://app.vswwy.cn/api/webhooks`：

- `apps/installed_uninstalled`
- `appsubscription/create`
- `appsubscription/paid`
- `appsubscription/expiration`

Webhook 原始请求体会用 `X-Shopline-Hmac-Sha256` 和 `SHOPLINE_APP_SECRET` 做常量时间比较。收到有效的 `UNINSTALL` 后：

- `shopline_sessions.installed` 置为 `0`；
- 开发者后台店铺状态置为 `uninstalled`；
- 记录卸载时间和 Webhook ID，重复投递不会重复处理；
- 保留审计记录，不把卸载与“临时 Token 刷新失败”混为一谈。

当前实现把卸载的会话标为无效而不是立即物理删除密文；重新安装必须重新完成 OAuth，随后 `upsert` 覆盖为新的加密 Token。

## 订阅、试用和失效

### 权益来源与同步时机

订阅权益来源于 SHOPLINE Partner 订阅查询，而不是浏览器缓存：

- 商家打开应用时，`GET /api/quantity-breaks/subscription` 立即返回当前缓存权益，并后台排队校验；
- 订阅 create/paid/expiration Webhook 到达时，立即排队校验；
- 每 5 分钟的 Cron 处理排队操作；每天 03:00 对 `active`、`grace`、`review_pending` 店铺作全面核验。

### 权益状态

| 状态 | 含义 | 应用行为 |
| --- | --- | --- |
| `trial` | SHOPLINE 返回带 `quantity_breaks_access` 的试用订阅 | 可使用活动功能；试用消费记录只写一次 |
| `active` | 付费 Ultra 订阅且含所需功能键 | 可使用活动功能 |
| `review_pending` | 支付或查询尚未最终确认 | 新店铺进入套餐确认页；已有权益不会因暂时查询而被立即撤销 |
| `grace` | 已过期但仍在 24 小时宽限期 | 仍可使用，等待后续确认 |
| `inactive` | 连续确认订阅不存在/不可用，或功能键不满足 | 进入套餐页，并安排暂停相关活动 |
| `unknown` | 尚无可信订阅记录或无法确定有效权益 | 不授予付费访问；等待下一次核验 |

当已过期且超过宽限期，或确认订阅被取消/未激活时，后台会排队执行活动停用。订阅失效不会删除活动配置，也不会删掉 OAuth Token。

### 商家在 SHOPLINE 套餐页选择试用/付费后

1. 回跳 `/api/quantity-breaks/subscription/callback` 查询订单状态；
2. 已支付结果先以 `review_pending` 回到套餐页；
3. Webhook、即时队列或后续校验确认订阅与功能键后，状态成为 `trial` 或 `active`；
4. 前端套餐页会在确认期内重新读取订阅结果，不需要靠整页刷新来刷新 OAuth。

## Scope 或授权点变更时，如何让所有商家重新授权

### 当前能力和限制

当前系统会在首次安装、卸载后重装、以及 refresh Token 被 SHOPLINE 以 `401/403` 拒绝时自动引导 OAuth。**当前没有“开发者后台点击一次，立即弹出所有商家授权页”的能力，也不应该尝试从服务端静默发起 OAuth。** OAuth 必须在该商家的 SHOPLINE 管理员打开应用后，通过 App Bridge 在该管理员会话中进行。

另外，当前入口只检查 `installed`，没有把 D1 中保存的 `scope` 与新配置的 `SCOPES` 做版本化强制比较。因此仅修改环境变量 `SCOPES` 并不能可靠让全部存量商家重新授予新权限。

### 推荐的受控发布方案（需要先开发，当前尚未实现）

1. 增加 `authorization_revision` 或 `required_scope_fingerprint`：保存每个店铺成功 OAuth 时的授权版本/范围指纹。
2. 将当前要求的版本或范围指纹配置在 Worker 环境变量中。
3. 在 `requireShoplineSession()` 和应用入口比较“店铺已授权版本”与“当前要求版本”；落后时返回现有 reauthorize 响应头，而不是篡改 `installed`。
4. 前端收到响应头后继续使用 App Bridge OAuth 跳转；商家下次打开应用即自动看到 SHOPLINE 原生授权确认。
5. OAuth callback 成功后写入新版本/范围指纹并恢复访问；失败时保留明确错误和可追踪的诊断记录。
6. 开发者后台展示迁移进度：总数、已重新授权、待打开应用、失败原因及最后触发时间。不要展示任何 token。

### 紧急手工方案（仅限无法等待开发时）

不建议把全部 `shopline_sessions.installed` 直接改为 `0`：这会把“需要补授权”伪造成“商家卸载”，污染安装统计和卸载审计。若必须临时处理，应先备份并只通过受控迁移标记“需授权版本”，随后让商家重新打开应用触发 OAuth；执行前必须单独评审 SQL、影响范围和回滚方案。

## 排障顺序

1. 先区分问题是 iframe 初始加载、浏览器 Session Token、Admin OAuth Token，还是订阅权益。
2. 查看 Worker 响应状态和 `X-Trace-Id`；不要在浏览器、日志或开发者后台打印 access token、refresh token、`Authorization`、Cookie 或 app secret。
3. `401`：检查 App Bridge Session Token 是否可获取；只读请求会重取 Session Token，最多发送 3 次 HTTP 请求。
4. `403` 且存在 reauthorize 响应头：让 App Bridge 走原生 OAuth；不要在 iframe 中用 `window.location` 跳授权。
5. `429`/`503`：优先按暂时上游故障处理，不要强迫商家反复授权。
6. 只能进入套餐页：检查 entitlement 状态、Webhook 是否到达、Partner 订阅查询及 Cron 操作；不要删除 OAuth 会话来“修复订阅”。
7. 卸载后仍可访问：核对 `apps/installed_uninstalled` Webhook 的签名、topic、store ID 和 D1 安装状态。

## 代码与测试索引

- OAuth 入口与 callback：`worker/src/auth/oauth.ts`
- Session Token 校验与 Admin Token 刷新：`worker/src/auth/session.ts`
- 自动重新授权响应：`worker/src/auth/reauthorization.ts`
- Token 加密 D1 存储：`worker/src/db/sessions.ts`
- Webhook 校验与注册：`worker/src/auth/webhook.ts`、`worker/src/services/webhooks.ts`
- 订阅路由和权益计算：`worker/src/routes/subscription.ts`、`worker/src/services/entitlements.ts`
- 订阅任务：`worker/src/jobs/subscription-operations.ts`、`worker/src/jobs/subscription-reconciliation.ts`
- iframe App Bridge OAuth：`web/src/prototype/embedded-auth.ts`
- 浏览器请求与重新授权：`web/src/prototype/authenticated-fetch.ts`
- 回归测试：`worker/test/session-auth.test.ts`、`worker/test/authorization-renewal-response.test.ts`、`worker/test/webhook.test.ts`、`web/test/authenticated-fetch.test.mjs`


## 启动故障的诊断关联

浏览器启动阶段失败后，经鉴权的 `/api/observability/errors` 上报会记录 `STARTUP_SUBSCRIPTION_FAILED`、`STARTUP_SHOP_FAILED` 或 `STARTUP_CAMPAIGNS_FAILED`，包括文档 attemptId、阶段、耗时、错误代码及可取得的关联 TraceID。不上传查询参数、令牌、接口响应正文或商家内容。

App Bridge 尚未返回 Session Token 时，请求失败摘要先保留在当前页面内存中，后续取得有效 Token 才鉴权上报；页面关闭前始终未取得 Token 的记录无法送达服务端。因此不能把“没有诊断记录”解释为启动一定成功，也没有新增匿名诊断接口。活动、身份与订阅路由在鉴权后绑定店铺上下文，使请求诊断可关联商家。

### 启动恢复后的 App Bridge 父窗口识别

2026-11-13 北京时间 23:20 左右的 buchaqian 失败现场已在真实浏览器复现：iframe 实际父窗口为 `https://buchaqian.myshopline.com`，但恢复加载后的 `document.referrer` 为 `https://app.vswwy.cn/`。SDK 的 `shared.getHost()` 优先读取 referrer，导致会话消息目标来源错误；该现场没有发出业务 API 请求，店铺 Admin OAuth Token 当时仍有约 7 小时有效期。

App Bridge 现在优先从有效 `handle` 推导店铺 `.myshopline.com` 域名，兼容付款/OAuth 返回的有效 `host`；两者均缺失时优先读取实际父窗口的 `ancestorOrigins`，最后才使用 SDK 回退。所有目标必须是有效 SHOPLINE 店铺域名，不能把应用自身域名作为握手目标。页面内部导航丢失入口查询参数时沿用已建立的 Bridge 上下文；明确切换店铺/应用上下文时重新建立 Bridge。

首次渲染内置简体中文基础词典；支持的入口语言和已验证店铺的主动语言偏好仍有效。在身份查询尚未完成时主动切换语言，查询完成后保留本次选择并按已验证店铺保存偏好。活动列表、翻译页和反馈页的标题与语言选择可先显示，活动数据、翻译数据和反馈分别加载；编辑页与详情页保留原有加载骨架和活动不存在的查询完成边界。首次身份/订阅校验成功前不显示商家私有数据，也不启用业务写操作。活动区域失败后的重试只重新读取活动数据，保留成功的身份和权益校验。

所有 API 请求摘要与 Worker 错误通过 `ExecutionContext.waitUntil()` 写入 D1，不再阻塞主响应；采集范围、TraceID 关联、脱敏和 30 天保留规则不变。本段描述本地修复行为，线上验收以部署后的真实 iframe 测试为准。
