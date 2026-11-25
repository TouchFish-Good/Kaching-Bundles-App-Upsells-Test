# OS 2.1 / OS 3.0 主题组件兼容

本批已完成本地实现与受控验证，用户已授权推送并部署应用 Worker。SHOPLINE 主题扩展仍由用户自行发布；真实平台编译与实店验证尚未完成。应用管理界面、Discount Function 及结账输入不在本批修改范围。实际提交、部署和线上验证结果以发布回执为准。

## 目录与维护

- `theme-app-extension/blocks/app-block.html`：现有 OS3 SLine 模板。
- `theme-app-extension/compatibility/blocks/app-block.html`：OS2.1 Handlebars 模板。
- `theme-app-extension/public/app-block.js`、`app-block.css`：两个版本的交互/样式唯一源。
- `theme-app-extension/i18n/`：36 种店铺语言及 OS3 schema 标签唯一源。
- `compatibility/assets/`：共享 JS/CSS 的发布副本。
- `compatibility/locales/`：仅前台语言 JSON 的发布副本，不复制 OS3 的 `*.schema.json`。不要直接在副本维护样式或翻译。
- `compatibility/blocks/app-block.html` 的 `schema.locales`：由同一份前台翻译生成，使用官方迁移指南明确记录的 OS2.1 字段。模板正文手动维护，schema 内 locales 由同步脚本维护。
- `.shopline-cli.yml` 原有 `compatibility: true` 保留。
- 两版 schema 的商品页标识不同：OS2.1 为 `templates: ["products/detail"]`，OS3 为 `templates: ["product"]`，不能直接复制此字段。2.1 值已按平台实际报错列出的枚举修正；此前仅检查 JSON 格式不足以验证平台 schema。

修改共享资源后运行 `npm run theme:sync`，再运行 `npm run theme:check`。根目录 `npm run build` 会先同步。直接通过 CLI 发布前也必须执行同步和检查；平台 CLI 不会替本项目运行这些 npm 命令。删除源语言时，检查会列出残留副本，核实后人工删除；不会静默删除自定义文件。

同步脚本按字节复制当前前台翻译，并将解析后的同样内容生成到 OS2.1 的 schema.locales，不调用旧的 generate-theme-i18n.mjs，因此不会重置开发者已在 i18n 源文件中修改的文案。商家在应用翻译页保存的 campaign.copy 仍优先覆盖主题默认文案，不参与静态资源生成。两版模板维护同一组 data-qb-copy、五组规格、商品/款式 available、价格与图片属性。

## OS2.1 本地化约定与验证边界

- 前台模板使用 Handlebars 的 `{{t 'app_block.widget.title'}}`；保留现有 `{quantity}`、`{price}`、`{saving_amount}` 等单层花括号变量，最终由共享 JS 替换，不改为 SLine 过滤器或 Liquid 语法。
- OS2.1 的主题编辑器名称固定为英文品牌名 `Multi-item Discounts`（从共享英文 schema 源读取）。不依赖尚未确认的 `t:appBlock.block.name` 或 OS3 编辑器语言文件解析，避免编辑器显示原始键名。OS3 继续使用原有多语言编辑器名称。OS2.1 编辑器名称的多语言适配仍待取得旧版完整约定并进行平台验证。
- `npm run theme:check` 为只读检查，同时检查 JS/CSS、36 份前台语言文件及内嵌 schema 是否与源一致。同步前先确认模板使用的翻译键在每种语言中均为字符串，并按 UTF-8 字节检查 OS2.1 blocks 总量不超过 CLI 的 102400 字节限制；当前为 53351 字节。
- 旧版同步脚本生成的 `.schema.json` 副本，只有与当前同名源文件逐字节相同时才在同步时移除并输出记录；自定义/孤立文件保留并报错，核实后手动处理。源语言删除同样不会静默删掉未知副本。
- 不擅自将语言文件改为 `en.default.json` / `zh-CN.json`。所提供的文件结构指南混用了 Liquid、`product` 模板枚举及默认文件命名，与官方 Handlebars 指南和实际平台枚举冲突。当前 CLI 中发现的默认文件校验调用方是 Checkout UI 等扩展，主题打包仅核对 JSON 扩展名，不能证明主题必须使用该命名。旧版主题的默认文件名、缺失语言回退和编辑器解析行为仍需平台验收。
- 本地 Handlebars 测试只从 `compatibility/locales` 读取前台翻译，不再借用 OS3 i18n 文件；另核对每种语言的 schema.locales 与发布文件一致。这里是受控的 t helper 测试，不是 SHOPLINE 服务端本地化解析器的仿真或平台验证。

## 店铺与分类查询

OS3 保留 handle 与 get_collection_pagination 提供的完整分类上下文。OS2.1 使用官方 shop.id，不依赖未确认存在的 permanent_domain；Worker 从已安装 session 解析 handle，未知/卸载/有歧义的身份拒绝，shop 与 shopId 不一致也拒绝。浏览器不含 Admin Token。

2.1 的 product.collections 文档只保证线上渠道分类，所以不将它标为全部分类。通过订阅检查后，仅在有生效的分类活动且没有优先命中的指定商品活动时，Worker 使用已有 Token 复用/临近过期刷新机制，调用：

`GET /admin/openapi/v20260601/products/collects.json?product_id=…&limit=250`

只提取 Link 的 page_info，后续请求始终由应用构造固定的商家域名与接口，最多 4 页/1000 条；响应格式错误、跨商品数据、循环游标、超过分页上限、网络失败或 429 均不退回旧商品快照。查询失败返回 503，组件保持隐藏；正常查不到匹配活动返回 404。指定商品 > 指定分类 > 全部商品的展示优先级、排除商品、排期及订阅门槛保留；同一最高优先级多个活动仍返回冲突，不擅自选取一个。

每个 Worker 实例内：成功分类缓存 60 秒、失败缓存 5 秒，最多 256 项，合并同商品进行中的请求；最多 16 个进行中查询。按店铺串行发送，上游请求开始间隔至少 500ms，429 按 Retry-After 整店冷却（缺失时 1 秒、最多 24 小时），不自动重试。分类请求整组网络与排队预算为 5 秒，Token 刷新使用已有独立预算。最多维护 128 个店铺队列，空闲清理。不同 Worker 实例及其他接口仍共用 SHOPLINE 配额，这不是全账户限流器；突发时可安全隐藏，而非保证无条件展示。商品加入/移出分类后，组件最多有约 60 秒的实例缓存延迟；结账结果由 Function 决定。

## 组件运行

- 复用现有金额转换（主题价格 /100 后进入币种精度运算）、阶梯规则、五组规格、多语言、购物车加购与反馈。OS2.1 实店价格尺度尤其 JPY 等币种，仍需对照平台原价验收。
- product.available=false 不输出区块；variant.available=false 的选择仍显示缺货并禁止加购。
- CSS/JS 由模板 asset_url 加载；隐藏元数据转为现有组件 DOM。
- MutationObserver 处理主题编辑器/局部导航插入和替换区块，已有节点不重复挂载；区块移除时清理 viewport 监听，已移除且尚在查询的区块不再渲染。
- 复用已存在的 `/cart/add` 和购物车验证逻辑，不增加写请求重试。不假设每个 OS2.1 主题具有相同的购物车抽屉 API；加购成功与抽屉自动刷新分开验收。

## 验证与发布顺序

1. 本地：`npm run theme:check`、`npm run test:theme`；`cd worker && npm test && npm run typecheck && npm run build`（Worker build 为 dry-run，不部署）。
2. 获得本批授权后推送 Git 并先部署 Worker，确保 shopId/2.1 分类适配入口存在。
3. 用户通过 SHOPLINE CLI 构建/预览并发布整个主题扩展，包含 compatibility，而不是只上传 JS/CSS。旧版 CLI 若不支持双目录，应按官方迁移指南使用支持该结构的 CLI；本次未全局安装或切换 CLI，也未调用发布命令。
4. 在真实 OS2.1 测试主题商品页添加 Multi-item Discounts，确认平台编译、资源返回与主题编辑器保存/替换。核对指定商品、手动分类、智能分类、分类新增/移出商品（等待缓存过期）、排除项、无订阅/过期、隐藏产品、缺货款式、五规格、主市场/其他市场、USD/JPY/CNY、移动/桌面、不同语言、一次加购、失败保留选择、主题购物车抽屉刷新。
5. OS3 主题用相同检查表复测，尤其分类上下文和指定商品优先。不将本地 mock API 成功记为真实平台验证。

## 2026-11-19 locales 优化的本地核验

- 同步/2.1渲染定向12项通过，36种语言发布文件及schema数据一致。完整主题套件83/84，唯一旧失败为 `unchanged default desktop and mobile configuration renders a usable widget`（实际圆角10px，旧断言8px）；没有修改用户默认配置来满足旧断言。`theme:check`、Node脚本语法、现有OS3 SLine校验通过。为审核完整待提交批次，重新执行Worker全量49文件/429项通过、类型检查通过、dry-run构建通过。
- Browser plugin not available，使用已有Playwright 1.62.1与本机独立无头Chrome（没有下载浏览器或操作用户标签页）。本地 `http://127.0.0.1` 受控服务加载实际兼容模板、JS/CSS与模拟活动；英文/简体中文、1440×1000和390×844四组完成页面标题、非空、无错误遮罩、控制台、截图与档位切换检查，无运行错误或横向溢出。切换两件档到单件档，金额从31.98变为19.99，中文金额前缀按当前语言显示为US$。此验证未向真实店铺发送购物车写请求。
- 对照采用优化前模板结构及未改动的i18n翻译源，本地产物与参考无可见布局差异；手机图像素相同，桌面图仅有51/57个颜色通道采样差异（总4903200），不宣称桌面PNG逐字节相同。已查看中文桌面参考及修改后的桌面/手机截图。
- 证据仅保存在本机：`/private/tmp/kaching-os21-locales-{en,zh-hans-cn}-{reference,updated}-{desktop,mobile}.png`，检查记录 `/private/tmp/kaching-os21-locales-qa.json`，完整主题日志 `/private/tmp/kaching-os21-locales-theme-tests.log`。本次为资源格式修正，真实平台编译和语言回退依旧待验收。

官方依据：[双版本迁移指南](https://developer.shopline.com/docs/online-store-3-0-themes/integrate-apps-with-themes/theme-app-extension/migration-guide-from-os-2-1-to-os-3-0.md)、[Handlebars product](https://developer.shopline.com/docs/handlebars/objects/product.md)、[variant](https://developer.shopline.com/docs/handlebars/objects/variant.md)、[shop](https://developer.shopline.com/docs/handlebars/objects/shop.md)。Admin REST 使用 SHOPLINE AI Suite 打包 OAS 核实 GET /products/collects.json 的 product_id、limit、page_info、collects 与 Link。旧 OS2.1 framework 文档链接已返回 404；本地标准 Handlebars 编译和 schema JSON 解析不能替代 SHOPLINE 平台编译。

## 已批准提交清单

包含此前尚未提交的OS2.1兼容实现与本次locales优化，共52份文件（47新增、5修改；无已跟踪文件删除）。用户已明确批准推送并部署Worker，SHOPLINE扩展由用户自行发布。提交说明 `feat(theme): add OS2.1 compatibility with version-specific locales`，当前分支 `main`。

```text
修改 docs/APP_PROGRESS.md
修改 package.json
修改 theme-app-extension/public/app-block.js
修改 worker/src/db/sessions.ts
修改 worker/src/routes/storefront.ts
新增 docs/THEME_OS21_COMPATIBILITY.md
新增 docs/superpowers/plans/2026-11-19-theme-os21-compatibility.md
新增 scripts/sync-theme-compatibility.mjs
新增 tests/theme-app-extension/compatibility-sync.test.mjs
新增 tests/theme-app-extension/helpers/os21-fixture.mjs
新增 tests/theme-app-extension/os21.test.mjs
新增 theme-app-extension/compatibility/assets/app-block.css
新增 theme-app-extension/compatibility/assets/app-block.js
新增 theme-app-extension/compatibility/blocks/app-block.html
新增 theme-app-extension/compatibility/locales/ar.json
新增 theme-app-extension/compatibility/locales/bg.json
新增 theme-app-extension/compatibility/locales/cs.json
新增 theme-app-extension/compatibility/locales/da.json
新增 theme-app-extension/compatibility/locales/de.json
新增 theme-app-extension/compatibility/locales/el.json
新增 theme-app-extension/compatibility/locales/en.json
新增 theme-app-extension/compatibility/locales/es.json
新增 theme-app-extension/compatibility/locales/et.json
新增 theme-app-extension/compatibility/locales/fi.json
新增 theme-app-extension/compatibility/locales/fr.json
新增 theme-app-extension/compatibility/locales/hi.json
新增 theme-app-extension/compatibility/locales/hr.json
新增 theme-app-extension/compatibility/locales/hu.json
新增 theme-app-extension/compatibility/locales/id.json
新增 theme-app-extension/compatibility/locales/it.json
新增 theme-app-extension/compatibility/locales/ja.json
新增 theme-app-extension/compatibility/locales/ko.json
新增 theme-app-extension/compatibility/locales/lt.json
新增 theme-app-extension/compatibility/locales/lv.json
新增 theme-app-extension/compatibility/locales/ms.json
新增 theme-app-extension/compatibility/locales/nb.json
新增 theme-app-extension/compatibility/locales/nl.json
新增 theme-app-extension/compatibility/locales/pl.json
新增 theme-app-extension/compatibility/locales/pt-br.json
新增 theme-app-extension/compatibility/locales/pt-pt.json
新增 theme-app-extension/compatibility/locales/ro.json
新增 theme-app-extension/compatibility/locales/ru.json
新增 theme-app-extension/compatibility/locales/sk.json
新增 theme-app-extension/compatibility/locales/sl.json
新增 theme-app-extension/compatibility/locales/sv.json
新增 theme-app-extension/compatibility/locales/th.json
新增 theme-app-extension/compatibility/locales/tr.json
新增 theme-app-extension/compatibility/locales/vi.json
新增 theme-app-extension/compatibility/locales/zh-hans-cn.json
新增 theme-app-extension/compatibility/locales/zh-hant-tw.json
新增 worker/src/services/storefront-collections.ts
新增 worker/test/storefront-os21.test.ts
```

保留并排除用户原有的 `web/test/feedback-board.test.mjs`、`web/qa-preview-stock.html`、`web/qa-preview-stock.tsx`；本地QA截图和临时脚本不提交。
