# 实时订阅权益复查设计

## 目标

支付成功后，商家应在几秒内看到 Ultra 权益生效，不依赖下一次每日 Cron。适用场景包括正常付款、SHOPLINE 合作伙伴平台配置的 0 元折扣码、试用和续费。

每日 Cron 继续保留，职责改为漏掉 Webhook、Worker 短暂故障、Partner 数据延迟和跨店对账的恢复机制，而不是正常支付路径。

## 当前根因

当前回调和订阅 Webhook 只写入 `reconcile` 操作；`processSubscriptionOperations` 仅在 `scheduled` handler 中执行。支付回跳因此只能显示 `review_pending`。

此外，首次 Partner `list` 暂时返回空列表时，权益服务会写入 `unknown`，操作随后被标记为成功。`unknown` 不在每日扫描集合中，导致“付款成功但永远没有权益”的状态。

## 设计

### 1. 统一实时复查入口

新增一个按店铺幂等的实时复查入口，回调和 Webhook 都调用同一入口：

1. 用 `(appKey, handle, subscriptionId 或 outTradeNo)` 生成幂等操作键。
2. 将操作写入 D1，保持现有跨店隔离和重复事件保护。
3. 通过 `c.executionCtx.waitUntil(...)` 在响应返回后立即执行当前店铺的到期操作。
4. 失败时保留操作为 `retrying`，由短退避重试；Cron 只作为最终恢复路径。

不在 HTTP 回调中同步阻塞完整 Partner 链路，避免 SHOPLINE 回跳因上游延迟超时。

### 2. 支付回跳快速路径

`charges/status` 返回成功且包含 `subscriptionId` 时，优先使用现有 Partner `list` 的 `sub_ids` 参数查询该订阅，再调用 `detail` 获取功能点。验证顺序为：

- 订阅状态为 `active`；
- `spu_key` 为 `ultra`；
- `detail.feature_key_list` 包含精确值 `quantity_breaks_access`。

只有全部满足才写入 `trial` 或 `active` entitlement。0 元支付只影响金额，不改变这三个权益判定条件。

如果 Partner 尚未返回该订阅，写入 `review_pending` 并保留可重试操作，不写成最终 `unknown` 或 `inactive`。

### 3. Webhook 处理

`appsubscription/create`、`appsubscription/paid`、`appsubscription/expiration` 仍然只作为权益事实变化的触发器：

- 先校验签名、应用 key、安装店铺和 Webhook ID；
- 支付事件按现有单调状态规则关联订单；
- 为店铺创建幂等复查操作；
- 用 `waitUntil` 立即领取并执行当前到期操作。

重复和乱序事件不能覆盖较新的订单状态，也不能重复发放权益。

### 4. 暂时不可见与失败策略

支付后的复查最多进行三次短退避：建议 `2 秒、5 秒、15 秒`。三次仍无法从 Partner 确认时：

- entitlement 保持 `review_pending`；
- 操作进入 `failed`，记录截断后的诊断信息；
- 前台保持 fail-closed，不开放活动写接口和主题活动；
- 每日 Cron 扫描 `review_pending` 和失败后仍需恢复的店铺。

明确的 `expiration` 或连续对账确认无权益才进入现有宽恕期和失效暂停流程。Partner 网络错误与“尚未同步”不得直接触发活动暂停。

### 5. 前端实时状态

套餐页在 `payment=review_pending` 或 entitlement 为 `review_pending` 时：

- 保留“正在核验”状态，不显示购买按钮；
- 每 2 秒重新读取订阅接口，最长 30 秒；
- 读取到 `trial`、`active` 或 `grace` 后立即显示已生效状态；
- 超时继续显示核验中和重试入口，不把暂时状态改成“需要购买”；
- 轮询必须取消，避免组件卸载后更新状态。

回跳 URL 的 `appkey`、`handle`、`host` 上下文保持现有修复，不能被轮询或语言切换丢失。

## 数据和接口边界

- 不新增未经 SHOPLINE Partner 文档确认的支付字段。
- 继续以 `(SHOPLINE_APP_KEY, handle)` 作为所有 D1 查询和操作键的租户边界。
- 保持 `GET /api/quantity-breaks/subscription` 的 fail-closed 语义。
- 保留每日 `0 3 * * *` Cron 作为恢复和对账，不把它作为实时成功的前置条件。

## 测试验收

Worker：

- 支付回跳成功后立即领取并执行复查操作；
- 0 元支付状态可进入同一权益路径；
- Partner 暂时空列表会保持 `review_pending` 并按退避重试；
- 有效 `list/detail` 响应写入 `quantity_breaks_access`；
- 伪造、重复、乱序和跨店 Webhook 不越权；
- 三次失败不会无限重试，也不会误暂停活动；
- Cron 仍能恢复失败或遗漏的店铺。

前端：

- `review_pending` 自动轮询并在权益生效后切换状态；
- 轮询超时保持核验态，不显示旧的购买态数据；
- 组件卸载取消轮询；
- 回跳上下文和 11 种语言保持不变。

## 非目标

- 不删除每日 Cron。
- 不在客户端自行认定支付成功或绕过 Partner 权益详情。
- 不把 0 元金额当作永久授权；权益有效期仍以 Partner 订阅记录为准。
- 不新增 Cloudflare Queue，除非 `waitUntil + D1` 在开发店压测中无法满足可用性要求。
