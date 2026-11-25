# 阶梯折扣与多市场金额实施计划

> **执行要求：** 使用 `superpowers:executing-plans` 逐项实施，步骤以复选框跟踪；实现前先读关联设计规格。不得未经许可推送。

**目标：** 为每档明确配置折扣类型/数值，并为两种金额类折扣支持市场自动换算或指定金额，且不发布无法正确计算的活动。

**架构：** 阶梯配置保存在应用持久层；前端通过已鉴权的应用服务端读取店铺市场。Function 按当前市场选择统一币种输出模式，不能混用店铺与市场币种 Value；无法验证的混合配置在发布前被拒绝。

**技术栈：** React/TypeScript、Express/TypeScript、SQLite（沿用现有会话存储，活动持久化需单独建表）、Go Function、Node test runner、Go test。

**规格：** `docs/superpowers/specs/2026-10-14-tier-markets-and-translations-design.md`

## 全局约束

- `GET /markets.json` 是已核实的 Admin REST 路径；分页、币种和市场 ID 必须按真实响应读取。不得在浏览器中持有 Admin token。
- `fixed_price` 不是 Function 原生 Value；必须转成逐行减免。
- 同次 Function 结果不得混用店铺币种和市场币种输出；现有资料标记市场币种折扣不得与其他折扣叠加。
- 没有开发店验证就不能将 Function 行为标记为已完成；不接入生产店铺。

## 重点风险

- 零位小数/三位小数币种须正确解析和格式化金额。
- `GET /markets.json` 多页、空页、禁用市场、重复市场 ID、区域币种与市场基础币种不一致时不得错误保存。
- 自动固定减免与指定市场金额可能在同次 Function 运行中冲突；无权威换算值时阻止发布。
- 不同 SKU 市场独立定价下固定售价不得以店铺售价推算。
- 叠加开关不能声称 `presentmentFixedAmount` 可与其他折扣组合。

---

### Task 1: 折扣类型与金额输入

**文件：** 修改 `web/src/prototype/model.ts`、`web/src/prototype/CampaignEditor.tsx`、`web/src/prototype/tier-pricing.ts`、`web/test/tier-pricing.test.mjs`；新建 `web/src/prototype/money.ts`、`web/test/money.test.mjs`。

**接口：** `Tier.discountType` 为 `none | percentage | fixed_amount | fixed_price`；`discountValue` 对金额类表示店铺币种最小单位。`minorUnits(currencyCode)` 返回该币种的小数精度；解析非法/负数金额时报具体字段错误。

核心断言示例：

```js
assert.equal(minorUnits("JPY"), 0);
assert.equal(minorUnits("USD"), 2);
assert.equal(minorUnits("KWD"), 3);
assert.equal(validateTierPricing({ quantity: 2, label: "Two", discountPercent: 0, discountType: "none" }, [10000, 10000]), "");
```

- [ ] 写失败测试：原价不要求数值；百分比边界为 0–100；两种金额类按每件计算；JPY、USD、KWD 分别按 0/2/3 位小数解析；空值、负值和超精度被拒绝。
- [ ] 运行 `cd web && npm run test:prototype` 确认新增断言失败。
- [ ] 将类型与数值拆成相邻表单字段；`none` 隐藏并清除数值；金额输入显示店铺币种且以整数最小单位保存。切换类型时不把旧百分比误当金额。
- [ ] 再运行 `cd web && npm run test:prototype && npm run build`；检查新增档位、编辑旧活动及桌面/手机布局。

### Task 2: 鉴权市场读取及编辑器市场行

**文件：** 修改 `app/src/index.ts`（仅注册路由）、`web/src/prototype/CampaignEditor.tsx`、`web/src/pages/quantity-breaks.module.css`；新建 `app/src/service/markets.ts`、`app/src/controller/markets.ts`、`web/src/prototype/market-config.ts`、相应单元测试。

**接口：** 服务端 `GET /api/quantity-breaks/markets` 返回 `{markets: [{id, name, enabled, currencyCode}], shopCurrencyCode}`；服务端使用已鉴权 SHOPLINE session 调用 Admin REST 并遍历 `link`/`page_info`。每档金额类 `marketOverrides[marketId]` 为 `{mode: "auto_convert"}` 或 `{mode: "specified_amount", amountMinor: number, currencyCode: string}`。

市场若包含不同区域币种，不得把 `base_currency` 冒充所有买家的展示币种。先记录 `regions[].currency.currency_code`，对无法映射为唯一有效币种的市场阻止指定金额配置，直至服务端能按市场与区域准确选择币种。测试须覆盖市场基础币种与区域币种不一致的响应。

覆盖值示例：

```ts
type MarketOverride =
  | { mode: "auto_convert" }
  | { mode: "specified_amount"; amountMinor: number; currencyCode: string };
```

现有 `app/src/index.ts` 已在 `/api/*` 注册 `shopline.validateAuthentication()`，但 `app/package.json` 尚无测试脚本。本任务先增加可运行的 Node/TypeScript 服务端测试命令，并将新 GET 路由注册在鉴权中间件之后；不能绕开该中间件。计划中的服务端测试均使用新增命令运行。

- [ ] 写失败测试：两页响应完整合并、启用/禁用状态保留、缺少币种和未授权请求返回明确错误；前端切换为指定金额后显示该币种输入框，切回自动模式隐藏并清除覆盖金额。
- [ ] 运行相应 Node 测试与 `cd app && npm run build`，确认测试先失败。
- [ ] 在现有鉴权模式下接入服务端代理；前端提供加载、重试、空市场、未连接演示状态。市场来源不能退回硬编码列表。
- [ ] 运行 `cd app && npm run build`、`cd web && npm run test:prototype && npm run build`；检查分页与币种异常响应，并更新 `docs/SHOPLINE_API_RESEARCH.md` 的已确认/未验证边界。

### Task 3: 持久化、统一输出模式及发布门槛

**文件：** 新建活动配置的服务端存储/校验模块及测试；修改 `product-discount-customizations/input.graphql`、`product-discount-customizations/main.go`，增加 Go 计算测试；按实际路由修改编辑器保存路径。禁止把现有 SQLite 会话表当作活动配置表，须单独建表并以店铺 ID 隔离。

**接口：** `validateMarketPricingForPublish(campaigns, marketId)` 在不能保证单次 Function 统一币种模式时返回阻止发布的可读错误。Go Function 从输入读取 Product/Variant/市场/价格，按同 Product 的 Variant 行聚合数量，对各命中行生成合法折扣输出。

发布门槛断言示例：

```js
assert.match(validateMarketPricingForPublish(mixedCampaigns, "market-1"), /无法同时保证自动换算与指定金额/);
assert.equal(validateMarketPricingForPublish(autoOnlyCampaigns, "market-1"), "");
```

- [ ] 先在开发店验证 `fixedAmount` 自动换算、`presentmentFixedAmount` 指定金额、同次多活动触发与叠加限制；记录输入/输出和结账结果。若未通过，保留任务 1–2 的配置界面，但禁用相应活动发布，不编造运行时换算。验证结果和准入条件写入 `docs/SHOPLINE_API_RESEARCH.md`。
- [ ] 写失败测试：未覆盖市场走店铺币种模式；指定市场走市场币种模式；混合固定金额无权威换算时拒绝发布；不同 Variant 同 Product 汇总；固定售价减免不超过原价；币种不匹配时拒绝输出。
- [ ] 运行 `go test ./...` 和服务端测试确认失败，再实现最小持久化、发布校验及 Function 计算；不得修改生成的 `models_easyjson.go`，除非生成工具要求。
- [ ] 重跑 `go test ./...`、应用/前端构建、开发店购物车与结账测试。记录未验证场景，更新 `docs/REQUIREMENTS.md`、`docs/DESIGN_SPEC.md`、`docs/APP_PROGRESS.md`。

### 本计划验收

必须同时具备 UI 测试、服务端测试、Go 测试与开发店的购物车/结账证据，才能标记市场计算 `VERIFIED`。若缺少开发店或平台换算契约，保留阻止发布状态并明确报告；不得仅凭构建成功放行。
