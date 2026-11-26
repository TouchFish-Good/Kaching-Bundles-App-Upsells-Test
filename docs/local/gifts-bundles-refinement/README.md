# 2026-11-26 测试环境赠品／捆绑界面修订

本批仅修改 `/Users/SL/Desktop/多件折扣-测试环境/duojianzhekou-test`。目标仓库为 https://github.com/TouchFish-Good/Kaching-Bundles-App-Upsells-Test.git，分支 `codex/gifts-bundles-test`；未提交、推送、部署或操作商家数据。

## 实现与界面证据

- 折叠与启用独立，关闭也可查看／编辑保留的配置。[桌面设置](settings-1440.png)、[手机设置](settings-390.png)。
- 商品总款式数≤5内联勾选，>5使用现有选品弹窗；按钮数量为已选款式数，取消后仍能重新选回。[桌面弹窗](variants-modal-1440.png)、[手机弹窗](variants-modal-390.png)。
- 动态条件显示当前档位编号／名称，提供“及以上／仅此档位／自定义”，沿用真实tierId与现有数量条件。
- 四种布局缩略图与独立轮播开关，PC／手机样式各自保存。区域标题／商品标题／正文／背景／标签颜色、标签字体与位置可配置。透明度只在颜色弹层内，字号／字重没有独立透明度字段。[桌面样式](style-opacity-1440.png)、[手机样式](style-opacity-390.png)、[完整手机色板](color-popover-390.png)。
- 捆绑使用原生复选框且标题只显示一次；赠品自动加入且不能取消。下拉框复用档位样式。默认首个可售款式，已保存款式确定缺货时回退；过滤确定缺货款式，全部确定缺货隐藏商品。未知状态保留错误提示，不当成缺货。
- 已核验身份但缺价时，预览允许捆绑勾选／取消；可信报价、真实优惠和加购仍要求明确可售、可信币种价格及原有能力校验。选中缺价附件时合计显示无法获取。[缺价预览](unpriced-390.png)。

React四布局见 `preview-{stacked,horizontal,grid,list}-{1440,390}.png`；两代原生主题见 `native-{3,2.1}-{stacked,horizontal,grid,list,carousel}-{1440,390}.png`。

参考沿用仓库已保存的 [Shopify设置截图](../../reference/screenshots/shopify-tiered-gifts-settings-1037.jpg)、[开关参考](../../reference/screenshots/gifts-bundles-section-toggle-reference.png)及现有折扣编辑器。布局按用户批准方案复用四缩略图，轮播独立。真实截图检查修复了父级样式造成的radio宽度溢出、弹窗竖排和颜色弹层裁切；保留现有焦点样式。

## 验证

| 范围 | 结果 |
| --- | --- |
| React编辑器／预览回归 | 39/39 |
| Worker附件预览、引用索引、配置、发布及公共响应 | 64/64 |
| 共享规则与原生附件运行时 | 49/49 |
| OS2.1及资源同步回归 | 13/13 |
| D1保存／回读／公开投影 | 1/1，RGBA、cardLayout与轮播保留，展示字段不进入Function规则 |
| Web／Worker TypeScript | 通过 |
| Web生产构建／Worker dry-run | 通过；保留既有Vite语言导入／大包提示 |
| 原生资源漂移、git diff空白检查 | 通过 |

自动化日志保存在测试目录被忽略的 `.superpowers/ui-refinement/`，没有收录真实密钥或会话。Worker测试使用纯源码及测试的ASCII临时副本，绕过workerd中文路径模块解析问题；该副本未包含env、TOML或商家凭证。

浏览器使用Playwright（当前没有Browser插件），实际访问本机受控页面，验证1440px／390px，编辑器及两代主题四种布局、轮播、复选框、缺价与缺货场景，无运行错误、框架遮罩或页面横向溢出。色板HEX位置额外通过命中测试确认未被容器裁切。结构化结果：[React](browser-evidence.json)、[两代主题](native-browser-evidence.json)。这些是模拟数据和本地Handlebars／原生标记，不能替代SHOPLINE实店渲染、购物车或结账验收。

独立代码复审已修复HEX后旧色相缓存、编辑器与渲染默认值不一致以及list布局差异，并完成定向复审。正式环境725个文件及Git状态与保护基线一致；测试环境9项配置／凭证文件哈希一致，见[保护结果](protection-evidence.json)。Function平台能力维持原有未开放状态。

## 预览不可用的原因

原代码将“无法确认市场价格”与“缺货”共用available=false，并据此禁用捆绑。现在保留经认证REST核验的商品／款式元数据，单独查询Admin可售状态；只有已验证的主市场、商店默认币种、国家上下文才返回价格。其他市场、价格缺失、接口失败和限流分别保留原因；不会推算未知汇率或增加Storefront Token。

尚未连接用户的实时诊断页面，本批未把任何具体店铺的Unavailable归因声明为已实测。实店市场上下文、实际API响应、主题渲染、Function与购物车／结账仍需平台验收。

建议提交：`fix(test): refine gift and bundle editor and preview behavior`。待用户批准本批后才推送；完整文件见[变更清单](CHANGESET.md)。
