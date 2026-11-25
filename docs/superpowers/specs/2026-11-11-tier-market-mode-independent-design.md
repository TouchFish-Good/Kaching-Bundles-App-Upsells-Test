# 档位独立市场金额模式设计

日期：2026-11-11

## 目标

同一个活动继续只创建一条 SHOPLINE 自动折扣，但活动内每个商品在结账时命中的最高档位可以独立使用自己的金额模式：店铺金额自动换算，或指定市场金额。

目标配置示例：

- 档位 1：原价档位。
- 档位 2：百分比折扣，使用店铺金额模式。
- 档位 3：每件固定减免，使用中国市场指定金额。
- 档位 4：整单固定减免，使用市场金额自动换算。

活动级订单、商品、运费叠加设置必须保持商家配置，并原样传给自动折扣创建请求。指定市场金额档位的商品行是否参与其他优惠，由该档位对应的 `marketNotice` 和平台的市场金额规则说明；不能因为活动中存在一个指定市场档位而修改整条活动的叠加开关。

## 当前问题

服务端 `validateCampaign` 会遍历某市场的所有有效档位，只要发现一个 `specified_amount`，就要求该市场其他有效档位也必须是 `specified_amount`，否则返回 `mixed shop and presentment currency modes across tiers`。

Go Function 还在两个层级强制金额模式一致：

1. 同一活动中多个商品组命中不同模式时，`applyRule` 返回无效候选。
2. 多条活动规则返回不同模式时，`evaluateDiscounts` 返回空结果。

这两个全局模式判断与“按商品命中档位独立计算”的目标冲突。

## 方案

### 1. 活动数据与校验

保留现有档位结构和 `marketOverrides` 字段，不做数据库迁移。

每个档位的校验规则保持不变：

- `auto_convert` 可用于所有折扣类型。
- `specified_amount` 只允许 `fixed_amount`、`fixed_price`、`bundle_fixed_amount`、`bundle_fixed_price`。
- 同一市场的指定金额档位必须使用相同的市场币种和有效金额。

删除“同一市场所有有效档位必须同模式”的校验。保存、草稿更新和发布前校验均允许同一市场的 `auto_convert` 与 `specified_amount` 混用。

跨活动的 `campaignCurrencyConflict` 不再按市场金额模式阻止活动；商品范围和排期冲突仍按现有规则处理。活动级组合开关不再因为 `hasSpecifiedMarketAmount` 被锁定或自动清零。

### 2. Function 输入与输出

Function 继续从同一个活动 metafield 读取全部档位。对每个匹配商品：

1. 汇总同一 Product 的购物车行数量。
2. 选择数量不超过该总数的最高档位。
3. 只使用该档位的 `discountType`、`discountValue` 和当前市场 override。
4. 根据该档位的模式和该商品的价格数据生成独立输出。

输出模式：

| 命中档位模式 | 输出值 | 价格来源 |
| --- | --- | --- |
| 原价 | 无折扣输出 | - |
| 百分比 | 当前已有百分比/店铺金额实现 | 店铺价格或平台百分比计算 |
| 固定类 `auto_convert` | `fixedAmount` | `shopMoney` |
| 固定类 `specified_amount` | `presentmentFixedAmount` | `presentmentMoney` |

每个商品组和命中档位生成自己的 `ProductDiscount` 输出。普通固定类折扣不能再把不同模式的目标行放入同一个共享对象；目标按输出类型、币种和 `appliesToEachItem` 拆分。整单固定类折扣继续按商品组单独输出，金额只应用一次。

删除 Function 候选的全局 `mode` 字段和以下阻断：

- 同一活动商品组之间的 shop/presentment 模式冲突。
- 多条活动候选之间的 shop/presentment 模式冲突。

商品范围优先级、同商品最高档位、整单金额分摊和无价格行处理逻辑保持不变。

### 3. 叠加策略

活动级 `combinesWith` 是一条自动折扣的属性，继续按商家选择上传：

- `orderDiscounts` 不被自动关闭。
- `productDiscounts` 不被自动关闭。
- `shippingDiscounts` 不被自动关闭。

指定市场金额档位的提示继续在编辑页和预览中按档位显示。提示只描述该档位命中的市场金额商品行不参与其他优惠，不改变其他档位的叠加行为，也不修改活动级上传值。

### 4. 预览与主题组件

预览和主题 app block 已按当前选中档位读取该档位的 `marketOverrides`。本次不增加新的市场配置字段；只补充混合档位的渲染测试，确保每个档位使用自己的折扣模式和币种。

## 错误处理与兼容性

- 旧活动没有 `marketOverrides` 时继续按店铺金额模式运行。
- 指定金额缺失、币种无效、金额为负数时仍拒绝保存或发布。
- 市场价格接口不可用时，预览显示已有的市场价格不可用提示，不伪造金额。
- Function 解析到非法规则时继续跳过该规则，不能产生部分不确定折扣。
- 不改变活动 JSON schema、D1 表结构、活动 ID 或自动折扣 ID。

## 测试策略

### Worker

- 验证同一市场混合 `auto_convert` 与 `specified_amount` 不再返回货币模式冲突。
- 验证指定金额仍只接受四种固定类折扣。
- 验证 `combinesWith` 在存在指定市场金额时保持原始 true/false 值。
- 验证折扣规则 metafield 保留每个档位各自的 market override。

### Go Function

使用多个商品组构造同一活动购物车，覆盖：

- 原价档位。
- 百分比档位。
- 每件固定减免。
- 每件固定价格。
- 整单固定减免。
- 整单固定价格。
- 固定类档位在同一市场分别使用 `auto_convert` 和 `specified_amount`。
- 多商品同时命中不同档位时，输出分别使用 `fixedAmount` 和 `presentmentFixedAmount`。
- 同一商品数量变化时始终只命中最高已达档位。
- 订单/商品/运费叠加配置不属于 Function 规则计算，发布请求测试确认值未被改写。

### 平台验收

本地测试只能证明 Function 生成了分开的输出，不能证明 SHOPLINE 线上接受混合值类型。部署前需要在测试店创建一个最小活动，使用两个商品组分别命中店铺金额固定档位和指定市场固定档位，然后核对：

1. Function 运行没有返回结构或业务错误。
2. 店铺币种商品行使用店铺金额折扣。
3. 指定市场商品行使用对应市场币种折扣。
4. 活动级订单、商品、运费叠加设置与保存值一致。
5. `marketNotice` 与实际命中档位一致。

若平台拒绝混合输出，保留代码和测试的失败证据，不将该功能标记为线上可用，并重新评估是否需要拆分自动折扣。

## 发布与回滚

先运行 Worker、Go Function、前端预览和构建测试，再单独发布 Function 扩展和 Worker。保留现有自动折扣 ID 和 D1 活动数据，不进行数据迁移或批量重建。

若线上 Function 验证失败，回滚 Function 版本和 Worker 版本；不删除现有活动，不自动重建自动折扣。活动级叠加字段在回滚前后保持原值。
