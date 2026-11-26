# 2026-11-26 测试活动索引写入确认修复（已推送部署）

- 只读测试店铺确认 SHOPLINE 已保存 `qb_test_offers.catalog_v1`，但返回 JSON 对象键顺序与构造顺序不同；原字符串比较误报 `Offer index write was not confirmed.`。改为递归比较 JSON 内容，应用于幂等判断、写响应及写后回读；数组顺序、内容、身份与租约校验保留。
- 回归先复现2项同一错误，修复后索引／发布28项通过；真实响应本地回放确认旧比较失败、新 writer 读取后确认且0次写入。Worker类型检查、dry-run、隔离5项及diff检查通过，测试仍使用既有无凭据英文镜像。
- 用户批准后，修复提交 `3e8ccc84db40fcf9660b665a879588d4dfaf4309` 已推送至测试Git的 `codex/gifts-bundles-test`；测试Worker版本 `4dfda018-465b-4db4-82c4-85e54a30c391` 承接100%流量，域名 `https://app-test.vswwy.cn`。线上健康200、首页及入口资源与本地一致、未授权活动接口401、缺失资源404；全部绑定与上一版本一致，保留4项Secret名称及测试App／Function／D1身份。正式725文件与Git状态、测试其余8项身份／凭据及当前Worker配置保持一致。无商家活动／元字段写入，无主题／Function／前端修改；真实活动更新仍待用户重试，详见[本批审计](audits/2026-11-26-test-offer-index-confirmation.md)。

# 2026-11-26 测试活动发布能力配置修复（已推送部署）

- 发布报错来自应用自身能力检查；测试 Worker 未配置 `SHOPLINE_OFFER_FUNCTION_CAPABILITIES`。根据用户指定桌面 `Discount Function` 接口表及指引，核对 sku 为款式 ID、目标数量上限、逐行固定金额和一致 appliesToEachItem 规则；保留校验，只为测试店铺 `buchaqian` 与现有测试 Function 增加配置。
- 合作伙伴后台只读确认 Function 草稿正在运行，ID与配置一致；本地实际运行现有 WASM验证赠品／捆绑额度、行级金额、款式拒绝及锁定条件。配置隔离5/5、发布／索引24/24、实际配置调用能力检查和Worker dry-run通过；中文路径运行器失败已记录，24项在无凭据英文镜像执行通过。
- [本批审计](audits/2026-11-26-test-offer-function-capability.md)记录来源、WASM哈希与限制。用户批准后，修复提交 `72cfb84676e2a0a08908913c2efe032f3c9fe596` 已推送至测试Git的 `codex/gifts-bundles-test`。测试Worker版本 `cf25f84d-3324-4181-9ec8-29cd8c1bd993` 已承接100%流量，回读确认仅目标测试店铺能力配置生效。健康检查／首页资源校验通过，4项Secret名称保留，正式725文件／Git状态和其他8项测试身份配置不变；没有真实活动／购物车／订单写入。用户实际重试发布、实店计价／结账及市场金额白名单仍待验收。

# 2026-11-26 测试环境赠品／捆绑第二轮交互与GID修复

- 发布回执（2026-11-26）：测试 Worker `shopline-quantity-breaks-test` 版本 `aad3b482-d29d-4a3c-8f05-61877849b59f` 已部署，100%流量；域名 `https://app-test.vswwy.cn`。测试主题扩展 `10949` 于14:28:27（Asia/Shanghai）上传草稿，未发布应用审核版本。线上 `/health` 200、首页及两份入口JS哈希与本地构建一致、未授权活动接口401、缺失资源404。4项Secret名称保留，无待执行迁移；正式725文件／Git状态及测试9项身份配置均与基线一致。Function未改动，能力开关保持原状态；真实店铺SSR、购物车与结账仍未验收。

- 按用户9项反馈完成设备切换位置、浅紫整行页签、档位自定义列表、可见选项文案移除、标签／三金额、全卡毛玻璃锁层与点击切档、三列及轮播边界；颜色透明度继续只在颜色选择器内。赠品自动纳入／不可取消、捆绑固定1件／复选框、主商品额度及Function能力开关保持。未新增或修改焦点伪类。
- 实际测试店铺只读接口确认REST数字ID被Admin GraphQL拒绝；typed GID输入和完整GID归属核验修复后，本地resolver返回可售／售罄和可信价格。同一8秒期限下改为最多4个并行，429同步停止排队并保留最大Retry-After；真实26款式4.066秒全部取得可售／缺货及价格、0unknown。无Storefront目录代理、额外token或库存猜测。
- CUA真实Chrome验证1440px／390px编辑器及React／原生主题样本：400px三列、移动默认单列、锁卡切档并选中、复选框取消、标签和三金额、页签／档位列表、首尾轮播禁用。发现原生Grid百分比轨道将两卡压入一屏，改用Flex后343px容器scrollWidth698；OS2.1与OS3本地主题交互已实际访问。参考、截图与范围见[本批记录](local/gifts-bundles-followup/README.md)。这不是线上已部署验收，也不是平台SSR／购物车／结账验收。
- 定向测试150项通过（编辑器46、Worker41、共享／原生／OS2.1共63）；Web／Worker构建（Worker dry-run）及源码类型检查、主题同步与diff检查通过。全量主题146/147，遗留默认间距8px／10px断言失败；全量Web／Worker遇ENOSPC／SQLITE_FULL，未标全量通过；临时镜像oauth类型诊断在真实测试目录类型检查中未复现。本地清理本任务下载的Go／TinyGo编译工具缓存后恢复定向检查，未删除用户文件。
- 独立复审及Flex／锁图形复查无阻断发现。正式目录725文件及原Git状态一致，测试9项身份／配置哈希一致；没有正式源码、Function源码、密钥、迁移或商家数据写入。用户明确授权“推送并部署”后，代码提交 `c1dc66d98273b14d9a7989054d3d98d8474dcb98` 已推送至测试Git `https://github.com/TouchFish-Good/Kaching-Bundles-App-Upsells-Test.git` 的 `codex/gifts-bundles-test`，远端SHA已核验。

# 2026-11-26 测试环境赠品／捆绑界面与预览修订

- 仅在测试仓库修改；折叠与开关独立，款式≤5内联、>5复用弹窗，动态档位条件、复用档位下拉框、四布局缩略图与独立轮播、颜色选择器内透明度、区域／商品／标签样式及标签位置已实现。捆绑复选框标题仅一处，单选保留最大可信减免，赠品自动加入且不可取消；捆绑固定1件不变。
- 预览明确区分可售状态与价格上下文，缺价允许演示捆绑勾选但不产生可信报价／实际加购；只隐藏确定缺货款式，所有白名单款式确定缺货隐藏商品，失效选择回退首个可售款式。无Storefront Token或价格推测。新增控件文案覆盖现有16种后台语言。
- 本地验收仅覆盖本批页面／流程。已保留参考与1440px／390px编辑器、React预览及OS3／OS2.1主题截图；浏览器实际检查弹窗、透明度、四布局、轮播、勾选／取消、缺价与缺货，无页面横向溢出／框架错误。独立复审修复色相缓存、控件默认值和list差异；截图回查修复radio宽度、弹窗列布局及色板裁切。
- 本批定向测试166项通过（React39、Worker64、共享／原生49、OS2.1／同步13、D1投影1）；Web／Worker类型检查、生产构建／dry-run和资源漂移检查通过。
- 检查结果及完整文件清单见[本批验收记录](local/gifts-bundles-refinement/README.md)。真实SHOPLINE实店API、主题渲染、Function、购物车及结账仍未验收，平台能力保持原状态，不将本地模拟数据写为平台验证完成。
- 正式环境725个文件及Git状态、测试环境9项配置／凭证哈希与保护基线一致。本批未提交、推送、部署或写入商家数据，待本批推送确认。目标：`https://github.com/TouchFish-Good/Kaching-Bundles-App-Upsells-Test.git`，分支`codex/gifts-bundles-test`；拟提交`fix(test): refine gift and bundle editor and preview behavior`。

# 2026-11-24 赠品与捆绑商品设计存档（仅文档，未实施）

- 按用户要求，将已讨论的多商品独立赠品优惠、触发条件、单选／多选建议、锁定内容0.5透明度和点击切档解锁、样式／多语言／明细交互存入独立设计；在DESIGN_SPEC与REQUIREMENTS添加入口和历史一期范围说明。额度作用域、固定数量、异常单选冲突等尚未明确的选择单列，不当作已确认业务规则。
- 补充现有公共活动接口的能力协商／版本／gifts字段，以及拟新增的白名单赠品目录和按需市场价格接口、JSON示例、分页与限流、可售和价格来源、隐藏行属性／复合身份／不确定结果只读确认、Function v1/v2／数量分配／全局币种输出及发布顺序。
- 按后续要求完善1／2／3列布局：两端独立配置、实际容器宽度降列、横／竖卡片、长文案／标签／图片／多件规格／价格换行、末行与RTL顺序、局部占位和状态保留；同步布局JSON、默认合并、公共接口、两主题兼容与Function排除规则。默认值和响应阈值标为建议，未冒充已确认或已实现。修正锁定卡的语义，避免按钮嵌套下拉框；补充删除规则、移除款式、修改档位及布局变更的边界和验收矩阵。
- 只读核对两主题模板和公共脚本，记录OS2.1 shopId／products/detail／legacy cart与OS3 SLine／ThemeEvent／notification差异；指出现有cartLineKeys仅匹配无属性行、cartQuantities按Variant归并、逐行事件复用主Product身份等未来必须调整的点。记录官方AJAX全文与Storefront字段检索依据，不将新增接口、目录凭据、属性透传或平台结账写为已验证。
- 保留用户卡片参考和此前编辑器讨论方案两张设计图片；标明只覆盖早期单列讨论，均非生产验收截图。已检查6个JSON示例可解析、配置／公开响应布局示例一致、10组文档列数边界计算、4处新增本地文档／图片链接有效、代码围栏闭合及git diff --check；未运行无关应用测试，也未把文档计算或检查标为页面／平台联调通过。
- 本批仅修改DESIGN_SPEC.md、REQUIREMENTS.md、APP_PROGRESS.md，新增独立设计Markdown和两张参考PNG，无删除；无应用／主题／Function源码、配置、迁移、发布或商家数据操作。建议提交docs: design gift bundles across editor, storefront and discount function；尚未提交、推送或部署，等待本批文档的Git推送确认。

# 2026-11-23 发布用户订阅套餐页面CSS调整

- 用户明确要求推送并部署最新plan.css，完整保留subscription-plan__actions的width:100%、底部联系信息font-weight:900与空白格式调整；无业务代码、数据库迁移或焦点伪类改动。
- 生产构建及git diff检查通过，保留既有语言导入和大包提示；纯样式更新未新增或重复运行无关业务测试。本地Chrome/Playwright使用受控订阅响应验证1440×1050、390×1100：按钮与内容区宽度分别同为704px/318px，底部联系信息字重900、居中及#4f46e5，语言切换正常，无横向溢出、空白、框架遮罩或运行错误。
- 参考/private/tmp/qb-plan-css-before-1440.png，截图/private/tmp/qb-plan-css-after-1440.png和/private/tmp/qb-plan-css-after-390.png，浏览器记录/private/tmp/qb-plan-css-qa.json。未发送邮件或操作真实店铺订阅。
- 本批仅用户plan.css及本进度文件，无新增/删除文件；保留并排除用户shopline.app.多件优惠.toml修改。已获本批推送并部署授权，沿用main，提交信息style(web): refine subscription plan button and support text；实际Git提交、Worker版本及线上资源检查以本次发布回执为准。

# 2026-11-23 订阅套餐页面联系邮箱与用户样式发布

- 用户要求在subscription-plan__features下方增加“有问题随时联系：appideasbox@gmail.com”，居中且颜色#4f46e5，并明确要求其plan.css修改一起推送并部署。新增独立联系段落及mailto链接，支持16种应用语言；保留用户action的justify-items:center及试用提示的#4f46e5/900字重。无焦点伪类、订阅请求或业务规则调整。
- 现有订阅页面5/5测试与生产构建通过，保留既有语言导入及大包提示。本次低影响展示调整未新增测试；浏览器直接验证邮箱、mailto目标、实际颜色与排版。磁盘剩余68MiB时清理44个超过30分钟且已停止使用的Vite deps_temp缓存目录后继续，未清理源码或用户文件。
- Browser插件未提供，使用已安装Playwright/本机Chrome，以受控订阅响应访问真实React页面。1440×1050和390×1100均确认联系信息在功能列表下方、text-align:center、文字及链接rgb(79,70,229)，无横向溢出、空白、框架遮罩或运行错误；中文→英语→日语切换正常。未实际发送邮件或操作真实店铺订阅。
- 参考/private/tmp/qb-plan-contact-before-1440.png；本地截图/private/tmp/qb-plan-contact-after-1440.png、/private/tmp/qb-plan-contact-after-390.png；验证记录/private/tmp/qb-plan-contact-qa.json。只新增已确认的底部联系信息，并保留用户提交的样式效果。
- 本批修改web/src/pages/quantity-breaks/plan.tsx、plan.css、web/src/prototype/subscription-messages.ts与本进度记录，无新增/删除仓库文件；用户已授权本批推送并部署，沿用main，提交信息feat(web): add subscription plan support contact。保留并排除用户shopline.app.多件优惠.toml修改；实际提交、Worker版本与线上资源检查以本次发布回执为准。

# 2026-11-23 首次使用试用说明与订阅入口文案

- 根据用户补充，将套餐卡片提示改为“首次使用可免费试用 7 天，点击下方订阅按钮选择试用。”；同步现有16种应用语言，保留原位置及样式，不调整订阅按钮、实际试用资格或SHOPLINE购买流程。
- 更新已有页面回归的提示断言，先确认旧文案不满足预期，再修改消息资源；订阅页面5/5测试与生产构建通过，保留原语言导入及大包提示。未运行无关测试或操作真实店铺。
- 本地Chrome/Playwright访问localhost:4199/quantity-breaks/plan，受控订阅数据下验证1440×1050与390×844显示、中文/英语/日语切换。手机提示正常换行，无横向溢出或运行错误，订阅按钮保留。参考/private/tmp/qb-plan-trial-copy-before-1440.png，截图/private/tmp/qb-plan-trial-copy-after-1440.png与/private/tmp/qb-plan-trial-copy-after-390.png，记录/private/tmp/qb-plan-trial-copy-qa.json。
- 本批仅修改web/src/prototype/subscription-messages.ts、web/test/subscription-plan.test.mjs与本进度文档，无新增或删除仓库文件。保留并排除用户shopline.app.多件优惠.toml修改；用户已明确授权本批推送并部署，沿用main，提交信息docs(web): clarify first-use trial instructions，实际Git提交与Worker版本以本次发布回执为准。

# 2026-11-23 订阅页面免费试用提示

- 用户确认在套餐价格下方、订阅按钮上方显示“免费试用 7 天”。套餐卡片复用subscriptionPlanUi.trialAction的16种应用语言，不新增接口或修改SHOPLINE订阅、续费、支付返回核验逻辑；只新增一条提示样式，未修改焦点伪类。
- 更新已有页面测试中“不显示试用提示”的旧断言，先观察缺少提示导致失败，添加提示后订阅页面5/5回归通过；生产构建通过，保留既有语言导入及大包提示。未扩大运行无关前端全量测试。
- Browser插件未提供，使用已安装Playwright与本机Chrome访问本地真实React订阅页面（受控订阅响应）。1440×1050桌面、390×844手机均显示提示且无横向溢出、空白或框架错误；切换简体中文→英语→日语→简体中文，提示同步更新，原订阅按钮仍显示。临时预览favicon缺失产生404，确认来源后由验证脚本返回204，最终无页面运行错误。未执行真实店铺订阅或购买。
- 参考截图/private/tmp/qb-plan-trial-before-1440.png；本地截图/private/tmp/qb-plan-trial-after-1440.png、/private/tmp/qb-plan-trial-after-390.png；浏览器结果/private/tmp/qb-plan-trial-qa.json。原布局保留，提示按已确认位置增加，无其他视觉调整。
- 本批修改web/src/pages/quantity-breaks/plan.tsx、plan.css、web/test/subscription-plan.test.mjs与本进度文件，无新增/删除仓库文件。保留并排除用户原有shopline.app.多件优惠.toml修改；用户已明确授权本批推送并部署，沿用main，提交信息feat(web): show localized seven-day trial hint on plan page，实际Git提交与Worker版本以本次发布回执为准。

# 2026-11-23 启用与禁用确认弹窗文案调整

- 按用户指定更新简体中文启用确认标题为“立即启用已选活动？”，正文为“将立即启用 {{count}} 个活动。”；单条与批量启用复用同一组消息，数量沿用实际选中项动态替换。
- 禁用确认同步改为“立即禁用已选活动？”与“将立即禁用 {{count}} 个活动。”，沿用现有单条/批量确认入口和动态数量。
- 现有应用多语言回归6/6通过；直接加载最终消息模块确认启用/禁用标题及1/3项数量替换符合指定文案。未执行真实商家启用/禁用或实店弹窗验证。
- 仅修改两份消息资源与本进度记录，不调整启用请求、排期、样式或其他语言文案。用户已明确授权本批推送并部署，沿用main，提交信息fix(web): clarify enable and disable confirmations。保留并排除用户原有 shopline.app.多件优惠.toml 修改；实际提交与Worker版本以本次发布回执为准。

# 2026-11-23 未来开始活动启用后回退待生效

- 只读查询生产D1确认存在内部status=active、publication=active但startsAt在未来的活动（rows_written=0，未更改商家数据）。前端按已发布+未来startsAt显示Scheduled；状态接口isScheduled却要求内部status严格为scheduled，导致这类活动点击启用直接返回already_active、未发出更新开始时间请求。提交等待结束后原始active响应短暂显示生效，再次读取带平台状态后按未来时间重新显示待生效。
- isScheduled统一识别已发布、平台已确认active且startsAt在未来的active/scheduled活动，沿用既有更新同一折扣排期分支。启用将开始时间设为当前时间，保留折扣ID、原结束时间/永不过期设置及覆盖范围校验。共享的未来活动禁用分支也覆盖内部active的未来活动，沿用原开始时间调整与10秒后失效语义；未改其他启动、删除、重建、订阅或页面样式逻辑。
- 扩展路由回归：单条/批量×内部scheduled/active四种未来活动启用，断言实际更新请求、无创建、保留结束时间/neverExpires以及后续列表读取仍为当前开始时间和active。旧代码两个active场景按预期失败（旧未来开始时间未改、批量already_active）；修复后通过。禁用回归扩为单条/批量×内部scheduled未来、active未来、active当前六种，检查原禁用中响应与排期请求。
- Worker全量50文件460/460通过，类型检查、Worker dry-run与git diff --check通过。测试使用受控SHOPLINE接口与真实D1持久化；未在真实商家执行启用/禁用，未声称线上已修复。无前端业务文件、主题、Function、数据库迁移或CSS修改。
- 本批修改worker/src/routes/campaigns.ts、worker/test/routes-contract.test.ts和本进度文件，提交信息为fix(worker): recognize future starts when enabling published campaigns。用户已明确授权本批推送并部署；保留并排除用户原有shopline.app.多件优惠.toml修改。实际Git提交与Worker部署版本以本次发布回执为准。

# 2026-11-23 发布用户批量按钮与排期控件 CSS 更新

- 用户要求推送并部署其 quantity-breaks.module.css 修改：永不过期label改为flex、5px间距及居中；批量栏去背景，按钮padding改为0 20px并更新阴影、启用蓝底、禁用白底红框和删除红底。完整保留用户样式值，无业务源码、数据库迁移或焦点伪类修改。
- 本地Chrome以真实页面和受控商家数据核验多选后四个按钮显示与颜色，工具栏背景透明、按钮padding:0px 20px；进入创建页读取永不过期label为flex/gap:5px/align-items:center，取消勾选后结束时间启用。参考截图/private/tmp/qb-css-controls-before.jpg，更新截图/private/tmp/qb-css-controls-after.jpg及/private/tmp/qb-css-schedule-after.jpg，已查看更新效果。未保存活动或操作真实商家，不将本地样式检查标记为实店业务验收。
- 本批纯CSS发布，前端生产构建通过，不新增或重复运行无关业务测试；沿用main，仅提交用户CSS和本进度记录。拟提交style(web): refine campaign controls and schedule alignment。用户已授权推送部署，实际Worker版本、Git提交与线上资源校验以本轮回执为准。

# 2026-11-23 禁用提交后短暂回显生效中的修复（已获本批推送部署授权）

- 根因：changeCampaignStatus 的普通活动和待生效活动 pausing 分支直接返回 finishPausePending 的原始活动配置；该配置 status 仍为active/scheduled，遗漏 publication 的platformOperationState、platformState和platformDiscountId。前端提交时的本地Disabling结束后合并该响应，就暂时回退生效/待生效，直到下一次列表读取补齐pausing。
- 两个分支完成持久化后复用 campaignResponse(getProjection(...))，使单条/批量接口直接携带禁用中与平台折扣关联。保留原同一折扣设置ends_at约10秒后失效、只读确认轮询、部分失败反馈；未改变禁用/启动/删除业务规则、CSS、主题、Function或数据库。
- 路由集成先复现单条/批量×生效/待生效四项缺失状态字段失败，修复后4/4通过。扩大原待生效排期测试并保留同一时钟生成starts_at/ends_at断言。页面新增真实React/DOM回归：提交返回后延迟后续查询，状态保持Disabling且禁止重复操作，确认后显示Ended，仅发出一次禁用写入。
- Worker全量50文件455/455通过，类型检查、Worker dry-run与git diff --check通过；前端相关5/5通过，其余31项未执行，未重复运行已知有历史失败且曾耗尽磁盘的无关前端全量。以上使用受控SHOPLINE响应和本地DOM验证，未禁用真实商家活动，不声称线上已修复。
- 本批4份文件：worker/src/routes/campaigns.ts、worker/test/routes-contract.test.ts、web/test/startup-resilience.test.mjs与本进度记录，无新增/删除仓库文件。拟提交 fix(worker): preserve pending disable state in status responses；用户随后明确要求推送并部署，沿用当前main；发布前复核四个禁用接口场景及延迟查询页面回归并重新构建前端。实际提交、Worker版本和线上检查以本批发布回执为准。

# 2026-11-23 发布用户活动列表 CSS 更新

- 用户明确要求推送并部署 quantity-breaks.module.css：完整保留标签间距30px、选中蓝色下划线、工具栏下边距10px、黑色表头及去背景、批量栏12px间距与#f6f6f6背景、批量按钮配色和禁用/删除外观。无业务代码、数据库或焦点伪类改动。
- 本地 Chrome 使用真实活动页与受控 API，多选两条记录后核对标签、表头和四个操作按钮正常显示，读取到批量栏 gap:12px、背景rgb(246,246,246)及对应按钮配色。参考 /private/tmp/qb-toolbar-updated.jpg，本次截图 /private/tmp/qb-campaign-css-updated.jpg。未操作真实商家活动；本次为纯样式发布，不新增或重复运行无关业务测试。
- 前端生产构建通过，保留既有大包与语言导入提示。本批仅用户CSS与本进度记录，沿用main；拟提交 style(web): update campaign tabs and bulk actions，部署Cloudflare Worker/web，实际版本与线上资源检查以发布回执为准。

# 2026-11-23 发布用户批量操作栏样式调整

- 用户明确要求推送并部署当前修改：保留 quantity-breaks.module.css 中 bulkToolbar 去外边距、去边框及 padding:5px 16px 调整；同时提交已有 feedback-board.test.mjs 联系邮箱断言，将旧邮箱同步为实际使用的 appideasbox@gmail.com。无新增/删除源码、数据库迁移或焦点伪类修改。
- 批量禁用确认回归 1/1、指定反馈投票测试 1/1 通过（其余30项未运行）。本地 Chrome 使用真实活动页与受控 API，选择两条活动后核验工具栏 padding 为5px 16px、margin/border均为0，按钮正常显示；参考沿用 /private/tmp/qb-start-before.jpg，本次截图 /private/tmp/qb-toolbar-updated.jpg。未对真实商家执行写入。
- 本批沿用 main，拟提交 style(web): refine campaign bulk toolbar spacing，发布 Cloudflare Worker/web。构建、dry-run、实际提交、部署版本及线上资源校验以本轮执行回执为准，不将本地受控界面检查标记为实店业务验收。

# 2026-11-23 启用/禁用即时状态反馈（已获本批推送与部署授权）

- 用户明确授权将上一节暂停确认修复与本轮文案、状态反馈一并推送并部署。禁用沿用原暂停操作，按钮/确认/成功提示与等待提示同步 16 种应用语言；简体中文为禁用 → 禁用中 → 已失效，生效状态与筛选改为生效中。未改变平台停止、删除及失效重建规则。
- 批量确认后立即关闭确认框，在选中活动行与工具栏显示启动中或禁用中，并锁定重复提交与正在处理的活动编辑。接口返回后只更新已确认成功及明确待确认的记录；失败项恢复原显示，并保留错误提示。HTTP 请求失败也清理本地处理中状态，不重试写入。
- 新创建折扣返回独立活动 ID 时立即合并返回记录。activation_pending 对应的新记录继续显示启动中，直到后续平台只读确认；不将一般状态未知误标为启动中。店铺切换重新挂载列表，忽略前一家店铺迟到的批量响应。已失效活动的新建/删除并行及未来排期仍沿用原服务端规则，未来开始时间确认后仍为待生效。
- 生效/待生效活动的删除确认框追加“需先禁用活动，才能删除。”，继续保留服务端逐项校验，不修改草稿/失效项删除或混合批次处理。组件仍复用原布局和状态颜色，没有新增焦点伪类或修改 CSS。
- 回归覆盖延迟响应时的即时状态、部分成功/失败、整批失败恢复、不重复写入、禁用确认后自动核验/停止轮询、新活动等待确认及中英文字。最终相关回归 51/51 通过；从审阅后的暂存源码导出的生产构建、Worker dry-run、源文件一致性、编译后文案及 diff 检查通过。完整前端套件受本机 ENOSPC 中断，未记为通过；此前 8 项既有失败仍另见历史进度。既有 TypeScript 仅报 storefront-translation-defaults.ts:188 两项索引问题。
- 本地 Chrome 使用受控商家/订阅/活动 API，实际多选 2 项 → 确认启用 → 启动中 → 生效中，再打开删除确认验证提示并取消，随后确认禁用 → 禁用中 → 已失效。截图保存在 /private/tmp/qb-start-before.jpg、qb-start-pending.jpg、qb-start-active.jpg、qb-delete-disable-first.jpg、qb-disable-pending.jpg、qb-disable-ended.jpg。未对真实商家执行写入，不将受控通过标为线上业务验收。
- 测试期间本机磁盘空间耗尽，先清理 487 个已停止使用的 Vite deps_temp_* 生成缓存后恢复约 1.3GB；全套测试再次生成缓存耗尽空间，后续清理 116 个缓存并仅重跑本批相关回归，51 项全部通过。完整仓库临时导出也因空间失败并已移除，最终只导出构建必需的受审阅源码及已提交主题词典。中断的测试和失败的导出未标记通过；临时构建/截图不纳入 Git。
- 本批修改活动页、状态模型/适配器/状态组件、多语言消息、三份相关测试与本进度文档，新增 campaign-operation-messages.ts，无删除。保留并排除用户自行修改的 quantity-breaks.module.css 及 feedback-board.test.mjs；发布从审阅后的暂存文件导出构建，避免带入未授权修改。提交信息 fix(web): show campaign enable and disable progress；实际提交与 Worker 版本以发布回执为准。

# 2026-11-23 批量暂停状态自动确认（本地修复，未推送/部署）

- 定位到前端将 batch-status 的 pausing 计入已暂停，且活动读取仅识别 needs_reconciliation 待确认，导致正常 pausing 响应会清空轮询窗口。原代码在批量暂停后及重新进入已有暂停中活动的列表两条回归均复现不再查询。
- pausing 纳入现有只读状态确认：前 10 秒约每 2 秒、之后约每 5 秒，最多 60 秒；平台确认后停止，离开相关页面或切换店铺清理本轮定时器。重新进入列表可跟进已有暂停请求，不重复提交暂停。平台仍未确认时保留待确认，不伪造失效结果。
- 批量结果分别统计已确认暂停、暂停中、失败；暂停中不再提前提示已暂停，补齐 16 种应用语言的等待提示。单条状态处理复用相同提示语义。后端沿用既有同一 Function 折扣更新 ends_at 至约 10 秒后的停止流程，保留平台折扣关联与配置，本批不修改 Worker、主题、Function、数据库或商家数据。
- 新增两条真实页面回归，覆盖批量暂停、重进已有暂停中列表、自动变为已失效、只提交一次/不提交写入及确认后停止查询；与原有待确认启动用例定向 3/3 通过。生产构建通过，保留既有大 chunk 及语言导入提示；TypeScript 仅报此前记录的 storefront-translation-defaults.ts:188 两项索引错误，无本批文件错误。前端全量 388 项 / 380 通过 / 8 失败，失败名称与此前进度记录一致，仍为默认外观回填、编辑页结构、重复数量 radio ID、样式控件、建议卡背景、窄屏角标、款式价格及 Recommended 布局断言；未将全套标为通过。暂停二次确认、原有待确认启动及本批暂停两用例在全套中均通过。
- 本地 Chrome 访问 localhost:4199/quantity-breaks，使用真实页面与受控商家/订阅/活动 API 实际点击多选 → 暂停 → 二次确认。旧版停留暂停中并提前提示已暂停；修复后自动转已失效并显示结束时间。无空白页或框架错误遮罩；日志仅见本地服务重启期间 Vite ping 失败，未见本次交互运行错误。参考/修复截图保存于 /private/tmp/qb-pause-before.jpg、/private/tmp/qb-pause-after.jpg。仅验证本地受控流程，未对线上商家执行暂停或声称线上已修复。
- 本批修改 quantity-breaks.tsx、admin-workspace-messages.ts、startup-resilience.test.mjs 与本进度文档，无新增/删除文件。保留并排除用户既有 feedback-board.test.mjs 邮箱断言及本轮期间自行修改的 quantity-breaks.module.css；未改动焦点伪类。拟提交 fix(web): reconcile pending campaign pauses；需本批明确授权后推送。

# 2026-11-23 创建/启用活动保留有限结束时间（已获本批推送与部署授权）

- 用户确认在创建页取消“永不过期”并设置结束时间后报 endsAt is required unless neverExpires is true。追踪创建按钮：先保存 Draft，再调用单条 status 接口发布；普通单条/批量发布共享分支此前显式清除 endsAt，却保留 neverExpires=false，导致本地 Function 规则校验失败，尚未发出 SHOPLINE 创建请求。
- 仅移除该普通发布分支对 endsAt 的清空，使用发布租约内已校验的排期。保留已失效活动重新发布、订阅失效及其他已确认业务规则，不修改界面、CSS、主题扩展、数据库或已保存商家数据。
- 启用排期规则核对：普通创建/草稿首次启用保留已配置 endsAt/neverExpires；campaignForActivation 仅对 pauseReason=subscription_expired，或内部 paused 且存在 endsAt 的活动清空旧结束时间并设置 neverExpires=true。SHOPLINE 已确认失效且仍关联旧折扣的活动，列表直接启用时从当前时间创建持续生效的新活动；旧活动记录仍保留失效时间。已失效活动编辑后保存走独立替换分支，按表单提交的结束时间或永不过期设置发布，不无条件清空。发布确认前不改写旧记录的失效时间。
- 新增 4 项路由集成回归，覆盖通过创建接口保存有限排期后，单条/批量启用及当前/未来开始时间；核对 API 返回、持久化结束时间与实际发出的 SHOPLINE starts_at/ends_at。旧代码复现同一错误，修复后通过。用例固定测试时钟并在结束后恢复，避免运行日期影响等待生效断言。使用受控 SHOPLINE 响应，未创建真实商家折扣。
- Worker 全量 50 文件 / 452 项通过，TypeScript、dry-run 构建及 diff 检查通过。本批修改 campaigns.ts、routes-contract.test.ts 与本进度文档，无新增/删除文件；保留并排除用户既有 web/test/feedback-board.test.mjs 改动。用户已授权本批推送与部署，提交信息 fix(worker): preserve campaign end time during publication；线上提交与部署版本以本批执行回执为准。

# 2026-11-21 分类定时同步与活动更新时间分离（本地验证完成，已获本批推送与部署授权）

- 每日分类维护改用发布流程共用的 campaignsConflict：指定商品与指定分类的重叠不标记为冲突；同分类 ID 且排期重叠仍标记冲突，只比较已发布生效的分类活动。下一次成功维护会重新计算并覆盖历史误报。
- 商品成员快照只在实际变化时写入，不再改写活动 updated_at 或 revision；未变化时保留活动行。保留原有并发版本及发布状态校验。
- 新增 quantity_breaks_collection_conflicts.synced_at，记录最近一次完成成员刷新、分类参数维护及冲突检查的运行时间，并通过 collectionConflict.syncedAt 返回。失败标记 unknown，保留上次成功时间；checked_at 继续记录检查时间。未变化的成员也可以完成一次成功维护。
- 新增部署迁移 0023_collection_scope_sync_time.sql；需先应用 D1 迁移，再部署 Worker。历史 synced_at 保持 NULL，不猜测回填已被旧任务修改过的活动更新时间。保留每日定时任务、分类参数维护及现有结账优先级，未修改商家界面或开发者后台界面。
- 验证：先观察回归失败后实现修复，Worker 全量 50 文件 / 448 项测试、类型检查、dry-run 构建与模块边界检查通过。生产 SQL 迁移在本地 SQLite 验证保留历史记录；D1 测试覆盖兼容升级及重复运行，独立审查无阻塞发现。未执行真实商家结账验收；保留并排除用户既有 web/test/feedback-board.test.mjs 修改。用户已明确授权本批推送及应用 Worker 部署，线上迁移、部署版本及健康检查结果以本批执行回执为准。

# 2026-11-20 创建与编辑折扣预览控件排序（已获本批推送与部署授权）

- 按用户指定，调整共享 CampaignEditor 的实际 DOM 顺序为 device → product → country → market；创建与编辑页共用此组件。保留用户在 quantity-breaks.module.css 中的两列工具栏布局，第一行为设备/商品，第二行为国家地区/市场。仅移动现有控件，保留选择与价格逻辑，不修改翻译页、缺货规则或焦点伪类。
- 本地浏览器访问实际 CampaignEditor（受控商品/市场 API），确认 DOM 与可见行列顺序一致，PC/Mobile 往返切换正常，无控制台 error；修改前后截图保存在 /private/tmp/qb-preview-order-before.jpg、/private/tmp/qb-preview-order-after.jpg，已查看修改后截图。此处验证创建态共享组件，未访问真实线上编辑活动或进行保存，不将其记为实店验收。
- 现有 editor-storefront-language-preview 回归通过，覆盖市场/国家切换、价格按需请求/缓存与迟到响应保护；前端生产构建、git diff --check 通过。保留既有构建大包与语言导入提示。保留并排除用户既有 feedback-board.test.mjs 邮箱断言修改。
- 本批审阅范围：CampaignEditor.tsx 控件排序、APP_PROGRESS.md 进度记录及用户提供的 quantity-breaks.module.css 两列布局；无新增或删除文件。用户已授权本批推送与部署；提交信息 fix(web): reorder campaign preview controls，实际提交与部署版本以本批执行结果为准。

# 2026-11-20 OS3 原生加购通知联动（本地更新，未推送/发布）

- 用户提供 Fashion2 全部 `components/cart` 文件，并要求适配 `cart_add_type=notification`。逐份核对 25 个购物车组件文件，关联 `public/base/index.js`、原生商品表单、modal、layout、header 与两个通知 section；以下事件/组件约定来自该主题源代码，不将其表述为所有 SHOPLINE 主题的通用 API。官方文档检索没有查到对应前端事件约定。
- 加购响应保留真实购物车行 `key`，以 `lineItemKey` 传给 `variant:added`。通知仅在缺失行标识时补读一次购物车；不匹配已有定制行，不覆盖已知 key，不以款式 ID 伪造 key。一次批量加购不重试写入。
- 通知先以原生 cart 路由读取去重后的 `cart-notification`、`cart-notification-product`、`cart-bubble` 区块，保留路由查询参数、限制同源、禁用缓存并校验所有目标及本次商品行。全部款式行在脱离页面的文档中预先组合，使用主题原始商品行标记；主题原生 `cart:open` 使用 `refresh:false`，同一任务紧接调用原生渲染，避免再次读取区块。`cart:opened` 触发时通知已打开、全部商品行已显示，小计/按钮及电脑和手机两个角标已刷新。一次加购只打开一次，不另发通用刷新事件。
- 行标识最终无法确认时仍刷新安全的小计/按钮/数量，不打开未知商品内容。区块 GET 每次最多 2.5 秒、最多尝试两次；内容不完整不修改页面或打开旧通知，渲染失败不重复打开或重新加购。抽屉与 page 模式保留原主题打开/刷新/跳转流程，OS2.1 使用上节独立原生适配。
- 新增 OS3 回归 9 项，单/多款式、实际 key、排除旧定制行、缺失 key 降级、HTML 完整性、GET 重试、抽屉/page、opened 事件顺序均通过；先观察失败再实现，两项独立审查发现亦通过失败回归修复并复审无 P1/P2。两版加购与既有核心加购定向 41/41 通过。全主题 108/109，唯一失败 `unchanged default desktop and mobile configuration renders a usable widget` 为既有默认圆角实际 10px / 旧断言 8px，未修改用户默认配置。同步资源检查、两份 JS 语法和 diff 检查通过。
- 本地 Playwright/Chrome 使用 Fashion2 原始 Cart、BaseElement、VisibleElement、notification、bubble、modal 脚本及其原始 CSS；事件 SDK、支付初始化、商品/加购/区块 API 使用受控夹具，非真实店铺测试。1440×1000 / 390×844 × 单/多款式 × 修改前/后共 8 组对照：旧代码不能打开，新代码仅一次 POST、一次区块 GET、一次打开，全部款式/小计/角标正确，关闭按钮正常，无运行时错误或弹窗横向溢出。已人工查看桌面和手机多款式截图。使用现有 Playwright，未安装依赖。
- 参考及更新截图：`/private/tmp/qb-os3-cart-{1440,390}-{single,multi}-{reference,updated}.png`；脚本 `/private/tmp/qb-os3-cart-qa.mjs`，结果 `/private/tmp/qb-os3-cart-browser-results.json`，仅保存在本机。真实 API 区块 HTML、实际主题发布与其他 3.0 主题仍需实店验证，不将本地受控通过视为线上验收。
- 本次待审批合并上节 OS2.1 改动，共修改两份 `app-block.js` 和本进度文档，新增两份 cart-refresh 回归文件，无删除。保留并排除用户既有 `web/test/feedback-board.test.mjs` 修改；无 CSS、Worker、后台、Discount Function 或数据库变更。尚未提交、推送或发布；拟提交 `fix(theme): refresh OS2.1 and OS3 carts after bundle additions`，待本批明确推送授权，主题扩展由用户自行发布。

# 2026-11-20 OS2.1 加购后的购物车刷新（本地更新，未推送/发布）

- 用户提供 Mordern 的 `assets/global.js` 并要求优化加购联动。核对原始 `component-product-form.js`、`section-cart-drawer.js`、`component-cart-notification.js`：本主题通过 `getSectionsToRender()` / `renderContents()` 更新购物车，不监听 app-block 此前发出的 `cart:refresh` 等事件。官方 Handlebars Section rendering API 确认可用当前页面 `?sections=...` 单独获取 HTML。
- 保留一次原子批量加购，成功后仅对匹配的主题组件读取所需区块：抽屉内容、电脑/手机数量角标，或通知商品、购物车按钮、小计与角标。读取保留当前路径和市场/语言查询参数并禁用缓存；全部 HTML 与目标节点通过校验后才调用主题原生渲染和打开方法，跟随主题通知/抽屉设置。2.1 购物车页面模式沿用原生购物车路由。
- 批量响应保留实际购物车行 `key`；仅缺失项查询购物车详情，不能用 Variant ID 代替或覆盖已知key。完整购物车回退只匹配唯一且未带自定义properties的行；旧定制行不参与匹配，身份有歧义时不展示无关商品。通知弹窗将本次加入的所有款式行组合展示，排除购物车内其他商品；相同款式仍合并数量。响应丢失但数量增长确认成功时保留回读的行 key。3.0 继续使用原事件桥接，即使主题存在同名购物车元素，也优先已有 `themeEventCenter`。
- 区块读取每次最长 2.5 秒，最多读取两次；先预检所有内容，缺失/null/解析失败时不打开旧内容。主题渲染调用不重试；读取或渲染失败不改变已确认的加购成功状态，更不会重新提交加购。刷新期间保持按钮忙碌，防止同一组件重复点击。没有调整 CSS、翻译、Worker、Discount Function 或后台页面。
- 新增 `tests/theme-app-extension/cart-refresh.test.mjs` 共16项回归，覆盖抽屉、两端角标、多款式通知、缺少 key、读取重试/超时、完整性、原生渲染异常、丢响应后的回读、3.0事件优先级、购物车页面跳转、已挂载组件的一次写入及旧定制行/缺失key/匹配歧义。先观察新增缺失行为失败，再实现；与既有加购测试合计32/32通过。全主题测试99/100通过，资源同步、两份JS语法与diff检查通过；唯一既有失败是默认圆角10px而旧断言期望8px，不改商家默认值。
- 本地 Playwright 加载用户提供的两份原始主题购物车脚本，使用实际2.1模板及受控API响应，按抽屉/通知 × 1440×1000/390×844 × 修改前/后完成8组对照。旧版加购后角标仍0且不打开；新版两种款式均展示、角标更新、正常开关，未重复加购且无页面运行时异常。页面/支付SDK仅提供必要夹具，不代表真实店铺API或完整主题验收。浏览器插件/技能未提供，使用已安装Playwright和本机Chrome，不安装依赖。
- 参考/本地截图保存在 `/private/tmp/qb-os21-cart-{drawer,notification}-{1440,390}-{reference,updated}.png`；已人工查看桌面抽屉、手机通知的新旧对照。测试脚本 `/private/tmp/qb-cart-refresh-qa.mjs` 与结果 `/private/tmp/qb-cart-browser-results.json` 均在仓库外。同步更新共享源 `public/app-block.js` 与2.1发布资源 `compatibility/assets/app-block.js`，不改模板或locales。真实店铺加购、真实接口区块返回与其他2.1主题仍待用户发布扩展后验证。
- 本批仅两份JS、新增回归测试和本进度记录；保留且不纳入用户已有 `web/test/feedback-board.test.mjs` 改动。未提交、推送、部署或发布SHOPLINE扩展；拟提交 `fix(theme): refresh OS2.1 cart after bundle additions`，按AGENTS.md等待本批明确推送授权。

# 2026-11-19 OS2.1 兼容更新发布授权

- 用户在确认2.1组件请求shopId返回400后，明确要求“推送并部署”。线上旧Worker仍要求shop参数；同商品shop=buchaqian实测200，shopId=1726037928557实测400，生产D1只读查询确认该ID对应已安装buchaqian。需先部署本批Worker适配才能使用已更新的2.1组件。
- 授权范围为下方清单中的52份OS2.1兼容代码/文档，沿用main推送GitHub并部署Cloudflare应用Worker及同版本web资源。SHOPLINE主题扩展由用户自行发布，未执行平台发布；保留并排除既有feedback-board测试改动和qa-preview-stock夹具。正式提交号、Worker版本及部署后的请求验证结果以本次发布回执为准。

# 2026-11-19 OS2.1 locales 格式优化（本地更新，未推送/发布）

- 用户在核对官方开发规则后要求优化。定位此前两处不足：同步脚本将36份OS3编辑器.schema.json原样复制到2.1，本地测试又直接读取OS3 i18n，不能证明2.1发布文件或平台解析有效。本条取代下方最初“74项全部按字节复制”的维护约定。
- 现在仅复制36份前台语言JSON到compatibility/locales，同时按官方迁移示例生成2.1 schema.locales。2.1编辑器名称固定共享英文品牌名Multi-item Discounts，不依赖未验证的t:名称；3.0多语言编辑器名称、所有源文案与商家保存的campaign.copy优先级保持。内嵌翻译生成后app-block.html为53351字节；同步前验证所有模板翻译键和100KiB总量，--check不写入文件。旧生成.schema副本仅与源字节相同才移除，已编辑/无源文件保留并阻止同步，避免误删自定义内容。
- 新增同步脚本集成测试，先观察6项旧行为失败，再修正。覆盖36语言发布产物、内嵌数据、模板键、缺失翻译、过大模板、变量与美元替换符保留、只读漂移检查和自定义文件保护。定向12/12通过；主题全量83/84，唯一失败仍为既有默认圆角10px与旧断言8px，未改用户默认值。资源检查、Node语法、OS3 SLine和diff检查通过。
- 本地Playwright使用实际2.1发布模板/资源和受控活动，英文/中文、1440×1000/390×844四组页面非空、标题/文案正确、无控制台异常或横向溢出；点击档位后总价31.98→19.99。与优化前共享文案参考无可见布局差异；手机像素相同，桌面有少量采样差异，未宣称PNG字节相同。已查看中文桌面参考及修改后的桌面/移动截图：/private/tmp/kaching-os21-locales-zh-hans-cn-reference-desktop.png、updated-desktop.png、updated-mobile.png；其他证据见THEME_OS21_COMPATIBILITY.md。
- 本次未新增Worker业务修改、未修改CSS或Discount Function。为完整审核此前未提交的2.1适配，重新运行Worker全量49文件/429项通过、类型检查通过、dry-run构建通过。真实2.1平台编译、语言默认/回退及编辑器多语言仍待验证。本批沿用main，合并前面尚未提交的OS2.1兼容实现供审核，共52文件（47新增/5修改），完整清单见THEME_OS21_COMPATIBILITY.md；保留并排除原有feedback-board.test.mjs和qa-preview-stock.html/tsx。尚未提交、推送、部署或发布SHOPLINE扩展。拟提交 feat(theme): add OS2.1 compatibility with version-specific locales；按AGENTS.md等待本批明确推送授权。

# 2026-11-19 OS2.1 schema 商品页标识修正（本地更新，未推送/发布）

- 用户提供实际平台错误：templates 不接受 product，接受 products/detail。定位为兼容模板复制了 OS3 的 schema 商品页枚举；此前本地 Handlebars/JSON 检查没有验证2.1平台枚举，不能算平台编译通过。
- 仅修改 compatibility/blocks/app-block.html 的 templates 为 ["products/detail"]，OS3 blocks/app-block.html 继续保留 ["product"]；没有改 Worker、样式、业务逻辑或翻译。
- 新增回归在旧配置复现 product 与 products/detail 不一致，再修正2.1配置。2.1/结构定向测试15/15通过，资源同步检查与diff检查通过；主题全量79/80，唯一失败仍为既有默认圆角10px与旧断言8px不一致。真实 SHOPLINE 平台重新编译待用户执行，本轮没有发布扩展。

# 2026-11-19 OS 2.1 / OS 3.0 双版本 app-block（本地实现，未推送/部署/发布）

- 用户授权开始实施 SHOPLINE OS2.1 兼容。在当前部署对应 main / de379fe 基础上，保留 OS3 SLine 模板，新增 compatibility/blocks 的 Handlebars 模板及 assets/locales；既有 compatibility:true 保留。共享 JS/CSS/36 种翻译只有一个维护源，同步脚本按字节复制 74 项资源，检查漂移和无源残留语言，不重生成或覆盖原 i18n 文案。
- OS2.1 模板输出已文档化的 shop.id、五组规格、商品/款式 available、当前市场币种/国家/语言、价格、图片和静态翻译。Worker 解析已安装店铺身份，校验店铺 ID/handle 一致性；无有效订阅、卸载、未知身份和排除项不查询 Admin 或展示活动，不向浏览器暴露凭据。
- OS2.1 分类活动在必要时使用 GET /admin/openapi/v20260601/products/collects.json 的 product_id 实时查询当前归属，最多 4 页/1000 条，只提取 Link 的游标、不跟随任意 URL。成功缓存 60 秒、失败 5 秒、合并进行中请求并限制容量/并发；同实例同店串行、至少 500ms 间隔，429 按 Retry-After 冷却整个店铺；整组分类请求与排队预算 5 秒。失败/不完整时不使用旧商品快照，组件隐藏；指定商品优先、活动排期、订阅门槛、OS3 分类上下文及旧请求兼容规则保留。不同 Worker 实例/其他接口仍共用上游额度，不宣称全局限流或保证无条件展示。
- 两版共用交互脚本。主题编辑器/局部导航新增或替换区块自动初始化，同一节点不重复绑定；移除区块释放 viewport 监听，迟到响应不会渲染已移除节点；查询失败后重新插回同一节点仍保留元数据以重试。没有修改源 CSS、焦点伪类、应用管理界面或 Discount Function。
- TDD：2.1 模板/挂载、Worker 身份入口、动态区块初始化、监听清理、失败后重新插入及同店限流均先复现失败再改绿。Worker 全量 49 文件/429 项通过，TypeScript 和 dry-run 构建通过。主题完整套件 78/79，唯一失败 unchanged default desktop and mobile configuration renders a usable widget 为本批修改前已有的默认圆角实际 10px/旧断言 8px；未改变用户默认配置。JS 语法、资源同步检查、36 种实际 Handlebars 渲染、schema JSON 解析及现有 SLine 语法检查通过。
- 本地 Chromium 1440×1000 / 390×844 使用真实 JS/CSS 和实际渲染的 Handlebars 模板、受控活动/购物车响应；与 HEAD 现有组件同数据对照，桌面和移动截图分别完全一致。五组规格、价格/折后汇总、一次加购与成功反馈通过，无运行错误或横向溢出。参考：/tmp/kaching-os21-reference-desktop.png、/tmp/kaching-os21-reference-mobile.png；本地：/tmp/kaching-os21-os21-desktop.png、/tmp/kaching-os21-os21-mobile.png。本机保留截图，不提交。
- 独立审查指出同店突发读取风险，已补串行/冷却并复测；复审无重要阻塞。监听清理、孤立翻译检测及移除后查询失败的元数据保留亦已修复。
- 边界：未运行真实 SHOPLINE OS2.1 平台编译/发布，没有真实商家加购。平台模板编译、智能分类归属、尤其 JPY 等真实价格尺度及不同主题抽屉刷新仍需发布前/后实店验收。本地 mock 不记为实店验证。用户自行发布主题扩展；需先部署本批 Worker 再发布 compatibility 资源。详见 THEME_OS21_COMPATIBILITY.md。
- 保留并排除用户既有 web/test/feedback-board.test.mjs 与 web/qa-preview-stock.html、web/qa-preview-stock.tsx。本批无数据迁移、删除、Git 提交、推送或发布。

# 2026-11-19 编辑器市场价格请求优化与五组规格修复（已获本批推送与部署授权）

- 用户确认执行市场价格优化，随后补充 Material / Style 规格标题存在但没有值。官方 v20260901 OAS 确认价格接口按 variant_id 查询，每次最多 10 个 country_codes；商品接口支持 option1～option5。SHOPLINE 官方 REST 限流按应用/店铺隔离，默认漏桶容量 40、恢复 4 次/秒；本地节流是应用自身上限，不代表动态可用额度。
- 编辑器新增 16 种应用语言的“预览国家/地区”控件，每次明确选择当前市场下的一个国家。请求集合来自当前选择及所有可见档位实际使用的款式；规格名称、规格值仍来自完整商品目录，按需查询价格不裁剪选择器。
- 新增编辑器实例内的价格客户端：成功结果按款式/国家缓存 60 秒、最多 200 项，同一进行中请求合并；单次消费者取消不影响其他消费者，全部取消后中止排队/请求。缓存随编辑器卸载或认证 fetcher 更换释放，页面以已验证 shop.storeId 与活动 ID 作为编辑器 key，避免跨店复用。
- 预览价格请求串行且间隔至少 500ms。Worker 对同一实例、同一店铺的预览价格请求另设串行节流，店铺之间互不阻塞；队列及店铺状态均有上限。429 优先遵守有效 Retry-After，否则指数退避加随机延迟，最多补试 2 次；超过 10 秒的等待不在本次请求内自动重试，返回真实 429 及 Retry-After。上游发送请求设置 8 秒超时，避免阻塞后续价格查询，继续统一使用 shoplineAdminHeaders。
- 价格逐项更新，已成功结果不因另一个款式失败而全部作废；缺失价格的档位显示等待/不可用，不将缺失值当 0 或商品店铺价展示。规格选择保持可操作，提供手动重试；旧商品、国家或规格的迟到响应不能覆盖新预览。单元回归保留合法零金额；部分价格尚未返回时，已知款式仍使用指定市场档位金额，未知金额不显示为店铺币种的配置金额。
- 修复 Worker 列表、单商品及批量商品查询的转换代码，补齐 option4 / option5。原预览渲染器本身支持五组规格，问题发生在上游字段转换；补充三条路由回归及下拉/文本/色板/原图四种预览样式检查。
- 验证：100 款式、各档位可复用一个款式的受控案例由 100 次价格请求降至 1 次；库存要求使用两个不同款式的浏览器案例为 2 次。切换国家只补查所需款式，切回复用缓存；取消排队、共享请求、缓存过期、部分失败、手动恢复、迟到响应及五组规格回归通过。最终 Worker 全量 48 文件 / 418 项通过；Worker TypeScript、dry-run 构建及前端生产构建通过。前端全量 382 项中 374 通过，8 项失败名称与上一批 HEAD 基线完全相同（下方已有完整名称），未标为全绿；随后针对部分价格的指定市场金额回归等 8 项通过，价格客户端/编辑器/市场配置/槽位选择定向 18 项通过。前端类型检查仅剩 storefront-translation-defaults.ts:188 的 2 项既有索引错误，本次触及的预览 Variant 可空参数一并修正。构建保留既有大 chunk 与中文包导入警告。
- Browser 插件未提供，使用已有 Playwright/Chromium，在本地受控编辑器检查 1440×1000、390×844：页面非空、无框架错误遮罩或运行异常，国家/款式选择和失败重试可操作，五组规格有值且无横向溢出。参考截图 `/private/tmp/kaching-market-preview-before-desktop.png`；本地截图 `kaching-market-preview-after-desktop.png`、`kaching-market-preview-after-mobile.png`、`kaching-market-preview-partial-desktop.png`、`kaching-market-preview-five-values-desktop.png`、`kaching-market-preview-five-values-mobile.png`。截图和临时夹具仅保存在本机，不提交。
- 边界：本批没有引入跨 Worker 实例或所有 Admin REST 请求共享的全局限流器，也没有新增数据库、Durable Objects 或 R2。其他标签页/实例/接口仍共用 SHOPLINE 配额，因此保留真实 429 与有限退避；未对真实商家进行本批发布后验收。Discount Function、真实主题 app-block 及结账规则均未修改；无 CSS 修改，无焦点伪类变化。
- 变更清单：修改 `web/src/pages/quantity-breaks.tsx`、`web/src/prototype/CampaignEditor.tsx`、`web/src/prototype/StorefrontWidget.tsx`、`web/src/prototype/campaign-editor-messages.ts`、`web/test/editor-storefront-language-preview.test.mjs`、`web/test/editor-structure.test.mjs`、`web/test/widget-layout.test.mjs`、`worker/src/routes/catalog.ts`、`worker/src/services/shopline-admin.ts`、`worker/test/routes-contract.test.ts` 及本进度文档；新增 `web/src/prototype/preview-price-client.ts`、`web/test/preview-price-client.test.mjs`、`worker/src/services/market-price-request.ts`、`worker/test/market-price-request.test.ts`；无删除。保留并排除用户原有 `web/test/feedback-board.test.mjs` 修改。
- 用户已明确授权本批推送与应用 Worker 部署。提交说明：`fix: reduce preview price requests and preserve five product options`；正式发布的提交号、Worker 版本及线上检查结果以本次发布回执为准。

# 全应用进度

# 2026-11-19 翻译预览内联加购反馈与按钮加载图标（已获本批推送与应用部署授权，主题待发布）

- 按用户指定移除 `.translationExamples` 独立示例区，删除 `TranslationCopyExamples.tsx` 与对应 CSS。翻译列表保留 14 项当前组件文案；`Adding bundle...` 不再显示在翻译列表、预览或真实组件中，历史保存字段继续保留以兼容旧翻译。标题、节省标签、原价、预计节省、组合总价、加购按钮六项不再输出 `.translationUsage`，条件性文案仍保留用途说明。
- 翻译预览增加“预览加购结果”选择器，支持成功、失败、结果未确认、库存不足四种结果，控制标签覆盖现有 16 种应用语言。点击预览加购按钮先显示旋转图标，再在按钮正下方输出真实使用位置的反馈；数量和购物车行数按当前选择生成，修改翻译立即更新已显示反馈。切换语言、商品或结果场景取消旧模拟并清空反馈；预览不写入真实购物车。可选价格汇总、购物车规格明细及档位节省标签继续开启用于预览。
- 真实 app-block 加购按钮使用用户提供的 20×20 SVG 与 `.loading--rotator`，`stroke=currentColor` 继承当前加购文字颜色，支持减少动态效果偏好。加载时隐藏普通按钮文字、清空旧反馈、设置 `aria-busy` 并禁用重复提交；切换档位/视口重渲染仍保持加载状态，请求结束恢复按钮及原有结果处理。移除主题静态 copy 中不再使用的 `widget.adding` 引用。没有修改折扣、订阅、授权、Worker、Function 或数据库逻辑，没有改动焦点伪类。
- 回归先验证旧代码仍显示示例区、15 个字段且没有按钮 spinner，再实现并检查新行为。翻译/保存回退/规格选择定向测试 20/20，未预选规格按钮回归通过；新增主题测试验证延迟加购期间切换档位不会重复提交。前端最终完整 Node 套件 370/378，主题完整套件 71/72，生产构建、locale JSON、脚本语法、SLine 检查（以扩展目录为 `--root`）和 `git diff --check` 通过。构建保留既有大 chunk 及中文包导入警告。
- 前端 8 项剩余失败全部在 HEAD 代码的独立临时副本上复现：`server campaign conversion restores missing detailed appearance defaults`、`campaign editor separates the internal and checkout discount names and renders coverage detail rows`、`duplicate quantities in an unsaved draft keep preview radio IDs unique`、`style editor exposes badge placement and separate variant, cart, savings and button controls`、`feedback cards use distinct low-saturation backgrounds for every status`、`right corner badges stay in the tier header on narrow previews`、`shows only the selected variant price in a bundle slot header`、`reserves a readable Recommended column instead of shrinking its label`。主题唯一剩余失败为旧默认圆角 8px 断言与用户当前 10px 默认值不同。未将完整套件标为通过。
- TypeScript 仍有 3 项既有错误，也已在 HEAD 副本复现：`storefront-translation-defaults.ts:188` 两项索引错误，以及 `StorefrontWidget.tsx` 选中 Variant 可能为 null 的错误（原第 300 行）。本次新增的定时器及翻译 key 类型问题已修复，无新增类型错误。
- Browser 插件不可用，使用已有 Playwright/Chromium，在本地 `http://127.0.0.1:4189/quantity-breaks/translations` 以受控 API 数据检查桌面 1440px、窄屏 390px、英/法/简体中文、四种加购反馈、实时编辑、加载恢复及无横向溢出；主题单独检查桌面/移动 spinner、自定义按钮文字颜色继承和 reduced-motion。没有浏览器运行异常或框架错误遮罩，没有真实购物车写入。开发模式首次挂载取消的只读请求仍产生既有 NETWORK_FAILURE 诊断，本次未改启动/诊断模块。
- 参考截图：`/private/tmp/kaching-inline-cart-reference-desktop.png`、`kaching-inline-cart-reference-mobile.png`；本地截图：`kaching-inline-cart-desktop-loading.png`、`kaching-inline-cart-updated-desktop.png`、`kaching-inline-cart-updated-mobile.png`、`kaching-inline-cart-theme-updated-desktop-loading.png`、`kaching-inline-cart-theme-updated-mobile-loading.png`。仅验证本地受控流程，真实店铺需发布后验收；app-block 的 SHOPLINE 发布仍由用户执行。保留并排除用户既有 `web/test/feedback-board.test.mjs` 修改。

# 2026-11-19 加购时库存变化的错误反馈（已获本批推送与应用部署授权，主题待发布）

- 根据用户提供的加购响应复现：`items:null`、`message: Out of stock`、`description: stock not enough`。原代码在 HTTP 失败时直接返回通用失败，未读取响应中的缺货原因。
- 真实 app-block 现在读取响应，并将明确的缺货原因映射到既有 `widget.no_stock` 本地化反馈；兼容 HTTP 422 和携带相同缺货结果的 HTTP 200。保留所选规格及数量，恢复可手动操作，不自动重试写入，不推断哪一个款式已永久售罄。一般失败、非 JSON 错误及加购结果无法确认仍沿用原处理。
- 翻译页的 16 种应用语言同步补充“加购接口返回库存不足”的显示条件；没有新增翻译字段，没有修改 CSS、Worker、Function 或数据库。
- 回归先在旧代码复现分类错误与通用失败文案，再验证实际挂载的 app-block 显示配置的中文缺货文案。单元测试 16/16；主题完整套件 70/71，唯一失败 `unchanged default desktop and mobile configuration renders a usable widget` 为既有默认圆角 10px 与旧断言 8px 不一致，使用 HEAD 原脚本复测得到相同失败，未修改用户的默认样式。
- 翻译页相关测试 9/9、16 种 locale JSON 解析、脚本语法检查及前端生产构建通过；构建保留既有大 chunk 和中文包静态/动态导入警告。
- 本地 Chromium 使用受控响应实际点击加购，检查英文桌面及中文 390px 窄屏、规格保留、仅一次加购、按钮恢复可操作及无运行异常/横向溢出。参考与修复截图：`/private/tmp/kaching-stock-feedback-reference-desktop.png`、`kaching-stock-feedback-updated-desktop.png`、`kaching-stock-feedback-updated-mobile.png`。未对真实商家购物车写入，未将本地受控验收标为线上验证；app-block 需由用户发布到 SHOPLINE 后生效。

# 2026-11-17 合并提交与 Worker 发布（已获本批授权）

- 用户明确授权将分类展示、库存处理、Function 空分类输入诊断与主题价格单位修复一并提交到应用仓库当前 `main`；配套 Cloudflare Worker 由本轮部署，Discount Function 与 app-block 的 SHOPLINE 发布由用户自行完成。无 D1 迁移。
- 发布前复核：主题 `59/59`、Worker `45` 文件/`340` 项、Worker TypeScript、前端生产构建、Worker dry-run 构建与 SLine 语法检查通过。前端构建仍有既有大 chunk 提示。
- Function 分类/指定商品优先/空输入定向测试通过；Go 全量再次仅有既有 `TestOverlappingDiscountNodesExcludeOnlyConflictedProduct` 失败，未将其标记为全量通过。Function 真实分类输入为空的问题仍需核实 SHOPLINE 变量绑定，当前诊断改动不代表该线上问题已解决。
- 提交范围为下方两批修改的 10 个文件（8 个修改、2 个新增），无删除。保留并排除用户原有 `web/test/feedback-board.test.mjs` 修改；不包含本机截图、临时脚本或打包产物。

# 2026-11-17 app-block 主题价格单位修复（本地验证，未推送/部署）

- 实店日元商品的主题规格 JSON 为 `price: "90804100"`，主题原价显示 `¥908,041`，旧组件误显示 `¥90,804,100`。SLine 主题价格的 100 倍表示与币种最小单位不同，JPY 也必须先除以 100。
- 仅在 `readCatalog()` 读取 `variant.price`、`compare_at_price` 时转换为实际金额，再交给既有币种精度与整数最小单位计算。百分比基点、活动固定金额、指定市场 `amountMinor`、Function 输入/结账规则不做此换算；空划线价仍保留 null，零价格仍保留 0。
- 将主题 DOM 测试数据改为真实 SLine 100 倍单位，先复现 USD `1999` 被误读为 `1999` 而非 `19.99` 的失败，再修复。新增 JPY/USD/CNY、划线价、零价、档位/规格/汇总/按钮及 JPY 四种指定市场金额回归。最终主题全套 `59/59` 通过，JavaScript 语法与 `git diff --check` 通过。
- 本地 Chrome 在桌面和 `390×844` 验证：原价按正确单位显示，百分比档位与市场固定单价切换后同步更新，页面无相关警告/错误或框架错误遮罩，窄屏没有横向溢出。受控案例中 JPY 每件 `45`、两件合计 `90`；USD 原价 `19.99`、两件 8 折合计 `31.98`。未实际加购或发布主题扩展，不代表真实 SHOPLINE 发布后验收。
- 参考截图 `/tmp/kaching-price-reference-20261117.png`；本地截图 `/tmp/kaching-price-local-jpy-20261117.png`、`/tmp/kaching-price-local-jpy-fixed-20261117.png`、`/tmp/kaching-price-local-usd-20261117.png`、`/tmp/kaching-price-local-jpy-mobile-20261117.png`，保留于本机、不提交 Git。
- 本次金额修复涉及 `theme-app-extension/public/app-block.js`、`tests/theme-app-extension/widget-mount.test.mjs` 与本进度文档；同文件内此前未提交的分类/库存变更及用户其他修改继续保留，推送需按本批明确批准范围选择代码片段。

# 2026-11-17 当前商品分类展示与结账输入排查（本地实现，未推送/部署）

- app-block 从 SLine 当前商品所属分类读取展示上下文，显式从第 1 页开始，最多 10 页/1000 分类；校验总数与完整性，新主题的空/缺页结果不会回退旧商品快照。公开接口新增只读 form POST，旧 GET 保持兼容；分类上下文不写入 D1、不进入结账授权。
- 指定商品活动 A 与分类活动 B 同时有效时，公开组件优先展示 A，与现有 Function 的指定商品优先规则对齐；订阅、发布状态、排除商品与生效时间检查保留。同优先级多命中仍返回原有 409。
- 入口与规格/加购共用库存策略，允许缺货销售或不跟踪库存的规格不再被 available-only 入口隐藏；全部售罄保留组件但禁用加购。修复空库存误读为 0，以及隐藏价格汇总被更高优先级 CSS 覆盖的问题；没有新增或修改任何焦点伪类。
- 根据用户字段表核对 Function 分类参数链。实店 `zheng-haonan` 的 TraceID `87f31cb19bf50c5ce47d0f03158164d8` 确认输入 `inCollections: []`；本地已有按 collectionId/isMember 匹配的代码。本批只增加空分类输入诊断与真实金额回归，未改变折扣计算，也未宣称线上结账已修复。CLI 上传动态变量配置的疑点与待核实项详见 [分类展示与 Function 输入说明](STOREFRONT_COLLECTION_MEMBERSHIP.md)。
- 自动验证：Worker 全量 `45` 文件/`339` 项通过；补充恰好 1000 分类的边界后，分类定向套件 `12/12` 通过。主题最终 `56/56` 通过；Worker 类型检查与 dry-run 构建、SLine 语法检查通过。Go 分类定向测试通过；Go 全量仍有既有 `TestOverlappingDiscountNodesExcludeOnlyConflictedProduct` 失败，已将修改前 HEAD 的源码与测试提取到独立临时目录复现，不能标为 Go 全量通过，未擅自改变已确认的分类重叠规则。
- 本地浏览器核对桌面及 390px：继续销售的零库存规格组件正常显示且加购按钮可用；全部售罄显示档位和禁用按钮，价格汇总正确隐藏。参考截图 `/tmp/new-feature-widget-sold-out-2026-11-17.png`；本地截图 `/tmp/kaching-membership-continue-local.png`、`/tmp/kaching-membership-sold-out-local.png`、`/tmp/kaching-membership-mobile-local.png`。均为本地受控数据，未实际向真实购物车写入，不代表 SHOPLINE 主题/结账验收。
- 保留并排除用户原有 `web/test/feedback-board.test.mjs` 邮箱断言修改。本批未迁移 D1、未修改真实商家活动/分类/库存、未推送 Git、未部署 Worker 或扩展。

# 2026-11-16 首页隐藏未知覆盖范围警告（已获本批推送与部署授权）

- 首页活动列表的分类提示仅显示 `collectionConflict.state === 'conflict'` 的已生效活动；`unknown` 或尚无核验记录时不再显示“暂时无法验证覆盖范围”。两处列表实现保持一致，已确认冲突继续使用现有提示样式与多语言文案。
- 创建/编辑/启用时的覆盖范围校验、后台分类刷新、诊断记录、订阅期限提示和 CSS 均未修改；本批只调整首页提示的显示条件，没有扩展到后台冲突规则统一。
- 前端生产构建通过。本机已有 Playwright/Chromium 验证生产构建：同页混合“未知”和“冲突”活动时，仅冲突活动显示警告；仅剩“未知”活动时整个分类警告栏消失，活动行仍正常显示。桌面 `1440×1000`、窄屏 `390×844` 已检查；页面没有运行错误或框架错误遮罩。受控 API 数据验证不代表真实商家线上验收。
- 最终前端完整 Node 套件 `371` 项中 `365` 通过、`6` 失败；失败项与上一批记录的基线相同：未保存草稿预览 radio ID 唯一性、样式编辑器字段、反馈状态卡片背景、窄屏角标位置、规格价格显示、Recommended 列布局（完整英文测试名见下方删除修复记录）。本次未把完整测试套件标为通过；未新增自动化测试，已用真实浏览器执行针对性的显示验证。
- 参考与本地截图保留于 `/private/tmp/kaching-coverage-notice-before.png`、`kaching-coverage-notice-after.png`、`kaching-coverage-notice-only-unknown.png` 和 `kaching-coverage-notice-mobile.png`，不提交 Git。本次没有修改焦点样式或安装依赖。
- 本批仅修改 `web/src/pages/quantity-breaks.tsx` 与本进度文档，无新增或删除文件；保留并排除用户既有 `web/test/feedback-board.test.mjs` 邮箱断言修改。拟提交：`fix: hide unverified coverage warnings on campaign home`。

# 2026-11-16 删除活动任务确认与列表同步（已获本批推送与部署授权）

- 真实只读 D1 核查：`zheng-haonan` 最近两条删除任务均为 `succeeded`、`last_error` 为空，左连接的活动记录均不存在。结合页面调用链确认：批量接口返回 HTTP 202/`queued` 时，页面此前立即提示“已删除”并只刷新一次，任务真正完成后没有再同步列表；编辑快照也未清理。
- 现在复用既有任务查询接口，仅轮询读取结果，每秒一次、最长等待 30 秒；逐条判断 `succeeded`、`failed`、`requires_pause`，不因批次整体状态提前把所有活动判为成功。任务排队、重试、超时或查询结果中断时不虚报成功，也不重新提交删除写请求。
- 确认删除的活动立即移出页面列表、服务端数据快照及编辑缓存，并按已验证店铺记住已删除 ID，过滤较晚返回的启动、活动列表、商品标题和编辑核验结果，避免旧数据复活。单条删除成功也使用同样的缓存清理；部分失败仅保留失败/未确认的活动。切换店铺或卸载页面取消原店铺的任务等待，迟到结果不作用于新店铺。
- 删除任务查询失败时保留此前已确认的成功结果，其余显示未确认提示；新增等待提示覆盖现有 16 种应用语言。复用现有确认弹窗与消息样式，没有修改 CSS、活动删除规则、Worker 接口或 Discount Function。
- 已验证：先在旧页面复现排队即成功、失败仍报成功和成功后行未清除，再验证新增回归。最终定向 Node 测试 `38/38` 通过，包含部分成功后查询 503、店铺切换的迟到响应、旧编辑快照和旧启动列表回填；前端生产构建通过，仍有既有大 chunk 提示。独立只读代码审查已修复查询中断丢失成功快照的问题，复审未发现阻塞项。
- 本地浏览器实际验证：生产构建、受控 API 延迟 3.5 秒执行删除、故意持续返回旧活动列表；确认处理期间不显示成功，完成后活动行消失、全部活动数变为 0 并显示成功消息。桌面 `1440×1000` 和窄屏 `390×844` 页面正常，没有运行异常或框架错误遮罩。Browser 插件未提供，使用本机已有 Playwright 和 Chromium；未安装新依赖。参考/交互截图保留于 `/private/tmp/kaching-delete-before.png`、`kaching-delete-pending.png`、`kaching-delete-after.png` 和 `kaching-delete-mobile.png`，不提交 Git。
- 最终前端完整 Node 套件 `371` 项中 `365` 通过、`6` 失败，与修改前既有基线相同：`duplicate quantities in an unsaved draft keep preview radio IDs unique`、`style editor exposes badge placement and separate variant, cart, savings and button controls`、`feedback cards use distinct low-saturation backgrounds for every status`、`right corner badges stay in the tier header on narrow previews`、`shows only the selected variant price in a bundle slot header`、`reserves a readable Recommended column instead of shrinking its label`。未将完整套件标为通过。
- 类型检查仍有 3 项既有错误：`storefront-translation-defaults.ts:188` 两项索引错误和 `StorefrontWidget.tsx:298` 的空 Variant；本轮未改动这些文件。未对真实商家执行删除测试，本次线上删除流程需部署后验收，不能把本地受控数据验收当作生产数据验收。
- 本批修改文件：`web/src/pages/quantity-breaks.tsx`、`web/src/prototype/campaign-api.ts`、`web/src/prototype/admin-workspace-messages.ts`、`web/test/campaign-api.test.mjs`、`web/test/startup-resilience.test.mjs`、本进度文档；无新增或删除文件。用户既有 `web/test/feedback-board.test.mjs` 邮箱断言修改保留且排除本批。拟提交：`fix: confirm campaign deletions before updating the workspace`。

# 2026-11-16 指定分类发布读回校验（已推送并部署）

- 发布记录：应用仓库 `main` 提交 `d238260` 已推送；Worker 版本 `6ce483b0-396c-4520-a220-34c4c156a662` 已部署，发布后 `/health` 返回 HTTP 200。以下保留该批实施时的验证证据与边界。
- 真实 D1 诊断确认 `zheng-haonan` 的分类发布停在 `COLLECTION_METAFIELD_READBACK_INVALID`：`GET /admin/openapi/v20260901/metafields.json` 返回 HTTP 200、`{"metafields":[]}`；最新失败 SHOPLINE TraceID 为 `3b765e07363057351f71d9d32b3f0df6`。此阶段尚未创建自动折扣。
- 使用临时远程预览执行现有店铺会话的只读核查，没有创建、更新或删除商家活动/元字段，没有更新线上流量。`namespace=$app:quantity-breaks` 查询返回空列表（TraceID `8d12d8e5409da86909152bae339fe357`）；同一元字段实际保存为 `app--103645--quantity-breaks`，使用该 namespace 查询返回正确的 Shop 元字段及 `inCollections` 分类列表（TraceID `94ca1b61704c920b0ad1fc95b8e1ab53`）。按 ID 的普通店铺元字段详情查询则返回 `metafield:null`，未采用该方案。临时预览已停止。
- 根因与修复：写入使用 `$app` 别名，平台返回实际展开后的 namespace；原读回请求却继续按别名筛选。现在从本次写入响应的 `accepted.namespace` 构造查询，且仍严格校验读回的 namespace、key、owner_id 及分类 ID 集合。保留空读回/值不一致时阻止发布和记录脱敏 body、SHOPLINE TraceID 的保护，不硬编码应用 ID 或展开后的 namespace。
- 已完整提取并核对桌面 `Discount Function` 的五份资料：《SHOPLINE Product Discount Functions 指引文档（公测版）》《SHOPLINE Product Discount Functions - Admin rest API》《SHOPLINE Product Discount Functions - Input & Output 接口》表格、《Discount Function 支持市场币种优惠金额 DDL831》与《【函数文档】快速入门》。同时查询官方 v20260901 REST 的 metafields 列表/批量操作/详情合同；以实店响应确认通用列表的 `$app` 别名查询边界。
- 分类变量链符合公测指引 1.2：写入 Shop、`owner_resource: Shop`、JSON `inCollections`；Function TOML 保持 `$app:quantity-breaks` / `collection-membership`；GraphQL 继续声明并传入 `$inCollections`，返回 `collectionId/isMember`；Go 按本活动分类 ID 和实时成员标识匹配，并先处理排除商品。动态 Shop 配置与折扣节点 `sale/quantity_breaks` 是两种用途，不能互相替换。本次不改 Function 输入、WASM、市场金额计算或平台扩展版本，不需要重新发布 Function。
- 回归先在旧代码复现同一 `readback is invalid`，再验证新查询通过；新增空读回诊断用例及另一店铺 owner_id 的拒绝覆盖。Worker 完整 44 文件/319 项、类型检查、模块边界检查、dry-run 构建通过。独立代码审查未发现本次修复的阻塞问题。
- Function `go test ./...` 有一项失败：`TestOverlappingDiscountNodesExcludeOnlyConflictedProduct` 仍断言分类重叠时排除该商品，而现有另一测试/实现允许把多个分类候选交给平台处理。已在未修改的 HEAD 独立副本复现同一失败，属于既有测试规则不一致，本次不改已确认的重叠业务规则，也不将 Go 套件记为全绿。
- 边界：实店只读查询已验证，修复后的完整创建/启用与购物车/结账命中需获批发布后验收，不能以模拟测试替代。没有修改前端页面或 CSS；用户既有 `web/test/feedback-board.test.mjs` 邮箱断言修改保留并排除本批。待审文件仅本进度文档、`worker/src/services/collection-publication.ts`、`worker/test/collection-publication.test.ts`，无新增或删除文件。拟提交：`fix: query persisted namespace for collection metafield readback`。

# 2026-11-16 首屏 CSS 稳定加载与主题组件资源（已获本批推送与部署授权）

- 真实浏览器复现：`zheng-haonan` 后台页面根容器计算样式为 `display: block`，外链 CSS 显示已加载但 `cssRules.length` 为 0。通过 CDP 读取该 CSS 资源的浏览器响应，内容实际为 `<!DOCTYPE html>` 开头的应用文档（11081 字符）；终端随后请求相同 URL 已返回正常 CSS。已确认错误响应类型，不将瞬时缺失/缓存的具体来源当作已查明。现有 catch-all 会把缺失的资源请求回退为 SPA HTML，是可重现的错误处理路径。
- 生产构建把本次编译得到的完整 CSS 内嵌至 HTML head，并放在应用模块脚本前，移除外链 stylesheet 引用；CSS Module 名称和 HTML 使用同次构建产物。保留原 CSS 产物及运行时恢复模块。页面文档设置 `Cache-Control: no-store`，减少跨版本文档/资源组合。HTML 增加约 159 KB 未压缩内容，换取首屏不再依赖独立 CSS 网络请求。
- Worker 的静态资源请求直接读取 ASSETS，不进入 OAuth 或 SPA 回退；缺失、重定向或错误返回 HTML 的资源响应为不缓存的 404。正常 CSS 字节和缓存头保持原样，应用前端路径仍支持 SPA 文档回退。没有修改 CSS 选择器、焦点伪类或页面布局。
- 真实商品页 `https://iruuuyv.cn/zh-hans-cn-cn/products/early-autumn-denim-canvas-shoes` 的 HTML 存在 4 个本应用隐藏 block，变体可售且商品 ID 在 active 活动范围内；刷新后仍没有本组件 JS/CSS 引用、资源请求或公开活动查询。只读 D1 查询确认活动及发布状态 active；实际公开活动接口返回 200 和外观配置。因此本次可观察到的阻断发生在主题资源加载阶段，而非没有调整 PC/移动样式。
- SHOPLINE 官方 Theme app extension structure 文档允许 schema 资源声明或 `asset_url()` 引用；现改为 product block 内显式 CDN 样式/延迟脚本引用，避免依赖当前页面未注入的 schema 资源。脚本增加共享 start 与 WeakSet，重复脚本执行不重复挂载旧 block，并可发现后来插入的新 block。未更改活动命中、订阅权益、折扣计算、加购行为或外观默认值。
- 新回归先复现缺失资源返回 HTML、生产文档不携带样式、重复脚本重复挂载，再验证修复通过。默认外观测试读取创建页实际 `defaultCampaignWidgetConfig()`，验证 PC/移动配置无需编辑即可展示档位及可用加购按钮；使用足够库存的测试商品，未对真实店铺创建或修改活动。
- 自动验证：Worker 完整 44 文件/318 项通过，类型检查、dry-run 构建通过；主题完整 51 项通过；SLine 模板语法校验通过；Web 生产构建、内嵌 CSS/恢复定向 5 项通过。Web 全量 362 项中 356 通过、6 项失败，名称与上一批记录的既有失败相同。前端类型检查保留 `storefront-translation-defaults.ts` 两项与 `StorefrontWidget.tsx` 一项既有错误，本轮未新增类型错误。
- 本地真实浏览器验证：测试服务器主动拒绝全部外链 CSS 请求，活动首页和翻译页仍带样式且根容器为 grid、外链 stylesheet 数为 0。PC 与 390px 商品组件使用未改动的默认配置正常显示。截图为本地 mock 业务数据，不能视为生产店铺修复验收或结账验收。
- 参考截图：`workspace-css-missing-reference-2026-11-16.png`、`storefront-widget-missing-reference-2026-11-16.png`；本地截图：`workspace-inline-css-local-2026-11-16.png`、`translations-inline-css-local-2026-11-16.png`、`theme-default-widget-local-2026-11-16.png`、`theme-default-widget-mobile-local-2026-11-16.png`，均在 `docs/reference/screenshots/`。
- 独立代码审查未发现 Critical/Important 阻塞问题；复核生产 CSS 1 项、主题结构/挂载 38 项及 Worker 路由 65 项均通过。SHOPLINE CDN 的最终 URL 与资源加载保留为发布后验收边界。
- 发布边界：用户已确认本批推送与部署。需分别发布 Cloudflare 应用与 SHOPLINE Theme App Extension；仅 Worker 部署不会更新商家主题的扩展文件。真实商品页 CDN 解析、平台扩展发布后资源加载与活动展示仍待实店验证。上一批 `253fd6d` 的推送/部署已经完成，本批实际发布结果以 Git 与 Cloudflare/SHOPLINE 返回记录为准。
- 待审修改：`web/vite.config.ts`、`worker/src/index.ts`、`worker/test/routes-contract.test.ts`、`theme-app-extension/blocks/app-block.html`、`theme-app-extension/public/app-block.js`、`tests/theme-app-extension/structure.test.mjs`、`tests/theme-app-extension/widget-mount.test.mjs`、本进度文档。新增：`web/build/inline-entry-styles.mjs`、`web/test/production-inline-css.test.mjs` 和上述六张截图；无删除文件。用户原有 `web/test/feedback-board.test.mjs` 邮箱断言修改保留并排除本批提交。拟提交：`fix: deliver atomic workspace styles and load theme block assets`。

# 2026-11-16 活动退出确认、创建文案与分类发布响应（已推送并部署）

- 创建/编辑页的页面内“退出编辑”使用 `SaveBar.exitConfirm`，传入应用语言的取消/退出文案；简体中文为“取消 / 退出”，正文为“当前修改尚未保存，确定不保存并退出吗？”。确认事件才调用返回活动首页的回调，不保存表单；取消保留当前输入。原生弹窗标题由 SHOPLINE 宿主提供（该 API 没有 title 参数），非嵌入式弹窗标题为“退出编辑？”。SaveBar 自身的退出仍直接返回，不额外叠加弹窗。
- 创建页 SaveBar 使用 `formType: add` 与“创建”文案，编辑页保留“保存”。16 种应用语言均有创建文案，创建页“保存草稿”保留。
- 分类发布的旧校验强制要求响应包含 `fail_metafields`，但官方 v20260901 OAS 未声明它必填。现在只有明确非空失败列表、非法失败列表、成功项缺失或身份不匹配时才拒绝；随后仍通过原请求 namespace 读回，核对写入/读回 namespace、key、owner_id 和分类 ID 集合。没有移除写后读回保护，没有更改分类冲突与分类并集规则。
- 特别核对了桌面 `Discount Function/SHOPLINE Product Discount Functions 指引文档（公测版）.docx`：其动态变量合同明确使用 `$app:quantity-breaks` 一类应用 namespace 和 `owner_resource: Shop`。该专用合同与通用 REST 文档有差异，本轮保留专用 namespace、资源类型及 Function TOML，不需要因此变更 Function 扩展配置。
- 元字段响应不确认、响应体非法或读回不匹配时，错误携带上游接口、HTTP 状态、SHOPLINE TraceID 和脱敏且限长的 response body，沿现有活动操作诊断写入 D1。路由测试验证 HTTP 200 的业务失败不会继续创建自动折扣，发布状态回到 idle，可重试。
- 已验证：退出取消/确认的 DOM 交互、原生 SDK 消息与确认回调、创建/保存草稿文案、分类元字段响应和路由回滚/诊断。Worker 完整测试 44 文件/313 项通过，类型检查和 dry-run 构建通过；Web 构建通过，保留既有大 chunk 提示。Web 定向 8 项通过，最终完整套件 361 项中 355 通过、6 项失败，与下述修改前复现结果一致。
- 本地浏览器验证了取消保留输入、退出不保存以及“创建”与“保存草稿”同时可见；截图：`docs/reference/screenshots/editor-create-local-2026-11-16.png`、`editor-exit-local-2026-11-16.png`。沿用参考 `local-quantity-edit-shell-390-top.jpg`；截图为本地模拟数据的非嵌入式窄屏界面，不是生产原生 App Bridge 弹窗验收。
- 修改前 HEAD 使用相同 Node 20 复现的六项前端既有失败：`duplicate quantities in an unsaved draft keep preview radio IDs unique`；`style editor exposes badge placement and separate variant, cart, savings and button controls`；`feedback cards use distinct low-saturation backgrounds for every status`；`right corner badges stay in the tier header on narrow previews`；`shows only the selected variant price in a bundle slot header`；`reserves a readable Recommended column instead of shrinking its label`。本轮不将完整前端套件记为全绿。
- 尚未取得本次真实分类发布失败的 SHOPLINE 原始 body，不能认定具体由省略失败列表、namespace 返回差异或平台业务拒绝中的哪项造成；修复后的真实店铺发布与结账命中、SHOPLINE 宿主原生确认按钮及标题仍待部署后验收。
- 本次待审文件：`web/src/prototype/CampaignEditor.tsx`、`admin-feedback.ts`、`editor-save-bar-messages.ts`；`web/test/admin-feedback.test.mjs`、`campaign-editor-exit.test.mjs`、`editor-coverage-collapse.test.mjs`；`worker/src/services/collection-publication.ts`；`worker/test/collection-publication.test.ts`、`routes-contract.test.ts`；本进度文档及上述两张截图。原有用户修改 `web/test/feedback-board.test.mjs` 未纳入本轮修改范围。已提交并推送到应用仓库 `main`：`253fd6d`（`fix: correct editor exit flow and collection metafield confirmation`）；Cloudflare Worker 已部署 `ccfdc72a-c5ab-4520-b6fe-2797a0593f1c`，生产 `/health` 返回 200。

# 2026-11-14 活动首页启动与原生套餐入口

- 活动首页改用单次鉴权的 `/api/quantity-breaks/bootstrap`：Worker 并行读取订阅权益、可信店铺 ID 和 D1 活动配置。权益有效时首屏显示配置，关联 SHOPLINE 折扣先标记未核验，随后异步读取平台实时状态。翻译与建议页面仍独立启动，不请求活动列表。
- 订阅明确无权益时，启动接口无需等待慢速店铺身份读取即可返回套餐决定，且不向浏览器返回活动数据；临时订阅错误仍显示可重试的错误状态，不误判为未订阅。活动写接口原有服务端权益校验不变。
- 套餐页移除支付核验中锁定与核验提示，显示单个购买按钮；嵌入式页面调用 SHOPLINE App Bridge `Redirect.toAdminPage(ADMIN_SECTION.PACKAGE_PURCHASE, { appKey })`，非嵌入式环境保留原付款链接回退。支付回跳后的订阅复核仍在后台轮询最多 30 秒。
- 已验证：Worker 44 文件/303 项、前端定向 32 项（含原生跳转参数）、Worker 类型检查、Web 生产构建、Worker dry-run 构建和 `git diff --check` 均通过。前端 `tsc --noEmit` 的 3 条既有错误仍位于 `storefront-translation-defaults.ts` 与 `StorefrontWidget.tsx`，不在本轮修改文件中。
- 尚未在认证 SHOPLINE iframe 中验证首次进入、试用/已订阅/失效店铺和原生购买跳转；本轮未获得目标状态的本地截图，因此活动首页与套餐页的视觉验收仍待真实会话完成。发布状态以本次 Git 提交和 Cloudflare 部署记录为准。

# 2026-11-13 嵌入式入口、授权恢复与数据启动修复（发布前验证完成，已获推送/部署授权）

- 根入口会保留 SHOPLINE `path` 指定页面，编码与未编码的活动、翻译和建议入口一致；修复正确解析后又被首页重写的问题。
- Session Token 获取使用 5 秒总预算，共享尚未完成的 SDK 请求；不缓存完成后的 JWT，写请求不自动重发。Worker 自动刷新等待真正的新 Token，刷新网络预算 8 秒、竞争者最长等待 10 秒；临时故障返回 503，不再误判成需要重新授权。
- 订阅与可信店铺身份并行读取，每个启动读取阶段有 15 秒完整读取预算和一次临时失败重试。翻译/建议独立启动，不再等待活动；切页后台复核订阅，恢复可见时保留成功加载内容。店铺身份改变会清理旧内容，权益确认失效则进入套餐页。
- 活动页先显示鉴权后的 D1 配置，关联折扣先标记“状态暂无法核验”，随后后台权威查询 SHOPLINE；所有写操作继续执行原有鉴权、订阅及平台核验。活动查询未完成时编辑页不提前误报“活动不存在”。
- 浏览器限制 Storage 不再阻止挂载或造成无限刷新；5 秒文档恢复最多一次，第二次保留骨架，迟到初始化仍可挂载。启动阶段错误上报带文档 attemptId、阶段、耗时与可获得的关联 TraceID；Session Token 不可用时先留在内存，后续鉴权成功才上报。
- 没有修改任何 CSS 文件、焦点样式、活动保存/暂停/删除业务规则，也没有执行 D1 迁移。本轮只涉及商家应用仓库，不涉及开发者后台仓库。
- 本地浏览器模拟接口验证了编码翻译/建议入口、中文失败与重试、活动配置在延迟核验时先显示；截图见 `docs/reference/screenshots/startup-{home,translations,feedback,recovery}-2026-11-13.png`。参考截图沿用 `shopify-home-1037.jpg`、`shopify-translations-en-1037.jpg`、`feedback-board-1440.png`；本次保持原页面布局。上述均不是认证 SHOPLINE iframe 的生产验证。
- Worker 全量 Vitest 44 文件/299 项、Worker TypeScript、模块边界和 dry-run 构建通过；前端生产构建通过（保留大 chunk 提示）。前端启动定向 43 项及补充店铺切换/权益失效 2 项通过，最终页面恢复/隔离/权益/路由组 18/18；切页权益复核独立回归验证已修复。最终 Web 全量 342 项中 336 通过，剩余 6 项与修改前基线一致。
- 已用相同 Node 22 在修改前 `15d10d3` 基线复现 6 项现有预览/CSS 测试失败（90 项中 84 通过）；前端类型检查仍有 3 项基线错误，位于 `storefront-translation-defaults.ts:188` 与 `StorefrontWidget.tsx:298`，本轮未修改这些文件。不得将完整前端检查记为全绿。
- 独立审查已修复切页未复核权益的回归，复审无未解决的 Critical/Important。用户已批准本轮推送并部署；此处记录发布前验证结果，真实店铺冷启动、三页切换、Token 临期刷新与 SHOPLINE 嵌入式限制仍需发布后验收，不能保证网络或上游故障时永不出现恢复界面。

# 2026-11-13 活动编辑 SaveBar 与主题组件设置指南（已推送并部署）

- 活动编辑页会在首次修改后使用 SHOPLINE App Bridge SaveBar 保存；退出编辑会先确认，确认离开时不会提交活动变更。非嵌入式环境保留等效的页面内操作栏与确认弹窗。
- 活动首页顶部新增可关闭的主题组件设置提示，可打开多语言两步操作指南并展示主题编辑器截图。关闭状态仅保存于当前浏览器的本地偏好。
- 本轮同时保留并发布 Theme App Block 已有的语言名称更新。SaveBar 和设置指南定向测试 2/2、关联回归测试 37/39、生产构建与 `git diff --check` 通过；关联回归的两个失败以及完整前端套件的 7 个失败均为既有的预览、样式或 Node 22 JSON import assertion 问题，未涉及本轮功能。TypeScript 检查仍被 5 个既有错误阻塞，均不在本轮文件中。
- Cloudflare Worker 已部署版本 `38ccb916-7492-4f0d-9a6c-c8cc02124f81`，`/health`、首页及两张设置指南图片均返回 `200`。Theme App Block 已上传到 SHOPLINE 扩展草稿，仍需在合作伙伴后台发布该版本；本地 Vite 缺少 SHOPLINE 嵌入式店铺会话，原生 App Bridge SaveBar、真实活动首页和移动端视觉截图仍待在 SHOPLINE 后台实机验收，不能标记为已实机验证。

# 2026-11-13 嵌入式应用首屏启动优化（本地实现，待推送）

- 应用入口不再只显示圆形加载符；HTML 会立即渲染与活动页一致的数据无关骨架（页眉、语言/创建操作区、四项概览和活动表格轮廓）。因此 SHOPLINE iframe 调度或脚本下载较慢时，商家仍先看到可信的后台工作区结构。
- 首次启动在 5 秒内没有真正挂载时仅静默刷新一次；重复超时会保留骨架，既不会显示“应用加载失败”，也不会进入刷新循环。真实订阅、店铺身份、活动接口错误仍保留各页面原有的明确重试入口。
- Quantity Breaks 工作区改为入口静态依赖，并通过 Vite `modulepreload` 与约 89KB 的启动模块并行获取；工作区约 601KB（gzip 约 200KB）保持为独立 chunk，避免原先入口执行后才请求工作区的串行瀑布。`preview/feedback-board` 与通用模板路由继续按需加载。
- 浏览器本地 Performance Timeline 新增 `quantity-breaks:guard`、`react-mounted`、`subscription-ready`、`shop-ready`、`campaigns-ready` 标记；不发起网络请求、不保存店铺标识或令牌。
- 已验证：启动壳/恢复/入口/App Bridge 生命周期/性能标记定向测试 `12/12` 通过，生产构建与 `git diff --check` 通过；桌面和 390px 本地预览未出现启动失败页，且控制台无错误。完整 Web 原型测试本轮为 `304/309`；5 项既有失败为未保存草稿 radio ID、样式标签字段、前台角标定位、规格价格标签 HTML 和推荐按钮字体 CSS 断言，均不触及本次入口或启动逻辑。`tsc --noEmit` 仍有 5 项既有错误，位于认证请求参数、翻译索引与 Storefront Variant 空值处理；本次引入的全局启动回调类型错误已修复。尚未推送、部署或在真实 SHOPLINE iframe 中复核，不能标记为线上验收完成。

# 2026-11-12 SHOPLINE 商品分页解析失败阶段诊断（本地实现，待推送）

- 修复 `rel = "next"` 后，线上仍报告 `Link`、`page_info` 与下一页关系都存在、但游标为空，证明仅放宽关系属性空格不是完整根因；停止继续猜测或扩大解析规则。
- 游标解析现以单一安全结果返回，满页且未取得游标时记录 `paginationReason`、是否找到下一页段及是否找到包含 `page_info` 的尖括号 URL。失败原因仅可能是缺失链接/下一页关系/URL/参数、URL 无效或游标含空白；不记录完整 Link、游标、商品内容或令牌。
- 新日志用于用真实响应精确确认解析断点后再进行唯一功能修复；路由契约覆盖缺少 Link 的原因字段。尚未部署。

# 2026-11-12 SHOPLINE 商品分页 `rel` 空格兼容（本地实现，待推送）

- 通过线上 Worker `catalog_pagination_cursor_missing` 日志确认：店铺 `buchaqian` 的商品目录请求实际返回 50 条商品，且 SHOPLINE 响应确实包含 `Link`、`page_info` 和下一页关系；TraceID 分别为 `f25394bff38aabea7c7f59880ed5c540`、`6cff4704442722affdd865ce0e6e4162`。因此问题不在 SHOPLINE 未提供分页数据，也不在前端状态链。
- 根因是目录解析器只匹配 `rel="next"`，而真实 `Link` 使用 `rel = "next"`。现改为允许等号两侧空白，仍只从 `rel=next` 链接提取 `page_info`；不会改变 SHOPLINE 游标、不回退为猜测性的 `since_id` 分页。
- 新增路由契约回归，覆盖商品与指定分类列表的带空格 `rel = "next"` 格式。分类内商品列表和市场分页也调用相同解析器；定向测试已由失败变为通过。尚未部署，真实下一页按钮仍待发布后复核。

# 2026-11-12 SHOPLINE 商品分页上游证据采集（本地实现，待推送）

- 线上实测商品选择器已加载 50 条商品但“下一页”仍不可用；前两次对 `Link` 字符格式的兼容修复尚未改变该真实结果，不能继续基于格式猜测修改解析逻辑。
- 当商品目录请求恰好返回满页却没有解析出下一页游标时，Worker 现在输出 `catalog_pagination_cursor_missing` 脱敏日志。日志只包含店铺 handle、返回商品数、页大小、是否带请求游标、`Link` 是否存在/长度、是否含 `page_info`/`rel=next`、解析结果及 SHOPLINE TraceID；不记录 access token、商品正文、完整 `Link` 或 `page_info`。
- 该日志用于部署后通过 `wrangler tail` 确认故障边界：没有 `Link` 时排查 SHOPLINE 上游请求/行为；有 `Link` 却未解析时按真实结构修复；游标已解析但页面仍不可点时再检查 API 响应到前端状态链。尚未部署，不标记为线上验证完成。

# 2026-11-12 SHOPLINE 商品分页前置标签兼容（本地实现，待推送）

- 在认证的 SHOPLINE 嵌入式编辑页实际观察到：商品选择器加载了 50 条商品，但“下一页”保持禁用，证明前端没有收到 `nextPageInfo`。用户提供的 `Link` 样例含有前置 `<br>`；旧解析器把第一个尖括号标签识别为 `br`，未继续查找实际分页 URL。
- 目录路由现遍历 `rel="next"` 段内全部尖括号链接，并只选择含 `page_info` 的 URL。标准、转义、HTML 编码及前置 `<br>` 格式均归一化为同一页游标，前端下一页请求继续原样传递。
- 已验证：路由契约 `53/53`；Worker 全量 Vitest `44` 文件/`281` 项、TypeScript、模块边界检查、Worker dry-run 构建和 `git diff --check` 通过。尚未部署，真实店铺下一页启用与请求仍待部署后复核。

# 2026-11-12 SHOPLINE 商品游标 Link 兼容（本地实现，待推送）

- 商品目录路由继续使用 `GET /products/products.json` 的 `link` 响应头取得下一页 `page_info`。除标准原始头值外，解析器现兼容响应经过转义或 HTML 编码后的 `\\<...&amp;page_info=...\\>; rel='next'` 格式；游标归一化后才返回给前端，前端仍以原样游标请求下一页。
- 已验证：针对原始、同时包含 `previous` / `next`、以及转义和 HTML 编码 `Link` 的路由契约 `52/52`；Worker 全量 Vitest `44` 文件/`280` 项、TypeScript、模块边界检查、Worker dry-run 构建和 `git diff --check` 均通过。
- 尚未重新部署，认证 SHOPLINE 店铺中点击“下一页”的实际请求与响应仍待部署后验收；不得把该项标为线上已验证。

# 2026-11-12 商品选择器 SHOPLINE 游标分页（本地实现，待推送）

- 当前工作树已恢复为 `codex/tier-savings-badge` 的 `4f83ad5` 文件基线；恢复前的 `main` 版本 `2102bf8` 已保留在本地安全分支 `codex/backup-main-before-4f83ad5-pagination`。用户指定的历史 Worker 版本 `a17e2da1-443f-4dcf-848a-795ca53a19de` 仅作为恢复参考；因其后加入本次分页改动，获批部署会生成新的 Worker Version ID，而非直接原样重新上线该历史版本。
- 指定商品选择器默认每页请求 50 条。Worker 从 SHOPLINE 响应 `Link` 中匹配 `rel="next"`，提取链接内 `page_info` 并返回给前端；下一页请求原样携带该游标。响应同时含 `rel="previous"` 和 `rel="next"` 时只使用后一者。上一页和下一页控件在加载、首页与末页均继续渲染，不能翻页时保持灰色不可点击状态。
- 已验证：商品选择器定向回归 `9/9`、Worker 路由契约 `51/51`、Worker 全量 Vitest `44` 文件/`279` 项、Worker TypeScript、模块边界检查、Worker dry-run 构建与 `git diff --check` 均通过。Web 完整原型套件当前为 `252/259`，存在恢复基线的 7 项失败（旧编辑器结构断言、Node 22 的 JSON import assertion、订阅页测试进程等），未由本次分页改动引入。
- 尚未在认证 SHOPLINE 店铺中获取真实 `Link` 响应头或操作翻页，亦未重新部署 Worker，因此不标记为线上验收完成；本地独立页面缺少嵌入式店铺会话，无法生成可信的活动编辑页截图。

# 2026-11-11 指定市场折扣编辑预览（本地实现，待推送）

- 折扣编辑页右侧预览已将“前台语言”替换为“指定市场”。默认选中 SHOPLINE 主市场；没有主市场时依次回退到第一个启用市场、首个市场。预览语言来自该市场的 `web_presence.default_locale`，翻译页原有语言选择器不受影响。
- Worker 市场接口新增主市场、默认语言和市场国家代码；新增经认证的商品市场价格代理，使用 `/markets/{productId}/price.json`，每次最多传 10 个国家码，并使用统一 SHOPLINE Admin 请求头。异常/缺失市场价格会在预览中明确显示不可用，不回退为店铺币种价格。
- 市场价格作为当前预览产品所有已选规格的统一基准单价。四种固定金额档位仅使用 `marketOverrides[marketId]` 的 `specified_amount`；自动换算和缺少指定金额均禁用预览加购并显示不可换算状态。金额、档位副标题、规格、购物车明细和汇总均按市场币种与语言格式化。
- 已验证：市场预览相关 Web 回归 `37/37`、Worker 路由契约 `50/50`、Worker 全量测试、Worker TypeScript、Worker dry-run 构建、Web 生产构建和 `git diff --check`。完整 Web 原型套件仍有 6 项既有失败（草稿 radio ID、样式标签/角标 CSS、订阅页回调），不涉及本次市场预览代码；本地 Vite 在缺少嵌入式 SHOPLINE 会话时仅呈现空应用壳，无法产生可信 PC/Mobile 截图，真实店铺仍待部署后验收。

# 2026-11-10 档位优惠标签响应式样式（本地实现，待推送）

- 档位优惠标签的背景色、文字颜色、圆角、字号与字重现均由当前样式设备标签独立保存；在样式中切换 PC / Mobile 后编辑的值不会互相覆盖。
- “显示档位优惠标签”调整为单独一行，右侧新增优惠标签圆角滑杆；颜色区域与字体区域分别新增档位优惠标签的文字/背景和字号/字重配置。
- 前台预览和 Theme App Block 都会在 750px 断点使用对应设备变量。Theme App Block 的字段名为 `tierSavingsBadgeText`、`tierSavingsBadgeBackground`、`tierSavingsBadgeRadiusPx`、`typography.tierSavingsBadge.sizePx`、`typography.tierSavingsBadge.weight`；旧活动缺少这些字段时安全回退默认值。
- 已验证：主题扩展测试 `47/47`、档位优惠标签编辑器定向测试、前端生产构建与 `git diff --check` 通过。完整原型套件仍有既有的推荐按钮字体 CSS 断言失败（`variant-display.test.mjs`），不涉及本次标签字段；当前环境无可用的嵌入式店铺会话，尚未生成可信 PC/Mobile 视觉截图。

# 2026-11-10 翻译语言刷新与档位优惠标签配置（本地实现，待推送）

- 翻译页恢复 sessionStorage 中的店铺语言后不再提前结束请求；先使用缓存避免空白，再后台刷新 `/api/quantity-breaks/store-languages`。因此 SHOPLINE 已返回的完整启用语言列表会覆盖旧的四语言缓存，网络刷新失败时继续保留缓存内容。
- 翻译页右侧预览固定开启档位优惠标签，便于所有前台语言直接核验标签译文；活动自身的开关仍由商家配置，且优惠金额为零时继续隐藏标签。
- 档位优惠标签的显示开关、圆角、分组、背景色、文字色与字体标签已覆盖全部应用语言；样式编辑器继续以当前后台语言显示这些字段。
- 已同步当前分支缺失的档位和样式网格 CSS：档位为单列，金额支持换行并两端对齐，颜色网格为五列，字体控制为三列；对应的色板弹层和旧断言一并调整。
- Theme App Block 源码已验证会输出并按 750px 切换桌面/移动端优惠标签的圆角、背景、文字色、字号与字重 token；线上若仍未生效，原因是 Theme App Block 尚未通过 SHOPLINE CLI/Partner Portal 上传发布，Worker 部署不包含该扩展。
- 已验证：主题扩展测试 47/47、相关 Web 测试 38/38、Web 生产构建、Worker 类型检查与 dry-run 构建、`git diff --check`。完整 Web 套件仍有两项既有失败：未保存草稿的预览 radio ID，以及无 i18n 初始化的固定英文样式标签断言。Vite 路由 `http://127.0.0.1:4173/quantity-breaks/translations` 返回 200；Playwright Chromium 未安装，未生成可信截图，真实 SHOPLINE 嵌入式页面及主题扩展发布后仍需实机验收。

# 2026-11-10 档位优惠金额标签（本地实现，待推送）

- 样式设置的“标签位置”新增“显示档位优惠标签”开关；默认关闭，旧活动及其移动配置归一化后同样保持关闭。
- 开启后，前台预览与 Theme App Block 在每档标题右侧显示可翻译的节省标签。标签模板键为 `widget.tier_savings_badge`，动态金额变量为 `{saving_amount}`；仅当该档实际节省金额大于零时显示。
- 翻译页“组件标题”已提供该文案，前台语言默认值和 Theme App Block 的 36 个静态语言包均已补齐。标题与标签行采用两端对齐，金额较长时可换行。
- 已验证：主题扩展测试 `46/46`、Worker 类型检查与完整 Worker 测试、前端生产构建通过；Web 原型完整套件为 `269/276`，7 项既有失败（预览 radio ID、样式/角标旧断言、订阅页和旧布局断言）不涉及本功能。本地无可用的嵌入式店铺会话或浏览器测试运行器，未生成可信视觉截图；真实店铺展示待部署后验收。

# 2026-11-10 日期控件交互样式（本地实现，待推送）

- 同步桌面工作区的日期控件样式：永不过期复选框标签及可编辑日期输入显示可点击光标；结束时间禁用时继续显示不可点击光标。规则摘要恢复行距和分隔线。

# 2026-11-10 规则摘要精简与布局（本地实现，待推送）

- 移除规则摘要中的活动名称 H2，将叠加信息移至商品范围之后；名称、折扣名称、商品范围、叠加和起止时间按双列排列，优惠层级表独占整行。
- 合并桌面工作区中与当前摘要结构匹配的 CSS：摘要行采用紧凑无分隔线样式，叠加标签横向展示；未采用已失效的旧预览标题选择器。

# 2026-11-10 规则摘要名称字段（本地实现，待推送）

- 规则摘要移除“规则摘要”眉题和仅供预览说明，新增“名称（仅您可见）”与“折扣名称（显示在购物车/结账页面）”两行，复用编辑页已有的多语言字段和值。

# 2026-11-09 统一页眉样式（本地实现，待推送）

- 合并桌面工作区中仍适配当前组件结构的 `.eyebrow` 样式：20px、650 字重及较紧凑字距。翻译页移除 H1 后，“前台文案”由该样式承担标题层级；保留已发布的预览控制台、冲突提示和规则摘要规则。

# 2026-11-09 翻译页标题与编辑器 CSS（本地实现，待推送）

- 翻译页移除了重复的 H1；页面眉题改为使用现有的 `translationTitle` 多语言文案，简体与繁体中文均显示“前台文案”。
- 已合并桌面工作区中对当前实现仍有效的 CSS：翻译页取消最大宽度限制，需求与建议页眉题使用 20px、650 字重；其余桌面 CSS 修改在当前分支已由后续预览重构等效覆盖，未重复添加失效规则。

# 2026-11-09 需求与建议联系邮箱（已部署）

- 需求与建议页面面向商家的联系邮箱已更新为 `appideasbox@gmail.com`，`mailto:` 链接与可见文本保持一致；历史设计文档保留原值作为当时的记录。
- 已验证：邮箱渲染回归测试通过，前端生产构建通过。

# 2026-11-09 折扣名称与商品范围冲突明细（本地实现，待推送）

- 活动编辑器已拆分“名称（仅您可见）”与“折扣名称（显示在购物车/结账页面）”。旧活动没有折扣名称时继续使用其现有活动名称；仅折扣名称会作为 SHOPLINE 自动折扣标题发送，活动名称不做批量改名。
- 指定商品和指定商品分类的覆盖检查均改用服务端明细接口。指定分类按分类 ID 与其他分类活动比较，发生重叠时阻止保存，并在浅红检查区域以“活动名称 / 商品分类”表格逐行列出实际重叠分类；指定分类与指定商品仍只显示原有优先级提醒，不阻止保存。商品或分类标题读取失败时后端安全回退显示 ID。
- 活动列表在“活动”右侧新增本地化的“折扣名称”列，移动卡片同步显示；所有 16 个后台应用语言均补齐新字段与冲突表头文案。长商品名和名称在冲突表中换行，窄屏表格横向滚动而不撑破编辑器。
- 已验证：Worker 自动折扣发布和覆盖接口测试 `68/68` 通过，Worker 全量测试 `41` 个文件、`254/254` 通过；前端适配、接口、编辑器、多语言和列表定向测试中，分类冲突保存阻断、分类名称明细和覆盖请求体均已通过；前端全量原型测试为 `262/269`，其余 `7` 项失败为既有的预览 radio、样式字段/角标和布局断言，和本次无关。前端生产构建、Worker TypeScript 检查及 `git diff --check` 通过。当前环境无可用的嵌入式店铺会话，未生成可信桌面/移动截图，真实 SHOPLINE 编辑页与结账展示仍待部署后验收。

# 2026-11-09 折扣编辑器规则汇总与排期状态（本地实现，待推送）

- 规则汇总现在按独立行显示已开启的叠加类型，顺序固定为商品折扣、订单折扣、运费折扣；指定市场金额模式继续显示既有的不可叠加原因。汇总同时显示开始时间与结束时间，并在持续有效活动中明确显示“永不过期”。
- 开始时间和结束时间现以同一行的两个等宽列展示：上排为字段名，下排为日期时间或“永不过期”，两列之间仅保留 16px 间距、无分隔线；其余汇总字段继续独占整行。
- 前台预览商品栏已移除商品标题前的“商品:”前缀，仍保留商品标题的单行省略、完整 `title` 属性和选择商品入口。勾选“永不过期”时，结束时间输入框继续使用原有禁用逻辑，并新增灰显和 `not-allowed` 光标。
- 已验证：新增 DOM/CSS 回归断言 4/4、前端生产构建与 `git diff --check`。完整前端原型套件为 257/264，7 项既有的 preview radio ID、样式字段/角标与付款回调等失败仍存在，未涉及本次编辑器变更。本地 `/quantity-breaks/new` 在没有嵌入式店铺会话时仍只显示空容器，无法生成可信桌面或手机截图；真实 SHOPLINE 编辑页视觉验收仍待完成。

# 2026-11-09 折扣前台预览工具栏与标题翻译（本地实现，待推送）

- 活动编辑器的前台预览头部改为三组两行信息：前台实时预览/PC-Mobile、前台语言/语言选择器、指定商品预览/商品名称。三组标题统一使用 `#31423c`、`12px`、`800` 字重；商品名称在可用宽度内单行省略，完整名称保留在 `title` 属性中。选择商品入口沿用既有单商品弹窗，并改为带可访问名称和提示的加号按钮。
- `previewOnly` 模式不再吞掉 `Bundle & save`：未保存自定义 `widget.title` 时回退默认文案，已明确保存空标题时仍按商家配置隐藏。前台语言选择继续读取店铺启用语言及对应翻译配置。
- 已验证：预览语言、商品选择和 storefront 文案定向测试 `5/5` 通过，前端生产构建通过，`git diff --check` 通过，未新增或修改焦点伪类规则。完整前端原型套件为 `254/261`，7 项既有无关失败仍存在。已尝试本地桌面/移动视觉验收，但本地页面没有嵌入式店铺会话、仅渲染空容器，未生成可信截图；真实店铺会话中的视觉验收仍待完成。

# 2026-11-05 翻译保存栏与自动覆盖检查（本地实现，待推送）

- 翻译页首次读取时以补齐后的初始草稿作为保存基线，不再把未修改的默认译文标记为“未保存”。每个店铺的语言草稿会暂存于浏览器会话；离开其他应用标签页再返回时，未更新的编辑内容仍可恢复。
- 编辑译文后显示固定的 SaveBar；简体中文操作为“放弃更改 / 更新”。在有未保存编辑时请求切换前台语言会停留在当前语言，必须通过 SaveBar 放弃或更新，旧“未保存的修改”切换确认弹窗及其页面样式已移除。
- 创建、发布和更新活动会在提交前自动执行商品覆盖范围检查；无冲突才继续保存，冲突或无法核验会阻止保存。手动“检查商品覆盖范围”继续保留，用于在提交前即时预览结果。
- 样式设置简体中文文案已从“图片下方显示颜色值”改为“图片下方显示规格值”。
- 已验证：翻译草稿/SaveBar/自动覆盖检查及相关 i18n 回归共 14 项通过，前端生产构建通过；本地 `http://127.0.0.1:4173/quantity-breaks/translations` 返回 200。当前环境没有 Playwright、Puppeteer 或可用浏览器内核，未生成本轮桌面/移动截图，不能标记为真实嵌入式店铺视觉验收完成。

# 2026-11-05 独立页面加载门控与原生翻译 SaveBar（本地实现，待推送）

- 翻译页与需求/建议页不再受活动页 `loadingFrame` 门控；翻译页在店铺身份尚未就绪时保持自己的 `translationLoadingFrame`，需求/建议页使用 `FeedbackBoardLoading`，避免活动骨架与实际页面架构同时出现。
- 翻译页嵌入 SHOPLINE Admin 时改用 `@shoplinedev/appbridge` 的 `SaveBar.create(app)`，通过原生 SaveBar action 处理更新与放弃；非嵌入式本地预览保留 fallback 操作栏。新增加载门控与 App Bridge 回归断言，定向测试 6/6、前端生产构建通过。
- 完整前端原型测试 255 项通过 253 项；两个失败为既有的编辑器重复数量预览和订阅支付状态用例。前端 TypeScript 检查仍有 `authenticated-fetch.ts` 的两处既有类型错误，未新增本次修改相关错误。

# 2026-11-04 折扣草稿与暂停操作修复（本地实现，待推送部署）

- 无 `platformDiscountId` 的活动被视为草稿，不会发起空 ID 的 SHOPLINE 状态读取。历史本地状态残留为 `active`、但没有平台折扣关联的活动，也会按草稿允许保存；同一店铺其他活动仍在生效不会阻断该草稿的更新。
- 普通暂停和内部管理暂停统一通过 REST 发送完整的 Function 自动折扣规则，并把 `ends_at` 设为当前时间后 10 秒。这样与排期暂停使用相同的更新契约，避免只传 `function_id` 与 `ends_at` 导致的 SHOPLINE 400。
- 新增远程 D1 迁移 `0017_campaign_operation_queue.sql`，创建批量删除和旧 `expired` 折扣异步清理使用的两个操作队列表及索引。草稿批量删除不再因生产库缺表失败；已失效活动重新启用后的旧折扣清理可被正常入队和重试。
- 移除了当前分支中引用但未随代码提交的观测模块入口，避免 Worker 因缺失文件无法构建。该未审阅观测功能未并入本次发布。
- 已验证：新增草稿更新、完整暂停请求体和远程迁移 SQL 回归；Worker 全量 Vitest `38/38` 文件、`244/244` 项通过，Worker TypeScript、`wrangler deploy --dry-run` 和 `git diff --check` 通过。真实 SHOPLINE 后台的暂停、草稿启动、旧折扣异步删除以及远程 D1 迁移仍待发布后验收。

# 2026-11-04 活动编辑无闪烁与规格换行（本地实现，待推送）

- 从应用活动列表进入编辑页时，先将该行完整活动数据作为编辑器快照渲染；列表刷新、店铺身份刷新和后台单活动状态同步均只更新缓存，不再卸载或重新挂载编辑器。草稿没有 `platformDiscountId` 时跳过平台状态读取。订阅仍会在路由变化后复核，但已有订阅结果的编辑页不会因此显示预加载框。
- 从 SHOPLINE 自动折扣详情深链接进入时，仅调用按平台折扣 ID 查询单个活动的接口；成功后直接替换为编辑 URL 并保留嵌入式 query/hash，失败后才显示受控的“活动不存在”页面，不会闪现通用 404。
- 应用预览与 Theme App Block 的规格行改为 `repeat(auto-fit, minmax(50%, 1fr))` 网格；档位原价/售价和纯文本规格值可在窄容器内断词换行。颜色色板已被确认移除，相关过期测试改为验证 Dropdown、图片和纯文本三种可用规格展示方式。
- 已验证：前端原型测试 `246/246`、Theme App Block 测试与前端生产构建通过，`git diff --check` 通过。测试环境仍有既有 Vite WebSocket 端口提示及 jsdom `attachEvent` 控制台提示，但没有失败断言。真实 SHOPLINE 嵌入式列表点击、折扣后台深链接和桌面/移动截图因本地无认证店铺会话尚未验证，不标记为线上验收完成。

# 2026-11-04 折扣生命周期、状态同步与排期校验（本地实现，待推送）

- 商家暂停活动继续将 SHOPLINE 自动折扣的 `ends_at` 更新为当前时间加 10 秒；列表和详情读取到已过期状态后删除旧平台折扣、清除旧映射，并将本地配置置为 Paused。商家再次启用时先完成该清理，再按照保留的配置创建新的持续生效自动折扣，不会尝试更新已过期的旧折扣。
- SHOPLINE 后台手动删除折扣时，应用列表对账会将该活动标记为平台缺失；应用删除活动前也会先对账，因此在已确认平台不存在时允许删除本地配置，不再返回“Pause or reconcile the published campaign before deletion”。列表读取使用一次分页 Function 折扣列表请求和批量 D1 投影/写入，避免逐行状态查询。
- 编辑器要求活动名称、开始时间，以及未勾选“永不过期”时的结束时间。缺失项会展开设置区并显示当前应用语言的通知；“永不过期”会发送 `ends_at: null`。英语、法语、德语、西班牙语、意大利语、荷兰语、瑞典语、土耳其语、葡萄牙语、简体中文、繁体中文，以及已加载的印尼语、日语、马来语、泰语、越南语均有对应字段文案。为兼容已保存的持续生效活动，历史记录没有 `neverExpires` 但没有结束时间时仍被当作永不过期。
- 已验证：Worker 全量 36 个测试文件、217 项通过；Worker TypeScript、模块边界与 `wrangler deploy --dry-run` 通过。前端测试按三组完整执行，共 199 项通过，且前端生产构建通过；`git diff --check` 通过。测试环境仍有既有的 Vite WebSocket 端口提示和 jsdom `attachEvent` 控制台提示，但命令退出成功。真实 SHOPLINE 嵌入式后台仍需验收 10 秒过期、旧折扣清理、新折扣创建、后台手动删除与 App Bridge 提示，未标记为线上验收完成。

# 2026-11-03 自动折扣 REST 延迟暂停（本地实现，待部署验收）

商家暂停应用自动折扣时，Worker 现在通过 REST 更新将 `ends_at` 写为请求时间后 10 秒；这样满足 SHOPLINE 对结束时间必须严格晚于当前时间的校验。更新后立即只回读一次：若平台已经返回过期状态，活动直接显示已暂停；若仍为 active，D1 仅保留 `pausing` 操作状态，列表显示“暂停中”，并在下一次正常列表同步读到过期状态后才显示已暂停。暂停期间保留原平台折扣 ID，恢复仍使用同一 REST 更新接口清除 `ends_at`。订阅到期删除折扣的逻辑未改变，也未新增轮询请求。

已验证：暂停服务、仓储状态转换、内部管理接口、路由合同测试共 69 项通过；前端“暂停中”适配与批量确认测试 15 项通过；Worker TypeScript 检查、模块边界检查、Worker dry-run 构建与前端生产构建通过。真实 SHOPLINE 店铺仍需验证 REST 更新后 10 秒的状态切换和嵌入式列表渲染，未标记为线上验收完成。

# 2026-11-03 SHOPLINE 自动折扣状态核验（本地实现，待部署验收）

修复 REST 自动折扣短 ID 被直接传入 GraphQL `automaticDiscountNode` 的状态核验错误。Worker 现在会先通过 `automaticDiscountNodes` 把 REST `app_discount_id` 解析为 `DiscountAutomaticNode` 全局 ID；首次历史数据解析限制为最多 5 页、每页 50 条且串行执行，未穷尽列表时保持待核验，不会误判为已删除。解析成功后的 Node ID 会保存到 D1 发布记录，后续列表同步、批量启停和订阅到期删除直接使用该 ID，避免重复扫描并继续保留 SHOPLINE `429`/`Retry-After` 的退避处理。

已验证：新增 Node 解析和暂停回读的 Node Vitest 回归测试 2/2、Worker TypeScript 检查通过。现有 Cloudflare Worker Vitest 集成运行器在本机收集测试前即因全局定时器隔离报错，35 个既有测试文件均未执行；该基线问题未在本次修改中掩盖。真实 SHOPLINE 店铺的 Node 解析、暂停、启用和删除尚未执行，未标记为线上验收完成。

# 2026-11-03 SHOPLINE 折扣深链接编辑入口（本地实现，待部署验收）

兼容 SHOPLINE 折扣列表跳转的完整路径 `/admin/apps/{appKey}/product-discount-customizations/{functionId}/{discountId}`，入口会在通用路由处理前加载 Quantity Breaks 工作区，并将其规范化为应用已有的折扣编辑入口；原有短路径继续兼容。工作区会按 `discountId` 映射本地活动，直接打开与活动列表相同的编辑页；正在启用的活动继续通过既有的已发布规则更新流程保存。未知或已删除的平台折扣显示受控的活动不存在状态，不再落入通用 404。内部 URL 替换保留嵌入式 query 与 hash。

已验证：`web/test/campaign-detail.test.mjs`、`web/test/home-entry.test.mjs` 与 `web/test/workspace-navigation.test.mjs` 共 7/7，通过前端生产构建。真实 SHOPLINE 后台点击、认证会话、App Bridge 和已删除平台折扣的线上表现尚未在开发店实测，未标记为平台验收完成。

# 2026-11-02 需求与建议滚动预加载反馈（本地实现，待推送）

无限滚动的观察器一触发即设置加载状态，不再等待下一页请求计时器开始。每次后续请求均显示“正在加载”，并在现有瀑布流列中渲染三张无交互骨架占位卡；请求完成或失败后占位卡自动消失。新增回归断言，覆盖即时加载状态、占位卡组件和骨架动画样式。

已验证：反馈板定向测试 31/31、前端生产构建通过。未执行 Git 推送或部署。

# 2026-11-02 需求与建议瀑布流卡片（本地实现，待推送）

需求与建议列表已由等高 Flex 网格改为 CSS 多列瀑布流。卡片会按自身内容高度在列内连续排列，并通过 `break-inside: avoid` 避免跨列断开；桌面默认四列、1500px 以下三列、767px 以下两列。该原生 CSS 方案不增加前端脚本或重排成本，内容视觉顺序为从上到下再进入下一列。

已验证：反馈板定向测试 30/30、前端生产构建、`git diff --check` 以及本地 `http://127.0.0.1:5173/quantity-breaks/feedback` 路由 `200`。测试环境 Vite WebSocket 的 `EPERM` 警告不影响断言退出状态。未执行 Git 推送或部署。

# 2026-11-02 官方回复标签渐变（本地实现，待推送）

建议卡片的“官方回复”标签改为独立样式，不再复用“开发中”状态：背景使用 `linear-gradient(135deg, rgb(61, 32, 253), rgb(87, 32, 220), rgb(40, 12, 145))`，标签文字与图标均为白色；“我的建议”和所有状态标签样式保持不变。新增回归断言，防止官方标签回退到开发中配色。

已验证：反馈板定向测试 29/29、前端生产构建通过。未执行推送或部署。

# 2026-11-02 需求与建议滚动加载与状态标签颜色（本地实现，待推送）

需求与建议列表已从点击式分页改为无限滚动：首屏及后续请求均固定每批 10 条，接近列表底部时由 `IntersectionObserver` 自动请求下一批；筛选、搜索、排序、切换“我的建议”与提交建议后都会回到第 1 批，并在追加时按 ID 去重。每种状态的卡片标签现在使用与状态对应的低饱和前景、边框及背景色。当前未向生产 D1 写入额外测试记录，避免在没有本轮明确线上写入确认的情况下改动公开反馈数据。

已验证：反馈板定向测试 28/28、前端生产构建与 `git diff --check` 均通过。测试环境仍会输出 Vite WebSocket `EPERM` 警告，但退出状态为 0 且不影响断言。`theme-app-extension/public/app-block.css` 为用户本轮自行修改，未编辑、未纳入本次计划提交。

# 2026-11-02 需求与建议状态背景与多语言补齐（本地实现，待推送）

需求与建议卡片按待审核、已批准、开发中、已上线、已拒绝分别使用低饱和背景色，保留既有状态边框与标签颜色以维持识别度。德语、西班牙语、法语、印尼语、意大利语、日语、马来语、荷兰语、葡萄牙语（巴西）、瑞典语、泰语、土耳其语与越南语的反馈页面固定文案均已补齐，包括介绍及联系文案、搜索与排序、加载/空/错误状态、分页、投票、评论、审核状态和撤回确认；不翻译商家输入的标题、建议内容和评论内容。新增回归断言：所有非英语语言包的反馈页固定文案不得不经声明地回退为英文，法语中拼写与英语相同的两个正确术语单独登记为例外。

已验证：反馈板定向测试 26/26、生产构建与 `git diff --check` 均通过；测试环境仍会输出 Vite WebSocket 的 `EPERM` 警告，但不影响断言执行。未重新执行真实嵌入式 SHOPLINE 截图验收。

# 2026-11-02 需求与建议原创 SVG 标签与测试数据（本地实现，待推送）

建议卡片的状态、我的建议与官方回复标签改为原创 SVG 绘制：使用项目自有的 `180×32` 六边折角路径、按文本宽度伸缩的 SVG、状态色变量与白色文字，不复用外部示例的路径、尺寸、描边或文案。卡片仍保持状态居左、我的/官方回复居右，移动端标签会截断超长文字而不改变卡片宽度。用户本轮自行补充的详情作者区下外边距已原样保留。

测试阶段已按用户授权向生产 D1 的 `buchaqian` 店铺写入标题带“【测试】”的示例数据：待审核、已批准、开发中、已上线、已拒绝各一条；其中待审核和已拒绝仅在“我的建议”下可见。开发中示例包含 2 条商家评论与 1 条官方回复，五条示例共计 10 票。前端反馈测试 21/21 与生产构建通过；远程测试数据不属于 Git 提交，后续可按 `demo-feedback-%` 标识统一删除。

# 2026-11-02 需求与建议标签、投票权限与字符限制（本地实现，待推送部署）

建议卡片的状态与“我的”标签改为压住卡片顶部边框的折角标签：状态固定左侧、我的固定右侧，状态继续保持各自的语义颜色。详情弹窗投票控件复用列表的 `.feedbackVote` 样式和动画反馈。待审核、隐藏且未被审核/撤回的建议，现在仅其创建商家可以投票及取消投票；其他商家仍然无法查看或投票。建议正文限制提升为 1000 个 Unicode code point，评论限制收紧为 400；前端计数器、输入约束、Worker 校验和全新 D1 初始化架构已同步。生产 D1 增加 `0007_feedback_content_limits.sql`，安全重建建议表以放宽已有的 400 字数据库约束；旧评论表不重建，避免截断已有可能超过 400 字的历史评论，新的评论始终由 Worker 校验限制为 400。

用户在本轮开始前已编辑 `web/src/pages/quantity-breaks.module.css`；该修改完整保留，本轮仅在文件末尾追加标签样式覆盖层。已通过 `git diff --check`、Worker TypeScript 检查、前端生产构建、前端反馈测试 27/27，以及临时本地 D1 的完整 `0001` 至 `0007` 迁移链。Worker 定向 Vitest 命令退出成功，但 Cloudflare isolated runtime 在当前环境未输出完整用例汇总；远程 D1 迁移、Worker 部署、真实 SHOPLINE 会话和截图验收均尚未执行。

# 2026-11-02 需求与建议审核状态、应用语言与评论权限（本地实现，待推送部署）

需求与建议页面固定文案增加应用语言适配，语言选择器与“建议”操作并排显示；联系邮箱移动到介绍文案下方。建议卡片与详情弹窗的状态徽章使用对应 emoji，pending 显示“🙈 待审核”及未审核悬停说明；官方回复与“我的”徽标统一放在卡片右上角。列表容器改为无最大宽度的 flex 响应式布局，默认四列、1500px 以下三列、移动端两列；“我的建议”筛选会自动清除状态筛选。提交建议和评论的匿名选项与操作按钮同行，提交建议成功沿用 App Bridge 提示“建议已提交，审核通过后才能公开”。

Worker `createComment` 允许建议作者评论自己未审核、未撤回的 pending 建议，其他商家仍只可评论公开建议，已审核 pending 或已撤回建议不会获得该例外。新增 repository/route 回归测试以及前端反馈测试；反馈定向前端 22/22、前端完整原型测试通过，生产构建和 Worker TypeScript 检查通过。前端全局 TypeScript 检查仍有既有的 `useAppBridge`、`campaign-api`、`Translations` 相关错误；Worker Vitest 在 Cloudflare isolated runtime 启动阶段没有输出用例汇总，未将其标记为通过。未执行真实嵌入式 SHOPLINE 截图、远程 D1/Worker 部署或 GitHub 推送。

2026-11-01 需求与建议审核可见性与交互收尾（本地已实现，待远程 D1 迁移和 Worker 部署）：新建议固定以 `pending`、`hidden`、未审核状态入库；公开列表和非作者详情仅返回 `approved`、`in_progress`、`released` 的公开记录。`我的建议` 由服务端按当前店铺单独查询，保留作者自己的待审核和已拒绝记录；作者仅可撤销未审核的隐藏待定建议，开发者平台每次状态写入均持久化 `reviewed_at` 并重新计算可见性。列表和详情补充评论数量、精确到秒的时间、服务端 `canWithdraw` 权限；建议与评论弹窗改为受控输入，支持中文输入法组合过程，空内容禁用提交，评论成功后清空草稿且不再调用可能为 `null` 的 `form.reset()`。预览入口亦已移除 `feedback-list-title`，保留无障碍区域名称。

已验证：前端原型测试 218/218、前端生产构建、Worker TypeScript 检查、Worker 模块边界测试和 `git diff --check` 通过。Worker 四个反馈测试文件在 Cloudflare isolated runtime 收集前被本机 `vitest@3.2.7` fake-timer 全局初始化阻断，结果为 0 个断言、4 个运行时错误，不能标记为通过；非沙箱复跑复现同一依赖工具链错误。保留既有 1440px、1100px 与 390px mock 截图作为样式参考；当前执行环境没有浏览器内核或 Playwright/Puppeteer，未为本次最后的标题移除重新生成截图。真实 SHOPLINE 会话、App Bridge 与开发者平台签名调用仍需在部署后验收。

2026-11-01 移除活动页 `.workspace` 内容包装层（本地实现，真实嵌入式店铺待复核）：`/quantity-breaks` 的主内容不再输出 `.workspace` DOM 节点，历史 `.workspace` CSS 规则也已移除。原有非反馈页的桌面和移动端内容内边距改为由 `<main>` 的直接内容元素承接，避免影响已有独立布局的需求与建议页；新增渲染回归测试，防止包装层被重新引入。定向测试 5/5、前端完整测试 212/212、生产构建和 `git diff --check` 通过。本地 Vite 预览 `http://127.0.0.1:5175/quantity-breaks` 返回 200；受限浏览器环境未安装可用的自动截图工具，真实嵌入式页面仍需人工视觉复核。

2026-11-01 需求与建议与活动概览清理（本地实现，生产 Worker/D1 与开发者平台未验收）：`/quantity-breaks/feedback` 的建议列表改为紧凑的 shadcn 风格卡片流，桌面端三列、1100px 以下两列、767px 以下单列。状态筛选改为带数量的按钮，并增加“我的建议”筛选、服务端分页、完整标题、两行正文摘要、动态投票反馈，以及带图标的“我的”标签。点击卡片会立即打开毛玻璃加载层，随后显示建议详情、投票、发布时间、商家评论、官方回复和匿名评论输入框；提交评论时保留表单节点引用，修复异步提交后读取 `reset` 的空值错误。建议发布支持匿名或显示店铺 handle；商家仅能撤回自己的 pending 建议，且必须尚无投票、评论或官方回复，服务端会软隐藏并写入审计事件。附件上传仍按已确认范围排除，未引入 R2 或任何对象存储。

Worker 的 `GET /api/quantity-breaks/feedback` 支持 `mine`、`page`、`pageSize` 与 scoped counts，新增受上述约束保护的 `DELETE /api/quantity-breaks/feedback/:id`；真实开发者平台写入的回复会以官方回复数据呈现，应用内不提供官方回复入口。计数后会将超出范围的页码回退至最后一页，并把实际页码返回给前端同步；撤回与对应审计日志使用同一个 D1 batch，且审计记录仅在撤回更新成功时写入。除投票外的卡片区域均可打开详情，投票按钮保持独立交互。活动页已去除「活動狀態」、`campaignHeading` 与 `overviewHeading` DOM/CSS；概览和活动列表保留 `aria-label`，不丢失可访问名称。该轮没有覆盖用户已编辑的 `.homeContent`、`.overviewSurface,.campaignSurface` 规则，也没有新增或修改焦点伪类。

本地视觉验收使用 mock API 数据完成：`docs/reference/screenshots/feedback-board-1440.png`、`feedback-board-1100.png`、`feedback-board-390.png`，以及 `quantity-breaks-overview-1440.png`、`quantity-breaks-overview-390.png`。390px 通过 DevTools 固定视口复核，`innerWidth`、`scrollWidth`、`clientWidth` 均为 390；反馈列表单列、活动概览无横向溢出，且概览无标题或「活动状态」文案。前端完整测试 211/211、前端生产构建、Worker `typecheck`、Worker 模块边界测试、`git diff --check` 均通过。Worker 两组反馈 Vitest 测试尚未执行：Cloudflare isolated runtime 启动时，Vitest 3.2.7 的 fake timers 在全局作用域调用 `setTimeout`，被 runtime 拒绝，结果为 2 个错误、0 个测试；这属于当前测试工具链限制，未标记为后端测试通过。生产 D1、真实商家 handle、真实 SHOPLINE App Bridge 与后续开发者平台的官方回复仍需在部署后验收。

2026-10-28 活动列表表格修正（本地实现，真实嵌入式店铺待复核）：恢复原生 `table` 与 `colgroup`，移除破坏宽度分配的 `thead/tbody block` 和 `tr grid` 规则。选择列固定为 16px，其余七列以 `100% - 16px` 分配，避免浏览器把未分配的 7% 宽度回填到选择列；窄屏卡片中的档位和可叠加折扣改为逐行显示。使用临时样例活动在本地浏览器完成 1440px 与 390px 检查：桌面表格宽度等于容器，选择列和 checkbox 都为 16px，批量工具栏可由选择框触发；移动端显示三张活动卡且无横向溢出。前端定向测试 4/4、完整测试 183/183、生产构建与 `git diff --check` 通过；测试环境仍输出 Vite HMR WebSocket 的 `EPERM` 警告，退出码为 0。样例只用于本地视觉验收，未调用 SHOPLINE API 或写入 D1；部署后仍需在真实嵌入式 SHOPLINE 后台确认。

2026-10-27 活动详情与在线更新、剩余数量折扣优化（本地实现，真实店与生产 Worker 未验收）：活动列表整行点击进入只读详情，活动名称提供键盘可访问链接；平台折扣详情回跳改为活动详情页。详情页补充商品范围、开始/结束时间、档位类型和值、组合策略及 PC/Mobile 组件设置。已有活动编辑只显示“更新”，服务端按当前状态保存；新建活动继续区分保存草稿与发布。Active/Scheduled 更新现在先在 SQLite 持久化候选版本和 `updating` 状态，再通过官方文档确认的 Admin GraphQL `discountAutomaticAppUpdate` 更新同一平台折扣 ID，确认返回 ID 后提交本地 revision；明确拒绝恢复旧状态，不确定结果进入 `needs_reconciliation` 并保留候选以支持重启后核对。已发布分类活动更新前重新读取成员并拒绝分类范围变化，避免未验证的平台变量变更。已选商品继续用 `ids` 批量接口（每批 50 个），主题组件与后台共享商品行、原价、预计节省、Bundle total、划线价和加购刷新事件。后端完整测试 145/145、前端完整测试 175/175、主题测试 25/25，前后端构建与 `git diff --check` 通过；前端测试仍输出受限环境的 Vite WebSocket `EPERM` 警告。当前仓库没有 `worker/` 实现，Cloudflare Worker/D1 计划仍未执行；GraphQL mutation 尚未在目标店/API 版本实测，不能标记线上更新或 Worker 生产部署完成。由于本环境没有认证 SHOPLINE 会话，浏览器只能看到活动加载错误，未生成可用于真实店详情和主题加购验收的新截图。

2026-10-26 商品/商品分类选择弹窗滚动保持（本地实现）：修复勾选结果项时弹窗滚动条回到顶部的问题。根因是共享弹窗把焦点初始化 effect 绑定到每次渲染都会变化的关闭回调；草稿选中状态更新后会重新聚焦搜索框，从而触发浏览器滚动。现改为用 ref 保存当前关闭回调，焦点初始化、键盘监听和焦点归还仅在弹窗打开/关闭时执行。商品与商品分类选择器均复用该组件；新增滚动位置回归测试。

2026-10-26 前台实时预览商品选择（本地实现，浏览器视觉验收受限）：移除预览中的“商品页优惠”副标题；实时预览标题下显示当前商品名称和“指定商品预览”操作。该操作复用商品范围的搜索、分页与确认弹窗，但限制为单商品；初始状态继续使用商品目录接口返回的第一个商品，手动选择仅切换预览商品，不修改活动商品范围或保存数据。新增交互回归测试覆盖默认首项、弹窗切换和旧文案移除；前端完整测试、生产构建和 diff 检查通过。本地 Vite 服务器在受限运行环境中无法持久监听端口，未能获取桌面/移动真实浏览器截图，仍需在已授权的本地店铺会话中完成视觉验收。

2026-10-23 商品与商品分类弹窗选择（本地实现，真实店未验收）：活动编辑器中的“指定商品”和“指定商品分类”均改为通过“添加商品 / 添加商品分类”弹窗选择。弹窗支持搜索、手动/智能分类切换、每页 50 项、复选草稿和底部确认；取消、遮罩或 Esc 关闭均不会改变已保存范围。已选不超过 10 项时直接显示真实缩略图、名称及移除操作；超过 10 项时改为“查看已选项（N）”弹窗。分类目录与详情代理现读取 SHOPLINE `image.src` 并向前端返回 `imageUrl`。新增草稿确认、超过十项查看和分类封面图回归测试；定向前端测试 8/8、分类目录后端测试 5/5、后端全量测试 137/137、前后端构建均通过。Vite 的完整前端测试仍因沙箱限制输出 WebSocket `EPERM` 警告；本地浏览器因没有已认证的 API 会话只能显示活动加载错误，未获取可用于真实店铺或视觉验收的截图。

2026-10-23 整单金额折扣（本地实现，真实店未验收）：在保留每件固定减免（`fixed_amount`）和每件固定价格（`fixed_price`）的基础上，新增整单固定减免（`bundle_fixed_amount`）与整单固定价格（`bundle_fixed_price`）。编辑器提供独立的折扣类型与整单金额字段，预览按同一商品已选 Variant 的总价计算。服务端校验、发布规则、市场指定金额和 storefront 数据模型已同步接受新类型。Function 对整单类型按同一 Product 的命中购物车行分组，使用折扣级 `fixedAmount`/`presentmentFixedAmount` 且 `appliesToEachItem=false`，固定价格会转换为商品组合计与目标总价之间的金额差；每件类型继续保留逐行、`appliesToEachItem=true` 的输出。新增前后端与 Function 回归测试，Go 全量测试、后端测试和前端构建通过；真实 SHOPLINE 结账分摊与市场币种行为仍需在授权店铺验证。

2026-10-23 折扣发布/回跳与编辑保护（本地实现，真实店未验收）：嵌入式管理页在发布活动、以及确认“暂停后编辑”时调用 SHOPLINE App Bridge 的顶部 Loading；非嵌入预览保持原有按钮 loading 状态。已发布或排期活动的 Edit 操作先要求确认，成功删除平台自动折扣并变为 Paused 后才进入编辑页。受认证的活动 API 仅向后台列表返回关联的 `platformDiscountId`，应用可将 SHOPLINE 的 `/product-discount-customizations/:functionId/:discountId` 地址重新映射至对应活动；公开 storefront 响应不暴露此 ID。创建与保存草稿均要求商家手动填写开始时间，初始值保持为空，前后端同时校验；发布适配器不再用当前时间静默填补缺失开始时间。新增 App Bridge、路由、后台映射和开始时间回归测试；真实 SHOPLINE 折扣详情跳转、App Bridge 原生进度条、暂停后再发布仍需在授权店铺会话中验收，不能标记平台验收完成。

2026-10-22 Function/主题实机排查：SHOPLINE Function 日志中的购物车输入连续显示 `discountNodes: []`，证明该次运行没有绑定任何自动折扣规则；商品数量和 Product ID 本身不会在没有折扣节点时触发活动。日志确认当前部署 Function ID 为 `66a964153c3c4b42a6713162369e0df9`，发布控制器默认值已与其统一，并仍可用 `SHOPLINE_PRODUCT_DISCOUNT_FUNCTION_ID` 覆盖。当前目标店本地活动记录为 `buchaqian` 的 active 活动，但平台折扣、Function 绑定关系与线上结账仍需独立核对，不能仅凭本地状态标记为已生效。真实商品预览页 DOM 未出现 `.quantity-breaks-app-block`，也未加载扩展脚本；主题编辑器侧栏虽显示“多件优惠”区块及旧 Tunnel 地址，但预览未渲染，需保存主题并确认已发布的 Theme App Extension 版本。Function 另增加了 `priceSet` 为空时跳过该购物车行、继续保留其他有价格商品折扣的回归保护；Go 全量测试通过。真实折扣节点注入、主题扩展发布和结账结果仍未验收。

2026-10-22 折扣发布开关解除：确认 Product Discount Function、权限和平台依赖已就绪后，服务端不再要求显式设置 `SHOPLINE_QUANTITY_BREAKS_PUBLICATION_ENABLED=true` 才能发布；未设置时允许进入真实创建流程，只有显式设置为 `false` 才关闭发布。保留指定商品/分类范围校验、覆盖冲突检查、商品存在性验证、平台错误处理和必须返回 `app_discount_id` 后才标记 Active 的状态保护。前端将已发布活动编辑提示改为“需先暂停活动”，不再显示 Function 未连接的误导性提示。

2026-10-21 活动预览规格与布局修复（IN_PROGRESS，本地未推送）：产品目录接口现在返回每个商品的真实变体 ID、规格名和值、售价、划线价、库存、可售状态和变体图片；预览产品选择器默认取目录第一页第一项，按 10 条分页。预览中的下拉、色块、图片规格和值不再固定为 Black/White/S/M/L，切换预览商品时会过滤旧槽位并按新商品的可售变体补齐，价格和划线价也来自当前商品。Horizontal 与 Grid 移除遗留的双列价格规则，标签位置只由当前 `data-badge-position` 决定：右上角贴卡片上边框，副标题下方参与正常文档流，避免切换布局与标签位置后保留冲突状态。后端完整测试 130/130、前端完整测试 145/145、前端布局定向测试 16/16、前端 TypeScript 检查、前后端生产构建和 `git diff --check` 通过。当前 Codex 浏览器没有可绑定的本地预览页，Chrome 调试连接不可用，故本轮未生成新的桌面/移动截图，也未将视觉或真实 SHOPLINE 店铺交互标记为已验收。

2026-10-20 管理导航与目录分页实现（本地未推送）：概览与翻译路径保持为 `/quantity-breaks`、`/quantity-breaks/translations`；应用自建侧栏、移动抽屉、店铺名称与 Logo 展示已移除，语言选择移至页头创建按钮左侧，档位标题与图标按批准设计调整。商品选择器按 50 条分页，跨页保留真实 Product ID，中文输入法组合结束后防抖搜索并取消过期请求。新增手动/智能分类目录代理、按 ID 恢复标题、分类商品预览和 50 条分页；分类可保存草稿但发布按钮和服务端仍拒绝发布。`/shop` 仅返回已鉴权 handle 作为前端隔离键，不再请求店铺信息接口。权限 `read_store_information` 与生产 `afterAuth` 店铺 ID 查询暂未移除：安装登记仍需要可信数字 `store_id`，现有 SDK webhook 合同未证明可由安装事件稳定提供该字段与 session handle，不能用 handle 冒充数字 ID。定向分类代理 4/4、分类选择/适配 9/9、商品选择 3/3、后端构建、前端类型检查通过；Vite 测试仍有既有 WebSocket `EPERM 0.0.0.0:24678` 警告。真实 SHOPLINE 分类权限、后台导航菜单和桌面/移动授权会话截图尚未验收。

2026-10-20 草稿删除与后台反馈续作：目标活动 `local-7c5314b8-652a-41c3-a344-579b000c97e1` 的活动正文仍为 `draft`、revision 9；此前折扣创建返回结果不确定，将独立的发布记录置于 `needs_reconciliation`，因此仓储拒绝删除。经用户确认 SHOPLINE 折扣列表无对应项并批准本地修复后，已先备份 SQLite 至 `/private/tmp/quantity-breaks-before-delete-reconcile-20261020.sqlite`，仅把该店该活动的发布记录恢复为 `idle`，只读复核仍为 `draft` + `idle`、无折扣 ID。未代用户执行删除，也未改变通用安全阻断逻辑。嵌入式管理页的操作消息改用 App Bridge Message，活动/档位删除改用 Modal；翻译切换的三种结果在嵌入式页面通过两步 Modal 保留，独立预览保留原有弹窗。前端 118/118 测试、TypeScript 检查、生产构建和 `git diff --check` 通过。本地浏览器无 SHOPLINE 会话，仅能看到店铺加载错误，不能把真实嵌入页弹窗或删除操作标为视觉/功能验收通过；仍需在授权会话中核验。参考和本地历史截图仍见 `docs/reference/screenshots/`，本轮未取得可用于目标交互验收的新截图。

2026-10-20 GraphQL 折扣诊断续作：活动在本地解除一次 `needs_reconciliation` 后可成功保存草稿，随后再次发布使状态回到待核对；request ID `23fe930e-2684-4ae4-aa6f-f4cda6fbc9d4` 的 409 只是重复请求被本地锁定拦截，未再次调用折扣创建。现将发布 request ID 传入折扣 GraphQL 适配器，记录操作名、HTTP 状态、耗时、格式校验后的平台 trace ID、错误数量与代码，不记录 token、请求变量或完整响应。后端测试 81/81 与 TypeScript 构建通过。用户再次确认 SHOPLINE 折扣后台无对应记录后，已备份 SQLite 并只将该活动的本地状态恢复为 `idle`。随后单次真实发布 `8bba236a-fe71-4e2a-9fc6-489f50b38e5f` 调用 `v20260901 discountAutomaticAppCreate`：HTTP 200、529 ms、平台 trace ID `4444c4b98f672d74cf501c17a95a6a04`，但 GraphQL 返回一条 `REMOTE_ERROR` / `Service call fail.`；本地草稿修订号 9 再次进入 `needs_reconciliation`，无折扣 ID。用户核对此次失败后 SHOPLINE 折扣列表仍无对应记录，且 `shopline app dev` 日志没有 Function 构建或上传信息。本机 `@shoplinedev/cli` 2.1.5 的 dev 进程配置只启动 web 前后端；独立的 `@shoplinedev/function` 0.0.2 仅提供 `build` 命令，因此本地 WASM 文件不能证明 Function 已部署。全局 `sl` CLI 包含独立的扩展上传路径，但未执行上传，给定 Function ID 的平台状态和 `REMOTE_ERROR` 根因仍待核对，不能将真实发布标记成功。

2026-10-20 结算币种权限补充：用户确认 `GET /currency/currencies.json` 需要 `read_orders`；现有离线会话只有此前七项权限，且相同 token 在补齐请求头后收到 403 JSON：`ACCESS_TOKEN is no permission!`。本地 SDK scope 常量与 `shopline.app.toml` 现均声明 `read_orders`，回调和会话写入仍按完整权限校验。已安装店铺不会因代码或 manifest 改动自动获得权限；需同步 SHOPLINE 应用配置并由商家重新授权。未执行真实重新授权或发布，币种接口成功响应、折扣创建和结账效果均未验证。

2026-10-20 SHOPLINE 请求头对齐：活动发布请求 `9a5ec42a-2dfa-4074-a01a-8fc77df75153` 的币种读取在 `GET /currency/currencies.json` 收到上游 436，未进入折扣创建。使用同一离线会话做只读对照：`node-fetch` 原请求得到 436 HTML；补充与店铺语言请求一致的 `Accept: application/json` 和 `User-Agent: SHOPLINE-Quantity-Breaks-App/1.0` 后得到 403 JSON，错误为 `ACCESS_TOKEN is no permission!`。同一会话对店铺信息、市场和语言接口的只读请求返回 200，表明当前拒绝集中于币种接口，但其具体权限要求在已查 OAS 中未说明。现将上述两个头统一加到项目手写的 SHOPLINE Admin REST 与折扣 GraphQL 请求；未自动重试发布，也不能把 436 变为 403 视为授权问题解决。自动审批拒绝了额外读取店铺信息实际币种的认证请求，本轮未绕过该拒绝。

2026-10-20 发布接口 502 诊断续作：用户在活动编辑页提交草稿的 PUT 返回 200，随后发布状态 POST 返回 502。只读检查目标活动的本地记录为 `draft`、发布状态 `idle`、无平台折扣 ID；这不能单独证明失败发生在折扣创建前，平台明确拒绝创建后也会回到 `idle`。用户提供的另一份响应正文是 02:10:28 UTC 由 Cloudflare 隧道域名生成的 502 HTML，不能据此确定与应用记录的 POST 502 是同一层故障。02:16 UTC 的无凭据只读检查显示后端、Vite 代理和 Cloudflare 隧道均返回 302，且携带应用 request ID，说明当时隧道已恢复连通，但不能倒推 02:10 的根因。发布控制器现用同一个 request ID 记录币种读取开始/完成、失败阶段与可安全提取的上游 HTTP 状态，默认币种读取也把 request ID 传给市场 REST trace；不记录 Admin token 或响应正文，不改变发布/重试行为。未重试真实发布，具体失败阶段与 SHOPLINE 上游响应仍待同一请求 ID 的日志或后续受控请求确认。

2026-10-20 活动编辑页接口诊断续作：确认此前详细 trace 仅覆盖 `/store-languages`，活动编辑页实际请求 `/shop`、`/campaigns` 和 `/markets`，所以在编辑页看不到语言日志。现在 Quantity Breaks API 在鉴权前统一记录 request ID、方法、路径、完成状态与耗时；市场读取的结算货币和市场分页请求记录脱敏的 REST 版本、端点、HTTP 状态、耗时及安全 trace ID，不记录 Admin token 或响应正文。已有语言专用 trace 不重复记录。后端全量测试 79/79、TypeScript 构建、`git diff --check` 通过；本地无凭据请求 `/markets` 返回带新 request ID 的 302，证明入口追踪已由开发进程加载。真实授权会话的市场上游响应及此前 436 仍未验证。

2026-10-20 接口诊断日志续作：移除开发环境下通过 `SHOPLINE_LOG_FULL_CURL` 或本地标记输出明文 Admin token 的路径，cURL 始终遮蔽 Bearer token；上游 HTTP 响应与网络异常日志增加 `durationMs`，可通过原有 request ID 对照入口总耗时。定向测试覆盖调试开关下的脱敏、436 响应耗时与网络异常耗时。后端全量测试 77/77、TypeScript 构建及 `git diff --check` 通过。尚未使用真实授权店铺请求，436 状态与平台端 trace ID 仍未验证。

## 2026-10-19 全部商品手动发布接入（当前 main，本地未推送）

用户提供 Product Discount Function ID `7d11ff3ba25e4c4ebd309252f5e4fc63`。后台将其作为默认 ID，仍可通过 `SHOPLINE_PRODUCT_DISCOUNT_FUNCTION_ID` 覆盖；已保存的全部商品草稿由商家手动发布时调用现有 `discountAutomaticAppCreate`，平台确认折扣 ID 后才将本地活动标记生效。发布默认开放，但可用 `SHOPLINE_QUANTITY_BREAKS_PUBLICATION_ENABLED=false` 明确关闭；暂停已发布活动仍可用。指定商品和分类的发布继续在服务端拒绝，不使用未核验的商品快照。

规则使用 `scope.kind = "all"`，Function 在每次结账时读取购物车商品 ID，并按每个商品分别累计数量，不保存活动创建时的全店商品 ID 列表，因此新建商品在规则语义上自动纳入；前台公开活动接口也按 `all` 动态匹配。现有 Go 测试覆盖不同商品分别计数及排除商品。后端全量测试 77/77、前端 117/117、后端 TypeScript 构建、Go Function 测试及 `git diff --check` 在本地通过。直接将草稿写为 active 仍被拒绝，并提示使用独立发布接口；缺失活动不再误报为商品范围错误。

SHOPLINE 文档检索确认 `DiscountAutomaticAppInput` 有 `functionId`、`metafields`、`startsAt`、`title`、`endsAt` 和 `combinesWith` 字段。未对真实店铺发起折扣创建请求；给定 Function ID 是否指向已部署的最新代码、目标店 mutation 合同、主题块在新建商品模板上的安装以及购物车/结账折扣均未验证，不得标为 VERIFIED。

## 2026-10-19 后台语言与 Function 构建排错（当前 main，本地未推送）

概览指标、筛选、活动表格、状态操作与反馈已随 11 种应用语言切换；翻译页切换前的未保存修改弹窗使用应用语言，不受前台译文语言选择影响。活动档位拖拽手柄的名称、提示和排序播报已本地化；市场读取失败不再把原始英文接口错误直接拼入商家界面。新增繁体中文页面与弹窗回归测试，前端完整单并发测试 117/117、TypeScript 检查及生产构建通过。

Function CLI 只复制并编译 `main.go`，原先 `evaluateDiscounts` 位于同目录 `discount.go`，导致 `main_temp.go` 出现 undefined。经用户授权，折扣计算和测试迁至 `internal/discount/`，`main.go` 保留 CLI 所需入口与注入包装代码依赖，`main_host.go` 仅用于非 TinyGo 的宿主测试。Go `go test ./... -count=1` 与单文件入口编译测试通过；原 CLI 构建在将 Go 加入 PATH 后已推进到 TinyGo 步骤，但当前机器没有 `tinygo`，报 `/bin/sh: tinygo: command not found`，WASM、平台推送和结账效果均未验证。

本次不是全应用多语言验收：前台预览中的示例商品/品牌文案仍是英文静态演示数据，创建页的两处输入示例和部分低层校验/接口错误也仍是英文。不得把这些内容或真实店铺语言、真实折扣运行标记为 VERIFIED；后续应分别替换示例数据、统一可见错误文案，并在安装 TinyGo 的受支持环境构建 WASM 后测试目标店。

## 2026-10-16 Theme App Extension 发布目录整理

状态：本地实现，未发布。将主题测试从 `theme-app-extension/test/` 移至仓库级 `tests/theme-app-extension/`，测试命令改为根目录 `npm run test:theme`；`linkedom` 仅作为根目录开发依赖。扩展包内不再包含测试目录、测试包描述或测试依赖目录。商品详情页使用已由 SHOPLINE 文档确认的 `target: section`、`templates: ["product"]` App Block 扩展点，主题编辑器中显示“Quantity breaks / 多件优惠 / 多件優惠”，应用 HTTPS 地址设置亦已本地化。主题块继续请求应用的公开只读活动接口，并不把 App Block 误称为折扣计算引擎。

SHOPLINE AI Suite 检索确认 Theme App Block 的结构、schema 与发布命令；没有检索到可支撑 `shopline.app.toml` 的 `proxyUrl` 在主题中直接消费的明确 App Proxy 契约。因此本轮保留明确的 HTTPS `api_origin` 设置，不猜测代理路由或签名。商家仍需在主题编辑器中填部署后的应用地址；真实主题安装、跨域和前台数据获取仍未验证。`sl extension push` 会修改合作伙伴后台草稿，本轮未执行。

## 2026-10-16 SHOPLINE 闭环接入增量（`codex/shopline-live-integration`）

状态：IN_PROGRESS，本地未部署。后台店铺信息、市场和前台语言继续通过已有鉴权 REST 代理读取；本批补充发布折扣所需 scopes，并把 GraphQL 确定性的 HTTP 4xx 归为可修复拒绝，不把授权失败误标为结果不确定。新公开只读活动接口仅投影当前有效、已发布且命中商品的活动；排除商品、过期、未开始、未发布及多活动冲突均不返回可购买配置。

Theme App Block 从 SLine 商品对象读取 Options、Variant ID、价格、图片和可售状态，按活动加载数量档位与逐件规格。不同规格可混选，同 SKU 合并为一次 `/cart/add` 的 `items[]`；不可用组合禁用、累计库存超限阻止加购，返回结果不完整或网络异常时不误报成功。活动级布局、主要颜色/字体和图片尺寸已映射至主题 CSS；缺图时保留文字标签。主题块需要配置应用 HTTPS origin。此项是本地实现，不代表已在目标 OS 3.0 主题验证 SLine 输出、跨域、样式或购物车响应。

Function 依据桌面公测指南、202609 Input/Output 工作簿、市场币种补充文档与快速入门 PDF 核对；本地 Go 计算测试通过。CLI `@shoplinedev/function/0.0.2` 执行 `sl-function build` 时访问 `https://s2cdn.myshopline.com/function/dev/ci/rule` 得到 HTTP 403 `application/xml` 而非预期 JSON，WASM 未构建成功。未上传 Function、未创建真实自动折扣、未发布主题扩展，也未验证开发店购物车或结账。自动发布仍默认关闭，目标店的 `v20260901` GraphQL 合同、重新授权的 `write_discounts`、Function ID、真实目录 ID 与商品范围成员核验、结果不确定时的 reconciliation 仍是上线门槛。

本地验证：后台测试 45/45 与构建、前端测试 86/86 与类型检查/构建、主题测试 15/15、Go `go test ./... -count=1`、App Block SLine 语法检查均通过。前端测试仍输出 WebSocket 端口占用警告；未做真实店铺及同视口浏览器视觉测试，因此相关模块不得标记 VERIFIED。

## 2026-10-15 活动级外观改造（隔离分支 `codex/campaign-widget-style`）

本轮补充（IN_PROGRESS）：活动 Style 增加标签右上角/副标题下方切换，Horizontal/Grid 默认仍在档位右上角；规格标题、值、价格、序号、普通/选中边框、加购按钮、预计节省金额与购物车明细获得独立颜色或字体配置。前后端保存格式和旧配置默认值同步，服务端活动转后台模型时也补齐旧配置；11 种后台语言新增设置词条。取色器滑杆取消内边距，颜色分组取消上边框。Chrome 1440px Grid 与 390px 单列实测副标题下方标签在卡片内且页面无横向溢出；截图见 `docs/reference/screenshots/quantity-breaks-badge-below-{1440,390}.png`。前端 84/84、服务端定向 6/6、前后端构建、前端类型检查、Go Function 测试通过；服务端全量仍为 15/24，9 项受共享 `node-fetch` ESM 依赖冲突阻挡，不能标记全量回归通过。真实 SHOPLINE 店铺渲染与保存刷新未验收。

本轮增量：颜色控件支持 8 位 HEX 透明度、当前颜色定位、点击外部/Esc 关闭，并移除摘要上下箭头；字体设置两列，新增原价与加购按钮独立字号/字重。档位选择头部按内容最高值对齐，选中规格区仍单独展开；List 保留卡片背景，标签默认显示，款式图按钮 1px 内距并居中。旧活动缺失的新字体字段在编辑器和服务端校验时补默认值。独立审查后补齐未选中标签定位、关闭原价展示时隐藏档位划线价格、无效 HEX 保存前校验并聚焦。Chrome 390px 取色器可见、页面无水平溢出，滑杆拖到 50% 得到 `#F7F7F780`，点外部/Esc 关闭；字体控件为两列 164px，输入无横向溢出；无效 HEX 保存时 Style 与取色弹层展开并聚焦字段。1440px 三列头部均为 150px，List 无边框且普通/选中背景不同。截图见 `docs/reference/screenshots/quantity-breaks-color-opacity-390.png`、`quantity-breaks-typography-390.png` 与 `quantity-breaks-equal-tier-headers-1440.png`。前端 80/80、服务端定向 6/6、前后端构建、前端类型检查和 Go Function 测试通过；服务端全量 15/24，其余 9 项仍受共享 `node-fetch` ESM 与 `ts-node` 冲突阻挡。

状态：IN_PROGRESS，未合并、未推送。活动草稿新增经服务端校验和持久化的独立 Widget 配置；创建/编辑页已加入布局、卡片、颜色、字体和规格设置，移除全局 Widget 外观入口并将旧 URL 导回概览。桌面创建页改为左侧配置、右侧实时预览；Style 按参考截图使用相邻布局缩略图、分组颜色控件和展开 HEX 输入。Horizontal 三列、Grid 两列且选中卡片不跨列；List 无边框。前台预览按活动配置使用布局、字体和颜色；10px 图片下显示颜色值时，按钮可随文字扩宽；“不预选规格”保留可操作的选择器。创建页主要设置、档位与市场文案已接入 11 种后台语言，其他服务端返回的错误仍可能为英文，不能标记完整本地化验收。

本地浏览器核验：1440px 左右分栏宽度为 623/505px；Horizontal 档位宽约 147px，选中卡片仍在第三列，下拉框可显示完整 Black/White；Grid 档位保持两列；List 卡片边框计算值为 0px。390px 英文及德文页面 `scrollWidth=innerWidth=390`；右列颜色弹层右边缘 365px，色域与 HEX 在弹层内可见。截图见 `docs/reference/screenshots/quantity-breaks-editor-style-{1440,390}.png`、`quantity-breaks-horizontal-1440.png` 与 `quantity-breaks-color-picker-390.png`。真实店铺与保存刷新仍未点验。

本地检查：前端 76/76 项测试通过，前后端构建和前端 TypeScript 检查通过，Go Function `go test ./...` 通过。服务端完整测试此前 15/24 通过，9 项因当前共享 `node_modules` 的 ESM `node-fetch` 与 `ts-node/register` 兼容问题未运行成功；本轮未重跑，不能视为服务端回归通过。Function 输入的稳定 Variant ID、Theme 商品上下文/可信店铺身份/加购合同尚未确认，相关平台发布和主题实装保持 BLOCKED。

更新于 2026-10-15。状态含义与页面清单一致；本文件记录工作证据而非主观完成率。

## 2026-10-15 组件外观本地化与长译文换行

组件外观页的后台设置标签、说明、展示方式、预览工具栏和保存反馈已接入 11 种应用语言；展示方式仍使用原有固定内部值，不改变前台预览语言或配置判断。翻译页译文改为随内容增高的多行输入框，长结账提示可完整换行；原文和译文仍按原分组显示。前端 67 项测试与构建通过；本地浏览器 390px 下页面无横向溢出，结账译文输入框高度为 54px。真实店铺语言、译文持久化及前台主题效果未在本轮验证，状态保持 IN_PROGRESS。

## 2026-10-15 后台外壳与翻译批次（隔离 worktree，未合并）

状态：IN_PROGRESS。鉴权 `GET /api/quantity-breaks/shop` 只返回店铺 ID、名称与经 HTTPS 校验的 Logo；侧栏有加载、失败、重试和无 Logo 图标回退。桌面移除应用内部 header，移动保留菜单。活动页开始读取现有鉴权 API；内存示例活动不再作为已连接店铺列表。草稿保存仅允许可无损映射的全部商品范围，真实商品/分类选择和发布继续禁用，不能标为功能完成。

翻译页在店铺语言接口失败时显示只读默认原文，禁用译文保存并提供重试。侧栏后台语言可选择 11 项并按店铺 ID 隔离保存；已本地化导航、主要活动入口、翻译页及部分编辑按钮。编辑器深层字段、Widget Studio 与部分反馈仍有英文，11 语言覆盖尚未完成，不能标 VERIFIED。前台译文的店铺语言/保存流程未改变。

2026-10-15 翻译布局增量：译文列表顶部只保留一次“原文｜当前前台语言”列头，下方按组件标题、价格汇总等分组；移除默认文案标题和冗余说明。店铺语言接口失败时列头回退 English、原文只读且保留重试。桌面 1440px 与手机 390px 本地浏览器检查无横向溢出；模拟店铺语言切换至法语后列头随之更新。真实店铺语言与保存端到端仍未验证。

本轮复核修复：店铺身份在页面重新可见和浏览器历史切换时重新鉴权加载，旧活动列表立即清空；翻译编辑器按已验证店铺 ID 重挂，避免跨店铺复用语言缓存与草稿。已有活动的 ISO 排期在 `datetime-local` 中转换为本地时间，未改动时原值无损回写，并保留原时区和暂停/结束状态；非 JSON API 错误保留 HTTP 状态。前端 63 项测试及构建通过、服务端构建通过。服务端完整测试当前 13/22 通过、9 项因本地共享依赖解析到 ESM `node-fetch` 而无法运行；该依赖环境须修复后重跑，不标记服务端验证完成。

本地 Chrome 截图：[1440px 翻译错误回退](reference/screenshots/quantity-breaks-translations-fallback-fr-1440.png)、[390px 翻译错误回退](reference/screenshots/quantity-breaks-translations-fallback-fr-390.png)。390px 使用 CDP 设备指标模拟，确认 `innerWidth=390`、`scrollWidth=390`；移动菜单和语言切换到德语通过浏览器交互检查。截图中的 500 错误来自未连接真实店铺的本地前端，不代表 SHOPLINE 开发店响应。真实店铺 Logo、会话与活动 API 端到端仍未验证。

| 模块 | 状态 | 当前证据 | 下一验收门槛 |
| --- | --- | --- | --- |
| 页面发现与映射 | IN_PROGRESS | 已只读访问七个一级应用区、六种模板创建表单、Quantity Breaks 创建/编辑和商品页；关键折叠区截图已收录 | 补齐行菜单、弹窗、保存/失败等未改变原数据的状态 |
| 共享壳与导航 | IN_PROGRESS | 已有概览、创建/编辑、Widget、翻译直达 URL；1037px 编辑页与 390px 编辑/菜单截图，刷新、后退、移动菜单点验；导航解析测试通过；本轮移除重复 `Apps / Bundle deals` 与侧栏底部 `Bundle deals`，未连接店铺显示中性预览标识 | 真实店铺名称/图标需接口接入；其余一级页面尚无路由，不能标 VERIFIED |
| 首页/优惠列表 | IN_PROGRESS | `VISUAL_GAP_REPORT.md` 有 1037/390px 对比；本轮有活动与空活动均仅一个创建按钮；浏览器点验筛选、搜索空状态、清除、编辑、停用、删除确认/取消，37 项原型测试通过 | 参考未覆盖状态、真实数据、无 P0/P1 差异 |
| Quantity Breaks 创建/编辑 | IN_PROGRESS | 参考与本地 1037px 折叠页截图、390px 本地截图；商品/设置/样式/逐档/预览顺序已调整；四种价格模式的本地预览和不同 SKU 单价已测试；副标题实时预览、校验焦点、样本范围冲突阻止创建/重新启用已点验；2026-10-14 新增稳定档位 ID、鼠标拖拽及键盘上移/下移，本地仓储可按店铺保存草稿并保留展示顺序 | 前端尚未接活动 API；真实商品/分类范围、Function/主题、完整视觉验收 |
| Widget/Variant | IN_PROGRESS | 本地 mock 组件；数量 6 的预览显示原价 $628.00、折后 $565.20，Black/M 两件合并；37 项前端测试与构建通过，桌面和 390px 手机浏览器检查无规格控件重叠；本轮截图未存档，参考仅 Single/Duo | 存档同视口截图；真实商品/库存/主题/结账、参考 Variant 证据 |
| 翻译 | IN_PROGRESS | 本地少量字段，参考翻译页截图 | 11 语言、真实存储/回退、缺失状态 |
| 分析、设置、建议功能 | NOT_STARTED | 参考截图已采集 | 数据契约与独立页面实现/测试 |
| 套餐管理与更多应用 | BLOCKED | 参考截图已采集，未触碰 CTA | SHOPLINE 计费及自有目录决策 |
| 其他五类模板 | BLOCKED | 已安全观察 BXGY、混合商品、完整套装、订阅、阶梯赠品表单及关键字段；未保存 | SHOPLINE 平台能力与各模板独立规格、测试和真实结账验证 |
| 全应用回归 | NOT_STARTED | 隔离 worktree 本轮本地原型 37 项测试通过、Vite 构建通过；不覆盖真实 API/Function/购物车 | 导航、业务、UI、Function、购物车/结账和构建全通过 |

2026-10-14 隔离 worktree 增量：修复新增规格位超卖预选、颜色切换形成售罄组合，以及未选中档位误用全部保留规格位计算价格。金额类档位新增币种精度解析和逐市场金额 UI；服务端市场代理通过现有 `/api/*` 鉴权，读取市场与店铺币种，分页并拒绝含混币种。应用页市场读取失败只显示错误与重试，未接真实店铺。当前验证为前端 42/42、服务端 3/3、双方构建与前端类型检查通过；市场换算、Function 与结账仍未验证，相关模块继续保持 IN_PROGRESS。

翻译增量：语言来源改为鉴权的店铺语言接口；原型未连接店铺时仅显示错误与重试，不再伪装 11 个语言都已启用。系统文案按前台出现位置建立原文/译文键，逐档商家标题、副标题和标签继续留在档位编辑器。翻译现在按店铺和语言写入独立 SQLite 表，API 校验启用语言与占位符。本地模拟 API 点验法语编辑、保存后刷新读取、未保存切换选择、缺失 `{price}` 时禁用保存及 390px 布局。真实店铺、主题扩展和结账均未实测；扩展目前仍是占位脚本，翻译模块保持 IN_PROGRESS。

每完成一个可验收模块，记录参考/本地同视口截图、交互步骤、测试命令与结果、剩余 P0/P1，再更新对应清单。构建通过不等于功能完成。

## 2026-10-28 批量活动与主题文案收尾（当前隔离分支，待部署）

- 活动列表移除单行暂停/删除入口，只保留批量“启用、暂停、删除”，三项均先经过 App Bridge 二次确认。表格为八列固定优先级列宽，窄屏继续降级为卡片；可叠加折扣逐行显示，避免状态与档位文字互相覆盖。
- 后台列表的列名、分页、选择框、批量按钮、确认框、成功/失败提示均补齐 11 种应用语言。指定市场金额的提醒改为按当前可叠加类型插值，例如“因当前档位设置了指定市场金额，以下档位在指定市场不与主站订单、运费折扣叠加。”；商品折扣统一显示为“商品折扣”。
- 商品页 App Block 增加运行时提示翻译键（结账时计算、选择规格、商品/规格无障碍标签、档位件数、购物车状态未确认），并在 Worker 白名单与所有默认译文中同步；删除未引用的 `app-embed-block`、专属脚本/样式/图标及其主题配置译文。
- 验证：主题扩展 27/27、Worker 72/72 与 typecheck、兼容 `app` 147/147 与构建、前端完整 166/166 与 Vite 构建均通过。前端测试有既有 Vite WebSocket 端口占用与 jsdom `attachEvent` 警告，但没有失败项。
- 视觉限制：本地预览服务能运行，但缺少嵌入式 SHOPLINE 会话时活动 API 不返回数据，React 页面不渲染可验收的活动列表。因此本轮不能把本地空白页截图作为视觉通过证据；已保留此前参考和本地截图，部署后仍需在真实后台以 1440/1024/768/390 宽度复核。

2026-10-15 活动外观增量：移除可见的正文字号控件，新增汇总标签、汇总金额与结账提示的独立字体设置；规格价格同步作用于购物车规格行右侧金额，加购按钮上下内边距设为 14px。新配置保留旧活动兼容，商品页视觉及真实店铺尚待浏览器核验，状态仍为 IN_PROGRESS。

2026-10-16 价格汇总增量：新增汇总文字及金额的活动级颜色配置，旧活动使用默认灰/黑；汇总行取消固定 17px 行高，允许字号放大后换行撑高。前端 86/86、服务端定向 6/6、两端构建及前端类型检查通过；服务端全量 15/24，9 项仍被既有 `node-fetch` ESM 环境问题阻挡。Chrome 桌面与手机截图显示未连接店铺时创建页停在加载错误，未能实际看到 Widget，本次视觉验收保持未验证。

2026-10-16 并行接入批次（`codex/quantity-breaks-integration`，本地未部署）：后台新增活动发布/暂停状态接口和平台折扣 ID 状态记录；仅平台确认成功后才标记 Active，结果不确定时阻止盲目重试。未来开始及已结束的活动暂不能发布，已发布活动须先暂停再编辑或删除。商家端发布按钮执行先存草稿再发布，失败保留表单；新活动 ID 与修订号可用于安全重试。Go Function 补齐多 Variant、市场与异常金额测试并修复大额百分比整数溢出。Theme App Block 移除模板，加入可测试的规格组合、库存及批量加购核心，但因缺少已验证的公开活动投影接口，商品页仍不显示购买组件。

本批本地结果：`app npm test` 41/41、`app npm run build`、`web npm run test:prototype` 86/86、`web npx tsc --noEmit`、`web npm run build`、Function `go test ./... -count=1`、主题脚本 9/9、SLine 语法检查通过。前端测试有 WebSocket 端口占用警告；Function `go vet ./...` 报生成模型的两个未导出字段 JSON tag 警告，因此不能称为全部检查通过。未运行开发店或结账测试，也未完成商品页视觉验收。

发布前阻断：已跟踪 `shopline.app.toml` 目前只声明 `write_products`，自动折扣创建文档要求 `write_discounts`；授权变更及重装需单独在开发店处理。当前适配器调用 `v20260901`，本轮查到的完整官方 mutation 文档标为 `v20270301`，需验证目标店当前版本契约。发布入口默认关闭，只有服务端显式设置 `SHOPLINE_QUANTITY_BREAKS_PUBLICATION_ENABLED=true` 才允许新建平台折扣；已生效活动仍允许紧急暂停。平台创建结果不确定时保留 `needs_reconciliation`，尚无自动恢复流程，开通前必须设计核对操作。分类活动因没有实时成员核验而禁止发布；指定商品 ID 的实时目录核验也尚未实现。Theme App Block 没有已证实的公开接口店铺身份签名机制，不得信任任意 `shop` 参数或暴露私有活动数据。Function ID、扩展部署、真实批量加购、市场币种和结账折扣均未验证，以上模块保持 IN_PROGRESS/BLOCKED，不标 VERIFIED。

正式接入首批本地增量：活动模型校验数量阈值、整数金额、市场覆盖和时间；SQLite 仓储以事务执行版本比较及启用活动商品范围冲突检查，按店铺隔离。鉴权活动 API 已实现列表、读取、草稿保存、更新和删除；平台发布尚未实现，因此 Active/Scheduled 请求返回 409，不会造成“后台生效、结账未生效”的误报。

2026-10-14 继续开发：Go Function 已实现版本化规则读取、同 Product 不同 Variant 数量汇总、最高已达档及行级金额计算；自动折扣 GraphQL 创建/更新/删除适配器已通过注入响应的本地测试。服务端增加单活动及跨活动市场金额模式校验、币种一致性与 35 条启用规则上限。`app` 22/22、`web` 48/48、Go 测试通过，服务端和前端构建通过；前端测试输出 WebSocket 端口占用警告。前端仍使用原型内存活动，发布编排与真实商品 ID、Function 构建/部署、Theme App Block、开发店购物车/结账均未完成，不标记 VERIFIED。

档位拖拽增量：移除可见的上下箭头，拖拽柄启动后由整张 tier 卡片跟随指针，其他卡片让位；手柄聚焦后按上下方向键可直接排序。稳定 `tierId` 保留档位内容与推荐标记。Chrome 无头本地浏览器实测桌面鼠标拖动 Single 到 Duo 后、390px 手机视口键盘排序后，卡片顺序均更新；手机无横向溢出或页面脚本错误。原版动态效果因本会话缺少可操作的内置浏览器工具未逐帧核验；参考静态截图与用户确认的交互描述，不标记视觉 VERIFIED。

## 2026-10-19 REST 版本与档位操作（当前 main，未推送）

Admin REST 服务请求统一改为 `v20260901`，保留原有 SDK OAuth、offline Admin 会话刷新和 scope 落盘校验。语言、市场/结算货币、店铺身份和商品模板请求携带服务端 Bearer token 与 `application/json; charset=utf-8`；语言请求日志仅记录请求 ID、阶段、REST 版本、上游状态及安全 trace ID，不记录 token 或响应正文。审计确认本地 manifest、授权 scope 和已安装会话检查均要求 `read_translation`。此前应用鉴权成功但 `/store/languages.json` 上游返回 436；本轮未使用真实店铺会话重新请求，**436 是否解决仍未验证**，不能把应用返回 502 当成其根因。

活动编辑器每档增加独立的复制和删除图标。复制使用新稳定 ID、插在来源后，取后续第一个未占用数量，市场覆盖深拷贝且不继承推荐状态；删除只在确认弹窗后更新草稿，最后一档不可删除。弹窗支持取消、Escape、遮罩关闭与焦点返回；操作和确认文案覆盖 11 种后台语言。定向 DOM 测试通过，服务端 64/64、前端 104/104、两端构建通过，`git diff --check` 通过。仍未进行真实浏览器桌面/移动截图核验，也未进行真实店铺保存及上游 436 对照请求；这两项保持未验证。

## 2026-10-19 活动外观与 trace 日志增量（当前 main，未推送）

外观配置已将“价格”标为“售价”，拆分常规卡片与选中卡片边框、预计节省文字与金额颜色，并增加加购按钮边框色；“规格值选中边框”保留功能并更名为“选中规格边框”。标题由前台语言的 `widget.title` 译文控制，未填写时预览及主题组件均不显示标题；公开活动接口只返回当前语言的标题，译文仓储异常不会阻断已发布活动。标签改为参与卡片正常排版，色板共用款式图尺寸、圆角及图下色值开关。取色器保留黑色区域的饱和度位置，避免拖到底部时色圈跳动。

语言 API 日志从响应头读取 `traceId`、`x-trace-id` 或 `x-shopline-trace-id`；若 436 响应未提供这些头，则明确记录 `traceId: null` 和 `traceHeaderPresent: false`，不编造追踪号、不记录令牌或任意响应头。后端 67/67、前端 107/107、主题扩展 19/19 测试通过，前后端构建及 `git diff --check` 通过。取色器底部真实指针交互、标签大字体桌面/移动截图、真实主题商店和 SHOPLINE 436 响应头仍未端到端验证，不能标记视觉或平台验收完成。

后续修正：颜色色板的外层按钮与内部色块均使用款式图圆角变量；取色器拖动时保留未量化的 HSV 坐标，避免接近黑色时由 HEX 舍入造成选择点和色条跳动。语言 API 在所有 HTTP 响应状态下记录安全白名单中的 `content-type`、`cf-ray`、`x-request-id`，同时继续记录可获得的 trace ID；不记录 Cookie、授权头或其他未知头的值。单元测试覆盖近黑色坐标和成功/436 响应。后端 68/68、前端 109/109、主题扩展 19/19 测试通过，前后端构建和 `git diff --check` 通过。无头 Chrome 可取到本地页面 HTML，但缺少店铺会话时 React 根节点为空，故此轮截图与真实指针交互仍未验证。

语言 API 诊断增量：`v20260901 GET /store/languages.json` 的 OAS 将 `Content-Type` 定义为固定值 `application/json; charset=utf-8`，代码已与其对齐。每次上游请求日志包含方法、完整 URL、应用显式设置的脱敏请求头和不可直接执行的脱敏 cURL；响应日志包含状态、响应头名称及安全值（Cookie、授权及未知头值遮蔽），失败时仅摘要化 JSON 错误字段或 HTML 标题，成功时记录通过校验的默认语言与启用语言。请求响应体限制为 64 KiB，以免无长度的错误页导致无界读取；`node-fetch` 自动补充的传输层头不属于这些应用显式请求头。后端 71/71 测试和构建通过；尚未以真实店铺会话重新验证 436，不能断言其根因已解决。

2026-10-19 前台译文编辑增量：根据所选店铺前台语言预填可编辑的默认译文，覆盖后台支持的 11 种语言及目标店返回的阿拉伯语；保留英文原文列，已保存的商家译文优先，默认译文仅在商家点击保存后写入。新增测试覆盖语言代码映射、商家覆盖及所有文案的占位符。定向测试 2/2、前端构建通过；全量前端测试输出到第 65 项后进程未退出，并伴随 Vite WebSocket 端口占用提示，已停止，不能视为全量通过。真实店铺页面及前台效果尚未验证。
2026-10-20 指定商品 Function 折扣第一阶段（本地实现，平台验收未完成）：编辑器通过鉴权商品目录搜索并保存真实 Product ID，服务端在发布前逐项核验商品存在；`all` 与 `collections` 范围暂不允许发布，旧分类草稿保存时保留原分类 ID。折扣适配器改为参考积分应用的 Admin REST Function 路径，创建只在返回 `app_discount_id` 后才将活动标为 active；暂停传入 Function ID。网络失败、5xx、HTTP 200 错误正文或缺少折扣 ID 均保留待核对锁。默认禁止真实发布，必须在核实 Function 部署和目标店 REST 合同后显式设置 `SHOPLINE_QUANTITY_BREAKS_PUBLICATION_ENABLED=true`。开发环境另设 `SHOPLINE_LOG_FULL_CURL=1` 可在 `shopline app dev` 终端输出含原始 Bearer token 与 JSON 的完整创建 cURL，生产环境无效；勿将该终端内容外传。当前目标活动只读核查仍为 `draft`、revision 9、`all` 范围，发布记录 `idle` 且无折扣 ID；本轮未改 SQLite、未发送真实折扣创建请求。REST Function 创建/删除路径和响应格式仅由本地参考应用及注入响应测试支撑，目标店合同、Function 上传/部署、折扣后台、商品页和结账效果均未验收；编辑器本轮也未取得认证嵌入页的桌面与 390px 截图，不能标记视觉验收通过。

2026-10-20 商品目录 502 排查：活动页请求 `ef428ee4-1379-46df-8814-6b825bd666e0` 在应用入口鉴权成功后返回 502，但原日志缺少 SHOPLINE 商品列表上游状态。用户另提供同日 07:35:26 UTC 的 Cloudflare Host 502 HTML；未取得与应用 request ID 的对应关系，不能断定是同一层故障。随后无凭据只读检查当前隧道和本机后端的同一路径均返回 302 登录跳转，表示检查时隧道已可转发，不证明此前应用 502 的根因已解决。官方 `v20260901 GET /products/products.json` 文档确认当前列表路径和查询/响应字段。商品目录现沿用应用 request ID 记录脱敏的上游请求、状态、耗时、平台 trace ID、网络故障和无效响应阶段；不记录 token、搜索词或商品数据。后端全量测试 95/95、构建和 `git diff --check` 通过；需认证会话再触发一次请求取得同 ID 的新 trace 才能定位上游失败。

后续认证请求 `76a041fa-c5fb-4872-aa2f-3b6691929eff` 证实 SHOPLINE 商品列表返回 200，本地随后因 `link` 分页解析报 `invalid_pagination / invalid_format` 并返回 502。后续认证请求先变为 `path_mismatch`，再变为 `missing_cursor`。对照积分兑换应用的分页实现后，商品目录只从 `link` 提取 `page_info`，下一页仍由本服务构造固定 SHOPLINE 商品接口 URL，不跟随上游链接目的地；兼容带尖括号 URL、裸 URL、相对 URL、转义尖括号、HTML 编码的 `&amp;` 和仅含游标的链接，拒绝空或重复游标。认证请求 `bfc38ad1-91af-4c22-9bfb-cedb16b97d3c` 的上游与应用商品接口均返回 200，用户确认编辑页能看到并选择实际商品；超过首屏的翻页、选择结果保存及折扣发布未验收。定向测试 12/12、服务端全量 102/102、后端/前端构建、前端类型检查和 `git diff --check` 通过；前端商品选择/适配测试 8/8 通过，全量前端测试 119/121，另两项固定 1280px 宽度断言与工作区当前 `width:100%` 的页面宽度改动冲突，不能视为前端全量通过。用户提供的 SDK 安装状态日志包含完整离线访问令牌，已提醒立即撤销/更新；不要将该日志或令牌纳入代码、文档或提交。
# 2026-10-21 编辑器局部视觉调整

状态：IN_PROGRESS。商品范围的覆盖检查入口已移至标题同一行，检查状态仍在展开内容中显示；默认档位的“默认选中”标签已移到复制按钮前，选择按钮只保留操作文案；移动预览采用本地 CSS 绘制的 iPhone 风格外壳（摄像头区域、侧键、底部指示条），不依赖远程图片。翻译页未保存切换弹窗仅提供“取消”和“保存翻译”，空活动页只保留页头创建入口。前端全量 135/135、后端全量 105/105、前端类型检查及两端构建通过；前端测试输出仍有 Vite WebSocket `EPERM 0.0.0.0:24678` 警告，退出码为 0。以独立本地预览入口检查 1440px、390px、320px 布局，320px 无横向溢出且标题不再逐字换行；截图为 [桌面](reference/screenshots/quantity-breaks-editor-scope-default-1440.jpg) 与 [手机](reference/screenshots/quantity-breaks-editor-iphone-shell-390.jpg)。截图入口不含真实店铺鉴权，真实 SHOPLINE 店铺交互及完整参考视觉验收仍待核验。`read_store_information` 仍在 manifest、必需 scope 与 OAuth 安装流程中，未完成权限移除。

## 2026-10-21 指定分类 ID Function 折扣（本地实现，真实店未验收）

状态：IN_PROGRESS。Function input 已读取 Shop Metafield 的 `inCollections` 分类变量，Go 规则依据每条折扣节点自己的分类 ID 和当前 `isMember` 判断，不把发布时的商品快照用于结账匹配。分类发布先完整分页核验成员与冲突，再写入并读回店铺分类 ID 并集，最后请求创建自动折扣；只有收到折扣 ID 才把本地活动标记为 Active。发布、暂停使用店铺级 SQLite 锁；暂停后并集仅保留其他仍有发布记录的活动，草稿不再阻止清理。成员变化的定期复查会记录冲突或未知状态，管理页展示提示。指定商品发布路径保留。

本地验证：后端 127/127、前端 136/136、Go 全量测试通过；后端构建、前端类型检查与生产构建、`git diff --check` 通过。前端测试仍输出 Vite WebSocket `EPERM 0.0.0.0:24678` 警告。`sl-function build` 访问 `s2cdn.myshopline.com` 时 DNS 解析失败，未完成 WASM 构建、上传或目标店扩展部署核对。未对目标店发送 Metafield 或折扣写入请求，也未核对 REST 响应、平台折扣 ID、购物车/结账命中及分类成员变化。公开商品组件目前使用定期更新的分类成员快照，成员变化与下一次扫描之间可能延迟展示；Function 的实时匹配仍须在真实店验证。此次编辑器发布按钮与管理页冲突提示尚未取得认证店铺的桌面/手机截图，视觉验收未完成，不标记为 VERIFIED。发布开关继续默认关闭。

2026-11-03 活动平台状态排障（本地实现，待部署取证）：发现发布记录进入 `needs_reconciliation` 后，列表仍以活动配置内的旧 `active` 显示“进行中”。前端现在优先读取服务端 `platformState`：已核验 `paused` 显示“已暂停”，未核验显示“状态暂无法核验”，不再把本地旧状态当作平台事实；暂停筛选也已可用。Worker 的状态读取失败会安全记录 GraphQL 错误码、HTTP 状态和请求 ID，不记录令牌或响应正文。前端定向回归、TypeScript 与生产构建，及 Worker 定向单测、类型检查和 dry-run 均通过。完整前端套件为 237/240，3 项既有 variant-display 断言失败；真实 SHOPLINE 状态读取和暂停/启用尚待部署诊断后验证，保持 IN_PROGRESS。

指定商品与分类共用 `discountNodes.metafields.value` 传递活动规则。指定商品的 `productIds` 位于折扣创建请求的 `sale/quantity_breaks` JSON 元字段内；`input.graphql` 已读取节点元字段和购物车商品 `id`，Function 按名单与排除名单判断。参考积分应用的 Function input 也是读取节点元字段，并未单独声明 `productIds` GraphQL 字段。此路径有创建载荷和 Go 匹配的本地测试，真实店铺创建仍未验证。

编辑器局部调整：第二、第三种布局的右上角标签在编辑器预览与主题组件中占独立标题行，负上边距使其贴在卡片上边框，长标签可换行且不占标题位置；覆盖检查结果移到范围选项上方。检查按钮位于折叠内容之外，点击时展开商品范围并执行检查。新增折叠交互测试与主题标签位置属性测试。前端 137/137、主题 20/20、服务端 127/127、Go Function 测试、前端类型检查、前后端构建和 `git diff --check` 通过；前端测试仍有 Vite WebSocket `EPERM 0.0.0.0:24678` 警告。Chrome 无头进程在当前环境退出码 134，内置浏览器禁止打开本地 `file://` 页面，因此本轮未取得新的桌面/手机截图，不能标记视觉或真实店铺验收通过。参考项目的商品级 `discount_functions/product_discount` 元字段用于该项目另有的单品配置读取，本项目当前规则通过折扣节点元字段传入，不应机械复制其 input。
2026-10-21 PC/移动端独立样式：Widget 配置增加独立 `mobile` 样式，旧活动首次读取时从 PC 配置深拷贝；编辑器样式面板与实时预览共用 PC/Mobile 切换，所有布局、卡片、颜色、字体、标签位置、规格展示和价格展示均写入当前设备配置。主题 App Block 在 750px 及以下选择移动配置，旧活动回退桌面配置。移动配置校验、编辑器结构、Widget 规范化和主题挂载测试通过；尚未完成真实开发店桌面/移动截图与主题端断点实机验收，状态保持 IN_PROGRESS。

2026-10-26 前台实时预览精简：编辑器紧凑预览不再在优惠组件上方重复渲染所选商品图片与商品标题；商品选择器仍在预览区域顶部展示商品名称，所选商品数据继续用于规格、价格、库存和优惠计算。所有 `font: <weight> <size>/<line-height> inherit` 声明已拆分为等价的独立字体属性。新增静态渲染与样式回归测试，防止图片、`h3` 标题或目标字体简写恢复；真实店铺视觉验收仍待执行。
2026-10-21 标签样式清理：移除被最终 storefront 规则覆盖的小屏与横向/Grid 标签定位规则，保留按 corner/below_subtitle 的最终布局，并将 `.tierTag` 文本居中。Widget 布局测试 14/14 通过。
2026-10-21 档位与字号调整：横向/Grid 布局不再渲染 `tier-desktop`/`tier-mobile` 档位单选输入，整档点击仍可切换选中状态；Widget 字号编辑器和服务端校验最低允许 5px。编辑器结构测试 17/17、服务端领域测试 8/8、前端类型检查通过。
2026-10-21 横向/Grid 档位与实时预览增量：第二、第三种布局的档位卡片按标题、副标题、标签、总售价/原价和规格控制顺序呈现；规格行显示当前档位下的规格售价与原价，并继续由 `selectorStyle` 驱动下拉框、原款式图、纯文本或颜色色板。实时预览增加独立商品目录选择器，选中的商品只替换预览内容，不修改活动商品范围；预览模式也保留规格选择控件。编辑器结构测试 18/18、Widget 布局测试 14/14、前端类型检查和 `git diff --check` 通过。真实商品规格数据、开发店视觉与主题端验收仍未完成。

2026-10-21 无规格商品与标签位置修正：预览选中真实商品后，单一默认款式不再回退演示规格或图片；它继续参与每档总售价/原价计算，但不显示 `#1/#2/#3`、单项价格或规格选择器。款式图模式在真实商品没有图片时渲染空白图块，不再使用演示图片。编辑器预览和主题 App Block 将标签定位统一为四种布局共用的 `corner` / `below_subtitle` 规则，副标题下方进入正常文档流，右上角贴卡片上边框，从而消除切换布局后残留定位。前端全量 147/147、主题扩展 21/21、前端类型检查、生产构建和 `git diff --check` 通过；测试环境仍会输出 Vite WebSocket `EPERM 0.0.0.0:24678` 警告，退出码为 0。当前环境未能连接可操作的浏览器进行真实店铺截图和交互验证，状态保持 IN_PROGRESS。

2026-10-21 多规格档位交互修正：四种布局均只为当前选中的档位展开规格下拉框、款式图或规格值控件，切换档位后重新以该档位的选择状态渲染，避免同时展开的多组控件相互干扰。保留用户对横向/Grid 档位售价与原价换行的 CSS 调整，并恢复右上角标签的定位上下文。定向编辑器、规格选择和布局测试 43/43 通过；真实开发店的点击交互仍待浏览器验收。
2026-10-22 预览无货规格展示：颜色/文本规格按钮和下拉选项保留无库存值，统一显示“售罄”并禁用选择；有库存规格继续可正常切换。款式图模式原有的无货禁用行为保持不变。前端全量测试 147/147、TypeScript 检查和 `git diff --check` 通过；真实商品库存与店铺页面仍待实机验收。
2026-10-22 库存策略与缺货加购：商品变体保留 `inventory_policy`；`continue` 款式即使库存为 0 也按可购买处理。`deny` 缺货款式仍可在预览中选择，但当前档位任一款式缺货时加购按钮禁用并显示 `Sold out`；下拉框、文本/色板和款式图均不再阻止选择。商品目录测试 14/14、前端测试 148/148、后端构建、前端类型检查与生产构建通过；真实店铺加购行为仍待实机验收。
2026-10-22 预览商品空白与标签定位修正：右上角标签的定位上下文从 `.tierHeader` 移到 `.tierOption`；商品预览映射兼容缺失或空的变体 `options`，避免选择商品后因接口字段不完整导致 React 渲染失败。新增商品预览缺少规格元数据回归测试，Widget 定向测试 19/19、前端类型检查通过；真实开发店选择商品交互仍待实机验收。
2026-10-22 商品预览空目录回退：当商品选择接口没有返回 `variants` 列表时，预览回退到稳定的演示目录并继续显示所选商品标题，避免空目录状态导致页面空白；有真实变体时仍使用真实商品规格。Widget 定向测试 20/20、前端类型检查和生产构建通过；真实开发店点击商品仍待实机验收。
2026-10-22 商品切换空白根因修复：商品目录切换期间旧 slot 可能暂时无法在新目录中找到对应 variant，预览此前仍读取 `variant.price` 而触发运行时异常并清空页面。现在 slot header 在 variant 尚未匹配时安全等待新目录同步；新增真实重渲染回归测试。前端全量测试 151/151、类型检查和生产构建通过；真实开发店点击商品仍待实机验收。
2026-10-22 规格库存联动与基础色板：规格值库存状态改为按当前另一规格组合判断，所有缺货值继续显示并保持可点击；缺货按钮和款式图以置灰斜杠表达，不再显示规格级 `Sold out` 文案，库存策略为 `continue` 的变体仍可购买。颜色色板新增 red/红色及常见多语言基础色映射，款式图保留真实图片或空白占位。新增联动库存与色板映射测试；目标测试通过，前端类型检查和生产构建通过，真实开发店库存联动仍待实机验收。
2026-10-22 库存追踪字段修正：商品目录、预览组件和主题组件读取 `inventory_tracker`；该字段为 `false` 时视为不追踪库存，即使数量为 0 或平台 `available` 为 false 也按可购买处理，`true` 时按库存数量校验。新增目录归一化、规格选择和主题组件回归测试。

2026-10-22 规格选择与商品选项名称：纯文本、色板、原款式图和下拉框均允许选择缺货规格；缺货仅影响加购校验，非下拉选择器显示斜杠，下拉选项追加 Sold out。库存规则统一读取 `inventory_tracker` 与 `inventory_policy`，未追踪库存或允许超卖的款式按可购买处理。选中规格的边框、背景、文字和阴影改用独立颜色变量，避免被缺货样式或活动卡片边框覆盖。商品目录请求和响应保留商品级 `options[].name`，编辑器预览显示真实规格标题。前端 156 项、后端 133 项、主题 21 项测试通过，前后端构建、类型检查和 `git diff --check` 通过；真实店铺主题视觉和结账行为仍需验收。

2026-10-22 原款式图规格范围：当规格显示方式选择“原款式图”时，仅第一个商品规格使用真实款式图按钮；后续规格继续以文本值显示，保留缺货斜杠、选中状态和规格切换能力。编辑器预览与主题 App Block 共用该规则，新增两端回归测试；前端、后端和主题测试及构建通过，真实店铺视觉仍需验收。
2026-10-22 全部商品规格动态展示：编辑器预览不再限制只显示两个规格，也不再把预览选择固定为颜色/尺码；变体按商品返回的 `options` 名称和值建立动态映射，Dropdown、文本/色板和原款式图模式均渲染全部规格，原款式图仅第一规格使用图片。新增三规格商品回归测试；前端原型测试 158/158、TypeScript 检查和生产构建通过，真实开发店主题视觉与交互仍待验收。

2026-10-26 样式面板与规则摘要优化：PC/Mobile 切换已放到“样式”折叠标题同一行；切换会先展开样式面板，再应用对应设备的独立样式。规格配置位于颜色配置之前。规则摘要改为档位表格，列为档位名称、折扣类型、折扣数值、数量和默认选中，推荐档使用 Lucide `Check` 图标并有无障碍名称。窄屏实测发现摘要表格的最小宽度会撑开页面，已将横向滚动限制在表格容器内：390px 下页面宽度与视口一致，表格保持可横向查看。通过已登录 SHOPLINE 编辑页检查了样式切换、字段顺序和摘要显示。相关前端回归（编辑器/覆盖 24/24、预览布局 26/26）、前端类型检查和生产构建通过；完整前端套件受本环境 30 秒执行窗口限制，未取得最终汇总，不能标记为全量通过。真实分类活动的发布、Function 调用和结账仍待验收。

2026-10-26 指定商品与指定商品分类优先级：指定商品与指定商品分类的重叠不再阻止创建或发布；编辑器分页读取所选分类成员并提示“商品 X 已在指定商品活动 Y 中生效，指定商品规则优先”。同级重叠（商品对商品、分类对分类）继续阻止。Function 对同一商品将指定商品规则优先级设为高于指定分类，若同优先级存在多个命中规则则不输出折扣，避免重复优惠。本地 Go 单元测试、服务端构建与测试、前端定向测试、TypeScript 检查及生产构建已验证；真实 SHOPLINE 店铺的折扣创建、Function 调用及结账结果尚未验收，状态保持 IN_PROGRESS。

2026-10-28 折扣活动列表交互增量（本地实现，真实店铺视觉未验收）：活动行点击直接进入编辑页，移除单行编辑按钮；增加分页、页面级全选/多选及批量启用、删除、结束活动。列表表头改为活动标题、商品、档位、状态、开始时间、结束时间、可叠加折扣，单商品通过批量商品目录请求显示真实标题，多个商品显示数量；档位按行显示，暂停/结束统一为已失效，草稿/排期显示为待生效。新增结束活动接口会先安全暂停已发布折扣再持久化 ended 状态，并保留 revision 校验。后端测试 146/146、前后端构建通过；前端旧测试仍有两项断言编辑按钮和详情链接，与本次已确认的整行编辑行为冲突；真实 SHOPLINE 活动列表和桌面/移动截图尚未验收。

2026-10-28 活动列表选择列微调：选择列总宽度统一为 32px，其中左内边距为 16px、原生复选框为 16px；`colgroup` 和其余七列的可用宽度计算同步使用 32px，避免 `border-box` 使复选框溢出。新增对应 CSS 回归断言。定向测试 4/4、前端完整测试 183/183 和生产构建通过；测试环境仍会输出 Vite WebSocket `EPERM 0.0.0.0:24678` 警告，命令退出码为 0。未在真实 SHOPLINE 嵌入式后台复核视觉效果。

2026-10-28 订阅计费与市场金额文案复核（本地未推送）：根据用户确认，SHOPLINE 应用套餐可按月或按年收费；当前 `Ultra` 保持唯一月付 SKU，月付账期固定按 30 天计算，未新增未经配置和验证的年付 SKU。订阅设计中的套餐表、结算 SKU 约束和后台展示文案已统一为“USD 14.99 / 月（每 30 天）”。市场指定金额的叠加提示已同步覆盖 11 种后台语言，避免在已完整的“商品折扣、订单折扣、运费折扣”类型名称后重复追加“折扣”。定向文案测试 3/3、前端生产构建和完整前端测试命令通过；测试运行时仍出现既有 Vite WebSocket `EPERM 0.0.0.0:24678` 警告，未影响退出码。订阅接口、权益守卫、Webhook 与年付套餐尚未实现或真实店铺验证，保持 IN_PROGRESS。

2026-10-28 订阅权益闭环本地实现（未部署、未推送）：Worker 新增订阅状态读取、动态 Ultra USD 30 天 SKU checkout、订单号持久化、支付回跳与复查入队；订阅 Webhook 增加签名/店铺/应用隔离、重复事件幂等、支付订单状态单调更新。权益复查和失效操作队列支持 Partner list/detail、有限退避、宽恕期结束后的 Function 折扣删除与本地 `paused`/`subscription_expired` 记录；续约会取消旧失效任务，每日 Cron 按店隔离执行。后台新增 `/quantity-breaks/plan`，前端主工作区先做权益预检，`403 SUBSCRIPTION_REQUIRED` 清空旧数据并跳转套餐页，套餐文案覆盖 11 种语言；主题组件已保留非 200、无活动、异常 JSON 的清空隐藏行为。Worker `typecheck`、前端生产构建、主题 27 项自动化测试通过；Cloudflare Worker Vitest 在本机 pool 初始化阶段因 `cloudflare:test-internal`/运行器环境提前退出，Worker 全量测试尚未取得结果；SHOPLINE 开发店、远程迁移、部署、支付/续约/失效实测均未执行，不标记 VERIFIED。

2026-10-28 订阅权益闭环验证更新（本地已验证，未推送）：修复远程浏览器中脱离 `window` 的 `fetch` 引用导致套餐页 `Illegal invocation` 的问题；套餐页已订阅状态改为独立文案，不再误显示为宽恕期。复查现支持跨 Partner `list` 分页，订单状态对 `paid`、`expired` 等乱序事件保持单调；失效队列查询改为与实际活动 JSON 模型一致。Worker 类型检查、模块边界检查、完整 Worker Vitest `91/91`、完整前端 Node 测试 `188`、前端生产构建、主题组件 `27/27` 和 `git diff --check` 均通过；本地浏览器在桌面与 390px 移动视口确认套餐页失败态无框架异常和无布局重叠。SHOPLINE 文档搜索因当前环境网络不可用，未据此扩展或改写 API 字段；真实 SHOPLINE 开发店流程未验证。远程 D1 `0003_subscription_entitlements.sql` 与 Worker 部署尚未执行，原因是运行环境要求对持久化数据库迁移单独取得用户明确确认；部署按顺序等待该迁移完成。

2026-10-29 套餐 checkout 失败可诊断性与页面状态优化（本地实现，未部署）：`POST /api/quantity-breaks/subscription/checkout` 失败时按 SKU 查询、SKU 校验、订单写入和付款链接创建返回安全错误码及唯一 `requestId`，Worker 日志记录对应阶段且不向浏览器返回 Partner 原始响应或密钥。套餐页采用现有 Sea/Mint/Coral 运营台视觉令牌，明确 Ultra 价格、状态和 SHOPLINE 付款链接失败的就地恢复入口；请求编号在错误块中可见，按钮加载状态和窄屏布局保持稳定。新增 Worker 订单写入失败、前端 API 错误编号和套餐页点击失败三个回归覆盖；Worker 定向 3/3、前端定向 4/4、Worker 类型检查和前端生产构建通过。以本地页面在桌面及 390px 窄屏核验读取失败状态，未发现文本裁切或布局重叠；真实 SHOPLINE `create_pay` 成功跳转与生产失败错误码仍待部署后在开发店验证。

2026-10-29 Ultra 套餐权益说明与双入口（本地实现，未部署）：套餐页增加 Ultra 的 6 项可交付能力说明：多件阶梯规则、商品/分类定向、指定市场金额、PC/移动端独立商品页组件样式、折扣叠加控制和 11 种语言本地化。无订阅商家同时显示“立即订阅”和“开始试用”，两者均通过现有 `create_pay` 跳转 SHOPLINE 原生付款页；SHOPLINE 套餐配置仍是试用资格的权威来源。11 种语言均提供标题与说明；已订阅、宽恕期、失效和核验中状态沿用既有续费或锁定逻辑。套餐权益多语言测试和 DOM 交互测试通过；本地匿名入口因无嵌入式会话只能验证订阅读取失败态，完整套餐页面需在登录的 SHOPLINE 后台验证。

2026-10-29 应用套餐页与一次性试用资格（本地实现，未推送）：套餐页改为“应用套餐 + 应用语言选择器 + Ultra 套餐卡片”，不再显示旧 `Quantity Breaks` 标题或说明。应用名按 locale 使用“多件优惠 / 多件優惠 / Multi-item discount”，页面与试用 CTA、价格周期、试用状态和六项能力均覆盖 11 种语言；简体中文价格为 `US$14.99/30天`，试用 CTA 为“免费试用 7 天”。试用中卡片显示本地化“试用中”徽章并只提供订阅入口。Worker 订阅读取接口新增 `trialEligible`，以 app 与店铺隔离的一次性试用账本决定；已消费试用的 `intent=trial` checkout 返回 `409 TRIAL_ALREADY_CONSUMED`，付费订阅入口不受影响。应用侧不会向 SHOPLINE `create_pay` 虚构未验证的试用字段，SKU 的实际试用授予仍由 Partner 平台配置决定。Worker 定向、完整 Vitest、模块边界和类型检查，前端定向/完整测试及生产构建命令均成功；本地浏览器在桌面与 390px 视口核验了未登录读取失败态和语言选择器，无控制台 error。完整权益卡片及真实 SHOPLINE 收银台仍待嵌入式开发店验收。

2026-10-29 多规格混购与分类活动规则调整（本地实现，未推送）：移除活动样式中的“允许不同规格混购”开关，同一商品的不同规格固定合并计数；规格选择、库存校验及同 SKU 合并加购保持不变，旧活动配置中的该字段会在读取时安全移除。范围冲突仅阻止生效时间重叠的“指定商品对指定商品”；分类对分类、分类对指定商品与全部商品不再由应用层拦截。Function 保留指定商品高于分类的优先级；两个分类规则都命中时不再提前过滤，交由 SHOPLINE 的最近更新规则优先机制决定。订阅 checkout 失败响应新增安全诊断字段（失败阶段与上游 HTTP 状态），不返回 Partner 响应内容或密钥；生产已确认 Partner token 名称存在，但历史 D1 无订阅订单，原始请求无法追溯，需部署后重试以获取具体阶段。Worker 全量测试 94/94、类型检查、模块边界检查、前端完整测试和生产构建通过，`git diff --check` 通过。Function 子项目的 `npm test` 为占位脚本且当前环境没有 Go，新增 Go 单测未实际执行；真实 SHOPLINE Function 优先级与付款链接仍待开发店验证。

2026-10-29 应用字体与套餐价格层级（本地实现，未推送）：应用根节点、后台显式标题与套餐页统一使用 `Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`。Ultra 价格改为 `strong.billing-price` 的 `$14.99` 与 `small#billingGrowthCycle` 的 30 天周期两层结构，周期覆盖 11 种语言；窄屏下价格组保持左对齐且不截断。新增全局字体栈与价格 DOM 回归断言，完整前端 Node 测试和生产构建通过，`git diff --check` 通过。本地 `http://127.0.0.1:5173/quantity-breaks/plan` 在无认证状态下仅验证了错误态与语言选择器，无框架错误覆盖或文本重叠；未取得真实权益卡片的桌面/移动截图，待嵌入式 SHOPLINE 开发店验收。

2026-10-29 订阅 checkout Partner API 调用上下文修复（本地实现，未推送）：生产实时日志确认 checkout 在 `sku_lookup` 阶段失败，原因为 `PartnerSubscriptionClient` 以类实例作为 `fetch` 的 `this` 调用上下文，Cloudflare Worker 拒绝该调用并报 `Illegal invocation`。请求改为以 `globalThis` 作为调用上下文；新增回归测试，确保注入的 Partner fetcher 不会收到客户端实例上下文。定向 Worker 测试、类型检查与模块边界检查已通过；完整 Worker/前端验证待本轮结束前执行。

2026-10-29 需求与建议 UI 预览（IN_PROGRESS，本地未推送）：新增隔离的 `/preview/feedback-board`，包含状态筛选、排序、预览投票与五种状态示例数据；主操作“建议”打开含标题、内容、取消、提交的表单弹窗。提交只关闭预览弹窗并在嵌入式后台调用现有 App Bridge 成功消息“提交成功”，不渲染本地成功 toast，预览数据也不会持久化。已在本地 `http://127.0.0.1:5173/preview/feedback-board` 以 1037px 和 390px 视口检查列表、弹窗与提交交互，截图保存为 `docs/reference/screenshots/local-feedback-preview-1037.png` 与 `docs/reference/screenshots/local-feedback-preview-390.png`；定向 Node 测试 4/4 通过。真实 SHOPLINE 嵌入式后台的 App Bridge 成功提示和后续 Worker/D1 持久化尚未实施或验收，因此保持 IN_PROGRESS。

2026-10-29 应用与前台语言集合扩展（本地实现，未推送）：管理端语言集合扩展为既有语言加马来语、泰语、印度尼西亚语、越南语和日语；前台建立 36 个标准 locale（含阿拉伯语、保加利亚语、捷克语、丹麦语、德语、希腊语、英语、西班牙语、爱沙尼亚语、芬兰语、法语、印地语、克罗地亚语、匈牙利语、印度尼西亚语、意大利语、日语、韩语、立陶宛语、拉脱维亚语、马来语、挪威语博克马尔语、荷兰语、波兰语、葡萄牙语巴西/葡萄牙、罗马尼亚语、俄语、斯洛伐克语、斯洛文尼亚语、瑞典语、泰语、土耳其语、越南语、简体中文、繁体中文）。新增 `zh-CN/zh-SG -> zh-Hans`、`zh-TW/zh-HK/zh-MO -> zh-Hant` 和葡萄牙语变体标准化；管理端新增语言暂以英文词典作为明确 fallback，前台缺少商家译文时继续回退默认文案。主题组件和 Worker 商品页接口共用 locale 标准化，避免别名导致译文读取不到。语言契约、管理端词典、订阅页和前台默认文案定向测试通过；完整前端构建、Worker 类型检查和全量测试待本轮结束前验证，真实店铺语言列表与主题视觉仍待实机核验。
2026-10-29 新增语言真实译文补齐（本地实现，待推送部署）：印尼语、日语、马来语、泰语、越南语的后台 JSON、订阅页、前台默认文案已替换为真实译文；活动列表、批量操作和编辑器样式/校验核心文案不再回退英文。新增语言契约测试覆盖后台工作区与编辑器核心标签，前端定向测试 14/14 通过；Vite 测试仍会输出既有 WebSocket `EPERM 0.0.0.0:24678` 警告但不影响退出码。完整 Worker/前端构建、真实 SHOPLINE 店铺语言切换和主题实机验收待推送部署后进行。

2026-10-29 订阅支付即时复查（本地实现，待推送部署）：支付回跳与 `appsubscription/create|paid|expiration` Webhook 在完成签名、应用、店铺和重复事件校验后，使用 `waitUntil` 立即领取 D1 `reconcile` 操作；回跳传入订单关联的订阅 ID，Partner `list` 暂时不可见时保留 `review_pending` 并按短退避复查。Partner 返回的订阅必须匹配当前店铺、`ultra` 和 `quantity_breaks_access` 才能授予权益，0 元支付仍走同一复查路径。套餐页在 `payment=review_pending` 回跳后每 2 秒轮询，最多 30 秒，只有新读取确认 `trial/active/grace` 才解除锁定，卸载时清理计时器。Worker 类型检查通过；前端套餐页定向测试 4/4、前端完整测试 200/200、生产构建通过。Cloudflare Worker Vitest 在隔离运行器启动后退出且无汇总；前端全局类型检查仍有既有未改动文件错误。远程 D1、Worker 部署、真实 SHOPLINE 支付/续约/Webhook 和跨店开发店验收尚未执行。

2026-10-30 原生订阅状态门控（本地实现，未推送）：订阅读取接口现在使用 `v20260901` Partner `list + detail` 实时复查，兼容官方新字段；只有当前店铺的 Ultra 订阅详情包含 `quantity_breaks_access` 才返回有效权益，首次授权也不绕过复查。`unknown`、其他套餐或缺少功能点会要求进入应用付费套餐页；Partner 暂时失败时保留最近确认状态。套餐页移除本地试用入口和 `intent=trial`，只在商家点击后发送付费 checkout；有效试用、付费 Ultra 和宽恕期访问套餐页会回到应用，支付回跳轮询确认有效权益后也回到应用。应用壳从套餐页返回工作区时会再次执行订阅复查，避免停留在旧的 loading/denied 状态。新增路由、Partner 字段和前端回归测试；Worker 类型检查通过，前端订阅定向测试 9/9、前端全量测试 202/202、前端生产构建和 `git diff --check` 通过。Worker Vitest 在本机初始化 Cloudflare 隔离运行器后退出码为 1，当前环境无法解析 `cloudflare:test-internal`，因此未取得 Worker 断言结果；未执行远程 D1、部署或真实开发店验收。
2026-10-30 需求与建议真实交互补全（IN_PROGRESS，本地未推送）：`/quantity-breaks/feedback` 的真实列表现有“建议”入口、标题/内容/取消/提交对话框、服务端查询/状态/排序、加载/空白/错误态和直接投票；提交建议与发布评论成功后沿用应用的 App Bridge 成功提示。单条建议详情显示标题、内容、状态、票数、发布时间、店铺 handle 或“匿名用户”的评论，以及带图标的“多件折扣”官方回复；评论已移除附件上传。Developer Platform 新增受 HMAC 与 nonce 防重放保护的 `PATCH /internal/admin/v1/feedback/:id/status`，校验五种状态、写状态历史及审计；官方回复仍仅由该内部边界创建并固定显示为“多件折扣”。前端全量原型测试、前端生产构建、Worker TypeScript 检查和 `git diff --check` 已通过。Worker Miniflare 路由测试受已安装 `vitest@3.2.7` 与 `@cloudflare/vitest-pool-workers@0.8.71` 的全局计时器兼容问题阻塞，三个反馈测试未进入用例执行；本地非嵌入式页面也因既有订阅/店铺身份守卫渲染为空工作区，未完成真实路由截图与 SHOPLINE 会话验收。因此保持 IN_PROGRESS，不标记为已完整验证。

2026-10-31 SHOPLINE Admin 令牌 401 自动恢复（本地实现，待推送部署）：OAuth 换码与令牌刷新统一读取并校验 `expiresAt`、`expireTime`、`expires_at`；缺失或不可解析的有效期不再写入 `2099` 占位时间。`/api/quantity-breaks/shop` 首次读取店铺身份遇到 SHOPLINE Admin 401 时只强制刷新一次令牌并重试一次读取，不重试写操作；刷新或重试确认授权失效时返回现有 App Bridge 重新授权响应头与安全 403，而不再包装为 502。新增有效期校验、刷新持久化、一次性恢复与重新授权的回归覆盖。Node 单测 7/7、Worker TypeScript 检查通过；Cloudflare Worker Vitest 在隔离运行器初始化后以退出码 1 提前结束，使用 Node 20.17 与 24.22 均未进入测试用例，故路由断言尚未在本机实际执行。部署后才可将 `buchaqian` 的本地会话有效期定向设为当前时间以触发一次已修复的刷新，并需在真实嵌入式店铺验证 `/api/quantity-breaks/shop` 返回 200。

2026-10-31 付款回跳 Session JWT audience 兼容（本地实现，待推送部署）：SHOPLINE session JWT 的 `aud` 可为字符串或字符串数组；Worker 现将其规范化为字符串列表，并只在其中包含当前 `SHOPLINE_APP_KEY` 时继续校验 `HS256` 签名、有效期和已安装会话。修复付款回跳后的有效 Bearer JWT 因数组 audience 被提前拒绝为 401 的问题；未放宽任何其他认证条件。新增该 JWT 形态的会话认证回归测试。Worker TypeScript、Node 单测 7/7、模块边界检查和 dry-run 构建通过；Cloudflare Worker Vitest 在本机隔离运行器启动后退出，新增会话回归尚未在本机执行。真实嵌入式付款回跳仍待部署后复核。

2026-10-31 需求与建议 Shadcn 风格瀑布流重设计（本地实现，待推送部署）：状态下拉框改为带图标和数量徽标的按钮筛选，数量由公开建议状态聚合接口返回；列表改为桌面双列、移动单列的变量高度瀑布流卡片，保留搜索、排序、投票、官方回复标识和建议提交弹窗。预览页与真实 `/quantity-breaks/feedback` 页面共用筛选组件与视觉令牌。反馈定向前端测试 9/9、前端全量测试 206/206、前端生产构建和 `git diff --check` 通过；本地 Chrome 宽屏与窄屏实际检查了首屏、状态筛选和提交弹窗。Worker 反馈 Vitest 仍受本机隔离运行器启动后提前退出影响，真实嵌入式路由和生产部署尚未验收，保持 IN_PROGRESS。
# 2026-10-31 需求与建议瀑布流、作者身份与匿名发布（本地实现，待推送部署）

需求与建议列表改为小卡片瀑布流：宽屏三列、1100px 以下两列、移动端单列；标题最多两行、摘要最多三行，投票按钮阻止卡片点击冒泡，卡片其他区域支持打开详情。建议卡片显示作者快照，当前商家自己的建议显示“我的”徽标；详情页同步显示匿名用户或店铺 handle。发布建议弹窗增加“匿名发布”选项，Worker 接口保存 `submitter_handle_snapshot` 和 `is_anonymous`，并通过新迁移 `0005_feedback_authors.sql` 兼容已有 D1 数据。匿名作者不会泄露原始 handle，`isMine` 仅依据店铺 ID 判断。前端定向反馈测试 10/10、前端生产构建和 Worker TypeScript 检查通过；已在本地浏览器以 1440px 和 390px 检查三列与单列布局、匿名发布控件，以及卡片点击和投票事件分离。Worker Vitest 仍在 Cloudflare isolated runtime 的全局 fake-timer 初始化阶段提前退出，未进入测试断言。尚未完成真实店铺浏览器验收、GitHub 推送、远程 D1 迁移和 Worker 部署。
# 2026-11-02 需求与建议详情弹窗交互收尾（本地实现，待推送部署）

建议详情继续保留状态 emoji 与“我的”标签；投票操作增加图标，作者的撤销入口仅在服务端授予 `canWithdraw` 时显示，并移动到评论操作行。点击撤销会通过 SHOPLINE App Bridge 确认“是否要撤销这条建议？”，非嵌入环境使用等价本地回退对话框；确认后才会发起撤销请求。评论输入框新增 Unicode 字符计数 `0/2000`，无评论提示居中显示。提交建议和 UI 预览的匿名选项均移除“勾选后不会显示店铺 handle”辅助文本；用户更新的反馈页 CSS 保留并将随本次一并提交。

# 2026-11-02 建议详情内容层级调整（本地实现，待推送部署）

建议详情改为状态与“我的”标签、标题、建议内容、作者/时间、带图标的投票、评论分隔线的顺序。每条评论先显示内容，再在同一行展示商家 handle/匿名与精确到秒的日期；评论输入区上方不再添加额外横线，评论为空时继续居中显示提示。撤销与提交评论保持在匿名发布后的同一操作行。

# 2026-11-02 需求与建议筛选、公开拒绝状态与卡片标签（本地实现，待推送部署）

“待审核”筛选仅在商家开启“我的建议”后显示，并紧邻其右侧；关闭“我的建议”时若当前为待审核筛选，会安全回到“全部”。“已拒绝”改为公开建议状态，列表、状态计数、详情、投票和评论访问使用同一公开规则；新增 `0008_feedback_rejected_public.sql` 会将历史未撤回的已拒绝建议设为公开。官方回复显示应用 favicon 圆形头像。建议卡片标签改用原创 SVG 轮廓，状态、官方回复、我的固定占顶部三等分，并向卡片外露出一半；状态边框及标签色降为低饱和色。前端反馈定向测试 23/23、迁移 SQL 校验、Worker 类型检查、前端生产构建和 `git diff --check` 通过；Worker Cloudflare 隔离 Vitest 在运行器初始化后没有返回断言汇总，未将其标记为通过；本机没有可用 Chromium/Playwright，未生成新的本地视觉截图，生产嵌入式路由仍待部署后验收。
# 反馈页语言与加载（2026-11-02）

- 反馈页固定文案已接入共享 i18next 语言包；商家提交的标题、正文、评论与店铺 handle 保持原文。
- 官方回复作者显示当前语言的应用名称（`campaignTitle`），保留官方头像配置。
- 卡片标签改为可换行的状态标签，移除 SVG 缎带；反馈页在店铺/订阅信息加载期间显示骨架屏。
- 已验证：`web` 构建成功；`feedback-board.test.mjs` 覆盖共享语言键、官方多语言名称、普通标签与既有评论/投票交互。

# 2026-11-03 折扣平台状态与订阅失效（本地实现，待推送）

- 活动列表、详情和状态操作先同步 SHOPLINE 自动折扣；普通暂停保留原折扣 ID，恢复启用同一实体。新建、启用、暂停和删除均在关键平台动作后核验，只有确认 `ACTIVE` 的活动计入启用结果。
- 单项与批量暂停均经过 App Bridge 的取消/确认；取消不会发送状态请求。批量启用按店铺串行执行，指定商品重叠和指定分类 ID 重叠分别返回两个活动名及重叠商品/分类名，冲突项保持未启用，其余活动继续处理。
- 订阅确认失效后删除应用创建的自动折扣并保留配置；删除失败进入退避重试，`429 Retry-After` 优先于普通指数退避。续费后商家明确启用会创建新折扣。剩余 7 天且未自动续费时显示到期提醒。
- 本地定向验证已覆盖未来订阅周期不抢占当前权益、缺席二次确认、商品/分类冲突、暂停取消与确认、到期提示、创建状态回读及 `Retry-After`。真实 SHOPLINE 嵌入式后台暂停/恢复、订阅到期删除、深链接和桌面/移动截图仍待部署后验收，不能标记为已实机验证。

# 2026-11-03 折扣列表批量操作与暂停确认（本地实现，待推送）

- 折扣列表桌面表格和移动卡片均移除行级启用、暂停、删除入口；活动状态仅能在多选后的批量工具栏中变更。取消批量确认不请求接口也不清空当前选择，确认后才发送选中的活动 ID。
- 暂停的 App Bridge 弹窗改为官方 `confirm` 类型，使用当前 `@shoplinedev/appbridge@1.0.2` 所支持的 `MODAL_SAVE` / `MODAL_CLOSE` 事件完成确认与取消，并在任一事件后注销监听，避免重复提交。非嵌入环境继续显示等价的取消/暂停回退对话框。
- 已验证：新增的 App Bridge 事件、批量选择、取消、确认和列表布局回归测试通过；前端完整 Node 测试、TypeScript 检查与生产构建命令成功。测试环境仍输出既有 Vite WebSocket 端口占用警告。没有可用的真实 SHOPLINE 嵌入式会话或浏览器自动化，因此原生后台弹窗按钮、实际平台请求和桌面/移动截图仍待部署后验收。

# 2026-11-03 SHOPLINE 实时折扣状态与操作状态分离（本地实现，待推送）

- 活动列表和批量状态操作现在每次请求只通过一次 Product Function `GET /sales/discount_app.json` 批量读取、分页汇总 SHOPLINE 自动折扣状态，并以运行时 `platformStatus` 返回 `active`、`paused`、`missing` 或 `unverified`；前端只以该字段显示活动状态。D1 的 `platformOperationState` 继续保存发布操作安全状态，不再覆盖 SHOPLINE 的本次结果。
- `204 No Content`、网络错误和不完整响应只记录诊断并返回本次 `unverified`，不再把已确认的 D1 发布状态改写为 `needs_reconciliation`。暂停或启用前若状态无法核验会安全停止，返回统一提示且不发送 GraphQL 写操作。单项读取命中活动后立即停止分页，避免操作流额外消耗 SHOPLINE API 配额。
- 订阅失效删除、配置保留、`entitlement_revoked`、续费后手动启用创建新折扣的流程未修改。新增 Worker/前端回归覆盖读取 `204`、历史操作状态不覆盖 Shopline 实时状态、暂停安全中止和单项查询早停。定向 Worker 50/50、前端适配器 13/13、Worker TypeScript 与前端生产构建通过。Worker 全量为 193/205，前端全量为 238/241；剩余失败均在既有订阅、Webhook、内部管理或反馈预览测试，尚未进行真实嵌入式后台验收。

# 2026-11-04 折扣状态语义与暂停生命周期（本地实现，待推送）

- 列表适配器将 D1 草稿固定显示为“草稿”；只有已关联 SHOPLINE 自动折扣且开始时间在未来的活动显示“待生效”。SHOPLINE `active` 显示“生效中”，`expired/inactive` 显示“已失效”，暂停请求的 10 秒未到期阶段仍显示“暂停中”。
- 每次读取的 Product Function 列表若确认没有某个已关联折扣，Worker 会清除该平台关联并将本地活动转为草稿；网络错误、空响应或格式错误仍保留为“状态暂无法核验”，不会误创建重复折扣。
- 普通暂停继续通过 REST 将 `ends_at` 设为当前时间加 10 秒。列表同步不再自动删除到期折扣；商家下次启用时才先删除 `expired` 的旧 SHOPLINE 折扣，再以原配置创建新的持续生效折扣。批量启用的已生效项返回成功的 `already_active`，批量暂停的草稿、已暂停或已结束项返回幂等成功的 `already_paused`。
- 删除现在先同步 SHOPLINE 状态：进行中的活动会被拒绝并由 App Bridge 以所有后台语言提示“当前活动正在进行中，需要先暂停才可以删除”；草稿、已失效和待生效活动则先删除仍存在的 SHOPLINE 折扣、确认后再删除 D1 配置。批量删除逐项串行处理，确保某条失败不会阻止其他活动，也不会突破店铺级请求节流。
- 订阅失效仍会为所有保留 `discount_id` 的待生效、生效中和已暂停活动入队删除；草稿没有平台折扣则只保留配置。续费不自动创建折扣，商家显式启用才重新创建。已验证 Worker 全量 Vitest 222/222、模块边界、Worker TypeScript、前端状态适配器测试和前端生产构建；真实 SHOPLINE 嵌入式后台的暂停、重启、删除及订阅到期流程仍待部署后实测。

# 2026-11-04 草稿恢复与主题组件国际化（本地实现，待推送）

- 无 `platformDiscountId` 的 `needs_reconciliation` 活动现在会分页读取 Function 折扣列表，并仅通过应用规则 metafield `sale.quantity_breaks.campaignId` 唯一匹配时恢复关联；确认没有匹配时回到未发布草稿，列表不完整、请求失败或有多个匹配仍保持待核验，避免重复创建自动折扣。编辑草稿并保存时会按开始时间直接发布：未来时间为待生效，当前或过去时间为生效中。
- Theme App Block 增加档位价格、规格售价/原价、默认副标题、摘要的购物车明细/预计节省独立样式变量；移动端不再覆盖商家选择的布局。成功加购后同时发出 SHOPLINE `variant:added` 和 `cart:open` 主题事件，以及兼容的购物车刷新事件。
- 主题静态系统文案已扩展到 36 个 locale 与对应 schema 文件。运行时优先使用商家保存的译文，否则使用当前店铺 locale 的主题文案，不以英文作为非英语店铺的兜底。主题自动测试 29/29、Worker 折扣解析定向测试 13/13、Worker TypeScript 与前端生产构建通过；完整 Worker Vitest 已开始运行但本轮命令窗口在最终汇总前结束，不能将其标记为全量通过。真实 SHOPLINE 主题、嵌入式后台和购物车抽屉仍待实机验收。

# 2026-11-05 前台组件双端样式、市场价格与缺货状态（本地已验证，待推送部署）

- Theme App Block 将 desktop/mobile 的布局、颜色、字号、字重、卡片、图片和标签位置写入根 CSS variables，并由 `750px` media query 切换 active aliases；Horizontal 为 3 列，Grid 为 2 列。角标位置和原价显示也按 desktop/mobile 属性与 token 切换。移动与桌面截图保存在 `.superpowers/sdd/2026-11-05-storefront-widget-style-and-pricing/widget-390.png` 和 `widget-1440.png`。
- 公共活动接口读取 `localization.country.iso_code`，通过带标准 SHOPLINE Admin headers 的 Markets API 精确匹配启用市场；档位副标题保留应用配置值，指定市场金额按市场 ID 选择，无法解析时使用 Calculated at checkout。
- 前台价格统一使用当前货币精度的整数 minor units：Original 为已选款式售价之和，Estimated savings 为 Original - Bundle total，整单金额按确定性余数分摊到每个已选款式；档位和款式同时显示 Original/折后价。缺货或库存累计不足时行文案追加本地化 Sold out，隐藏三个摘要金额并禁用数量加购按钮。
- 已验证：Theme App Block 37 项、Worker 全量 Vitest 251 项、Web 布局 28 项、Worker TypeScript、Web 生产构建和 `git diff --check` 均通过。真实 SHOPLINE 店铺的市场返回、主题安装和结账金额仍需部署后实机验收。

# 2026-11-09 创建折扣页前台语言预览（本地实现，IN_PROGRESS）

- 创建/编辑折扣页的实时预览标题栏现在在 PC/手机切换旁提供前台语言选择器；语言列表和默认语言复用翻译页的 `/api/quantity-breaks/store-languages` 读取逻辑。切换语言后读取该 locale 已保存的翻译页配置，并同时传入桌面和手机 `StorefrontWidget` 预览；缺失或读取失败的字段继续使用组件原有回退文案。
- 新增组件交互回归覆盖店铺默认语言、店铺可用语言列表和法语已保存文案切换。新增测试、翻译/预览定向测试 5/5、生产构建与 `git diff --check` 已通过。
- 完整前端 Node 套件为 254/261：7 个失败均为既有的预览 radio ID、样式字段、订阅付款回调、角标 CSS、规格价格 DOM 与字体/角标 CSS 断言，未涉及本次前台语言读取链路。无嵌入式店铺会话时本地 `/quantity-breaks/new` 入口为空，未能取得可信的桌面或 390px 本地截图；真实嵌入式后台的视觉与接口验收仍待执行，不能标记为 VERIFIED。

# 2026-11-12 SHOPLINE 商品分页 `Link` 包装诊断（本地实现，待推送）

- 当商品目录返回满页但无法解析下一页游标时，Worker 现额外记录 `linkEncoding` 的固定枚举值：标准尖括号、反斜杠转义、HTML 转义、HTML 换行前缀或其他。该字段不包含完整 `Link`、商品数据、`page_info` 或令牌；用于识别线上响应头在进入解析器前的实际包装形式。
- 当前真实日志已确认存在 `Link`、`page_info` 与 `rel=next`，但未找到尖括号 URL。部署后需要再次在实际店铺打开“添加商品”，依据新的脱敏 `linkEncoding` 值实施唯一的解析归一化修复；本条改动本身不改变分页逻辑。

# 2026-11-12 SHOPLINE 商品分页字段逗号修复（本地实现，待推送）

- 线上 `linkEncoding=standard_angle_brackets` 证明并非 HTML 转义。根因是 SHOPLINE 的下一页 URL 带有未编码的 `fields=id,title,image,options,variants`，原有 `split(',')` 将单个 URL 切断，后半段仍可匹配 `rel=next` 和 `page_info`，但不再含 `<...>` URL。
- `parsePageCursor` 现直接从完整 `Link` 头提取 `rel=next` 对应的尖括号 URL，不再按逗号分割。新增回归测试覆盖未编码字段逗号；该公共解析函数同时覆盖商品、指定分类、分类内商品和市场分页。

# 2026-11-12 主市场未完成指定金额预览恢复（本地实现，待推送）

- 切换主市场的任意非当前档位到“指定市场金额”后、尚未填写金额时，市场预览解析会返回不可用状态。此前该结果未携带档位，预览在渲染所有档位时读取 `tier.discountValue` 触发运行时异常并使编辑页空白。
- 不可用结果现保留原始档位，仅用于稳定渲染档位标签和规格；既有 `unavailable` 状态继续阻断折扣计算并显示市场金额不可用提示。新增主市场、非当前档位、空指定金额的渲染回归测试。

# 2026-11-13 开发者管理折扣详情展示（本地实现，待推送）

- 开发者管理 Worker 的活动列表和详情接口现在额外返回 `discountTypeDisplay` 与 `discountValueDisplay`，不修改既有 `discountType`、`discountValue`、保存值或折扣计算。六种类型分别显示为原价、百分比折扣、每件固定减免、每件固定价格、整单固定减免和整单固定价格。
- 百分比按基点格式化，`1000` 显示为 `10%`、`1234` 显示为 `12.34%`；四种固定金额/固定价格类型直接显示保存整数，例如 `200` 显示为 `200`，不进行最小货币单位换算。
- 已验证：Developer Platform 活动列表与详情接口定向 Vitest 12/12、Worker TypeScript 检查和 `git diff --check` 通过。仓库未包含 Developer Console 页面源码，未生成页面截图；控制台接入新增展示字段后的实际视觉结果仍待验收。

# 2026-11-13 开发者管理详情折扣名称、叠加与指定市场金额（本地实现，待推送）

- 商家 Worker 的开发者后台专用活动详情投影仅新增 `discountName` 与 `combinesWith` 白名单字段；两项均不出现在活动列表，也不修改商家前端、活动配置、折扣计算或持久化。
- 指定市场金额继续由既有详情投影返回市场名称、市场 ID、币种和原始整数金额；市场解析与 SHOPLINE 请求方式未变。
- 已验证：内部活动详情定向 Vitest 12/12、Worker 全量 Vitest 294/294、TypeScript 检查通过。开发者后台实际页面视觉验收待其部署后执行。

# 2026-11-13 内嵌应用首进会话与统一启动骨架（本地实现，待推送）

- 内嵌首进时，多个同时发起的读取请求现在共享同一个 App Bridge session token 等待过程；token 未就绪会按 200ms 轮询，最多等待 5 秒。成功的 JWT 不会被缓存，后续请求和 401 读请求重试仍会重新读取 token；写请求未发出前可等待，但已经发出的写请求不会因此重发。
- 首层 `index.html` 启动骨架改为与活动页第二层加载状态相同的单一加载框、页头占位和四格概览占位，桌面与窄屏均保持相同的视觉节奏。移除了与真实页面不一致的表格骨架。
- 已验证：认证与启动骨架定向 Node 测试 15/15、前端生产构建、`git diff --check`；本地 Vite 页面在桌面与 390px 窄屏下实际检查到启动骨架。全量 TypeScript 检查仍被 5 个既有错误阻塞，均不在本次文件中。

# 2026-11-13 内嵌启动恢复、页面骨架与编辑退出（本地实现，待推送）

- 外层 SHOPLINE `path` 现在安全兼容一次或两次 URL 编码，只接受应用内部路由；翻译、创建/编辑和反馈页在 React 接管前分别显示与第二层加载状态相近的静态骨架。活动页继续使用既有概览骨架，不显示空白页或通用“应用加载失败”文案。
- 已修复活动加载错误页的“重试”没有重新请求的问题：此前它只改写 React 状态，订阅读取 effect 的依赖未变，活动列表不会重新发起请求。现在首次启动阶段的订阅、店铺身份或活动读取出现瞬时失败时，会在 250ms 后完整重试一次；仍失败才显示现有错误页。用户点击“重试”会重新执行完整启动链路。OAuth 签名校验、令牌刷新与 App Bridge 授权跳转均未改动。
- App Bridge SaveBar 的“退出编辑”现在直接返回概览；仅编辑页顶部的“退出编辑”二级按钮在有未保存内容时显示取消/确认弹窗。新建活动重新提供“保存草稿”，SaveBar 保存会按新建/编辑传递发布或更新意图。
- 已验证：启动短暂 `503` 后自动恢复的浏览器级回归、编码路由骨架、SaveBar、翻译加载与入口定向 Node 测试 `16/16` 通过；生产构建和 `git diff --check` 通过。完整前端 Node 套件为 `311/317`：剩余 6 项为本轮未改动的 `StorefrontWidget`/`CampaignStyleEditor`/样式基线断言（预览 radio ID、样式字段、角标/规格 CSS、字体 shorthand），未将其标记为本轮通过。TypeScript 全量检查仍有 5 个既有错误，位于 `authenticated-fetch.ts`、`storefront-translation-defaults.ts`、`StorefrontWidget.tsx`，不在本轮变更文件内。
- 本地 Vite 服务可访问静态首屏 HTML；当前环境没有 Browser 插件且 Playwright Chromium 未安装，未下载额外浏览器，因此没有生成新的浏览器截图。真实 SHOPLINE iframe 首次进入、App Bridge 原生 SaveBar 事件与线上短暂网络失败仍待推送部署后实测。

# 2026-11-14 首进父窗口识别、会话复用与独立数据加载（本地已验收，待推送部署）

- 真实浏览器中已定位 buchaqian 首进失败：实际父窗口是店铺域名，但恢复后的 referrer 指向应用自身，SDK 因此向错误来源请求 Session Token；该现场未发送业务 API 请求，Admin OAuth Token 仍有约 7 小时有效期。现在通过有效 handle/host、实际父窗口来源建立 Bridge，并拒绝非 SHOPLINE 店铺域名。
- 同一 Bridge 实例的业务请求与浏览器错误上报共享会话获取；有效 JWT 仅在当前 iframe 内存中按实际 exp 复用，到期前 30 秒重新获取。401、明确重新授权或店铺/应用上下文变化使缓存失效；旧上下文的未完成请求不能继续发送。Worker 仍执行签名、安装和订阅校验，已发出的写请求不自动重发。Admin OAuth Token 的既有刷新逻辑未改动。
- 内置简体中文基础词典，保留合法入口语言与按已验证店铺保存的语言偏好；身份尚未返回时主动选择语言，身份返回后不会被入口语言覆盖。活动列表、翻译页和反馈页先显示非私有标题及语言选择，私有数据与写操作仍等待身份和订阅；编辑/详情继续沿用加载骨架，不提前判断活动不存在。活动区域失败后重试只重新读取活动数据。
- 请求摘要与 Worker 错误写入通过 waitUntil 异步执行，不阻塞商家响应；全接口采集、脱敏、TraceID 与 D1 保留 30 天的规则不变。

## 验证证据与限制

- Worker 全量 Vitest：44 个文件、300/300 通过；最终类型调整后诊断定向 3/3 和 Worker TypeScript 再次通过。
- 前端最终全量 Node：350/356 通过。6 个既有失败是未保存草稿重复数量的 radio ID、样式编辑器字段、窄屏角标、规格价格、Recommended 列与字体 shorthand；均在本轮未修改的预览组件/样式基线范围，本次不标记为全量通过。
- 前端 TypeScript 仍有 3 个既有错误：storefront-translation-defaults.ts:188 两项索引类型错误，以及 StorefrontWidget.tsx:298 的 null Variant；本轮未修改这些文件。前端生产构建与 git diff --check 通过；构建仍提示工作区分包超过 500 kB。
- 浏览器实际操作了本地生产构建及受控 API 数据：临时 503 后保留标题/语言、创建禁用、点击重试恢复活动列表；翻译页先显示标题再加载数据；语言可切换。受控数据验收不代表真实 SHOPLINE SDK 握手已在线上修复，没有执行本轮部署或移动端视觉验收。
- 真实现场参考截图：`/private/tmp/buchaqian-startup-error-20261113.png`、`/private/tmp/buchaqian-startup-current-20261113.png`。本地截图：`/private/tmp/kaching-startup-local-error.png`、`/private/tmp/kaching-startup-local-recovered.png`、`/private/tmp/kaching-startup-local-translations.png`。截图保留在本机，不包含在本次 Git 提交中。
- 待部署后验收：真实 iframe 自恢复、首进活动/翻译/反馈、OAuth/付款返回上下文、401 重新取会话、真实语言偏好和新诊断写入。不能承诺网络、SHOPLINE 或浏览器异常时永远不出现加载错误。

## 本轮待推送文件（无文件删除）

- 应用修改：`web/src/hooks/useAppBridge.ts`、`web/src/hooks/useAuthenticatedFetch.ts`、`web/src/pages/quantity-breaks.tsx`、`web/src/prototype/admin-locale.ts`、`web/src/prototype/authenticated-fetch.ts`、`web/src/prototype/embedded-context.ts`、`web/src/utils/i18n.ts`、`worker/src/index.ts`。
- 测试修改：`web/test/admin-locale.test.mjs`、`web/test/app-bridge-lifecycle.test.mjs`、`web/test/authenticated-fetch.test.mjs`、`web/test/startup-resilience.test.mjs`、`worker/test/global-observability.test.ts`、`worker/test/routes-contract.test.ts`、`worker/test/subscription-routes.test.ts`、`worker/test/webhook.test.ts`；新增 `web/test/startup-language.test.mjs`。
- 文档修改：`docs/APP_PROGRESS.md`、`docs/SHOPLINE_AUTHORIZATION_RUNBOOK.md`。
- 拟提交：`fix(app): stabilize bridge context and reuse startup sessions`。目标为应用仓库当前 `main`，等待本轮明确推送批准。

# 2026-11-14 活动页常驻设置指南入口（本地实现，待推送）

- 活动首页标题栏现在按“应用语言、设置指南、创建活动”的顺序显示操作。关闭“完成设置”提示栏后，设置指南按钮仍保留，商家可随时打开同一份两步主题编辑器指南。
- 顶部提示栏与标题栏按钮共用同一个弹窗组件，关闭按钮和遮罩点击均可关闭弹窗；原有多语言文案及两张指引图片未变。
- 已验证：主题指南与启动页面定向 Node 测试 24/24 通过；前端生产构建通过；本地桌面浏览器实际打开设置指南，确认按钮顺序和弹窗图片显示。截图：`/private/tmp` 中的本轮浏览器验收截图仅用于本机核对，不随 Git 提交。

# 2026-11-14 订阅期限与续费提示（本地实现，待视觉验收）

- 活动页的 `.collectionConflictNotice` 改为常驻显示当前 Ultra 套餐按店铺时区换算的到期时间；Partner 确认下一期 `active/preorder` 且具备 `quantity_breaks_access` 时，同时显示其生效时间。下一期不会提前授予权益。
- 当前套餐剩余 7 天内，且没有下一期或两期存在空档时，提示栏切换为红色警告；普通状态为 `#f6f6f6` 黑字。两种状态均提供复用 App Bridge 原生购买页的续费入口。面板内边距为 `5px 10px 0`，时间与按钮左右布局，窄屏可换行。
- 店铺时区通过已验证的 SHOPLINE `GET /merchants/shop.json` 的 `iana_timezone` 异步读取；订阅对账结果缓存于 D1，并在首屏后台对账后再次读取。新增 `0019_subscription_next_period.sql` 迁移，部署前必须先执行迁移。
- 已验证：Worker 全量 Vitest 44 文件/307 项、Worker TypeScript、模块边界及 dry-run 构建通过；前端启动与订阅定向测试 25/25、生产构建通过。前端全量 Node 359 项中 353 项通过、6 项失败，与既有的预览 radio ID、样式字段、角标/规格、Recommended 列和字体 shorthand 基线一致。前端 TypeScript 仍有 3 项既有错误，均在未修改的翻译默认值和商品预览文件。真实 SHOPLINE 店铺中的时区、购买跳转与桌面/移动截图待部署后验收，不能标记为已验证。

2026-11-17 Ultra 套餐价格同步：按用户已在 SHOPLINE 调整的价格，将应用套餐页全部语言的价格文案及 Worker 套餐元数据统一为 USD 11.99 / 每 30 天，同步套餐设计文档和现有价格测试。保留 Ultra 套餐标识、quantity_breaks_access 功能键、原生购买入口及现有订阅权益核验规则；历史进度中的旧价格作为当时记录保留。
验证：前端套餐页现有测试 5/5、Worker 订阅路由/服务/权益测试 37/37、Worker TypeScript 检查及前端生产构建通过。真实购买扣费未执行，实际收款价格由 SHOPLINE 套餐配置决定。

# 2026-11-17 app-block 仅按 available 判断缺货（本地已验证，待推送及主题发布）

- 已定位未开启库存追踪的款式被误判：SHOPLINE 主题会返回 `available=true`、`inventory_quantity=0`；原组件又读取库存数量，导致可售款式显示 Sold out。按用户确认，真实主题组件现在仅判断 `available === true`，默认选择、规格缺货标记、汇总和加购按钮共用该规则。
- 删除主题中库存追踪、库存策略和库存数量属性的输出与读取，移除本地按累计库存阻断。相同 SKU 仍合并数量提交，最终数量能否加入由 SHOPLINE 决定；available=false 即使旧字段允许超卖也不能加购。全部款式缺货时保留组件、档位和禁用的售罄按钮。Worker、Discount Function 和管理后台预览本批未改动。
- 已验证：主题自动化测试 61/61、SLine 模板语法检查通过。本地浏览器使用受控数据验证库存 0 / available=true 可加购，切到 available=false 标缺货并禁用、切回恢复，全部缺货时组件保留；390px 视口宽度与页面宽度均为 390，无横向溢出。验证页未产生控制台 warn/error，未向真实购物车提交。
- 截图保留在本机：真实旧页面参考 `/tmp/kaching-availability-reference.png`；本地 `/tmp/kaching-available-true-desktop.png`、`/tmp/kaching-available-false-desktop.png`、`/tmp/kaching-available-true-mobile.png`、`/tmp/kaching-available-all-sold-out.png`。受控页面不是线上修复证据，用户自行发布新版 SHOPLINE app-block 后仍需验证真实 SLine available 输出和加购结果。
- 本批修改：主题脚本、主题模板、两份主题测试及 REQUIREMENTS / STOREFRONT_COLLECTION_MEMBERSHIP / APP_PROGRESS 三份文档；无新增或删除文件。用户原有 `web/test/feedback-board.test.mjs` 修改保留，不纳入本批。拟提交：`fix: use variant availability for storefront stock state`。

# 2026-11-17 Function 分类动态变量与 `$app` 核对（诊断记录，根因待核实）

- 合作伙伴后台活跃 Function `0.0.65`（version ID `20458`）已保存动态输入绑定 `103645:quantity-breaks` / `collection-membership`，GraphQL 变量声明与 cart 参数连接均存在。此前 CLI 源码未显式传递变量的疑点不能作为“线上未绑定”的结论。
- 实店 `zheng-haonan` 的 Shop Metafield 只读查询 HTTP 200，实际 namespace 是 `app--103645--quantity-breaks`，key 与 owner 均正确，JSON 已含目标分类 `12277057487400872661322470`；SHOPLINE TraceID 为 `9e46cae5c0aebe8fb7493bf36ef7e4cb`。临时诊断服务及密钥已清理，未写入店铺数据。
- 经用户提醒重新核对桌面 Function 指引 1.2.1 / 1.2.2：写入与 TOML 均使用 `$app:store-namespace`，`$app` 表示当前安装应用。将实际 REST namespace 直接写入 TOML 的推断缺少平台依据，已在提交、推送和发布前撤销。当前仍为 `$app:quantity-breaks` / `collection-membership`，与原生产代码一致；不能将不同层返回格式直接判定为根因。
- 本轮通过 SHOPLINE AI Suite 检索公开文档并核对 REST namespace 字段说明，未找到 Function 内部 `103645:…` 与 REST `app--103645--…` 的映射规范。已确认的事实是 Shop 配置有目标分类、活跃版本有动态变量绑定、实际执行输入为空；动态参数读取与商品实时分类归属仍需继续核实。
- 已执行的测试：Worker 分类发布定向 9/9；Go 分类匹配、空输入和指定商品优先相关测试通过。Go 全量仍有既有失败 `TestOverlappingDiscountNodesExcludeOnlyConflictedProduct`（discount_test.go:505）；Function CLI 扫描通过，但本机缺少 TinyGo，WASM 未构建。配置与 REST 返回字符串一致的临时检查只验证字符串，不能证明平台运行时正确，已撤销该检查所依据的修改。
- 本批仅更新 STOREFRONT_COLLECTION_MEMBERSHIP 与 APP_PROGRESS 两份既有文档，无生产代码修改、无新增或删除文件。原有 `web/test/feedback-board.test.mjs` 邮箱断言修改保留并排除。拟提交：`docs: clarify app namespace binding and collection diagnostics`。尚未提交、推送、发布 Function 或部署 Worker。


# 2026-11-17 分类范围更新与订阅失效结束时间（本地验证，待推送部署）

- 修复生效活动从指定商品改为指定分类时报 `Active collection scope needs resolvedProductIds`：更新路由按服务端重新读取的分类成员生成快照，覆盖客户端快照；更新同一 SHOPLINE 折扣 ID。保留现有分类成员变化保护、同类范围冲突及 revision / 店铺锁检查。
- 分类变量在店铺锁内先同步旧、新和其他保留活动所需分类的并集；平台确认更新后移除当前活动已不用的分类。平台更新不确定时保留 staged update 和待核对状态；最终清理失败保留安全超集、记录诊断，不误报折扣更新失败。
- 按用户明确规则，订阅失效且 SHOPLINE 删除确认后直接将活动 `endsAt` 写为确认失效时刻、`neverExpires=false`，不新增结束时间字段。重复任务保持首次记录，删除失败不会提前改变结束时间；既有页面继续按店铺时区格式化显示。
- 续费后明确启用时，以移除旧失效时间后的候选重新检查范围；平台创建成功或对账确认找到新折扣后才持久化新的持续生效配置。创建失败、对账未找到新折扣时保留失效结束时间及原因，避免本地误判新活动已结束或丢失历史状态。
- 新增 D1 迁移 `0021_subscription_expiry_end_time.sql`：仅对同店铺同活动、订阅失效、折扣关联已清空且有有效平台删除确认时间的记录回填结束时间，递增 revision 并保持原更新时间。重复迁移不再修改；缺失确认时间、无效时间、未核实、仍关联折扣和普通暂停均跳过。部署前需要执行该迁移，当前未修改远程 D1。
- 验证：Worker 全量 Vitest 46 文件、356/356 通过；Worker TypeScript 与 wrangler dry-run 构建通过；前端活动适配器测试 17/17 通过；git diff --check 通过。新增测试覆盖四类范围切换、伪造快照、空分类、元字段写入未确认、429 更新结果不确定、收敛失败、失效时间幂等、续费发布失败/成功及不确定结果对账、历史数据迁移。上游集成使用受控返回，未在真实 SHOPLINE 店铺执行本轮写操作，未部署。
- 本轮未修改前端布局或 CSS，不标记新增视觉验收。此前真实 Function 执行输入 `inCollections=[]` 的平台问题仍未解决，本轮活动编辑修复不代表该平台输入问题已修复；Function 和 app-block 本轮未改动。
- 用户原有 `web/test/feedback-board.test.mjs` 邮箱断言改动保留并排除。本批无文件删除。拟提交：`fix: resolve collection scope updates and record subscription expiry end times`；目标应用仓库当前 main，等待本批明确推送批准。


# 2026-11-18 平台失效结束时间与严格先删后建（本地已验证，待推送部署）

- 已通过远程 D1 只读查询定位：buchaqian 两条活动为 paused / paused，endsAt 为空且 neverExpires=true，未带 subscription_expired。上一批仅覆盖订阅失效及其历史迁移，未覆盖平台直接失效的路径，因此列表仍显示持续进行。本轮没有修改远程数据。
- SHOPLINE 状态读取保留有效 ends_at，并传给列表批量核验、单项核验及不确定结果对账。确认失效、主动停止确认、平台折扣删除及过期折扣清理均记录 endsAt / neverExpires=false。优先用已到达的平台结束时间，其次保留已记录的过去结束时间，最后记录本次确认时间；后续核验不会把结束时间不断往后移。既有平台失效记录在下一次成功核验时补齐，无需新增字段或数据库迁移。
- 已失效活动重新启用改为同步串行：验证候选配置与覆盖范围、确认可用币种及分类变量，删除旧 SHOPLINE 折扣、回读确认缺失、清空旧关联，之后才创建并确认新折扣。移除本入口先创建后排队清理的逻辑，保留旧队列处理能力供历史任务继续执行。删除被拒绝、429、请求失败或回读仍存在时，均不创建新折扣。
- 用户本轮明确确认：已失效活动编辑后保存即重新发布，也必须先删旧再按修改后的配置创建；开始时间在未来则等待生效。没有改成只保存本地配置。
- 新创建明确失败时保留原活动配置和失效结束时间，旧关联维持已清除，后续明确启用可重新创建。创建结果不确定时保留候选和待核对状态；只读查询确认新折扣后恢复候选配置（包括开始时间），避免旧失效结束时间混入新活动。查询确认没有新折扣则继续失效，后续重试不重复删除已经不存在的旧对象。
- 验证：Worker 全量 Vitest 46 文件、370/370 通过；Worker TypeScript、wrangler dry-run 构建及 git diff --check 通过；前端活动适配器 17/17 通过。测试覆盖列表/详情结束时间、时间幂等、平台返回时间换算、历史失效补齐、启用及编辑后保存的删除→创建顺序、删除拒绝/未确认、创建失败重试、结果不确定的匹配/未匹配恢复。上游写操作使用受控返回，未执行真实 SHOPLINE 折扣删除或创建，不标记线上功能已验证。
- 仅修改 Worker 四份源码、四份相关测试和 REQUIREMENTS / APP_PROGRESS 两份文档；无新增或删除文件，无前端布局 / CSS / Function / app-block 修改，不新增视觉验收声明。用户原有 web/test/feedback-board.test.mjs 邮箱断言改动保留并排除。
- 拟提交：`fix: record platform expiry times and delete expired discounts before republishing`；应用仓库当前 main，本批尚未提交、推送或部署，等待单独批准。

# 2026-11-18 失效活动并行替换与独立列表记录（本地已验证，待推送部署）

- 用户修订并确认：已失效活动明确启用或编辑后保存时，删除旧 SHOPLINE 折扣与创建新折扣同时执行；删除失败不能阻止新建。应用自己的活动列表也必须保留旧活动已失效、新活动生效/等待生效两条记录。本节取代上一节的严格先删后建规则。
- 发布前验证配置、订阅、覆盖范围、可用币种及分类变量。新活动生成独立 `local-UUID`，完整候选配置与发布状态在请求前持久化，平台规则元字段使用新 ID。旧活动保持原 ID、配置、结束时间及平台折扣关联。
- 删除与创建使用 Promise.allSettled 并行，结果分别处理。创建成功/删除失败时两条独立记录保留；都成功时只移除旧记录。创建明确失败时移除临时新记录并保留原活动；若旧折扣已确认删除则清除旧关联，后续明确启用可以重试。创建结果不确定时保留新记录为待核验，按新 ID 只读关联真实结果，查无结果则保留新配置为草稿；不重复创建或误关联旧折扣。
- 列表核验现在同时覆盖已关联和未关联但结果不确定的新记录，并复用一次 SHOPLINE 列表请求。并发列表/详情读取不清除有效替换租约；执行中断后租约失效转为只读核验。旧折扣删除尚未确认时保留失效记录；后续核验确认旧对象缺失时仅移除旧记录，不影响新活动。
- 验证先红后绿：原实现有 6 项新行为测试失败（创建等待删除、删除失败阻止创建、只有同一活动 ID、无独立不确定记录），修改后通过。最终 Worker 全量 46 文件 / 378 项通过，前端活动适配器 17/17、Worker TypeScript、wrangler dry-run 与 git diff --check 通过。覆盖删除等待中的并发创建、删除拒绝/回读未确认/429/网络中断、两边都失败、创建明确失败重试、创建结果不确定、未来排期、租约中断恢复及后续删除确认。
- 本轮仅涉及 Worker 两份源码、三份测试及 REQUIREMENTS / USER_FLOWS / APP_PROGRESS 文档，无新增数据库字段、表或迁移，无前端布局/CSS、Discount Function、app-block 修改。保留并排除用户原有 web/test/feedback-board.test.mjs 修改。没有真实 SHOPLINE 写操作或店铺视觉验收，不标记线上集成已验证。
- 拟提交：`fix: replace expired campaigns concurrently with separate activity records`。本批尚未提交、推送或部署，等待本批 Git 授权。

# 2026-11-18 已失效活动结束时间校验提示（本地已验证，待推送部署）

- 通过远程 D1 只读诊断定位 buchaqian 两次创建拒绝：2026-11-18 北京时间 10:43/10:44，SHOPLINE 返回 422 和 `endAt is illegal, endAt before now`。原活动已记录 09:40 的失效结束时间，编辑后重新发布沿用了该时间。没有执行真实店铺写操作。
- 按用户要求，已失效活动重新发布前检查结束时间，早于或等于服务端当前时间时返回“当前结束时间早于当前时间”，并且不删除旧折扣、不创建新折扣或持久化新记录。仍由商家选择新的结束时间或持续生效。
- 若 SHOPLINE 在实际 REST 请求后返回同一结束时间拒绝，转换为相同中文提示；原始响应 body、SHOPLINE TraceID 继续保留在诊断信息中。其他 422 原因保持原错误，不统一误报为结束时间错误。
- 验证先红后绿：新增测试先复现过去/等于当前时间仍发起平台写操作，以及错误提示仍为通用 422；修复后 Worker 全量 46 文件 / 382 项通过，TypeScript 与 wrangler dry-run 通过，本批文件 diff --check 通过。测试覆盖写操作前拦截、原记录保留、精确错误提示、诊断信息保留及其他 422 不误判。
- 本批改动为 Worker 活动路由、折扣服务、两份测试及 REQUIREMENTS / APP_PROGRESS 两份文档；无前端布局/CSS、Function、app-block、D1 迁移改动，不标记新的视觉或实店写入验收。保留并排除用户原有 web/test/feedback-board.test.mjs、worker/src/services/collection-publication.ts 修改。
- 拟提交：`fix: explain expired campaign end times before republishing`；尚未提交、推送或部署，等待本批 Git 授权。

# 2026-11-18 Function 折扣删除显式使用 v20261201（本地已验证，待推送部署）

- 用户确认删除 Function 折扣活动仅提供 v20261201。本轮将原无版本路径改为 `DELETE /admin/openapi/v20261201/sales/discount_apps/{function_id}/{app_discount_id}.json`，与现有 Function 活动查询共用版本常量；没有修改其他创建/更新接口的版本。
- 商家删除、失效活动清理/替换、管理后台平台删除和订阅到期清理均通过同一删除服务；统一请求头、success/204 检查、删除后回读、失败/不确定处理及并行替换规则继续生效。诊断的实际路径及管理后台诊断兜底路径同步携带版本。
- 先修改路径断言并验证红灯：定向 35 项中 4 项失败，确认旧请求及诊断仍是无版本路径；修改后定向 35/35 通过。最终 Worker 全量 46 文件 / 382 项通过，TypeScript、wrangler dry-run 通过。
- 本批修改两份 Worker 源码、六份测试及 REQUIREMENTS / APP_PROGRESS 两份文档；无新增或删除文件、数据库迁移、前端布局/CSS、Discount Function 或 app-block 修改。保留并排除用户原有 web/test/feedback-board.test.mjs、worker/src/services/collection-publication.ts 改动。
- 本地技能 OAS 与 SHOPLINE MCP 均暂未收录该接口，版本及接口路径依据用户提供并确认的资料；本轮未执行真实 SHOPLINE 删除，不标记实店集成已验证。拟提交：`fix: pin Function discount deletion to v20261201`；尚未提交、推送或部署，等待本批 Git 授权。

# 2026-11-18 分类元字段小写 shop 与商家只读权限（本地已验证，待推送部署）

- 按用户最新要求，分类动态配置元字段及元字段定义请求的 `owner_resource` 均固定填写小写 `shop`，取代此前大写 `Shop` 要求。namespace / key、分类 ID、Function 输入及活动替换规则不变。
- 分类值写入并回读一致后，按实际 namespace 查询定义；缺失则以 `$app:quantity-breaks` 创建，已有权限不符则原位更新 `access.admin: MERCHANT_READ`，并按定义 ID 回读确认。已为 MERCHANT_READ 时不重复写权限，不修改已有定义名称或类型，不把 access 混入元字段值。无法确认权限时阻止后续发布，保留脱敏响应、接口路径及 SHOPLINE TraceID。异常定义列表不触发创建或更新，避免损坏响应导致误写。
- 已执行先红后绿：权限新增测试在旧实现下失败；小写 owner 断言先复现 3 项失败；异常列表 `[null]` 先复现误创建，再修复。最终 Worker 全量 Vitest 47 文件 / 394 项通过，TypeScript、wrangler deploy --dry-run 和 git diff --check 通过；未实际部署本批代码。
- 线上 buchaqian（不差钱，店铺 ID 1726037928557）原定义列表为空，本轮补建显式 MERCHANT_READ 定义，并于北京时间 2026-11-18 12:12:15 回读确认：定义 ID 212280368557、owner_resource=shop、namespace=app--103645--quantity-breaks。TraceID：2d81e1aa663e7f70f40718c5ce26de47。元字段 ID 20486045918557、原分类值及 owner 均未改变；临时预览已停止，临时访问密钥与探针源码已清理。此记录仅证明该店铺定义权限已修正，不代表 Function 结账已实测生效。
- 本批涉及两份 Worker 源码、五份测试/辅助文件及 REQUIREMENTS / STOREFRONT_COLLECTION_MEMBERSHIP / APP_PROGRESS 三份文档；无删除文件、数据库迁移或 UI/CSS 改动。保留并排除用户原有 web/test/feedback-board.test.mjs 邮箱断言修改。拟提交：`fix: enforce merchant-readable shop collection metafields`；本批尚未提交或推送，等待本批 Git 授权。

# 2026-11-18 创建后延迟核验与批量启动提示（本地已验证，待推送部署）

- 远程 D1 只读证据：buchaqian 于北京时间 14:13:22 批量启动，`多件优惠123` 记录 CREATE_OUTCOME_UNCERTAIN；14:14:22 的后续查询已将其和 `summer vacation1` 确认为 active，并关联不同新 SHOPLINE 折扣 ID。代码在创建成功返回 ID 后仅查一次列表，查不到时丢失最后列表响应 metadata，前端又把 unverified 当失败；本轮未执行实店创建/删除或远程数据库写入。
- 创建只发送一次 POST。若新折扣暂未可见/尚未生效，在 300ms、900ms 后只重试 GET，最多查询三次；限流或读取异常不继续本次短重试。已返回 ID 的创建暂未确认时以 CREATE_CONFIRMATION_PENDING 区分，保存新 ID 和 needs_reconciliation；保留查询路径、脱敏 body 与 SHOPLINE TraceID。后续暂时查无该 ID 时不降为草稿、不清除 ID、不重复创建。
- 单条/批量启动及编辑已失效活动保存共用该处理。批量新增 activation_pending 结果，成功、待确认、明确失败合并反馈，避免待确认误报失败或多条 toast 相互覆盖。沿用现有 Toast，提供全部 16 种应用语言文案，无布局/CSS 改动。
- 列表复用现有权威查询自动核验：前 10 秒约每 2 秒、之后约每 5 秒，总计最多 60 秒；确认后停止，离开列表/切换店铺/卸载时清理定时器，新一轮待确认操作可重新开启窗口。超时继续保留待核验，后续进入/刷新仍能查询。删除和创建仍 Promise.allSettled 并行；删除失败保留旧活动已失效，创建确认成功的新活动独立生效。
- 先红后绿：新增测试先复现查询延迟误报、ID 和 TraceID 丢失、批量/编辑返回失败和前端待确认提示缺失；修复后 Worker 全量 47 文件 / 402 项通过，前端相关 58 项通过，Worker TypeScript、前端构建、wrangler dry-run、git diff --check 通过。覆盖批量混合成功/待确认、旧折扣删除失败保留、首次发布 ID 持久化、重复启用不重复 POST，以及只读轮询更新真实列表状态。另已先红后绿验证：同批第二条草稿与已接收但尚未可见的新折扣范围重叠时，必须返回 conflict，不再发送第二次创建。
- 前端全量实际结果 372 项 / 365 通过 / 7 失败；相同 7 项已在 Git HEAD 37ca464 的临时只读基线副本中复现，未借本任务改动其样式或断言。失败名称：editor-structure.test.mjs 的 `campaign editor separates the internal and checkout discount names and renders coverage detail rows`、`duplicate quantities in an unsaved draft keep preview radio IDs unique`、`style editor exposes badge placement and separate variant, cart, savings and button controls`；feedback-board.test.mjs 的 `feedback cards use distinct low-saturation backgrounds for every status`；variant-display.test.mjs 的 `right corner badges stay in the tier header on narrow previews`、`shows only the selected variant price in a bundle slot header`、`reserves a readable Recommended column instead of shrinking its label`。这些既有失败未修复，不能宣称前端全量通过。
- 本地 Playwright（Browser plugin not available）在 http://127.0.0.1:4189/quantity-breaks 使用受控 SHOPLINE 返回完成实际点击：选择活动 → 启用 → 确认 → 待确认提示 → 自动显示进行中；启动 POST 仅一次，旧活动仍显示已失效，无 pageerror。1440px 桌面、390px 移动视口均检查，移动文档宽度 390px 无横向溢出。参考截图 `/private/tmp/kaching-activation-reference-desktop.png`；本地截图 `/private/tmp/kaching-activation-pending-desktop.png`、`/private/tmp/kaching-activation-confirmed-desktop.png`、`/private/tmp/kaching-activation-confirmed-mobile.png`。截图已查看；受控数据不是线上 SHOPLINE 写入验收。
- 本批修改 Worker 三份源码、前端三份源码、三份相关测试和 REQUIREMENTS / USER_FLOWS / APP_PROGRESS 三份文档，共 12 份文件，无新增/删除文件、D1 迁移、Function 或 app-block 改动。保留并排除用户原有 web/test/feedback-board.test.mjs 邮箱断言改动。拟提交：`fix: confirm campaign creation without false batch failures`；本批尚未提交、推送或部署，等待本批 Git 授权。

# 2026-11-18 Ultra 套餐价格同步为 USD 9.99（本地完成，待推送部署）

- 用户已在 SHOPLINE 调整套餐价格为 USD 9.99；本轮将 Worker 套餐元数据、前端全部应用语言的套餐价格与逗号小数文案统一为 USD 9.99 / 每 30 天，并同步现行两份订阅设计文档和实施计划。历史进度中的 USD 11.99 保留为当时记录。
- 仅同步展示价格与现有测试；Ultra / 30 DAY / USD SKU 选择仍动态读取 SHOPLINE SKU ID，不限制具体付款金额。权益仍按 SHOPLINE 订阅状态、有效期及 quantity_breaks_access 功能键判断，未改动 Token、授权、Webhook、活动失效规则或存量订阅记录。
- 先将现有价格断言改为 9.99，确认 Worker 套餐响应与前端实际渲染分别因仍为 11.99 失败；更新后 Worker 全量 47 文件 / 402 项、前端订阅相关 9 项、Worker TypeScript、前端构建通过。前端全量本轮未重复运行，上一批记录的 7 项既有失败不在本轮修复范围。
- 本地 Playwright 使用受控订阅 API，实际打开套餐页确认显示 $9.99，页面无运行时异常；已查看 1440px 桌面与 390px 手机截图。参考截图：/private/tmp/kaching-price-999-reference-desktop.png、/private/tmp/kaching-price-999-reference-mobile.png；修改后截图：/private/tmp/kaching-price-999-updated-desktop.png、/private/tmp/kaching-price-999-updated-mobile.png。此检查不代表真实 SHOPLINE 扣款或新订阅验收。
- 共修改 8 个文件，无新增/删除文件、数据库迁移或 CSS 改动；保留并排除用户原有 web/test/feedback-board.test.mjs 邮箱断言改动。拟提交：fix: sync Ultra plan display price to USD 9.99。本批未提交、推送或部署。

# 2026-11-18 移除活动组件字号范围（本地完成，待推送部署）

- 按用户要求移除全部组件字号原有的 5–20px / 5–28px 限制，涵盖 PC、移动端及旧版 bodyPx。前端不再设置字号 max 或最小 5px；Worker 和旧版 Node 配置校验同步改为正整数 px，可保存 4px、48px、72px 等值。0、负数、小数、非数字及无穷值仍拒绝；字重、图片尺寸、间距、圆角与其他业务规则未改变。主题 app-block 直接使用已保存的字号，本次无需修改其脚本或 Discount Function。
- 先红后绿：新增测试在旧实现中复现 4px 输入被前端范围拦截、Worker 保存失败和 Node 配置归一化失败；更新后验证所有字号字段和两端配置不截断，D1 保存、更新及回读保持原值，非法字号继续拒绝。Worker 全量 47 文件 / 410 项、前端相关 55 项、主题组件 61 项测试通过；Node 新增两项通过，Worker TypeScript 和前端构建通过。前端全量本轮未重跑，之前已记录的 7 项既有失败仍未处理。
- 旧版 Node 全量实际结果为 151 项 / 145 通过 / 6 失败；使用 Git HEAD dcb8831 的原始 widget-config.ts 替代模块进行基线对照，相同 6 项失败复现，均涉及旧配置夹具缺少新增字段，未在本任务修改：campaign-domain.test.cjs 的 campaign widget settings default safely and enforce image and color boundaries、campaign widget validation checks the independent mobile style configuration、campaign widget typography accepts five pixel sizes；campaign-repository.test.cjs 的 campaign repository preserves independent widget styles and legacy rows；widget-config.test.cjs 的 widget validation accepts independent visibility fields and new variant original price styles、widget validation remains compatible with legacy comparison visibility。不能宣称 Node 全量通过。
- Browser plugin not available，使用本地 Playwright 实际打开 /quantity-breaks/new?lang=en，展开 Style 并输入加购按钮字号 48px；修改前原生有效性为 false，修改后为 true，无 pageerror。已查看 1440px 桌面和 390px 手机截图：参考 /private/tmp/kaching-typography-reference-desktop.png、/private/tmp/kaching-typography-reference-mobile.png；修改后 /private/tmp/kaching-typography-updated-desktop.png、/private/tmp/kaching-typography-updated-mobile.png。API 为受控数据，预览缺少市场商品数据的提示属于探针条件，未宣称实店发布或结账验收。自动化交互同时覆盖 desktop / mobile 全部 19 个字号输入的 4px / 48px 及正整数校验。
- 本批修改三份源码、三份相关测试以及 REQUIREMENTS / DESIGN_SPEC / APP_PROGRESS 三份文档，共 9 个文件；无新增/删除文件、D1 迁移或 CSS 改动。保留并排除用户原有 web/test/feedback-board.test.mjs 及执行期间出现的 theme-app-extension/public/app-block.css 改动。拟提交：fix: remove widget typography size range limits。本批尚未提交、推送或部署。


# 2026-11-18 补齐预计节省标题字体与主题区域标题（与字号范围移除合并交付）

- 根因：app-block 的 .qb-savings 已引用 savings-label-size / weight，但配置类型、默认值、编辑控件、预览与主题 token 映射缺失；补齐 typography.savingsLabel，默认 11px / 400。PC / 移动端独立保存，与节省金额、汇总标题及汇总金额分开。新增“预计节省标题”控件覆盖 16 种应用语言。Worker / 旧版 Node 的旧配置自动补默认，不需要数据迁移。
- 区域标题：原实现仅检查 API widgetTitle；没有保存翻译时 API 返回空字符串，导致 SLine 已输出的本地化默认标题未使用。现在优先使用已保存 widget.title（空白表示主动隐藏），其次兼容旧 widgetTitle，未配置时使用主题 i18n 默认标题，最终 Bundle & save；不展示活动内部名称。未改动 SLine 模板或 Discount Function。
- 浏览器实测发现手机端汇总金额规则会覆盖节省金额，已将该规则限定为非 qb-savings 行。保留用户已添加的汇总金额字号声明。PC / 手机分别核验标题24px/500、8px/900与金额13px、12px互不覆盖，无横向溢出。
- 先红后绿验证：未配置标题默认显示、显式空白隐藏、保存翻译优先、旧 widgetTitle 兼容、内部活动名称不泄露、两端独立节省标题 token 及旧配置默认。Worker 全量 47 文件 / 410 项、前端相关 59 项、主题全量 63 项通过；旧版 Node 本批相关 3 项通过，2 项既有夹具失败跳过，上一条已记录 Node 全量 6 项基线失败。Worker TypeScript、前端生产构建、Worker dry-run 与 git diff --check 通过。前端全量本批未重跑，既有失败见前文。
- Browser plugin not available；本地 Playwright 实际操作创建页 Style，修改标题字体并切换 PC / Mobile 验证独立状态；使用受控活动数据加载真实主题 JS / CSS，核验本地化区域标题和浏览器计算字号/粗细，未发生 pageerror。参考截图 /private/tmp/kaching-label-theme-reference-desktop.png、/private/tmp/kaching-label-theme-reference-mobile.png；修复截图 /private/tmp/kaching-label-theme-updated-desktop.png、/private/tmp/kaching-label-theme-updated-mobile.png；编辑器截图 /private/tmp/kaching-label-editor-desktop.png、/private/tmp/kaching-label-editor-mobile.png。截图已查看；受控本地核验不等同于已发布 SHOPLINE 扩展实店验收。
- 本批与上一条字号范围移除合并，共17份源码/测试/文档，无新增或删除文件、D1迁移。保留并排除用户原有 web/test/feedback-board.test.mjs 邮箱断言改动。拟提交 fix: complete widget typography controls and heading fallback。用户已明确要求推送并部署，沿用当前 main，部署 Cloudflare Worker/web；app-block 仅提交 Git，由用户自行发布到 SHOPLINE。


# 2026-11-19 app-block 商品可售隐藏、去除重复原价与档位售价字重（本地完成）

- 用户确认规则：product.available=false 时整个 app-block 隐藏；模板只在存在且可售的商品上输出资源和组件，传入 data-product-available，脚本对显式 false 同样隐藏并跳过活动请求。旧模板无该标记时维持原行为。款式仍只依赖 variant.available，不引入库存数量或追踪推断；缺货所选款式保持可见，按钮本地化 Sold out 并禁用，恢复可售选择后恢复加购。
- 档位标题、每件款式 qb-variant-price 与购物车款式明细 qb-product-prices 按计算后的货币最小单位比较，原价大于折后价时才生成 del，金额相等（包括0、无折扣、零折扣及货币舍入后相等）只生成售价。切换到实际折扣档时重新显示真实划线原价，不改折扣计算和加购数据。
- 按用户补充要求将档位售价由 b 改为 span.qb-tier-price，新增专用 CSS 显式绑定档位售价颜色、字号与字重；保留价格容器与原价 del 类名，款式和购物车的售价元素保持原样。无 focus/focus-visible 修改。
- 测试先复现商品不可售仍显示、三处无折扣仍生成 del、档位售价仍为 b，再修改实现。主题完整测试68项通过，SLine check --fail-on-error 和 git diff --check 通过。覆盖可售/缺货来回切换、真正优惠仍显示原价、USD/JPY舍入相等、桌面/手机相同价格规则与$70,290.00 / $140,580.00示例。只改主题扩展与对应测试/文档，未改 Worker、后台预览或 Discount Function，未重复运行其无关测试。
- 使用真实主题 JS/CSS 的本地 Playwright 检查商品false时隐藏且零活动请求，款式售罄按钮及恢复、三处重复原价消失、真实优惠保留原价；注入主题 b{font-weight:bolder}，确认档位售价为SPAN，电脑400/18px、手机300/16px精确生效，页面无运行时异常或横向溢出。已查看参考截图 /private/tmp/kaching-availability-reference-desktop.png、修复截图 /private/tmp/kaching-availability-updated-desktop.png、/private/tmp/kaching-availability-updated-mobile.png、/private/tmp/kaching-availability-sold-out-mobile.png，另保留参考手机截图 /private/tmp/kaching-availability-reference-mobile.png。使用受控活动响应，不代表SHOPLINE扩展已发布或实店验收。
- 共7份源码/测试/文档修改，无新增、删除文件或数据库迁移；用户原有 web/test/feedback-board.test.mjs 邮箱断言修改保留并排除。拟提交 fix: respect product availability and storefront price presentation。本批尚未提交、推送或发布SHOPLINE主题扩展，按AGENTS.md等待本次Git授权。


# 2026-11-19 样式颜色常规组顺序调整（本地完成）

- 按用户要求将共享 CampaignStyleEditor 的“区域标题”颜色控件移至“卡片背景”之前。常规组顺序为：区域标题、卡片背景、选中背景、常规卡片边框、选中卡片边框；创建/编辑及PC/移动端复用相同顺序。
- 本地Playwright打开创建页展开样式，以受控API核验1440px/390px下控件顺序，无pageerror；已查看参考 /private/tmp/kaching-color-order-reference-desktop.png 及修改后 /private/tmp/kaching-color-order-updated-desktop.png、/private/tmp/kaching-color-order-updated-mobile.png，另保留参考手机截图。前端生产构建通过（保留现有大包提示），git diff --check通过；仅调整展示顺序，无新增自动化测试。
- 本批仅修改 web/src/prototype/CampaignStyleEditor.tsx 与本进度文档，无新增/删除文件。保留并排除用户原有 theme-app-extension/public/app-block.css 和 web/test/feedback-board.test.mjs 修改。拟提交 fix: show section title color before card background；尚未提交、推送或部署，按AGENTS.md等待本批授权。

# 2026-11-19 补齐选中规格值颜色编辑并合并用户样式调整

- 根因：variantSelectedText 已存在于配置、默认值、预览和主题映射，但未加入编辑器颜色分组。现加入“样式 → 颜色 → 规格”，位于“规格值”之后；补齐16种应用语言，PC/移动端沿用独立配置。未改保存接口、Worker或Discount Function。
- 合并上一条“区域标题移到卡片背景前面”，保留用户将规格背景移到规格组首位的顺序，以及app-block.css的标题颜色作用域和汇总行换行修改。用户本轮明确授权一起推送；排除原有web/test/feedback-board.test.mjs邮箱断言改动。无新增/删除文件和数据库迁移，无焦点伪类修改。
- 回归测试先复现缺失文案/控件，再补实现。前端相关42项、主题全部68项通过；前端生产构建及git diff --check通过，构建保留既有大包提示。
- 本地Playwright实际打开创建页面，核验颜色顺序、编辑PC为#123456与移动端为#ABCDEF并切回确认独立状态；受控活动加载真实主题JS/CSS，选中规格文字计算颜色分别为rgb(18,52,86)/rgb(171,205,239)，无pageerror。参考截图沿用上一条 /private/tmp/kaching-color-order-reference-desktop.png、/private/tmp/kaching-color-order-reference-mobile.png；本次编辑器截图 /private/tmp/kaching-selected-variant-desktop.png、/private/tmp/kaching-selected-variant-mobile.png，主题截图 /private/tmp/kaching-selected-variant-theme-desktop.png、/private/tmp/kaching-selected-variant-theme-mobile.png。编辑器截图已查看；本地受控数据核验不代表SHOPLINE扩展实店验收或已发布。
- 本批5份源码/测试/进度文档，拟提交 fix: expose selected variant text color and preserve style ordering。按用户要求仅推送Git，本轮未部署Cloudflare或发布SHOPLINE扩展。

# 2026-11-19 补齐规格选中背景与更新创建默认样式

- variantSelectedBackground 已存在于样式配置、预览变量和主题映射，编辑器颜色分组遗漏控件。现于“规格背景”后增加“规格选中背景”，补齐16种语言，PC/移动端复用现有独立样式编辑与保存逻辑。
- 按用户要求合并其 quantity-breaks.module.css 与 widget-config.ts 改动：新活动默认List布局、间距10、优惠标签圆角5、更新卡片/规格配色及各字号字重、默认显示档位优惠标签、关闭购物车规格明细/价格汇总及图片色值。完整保留用户所设数值和CSS；未改后端历史兜底或覆盖已有活动保存的配置。本批不涉及主题扩展源码或Discount Function。
- 测试先复现缺失文案和控件，再补实现。前端相关43项通过；其中旧测试依赖旧创建默认值的8处已改为显式开启被测功能或同步新默认断言，保持汇总、款式回退、移动独立性等原回归覆盖。前端生产构建及git diff --check通过，保留既有大包提示。
- 本地Playwright真实打开创建页，在1440/390视口确认控件顺序和新默认黑色选中背景；分别改为#123456/#ABCDEF、切回PC确认保持独立。以受控商品/市场接口加载实际预览，计算选中背景分别为rgb(18,52,86)/rgb(171,205,239)，无pageerror。截图已查看：参考 /private/tmp/kaching-variant-background-reference-desktop.png，另保留reference-mobile.png；修改后 /private/tmp/kaching-variant-background-updated-desktop.png、/private/tmp/kaching-variant-background-updated-mobile.png。本地受控验证不等同于真实SHOPLINE商家端发布验收。
- 共7份源码/测试/进度文档，无新增/删除文件、数据库迁移或focus规则修改；保留并排除用户原有web/test/feedback-board.test.mjs邮箱断言改动。用户已明确授权推送并部署，拟提交 fix: expose selected variant background and update creation defaults，沿用main并部署Cloudflare Worker/web；app-block由用户自行发布。


# 2026-11-19 翻译页完整文案场景说明与隐藏未使用文案（本地完成）

- 用户要求翻译预览覆盖可选规格/价格明细并说明显示条件，随后明确移除当前店铺组件未展示的文案。核对真实app-block代码后，从翻译编辑列表及场景示例中隐藏 widget.description、widget.tier_rule、widget.checkout_note；保留历史翻译数据和原有保存兼容性。保留widget.calculated_at_checkout；widget.tier_items只在档位未自定义标题时用作标题，独立分组“档位选择”。
- 翻译预览显式开启showCartVariantDetails、showPriceSummary和showTierSavingsBadge，不依赖创建默认开关，不改变商家活动。每个可编辑字段显示位置/条件；新增TranslationCopyExamples展示全部15项有效文案及变量替换后的示例，支持草稿即时更新、空标题隐藏说明和语言请求失败时的安全默认locale。16种应用语言全部补齐帮助文案。仅本地展示场景，无真实购物车请求；未改Worker、主题扩展、Discount Function或数据库。
- 自动化先复现0项场景示例与可选区域缺失，再实施；补充3项移除、15项全覆盖、占位符替换、即时修改、空标题、空locale、16语言条件完整性与预览零写请求验证。翻译交互/保存/回退/API相关13项，草稿/默认翻译/语言支持/文案相关15项，共28项通过。前端生产构建及git diff --check通过，构建保留既有大包提示；本批未运行无关后端全量测试。
- Browser plugin not available，使用本地Playwright从翻译页进入，以受控商品/语言API实测PC/390px移动端、en/fr/zh-Hans切换、价格汇总与规格明细出现、15个编辑项/示例、3项缺席与输入即时更新，无pageerror和横向溢出。参考 /private/tmp/kaching-translation-scenarios-reference-desktop.png、reference-mobile.png；修改后 /private/tmp/kaching-translation-scenarios-updated-desktop.png、updated-mobile.png，场景示例 /private/tmp/kaching-translation-examples-updated-desktop.png、updated-mobile.png。已查看参考桌面、修改后桌面及完整移动场景示例截图。本地受控核验不等同于实店发布验收。
- 本批24份源码/多语言/测试/文档，其中新增web/src/prototype/TranslationCopyExamples.tsx与translation-preview.ts，其余为修改，无文件删除；保留并排除用户原有web/test/feedback-board.test.mjs邮箱断言改动。拟提交 feat: preview storefront translation conditions and hide unused copy。用户已明确授权本批推送并部署，沿用main，部署Cloudflare Worker/web。

# 2026-11-19 预览缺货款式售价与未预选占位翻译

- 按用户要求调整共享 StorefrontWidget 的款式价格行：选中缺货款式时，stockState 显示该款式当前市场售价，不应用档位折扣、不显示划线原价或缺货标签；可售款式继续显示正常优惠价。市场价格未返回时保留等待符号，不回退为店铺币种售价。保留选择项缺货提示和加购按钮 Sold out/禁用，切回可售款式后恢复正常加购预览。
- 下拉框未预选时移除写死的 Select，使用现有 widget.choose_option 翻译（默认 Choose an option），编辑页和翻译页共享此修复。未修改真实 app-block、Discount Function、Worker 业务代码、接口或数据库。
- 完整保留用户 quantity-breaks.module.css 修改：规格按钮最大宽度与断词、预览头部移除底边框、价格行允许换行、预览设备舞台移除内边距、翻译结果区调整内边距。未新增或修改焦点伪类。用户原有 web/test/feedback-board.test.mjs 邮箱断言修改保留并排除本批提交。
- 新增 preview-variant-display.test.mjs，先复现 Select 与 Sold out 替代售价的两个失败，再通过修复验证英文默认/已保存中文占位、缺货基础售价/市场售价、无划线价、无价格缺货class、缺失市场价等待、加购禁用及恢复可售优惠价。两项回归均通过。生产构建与 Worker dry-run 通过，保留已有大包/语言静态动态导入提示；前端类型检查仍为 storefront-translation-defaults.ts:188 两项既有类型错误。
- 本地 Playwright 使用实际 StorefrontWidget/CSS 与受控商品和市场价格，在1440px/390px核验未预选占位、缺货售价$55.00、缺货加购禁用、切回可售售价$24.00及恢复加购，无页面异常或横向溢出。已查看参考 /private/tmp/kaching-stock-reference-soldout-desktop.png，修改后 /private/tmp/kaching-stock-updated-soldout-desktop.png、/private/tmp/kaching-stock-updated-soldout-mobile.png、/private/tmp/kaching-stock-updated-unselected-desktop.png；另保留reference-mobile及updated-available-mobile截图与 /private/tmp/kaching-stock-qa-sources/ 夹具。以上为本地组件验证，不等同于实店主题扩展发布验收。
- 本批4份源码/用户CSS/测试/进度文件，其中新增1份回归测试，无文件删除。用户已明确授权本批推送并部署，沿用当前main，拟提交 fix: show sold-out preview prices and translated option placeholder。
- 全量前端最终结果：385项，377通过、8失败；与前次已复现基线一致：旧样式默认兜底、编辑页内部/结账名称结构、重复数量radio ID、样式控件结构、反馈状态背景、窄屏角标、单款式价格旧断言、Recommended列宽。日志 /private/tmp/kaching-stock-frontend-tests.log；本批新增2项均通过，未扩大修改无关基线问题。git diff --check通过。

# 2026-11-19 预览档位未设置副标题时隐藏副标题行

- 用户要求：预览中仅显示商家已设置的档位副标题。移除 tierDescription 根据件数/折扣自动生成的副标题，未提供、空字符串或纯空白均返回空文案，渲染时不生成 tierSubtitle 元素；保留该档位的标题、优惠标签和价格。已设置副标题在市场价加载中、不可用及已返回时均正常显示。编辑与翻译预览共享同一组件，未改真实app-block、折扣计算、Worker接口或CSS。
- 先复现自动生成“1 item · Standard price”和保留空small元素的问题，再修改。预览回归3项（含前批缺货售价与占位翻译）及subtitle相关2项通过；覆盖未提供、空值、空白、自定义文案和4种市场价状态。前端生产构建、git diff --check通过，保留既有大包/语言导入提示。本批未重复运行全量前端及无关Worker/主题测试。
- 本地Playwright以真实组件和CSS、受控商品/市场价在1440px和390px核验仅自定义副标题出现、全部4档仍可见，无pageerror和横向溢出。已查看参考 /private/tmp/kaching-subtitle-reference-desktop.png、修改后 /private/tmp/kaching-subtitle-updated-desktop.png、/private/tmp/kaching-subtitle-updated-mobile.png；另保留参考手机截图及 /private/tmp/kaching-subtitle-qa-sources/ 夹具。本地组件验证不等同于实店部署验收。
- 本批4份修改：StorefrontWidget.tsx、preview-variant-display.test.mjs、variant-display.test.mjs、本进度文档；无新增/删除仓库文件。保留并排除原有feedback-board.test.mjs邮箱断言及qa-preview-stock.html/tsx未跟踪夹具。用户已明确授权推送并部署本批；沿用main，提交 fix: hide unset tier subtitles in widget previews，部署Cloudflare Worker/web。

# 2026-11-24 普通订阅提示补充到期失效说明（本地完成）

- 按用户要求，普通 collectionConflictNotice 也显示“到期后对应折扣将直接失效。”，简体中文完整文案为“当前套餐将于{{date}}到期，到期后对应折扣将直接失效。”；同步16种应用语言。保留店铺时区、下一期生效时间、7日紧急判定、续费入口及现有CSS，未调整实际订阅或折扣失效规则。
- 更新既有 subscription-notice.test.mjs 中普通提示预期。subscription-notice / subscription-expiry-warning 两项回归通过；本地夹具另检查16种语言普通/紧急状态及日期占位符替换。
- 本地Chrome以真实文案模块、CSS和Button渲染提示区域，在1440px/390px检查新文案、下一期时间、续费按钮，无页面异常和横向溢出。已查看参考 /private/tmp/qb-normal-notice-before-1440.png、修改后 /private/tmp/qb-normal-notice-after-1440.png 与 /private/tmp/qb-normal-notice-after-390.png；另保留手机参考及 /private/tmp/qb-normal-notice-qa.json。该验证仅覆盖本地提示区域，不代表实店页面或平台续费联调验收。
- 本批3份文件修改：web/src/prototype/subscription-notice.ts、web/test/subscription-notice.test.mjs、本进度文件；无新增/删除仓库文件。原有shopline.app.多件优惠.toml修改保留并排除。尚未提交、推送或部署，拟提交 fix: clarify discount expiry in standard subscription notices。

# 2026-11-24 下一期套餐双行提示与到期接续排查（本地完成）

- 按用户示例，将有下一期的普通订阅提示分两行显示本期到期/下期生效时间，移除该场景“到期后对应折扣将直接失效”，同步16语言。保留无下一期及7天内续期有空档的失效说明、店铺时区、续费逻辑；未改CSS。
- 既有前端2项回归先失败后通过；Worker现有4个文件25项订阅测试通过；前端生产构建通过，保留既有大包和语言导入提示。实际代码模拟确认：全量核验可无缝切换；本地快照过期会短暂拒绝访问；旧ID过滤遇旧订阅unactive/cancelled可能漏查下一期并安排失效任务。后端未修改，不宣称已修复交接边界。详见docs/audits/2026-11-24-subscription-period-handoff.md。
- 本地Chrome以真实文案模块/CSS/Button在1440/390px核验两行日期、续费及无溢出/异常，检查16语言；已查看参考 /private/tmp/qb-next-period-notice-before-1440.png、修改后 /private/tmp/qb-next-period-notice-after-1440.png、/private/tmp/qb-next-period-notice-after-390.png，另保留手机参考及QA报告。本地受控验证不等同于实店订阅交接/平台删除验证。
- 本批4份前端源码/测试、1份新增排查文档及本进度文件，共6份。保留并排除用户原有shopline.app.多件优惠.toml与web/src/pages/quantity-breaks.module.css修改；无删除、数据库迁移或焦点伪类修改。拟提交 fix: clarify next-period subscription notices and document handoff risks。尚未提交、推送或部署，按AGENTS.md等待本批授权。


# 2026-11-24 无缝续期误失效防护与发布

- 用户授权“推送并部署 并且修复”，将前述两行提示和后端交接修复合并为同批。全量分页核验替代按旧sub_id筛选；共享访问判定允许已核验连续下一期覆盖同步延迟，仍拒绝空档/明确撤销/缺少权限。支付通知查询失败保留已核验下期时间；已结束但状态仍active不会作为当前期续权。
- 订阅核验/失效按店铺独立租约串行；权益SQL写入校验租约。失效任务检查版本，重新核验失败则重试，恢复有效则取消任务；真正删除持有活动锁并复核任务/绑定。补齐GDPR对新订阅锁的清理，无新迁移。
- 独立审查发现的版本提升漏清理/绕过429退避问题，已用多活动+第二次执行回归先复现再修复：更新原队列的权益版本，保留原任务身份和重试期限，不创建立即到期替代任务。无待处理Critical/Important或次要审查发现；实店跨期/平台延迟行为未实际等待验证。
- Worker完整51文件492项通过（限制4并发避免第一轮workerd内部错误），类型检查与dry-run通过。修正了2处2023年已过期却期待有效的历史测试数据，以及旧按ID过滤快照测试。前端相关2项通过；两种视口/16语言提示本地QA沿用前节，发布CSS以Git已提交版再次核验。完整日志/private/tmp/qb-handoff-worker-final-tests.log。
- 保留并排除用户原有shopline.app.多件优惠.toml与quantity-breaks.module.css；仅本批源码/测试/审查文档/计划/进度纳入提交，拟提交fix: prevent subscription handoff from invalidating renewed discounts。按已获得授权推送main并从干净提交快照构建部署Cloudflare Worker/web；不发布SHOPLINE主题扩展或Discount Function。实际发布结果以最终回复为准。


# 2026-11-24 发布用户CSS并还原应用入口配置

- 用户授权将原有CSS及应用配置一起推送部署；检查发现CLI入口/回调指向临时trycloudflare域名。经本轮明确回复“地址还原”，本地appUrl还原为https://app.vswwy.cn，回调还原为https://app.vswwy.cn/api/auth/callback，与当前Git已提交配置一致，不改SHOPLINE开发者平台入口。
- 完整保留用户CSS：普通secondary按钮移除原基础背景/hover规则；订阅提示栏续费按钮使用#4f46e5背景、白字及同色阴影；提示文字13px、padding 5px 32px 0。未新增或修改焦点伪类。
- 前端生产构建通过，保留既有大包和语言导入提示。未改后端业务逻辑，未重复运行上批已通过的492项Worker测试；本批无新增测试。
- 本地Chrome加载真实文案模块、CSS和Button，在1440px/390px对比修改前后，核验字号/左右间距、按钮背景/文字/阴影，两行订阅日期保留，无页面异常和横向溢出。参考/private/tmp/qb-css-config-before-1440.png、before-390.png，修改后/private/tmp/qb-css-config-after-1440.png、after-390.png；报告/private/tmp/qb-css-config-release-qa.json。截图已查看，验证仅覆盖本地提示区域，不代表实店完整流程。
- 本批仅提交quantity-breaks.module.css及本进度文档；应用TOML还原后无差异。按本轮授权推送main并部署Cloudflare Worker/web，拟提交style: publish updated subscription notice styling。线上实际版本与检查结果在最终回复中记录。

# 2026-11-24 下一期订阅展示按列表记录判断

- 用户明确要求“显示下一期时，不用对下一期进行的功能点进行核验，只要有下一期就行”。展示采用同店铺、ultra、active/preorder且未来起止时间有效的最早记录；新增独立nextDisplayFrom/nextDisplayUntil，不再以详情功能点结果决定是否显示。nextValidFrom/nextValidUntil继续独立服务已核验权益续接，未核验展示数据不能授予跨期访问权限。
- 本批修改文件：web/src/pages/quantity-breaks.tsx、web/src/prototype/subscription-api.ts、web/test/subscription-expiry-warning.test.mjs；worker/src/db/migrate.ts、worker/src/db/subscriptions.ts、worker/src/routes/subscription.ts、worker/src/services/entitlements.ts、worker/test/entitlements.test.ts、worker/test/subscription-routes.test.ts；新增worker/migrations/0025_subscription_next_period_display.sql；更新docs/REQUIREMENTS.md及本进度文档。无删除文件、无CSS或应用入口配置改动。
- D1迁移增加next_display_from/next_display_until并以原已核验日期回填，保留原访问权限字段；上线必须先应用迁移。订阅/bootstrap返回展示日期，前端优先使用展示日期，兼容尚未包含该字段的旧API；已取消/他店/他套餐/无效日期不作为下一期。完整列表确认不存在时清除展示日期，支付查询临时失败保留已有记录。
- 先复现3项后端测试失败及前端提示测试失败，再实现修复。Worker完整51文件495项通过（maxWorkers=4/minWorkers=1），前端订阅提示与页面集成2项通过，Worker类型检查、前端生产构建、Wrangler dry-run及diff检查通过。完整Worker日志/private/tmp/qb-next-display-worker-tests.log；构建仍有原有大包/语言导入提示。
- 本地Chrome以真实活动页组件、API受控数据验证1440/390视口，复现旧版本错误提示并确认新版本两行日期与续费入口，无页面JS异常。参考/private/tmp/qb-next-display-before-1440.png、before-390.png；新截图/private/tmp/qb-next-display-after-1440.png、after-390.png；报告/private/tmp/qb-next-display-page-qa.json。已查看桌面/手机新截图；此为本地受控验证，未部署、未修改生产D1、未验证实店最新返回数据。
- 拟提交：fix: show upcoming subscription dates independently of feature checks。用户本轮已明确“推送并部署”，按该授权发布main；生产仅待执行0025迁移。发布前重跑前端相关2项测试、构建与Worker类型检查通过；此前完整Worker495项与本地桌面/手机页面验证见上。实际发布版本及线上检查结果在最终回复记录。

- 后续用户明确要求本期与下一期日期同行显示：移除活动页提示中的br，以空格连接两句，不修改CSS；手机空间不足时自然换行。同步调整页面集成断言，先复现失败再修复。相关2项前端测试与生产构建通过；Chrome1440px确认两句位于同一行，390px自然换行，无JS异常。截图/private/tmp/qb-inline-display-before-1440.png、before-390.png与after-1440.png、after-390.png；报告/private/tmp/qb-inline-display-page-qa.json。已查看新截图，本次仅本地变更，尚未推送部署。


# 2026-11-25 独立测试目录功能同步（本地完成，未实店验收）

- 将当前源功能/测试/迁移/主题兼容资源/文档同步至本测试项目，保留目标 App Key、App Secret、主题和 Function 开发 UUID、原 SQLite；仅扩充 scopes 并替换运行时代码正式环境缺省值。源目录保持不变。
- 环境隔离4项、主题兼容39文件/36语言、前后端构建、Worker类型与dry-run、26份本地D1迁移通过。中文目录Worker测试运行时有node:vm工具链问题，在临时英文目录以相同代码运行，51文件499项全部通过；Node单元26项、边界2项通过。
- 主题全量108/109、Express146/152、前端Node22为354/362；失败均已对照源复现。Go存在源既有重叠折扣用例失败，单文件入口编译通过。保留既有业务规则，本批不宣称全量全绿。
- 浏览器实际核验源/目标页面壳、未授权加载失败状态及设置指南打开，截图保存在docs/reference/screenshots/test-environment-sync/；没有实店会话，未验证活动持久化、支付、真实加购或结账。
- 独立审查确认功能文件完整与身份隔离；替换会指向正式资源的旧部署手册。测试D1 ID、稳定URL、Partner token、必要的管理binding、套餐/扩展发布及实店验收仍待配置，不能标记生产可用。
- 本批未提交、推送、部署或发布扩展。详见docs/TEST_ENV_SYNC.md及TEST_ENV_SYNC_FILES.json。拟提交 feat: sync quantity breaks features into isolated test environment；按AGENTS.md等待本批Git授权。


# 2026-11-25 测试环境赠品/捆绑需求阶段记录（历史，现状见Task6/Task7）

- 用户指定赠品默认前台标题「🎁 Free gifts with your order」、捆绑「Frequently Bought Together」，两项可在翻译页按显示语言修改。已同步设计/需求/流程/组件边界，拟用独立翻译键复用现有店铺/locale保存和回退，保留主动清空标题。当前只更新文档，尚未接入产品翻译清单或验证页面。

- 用户补充两板块标题行需使用图片中的开关形式；参考已保存到docs/reference/screenshots/gifts-bundles-section-toggle-reference.png。设计记录左侧展开/图标/标题、右侧独立启用开关；关闭保留设置，再启用恢复，操作进入原活动保存流程。仅补充文档和用户参考，未实现或验收开关页面。

- 用户要求只在测试项目实现，禁止修改正式源码。已确认顺序「设置 → 样式 → 赠品 → 捆绑商品」，两个模块可同时设置与生效；用户随后明确赠品全部达标自动随单加入、app-block不可取消，捆绑支持多选；锁卡切档并重算全部赠品，数量上限按后续主商品示例修订，异常择优仅保留捆绑单选模式，赠品累计解锁不择一。桌面默认三列、手机单列，新增单行轮播。
- 新增 docs/superpowers/specs/2026-11-25-test-gifts-bundles-design.md，同步需求/设计/流程/组件文档并为旧设计添加历史提示。实际减免总额作为折扣力度的计算解释列入本版设计审阅；用户随后明确A、B为触发主商品，额度按合格主商品分别贡献、附加商品不足上限仍优惠；旧“必须凑齐”要求被后续例子取代。
- 只读核对现有活动模型、公共服务、购物车映射与Function的缺口；测试和正式目录无共用可写源码文件，正式725份已跟踪文件哈希基线保存在本机临时目录。
- 本批仅文档，未实现产品代码、未安装依赖、未运行新功能测试或页面验收、未修改远程资源、未提交/推送。下一步先完成更新后书面设计确认，再给出具体实现计划。Git目标仍为 https://github.com/TouchFish-Good/Kaching-Bundles-App-Upsells-Test.git，后续推送前另行说明地址/分支并请求本批授权。

# 2026-11-25 测试 Worker 部署到 app-test.vswwy.cn

- 按用户授权创建独立测试D1 `9fcea996-fdc3-4ade-a792-c8659e42800c`，应用26份迁移，绑定测试Worker `shopline-quantity-breaks-test` 与自定义域名 `app-test.vswwy.cn`。部署版本 `8be7be72-098a-4eae-a27d-ac659047ffbb`，两个cron已发布；正式Worker/D1/域名未修改。
- 配置原测试App Secret及独立加密/内部密钥。App Key/App Secret保持测试原值；两份扩展凭证在本次操作之外更新ID后，保留新Function `754292a155d740809a5437a3f8c59231`、主题UUID `fb0f6365-4554-4c29-aca7-d439ae191804`与扩展ID `10949`，并对齐运行时代码。按新身份快照核验两份凭证、主题元数据和原SQLite未被本次操作覆盖。应用地址、回调、Worker变量和本地主题来源统一新域名；未发布SHOPLINE扩展或更新Partner后台地址。
- 环境隔离4项、主题来源相关9项、兼容39文件/36语言、前端构建、Worker类型/dry-run通过；完整Worker在英文临时镜像51文件499项通过。线上HTTPS/首页/JS200，未授权API401，缺失资源404，OAuth跳转callback为app-test域名，无签名callback400。浏览器实际加载页面壳；无SHOPLINE会话，未宣称真实商家功能已验收。
- Function ID对齐后Worker相关6文件72项、Express19项及类型/dry-run通过。CLI代码版本cb6654c0-0acd-4874-9ba2-b09b4ddd2067；用户添加Partner Secret后回读当前活动版本如上，正确Function/D1/域名均保留。Secret名称已确认，Partner权限与订阅尚未联调；独立管理服务binding、平台地址/回调配置、扩展发布及实店验收仍待补齐。记录docs/audits/2026-11-25-test-worker-deployment.md；用户随后明确批准本批推送至 https://github.com/TouchFish-Good/Kaching-Bundles-App-Upsells-Test.git 的 main，提交 chore: deploy test worker at app-test.vswwy.cn。实际推送结果以 Git 回执为准。

### 2026-11-25 测试双模块实施进度

- 仅在独立测试目录与 `codex/gifts-bundles-test` 分支实施；正式环境未修改。
- 共享配置、严格校验、活动双模块保存/读取及前端转换已本地实现并通过独立审查。规则行为21项、D1读写2项通过；Worker类型检查、Express/Web构建通过。
- 后续Tasks2–5已完成Function、本地Worker原生索引/公开描述、认证草稿预览、编辑器/翻译页与双主题购物车；采用all_products而非公开商品/价格服务。各阶段证据和外部验收边界见Task6审计；最新用户交互要求Task7待实施，不能标记整个功能可上线。
- 本批未推送、部署或发布扩展，尚未进行实店购物车/结账验证。

### 2026-11-25 Task 4：测试编辑器、双模块预览与标题翻译（本地）

- 已在测试项目实现「设置 → 样式 → 赠品 → 捆绑商品」顺序；独立展开/启用开关按参考图还原，关闭保留规则并通过原活动 SaveBar 保存。复用分页选品，编辑真实款式白名单、数量、条件、优惠、标签、图片和桌面/移动样式；16 种后台语言均提供新增文案。
- 本地模拟预览支持全部达标赠品自动纳入且不可取消、捆绑多选/取消及单选实际减免择优，款式/数量重算，主商品与附加商品明细及整数合计。设备切换保留选择；实际容器 400/600/700px 分别显示 1/2/3 列，支持单行轮播、键盘和触摸滚动。翻译页独立保存两标题，显式清空仅隐藏标题。
- 新增 DOM 测试 17/17、相关既有回归 14/14；Web 构建及类型检查通过。完整前端 366/377，11 项失败均在 Task 4 基线 d703061 的定向复测中复现（含 Node22 JSON assert 语法、旧外观断言及 Task3 新标题对应的旧翻译断言），未声称全套通过。
- 参考图 `docs/reference/screenshots/gifts-bundles-section-toggle-reference.png` 与实际前后 1440/390/320、容器、开关状态、轮播、翻译截图及浏览器结果保存在 `docs/local/gifts-bundles-task4/`；浏览器本轮无页面/控制台错误。模拟主商品 $64 + 已选捆绑 $30 + 赠品 $0 = $94；实际本地保存保留数量与双开关。
- 使用认证草稿 `offer-preview`，核验请求版本/修订/locale/market/currency 并拒绝迟到响应；遵守 429 Retry-After（草稿修改亦不绕过等待）。只采信明确可售与可信价格，不使用选品库存推断；缺价/未知上下文保持不可用。未修改焦点伪类、配置、凭证或正式源码；未推送、部署、发布扩展或写商家数据。
- 以上为本地页面与模拟数据验证，非 SHOPLINE 商品、原生主题、真实购物车或结账验收。下一未验收部分为 Task5 原生主题/购物车及后续联合验证；整个应用仍未标记完成或可上线。


## 2026-11-25 测试环境 Task5：原生主题赠品/捆绑与复合加购（本地）

- OS3 与 OS2.1 接入测试专用 `qb_test_offers.catalog_v1` 索引和主题 `all_products` 原生目录，SSR 仅预加载，最终要求 Worker v2 capability、活动/digest/ID 白名单及原生货币/语言/国家上下文一致。无 Storefront transport/token 或新的附件脚本请求；旧版/关闭模块继续主商品流程。
- 无已文档化 SSR 当前时间时，按商品/集合/全店优先顺序保留相关候选，不以未来/过期高优先活动遮蔽下层候选；OS2.1 去重并最多查询20个 Handle，主题已用额度造成缺失时附件不可用，主商品可加购。
- 赠品满足条件全部自动加入且不可取消，捆绑支持多选/取消与单选最大实际节省回退。规则/逐件规格保留跨尺寸和修订状态；巨大数量保留原值并标为不可展示，安全整数金额检查避免分配或溢出。
- 一次平铺 `/cart/add` 提交主商品/赠品/捆绑，使用官方隐藏 properties 数组；超时8秒后只读确认完整身份，禁止自动重试写入。主题事件与通知匹配真实 Product、Handle 和购物车行 key。
- 本地主题全量一次结果123/124，唯一失败为既有 `unchanged default desktop and mobile configuration renders a usable widget` 的10px/8px旧断言；在 ce738ec 干净文件副本中复现。后续受影响的原生/购物车/两代通知定向检查50/50通过（含新增17项附件测试），未将完整套件记为全绿。SLine 官方 validator 带扩展根目录和 fail-on-error 通过，无关闭诊断；canonical browser core drift、OS2.1 sync/check 通过。
- 本地 Chromium 实测两代1440/390/320、容器400/600/700对应1/2/3列，动态移除/重挂载与独立区块、轮播键盘/触摸、一次模拟购物车批次；参考/前后截图和 browser-evidence.json 保存在 docs/local/gifts-bundles-task5。无浏览器错误、横向溢出或真实购物车写入。OS2.1 使用本地 Handlebars helper 夹具执行模板；OS3 使用原生DOM夹具与实际JS/CSS，未声称执行真实SHOPLINE模板渲染。
- 尚待授权的测试店部署验收：实际 shop metafield 权限/可见性、all_products 实店输出、Function SKU/variant及line-total能力、真实购物车/结账。仅本地提交，未推送/部署/发布；整体应用仍未全部验收。


### Task5 review fixes — local theme verification (2026-11-25)

- 修复单选捆绑的未勾选付费商品自动纳入：保留空选择、取消、暂不达标及不可用选择；仅异常多条明确勾选规则按实际减免择优。
- 不确定复合加购事务按组件持久保留，跨重渲染、移除/恢复及活动修订继续锁定；新增本地化“检查购物车”仅只读核验，不能再次 POST，只有原事务精确确认成功才解锁。
- 两个已启用模块的全部配置附加商品统一排除主商品资格，与 Function 一致；关闭模块保留的草稿不参与排除。补充实际 OS2.1 模板 JPY 主售价/比较价挂载回归。
- 本轮覆盖测试56/56、原加购/文案回归3/3通过；同步/漂移/SLine检查通过，OS3/OS2.1桌面及移动8张本地截图见 `docs/local/gifts-bundles-task5/round1/`。仅本地模拟接口，真实店铺原生渲染/Function/结账仍未验证，未推送或部署。


## 2026-11-25 Task6：跨层验证与交付审计（本地，Task7待实施）

- 新增真实SQLite执行D1仓储保存/发布确认 → Worker公开路由v2 → 挂载主题产生一次模拟加购批次 → Go生成request codec/EvaluateDiscounts/response codec链路；覆盖主量2/4累计赠品、明确勾选双捆绑、伪造身份、少量主商品、超额附件、重复context与两个合格Product的实际target数量和line-total。真实平台交易未执行。
- 三项由Task3新增标题引起的旧断言先红后绿修正；两文件10/10通过，实际编辑/清空两标题保留商品预览，翻译字段16项。原8项前端失败在实施前4f5cc26窄复测逐项复现；Go原有重叠活动失败与主题10px/8px旧断言仍保留，未将完整套件标为全绿。
- 正式725份文件哈希与原Git状态一致；原6项及扩展9项测试身份哈希一致，无焦点伪类变化。完整文件清单、8条原序裁定、截图和验证证据见[中文审计](audits/2026-11-25-gifts-bundles-local-integration.md)。任务本地提交，未推送、部署、发布或写真实商家数据。
- 最新用户交互裁定见本设计/需求顶部，Task7 PENDING：捆绑新旧规则固定1件，商家/买家均无数量控件且单款式槽位（赠品数量配置保留）；去除赠品重复状态字样，捆绑使用原生checkbox；本Task6只记录，不声称实现。Task4/5截图代表此前实现，Task7须重新保存实际交互/视觉证据；最终全分支独立审阅在Task7之后，由控制器执行。


## 2026-11-25 Task7：固定一件捆绑与原生复选框（本地完成）

- 捆绑每规则固定1件；旧有效quantity>1先严格校验后统一为1，覆盖实际SQLite/D1读取、保存、暂存更新和公开/Function投影；不执行远程数据迁移。赠品配置数量及主商品trigger.quantity保持。
- 商家与买家捆绑数量输入移除；每规则一个款式槽位。React和OS3/OS2.1采用原生checkbox选择/取消、单选/多选、锁卡最低可达档位解锁并选择；原生change按checked赋值，重勾锁卡不误取消。赠品移除重复Included状态，保留可配置标签/数量及异常反馈。
- 修正React预览所有启用配件Product排除主资格的既有规则；主题重绘仅在checkbox原本持有键盘焦点时恢复焦点，未改任何focus CSS。持续不确定事务保护及不同主Product各贡献1件的额度池保留。
- 新核心/旧配置/整链/主题覆盖88/88、React25/25、Worker受影响6文件102/102、Go所有TestV2通过；Express受影响2文件9/10，既有`campaign repository preserves independent widget styles and legacy rows`缺tierSavingsBadgeRadiusPx，在Task7基准174ef368重现。Web build/typecheck、Express build、Worker typecheck与canonical/theme drift通过。既有全套失败历史仍见审计，未宣称全绿。
- 保留20张前后及展开商家规则桌面/移动截图与5份browser JSON（见docs/local/gifts-bundles-task7）。真实Chromium验证Space连续切换、标签/触摸取消、单选/多选、锁定/不可用、resize/remount和一次五行模拟POST。参考截图仍为既有Shopify管理面板header；无未见参考的完整店铺视觉等价宣称。
- 所有接口/购物车为本地合成；正式环境只读，无推送、部署、发布或真实商家写入。最终任务审阅与整个分支独立审阅由控制器继续，整个应用/真实平台尚未验收。


## 最终独立审阅整合修复（2026-11-26）

本地补齐已确认行为：设置/样式页签；捆绑固定减免/固定价的既有认证市场金额配置及精确金额草稿校验；公共V1/V2跨已发布有效活动统一排除启用附件Product，React/主题主档位价格与Go保持原价；仅Product/Variant和市场上下文变化请求附件价格；轮播真实边界禁用、原生嵌套控件键盘安全、焦点可见与RTL/手动浏览。捆绑固定1件/原生checkbox、赠品数量/自动累计及一次POST/不确定事务规则保持。详见 [交付审计](audits/2026-11-25-gifts-bundles-local-integration.md) 与最终修复截图。全分支审阅已完成并提出上述修复；一次定向复审及真实平台验收仍待完成，不代表整应用完成。
