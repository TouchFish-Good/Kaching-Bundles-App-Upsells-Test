# Per-Campaign Quantity Breaks Appearance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让每个多件优惠活动独立保存外观与规格行为，并使预览、主题组件及可发布的 Function 规则保持一致。

**Architecture:** 服务端活动记录持有经过严格校验的 `widget` 配置；前端编辑器把同一配置草稿传给实时预览并随活动保存。视觉设置只进入主题展示，`allowMixedVariants` 单独进入版本化 Function 规则。平台输入不提供稳定 Variant ID 时阻止关闭混购活动的发布，不伪装为已支持。

**Tech Stack:** React 18、TypeScript、CSS Modules、Node/Express/SQLite、Go SHOPLINE Product Discount Function、SHOPLINE Theme App Extension、Node test runner。

**Spec:** `docs/superpowers/specs/2026-10-15-per-campaign-widget-style-design.md`

## Global Constraints

- 只在 `/Users/SL/Desktop/Kaching Bundles App & Upsells New/bundles-app-upsells-new` 工作；保留当前工作树里所有非本计划改动，执行前依 `superpowers:using-git-worktrees` 建立隔离工作树，并核对未提交的 `web` 本地化批次如何保留。
- `widget` 为活动独立配置，无全局外观继承；旧记录缺字段时使用稳定默认值，不在读取时写回 SQLite。
- 色值仅接受 `#RRGGBB`；卡片圆角 0–24px、间距 0–32px、图片尺寸 10–96px、图片圆角 0–24px；正文 12–20px，区块标题/档位标题/价格 12–28px，副标题/标签 10–20px。
- 图片和对应可点击按钮的尺寸下限均为 10px，不强制 44px 命中区；图片容器、裁切层与选中边框圆角一致。10px 点击目标有触屏误点风险，不能标为触控无障碍已达标；保留可见键盘焦点与可访问名称。
- 无“显示库存状态”设置，也不显示“剩余 X 件”；售罄禁用、库存验证及失败反馈必须保留。
- `allowMixedVariants=false` 时 Function 必须按稳定 Variant ID 独立计数；无法证明该 ID 可用时不得发布关闭混购的活动。旧规则继续按同 Product 跨 Variant 合计。
- 保留既有 11 种后台语言与前台文案回退规则；不开发截图中的免费赠品或胶囊色板。
- 不连接或更改真实商店活动，不部署、不推送，除非获得当前操作的明确授权。

## Review Focus

1. 旧活动没有 `widget` 或带历史未知字段：读取不丢业务数据，默认样式一致，保存不会静默覆盖未知字段。（Task 1）
2. 图片和按钮 10px、标签长译文、390px 窄屏：命中区、圆角、换行和布局均不裁切。（Task 3）
3. 同 Variant 分成多条购物车行、不同 Variant 的商家 SKU 文本相同：关闭混购只按可靠 Variant ID 合计，不能按 SKU 文本或行 ID。（Task 5）
4. 切换布局/设备或编辑颜色后：已选数量档与每件规格不丢失，保存失败后草稿仍可恢复。（Task 2、Task 3）
5. 活动配置已保存但平台折扣更新失败：展示“未同步”，结账仍以旧规则为准，绝不显示发布成功。（Task 6）

## 文件边界

- `app/src/service/campaign/widget-config.ts`：服务端默认值、规范化与严格校验；`app/src/service/campaign/model.ts`、`validate.ts` 引用强类型。
- `web/src/prototype/widget-config.ts`：前端类型、默认值与控件范围；`model.ts`、`campaign-adapter.ts` 双向传递。两端以同一 JSON fixture 的合同测试防止漂移，不增加新的运行时共享包。
- `web/src/prototype/CampaignStyleEditor.tsx`：仅处理活动级设置表单；`CampaignEditor.tsx` 负责保存、预览和错误定位。
- `web/src/prototype/StorefrontWidget.tsx`、`variant-display.js`、`web/src/pages/quantity-breaks.module.css`：四布局与图片/库存表现；不复制折扣计算。
- `web/src/prototype/navigation.ts`、`web/src/pages/quantity-breaks.tsx`：移除全局入口并兼容旧 URL。
- `app/src/service/campaign/discount-adapter.ts` 与 `product-discount-customizations/{input.graphql,discount.go,discount_test.go}`：仅业务布尔值进入 Function JSON；颜色与字体不能进入规则。
- `theme-app-extension/blocks/app-block.html` 与 `public/app-block.{js,css}`：真实商品页主题接入；以平台合同门槛为前提。

## Task 1: 活动级配置合同与持久化

**Files:**
- Create: `app/src/service/campaign/widget-config.ts`, `web/src/prototype/widget-config.ts`, `app/test/fixtures/campaign-widget-config.json`
- Modify: `app/src/service/campaign/model.ts`, `app/src/service/campaign/validate.ts`, `web/src/prototype/model.ts`, `web/src/prototype/campaign-adapter.ts`
- Test: `app/test/campaign-domain.test.cjs`, `app/test/campaign-repository.test.cjs`, `web/test/campaign-adapter.test.mjs`

**Interfaces:** `defaultCampaignWidgetConfig(): CampaignWidgetConfig`; `normalizeCampaignWidgetConfig(raw: unknown): CampaignWidgetConfig`; `validateCampaignWidgetConfig(raw: unknown): string[]`。`CampaignDraft.widget` 与 `ServerCampaign.widget` 使用同名类型；前端 `toCampaignDraft(admin, original)` 返回最新 `admin.widget`。

默认 fixture 的确切值（两端读取相同值）：

```json
{
  "version": 1,
  "layout": "stacked",
  "card": { "radiusPx": 9, "gapPx": 8 },
  "colors": { "card": "#F7F7F7", "selected": "#FFFFFF", "border": "#171717", "sectionTitle": "#171717", "title": "#171717", "subtitle": "#555555", "price": "#171717", "comparePrice": "#666666", "badgeBackground": "#171717", "badgeText": "#FFFFFF" },
  "typography": { "bodyPx": 14, "sectionTitle": { "sizePx": 14, "weight": 700 }, "title": { "sizePx": 14, "weight": 700 }, "subtitle": { "sizePx": 12, "weight": 400 }, "price": { "sizePx": 14, "weight": 700 }, "badge": { "sizePx": 12, "weight": 600 } },
  "variants": { "allowMixedVariants": true, "showSelectors": true, "selectorStyle": "dropdown", "imageSizePx": 48, "imageRadiusPx": 6, "showImageColorValue": true, "defaultSelection": "first_available" },
  "showOriginalAndDiscountedPrice": true
}
```

- [ ] **Step 1: 写失败测试。** 从 fixture 读取完整配置；验证缺失 `widget` 得到默认值但原始 SQLite JSON 不被改写，10/96 图片合法、9/97 非法，`#123456` 合法而 `url(...)` 非法，未知键报错；前端适配器修改颜色后输出新值而非 `original.widget`。
  ```js
  assert.equal(normalizeCampaignWidgetConfig(undefined).variants.imageSizePx, 48);
  assert.ok(validateCampaignWidgetConfig({ ...fixture, colors: { ...fixture.colors, card: 'url(x)' } }).length);
  assert.equal(toCampaignDraft({ ...admin, widget: { ...admin.widget, colors: { ...admin.widget.colors, card: '#123456' } } }, original).widget.colors.card, '#123456');
  ```
- [ ] **Step 2: 验证红灯。** 运行 `node --test app/test/campaign-domain.test.cjs app/test/campaign-repository.test.cjs` 和在 `web` 运行 `node --test test/campaign-adapter.test.mjs`；预期新断言因配置接口不存在或仍转发旧值而失败。
- [ ] **Step 3: 实现最小合同。** fixture 写完整 `version:1`、四布局、十个颜色、五组字重/字号和规格字段。前后端按 spec 类型读取；`normalizeCampaignWidgetConfig(undefined)` 返回深拷贝默认值；已存在但含未知键的旧配置拒绝静默转换，返回可诊断错误。`validateCampaign` 把 `widget` 错误并入活动错误。
  ```ts
  const imageSize = raw.variants.imageSizePx;
  if (!Number.isInteger(imageSize) || imageSize < 10 || imageSize > 96) errors.push('Image size must be 10–96px.');
  if (!/^#[0-9a-fA-F]{6}$/.test(raw.colors.card)) errors.push('Card color must be #RRGGBB.');
  ```
- [ ] **Step 4: 绿灯及提交。** 重跑上述测试，再运行 `npm run test:prototype`（`web`）、`npm test` 与 `npm run build`（`app`）。如服务端测试仍因本机 `node-fetch` ESM 解析失败，记录具体失败项，不标通过。只提交本任务文件，建议 commit `feat: persist validated campaign widget settings`。

## Task 2: 活动编辑页样式设置与路由收敛

**Files:**
- Create: `web/src/prototype/CampaignStyleEditor.tsx`
- Modify: `web/src/prototype/CampaignEditor.tsx`, `web/src/prototype/navigation.ts`, `web/src/pages/quantity-breaks.tsx`, `web/src/locales/{en,fr,de,es,it,nl,sv,tr,pt-BR,zh-Hans,zh-Hant}.json`
- Test: `web/test/editor-structure.test.mjs`, `web/test/workspace-navigation.test.mjs`, `web/test/admin-dictionaries.test.mjs`, `web/test/campaign-adapter.test.mjs`

**Interfaces:** `CampaignStyleEditor({ value, onChange }: { value: CampaignWidgetConfig; onChange(next: CampaignWidgetConfig): void })`；`CampaignEditor` 初始化 `campaign?.widget ?? defaultCampaignWidgetConfig()`，提交时传入当前 `widget`。

- [ ] **Step 1: 写失败测试。** `toCampaignDraft` 往返两活动各自配置；编辑器 HTML 显示四布局、颜色分组、字体大小/粗细、间距/圆角、规格设置且没有“显示库存状态”；旧 `/quantity-breaks/widget` 解析为概览重定向；11 字典键一致。
  ```js
  assert.notDeepEqual(toCampaignDraft(first).widget.colors, toCampaignDraft(second).widget.colors);
  assert.equal(readWorkspaceLocation('/quantity-breaks/widget').page, 'dashboard');
  assert.doesNotMatch(renderedEditor, /Show stock status|显示库存状态/);
  ```
- [ ] **Step 2: 验证红灯。** 在 `web` 运行 `node --test test/editor-structure.test.mjs test/workspace-navigation.test.mjs test/admin-dictionaries.test.mjs test/campaign-adapter.test.mjs`；预期活动设置/旧路由断言失败。
- [ ] **Step 3: 实现表单。** 以受控字段更新 `widget` 草稿，不维护平行 `accent`、`selectorStyle`、`widgetFontSize` 状态；颜色用取色器加 HEX 输入并即时校验。布局用 `role="radiogroup"` 与四个可访问单选按钮；滑条与数值输入使用同一范围。禁用隐藏选择器的发布条件在商品范围校验处执行，不阻止保存草稿。移除侧栏全局入口与 `WidgetStudio`，旧 URL 使用 `history.replaceState` 导向 `/quantity-breaks`，保留“翻译”入口。
  ```tsx
  <CampaignStyleEditor value={widget} onChange={setWidget} />
  <StorefrontWidget config={widget} tiers={tiers} device={device} notify={notify} />
  ```
- [ ] **Step 4: 绿灯及提交。** 运行任务测试、`npm run test:prototype`、`npm run build`。浏览器分别创建与编辑草稿，保存刷新后检查配置恢复；错误时保留输入。仅提交本任务文件，建议 commit `feat: edit widget style per campaign`。

## Task 3: 预览布局、图片圆角与库存显示

**Files:**
- Modify: `web/src/prototype/StorefrontWidget.tsx`, `web/src/prototype/variant-display.js`, `web/src/pages/quantity-breaks.module.css`, `web/src/prototype/CampaignEditor.tsx`
- Test: `web/test/variant-display.test.mjs`, `web/test/slot-selection.test.mjs`, `web/test/widget-layout.test.mjs`

**Interfaces:** `StorefrontWidget` 消费 Task 1 的 `CampaignWidgetConfig`；`normalizeImageTileSize(10) === 10`；四布局共用同一组档位/Variant 状态，不复制计价和加购函数。

- [ ] **Step 1: 写失败测试。** 检查 10px 图片归一化、售罄选项禁用但无剩余数量、同 Variant 库存超限仍阻止加购；四个布局输出共享的档位数量和同一折扣摘要；切换 `layout` 不卸载槽位状态。用 390px 浏览器量测每个图片按钮的 `getBoundingClientRect()` 宽和高均至少 10px，`documentElement.scrollWidth <= innerWidth`。
  ```js
  assert.equal(normalizeImageTileSize(10), 10);
  assert.equal(createVariantImageTiles([{ id:'v', available:false, inventory:0, image:'/v.jpg', color:'Red', size:'M' }])[0].disabled, true);
  assert.doesNotMatch(renderToStaticMarkup(widget), /\d+ left/);
  ```
- [ ] **Step 2: 验证红灯。** 在 `web` 运行 `node --test test/variant-display.test.mjs test/slot-selection.test.mjs test/widget-layout.test.mjs`；预期旧尺寸下限或库存标签断言失败。
- [ ] **Step 3: 实现视觉。** 用 `data-layout={config.layout}` 与 CSS Modules 的四个布局类重排相同档位节点；颜色和字体由严格校验后的 CSS 自定义属性传入。图片按钮最小 10px、图片承载层 `border-radius` 加 `overflow:hidden`，选中边框使用与外层相容的半径。删除 `showStock` 分支及库存数字标签，但保留售罄/库存不足错误。独立预览只读取当前活动 `widget`。
  ```css
  .tierChoices[data-layout="grid"] { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:var(--card-gap); }
  @media (max-width:767px) { .tierChoices[data-layout="grid"] { grid-template-columns:minmax(0,1fr); } }
  .imageTile { min-width:10px; min-height:10px; }
  .imageTile img { border-radius:var(--image-radius); clip-path:inset(0 round var(--image-radius)); }
  ```
- [ ] **Step 4: 绿灯、视觉核验及提交。** 运行 `npm run test:prototype`、`npm run build`；保留 1440/768/390px 同视口截图，检查四布局、长法语/德语文案、缺图及售罄图。更新 `docs/APP_PROGRESS.md` 但只标已验证项目；仅提交本任务文件，建议 commit `feat: render campaign-specific widget layouts`。

## Task 4: Function Variant 标识能力门槛

**Files:**
- Modify only after evidence: `product-discount-customizations/input.graphql`, generated Function models
- Test: `product-discount-customizations/discount_test.go`
- Document: `docs/SHOPLINE_API_RESEARCH.md`, `docs/APP_PROGRESS.md`

**Interfaces:** 输出 `VariantIdentityEvidence`：平台 schema 中稳定 Variant ID 字段的确切路径、生成模型对应字段、真实输入样本和适用版本；缺一项视为能力未确认。若确认可用，在 Go 中提供 `variantIdentity(line *module.CartLineInput) (string, bool)`，`bool=false` 表示缺失或无效。此函数只能读取确认过的生成字段。

- [ ] **Step 1: 验证现状。** 运行 `rg -n 'type ProductVariantInput|id:|skuCode' product-discount-customizations/schema.gql product-discount-customizations/module/models.go` 和 `sed -n '1,30p' product-discount-customizations/input.graphql`；记录当前输入缺少稳定 Variant ID。使用 SHOPLINE 官方 Function 文档、项目 schema 和授权开发店测试输入三方核对，不以 `sku`、`skuCode` 或 cart line ID 替代。
- [ ] **Step 2: 证实或阻断。** 若官方 schema 与实际运行输入均提供稳定 Variant ID，在查询中加入**文档确认的字段路径**并重新生成模型，测试同 Variant 拆行仍得到同一 ID。若缺失，保留查询不变，在发布入口阻止 `allowMixedVariants=false`，错误文案说明“Function 输入缺少可靠 Variant ID”；把本任务标记 `BLOCKED`，停止 Task 5 的关闭混购实现并征求商家方向。
  ```ts
  if (!variantIdentityVerified && campaign.widget.variants.allowMixedVariants === false) {
    throw new Error('Cannot publish same-variant tiers: SHOPLINE Function input lacks a verified Variant ID.');
  }
  ```
- [ ] **Step 3: 记录证据并提交。** 文档列出官方资料地址、schema 字段、生成模型、真实输入脱敏样本与结果；不得写 API 密钥或真实用户资料。验证 `go test ./...`；只提交证据/必要查询与测试，建议 commit `docs: verify variant identity for discount function`。能力未确认时 Task 5 的关闭混购路径不得执行。

## Task 5: 版本化 Function 规则与计数

**Prerequisite:** Task 4 已证明稳定 Variant ID 并核对生成模型字段；否则本任务保持 `BLOCKED`，不猜字段。

**Files:**
- Modify: `app/src/service/campaign/discount-adapter.ts`, `product-discount-customizations/discount.go`, `product-discount-customizations/discount_test.go`
- Test: `app/test/campaign-discount-adapter.test.cjs`, `product-discount-customizations/discount_test.go`

**Interfaces:** `buildDiscountRule(campaign, currency)` 仅加入 `allowMixedVariants` 并升级 `schemaVersion`；Go Function 旧版规则默认 `true`，新版必须显式布尔值。Variant 组键使用 Task 4 验证的字段，不使用商家 SKU 字符串。

- [ ] **Step 1: 写失败测试。** 旧 v1 规则 A×1+B×2 命中 3 件档；v2 `true` 同结果；v2 `false` 不命中 3 件档、B×2 可命中 2 件档；同 Variant 拆为两行各 1 件时命中 2 件档且输出两条 `CartLineTarget`；不同 Product 不合计。服务端规则断言不包含颜色、字体、图片配置。
  ```go
  // Given: A×1, B×2; tiers 2 and 3; allowMixedVariants=false.
  // Want: B targets receive tier 2; A receives no tier 3 discount.
  // Given: B split into two cart lines of quantity 1 each.
  // Want: both B lines receive the tier 2 discount.
  ```
- [ ] **Step 2: 验证红灯。** 运行 `go test ./...`（`product-discount-customizations`）及 `node --test app/test/campaign-discount-adapter.test.cjs`；预期 v2 规则/关闭混购测试失败。
- [ ] **Step 3: 实现最小逻辑。** 解析旧 v1 与新 v2；v2 拒绝缺失布尔值。按 `allowMixedVariants` 选择 Product ID 或已证实的 Variant ID 为组键；档位选择、每行按实际单价计算和金额舍入继续复用现有代码。先部署兼容 v1/v2 的 Function，再允许新的关闭混购规则发布；平台更新失败保留“未同步”状态，不能假成功。
  ```go
  groupKey := productID
  if !rule.AllowMixedVariants {
      variantID, ok := variantIdentity(line)
      if !ok { return candidate{}, false }
      groupKey = variantID
  }
  quantities[groupKey] += *line.Quantity
  groups[groupKey] = append(groups[groupKey], line)
  ```
- [ ] **Step 4: 绿灯及提交。** 运行 `go test ./...`、`npm test` 与 `npm run build`（`app`）；测试市场指定金额、旧 v1 兼容、混合币种拒绝和同 SKU 不同价格。只提交本任务文件，建议 commit `feat: enforce per-campaign variant mixing in function`。

## Task 6: 主题组件消费活动样式

**Prerequisite:** SHOPLINE Theme Extension 的商品上下文、公开活动接口、商品/Variant 价格与库存来源、购物车原子批量加购合同已在开发店和官方文档核实；不满足则保持 `BLOCKED`，保留模板而不猜运行时字段。

**Files:**
- Create: `app/src/controller/public-widget.ts`, `app/test/public-widget.test.cjs`
- Modify: `app/src/index.ts`, `theme-app-extension/blocks/app-block.html`, `theme-app-extension/public/app-block.js`, `theme-app-extension/public/app-block.css`, `theme-app-extension/i18n/*.json`, `docs/SHOPLINE_API_RESEARCH.md`
- Test: `app/test/public-widget.test.cjs`，及开发店主题/购物车端到端记录

**Interfaces:** 公开接口 `GET /api/quantity-breaks/public-widget?productId=<verified-id>&locale=<locale>` 只返回当前店铺、当前时间、匹配 Product 的已发布活动、经过校验的 `CampaignWidgetConfig` 与前台文案；店铺身份必须来自已验证的主题接入机制，不能信任任意查询参数。无匹配时返回 `204`。Theme JS 只消费此只读合同，不获得管理 token。

- [ ] **Step 1: 写失败测试。** 对未鉴权跨店请求拒绝；Draft/Paused/Ended/未同步活动返回 204；已启用且商品命中的活动返回独立样式、档位与 locale 文案，不返回 token/管理字段。主题 DOM 测试不同 Variant 独立选择、同 ID 合并数量、缺货禁用、10px 图片及对应按钮可点。
  ```js
  assert.equal(response.status, 204); // no published campaign for product
  assert.deepEqual(addItems, [{ id: 'variant-A', quantity: 2 }, { id: 'variant-B', quantity: 1 }]);
  assert.ok(!JSON.stringify(publicPayload).includes('accessToken'));
  ```
- [ ] **Step 2: 验证红灯。** 运行 `node --test app/test/public-widget.test.cjs`；预期公开路由不存在。真实主题测试先仅在授权开发店运行，记录主题模板可用的确切商品/店铺上下文字段，不使用猜测的 `{{ product.id }}`。
- [ ] **Step 3: 实现只读接口与主题渲染。** 控制器复用按店铺隔离的 repository，只选已发布且排期有效的活动；主题 JS 根据返回的配置渲染四布局及共享规格槽位。按照**已验证的**购物车批量接口一次提交按 Variant ID 聚合的项目；网络或库存失败保留已选状态并显示失败，不宣称全部成功。无法从主题证明店铺身份时不开放公共接口，保持 `BLOCKED`。
  ```ts
  const items = Object.values(selected.reduce<Record<string, { id: string; quantity: number }>>((out, id) => {
    out[id] = { id, quantity: (out[id]?.quantity ?? 0) + 1 }; return out;
  }, {}));
  // POST body shape and URL come only from verified SHOPLINE cart contract.
  ```
- [ ] **Step 4: 绿灯、真实联调及提交。** 跑服务端测试/构建、主题校验命令（按已安装 SHOPLINE CLI）、1440/768/390px 截图与控制台检查；在授权开发店验证主题安装、库存错误、原子加购、购物车与结账优惠。只提交本任务文件，建议 commit `feat: render per-campaign widget in theme extension`。

## Task 7: 全链路回归与文档验收

**Files:**
- Modify: `docs/APP_PROGRESS.md`, `docs/APP_GAP_ANALYSIS.md`, `docs/REQUIREMENTS.md`, `docs/DESIGN_SPEC.md`, `docs/USER_FLOWS.md`, `docs/COMPONENTS.md`
- Test: `web/test/*.test.mjs`, `app/test/*.test.cjs`, `product-discount-customizations/discount_test.go`

**Interfaces:** 每项需求映射至页面/字段/服务/Function/主题/测试；未达成的平台条件标 `BLOCKED`，只通过本地原型则标 `IN_PROGRESS`，不标 `VERIFIED`。

- [ ] **Step 1: 补失败回归。** 运行完整前端、服务端、Go 套件，记录旧全局入口/库存开关是否残留，活动 A/B 配置是否串写；检查 1/2/3/4/5 件、不同 Variant 价格与市场固定金额的预期结果。
  ```bash
  npm run test:prototype --workspace web
  npm test --workspace app
  cd product-discount-customizations && go test ./...
  ```
- [ ] **Step 2: 补齐实际遗漏。** 仅修复本计划范围内的失败；涉及无法访问平台合同或真实商店数据的项保留 `BLOCKED` 与原因，不以假数据替代。
- [ ] **Step 3: 视觉及功能核验。** 对照已获许可的参考截图，在 1440/768/390px 对创建、编辑、四布局、缺货、长译文、颜色边界、保存/错误状态存档；测键盘操作、焦点、触摸命中区。更新六份文档的现状与要求，不把截图一致当成功能完成。
- [ ] **Step 4: 最终检查及提交。** 运行 `npm run build --workspace web`、`npm run build --workspace app`、全套测试、`git diff --check` 与秘密扫描；只提交已审查的文档/测试变更，建议 commit `test: verify campaign-specific widget settings`。按 `AGENTS.md` 汇报文件、内容、commit 和目标分支，明确询问是否推送；未经批准不推送。

## 执行门槛

先让商家确认本计划。执行时逐 Task 红灯→绿灯→自查→提交；Task 4 的 Variant ID 与 Task 6 的主题上下文/批量加购均是硬门槛。某门槛不成立时停止依赖该门槛的开发，向商家汇报证据并修订设计/计划；已完成的活动级 UI 和草稿保存可独立交付，但不得称整个多件优惠闭环已经完成。
