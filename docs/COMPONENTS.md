# Component Inventory

**用户最新交互裁定（Task7已本地验证，取代此前冲突展示约定）：** 捆绑每规则固定1件，新旧配置统一为 `quantity=1`，商家和买家均无捆绑数量选择器，每规则只提供一个款式槽位；赠品配置数量仍可设置。每个合格主Product为捆绑规则贡献1件额度的既有独立额度池语义保持。赠品卡片不显示 Included/已包含/随单加入等重复状态文案；捆绑选择与取消使用原生 `input type="checkbox"`，保留单选/多选配置及锁卡点击解锁并选择。此裁定已在Task7完成本地实现与验证：共享规范化、SQLite/D1读写、公开与Function投影、Go执行、React和两代主题一致；实际本地截图与测试见 `docs/local/gifts-bundles-task7/`。最终独立审阅及真实平台验收仍未完成。

## 测试环境双模块组件（2026-11-25，本地已实现）

翻译字段清单增加`widget.gifts.title`和`widget.bundles.title`，源文本分别为「🎁 Free gifts with your order」「Frequently Bought Together」。复用现有店铺/locale翻译仓储、草稿和预览，不为两个模块维护会覆盖翻译的标题副本；商家配置面板名称与前台标题分开。

模块标题行复用独立展开控件和启用 Switch：左侧箭头/图标/标题，右侧开关，按用户参考还原。`enabled` 进入活动草稿，`expanded` 仅管理配置显示；两种操作不互相触发。关闭保留模块配置，开关事件不折叠标题行；开关不嵌套于展开按钮，使用现有焦点样式。

在样式面板之后依次增加赠品与捆绑商品面板，各自管理配置、商品规则和设备样式。共用卡片/款式选择/网格与单行轮播展示、条件判定和金额工具；赠品纳入引擎自动包含全部达标规则且不提供取消，捆绑选择器支持多选/取消；共享展示实现不共享模块选择限制或编辑状态。购物车映射和 Function 计算需区分 main/gift/bundle 三种角色，防止同款式误合并与重复触发。完整边界与验收以 [测试双模块设计](superpowers/specs/2026-11-25-test-gifts-bundles-design.md) 为准，额度按合格主商品分别贡献，实际数量少于上限仍优惠，跨行不得重复发放。

已完成测试目录内的共享规则、持久化、Worker 原生索引/公开投影、编辑器/翻译页、双主题和复合购物车实现及本地验证；当前状态与截图见[交付审计](audits/2026-11-25-gifts-bundles-local-integration.md)。真实商家模板、元字段、Function ID/金额能力与购物车/结账仍未验收，未推送或部署。

前台目录采用两代主题原生 `all_products`，读取测试专用 shop metafield `qb_test_offers.catalog_v1` 的引用索引。索引不含价格/库存；Worker 决定有效活动，客户端核对 campaign/digest/capability/ID 白名单与原生上下文。无额外 Storefront Token、目录代理或公开商品/价格端点；草稿预览使用认证 Admin 能力，未知价格/可售性关闭该附件。

| 已实现组件/层 | 职责 |
| --- | --- |
| `shared/offer-core` | 规范化、资格、整数金额、每Product额度与单选择优 |
| `OfferModulePanel` / `OfferStyleEditor` / `OfferPreview` | 原保存流程、双设备样式与模拟明细 |
| Worker `offer-config` / `offer-index` / `offer-preview` | 发布引用摘要、公共v2授权、认证草稿预览 |
| `scripts/theme-offer-runtime.js` | 两代主题共享原生目录、持久选择/事务、一次加购与只读确认；生成到既有资源 |
| Go `internal/discount/accessory.go` | 实际购物车身份、额度池、排除附件反向触发与统一金额输出 |

## 应用壳

| 组件 | 职责 | 关键状态 |
| --- | --- | --- |
| `AppShell` | 侧栏、顶部栏、内容容器、移动导航 | `activePage`、sidebar open |
| `PageHeader` | 标题、面包屑、页面操作 | 可选 secondary / primary action |
| `ToastRegion` | 异步成功、错误和撤销反馈 | message、tone、action |

## 活动管理

| 组件 | 职责 | 关键状态 |
| --- | --- | --- |
| `CampaignTable` | 搜索和筛选后的活动集合 | loading、empty、filtered |
| `StatusBadge` | 以文字和颜色显示派生状态 | active/scheduled/paused/ended/draft |
| `CampaignRowActions` | 编辑、停用、删除入口 | menu open |
| `ConfirmDialog` | 不可逆操作确认 | target、pending |
| `CampaignForm` | 创建与编辑活动 | draft、validation errors |
| `ProductScopePicker` | 范围模式和排除项选择 | mode、items、exclusions |
| `TierEditor` | 编辑排序、折扣、标签、推荐位 | tiers、recommended tier |
| `ScheduleFields` | 开始/结束时间与时区提示 | startsAt、endsAt |
| `CampaignOverlapGuard` | 将活动范围展开、与当前/将生效活动比较并显示阻断性冲突 | checking、conflicts、blocked |
| `CurrencyAndCombinationPolicy` | 默认店铺币种、市场金额模式及由金额模式驱动的叠加限制 | currencyMode、marketId、combinationIntent、capability |

## Widget studio

| 组件 | 职责 | 关键状态 |
| --- | --- | --- |
| `StyleControlPanel` | 配置视觉令牌 | style draft、dirty |
| `LocaleTranslationEditor` | 维护活动默认语言与 Widget 文案翻译 | activeLocale、defaultLocale、completion、dirtyLocales |
| `LocalePreviewSelector` | 让商家在同一预览中检查语言和 fallback | requestedLocale、resolvedLocale、fallbackSource |
| `DeviceSwitch` | 切换桌面/移动预览 | device |
| `StorefrontPreview` | 模拟商品页上下文 | device、style、selected tier |
| `QuantityBreaksWidget` | 买家选择档位并展示价格 | selected tier、adding |
| `TierOption` | 一个可访问的单选档位 | selected、recommended、tag |
| `VariantBundleComposer` | 在当前选中档位卡内管理按档位数量显示的独立 Variant 槽位 | slots、tier quantity、validation |
| `VariantSlot` | 一件商品的 option 选择和当前 SKU 摘要 | selected options、matched variant |
| `OptionSelector` | 从产品 option 元数据渲染可换行的 swatch/button/dropdown/Variant Image tiles | style、option values、disabled states、image size、image radius、color caption |
| `BundlePriceSummary` | 汇总不同 SKU 的原价、预计折扣和折后总价 | lines、tier、pricing preview |
| `BundleAddState` | 加购中、成功、部分失败、失败反馈 | pending、result items |

## 组件边界

业务数据以后通过 `CampaignRepository` 和 `WidgetConfigurationRepository` 注入。展示组件只接收明确定义的 view model，不直接读取 API 或 SHOPLINE 全局对象；优惠计算则属于独立的 `PriceEngine`，需以整数最小货币单位作为输入输出。

Variant 选择进一步依赖 `ProductVariantCatalog`：它提供 `options`、`variants`、可售状态、库存和本地货币价格。`VariantBundleComposer` 只输出已解析的 `BundleSelection[]`；`BundleCartMapper` 再按 `variantId` 分组为购物车行。Function 读取的 cart line 是最终权威输入，不能信任前端预览总价或隐藏字段。

`CampaignOverlapGuard` 只能对本应用持久化的活动做确定性阻止；它不能凭空检测未授权的第三方优惠规则。`CurrencyAndCombinationPolicy` 必须把平台能力状态传入 UI：市场金额未开通时禁用配置；`presentmentFixedAmount` 时所有叠加控件均为只读关闭；店铺币种模式下可将 Order / shipping 选择映射至已确认的 Function 自动折扣叠加配置。

翻译数据应以活动默认语言和 `WidgetTranslation[locale]` 分离存储，而不是复制整份活动配置。`WidgetTranslation` 只包含可见文案；价格、Product/Variant 数据和 Function 规则保持语言无关。`LocalePreviewSelector` 使用确定性的 locale 解析器，返回 `requestedLocale`、`resolvedLocale`、`fallbackSource`，使预览和 storefront 的回退语义一致。
