# SHOPLINE API Research - Quantity Breaks

## Admin API 权限与重新授权（2026-10-16）

| 用途 | 实际接口 | 官方要求的权限 |
| --- | --- | --- |
| 店铺名称、Logo、币种 | `GET /admin/openapi/v20260601/merchants/shop.json` | `read_store_information` |
| 店铺市场及币种 | `GET /admin/openapi/v20260601/markets.json` | `read_markets` |
| 店铺已启用语言 | `GET /admin/openapi/v20260601/store/languages.json` | `read_translation` |
| 自动折扣创建、更新、删除 | Admin GraphQL `discountAutomaticAppCreate` 等 | `write_discounts`；目标店版本仍待验收 |

项目保留原有 `read_products,write_products,read_discounts,write_discounts`，并将上述三个只读权限同时加入应用配置和 SDK 运行时配置。会话写入前校验完整权限，避免拒绝或不完整的重新授权覆盖原会话；受保护请求遇到旧权限时通过 App Bridge 跳转现有 OAuth 入口，不自动重试写入。现有安装不会自动获得新增权限：部署并在合作伙伴后台配置后，商家必须批准重新授权；本地测试不能证明目标店已经授权。官方依据：[店铺信息](https://developer.shopline.com/docs/admin-rest-api/store/query-store-information)、[市场列表](https://developer.shopline.com/docs/admin-rest-api/market/query-market-list)、[店铺语言](https://developer.shopline.com/docs/admin-rest-api/localizations/get-store-languages)、[自动折扣创建](https://developer.shopline.com/docs/admin-graph-ql-api/discounts-and-marketing/mutations/discount-automatic-app-create)。

## Theme App Extension 扩展点核对（2026-10-16）

- [官方扩展结构文档](https://developer.shopline.com/docs/online-store-3-0-themes/integrate-apps-with-themes/theme-app-extension/structure) 确认 App Block 可使用 `target: section`、`templates: ["product"]`，并通过 `stylesheet` / `javascript` 加载 `public` 目录资源；测试代码不是主题扩展的标准发布资源。本应用的 Quantity Breaks Widget 已使用这个商品页扩展点。
- [官方入门文档](https://developer.shopline.com/docs/online-store-3-0-themes/integrate-apps-with-themes/theme-app-extension/get-started) 指示在扩展目录运行 `sl extension push` 上传草稿，之后到合作伙伴后台创建和发布版本。上传是外部写入，本地整理不等于已经上传。
- SHOPLINE AI Suite 对 App Proxy 与 `proxyUrl` 的检索未返回可验证的主题到应用代理契约；检索到的 `proxyNodePage` 等 Storefront GraphQL 查询属于不同能力且标注即将下线，不能拿来替代。当前主题块须配置部署后的 HTTPS 应用 origin，跨域、店铺身份及开发店行为仍需实测。

## 2026-10-16 本地接入复核

- 已再次读取桌面《【函数文档】快速入门》PDF 及《SHOPLINE Product Discount Functions - Input & Output 接口》工作簿。202609 表明确列出 `cart.lines[].merchandise.productVariant.priceSet.shopMoney/presentmentMoney`、`discountNodes[].priceRuleId`、`localization.marketId`、行级 `fixedAmount` 与 `presentmentFixedAmount`；`localization.currencyCode` 标注为当前不支持。当前 Function 未依赖后者。
- Theme SLine 文档检索确认 `product | get_variants()` 可遍历 Variant。App Block 现读取商品上下文并调用公开活动投影；主题编辑器中的 `api_origin` 必须指向部署后的 HTTPS 应用地址。实际店铺的永久域名、Variant 图片/库存输出、跨域许可与 `/cart/add` 响应仍须开发店核验。
- 本地授权配置已增加 `read_products,write_products,read_discounts,write_discounts`。这只声明所需 scopes，尚未证明目标店完成重新授权。自动折扣 GraphQL 创建仍受服务器发布开关保护；无真实 session、Function ID 和目标店 API 版本实测，因此不能称为成功创建。
- `@shoplinedev/function/0.0.2` 执行 `sl-function build -t product-discount-customizations -o dist/function.wasm --env dev` 时，SHOPLINE CI rule URL 返回 HTTP 403 `application/xml`，CLI 报 `invalid json response body`。Go 单测通过不等于 WASM 可部署；须核对该 CLI 的权限/版本或规则服务后重跑构建并在开发店验证。

研究日期：2026-10-12；本地实现核对于 2026-10-14。本文件同时区分线上 Developer Documentation 检索和桌面 `Discount Function` 资料（公测版及 2026-09 Input/Output 接口表）。本地适配器可构造请求，但尚未调用真实店铺。

## 已由官方文档确认的能力

### Product Discount Function 范围

- 桌面《SHOPLINE Product Discount Functions 指引文档（公测版）》确认：Product Discount Function 只提供**商品维度**自定义折扣，可由自动折扣或单个折扣码触发；当前不支持订单维度折扣和免运费折扣。单店和单个 Function 应用各最多 35 条自定义折扣规则。
- Function 运行时仅收到 `input.graphql` 显式声明的字段；它不是后端服务，不能调用 Admin API、写入数据或自行检查库存。
- 2026-09 Input/Output 表确认 `cart.lines[]` 包含 `id`、`quantity`、`merchandise.productVariant`、Product ID、SKU、价格与行小计。因此可以读取同一 Product 的不同 Variant 购物车行并在 Function 内聚合 `quantity`。
- 输出 `targets[].cartLine { id, quantity }` 可对多个购物车行指定商品折扣。桌面指南已确认从 2026-02-05 起，一个 `PriceRule` 可以对多个 `CartLine` 返回不同的行级优惠值。故“同一 Product、不同 Variant 的 3 件混购”具备文档层面的输入/输出表达能力；需开发店验证价格分摊、购物车更新与结账结果。
- 顶层 Value 支持 `percentage`、`fixedAmount` 与 `presentmentFixedAmount`，三者互斥。CartLine 级 Value 只支持 `fixedAmount` 或 `presentmentFixedAmount`，不支持 `percentage`。因此 `fixed_price` 需转换为每个目标 cart line 的固定减免金额，不能返回不存在的“fixed price”字段。

### 店铺币种、市场币种与叠加

- 默认店铺币种使用 `fixedAmount`（或顶层 `percentage`）。线上 Developer Documentation 确认 `DiscountAutomaticAppInput.combinesWith` 用于声明自动应用折扣可叠加的折扣层级；项目方也确认创建 Function 自动折扣的 API 支持该能力。本应用将锁定其他商品折扣为不可叠加，并允许商家分别配置订单、运费折扣。当前工作区未保存创建 mutation 的字段级 schema，正式实现前仍需从可访问的 API 文档锁定 mutation 名及完整 payload，不能凭猜测写入字段。
- `presentmentFixedAmount` 可返回当前市场币种的固定优惠金额；其 `currency` 必须等于当前购物车市场币种。输入的 `priceSet.presentmentMoney` 和行 `subtotalAmountSet.presentmentMoney` 是买家实际所见价格，包含市场固定定价、汇率、价格调整和舍入。
- 命中 `presentmentFixedAmount` 的商品行不再参与其他 Function、主站及插件活动，也不参与其他折扣的门槛计算和优惠分摊，且忽略该活动的叠加配置。因而市场币种模式不能承诺与订单、运费或其他商品优惠组合。
- 同一个 `PriceRule` 不得混用店铺币种/市场币种 Value；同一次 FunctionRunResult 也不得同时返回两种金额模式，否则整个结果失效。市场金额配置应按 `localization.marketId` 路由，并从 `presentmentMoney.currencyCode` 得到实际输出币种；2026-09 接口表将 `localization.currencyCode` 标注为“当前不支持”。
- 桌面指南将市场币种能力标记为白名单能力（预计 11 月全量）。正式启用前必须核对目标店铺资格，未开通时不得静默回退或保存市场金额活动。

### 已由线上 Developer Documentation 检索确认的能力

- Admin REST `GET /markets.json`（本地 OAS v20260601）返回 `markets[]`，含 `market_id`、`market_name`、`enabled`、`currency_settings.base_currency.currency_code` 与 `regions[].currency.currency_code`；通过响应 `link` 中的 `page_info` 分页。店铺默认币种来自单独的 `GET /merchants/shop.json` 响应 `data.currency`。当前应用服务端已注册需经 `/api/*` 鉴权的只读市场代理；未连接开发店时不能声称实际返回已经验证。
- 一个市场若区域币种不唯一，或区域币种与市场基础币种不一致，当前界面只展示该市场并禁用“指定金额”；不得把基础币种冒充全部买家币种。店铺市场数据请求失败时显示错误与重试，不回退为假市场列表。
- Admin REST `GET /store/languages.json`（本地 OAS v20260601）响应 `data.default_language` 与 `data.supported_languages`，后者为当前店铺正在使用的前台语言。应用已通过鉴权服务端添加只读代理；尚未在目标开发店核对实际语言清单与主题前台语言切换。

- 线上文档检索确认 `DiscountAutomaticApp.combinesWith` 和 `DiscountAutomaticAppInput.combinesWith`：前者描述自动应用折扣可组合的 Discount classes，后者在创建时声明可叠加的折扣层级。因此店铺币种模式可以将商家的订单、运费叠加选择映射至创建自动折扣的组合配置；本应用仍强制禁用与其他商品折扣叠加。检索结果未包含创建 mutation 的完整字段 schema，正式实现前需继续完成该 schema 核验。
- 线上文档还检索到 AJAX `POST /cart/add`；请求体可接受 `items` 数组，每项提供 SKU ID 与数量。
- 项目方已确认目标购物车支持原子批量加购。因此 theme 端可一次提交合并后的 `items[]`，并将失败视为整套 Bundle 未加入。此项仍应在目标开发店做请求/库存失败回归，但不再保留逐行部分成功的产品路径。

### 商品页接入

- SHOPLINE OS 3.0 的 Theme App Extension 可以不修改原主题代码地接入第三方应用。
- App Block 可由商家在主题编辑器中加入、移除、排序；其 schema 可加载 `public` 中的 CSS/JS。Quantity Breaks 应作为商品详情区的 App Block，而不是全局浮窗。
- App Embed Block 可注入 `head` 或 `body`，但默认不启用，适合全局无界面能力；它不适合作为一期组件的主要插入方式。
- Theme App Extension 不可用于 checkout 页面。
- Checkout UI Customizer 是独立扩展路径，官方文档说明仅面向 SHOPLINE Enterprise 店铺，并需商家在 checkout editor 中添加。

## 需要进一步验证的能力

1. 最高已达档作用于全部件数的产品规则，可否在 Function 对购物车已有数量、加购 Variant 和删除 Variant 后都正确保持；需要开发店断言 1、2、3、4、5、6 件的结果。
2. 市场金额白名单已由项目方确认开通。仍需验证规则创建/更新接口，以及市场切换、税费、退款和舍入与商品页估算是否一致。
3. 商品“分类”的筛选是否可由 Function Input 的 `inAnyCollectionIds` / `inCollections` 与应用持久化范围表达；排除商品、分类成员变化和活动重叠检查需要完整的商品目录查询接口验证。
4. Theme App Extension 在 storefront 上可获得的 locale / language 上下文及其与店铺默认语言的回退关系，尚需在开发店和目标主题验证；不能把浏览器语言当作唯一权威来源。

## 现有工程证据（不是平台能力确认）

### 2026-10-15 活动级外观改造前置核对

- 当前本地 `product-discount-customizations/schema.gql` 的 `ProductVariantInput` 有 `sku`、`skuCode`，但没有稳定的 Variant `id` 字段；`input.graphql` 只读取 cart line ID、Product ID、价格和市场 ID。SKU 可重复或为空，cart line ID 又不能跨行标识同一 Variant，均不可替代 Variant ID。因此“禁止不同规格混购”规则暂不进入 Function 发布路径。这里仅说明当前本地 schema 的事实，不断言 SHOPLINE 平台永久不支持；仍需核对官方 Function schema、生成模型和开发店脱敏输入。
- 当前 Go Function 已有同 Product 跨 Variant 数量合计、最高已达档和市场金额计算，`go test ./...` 本地通过；尚无平台构建、部署、购物车及结账实测。
- 当前 `theme-app-extension/blocks/app-block.html` 和 `public/app-block.js` 仍是模板。正式替换前须确认目标主题可提供的 Product/Variant 上下文、可信店铺身份、只读活动接口及原子批量加购请求/失败响应。未核实前不能开放按任意 query 参数选择店铺的公开接口。

`product-discount-customizations` 是一个已提供的 Go Function 工程，配置为 `product-discount-customizations`。它的 schema 与桌面 Input/Output 接口表一致地定义了 `CartInput.Lines`、`CartLineInput.Quantity`、`MerchandiseInput.ProductVariant` 和 `CartLineTarget { id, quantity }`。

2026-10-14 本地 worktree 已扩展 `input.graphql` 并实现 Go Function：读取购物车行、同 Product Variant 合计、最高已达档、行级固定减免及市场币种输出；纯计算单测通过。Function 尚未按平台工具链构建、部署或在开发店验证，不代表购物车/结账已生效。后台活动草稿已有店铺隔离 SQLite API；自动折扣 GraphQL 适配器已有本地模拟响应测试，但尚未接入可靠的发布状态机，Active/Scheduled API 仍拒绝请求。Theme App Block 仍为模板占位。

### 自动 App 折扣字段核对（2026-10-14）

- 官方 Markdown 确认 `discountAutomaticAppCreate`、`discountAutomaticAppUpdate`、`discountAutomaticDelete`，以及 `DiscountAutomaticAppInput` 的 `functionId`、`title`、`startsAt`、`endsAt`、`combinesWith`、`metafields`。本地适配器使用 `sale/quantity_breaks` JSON 规则，并仅在 GraphQL 无 `errors` / `userErrors` 且返回折扣 ID 时视为成功。
- 当前公开 Markdown 页面标记 `v20270301`，本地适配器固定请求 `v20260901`。这两个版本的字段兼容性尚未在目标店铺核验；发布入口必须继续关闭，直至确认该版本的 schema、Function ID 与授权范围。
- 后台保存时阻止同市场的档位混用 `fixedAmount` / `presentmentFixedAmount`、跨同时生效活动混用两种模式、指定金额币种不一致，以及超过 35 条启用规则。它们是本地预检，不替代 SHOPLINE 对实际店铺规则、其他应用和结账的校验。

## 当前平台限制或一期不采用的能力

- Theme App Extension 不能渲染在 checkout，不能依靠商品页组件本身改变结账 UI 或作为结账折扣引擎。
- Checkout UI Customizer 不能作为普适一期依赖，因为官方文档限制它为 Enterprise 店铺。
- 不使用前端脚本“改价”或只修改展示价格；这不能保证购物车与结账正确应用优惠。
- Product Discount Function 没有库存字段；库存校验必须在主题端/购物车层执行，结账库存校验仍是平台权威。
- 不会把本地资料中“可表达的输入/输出”描述为已上线验证的商业逻辑；必须经开发店验证。
- 原子批量加购是已确认的项目约束；正式实现仍需验证其对库存不足、无效 Variant 与网络超时的响应契约。
- 跨商品混合计数和多个活动的自定义冲突裁决不纳入一期。

## 建议的后续技术验证顺序

1. 扩展 Function 输入查询，读取 line ID、数量、Product ID、Variant 价格及市场金额；为 2/3/5 阶梯和 4 件最高已达档建立纯计算测试。
2. 在开发店用同一 Product 的多 Variant 行验证计数、多个 CartLine target、相同 Variant 合并数量、购物车变化与结账分摊。
3. 分别验证店铺币种 `fixedAmount`/`percentage` 与白名单市场币种 `presentmentFixedAmount`，包括 Value 的统一币种模式和叠加限制。
4. 通过已确认的原子 `/cart/add` `items[]` 接口验证批量多 Variant 请求、库存不足和无效 Variant 的失败响应，确保失败后不改变本地 Bundle 选择。
5. 验证 App Block 在至少一个 OS 3.0 产品页主题中的安装、排序、变体切换与 cart 请求。

## 官方来源

- [discountAutomaticPfntCreate](https://developer.shopline.com/docs/admin-graph-ql-api/discounts-and-marketing/mutations/discount-automatic-pfnt-create)
- [DiscountAutomaticPfntInput](https://developer.shopline.com/docs/admin-graph-ql-api/discounts-and-marketing/inputs/discount-automatic-pfnt-input)
- [DiscountAutomaticPfnt](https://developer.shopline.com/docs/admin-graph-ql-api/discounts-and-marketing/objects/discount-automatic-pfnt)
- [DiscountOnQuantity](https://developer.shopline.com/docs/admin-graph-ql-api/discounts-and-marketing/objects/discount-on-quantity)
- [Automatic discounts REST endpoint](https://developer.shopline.com/docs/admin-rest-api/marketing/main-station-promotional-activity/query-automatic-discount-activity)
- [Theme app extension overview](https://developer.shopline.com/docs/online-store-3-0-themes/integrate-apps-with-themes/theme-app-extension/overview)
- [Theme app extension structure](https://developer.shopline.com/docs/online-store-3-0-themes/integrate-apps-with-themes/theme-app-extension/structure)
- [Checkout UI Customizer](https://developer.shopline.com/docs/apps/checkout/checkout-ui-customizer/build-an-extension)
- [Apply a discount code to cart](https://developer.shopline.com/docs/ajax-api/cart/apply-code)
- [Add to cart](https://developer.shopline.com/docs/ajax-api/cart/add-to-cart)

## 桌面资料来源

- `/Users/SL/Desktop/Discount Function/SHOPLINE Product Discount Functions 指引文档（公测版）.docx`
- `/Users/SL/Desktop/Discount Function/Discount Function 支持市场币种优惠金额 DDL831.docx`
- `/Users/SL/Desktop/Discount Function/SHOPLINE Product Discount Functions - Input & Output 接口.xlsx`
- `/Users/SL/Desktop/Discount Function/【函数文档】快速入门 .pdf`
