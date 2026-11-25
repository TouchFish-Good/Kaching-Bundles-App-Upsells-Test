# 最终审阅修复：实际本地浏览器证据

2026-11-26（保留25日任务名称）。全部使用合成商品、认证API响应与native目录fixture，不读取或写入真实商家/购物车。现有Playwright Chromium headless-shell1248，无依赖安装。14PNG + browser-evidence.json，早期Task7和Task4/5截图仍保留作为历史对照。

- `merchant-settings-1440.png` / `390`：实际CampaignEditor展开捆绑，设置/样式页签，固定减免的市场模式与金额，JPY123及混币市场禁用指定金额。整panel截图可能含原编辑器固定底栏；`merchant-market-1440.png` / `390`提供无遮挡的实际市场控件局部。
- `merchant-style-1440.png` / `390`：实际样式页签与桌面/移动样式控件；切换回Settings保留JPY123。未改现有标题行设计；参考为 `docs/reference/screenshots/gifts-bundles-section-toggle-reference.png`（只包含header）。
- `react-carousel-1440.png` / `390`，`theme3-carousel-1440.png` / `390`，`theme2.1-carousel-1440.png` / `390`：实际React或当前主题资源的单行轮播。OS2.1执行真实Handlebars模板的既有local helpers；OS3执行native DOM合同fixture，均不代表真实平台编译。
- `react-rtl-390.png` / `theme-rtl-390.png`：继承RTL方向的实际负scrollLeft行为。
- `browser-evidence.json`：两种宽度市场/页签、6种主轮播和2种RTL实际结果。轮播轨道方向键、首尾边界按钮、嵌套select不preventDefault、首/尾焦点卡可见、原生变更后焦点保留、焦点仍在select时手动滚动不被锁住。该JSON仅在整次脚本成功结束时写入。

无捆绑数量输入、每规则一个款式槽、原生checkbox和赠品无Included保持；没有实店/结账/全应用验收声明。未知非主市场Admin预览价格仍不可用，市场金额配置不代表平台收费已验证。完整命令/RED/GREEN与早期QA问题见ignored任务目录final-fix-report.md和机器审计JSON。
