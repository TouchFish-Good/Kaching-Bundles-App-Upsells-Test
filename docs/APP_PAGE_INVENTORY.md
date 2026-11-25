# 全应用页面清单

2026-10-14 只读盘点。参考为已登录 Shopify 开发店铺的 Kaching Bundles 页面；截图位于 `docs/reference/screenshots/`。截图包含第三方商店数据，仅用于本地视觉核对，不作为 SHOPLINE API 证据。状态仅使用 `NOT_STARTED`、`IN_PROGRESS`、`IMPLEMENTED`、`VERIFIED`、`BLOCKED`。`IMPLEMENTED` 仅表示可访问的本地原型，不表示正式业务完成；`VERIFIED` 必须有同视口截图、交互、测试和回归证据。

| 页面 / 类型 | Shopify 入口 | SHOPLINE 对应路由 | 截图 | 主要功能 / 组件 | 当前实现 / 视觉 / 功能 / 验收 | 未实现、依赖 |
| --- | --- | --- | --- | --- | --- | --- |
| 首页与优惠列表 / 列表 | `/app` | `/quantity-breaks` | `shopify-home-1037.jpg` | 概览、时间筛选、状态标签、搜索、活动表、行操作 | IMPLEMENTED / IN_PROGRESS / IN_PROGRESS / IN_PROGRESS | 指标与真实活动数据、批量操作、分析列和原版状态核验；依赖活动 API |
| 类型选择 / 创建入口 | `/app/deal_blocks/templates` | 尚无独立路由 | `shopify-create-entry-1037.jpg` | 六类优惠模板、品牌色、预览、选择 | NOT_STARTED / NOT_STARTED / NOT_STARTED / NOT_STARTED | 全部模板的目标范围与技术可行性；依赖产品范围决策 |
| 同商品数量优惠创建 / 表单 | `/app/deal_blocks/new?template=quantity-breaks&color=brand` | `/quantity-breaks/new` | `shopify-quantity-create-1037.jpg`、`shopify-quantity-create-settings-1037.jpg`、`shopify-quantity-create-style-1037.jpg`、`shopify-quantity-create-tier-1037.jpg` | 商品范围、设置、样式、阶梯、可选模块、实时预览、草稿/发布 | IMPLEMENTED / IN_PROGRESS / IN_PROGRESS / IN_PROGRESS | 原型缺多种价格模式、完整产品选择器、折叠结构及持久化；依赖活动 API/Function |
| 同商品数量优惠编辑 / 表单 | `/app/deal_blocks/{id}/edit` | `/quantity-breaks/campaigns/:id/edit` | `shopify-quantity-edit-1037.jpg`、`local-quantity-edit-shell-1037.jpg`、`local-quantity-edit-shell-390-top.jpg` | 载入活动、编辑、翻译、预览、保存/发布 | IMPLEMENTED / IN_PROGRESS / IN_PROGRESS / IN_PROGRESS | 与创建共用原型；真实载入、脏表单、并发与发布状态未实现 |
| 商品页优惠组件 / 前台 | 商店商品预览页，原 URL 不写入仓库 | `/quantity-breaks` 内嵌预览；主题扩展尚未接入 | 见 `UI_REFERENCE_ANALYSIS.md` | 档位、价格、推荐角标、Variant、加购 | IMPLEMENTED / IN_PROGRESS / IN_PROGRESS / IN_PROGRESS | 参考商品只有 Single/Duo，独立规格和缺货无参考证据；主题接入、真实加购未实现 |
| Widget 外观配置 / 配置 | 创建/编辑页的“样式”折叠区 | `/quantity-breaks/widget` | `shopify-quantity-create-style-1037.jpg`、`local-widget-navigation-1037.jpg` | 布局、颜色、圆角、间距、字体、实时预览 | IMPLEMENTED / IN_PROGRESS / IN_PROGRESS / IN_PROGRESS | 现有独立页面与原版嵌入编辑页不同，存储/多语言待实现 |
| 翻译 / 配置 | `/app/translations/en` | `/quantity-breaks/translations` | `shopify-translations-en-1037.jpg` | 语言切换、源文案、翻译值、保存/自动翻译 | IMPLEMENTED / IN_PROGRESS / IN_PROGRESS / IN_PROGRESS | 本地仅少量示例字段且不持久化；自动翻译未验证，不得仿称可用 |
| 分析 / 仪表盘 | `/app/analytics` | 尚无路由 | `shopify-analytics-1037.jpg` | 活动/日期筛选、指标、趋势、CSV | NOT_STARTED / NOT_STARTED / NOT_STARTED / NOT_STARTED | 缺事件来源、指标定义、聚合 API 与真实数据 |
| 套餐管理 / 计费 | `/app/plan_management` | 尚无路由 | `shopify-plan-management-1037.jpg` | 月/年套餐、功能对比、订阅 | BLOCKED / NOT_STARTED / NOT_STARTED / BLOCKED | Shopify 计费不可直接搬到 SHOPLINE；需 SHOPLINE 计费能力、商家套餐与授权决策，未操作真实计费 |
| 建议功能 / 反馈 | `/app/roadmap` | 尚无路由 | `shopify-roadmap-1037.jpg` | 建议列表、状态列、投票 | NOT_STARTED / NOT_STARTED / NOT_STARTED / NOT_STARTED | 缺反馈数据服务及 moderation 方案 |
| 设置 / 配置 | `/app/settings` | 尚无路由 | `shopify-settings-1037.jpg` | 通知偏好 | NOT_STARTED / NOT_STARTED / NOT_STARTED / NOT_STARTED | 缺偏好持久化与通知来源 |
| 更多追加销售 / 外链目录 | `/app/other_apps` | 尚无路由 | `shopify-other-apps-1037.jpg` | 其他应用推荐、安装入口 | BLOCKED / NOT_STARTED / NOT_STARTED / BLOCKED | 不能复制 Kaching 自有应用目录或安装链接；需 SHOPLINE 自有产品清单 |
| BXGY / 创建表单 | `/app/deal_blocks/new?template=bxgy&color=brand` | 尚无路由 | `shopify-bxgy-create-1037.jpg`、`shopify-bxgy-tier-1037.jpg` | 分开的 Buy/Get 数量和价格、商品范围、预览 | BLOCKED / NOT_STARTED / NOT_STARTED / BLOCKED | 表单已观察，SHOPLINE 折扣与购物车能力未核实 |
| 混合商品数量 / 创建表单 | `/app/deal_blocks/new?template=collection-breaks&color=brand` | 尚无路由 | `shopify-collection-breaks-tier-1037.jpg` | 跨商品数量阶梯、价格方式、文案、数量选择器 | BLOCKED / NOT_STARTED / NOT_STARTED / BLOCKED | 与一期“单 Product 计数”不同，Function 可行性未核实 |
| 完整套装 / 创建表单 | `/app/deal_blocks/new?template=bundle&color=brand` | 尚无路由 | `shopify-complete-bundle-create-1037.jpg`、`shopify-complete-bundle-tier-1037.jpg` | 每档默认商品、添加商品、逐商品数量和价格 | BLOCKED / NOT_STARTED / NOT_STARTED / BLOCKED | 表单已观察，固定套装购物车与优惠能力未核实 |
| 订阅 / 创建表单 | `/app/deal_blocks/new?template=subscriptions&color=brand` | 尚无路由 | `shopify-subscription-create-1037.jpg`、`shopify-subscription-settings-1037.jpg` | 周期购买、布局及文案；提示安装独立 Kaching Subscriptions 应用 | BLOCKED / NOT_STARTED / NOT_STARTED / BLOCKED | 未操作安装；SHOPLINE 订阅能力及依赖产品未核实 |
| 阶梯赠品 / 创建表单 | `/app/deal_blocks/new?template=progressive-gifts&color=brand` | 尚无路由 | `shopify-tiered-gifts-create-1037.jpg`、`shopify-tiered-gifts-settings-1037.jpg` | 赠品/免运费、解锁条件、显示规则、逐项文案和预览 | BLOCKED / NOT_STARTED / NOT_STARTED / BLOCKED | 表单已观察，SHOPLINE 赠品、库存、运费和结账能力未核实 |

## 覆盖边界

- 一级应用导航已观察：首页、更多追加销售、翻译、分析、套餐管理、建议功能、设置。创建入口由首页按钮进入模板选择；创建/编辑的产品、设置、样式、档位和可选模块在页面内折叠，不属于独立路由。
- 已安全访问上述一级页面及六种模板创建表单，展开关键档位和赠品设置。未通过提交、发布、删除、计费或安装行为探测后续状态。活动详情独立路由未在当前可见入口中发现，不能据此断言不存在。
- 目前没有可证明的 Shopify 后台手机视口截图；不能将其响应式布局标记 `VERIFIED`。参考商品无可观察的多 Variant/缺货状态。
- 本地已有 Quantity Breaks 四类直达 URL；新扩展的分析、设置和其他导航仍未建路由。原型新建活动不持久化，刷新后无法再次载入该活动。
