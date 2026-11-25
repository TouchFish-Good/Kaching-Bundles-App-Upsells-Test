# Quantity Breaks 后台外壳、店铺身份与 11 语言实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用真实店铺身份和活动数据替换嵌入式后台的演示状态，并提供 11 种后台界面语言及简洁的桌面布局。

**Architecture:** 服务端沿用 `/api/*` 的 SHOPLINE 会话鉴权，代理只读店铺资料；前端用店铺隔离的状态加载身份与活动。后台 i18next 字典和商家配置的前台 Widget 译文保持独立，桌面移除应用内部顶栏，移动端保留导航入口。

**Tech Stack:** Express/TypeScript、React/TypeScript、i18next、CSS Modules、SQLite、Node test runner、Vite。

**Spec:** `docs/superpowers/specs/2026-10-14-admin-shell-store-identity-localization-design.md`

## Global Constraints

- 后台语言代码必须是 `en/fr/de/es/it/nl/sv/tr/pt-BR/zh-Hans/zh-Hant`，不得把后台语言选择写入前台翻译存储。
- 店铺身份只从鉴权的 SHOPLINE Admin 会话读取；不得将 access token 或原始 Admin 响应送到浏览器。
- `GET /merchants/shop.json` 已确认的字段为 `data.id`、`data.name`、`data.standard_logo`；真实店铺 Logo URL/CSP 仍待开发店验证。
- 当前 `app/src/admin-read/` 和其他未提交修改属于现有工作；先读 diff，复用可验证代码，不覆盖、不顺带提交。
- 删除 `Demo data` 等标识时，不得把内存 `campaignData` 继续当作已连接店铺的真实活动。
- 现有 Campaign API 拒绝 `active`/`scheduled` 发布；本计划不绕过该限制，也不修改 Function、购物车、结账或主题扩展。
- 不接入或修改真实线上店铺；开发店端到端测试需单独授权。未经本批明确同意不得 `git push`。

## Review Focus

- 会话切换店铺时，旧店铺的名称、Logo、活动和语言选择不得短暂显示；Task 1、2、3 分别测试。
- `standard_logo` 为空、非 HTTPS 或图片加载失败时，必须显示中性图标而不是破图或虚构 Logo；Task 1 测试。
- 活动 API 401/500、编辑保存 409 冲突时，不能显示成功或丢失草稿；Task 2 测试。
- 长翻译、占位符及 200% 缩放时，按钮和输入框不能遮挡；Task 3、4 测试。
- 后台切换语言时，创建/编辑草稿及商家保存的前台译文不能变化；Task 3 测试。

---

### Task 1: 鉴权店铺身份与侧栏展示

**Files:**
- Inspect without overwriting: `app/src/admin-read/shop-identity.ts`, `app/src/index.ts`, `app/test/shop-identity.test.js`
- Create: `app/src/controller/shop-identity.ts`, `app/test/shop-identity-api.test.cjs`, `web/src/prototype/shop-identity-api.ts`, `web/test/shop-identity-api.test.mjs`
- Modify: `app/src/admin-read/shop-identity.ts`, `app/src/index.ts`, `web/src/pages/quantity-breaks.tsx`, `web/src/pages/quantity-breaks.module.css`

**Interfaces:**
- `parseShopIdentity(body: unknown, handle: string): { storeId: string; displayName: string; logoUrl: string | null }`，只接受非空 ID/名称；Logo 仅接受 HTTPS URL，空或不合法为 `null`。
- `fetchShopIdentity(handle: string, accessToken: string)` 返回同一类型，调用已确认的 `GET /merchants/shop.json`；执行前核对现有 API 版本和未提交实现，不盲改 URL。
- `GET /api/quantity-breaks/shop` 响应 `{ shop: ShopIdentity }`；401 返回 `{ error: 'AUTH_REQUIRED' }`，上游失败返回 `{ error: 'SHOP_UNAVAILABLE' }`，不得回传 token 或原始错误对象。
- `readShopIdentity(fetcher = fetch): Promise<ShopIdentity>`，非 2xx 抛出含稳定错误码的 `ShopIdentityError`。

- [ ] **Step 1: 写 RED 测试。** 在服务端测试断言 `standard_logo: ''` 和 `http://...` 均映射 `null`、空白名称拒绝、401 不调用 Admin、成功响应仅含三个公开字段且不含 token；前端测试断言 401/500 分类与有效响应解析。示例：

```js
assert.deepEqual(parseShopIdentity({ data: { id: '7', name: 'Store', standard_logo: '' } }, 'shop'), { storeId: '7', displayName: 'Store', logoUrl: null });
assert.throws(() => parseShopIdentity({ data: { id: '7', name: ' ' } }, 'shop'), /name/i);
```

- [ ] **Step 2: 验证 RED。** 运行 `cd app && node --test -r ts-node/register test/shop-identity.test.js test/shop-identity-api.test.cjs` 和 `cd web && node --test test/shop-identity-api.test.mjs`；预期新增断言因缺少字段/模块失败。
- [ ] **Step 3: 最小实现。** 在现有 `fetchShopIdentity` 上补齐经过校验的 `standard_logo`；控制器仅从 `response.locals.shopline.session` 取 handle/token；在 `/api/*` 鉴权中间件之后注册 GET 路由。前端以 `loading | ready | error` 状态读取，在侧栏固定 34px 图标槽显示图片或 `<Store />`，`onError` 退回图标，名称用完整可访问文本/`title`，失败显示重试。
- [ ] **Step 4: 验证 GREEN。** 重跑上述测试与 `cd app && npm run build`、`cd web && npm run build`；新增一个切换 `storeId` 后立即隐藏旧身份的组件/状态测试。
- [ ] **Step 5: 检查改动边界。** `git diff` 核查未提交的 `admin-read` 内容只被目标字段扩展；仅在用户批准提交时 stage 本任务文件，拟 commit：`feat: show authenticated SHOPLINE store identity`。

### Task 2: 嵌入式活动真实读取与诚实的操作状态

**Files:**
- Inspect: `app/src/controller/campaigns.ts`, `app/src/service/campaign/model.ts`, `web/src/prototype/model.ts`, `web/src/prototype/CampaignEditor.tsx`
- Create: `web/src/prototype/campaign-api.ts`, `web/src/prototype/campaign-adapter.ts`, `web/test/campaign-api.test.mjs`, `web/test/campaign-adapter.test.mjs`
- Modify: `web/src/pages/quantity-breaks.tsx`, `web/src/prototype/CampaignEditor.tsx`, `web/src/pages/quantity-breaks.module.css`

**Interfaces:**
- `readCampaigns(fetcher = fetch): Promise<ServerCampaign[]>` 读取现有鉴权 `GET /api/quantity-breaks/campaigns`；`saveCampaign(draft, expectedRevision, fetcher = fetch)` 调用现有 POST/PUT，错误保留 HTTP 状态。
- `toAdminCampaign(server: ServerCampaign): Campaign` 必须逐项映射 `status`、`scope`、`tiers`、`startsAt/endsAt`、`revision`；如原型 `products/schedule/updated` 信息无法由服务端模型确定，显示明确的未配置或格式化真实值，禁止编造。
- `toCampaignDraft(admin: Campaign, original?: ServerCampaign): CampaignDraft` 映射折扣类型、市场覆盖与阶梯次序；不得静默丢弃服务器字段。若编辑器尚未支持某字段的无损回写，先禁用对应保存动作并显示具体原因。
- 服务端 `active`/`scheduled` 发布目前返回 409；UI 应说明尚不可用，不得将本地状态切换伪装成成功。

- [ ] **Step 1: 写 RED 测试。** 成功列表映射空数组与真实活动、401/500 错误、保存 409 保留草稿、同一活动不同 revision 冲突、店铺切换旧请求晚返回不覆盖新店数据；并断言生产入口不引用 `campaignData`。

```js
assert.deepEqual(toAdminCampaign({ id: 'a', name: 'Offer', status: 'draft', scope: { kind: 'all', excludedProductIds: [] }, tiers: [], revision: 2, updatedAt: '2026-10-14T00:00:00Z', combinesWith: { orderDiscounts: false, shippingDiscounts: false } }).status, 'Draft');
assert.equal(readFileSync('src/pages/quantity-breaks.tsx', 'utf8').includes('campaignData'), false);
```

- [ ] **Step 2: 验证 RED。** 运行 `cd web && node --test test/campaign-api.test.mjs test/campaign-adapter.test.mjs`；预期新测试先失败。
- [ ] **Step 3: 最小实现。** 页面按鉴权店铺身份加载活动；列表显示 loading/empty/error/retry。创建和编辑保存使用 API 与 revision，保存失败停留编辑页并保留输入。删除操作调用现有 DELETE 并在成功后刷新；启停按钮在发布合同缺失时禁用并说明原因，不能声称本地已启用。独立 fixture 若保留，只能从显式开发预览入口加载，并标明非店铺数据。
- [ ] **Step 4: 验证 GREEN。** 重跑测试、`cd web && npm run test:prototype && npm run build`；手动检查搜索、筛选、空列表、保存失败与浏览器后退；对未有端到端支持的编辑字段记录为 BLOCKED 而非可保存。
- [ ] **Step 5: 审核数据安全。** 确认无示例活动呈现为真实数据、无虚假成功 toast；仅在批准提交时 stage 本任务文件，拟 commit：`feat: load authenticated campaigns in admin`。

### Task 3: 十一种后台语言与前台译文隔离

**Files:**
- Create: `web/src/prototype/admin-locale.ts`, `web/src/locales/fr.json`, `de.json`, `es.json`, `it.json`, `nl.json`, `sv.json`, `tr.json`, `pt-BR.json`, `zh-Hans.json`, `zh-Hant.json`, `web/test/admin-locale.test.mjs`, `web/test/admin-dictionaries.test.mjs`
- Modify: `web/src/utils/i18n.ts`, `web/src/locales/en.json`, `web/src/pages/quantity-breaks.tsx`, `web/src/prototype/CampaignEditor.tsx`, `web/src/prototype/Translations.tsx`, `web/src/pages/quantity-breaks.module.css` and the directly used child controls that contain visible management copy.

**Interfaces:**
- `APP_LOCALES` 为规格中的固定 11 项；`resolveAdminLocale({ storeId, search, storage }): string` 优先读取 `quantity-breaks:admin-locale:<storeId>`，再匹配 `lang`，否则 `en`；无已验证 storeId 时不得读取别家店的键。
- `setAdminLocale(storeId: string, locale: string, storage: Storage): void` 只保存后台语言；`i18next.changeLanguage(locale)` 不调用 `writeTranslations`，也不改 Widget `locale`。
- 所有后台字典使用相同 key 与插值变量集合；前台 `StorefrontTranslations` 与 `/api/quantity-breaks/translations/:locale` 不变。

- [ ] **Step 1: 写 RED 测试。** 11 个 code 精确一致、店铺 A/B 持久化隔离、无效 `lang` 回退 `en`、全部字典 key/`{{placeholder}}` 集合一致；模拟在编辑草稿中切换语言，断言字段值与前台译文 API 调用次数不变。

```js
assert.deepEqual(APP_LOCALES, ['en','fr','de','es','it','nl','sv','tr','pt-BR','zh-Hans','zh-Hant']);
assert.equal(resolveAdminLocale({ storeId: 'b', search: '?lang=fr', storage }), 'fr');
```

- [ ] **Step 2: 验证 RED。** 运行 `cd web && node --test test/admin-locale.test.mjs test/admin-dictionaries.test.mjs`；预期缺少语言模块/字典时失败。
- [ ] **Step 3: 最小实现。** 从 `en.json` 建立管理文案 key，再逐语言填入真实译文；替换侧栏、概览、列表、编辑器、阶梯/市场、Widget Studio、翻译管理页及加载/错误/成功文本里的硬编码文案。侧栏加入有 `<label>` 的语言下拉；切换调用 `i18next.changeLanguage` 而不重挂编辑表单。前台预览保留独立语言值；服务端稳定错误码映射为本地化 UI 消息，未知码使用本地化通用错误。
- [ ] **Step 4: 验证 GREEN。** 重跑字典/隔离测试及 `cd web && npm run test:prototype && npm run build`；逐页切换 `de`、`fr`、`pt-BR`、`zh-Hant` 检查最长文案、未保存编辑值、Toast 和翻译页两套语言控件。
- [ ] **Step 5: 审核译文边界。** 对比切换前后前台翻译 API payload 和折扣草稿，必须相同；仅在批准提交时 stage 本任务文件，拟 commit：`feat: localize quantity breaks admin in eleven languages`。

### Task 4: 桌面外壳、移动导航与回归验收

**Files:**
- Modify: `web/src/pages/quantity-breaks.tsx`, `web/src/pages/quantity-breaks.module.css`, `docs/APP_PROGRESS.md`, `docs/VISUAL_GAP_REPORT.md`
- Create: `web/test/admin-shell.test.mjs` and desktop/mobile reference screenshots under the existing `docs/reference/screenshots/` convention.

**Interfaces:**
- 桌面断点沿用现有 CSS 的 `767px` 边界：`min-width: 768px` 无内部 topbar/空白占位；`max-width: 767px` 保留带 `aria-label`、焦点样式和关闭遮罩的菜单触发区。

- [ ] **Step 1: 写 RED 测试。** DOM/CSS 测试断言桌面不含 `Demo data`、`Store preview`、`Not connected` 字样及可见 topbar；移动菜单按钮可开关、遮罩可关闭，焦点可见；窄屏语言下拉不被覆盖。
- [ ] **Step 2: 验证 RED。** 运行 `cd web && node --test test/admin-shell.test.mjs`，预期旧顶栏和字样使测试失败。
- [ ] **Step 3: 最小实现。** 移除桌面 topbar 的结构与占位 CSS，只在移动断点显示菜单条；侧栏店铺名、语言选择和导航按 360px 与长译文留出尺寸；保留原有页面交互和样式基调。
- [ ] **Step 4: 浏览器回归。** 在同一版本的本地应用采集 1440px、390px 和 200% 缩放截图；验证店名加载/失败/空 Logo、活动加载/空/错误、编辑草稿切换语言、菜单键盘操作。开发店身份及嵌入会话需另行获授权实测，缺失时在进度文档标 `BLOCKED/未验证`，不得写 `VERIFIED`。
- [ ] **Step 5: 全量验证。** 运行 `cd app && npm test && npm run build`、`cd web && npm run test:prototype && npm run build`、`git diff --check`；检查文件清单和未跟踪文件，更新进度/差异报告。仅在用户批准提交时 stage 本批相关文件，拟 commit：`style: simplify responsive admin shell and verify states`。

## 执行与交付门槛

实施前阅读本计划和规格，先核对主工作树现有未提交改动；如用独立 worktree，不自动搬运、stash 或提交那些改动。每个任务先见 RED 再见 GREEN，提交前逐文件检查 diff。真实店铺接入与发布能力不在本计划内，不能用本地原型验证替代。计划完成后向用户展示修改文件、测试与未验证项，按 `AGENTS.md` 单独询问本批是否推送。
