# SHOPLINE API 权限与已安装店铺重授权设计

日期：2026-10-16
状态：待确认，未实施

## 目标与边界

让现有 Quantity Breaks 应用能以实际授予的权限读取店铺信息、市场和前台语言，并在已安装店铺缺少新增权限时进入 SHOPLINE 的商家授权流程。只改应用的权限声明、运行时授权校验与后台 API 请求方式；不请求真实店铺授权、不创建或修改线上折扣、不把本地测试当作店铺验收。

成功标准：权限声明与运行时所需权限一致；旧会话不能被当作已获新权限；商家在嵌入式应用内看到 SHOPLINE 授权流程；批准后回调保存含新权限的会话，拒绝或失败时保持清晰的错误状态，不声称数据已加载。

## 当前接口与权限清单

| 应用用途 | 实际调用或入口 | 官方权限 | 当前状态 |
| --- | --- | --- | --- |
| 店铺 ID、名称、Logo、币种 | `GET /admin/openapi/v20260601/merchants/shop.json` | `read_store_information` | 缺少 |
| 店铺市场与币种 | `GET /admin/openapi/v20260601/markets.json` | `read_markets` | 缺少 |
| 店铺已启用前台语言 | `GET /admin/openapi/v20260601/store/languages.json` | `read_translation` | 缺少 |
| 自动折扣创建、更新、删除 | `POST /admin/graph/v20260901/graphql.json`，`discountAutomaticAppCreate`、`discountAutomaticAppUpdate`、`discountAutomaticDelete` | `write_discounts` | 已声明；目标店版本与授权未验收 |
| 模板遗留的创建商品入口 | `POST /admin/openapi/v20260601/products/products.json` | `write_products` | 已声明；本次不更改该入口 |
| 后续商品读取与选择 | 当前未接入真实 Admin 商品读取接口 | `read_products` 已声明 | 保留既有权限，但不能声称该能力已实现 |
| 主题 App Block、购物车 Ajax、Function 运行时 | 前台主题资源、`/cart/add`、Function 输入 | 不使用本应用的 Admin OAuth scope | 与 Admin 权限分开验证 |

官方依据：[店铺信息](https://developer.shopline.com/docs/admin-rest-api/store/query-store-information)、[市场列表](https://developer.shopline.com/docs/admin-rest-api/market/query-market-list)、[店铺语言](https://developer.shopline.com/docs/admin-rest-api/localizations/get-store-languages)、[自动折扣创建](https://developer.shopline.com/docs/admin-graph-ql-api/discounts-and-marketing/mutations/discount-automatic-app-create)、[自动折扣删除](https://developer.shopline.com/docs/admin-graph-ql-api/discounts-and-marketing/mutations/discount-automatic-delete)、[创建商品](https://developer.shopline.com/docs/admin-rest-api/product/product/create-a-product)、[应用授权](https://developer.shopline.com/docs/apps/api-instructions-for-use/app-authorization)。官方文档对 `discountAutomaticAppUpdate` 的检索结果未给出独立权限摘录；按同一折扣写入链路使用 `write_discounts`，上线前仍需在目标店核验。

## 发现的问题

`shopline.app.toml` 仅声明 `read_products,write_products,read_discounts,write_discounts`。`app/src/shopline.ts` 运行时从 `process.env.SCOPES` 读取权限，变量不存在时使用空数组；配置文件与 SDK 因此可能不一致。现有安装的 token 不会因本地配置变更而自动获得新权限。

SDK `validateAuthentication()` 会用 `session.isActive(api.config.scopes)` 比较旧会话范围。嵌入式 API 请求若携带 App Bridge bearer token，授权过期时 SDK 返回 `403` 和 `X-SHOPLINE-API-Request-Failure-Reauthorize` 及重授权地址；现有 `useAuthenticatedFetch()` 已识别这些头，但店铺、活动、市场、语言和译文请求多数直接使用 `fetch()`，未通过它。`confirmInstallationStatus()` 本身不对已存在会话执行同样的 scope 比较，不能只依赖页面入口。

## 方案选择

推荐复用 SHOPLINE SDK 和项目已安装的 `@shoplinedev/appbridge`。统一声明所需的七个既有及新增 scopes：`read_products,write_products,read_discounts,write_discounts,read_store_information,read_markets,read_translation`。运行时不再在 `SCOPES` 缺失时默默请求空权限；配置同步通过测试约束。保持现有 scopes，不在这批顺带移除旧模板接口或改变商品能力范围。

嵌入式后台请求统一携带 App Bridge session token；收到 SDK 的重授权响应时，只接受同源 `/api/auth` 授权入口并通过 App Bridge 的顶层导航动作前往该入口，交由现有 `shopline.auth.begin()` 与回调处理 OAuth。不能用 `window.location.href` 在 iframe 内启动授权，也不能在前端拼接授权码、scope 或敏感信息。防止同一页面的并发 API 请求重复导航；未嵌入的本地预览保留可诊断的 `401/403` 错误，不伪装为店铺已连接。

回调后核对 SDK 存储的 `session.scope` 是否覆盖运行时权限，再允许受保护 API 正常返回。商家拒绝或授权失败时保持原有会话与数据，不把失败降级为成功，也不自动重新发送有副作用的写请求。真实店铺仍需商家完成授权页确认。

备选方案一是自行生成 OAuth URL 与签名；这会重复 SDK 的安全关键逻辑，拒绝。备选方案二是只增补 TOML 后让商家手工卸载重装；不能保障正在使用的嵌入式应用平滑重授权，拒绝。

## 实施边界与验证

预期修改：`shopline.app.toml`、`app/src/shopline.ts`、受保护的后台 API 客户端及页面调用、相关测试、`docs/SHOPLINE_API_RESEARCH.md`。先写权限同步和旧 scope 重授权测试，再改生产代码。覆盖缺少 `SCOPES`、旧会话、商家拒绝、多个并发请求、读请求与写请求、不在 iframe 的本地预览，以及回调后仍缺权限的情况。运行后台、前端、主题测试和构建。

本地验收仅证明授权分支与页面反馈；目标店需另行验证合作伙伴后台已配置相同权限、商家授权页出现新增权限、回调会话包含它们，以及三个只读 API 与折扣 API 的实际响应。未经商家确认不执行真实授权、折扣创建或推送。
