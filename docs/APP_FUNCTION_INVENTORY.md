# 全应用功能映射

本表将观察到的参考行为与 SHOPLINE 目标、文档、代码、API 和测试分开。参考原版的存在不代表 SHOPLINE 平台支持；`—` 表示尚无实现/证据。`USER_STORIES.md` 在仓库中不存在。

| Shopify 原版功能 | SHOPLINE 目标与范围 | 需求依据 | 本地路由 / 组件 | 后端 / Function | 测试与状态 |
| --- | --- | --- | --- | --- | --- |
| 活动概览、列表、筛选、搜索 | 一期核心，保留状态/排期/范围 | `REQUIREMENTS.md` 活动管理 | `/quantity-breaks` / `Dashboard`, `CampaignList` | 活动 CRUD — | `web/test/home-layout.test.mjs` 静态；浏览器局部手测；未端到端 |
| 创建、编辑、草稿、发布、暂停、删除 | 一期核心，必须持久化及校验重叠 | `REQUIREMENTS.md`、`USER_FLOWS.md` | `/quantity-breaks/new`、`/quantity-breaks/campaigns/:id/edit` / `CampaignEditor`、`CampaignActions` | 仅模板 `/api/products/create`；活动 API — | 本地创建、校验、冲突阻止发布/启用点验；持久化 — |
| 所有/指定商品、分类、排除 | 一期核心，活动范围不可重叠 | `REQUIREMENTS.md` 商品范围 | `CampaignEditor` 样本选择、`coverage.ts` 活跃/计划范围交集 | 商品/分类查询和范围索引 — | `coverage.test.mjs` 覆盖样本交集；分类无法验证时阻止本地保存，真实目录 — |
| 多数量阶梯、四种参考价格方式 | 一期原价 + 百分比/减额/定价；任意数量 | `REQUIREMENTS.md` 阶梯与价格 | `CampaignEditor` 四种本地预览模式；`tier-pricing.ts` 按 Variant 最小单位计算 | `product-discount-customizations/main.go` 空返回 | `tier-pricing.test.mjs` 覆盖基本模式与固定价不涨价；Function 舍入/真实结账 — |
| 同 Product 多 Variant 混购 | 一期核心，按 Product 求和、逐行折扣 | `REQUIREMENTS.md` Variant 混购 | `StorefrontWidget` mock 槽位 | Function 未实现 | `variant-display.test.mjs` 静态样式；真实购物车/结账 — |
| 独立规格、缺货、不同 SKU 价格 | 按商品实际 Options，售罄禁用、库存汇总 | `REQUIREMENTS.md`、`COMPONENTS.md` | `StorefrontWidget` mock 数据 | 商品/Variant API、库存校验 — | 仅静态原型，真实数据 — |
| 主题组件、原子批量加购 | 一期核心，同 Variant 合并，不同 Variant 分行 | `REQUIREMENTS.md` 加购 | 本地预览按钮 | 主题扩展仅模板；真实加购 — | 原子性与失败回滚 — |
| 样式、实时预览、桌面/手机 | 一期核心，编辑表单内统一配置 | `DESIGN_SPEC.md` | `WidgetStudio`、编辑页内预览 | 样式存储 — | 部分静态测试；同视口完整视觉核验 — |
| 前台 11 语言、后台语言下拉 | 一期核心，前台文案在相应配置区 | `REQUIREMENTS.md` 多语言 | `Translations` 示例；后台固定英文 | 翻译存储、locale 回退 — | 仅 `en`/简中 locale 文件；其余九种 — |
| 市场金额与折扣组合 | 一期核心，商品折扣不叠加；订单/运费可选 | `REQUIREMENTS.md` 币种与叠加 | `CampaignEditor` 原型开关 | SHOPLINE 创建自动折扣映射 — | 真实 Function / 结账 — |
| 日期、市场、B2B 和可选模块 | 逐项判断 SHOPLINE 适配 | `SHOPLINE_API_RESEARCH.md` 部分 | 日期原型；其他 — | 平台能力待核实 | — |
| 分析指标、筛选、CSV | 新扩展范围，需真实可归因事件 | 本次用户请求；原参考页 | — | 事件采集/聚合/CSV — | — |
| 套餐管理 | 新扩展范围，需 SHOPLINE 计费 | 本次用户请求；原参考页 | — | 计费 API 未确认 | — |
| 建议功能、通知设置、更多应用 | 新扩展范围，部分为运营服务 | 本次用户请求；原参考页 | — | 数据服务/自有目录 — | — |
| BXGY、混合商品、完整套装、订阅、赠品 | 新扩展范围，须分别做 SHOPLINE 可行性设计 | 本次用户请求；参考模板入口 | — | 未确认 | — |

## 核对结论

当前前端虽有可运行原型，但没有活动数据持久化；现有 `app/src/index.ts` 没有活动接口，`product-discount-customizations/main.go` 未输出折扣，主题扩展未接入真实商品数据。不可将 UI 演示、构建通过或 Shopify 原版可见性称为真实 SHOPLINE 功能完成。
