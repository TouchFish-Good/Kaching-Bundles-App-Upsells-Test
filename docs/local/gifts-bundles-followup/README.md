# 测试环境赠品／捆绑交互第二轮修订（2026-11-26）

本批仅修改 `/Users/SL/Desktop/多件折扣-测试环境/duojianzhekou-test`。基线提交 `4c5182d142f08b06cfddbc98cb2ccc86fd4fa90e`，测试 Git 为 https://github.com/TouchFish-Good/Kaching-Bundles-App-Upsells-Test.git ，分支 `codex/gifts-bundles-test`。本地验收后用户明确授权“推送并部署”；代码提交 `c1dc66d98273b14d9a7989054d3d98d8474dcb98` 已推送并核验远端SHA。

## 测试发布回执

- 测试 Worker `shopline-quantity-breaks-test`：版本 `aad3b482-d29d-4a3c-8f05-61877849b59f`，100%流量，域名 https://app-test.vswwy.cn 。
- 测试主题扩展 `10949`：2026-11-26 14:28:27（Asia/Shanghai）上传草稿；未提交审核或发布新应用版本。
- 线上健康检查200；首页及HTML引用的两份入口JS与本地构建逐字节／SHA256一致；未授权活动接口401，缺失资源404。
- 4项Secret名称保留，无待执行迁移；正式725文件与Git状态、测试9项身份／配置哈希均与保护基线一致。
- Function源码与能力开关未变；真实平台SSR、购物车和结账仍未验收。以下截图和交互证据为本批本地验收，不能据此声称线上交易已验证。

## 用户要求与结果

| 要求 | 实现与实际验收 |
| --- | --- |
| 模块设备切换 | 复用 `.styleDeviceToggle`，展开样式时在启用开关左侧显示 PC／Mobile，各模块分别配置。 |
| 设置／样式页签 | 整行圆角边框、两项等宽、选中浅紫色，对齐用户参考；折叠与启用仍独立。 |
| 不显示 Choose an option #1 | 卡片可见标题移除，款式下拉仍保留翻译后的无障碍名称。 |
| 自定义触发 | 直接显示当前档位复选列表；不再提供主商品数量条件编辑。历史数量规则打开时不重写，显式选择自定义或操作列表才投影为所选档位。新规则默认选择购买数量≥2的现有档位，无此档位时选首档。 |
| 标签与价格 | 配置标签在角标或标题下方显示；轮播为标签实际高度留白，避免裁切。可信价格展示折扣价、划线售价和节省金额；未解锁可显示预期优惠，实际合计／加购仍不包含未解锁商品。 |
| 锁卡 | 删除标题旁 Unlock · 数量；卡片内容透明度0.5，整卡毛玻璃层和实心锁／Locked。原生按钮支持键盘；点击可达档位解锁并选择捆绑，赠品自动纳入且不能取消；锁卡下方的输入控件禁用。Locked 可在翻译页修改。 |
| 三列与轮播 | 紧凑卡片按100px的最小宽度与配置间距计算，400px容器支持三列；更窄时降列。移动默认一列。轮播与布局分离；首尾按钮禁用并置灰。 |
| 预览 Availability unavailable | 真实只读查询确认 Admin GraphQL 拒绝 REST 普通ID，修复为 typed GID输入，并严格核验返回 ProductVariant／Product GID；应用公开ID保持REST格式。 |

## 根因与证据

1. 旧预览直接将REST Variant ID交给GraphQL，平台返回HTTP200但带 `GID ... domain not as expected` 错误。修复后本地resolver实际请求测试应用的Admin接口，可售商品返回可信USD金额、售罄商品明确为sold_out。只读查询不操作活动、主题、购物车或订单；没有新增Storefront Token或库存猜测。敏感会话导出已删除，详细脱敏日志只保留在被忽略的本地目录。逐个查询还有共享8秒期限导致后续款式未知的问题，改为最多4个并行，共享期限到期或收到429立即停止调度，保留最大的Retry-After。按当前草稿规模选择26个款式的真实只读resolver验证耗时4066ms，26个请求均HTTP200、价格均解析成功、0个unknown；并未据此声称任意200款式都能在8秒内完成。
2. 旧220px最小卡片宽度使400px预览自动降一列；降为紧凑卡片100px阈值后，实际浏览器测得每卡125.33px、三列，移动默认一列。
3. 原生轮播旧Grid百分比轨道在343px容器中把两卡压到165.5px，scrollWidth只有343，无法滚动。改用不收缩的Flex卡片后两卡各343px、scrollWidth698，起点前进可点、终点前进禁用。React轮播也实际验证首尾禁用。
4. 原生轮播初始测量可能发生在挂载前，补充挂载后测量和ResizeObserver，并在重渲染／卸载时清理；角标按实际高度留白。锁定态的展示优惠与当前实际优惠独立。

## 截图与可重现范围

用户参考：[锁卡](../../reference/screenshots/gifts-bundles-followup/locked-reference.png)、[页签](../../reference/screenshots/gifts-bundles-followup/tabs-reference.png)。

- [桌面设备切换与页签](editor-style-desktop.png)
- [移动设备切换与页签](editor-style-mobile.png)
- [移动自定义档位列表](custom-tier-mobile.png)
- [移动价格／标签／复选框](preview-mobile.png)
- [移动最终实心锁层](locked-mobile.png)
- [桌面三列轮播终点](carousel-end-desktop.png)
- [OS2.1移动轮播终点](native-21-carousel-mobile.png)
- [OS3桌面锁卡切档后](native-3-desktop.png)
- [浏览器验收数据](browser-evidence.json)
- [最终验证与环境保护结果](verification.json)

浏览器为CUA控制的真实Chrome，1440×1000及390×844。界面使用本地合成商品目录；OS2.1为本地Handlebars渲染，OS3为本地原生标记。已实际检查视觉、勾选／取消、键盘锁卡控件、触发列表和轮播；Chrome扩展曾报告磁盘不足日志，不属于应用页面异常。真实Admin resolver另以测试应用身份只读验证。没有将本地主题样本标为SHOPLINE平台SSR／真实购物车或结账通过。

## 验证

- 编辑器与React预览：46/46通过（含新增控件、锁卡、三列回归）。
- Worker预览与引用校验：41/41通过（26个预览、15个引用测试），在无密钥ASCII临时镜像中运行。
- 共享规则、原生卡片／优惠及OS2.1：63/63通过；资源同步检查通过。
- Web生产构建及TypeScript通过。Worker dry-run及源码类型检查通过（临时镜像曾出现oauth URLSearchParams类型诊断，以实际测试目录最后检查为准）。
- 全量主题测试146/147；既有 `unchanged default desktop and mobile configuration renders a usable widget` 仍期待8px、当前默认10px，本批未修改此默认配置。全量Web／Worker执行遇磁盘不足（ENOSPC／SQLITE_FULL），不能标为全量通过。
- 独立代码复审及Flex／锁图形增量复查未发现阻止交付的问题。`git diff --check`、新旧资源一致性和正式目录保护检查通过。

## 改动清单与拟提交

新增：`web/src/prototype/offer-module-controls.module.css`、`web/test/offer-editor-controls.test.mjs`、`tests/theme-app-extension/offer-card-presentation.test.mjs`、此验收记录、浏览器证据及截图、两张参考截图。

修改：

- `web/src/prototype/OfferModulePanel.tsx`、`OfferTriggerEditor.tsx`、`OfferPreview.tsx`
- `web/src/prototype/offer-selection.ts`、`offers.module.css`、`storefront-copy.ts`
- `worker/src/services/offer-preview.ts`、`worker/src/db/translations.ts`、`worker/test/offer-preview.test.ts`
- `shared/offer-core.cjs`、生成的 `shared/offer-core.mjs`
- `scripts/theme-offer-runtime.js`、`theme-app-extension/public/app-block.js`／`.css`及生成的compatibility同名资源
- `web/test/offer-editor.test.mjs`、`tests/offer-modules/core.test.cjs`、`tests/theme-app-extension/offers.test.mjs`
- `docs/REQUIREMENTS.md`、`DESIGN_SPEC.md`、`APP_PROGRESS.md`

本批共修改22个文件、新增16个文件。无仓库文件删除，无Function源码、应用key、主题UUID、Function ID、环境变量、迁移或生产文件改动。排除生成的Vite临时文件。拟提交：`fix(test): correct offer availability and refine gift bundle cards`。

## 全量执行失败名称（未标为通过）

主题遗留失败：`unchanged default desktop and mobile configuration renders a usable widget`。

Web全量在磁盘不足时中断，已输出的失败名称如下；前12项明确为ENOSPC，第13项输出中断。这些不取代本批定向验收：

- `published campaign edits preserve active status without requiring pause`
- `server campaign conversion restores missing detailed appearance defaults`
- `deletion polling returns pending on deadline and aborts a hanging read`
- `deletion polling preserves confirmed successes when a later result read fails`
- `collection picker keeps IDs across 50 item pages and restores titles`
- `collection selector keeps its pagination controls in the dialog footer`
- `server ISO schedule displays locally and unchanged input round trips exactly`
- `variantSelectedText color is editable on both devices in every application language`
- `variantSelectedBackground color is editable on both devices in every application language`
- `campaign creation labels exist in all eleven application languages`
- `specified market notices list each selected discount type once in every application language`
- `creation form and style controls follow the selected app language`
- `savings label typography has a localized title in all sixteen application languages`

Worker全量执行也遇ENOSPC／SQLITE_FULL及隔离存储错误，未获得可靠全量结果；涉及entitlements-cancellation、application-request-events、crypto等测试文件。释放本任务临时工具缓存后，仅重跑本批定向套件并保留结果，未将基础设施失败归为产品通过。
