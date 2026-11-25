# SHOPLINE 管理导航与目录选择 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除应用自建左侧栏与店铺信息权限，提供两个 SHOPLINE 导航路径，并让商品/分类草稿选择按 50 项分页、避免中文输入法中途搜索。

**Architecture:** 页面仍由现有 URL 路由渲染，管理头部承接应用语言选择。会话 handle 用作前端偏好隔离，安装登记的真实数字店铺 ID 改由已验签安装事件提供；商品和分类目录只通过服务端受鉴权代理访问 SHOPLINE。选择器只渲染一页，已选 ID 与列表页分离。

**Tech Stack:** React 18、TypeScript、Vite、Express、node-fetch、SQLite、Node test runner、SHOPLINE App Bridge。

**Spec:** `docs/superpowers/specs/2026-10-20-admin-navigation-catalog-pagination-design.md`

## Global Constraints

- SHOPLINE Admin REST 版本为 `v20260901`。商品、手动分类、智能分类目录请求单页 `limit=50`，浏览器不得指定上游 URL。
- 分类可选择、可保存草稿，不可发布；“全部商品”仍不可发布。`read_products` 保留。
- 只在可信来源存在真实 `store_id` 时写安装登记；handle 只能用于已鉴权应用数据和偏好隔离，不能伪造数字店铺 ID。
- 已有 `shopline.app.toml` 隧道地址、`theme-app-extension/public/app-block.css`、页面宽度/指标布局是用户工作区改动，必须逐行保留。产品代码和文档未经本批推送批准不暂存、提交或推送。
- 11 种现有后台语言保持覆盖。嵌入式反馈使用现有 App Bridge；不得记录令牌、完整上游响应或分页游标。

## Review Focus

- 老会话包含额外的 `read_store_information` 时仍能通过缩减后的必需 scope 校验；缺少 `read_products` 的会话仍拒绝商品目录。
- 安装事件重复、卸载事件乱序或缺少可信 handle 时不生成虚假登记；旧登记仍可由真实 `store_id` 卸载。
- 下一页返回重复 Product/Collection ID、无 `link` 或游标等于当前游标时，商品、分类及分类商品预览均不会无限翻页或显示超过 50 项。
- 输入法组合结束前不请求，结束后的最终中文词只请求一次；慢请求不能覆盖后来的查询或页码。
- 分类草稿保存/重新打开保留 ID，分类发布按钮和服务端均拒绝；商品与分类已选项跨页不丢失。

---

### Task 1: 鉴权身份与 scope 迁移

**Files:**
- Modify: `app/src/controller/shop-identity.ts`, `app/src/service/shop-identity.ts`, `app/src/shopline.ts`, `app/src/controller/webhook/index.ts`, `app/src/admin-read/install-event.ts`, `app/src/auth/scopes.ts`, `shopline.app.toml`
- Modify: `web/src/prototype/shop-identity-api.ts`, `web/src/pages/quantity-breaks.tsx`
- Test: `app/test/shop-identity-api.test.cjs`, `app/test/scopes.test.cjs`, `app/test/scope-storage.test.cjs`, `app/test/install-event.test.js`, `app/test/admin-registry.test.js`, `web/test/shop-identity-api.test.mjs`

**Interfaces:**
- `GET /api/quantity-breaks/shop -> { shop: { storeId: string } }`，`storeId` 是已鉴权 session handle 的前端隔离键，不能宣称为数字店铺 ID。
- `parseInstallEvent(payload) -> { storeId: string, at: string } | null`；只有已验签 webhook 且 session 提供可信 handle 时调用 `adminRegistry.recordInstallation({ storeId, handle, scope, at })`。

- [ ] **Step 1: 先验证平台事件合同。** 读取本仓 SDK 的 webhookAuthentication 返回类型/实现及现有事件测试夹具，确认安装事件是否携带可信 `store_id` 和 session handle。若不可用，不移除 scope 或旧 `afterAuth` 查店调用，记录阻断原因并向用户说明需要的平台字段；不能以未经校验的 JWT 解码或请求参数代替。
- [ ] **Step 2: 写失败测试。** `/shop` 用已鉴权 `handle=store-a` 返回仅 `{shop:{storeId:'store-a'}}`，且调用次数为零的 SHOPLINE 商店信息 fetcher；缺少会话返回 401。scope 测试确认新必需列表不含 `read_store_information`，含旧权限的会话仍合格。安装事件测试分别覆盖 INSTALL、重复 INSTALL、乱序 UNINSTALL、缺少 session handle 和无效 `store_id`。

```js
assert.deepEqual(response.body, { shop: { storeId: 'store-a' } });
assert.equal(REQUIRED_SHOPLINE_SCOPES.includes('read_store_information'), false);
assert.equal(parseInstallEvent({ operate: 'INSTALL', store_id: '42', timestamp: 1792454400000 })?.storeId, '42');
```
- [ ] **Step 3: 运行红灯。** `cd app && node --test -r ts-node/register test/shop-identity-api.test.cjs test/scopes.test.cjs test/scope-storage.test.cjs test/install-event.test.js test/admin-registry.test.js`；`cd web && node --test test/shop-identity-api.test.mjs`。预期新断言失败。
- [ ] **Step 4: 实施最小迁移。** `/shop` 从已鉴权 session 取 handle；移除该路由的商店 REST 请求及展示字段。安装事件经 SDK 鉴权后用真实 ID 记录，缺可信字段时仅记录无敏感信息的诊断。`afterAuth` 不再查商店；修改必需 scope 与 manifest 的 `scopes` 行时保留现有隧道 URL 原样。前端加载门槛和语言键改用 handle，翻译组件仍接收已鉴权键；不要读取其他店铺偏好。

```ts
const session = response.locals.shopline?.session;
if (!session?.handle) return response.status(401).json({ error: 'AUTH_REQUIRED' });
return response.json({ shop: { storeId: session.handle } });
// Installation registry receives event.storeId only after webhookAuthentication succeeds.
```
- [ ] **Step 5: 运行绿灯。** 重跑聚焦测试与 `cd app && npm run build`、`cd web && npx tsc --noEmit`。检查 `rg -n 'read_store_information|merchants/shop.json' app/src shopline.app.toml`，只允许与本次无关且不再调用的文档/历史测试引用。

### Task 2: 移除应用侧栏并调整头部、档位文案

**Files:**
- Create: `web/src/prototype/AdminLanguageSelect.tsx`
- Modify: `web/src/pages/quantity-breaks.tsx`, `web/src/pages/quantity-breaks.module.css`, `web/src/prototype/CampaignEditor.tsx`, `web/src/prototype/Translations.tsx`, `web/src/prototype/campaign-editor-messages.ts`
- Test: `web/test/workspace-navigation.test.mjs`, `web/test/editor-structure.test.mjs`, `web/test/admin-i18n.test.mjs`
- Reference: `web/src/prototype/navigation.ts`, `docs/reference/screenshots/`

**Interfaces:**
- 现有 `workspaceHref('dashboard') === '/quantity-breaks'` 与 `workspaceHref('translations') === '/quantity-breaks/translations'` 保持不变。
- `AdminLanguageSelect({ value, onChange, label }: { value: string; onChange: (locale: string) => void; label: string })` 是共享控件；父页面以 `languageControl: React.ReactNode` 传给 Dashboard、CampaignEditor、Translations 的页头。

- [ ] **Step 1: 写失败 DOM 测试。** 断言首页没有 `aside[aria-label]`、移动菜单或遮罩；概览头部语言 select 紧邻且先于创建按钮；无活动时仍有创建按钮；翻译和编辑页能切换应用语言；导航函数可直达两个路径并处理后退；档位摘要为 `档位#1  Single` 且无 `.lucide-badge-percent`。

```js
assert.equal(document.querySelector('aside[aria-label]'), null);
assert.equal(readWorkspaceLocation('/quantity-breaks/translations').page, 'translations');
assert.match(document.querySelector('.editorPanel summary')?.textContent ?? '', /档位#1\s+Single/);
```
- [ ] **Step 2: 运行红灯。** `cd web && node --test test/workspace-navigation.test.mjs test/editor-structure.test.mjs test/admin-i18n.test.mjs`；预期新 DOM 断言失败。
- [ ] **Step 3: 实施页面结构。** 从 `quantity-breaks.tsx` 删除侧栏状态、Logo 状态、aside、scrim 和 mobileBar，将语言控件传给 Dashboard、CampaignEditor、Translations 的页头操作区；保留已有宽度与指标 CSS 改动。移除废弃侧栏样式但不做全文件重排。`EditorPanel` 允许档位面板无图标，档位标题按当前语言、序号及 `tier.label` 生成，其他面板照旧。

```tsx
<header className={styles.homePageHeader}>
  <h1>{t('campaignTitle')}</h1>
  <div className={styles.headerButtons}><AdminLanguageSelect value={locale} onChange={changeAdminLanguage} /><Button onClick={onCreate}>{t('createCampaign')}</Button></div>
</header>
// EditorPanel renders Icon only when its optional icon prop is present.
```
- [ ] **Step 4: 运行绿灯。** 重跑聚焦测试、`cd web && npx tsc --noEmit && npm run build`，检查 360px 与桌面页头不重叠。更新 `docs/APP_PROGRESS.md` 的页面状态时仅标记实际访问过的状态。

### Task 3: 商品选择器单页分页和输入法搜索

**Files:**
- Modify: `web/src/prototype/CampaignProductPicker.tsx`, `web/src/pages/quantity-breaks.module.css`
- Test: `web/test/campaign-product-picker.test.mjs`

**Interfaces:**
- 仍调用 `GET /api/quantity-breaks/products?title=...&page_info=...`；一次响应 `{ products: Product[], nextPageInfo: string | null }`。
- `selectedIds` 与 `onChange(ids)` 不变；每页结果数组最多 50 项，页游标历史仅保留当前查询的游标。

- [ ] **Step 1: 写失败交互测试。** 构造第 1 页 50 项和第 2 页 3 项；点击下一页后 DOM 只含 3 个结果、上一页可返回 50 项，跨页已选 ID 留在独立已选区。切换查询清空页历史，空 `nextPageInfo` 禁用下一页；失败保留选择并可重试。用 `compositionStart`、`input('z')`、`input('zu')`、`compositionEnd`、`input('最新')` 加计时器断言只在 300ms 后请求一次最终中文词；普通快速输入和过期响应也各有断言。

```js
assert.equal(document.querySelectorAll('.productPickerResults li').length, 3);
assert.deepEqual(searchCalls.map((url) => new URL(url, 'https://app.test').searchParams.get('title')), ['最新']);
```
- [ ] **Step 2: 运行红灯。** `cd web && node --test test/campaign-product-picker.test.mjs`；预期分页累积和组合输入断言失败。
- [ ] **Step 3: 实施选择器。** 用当前页数组替换累计 `loadMore`，维护上一页游标栈与当前 `page_info`，上一页请求其对应游标。搜索使用 `compositionstart/compositionend` 与 300ms debounce；AbortController 加请求序号保护，查询或分页改变时取消旧请求。跨页选择只修改 `selectedIds`，结果行渲染至多 50 项。

```tsx
const [cursorStack, setCursorStack] = useState<(string | null)[]>([null]);
const [pageIndex, setPageIndex] = useState(0);
const [composing, setComposing] = useState(false);
// Fetch only when !composing and the 300ms debounced query or page cursor changes.
```
- [ ] **Step 4: 运行绿灯。** 重跑聚焦测试、`cd web && npx tsc --noEmit`。网络层断言每次查询只发送固定本地路径，且不会跟随任何上游分页 URL。

### Task 4: 两类分类目录代理

**Files:**
- Create: `app/src/service/campaign/collection-catalog.ts`, `app/src/controller/campaign-collections.ts`, `app/test/campaign-collection-catalog.test.cjs`
- Modify: `app/src/index.ts`
- Reference: `app/src/service/campaign/product-catalog.ts`, `app/src/controller/campaign-products.ts`

**Interfaces:**
- `searchCampaignCollections(session, kind: 'manual' | 'smart', title = '', pageInfo?, fetcher?, requestId?) -> Promise<{ collections: {id: string; title: string; kind: 'manual' | 'smart'}[]; nextPageInfo: string | null }>`。
- `getCampaignCollection(session, id, fetcher?, requestId?) -> Promise<{id: string; title: string; kind: 'manual' | 'smart'}>`；`searchCollectionProducts(session, id, pageInfo?, fetcher?, requestId?) -> Promise<{ products: Product[]; nextPageInfo: string | null }>`。
- `GET /api/quantity-breaks/collections?kind=manual|smart&title=...&page_info=...`、`GET /api/quantity-breaks/collections/:id`、`GET /api/quantity-breaks/collections/:id/products?page_info=...`；session 均从 `response.locals.shopline.session` 读取。

- [ ] **Step 1: 写失败服务测试。** manual 命中固定 `/products/custom_collections.json?fields=id,title&limit=50`，smart 命中 `/products/smart_collections.json`；按 ID 读取命中 `/products/collections/{collection_id}.json` 并解析 `collection_type`；分类商品预览命中 `/products/collections/{collection_id}/products.json?fields=id,title,image&limit=50`。均携带既有四个 Admin 请求头。模拟带 `page_info` 的 `link`，下一次仍请求固定店铺端点；重复游标、无效 JSON、缺失列表、无效 ID 和超过 50 条的上游响应报错。控制器对未鉴权、无效 kind/ID、超长 title/游标返回 401/400；上游 403 返回明确授权错误，其他上游失败返回 502；日志无 token、正文、游标。

```js
assert.match(requestedUrl, /\/products\/custom_collections\.json\?/);
assert.equal(new URL(requestedUrl).searchParams.get('limit'), '50');
assert.equal(result.nextPageInfo, 'next-cursor');
assert.equal(result.collections.length <= 50, true);
```
- [ ] **Step 2: 运行红灯。** `cd app && node --test -r ts-node/register test/campaign-collection-catalog.test.cjs`；预期模块缺失。
- [ ] **Step 3: 实施代理。** 复用现有 product catalog 的固定 URL、分页头解析与安全 trace 习惯；分类列表只取 `id,title` 和请求指定的 `kind`，单项读取从 `collection_type` 映射类型。分类商品预览只返回 `id,title,imageUrl`。不得把任意 `link` URL 当作 fetch 目的地。注册路由于 `app/src/index.ts` 的现有 Quantity Breaks API 区域，静态列表路径需在 `/:id` 动态路径之前。

```ts
const endpoint = kind === 'manual' ? '/products/custom_collections.json' : '/products/smart_collections.json';
const url = new URL(`${baseUrl(session)}${endpoint}`);
url.searchParams.set('limit', '50');
if (pageInfo) url.searchParams.set('page_info', pageInfo);
// Parse only the cursor from link; never fetch the link itself.
```
- [ ] **Step 4: 运行绿灯。** 重跑聚焦测试与 `cd app && npm run build`；检查 50 条上限、错误状态与日志字段。

### Task 5: 分类草稿选择和发布限制

**Files:**
- Create: `web/src/prototype/CampaignCollectionPicker.tsx`, `web/test/campaign-collection-picker.test.mjs`
- Modify: `web/src/prototype/CampaignEditor.tsx`, `web/src/prototype/campaign-adapter.ts`, `web/src/pages/quantity-breaks.module.css`, `web/src/prototype/campaign-editor-messages.ts`
- Test: `web/test/campaign-adapter.test.mjs`, `web/test/campaign-editor-messages.test.mjs`, `app/test/campaign-api.test.cjs`

**Interfaces:**
- `CampaignCollectionPicker` 消费 `fetcher`, `selectedIds`, `onChange`, `locale`，持久化只输出唯一 `collectionIds`。
- `toCampaignDraft` 对 `scope.kind='collections'` 保存所选 IDs；发布控制器和仓储继续拒绝 `collections` 激活。

- [ ] **Step 1: 写失败测试。** 手动/智能两类切换分别单页最多 50 项，上一页/下一页与跨页已选项正常；选中分类后的商品预览每页最多 50 个商品，也可上一页/下一页。分类 ID 去重，草稿保存和重新打开后通过按 ID 接口恢复标题。分类选择下发布按钮不可用且标题说明未支持；直接 POST 状态变更仍返回 409 且未调用平台折扣创建。分类目录错误不清空草稿，11 种语言具有必要选择器文案。

```js
assert.deepEqual(toCampaignDraft(draft, original).scope.collectionIds, ['collection-1']);
assert.equal(publishButton.disabled, true);
assert.equal(collectionProductRows.length <= 50, true);
```
- [ ] **Step 2: 运行红灯。** `cd web && node --test test/campaign-collection-picker.test.mjs test/campaign-adapter.test.mjs test/campaign-editor-messages.test.mjs` 与 `cd app && node --test -r ts-node/register test/campaign-api.test.cjs`；预期新增分类草稿断言失败。
- [ ] **Step 3: 实施分类选择。** 启用编辑器分类单选，沿用商品选择器的单页、跨页、组合输入行为；以 `collectionIds` 而非分类标题保存，重新加载通过按 ID 路由恢复标题。分类商品预览与已选分类分开，翻页不能修改范围。只放宽草稿适配器，保持发布禁用、仓储发布阻断及重叠检查的“未验证”状态。

```tsx
{scope === 'Product collections' && <CampaignCollectionPicker fetcher={fetcher} selectedIds={selectedCollectionIds} onChange={setSelectedCollectionIds} locale={i18n.language} />}
// Save { kind: 'collections', collectionIds: selectedCollectionIds, excludedProductIds: [] } only as a draft.
```
- [ ] **Step 4: 运行绿灯。** 重跑聚焦测试、`cd web && npx tsc --noEmit && npm run build`、`cd app && npm run build`。检查分类草稿无真实平台折扣 ID，不把分类称为已发布。

### Task 6: 全量验证、视觉验收与推送审阅

**Files:**
- Modify: `docs/APP_PROGRESS.md`
- Review: 此计划所有代码、配置、测试和文档；用户原有未提交文件逐项对照初始 diff。

**Interfaces:**
- 交付路径：`/quantity-breaks`、`/quantity-breaks/translations`；未取得真实店验证的项目在进度文档中保持 `IN_PROGRESS` 或 `BLOCKED`。

- [ ] **Step 1: 运行全量检查。** `cd app && npm test && npm run build`；`cd web && npm run test:prototype && npx tsc --noEmit && npm run build`；仓库根目录 `git diff --check`。只为具体失败修复重复测试，不以既有测试红灯掩盖本批回归。
- [ ] **Step 2: 桌面/移动实际访问。** 用可用浏览器在 1024px 与 360px 访问概览、编辑、翻译及分类草稿，操作语言、分页、中文输入法和浏览器后退；保留参考截图与本地截图。若无授权 SHOPLINE 会话，明确记录不可验的嵌入式功能和所需真实店步骤。
- [ ] **Step 3: 核验平台边界。** 在授权店铺确认分类 GET 权限、安装 webhook 的数字 `store_id`/可信 handle、SHOPLINE 后台两个导航菜单及新的 scope 授权行为。不得通过重复发布测试分类；分类发布保持 409。若平台合同缺失，保留阻断并记录 request ID/阶段。
- [ ] **Step 4: 更新进度。** 在 `docs/APP_PROGRESS.md` 记录每个页面实际访问、截图、测试结果、保留的阻断和未验收页面；完成一个页面后继续下一个未验收页面，不提前宣称全应用完成。
- [ ] **Step 5: 审阅变更集。** `git status --short`、逐个 `git diff`、检查未跟踪文件和敏感信息，列出新增/修改/删除文件及建议提交说明。按 `AGENTS.md` 问“本次代码/文档已在本地更新，是否推送到 GitHub？”，收到对本批明确批准前不暂存、提交或推送；批准后只暂存审阅过的文件并检查 staged diff，再提交和推送当前 main，报告真实结果与 hash。
