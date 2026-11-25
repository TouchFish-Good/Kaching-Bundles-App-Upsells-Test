# OS 2.1 / OS 3.0 双版本主题组件实施计划

状态：用户已授权本地实施，并在确认线上缺少shopId适配后明确授权本批推送与Cloudflare部署。SHOPLINE主题扩展由用户自行发布。
基线：main / de379fe；保留既有反馈测试修改及 web/qa-preview-stock.*。

## 目标和边界

按 SHOPLINE 官方迁移指南，在同一个扩展中保留 OS3 SLine blocks/public/i18n，新增 OS2.1 compatibility/blocks/assets/locales。不重设计 UI，不改变结账 Function、活动优先级、库存和订阅规则，不发布 SHOPLINE 扩展。复用同一 JS/CSS/36 种翻译源，通过确定性同步和检查避免版本漂移。

OS2.1 使用文档明确提供的 shop.id，由 Worker 解析已安装商家；不在主题输出任何凭据。由于 product.collections 仅覆盖线上渠道，2.1 分类活动通过 Admin collects?product_id 查询当前归属；仅有需要匹配的分类活动时查询，指定商品优先，失败不使用旧快照。查询限定页数、超时、缓存容量并合并进行中的请求。现有 OS3 主题分类上下文和旧请求兼容行为保留。

## 执行步骤

1. 添加实际 Handlebars 渲染和挂载测试（五组规格、转义、多语言、缺货隐藏、金额、商店身份），观察失败。
2. 实现 OS2.1 模板、共享资源同步脚本及漂移检查，维持 OS3 资源源文件。
3. 添加 Worker 2.1 身份解析/动态分类测试，观察失败；实现限定范围的服务端适配。
4. 测试主题动态插入后的初始化，复用现有购物车协议；不承诺所有主题的抽屉事件兼容。
5. 运行主题和 Worker 全量测试、类型检查及 dry-run；本地真实渲染模板进行桌面/移动截图，与同数据 OS3 对照。记录既有失败，明确真实 OS2.1 平台验收尚未执行。
6. 整体独立审查并修复重要问题；更新 APP_PROGRESS、发布/验收说明，列出文件及提交消息，请求本批 GitHub 推送授权。

## 依据

- 官方 migration-guide-from-os-2-1-to-os-3-0 文档：compatibility 双目录布局。
- Handlebars product / variant / shop / localization / asset_url / image_url / t 文档。
- Admin REST GET /products/collects.json（v20260601）：product_id、limit 1–250、page_info 与 Link。
- 2.1 framework 旧链接已返回 404；本地 Handlebars 渲染不等同 SHOPLINE 平台编译验收。

## 记录

- 基线主题测试 71/72；既有失败为默认圆角实际 10px、旧测试断言 8px。本批不改用户默认值。
- Ruling: 在当前已部署分支工作，保留未提交用户文件，不建隔离副本；用户要求基于当前版本实施。
- Ruling: 2.1 不将 product.collections 标为完整；增加服务端有限查询，代价是首次分类展示增加一次或多次 Admin 读取，缓存 60 秒内可能存在延迟。

## 本地执行结果

实施步骤 1–6 已完成本地部分，平台真实验收待扩展发布。最终 Worker 429/429；主题78/79，唯一失败与修改前基线相同（圆角10px/旧断言8px）。新增 OS2.1 主题7项和 Worker11项通过；类型、dry-run、资源漂移与 SLine 检查通过。Chromium 桌面/移动对照截图相同，受控加购只写一次，无运行异常。独立审查的同店限速/冷却、生命周期监听清理和孤立语言检测已落实，补充失败后重新插入原节点的回归。详细记录在 APP_PROGRESS.md 和 THEME_OS21_COMPATIBILITY.md。

本批提交建议：feat(theme): add SHOPLINE OS 2.1 app block compatibility。仅本地更新，等待本批明确推送授权；不得包含既有反馈邮件断言修改和 web/qa-preview-stock.*。

### 用户授权的 locales 定向优化

此前逐字节复制全部 OS3 i18n 文件到2.1的方案，仅能保证文件一致，不能证明编辑器或平台解析兼容。按官方迁移指南调整：只复制36份前台语言JSON，同时生成2.1 schema.locales；不再复制36份OS3编辑器.schema.json，2.1编辑器名称使用共享英文品牌名，3.0多语言名称保持。静态翻译源和商家保存的覆盖翻译均不重生成。

新增实际同步脚本测试：产物生成/变量保留、内嵌翻译漂移的只读检测、旧生成文件迁移/自定义保护、缺失键及100KiB UTF-8体积拦截。先在旧脚本与旧schema上观察6项失败，再修正。原有2.1渲染测试改读compatibility/locales，并核对36种内嵌翻译。真实平台解析、默认语言回退、编辑器多语言仍明确待验收，不将本地成功当成上线支持。


### 平台编译反馈补正

用户实测2.1平台schema拒绝 templates:["product"]。兼容模板改为 products/detail，3.0仍为product；补充双版本schema回归。15/15定向通过，资源检查通过；主题全量79/80，唯一旧圆角断言失败未变化。此前JSON格式检查未覆盖平台枚举，未把本次本地修正宣称为平台编译通过。推送建议沿用本批 feat(theme): add SHOPLINE OS 2.1 app block compatibility。
