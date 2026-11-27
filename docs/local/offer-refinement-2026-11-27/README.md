# 2026-11-27 赠品／捆绑细化验收（仅测试环境）

用户已明确批准“按此实施并推送”。目标仓库为 https://github.com/TouchFish-Good/Kaching-Bundles-App-Upsells-Test.git ，分支 `codex/gifts-bundles-test`。本批不部署。

## 实现范围

| 用户项 | 本批结果 |
| --- | --- |
| 1–3、14 | 两模块标签位置取消上边距；赠品边框上居中／商品标题下面，捆绑右上角／商品标题下面；去掉所有达标赠品说明 |
| 4 | 赠品加一条随主题语言显示的可见来源属性；例如“赠品：参与「商品A」活动获得”。使用 `roleVisibility: all`，六条内部协议属性仍 `none`，请求不同时使用 show |
| 5 | 捆绑市场金额复用现有 tierMarkets、标题及行结构 |
| 6–8 | 赠品卡片和明细只显示可关闭的优惠金额，旧活动默认显示；金额、规格字体及选中边框／圆角接入独立设备配置；捆绑价格两端对齐 |
| 9 | 赠品：商品／数量／图片／优惠金额／标签／位置／触发；捆绑：商品／标签／位置／触发／图片／优惠类型／优惠值 |
| 10 | 保留并纳入用户已有四份 CSS 修改 |
| 11–13 | 赠品卡片和明细不显示数量乘数；设备文字 PC／Mobile；轮播箭头卡片列表左右居中、边界隐藏 |
| 15–16 | 边框标签高于锁层；编辑页 checkbox 统一用户指定的 18px 黑白外观，保留禁用语义，未新增或修改焦点伪类 |

共享 `showSavings` 和 `card.radiusPx` 为可选字段，不改变历史数据要求；实际 D1 保存、公开 v2 返回及 Function 投影隔离均已测试。折扣额度及触发业务算法没有修改。

## 验证

- 共享／跨层测试 37/37，通过实际 SQLite D1、Worker 公开路由、主题批量行及 Go codec。
- 编辑器、控件、预览定向测试 51/51；主题相关定向测试 49/49，包含新缺省样式一致性测试。
- Worker Node 单元测试 26/26；Web 构建、Web／Worker TypeScript、生成资源一致性检查通过。
- Web 全套 400/413，13 项失败已在修改前 HEAD 的隔离源码副本逐名复现，没有新增失败名称。名称保存在 verification.json。
- 主题全套159项中158通过，既有 `unchanged default desktop and mobile configuration renders a usable widget` 仍因默认10px与断言8px不一致失败。本批不修改无关默认间距。
- Worker Workers-pool 全套受本机依赖／workerd 的 `No such module node:vm` 阻塞，未标记通过；兼容配置重试仍失败，未更改项目运行配置来绕过。
- 独立代码审阅发现缺省字体／圆角差异，已修复并新增回归，复审通过。

## 浏览器证据与边界

所有截图均为本地合成商品与本地服务，不是线上验收。PC使用1440断点，移动端390断点；截图实际内容区受浏览器边框影响。已实际执行：优惠金额关闭、设备切换、圆角输入、模拟保存、捆绑勾选／取消、轮播翻页至末端；末端右按钮 hidden+disabled，移动端没有横向页面溢出。本地原生模板加购一次返回6件／3行，确认可见来源属性且内部属性隐藏。

截图：editor-settings-pc、editor-style-pc/mobile、preview-pc/mobile、carousel-end-mobile、native-pc/mobile、native-added-pc。`reference-prior-native.png` 是上批已保存参考截图，仅用于对照，不当作本批运行结果。

正式环境725份受保护文件哈希与既有基线一致；测试App／Function等身份文件及Worker绑定配置未变。未访问真实结账、未上传主题、未部署Worker；实际店铺自定义属性显示仍需部署后验证。
