# 全应用视觉参考

基准日期 2026-10-14，Shopify 嵌入后台 1037 x 929 截图；本地同视口复核需逐页补齐。只参考信息层级、密度与交互，不复用 Kaching/Shopify 品牌图标、专有素材或页面源码。

| 区域 | 参考截图 | 可确认结构 | 尚未确认 |
| --- | --- | --- | --- |
| 首页 | `reference/screenshots/shopify-home-1037.jpg` | 顶部操作栏、通知横幅、评价条、2x2 指标、同页优惠表与状态标签 | 指标后台定义、所有 row menu 状态、手机后台 |
| 创建入口 | `reference/screenshots/shopify-create-entry-1037.jpg` | 每模板纵向卡片、内嵌 Widget 预览、选择按钮 | 六类模板完整表单 |
| 创建与编辑 | `reference/screenshots/shopify-quantity-create-1037.jpg`、`shopify-quantity-edit-1037.jpg`；本地 `local-quantity-edit-accordion-1037.jpg`、`local-quantity-edit-accordion-390.jpg` | 单内容列、折叠区、逐档字段、顶部保存发布、预览 | 删除确认、实际保存反馈、手机后台 |
| 设置与样式 | `reference/screenshots/shopify-quantity-create-settings-1037.jpg`、`shopify-quantity-create-style-1037.jpg` | 密集字段、分组细线、两列控件、布局/色值/字级 | 色板和日期弹层详情 |
| 单档阶梯 | `reference/screenshots/shopify-quantity-create-tier-1037.jpg` | 数量/价格模式/标题/副标题/标签在同折叠区 | 拖拽、复杂变体验证 |
| 其他模板表单 | `reference/screenshots/shopify-bxgy-tier-1037.jpg`、`shopify-collection-breaks-tier-1037.jpg`、`shopify-complete-bundle-tier-1037.jpg`、`shopify-subscription-settings-1037.jpg` | BXGY 分 Buy/Get；混合商品有数量选择器；完整套装逐商品配置；订阅提示独立应用安装 | SHOPLINE 对应能力、发布后的流程 |
| 阶梯赠品 | `reference/screenshots/shopify-tiered-gifts-settings-1037.jpg` | 布局切换、标题/副标题、锁定显示；三个赠品可选免费商品或免运费，设置解锁档、标签和锁定文案 | 真实赠品/运费兑现及更多交互，未保存 |
| 翻译 | `reference/screenshots/shopify-translations-en-1037.jpg` | 页面右上语言下拉，左源文案、右可编辑译文的双列表格 | 自动翻译结果与保存反馈 |
| 分析 | `reference/screenshots/shopify-analytics-1037.jpg` | 时间/活动筛选、指标组、趋势区、CSV | 指标公式与数据状态 |
| 套餐管理 | `reference/screenshots/shopify-plan-management-1037.jpg` | 月年切换、套餐比较与 CTA | 计费动作，未触碰 |
| 建议功能 | `reference/screenshots/shopify-roadmap-1037.jpg` | 多状态列与投票卡 | 提交/投票后的状态 |
| 设置 | `reference/screenshots/shopify-settings-1037.jpg` | 紧凑通知偏好设置 | 保存/通知效果 |
| 更多应用 | `reference/screenshots/shopify-other-apps-1037.jpg` | 产品目录与安装 CTA | 外部安装路径，未触碰 |
| 商品页 Widget | `UI_REFERENCE_ANALYSIS.md` 中实测记录；本轮内置浏览器商品页 | 细线标题、Single/Duo、2px 黑色选中边框、约 8px 圆角、主价格 20px | 多规格/售罄参考状态 |

实测设计值以 `UI_REFERENCE_ANALYSIS.md` 为准：参考 Widget 约 283px 宽，Single 约 75px 高、Duo 约 92px 高；后台控件字体采用 Polaris Inter 回退链，灰白表面和紧凑边线。截图不是组件的 CSS 真值；交互或不可见区域不得从像素臆推。
