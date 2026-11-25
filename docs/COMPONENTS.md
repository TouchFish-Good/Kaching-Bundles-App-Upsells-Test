# Component Inventory

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
