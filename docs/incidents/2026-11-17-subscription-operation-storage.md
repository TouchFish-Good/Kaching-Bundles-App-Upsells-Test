# 2026-11-17：订阅核验任务编号递归增长导致 D1 满容量

## 现场证据

- 店铺：`zheng-haonan`；用户提供的应用 TraceID：`104bfd64-b854-45c0-95ea-b18af3f4c2e1`。
- 实际浏览器点击“重试”后再次显示“暂时无法加载此页面，请重试”；Worker tail 捕获到 bootstrap 两次返回 503，耗时分别为 52ms、34ms。
- D1 远程信息显示数据库大小为 `500432896` 字节；向刷新锁表插入独立、立即过期的诊断记录时，Cloudflare 明确返回 `Exceeded maximum DB size`。查询确认诊断记录没有残留。
- 该店铺会话仍标记为已安装，但 Token 已过期。刷新前必须写入 `token_refresh_locks`；此写入被容量限制拒绝，因此错误映射为 `503 TOKEN_REFRESH_UNAVAILABLE`。这不是 SHOPLINE refresh 接口返回的错误。
- 最新应用请求诊断停在 `2026-11-16T10:49:47.123Z`（北京时间 18:49:47），用户提供的 TraceID 不在 D1 中。诊断写入失败不改变主响应，因此未留下可查询记录。
- `quantity_breaks_subscription_operations` 有 6268 行，字段内容约 240 MB，其中 `operation_key` 共 `239296420` 字节，最长 96803 字符；主键索引等额外占用不计入字段内容统计。
- 已完成的异常付款核验任务（下方精确谓词）为 5667 行，编号内容共 `238650368` 字节。活动表仅 6 行，活动 JSON 共 36141 字节；请求日志及 SHOPLINE response body 不是本次主要容量来源。

## 根因与本地修复

没有订阅 ID 的付款核验，在 `reconcilePending()` 中使用 `sourceEventId` 构建下一条任务编号；后台处理任务又把当前完整 `operationKey` 作为下一次的 `sourceEventId`。每次重试都在原编号外再包一层，导致任务及主键索引持续膨胀。

本地修复使用店铺、已知订阅 ID（缺少时使用固定 `unknown`）和既有的 2 秒重试窗口去重，不再将来源任务编号放入下一条编号。来源事件仍可用于原有试用登记；没有改变有效订阅授予条件、宽限期或折扣失效业务规则。

新增回归测试：

- 无订阅 ID 时连续处理 12 代真实 D1 任务，编号始终小于 256 字符。
- 同一店铺、同一窗口的不同来源事件只生成一个待处理核验任务。

测试先在旧代码上失败（编号达到 307 字符、重复生成 2 个任务），修复后 Worker 全部 321 项测试及 TypeScript 检查通过。

随后按用户批准的保留方案补充自动清理与超时恢复：纯核验成功任务保留 7 天、失败任务保留 30 天；其他任务保留原行作为去重依据，终态 30 天后清除错误详情。复用现有 5 分钟定时器，每轮最多删除 100 行、精简 100 行、处理 100 条超时任务，不占用商家页面请求链路。执行中 15 分钟无更新的核验任务在重试上限内恢复；平台变更任务标记 `blocked`，不自动重放不确定结果。完成/失败写回按领取次数隔离旧执行请求。Worker 全部 328 项测试及 TypeScript 检查通过，现已部署，执行结果见文末。

本次拟提交文件（不包含用户另行修改的 `web/test/feedback-board.test.mjs`）：

- `worker/src/services/entitlements.ts`：修复递归编号。
- `worker/src/db/subscriptions.ts`：保留策略、超时恢复和领取次数校验。
- `worker/src/jobs/subscription-operations.ts`：传递领取次数及使用环境时钟。
- `worker/src/index.ts`：在既有定时器中接入维护，记录安全的计数与错误码。
- `worker/src/db/migrate.ts`、`worker/migrations/0020_subscription_operation_retention.sql`：清理索引。
- `worker/test/entitlements.test.ts`、`worker/test/subscription-repository.test.ts`、`worker/test/subscription-operations.test.ts`：回归与实际 D1/定时器测试。
- `docs/SHOPLINE_AUTHORIZATION_RUNBOOK.md`、本文：运行规则、现场证据及恢复操作。

建议提交信息：`fix: bound subscription task keys and maintain task history`。

## 线上恢复授权与步骤

初稿编写时未推送、未部署、未清理线上数据，页面尚未恢复。2026-11-17 用户明确授权“推送并部署 不用备份之前的数据”，因此本次跳过历史任务表备份，按下方限定范围执行恢复。此授权不扩大到其他商家业务数据。

1. 推送并部署修复，先阻止递归编号继续增长。
2. 本次依照用户要求跳过历史任务表导出备份，不执行下方可选导出命令。
3. 重新查询待清理行数；仅清理 `kind = 'reconcile'`、`state = 'succeeded'`、付款核验前缀且编号长度超过 512 的记录。不会删除进行中或失败的任务，也不会删除商家会话、活动、订单、权益和评论。
4. 分批执行下方 SQL，每批最多 100 行；检查实际修改行数与 D1 大小，直到该范围为空。遇到错误停止，不能扩大删除范围。容量变化以 Cloudflare 实际返回为准。
5. 容量恢复后执行迁移 `0020_subscription_operation_retention.sql`，创建状态/更新时间索引。新代码不依赖新增列，因此满容量期间可先部署修复、清理，再建索引。
6. 使用独立的立即过期锁记录验证写入可用，并删除该诊断记录；检查商家 Token 自动刷新后的到期时间与更新时间，不读取或输出 Token 内容。已卡住的旧核验任务由定时器按恢复策略处理。
7. 回到实际店铺页面点击重试，确认 bootstrap 200、活动正常展示、诊断重新写入；恢复前不能声称线上已修复。

以后恢复时如需备份，可在 `worker/` 目录导出任务表（本次用户明确要求不执行）：

```sh
./node_modules/.bin/wrangler d1 export shopline-quantity-breaks --remote \
  --table quantity_breaks_subscription_operations \
  --output /private/tmp/kaching-subscription-operations-20261117.sql
```

确认范围（只读）：

```sql
SELECT COUNT(*) AS rows_to_clean,
       SUM(LENGTH(CAST(operation_key AS BLOB))) AS key_bytes
FROM quantity_breaks_subscription_operations
WHERE kind = 'reconcile'
  AND state = 'succeeded'
  AND operation_key LIKE 'subscription-reconcile-payment:%'
  AND LENGTH(operation_key) > 512;
```

本次实际使用的分批清理语句：

```sql
DELETE FROM quantity_breaks_subscription_operations
WHERE rowid IN (
  SELECT rowid
  FROM quantity_breaks_subscription_operations
  WHERE kind = 'reconcile'
    AND state = 'succeeded'
    AND operation_key LIKE 'subscription-reconcile-payment:%'
    AND LENGTH(operation_key) > 512
  LIMIT 100
);
```

删除的是已完成的后台核验任务历史，不是 SHOPLINE 订阅，也不取消套餐。该清理不可从应用界面撤销，本次按用户要求不创建本地备份。自动保留策略用于后续持续维护；本次异常任务中尚不足 7 天的记录仍需上面限定范围的一次性清理，不能等待自动到期来恢复服务。

## 恢复结果（2026-11-17 已执行）

- 代码提交 `67f7330` 已推送至应用仓库 `main`；部署的 Worker 版本为 `b67dde97-7e36-4260-9214-19b92f2000be`。本次没有变更前端资源，Wrangler 确认没有新静态资源需要上传。
- 依照用户要求跳过本地备份。分批删除最初确认的 5667 条已完成异常记录；定时器恢复旧执行任务后，又有 2 条旧长编号记录完成，按相同谓词追加清理，累计 5669 条。最终该谓词匹配数为 0；失败及未完成任务未纳入一次性删除。
- D1 大小从 `500432896` 字节下降至 `6922240` 字节（约 6.92 MB，以验证时返回值为准）。独立刷新锁的插入和删除均成功，没有残留诊断锁。
- 迁移 `0020_subscription_operation_retention.sql` 已远程执行成功，索引 `idx_subscription_operations_retention` 确认存在。
- 清理前后业务行数一致：6 个活动、45 个订阅订单、13 条建议、39 条评论。
- `zheng-haonan` 的会话更新时间变为 `2026-11-17T02:22:44.642Z`，Token 到期时间自动更新为 `2026-11-17T12:22:44.548Z`（北京时间 20:22:44）；未读取或输出 Token 内容。
- 真实 Chrome 独立验证标签页打开该店铺应用后，活动首页正常显示 2 个进行中的活动。D1 新请求诊断记录确认该店铺 bootstrap、campaigns、subscription、shop-timezone、products 均返回 200；`/health` 也返回 200。
- 新部署后生成的核验任务编号最长观测为 101 字符；旧卡住任务已观察到重新领取并完成。Worker tail 连接在取证期间断开，因此定时恢复结论依据 D1 实际任务状态及领取次数变化，而不是未获取到的日志。

此验证确认本次店铺容量故障恢复，不代表所有店铺和所有上游异常都经过验收。其他店铺的 Token 仍在各自请求到来时按既有规则检查及自动刷新。
