# 赠品／捆绑测试分支本地交付审计

日期：2026-11-25。环境：`/Users/SL/Desktop/多件折扣-测试环境/duojianzhekou-test`。Git目标：`https://github.com/TouchFish-Good/Kaching-Bundles-App-Upsells-Test.git`，分支 `codex/gifts-bundles-test`。实施起点 `4f5cc26bf89c83f4e3fd42105cebdf93a65d8fb7`，Task6起点 `fe25e31a1cf274d8ed1891096eb01f037bd86def`。

Tasks1–5本地实现及各次定向复审完成；Task6完成本地跨层测试、标题旧断言对齐、保护审计和交付文档。**Task7最新交互现已完成本地实现与定向验证；最终完整分支独立审阅仍由控制器执行，实店或整个应用尚未验收。** 本批无推送、部署、扩展发布、真实商家元字段/购物车写入。

## 最新用户裁定与本地结果

用户在Task6期间明确：捆绑新旧规则固定1件，商家和买家均无捆绑数量选择器，每规则一个款式槽位；赠品数量配置保留。每个合格主Product为捆绑规则贡献1件额度的独立额度池保持。赠品卡片不显示Included、已包含、随单加入等重复状态字样。捆绑选择/取消使用原生 `input type="checkbox"`，保留单选/多选及锁卡解锁并选择。该要求覆盖两代app-block和共享店铺预览；Task7已完成规范化、保存、投影、Function及UI的一致实现和重新截图；Task4/5截图保留作历史。实际结果见本文件新增Task7段落。

## 当前实现与外部边界

- 活动分别保存gifts/bundles，缺省关闭；赠品累计自动纳入且不可取消，收费捆绑须明确选择。每个真实合格Product贡献一次规则额度，跨款式先合并、不同Product不拼门槛，超量正常价，context不增加额度。单选仅在异常多条明确选择时按实际总减免择优。
- Worker保存、版本2公共响应、紧凑Function投影、认证草稿预览及标题翻译已接入。实际前台目录采用两代主题 `all_products` 和测试专用shop元字段 `qb_test_offers.catalog_v1` 引用索引；不保存价格/库存快照，无额外Storefront Token、公开商品/价格代理或备用transport。
- OS3最终文档化读取是 `shop | get_metafield("qb_test_offers", "catalog_v1")` 后取 `.value`；OS2.1读取 `shop.metafields.qb_test_offers.catalog_v1.value`。OS3原生hundredths按币种精度精确换算；OS2.1使用原生currency subunits（含JPY）。不把未确认价格/可售性当0或可售。
- SSR只是预加载，Worker确定有效期、优先级、订阅、安装状态和活动；浏览器要求campaign/digest/白名单/原生上下文/Function capability一致。OS2.1最多预加载20个不同handle，与主题其他代码共享额度；缺失时附件不可用而主商品可用。
- 复合加购只发一次平铺items批次，隐藏properties使用官方数组格式。不确定结果跨渲染/重挂载/修订保留原事务和锁；只读确认原批次完整身份，精确确认之前不再POST。原v1/关闭模块保持原有请求和主商品路径。
- 实际商家元字段权限/可见性、原生模板与all_products输出、共享handle消耗、Function `sku` 与真实Variant ID/line-total支持、属性回传/拆行、真实购物车和结账均未执行。Function capability默认关闭，不能以本地设为true的合成fixture当平台能力证据。未进行新增OAuth或远程发布验证。

## 原序裁定账本

原8条对应实施ledger的全部 `Ruling:`，顺序保持原样；第9条追加本次测试镜像例外，不改写前8条。原文及精确验证记录保存在[机器证据](2026-11-25-gifts-bundles-verification.json)。最新用户Task7指令是后续明确需求，不能改写为此前已验收决定。

| 顺序 | 决定 | 原因 | 代价／理解错误的成本 |
| --- | --- | --- | --- |
| 1 | 用户开始实施指令授权连续执行本地既定范围，任务之间不重复请求许可；远程操作仍单独受限 | 避免已授权工作反复停顿 | 若边界理解错误会产生越权；因此推送、部署、发布、商家写入始终不执行 |
| 2 | 复用现有独立测试checkout和功能分支，不另建worktree | 遵守用户指定目录，保护正式源码 | 必须保留并逐一审阅现有文档草稿，不能混入或覆盖 |
| 3 | 每任务只本地提交自有文件，不提交其他任务草稿；推送须用户确认 | 提交可独立审核、避免非本批文件混入 | 文档暂分散且需Task6收拢；判断错误会遗漏材料或混入未审文件 |
| 4 | 数量触发的赠品累计；明确tier-ID触发仍按当前最高达到档位语义 | 保持原档位模型，并满足≥2/≥3赠品同时解锁 | 若理解错误，需同步调整客户端与Function的tier-ID资格，不能改数量累计语义 |
| 5 | 所有启用模块配置的附件Product排除出主商品权威集合，包括角色模糊情况 | 防止同Product自触发、循环额度及重复优惠 | 可能拒绝原本希望支持的同Product促销；需实际单位区分能力才能放开 |
| 6 | 按用户要求改用原生all_products和测试shop元字段引用索引，移除临时Storefront transport/凭据依赖 | 官方原生字段可提供主题可售和当前币种价格，无需额外token | 增加幂等发布同步步骤，OS2.1有共享20-handle限制；真实权限不符时附件关闭，不能假称平台可用 |
| 7 | 未发现官方SSR当前时钟时，预加载作用范围相关候选，Worker独自决定有效排期/优先级 | 不猜测now API，避免未来/过期高优先级索引错误压制有效低优先级活动 | 增加原生查找及OS2.1额度耗尽概率；丢失原生数据时附件不可用，主商品继续 |
| 8 | 捆绑每规则/每次加购固定1件，保留此前每个不同合格主Product各贡献1件的购物车额度池 | 区分本次配置/UI数量指令与先前明确的购物车额度示例 | 若理解错误，须同步修改共享核心、Function及结账向量的额度定义；当前不擅自变更已确认额度 |

| 9 | 在既有无凭据ASCII QA镜像刷新source/shared/tests执行定向Worker测试 | 直接Unicode路径的workerd无法加载node:vm；复用Tasks1/3已建立的测试方式 | 控制器明确允许仅合成QA制品例外；不复制.env/.dev.vars/真实TOML、不安装/链接依赖，正式和测试身份配置不变 |

## 本轮真实测试

Node使用 `/Users/SL/.nvm/versions/node/v22.22.3/bin/node`，Go使用 `/usr/local/go/bin/go`。以下只为本地合成数据，SQLite adapter执行真实D1仓储SQL，但不模拟Cloudflare平台全部语义。

1. `PATH=/usr/local/go/bin:/Users/SL/.nvm/versions/node/v22.22.3/bin:$PATH node --test tests/offer-modules/cross-layer.test.mjs`：**5/5通过，exit0**。实际执行保存→本地发布确认→Worker完整公共路由→主题挂载/选择/一次POST→Go easyjson请求解码→EvaluateDiscounts→生成响应编码；没有手填内部Go规则或替代codec。主数量2仅赠品A、数量4为A+B，同时明确选择两个50%捆绑；实际优惠分别20美元/10美元。主量不足、伪造rule不优惠；超额附件和新context不扩额。两个合格Product时实际target为2件，赠品行总减免40/40美元、捆绑20/20美元，`appliesToEachItem=false`。另覆盖标题主动清空、locale隔离、默认英文、关闭模块和不协商v2的原有路径。
2. 对实际Worker源码临时移除gift投影的受控mutation，窄测 **0/1、exit1**，真实Go响应丢失gift target而失败；finally逐字节恢复原源码，SHA256 `d2a22832c963bf02439cfdb25327181125db3d34109f1cb13451a0a9d11463d4`，无产品源码最终差异。新增链路覆盖的是已完成实现；本轮无新增产品逻辑，不将初始fixture错误当作产品RED。新增context探针先按错误行排序预期失败，核对Go稳定行ID分配后固定副本ID排序，并保持精确数量/金额断言。
3. web中 `node --test --test-name-pattern='every non-English storefront language starts|translation preview shows inline|translation hints only' test/storefront-translation-defaults.test.mjs test/translation-preview.test.mjs`：旧断言 **0/3失败**（新标题英语默认、14→16）。按已确认需求修正并增加实际标题输入/清空交互。最终 `node --test test/storefront-translation-defaults.test.mjs test/translation-preview.test.mjs`：**10/10通过，exit0**。既有其他字段仍要求本地化，未整体放松断言。
4. 功能实施前 `4f5cc26` 的干净 `git archive web` 副本中仅运行剩余8项相关断言，**0/8、exit1**，与当前历史失败逐项相符。准确命令、名称、日志摘要见机器证据。未重复已有成功完整套件。

Node22的内置SQLite发出experimental warning，保留未屏蔽；这不是产品异常。Task3曾有Vite HMR端口警告和故意失败fixture诊断；Task4未改动picker测试仍有attachEvent噪声，新offer harness21/21已强制并确认无未捕获异常。测试/编译不证明真实SHOPLINE模板或结账。

## 既有套件证据与失败边界

| 层 | 实际结果及证据 | 当前解释 |
| --- | --- | --- |
| 共享/Express持久化 | Task1定向21/21，D1 2/2；Task3共享/旧版/标题24/24，legacy18/18 | 已运行的本地证据；本轮不重复 |
| Worker | Task3完整56文件539/539；429修复后22/22、typecheck通过 | 后续产品源码未改；不冒称新全量运行 |
| Go | Task2最后完整114通过/1失败，host编译通过 | 失败 `TestOverlappingDiscountNodesExcludeOnlyConflictedProduct` 在Task2修改前已复现；WASM/实际平台未验证 |
| 编辑器/预览 | Task4修复后offer21/21，相关15/15，构建/typecheck通过 | 原全量366/377含3个本功能新增标题对应旧断言，本Task6已修正；剩余8项在实施前独立复现，不把全部11项归为旧基线 |
| 双主题 | Task5原全量123/124；最后修复后定向56/56+legacy3/3 | 原失败 `unchanged default desktop and mobile configuration renders a usable widget` 的10px/8px断言在ce738ec已复现 |
| SLine/资源 | 最终实际工程路径validator exit0、canary exit1定位同一文件、恢复后exit0；core/runtime/两代资源drift通过 | 最终singular get_metafield证据有效；早期root外scratch被跳过的green已作废，不能引用为通过 |
| Express完整 | Task1为146/152 | 六项未修改widget断言失败；基线重跑被runtime迁移中断，只有未改相关文件证据，**不能声称全部独立基线已复现** |

实施前已复现的8项前端失败：

- `server campaign conversion restores missing detailed appearance defaults` — `web/test/campaign-adapter.test.mjs`，#E1E1E1/#C6C6C6。
- `campaign editor separates the internal and checkout discount names and renders coverage detail rows` — `web/test/editor-structure.test.mjs`，旧CSS断言。
- `duplicate quantities in an unsaved draft keep preview radio IDs unique` — 同上，旧radio结构断言。
- `style editor exposes badge placement and separate variant, cart, savings and button controls` — 同上，旧Variant price字段/fixture。
- `test/feedback-board.test.mjs` — Node22 JSON-import `assert`语法解析失败。
- `right corner badges stay in the tier header on narrow previews` — `web/test/variant-display.test.mjs`，旧CSS断言。
- `shows only the selected variant price in a bundle slot header` — 同上，旧markup断言。
- `reserves a readable Recommended column instead of shrinking its label` — 同上，旧IBM Plex Sans断言。

Express六项失败名称（不因本轮范围排除而隐去）：`campaign widget settings default safely and enforce image and color boundaries`；`campaign widget validation checks the independent mobile style configuration`；`campaign widget typography accepts five pixel sizes`；`campaign repository preserves independent widget styles and legacy rows`；`widget validation accepts independent visibility fields and new variant original price styles`；`widget validation remains compatible with legacy comparison visibility`。涉及fixture/default和缺少tierSavingsBadgeRadiusPx，失败仓储测试曾产生SQLite closed-handle异步诊断。

## 参考、实际截图与视觉验收范围

参考是[用户提供的标题开关行](../reference/screenshots/gifts-bundles-section-toggle-reference.png)，不是完整店铺附件卡片。控制器已实际查看Task4/5截图；Task6不声称重新执行页面浏览。完整截图清单见[文件清单](2026-11-25-gifts-bundles-files.md)，截图全部位于本仓库且已由各任务提交。

| 页面/状态 | 参考/改前 | 本地实现/实际交互 |
| --- | --- | --- |
| 编辑器1440/390/320 | [改前1440](../local/gifts-bundles-task4/before-1440.png) / [390](../local/gifts-bundles-task4/before-390.png) / [320](../local/gifts-bundles-task4/before-320.png) | [双模块1440](../local/gifts-bundles-task4/after-1440-offers.png) / [390](../local/gifts-bundles-task4/after-390.png) / [320](../local/gifts-bundles-task4/after-320.png) |
| 启用/折叠/关闭/恢复 | 上述开关参考 | [启用但折叠](../local/gifts-bundles-task4/header-on-collapsed.png) / [关闭](../local/gifts-bundles-task4/header-off.png) / [恢复](../local/gifts-bundles-task4/header-reopened.png) |
| 翻译空标题/轮播 | 原有翻译页 | [标题清空](../local/gifts-bundles-task4/translations-empty-title-1440.png) / [手机轮播](../local/gifts-bundles-task4/carousel-mobile390.png)；[实际交互记录](../local/gifts-bundles-task4/browser-interactions.json) |
| OS3 | [改前1440](../local/gifts-bundles-task5/before-os3-1440.png) | [1440](../local/gifts-bundles-task5/after-os3-1440.png) / [390](../local/gifts-bundles-task5/after-os3-390.png) / [320](../local/gifts-bundles-task5/after-os3-320.png) |
| OS2.1 | [改前390](../local/gifts-bundles-task5/before-os2.1-390.png) | [1440](../local/gifts-bundles-task5/after-os2.1-1440.png) / [390](../local/gifts-bundles-task5/after-os2.1-390.png) / [320](../local/gifts-bundles-task5/after-os2.1-320.png)；[浏览器记录](../local/gifts-bundles-task5/browser-evidence.json) |

Task4为真实本地React、Task5 OS2.1为实际Handlebars模板的helper fixture、OS3为原生DOM合同fixture，均执行实际资源与合成商品/网络。两代400/600/700容器实测1/2/3列，轮播键盘/触摸、重挂载、两个独立block及一次模拟五行八件POST有记录。不是实店模板/真实购物车验收。Task7必须更新控制件相关截图；旧证据保留作前后对照。

## 保护、文件和交付

新鲜只读审计对比runtime迁移后正式基线：725/725 SHA256相同，正式原Git状态逐字一致；测试原6项和扩展9项凭据/身份/配置文件哈希相同。只读取哈希，不输出值。实际origin与上述测试Git URL、分支一致。未修改任何身份、凭据或新增/修改焦点伪类规则。

[完整分支文件清单](2026-11-25-gifts-bundles-files.md)以实施前提交对比当前分支与本地审阅文件，列出每一条新增/修改/删除；[机器证据](2026-11-25-gifts-bundles-verification.json)记录本轮日志摘要、保护结果和原序Ruling。原6份修改+2份未跟踪设计/计划草稿均已检查；24日历史文档仅保留已有的新设计指针，不改写原历史决策。无删除文件、无新产品依赖，本轮仅测试与交付文档。

建议Task6本地提交：`test: verify saved offers across worker theme and Go codec`。最终完整分支审阅和用户推送询问由控制器在Task7完成后执行；没有本批明确推送授权，不能push。


## Task7本地验证（最新）

- 核心/旧SQLite+D1保存读取/公开投影/实际主题批量/Go codec/两代主题定向共88/88，React25/25，Worker6文件102/102（实际ASCII镜像），Go `^TestV2` 通过。赠品大数量及主商品大数量安全测试仍保留；旧买家捆绑数量场景改为旧有效配置固定1件测试。全链复合请求每选中规则只有一个Variant/一件，A+B额度2与重复上下文不增额继续验证。
- 旧值先校验再规范化；非法identity/数量不会变成有效免费项。仓储只在本地读取时规范化，保存时写canonical；无远程迁移。React补齐全启用配件排除主资格。checkbox无重复toggle按钮，native change/checked支持锁卡重新勾选；主题保留原键盘焦点，无focus CSS变更。
- 直接Unicode路径的Worker scoped run启动失败（node:vm，无测试），控制器批准复用已有纯测试ASCII镜像。Express定向9/10，一项既有widget fixture缺tierSavingsBadgeRadiusPx，174ef368仓储源临时还原后单名重现同错并恢复当前文件；不误记为通过。Web build有既有大chunk提示；React测试有既有Vite WebSocket端口提示；Node SQLite实验警告保留。Web/Express build及Web/Worker typecheck通过。未修改模板，SLine模板本轮未重跑；canonical/core/两代资源drift与JS语法通过。
- `docs/local/gifts-bundles-task7`包含20PNG、5JSON与README。两代theme×桌面/移动真实Chromium测试点击、label/触摸、连续Space、单选/多选、locked/recheck、disabled、variant/resize/remount，均执行一POST/五行/八件的合成购物车；两个bundle各一件。React editor/preview也验证Space、触摸、locked/recheck、single/cancel与disabled。展开商家规则截图显示赠品数量2项、捆绑数量0项，两类均保留主商品门槛2项。实际截图逐项人工查看，无横向溢出/页面异常。
- QA仅使用现有Playwright/Chromium；专用5277/5287 server均停止，临时web路由移除。截图脚本曾用URL.pathname导致8PNG落在百分号编码自建目录；已将这8张已知自有PNG移回测试checkout并清理其空目录，脚本改fileURLToPath；未触碰正式资源。早期QA未通过日志与fixture错误在Task7报告如实记录，不当作产品失败/通过证据。
- 无push/deploy/publish或真实商家/购物车写入。根控制器须继续本任务审阅与最终完整分支审阅；真实SHOPLINE边界沿用上述未验证清单。
