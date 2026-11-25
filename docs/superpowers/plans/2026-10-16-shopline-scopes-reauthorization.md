# SHOPLINE 权限与重授权实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为现有应用补齐实际 API 所需权限，并让旧安装会话通过 SHOPLINE SDK 与 App Bridge 进入商家重授权流程。

**Architecture:** 后端用一份受测试约束的权限常量配置 SDK，`shopline.app.toml` 与它保持一致。前端用可注入、可测试的鉴权 fetch 包装器给所有后台 API 发送 App Bridge session token；SDK 检测旧 scope 后返回重授权头，包装器校验同源地址并通过 App Bridge 导航到现有 `/api/auth`。不自行交换 OAuth code，不自动重试写请求。

**Tech Stack:** TypeScript、Express、React、SHOPLINE App SDK `@shoplineos/shopline-app-express@0.1.3`、`@shoplinedev/appbridge`、Node test runner、Vite。

**Spec:** `docs/superpowers/specs/2026-10-16-shopline-scopes-reauthorization-design.md`

## Global Constraints

- 所需 scopes 精确为 `read_products,write_products,read_discounts,write_discounts,read_store_information,read_markets,read_translation`；保留既有四项，不增加未查证的权限。
- `SCOPES` 未设置不能退化成空数组；显式配置缺项时启动失败并列出缺项，不带旧权限继续运行。
- 复用现有 SDK 的 `/api/auth` 和回调；嵌入式授权使用 App Bridge 动作，禁止 `window.location.href` 在 iframe 内跳转。
- 只接受同源 `/api/auth` 重授权地址，拒绝外部域名与任意路径；并发请求只能触发一次跳转。
- 商家拒绝或授权失败时保留错误状态；有副作用的 POST/PUT/DELETE 不自动重试。
- 不触发真实店铺授权、自动折扣创建、扩展发布或 Git push。现有 `main` 未提交文件属于用户；在独立 worktree 实施，不覆盖它们。

## Review Focus

1. `SCOPES` 未设置或只含旧四项：SDK 不得以空/旧权限正常启动（Task 1 测试）。
2. 恶意或损坏的重授权 URL：不得导航到外部域名或非 `/api/auth` 路径（Task 2 测试）。
3. 多个首页 API 同时收到 403：只导航一次，所有写请求仍保留失败结果（Task 2 测试）。
4. SPA 改变路径后 `lang` 查询参数消失：嵌入式状态在页面生命周期中稳定，依旧发送 session token（Task 2 测试）。
5. 译文保存或活动发布遇到旧 scope：不得把授权跳转误报为保存成功，也不得自动重复写入（Task 3 测试）。

---

### Task 1：统一权限声明与运行时校验

**Files:**
- Create: `app/src/auth/scopes.ts`
- Create: `app/test/scopes.test.cjs`
- Modify: `app/src/shopline.ts:14`
- Modify: `shopline.app.toml:12-13`
- Modify: `docs/SHOPLINE_API_RESEARCH.md`

**Interfaces:**
- Produces: `REQUIRED_SHOPLINE_SCOPES: readonly string[]`、`resolveShoplineScopes(raw?: string): string[]`、`assertAuthorizedSessionScopes(scope?: string): void`，供 SDK 配置、`afterAuth` 回调和测试使用。
- Consumes: `process.env.SCOPES` 与 `shopline.app.toml` 的 `[access_scopes].scopes`；不读取或记录 app secret/token。

- [ ] **Step 1: 写失败测试。** 在 `app/test/scopes.test.cjs` 使用 `node:test`、`assert/strict` 和 `fs.readFileSync`，断言 `resolveShoplineScopes(undefined)` 等于七项、显式旧四项抛出含三项缺失权限的错误、七项乱序仍可返回，以及 TOML `[access_scopes]` 列表与常量集合相同。另断言 `assertAuthorizedSessionScopes` 在旧四项、空 scope 时抛错，在完整七项时通过；回调未验证完整授权前不得登记安装。测试示例：

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { REQUIRED_SHOPLINE_SCOPES, resolveShoplineScopes, assertAuthorizedSessionScopes } = require('../src/auth/scopes');
test('旧安装权限不能作为当前完整权限启动', () => {
  assert.deepEqual(resolveShoplineScopes(undefined), [...REQUIRED_SHOPLINE_SCOPES]);
  assert.throws(() => resolveShoplineScopes('read_products,write_products,read_discounts,write_discounts'), /read_store_information.*read_markets.*read_translation/);
});
test('旧会话不能登记为已重新授权', () => {
  assert.throws(() => assertAuthorizedSessionScopes('read_products,write_products,read_discounts,write_discounts'), /read_store_information/);
  assert.doesNotThrow(() => assertAuthorizedSessionScopes(REQUIRED_SHOPLINE_SCOPES.join(',')));
});
```

- [ ] **Step 2: 验证红灯。** 运行 `node --test -r ts-node/register app/test/scopes.test.cjs`；预期 `Cannot find module '../src/auth/scopes'`，不是语法错误。
- [ ] **Step 3: 最小实现。** 常量按 Global Constraints 顺序声明；`raw?.split(',').map(trim).filter(Boolean)`，未设置回退常量，显式缺项抛错，返回配置值。`assertAuthorizedSessionScopes` 用同一必需权限集合检查 `session.scope`，缺项抛错。`shopline.ts` 改为 `scopes: resolveShoplineScopes(process.env.SCOPES)`；`afterAuth` 在登记安装及注册 webhook 之前调用 `assertAuthorizedSessionScopes(session.scope)`，失败时保留授权错误状态且不登记为成功；TOML 加入三项。文档记录各 API 与官方权限来源，注明目标店仍需授权。
- [ ] **Step 4: 验证绿灯和后端构建。** 运行 `node --test -r ts-node/register app/test/scopes.test.cjs`、`npm test -w app`、`npm run build -w app`；预期全部退出 0。
- [ ] **Step 5: 检查差异。** 运行 `git diff --check`、`git diff -- app/src/auth/scopes.ts app/src/shopline.ts shopline.app.toml docs/SHOPLINE_API_RESEARCH.md`；记录建议提交 `feat: align SHOPLINE scopes with Admin APIs`，不要在未确认推送批次前提交用户其他文件。

### Task 2：安全的嵌入式鉴权请求和重授权跳转

**Files:**
- Create: `web/src/prototype/authenticated-fetch.ts`
- Create: `web/test/authenticated-fetch.test.mjs`
- Modify: `web/src/hooks/useAuthenticatedFetch.ts`

**Interfaces:**
- Consumes: SDK 返回的 `X-SHOPLINE-API-Request-Failure-Reauthorize` 与 `X-SHOPLINE-API-Request-Failure-Reauthorize-Url`，`shared.getSessionToken(app)`，以及当前项目 App Bridge 的 `Redirect.create(app).replaceTo(url)`。
- Produces: `createAuthenticatedFetch(options): typeof fetch` 与稳定的 `useAuthenticatedFetch(): typeof fetch`。`options` 明确包含 `fetcher`、`embedded`、`getSessionToken`、`redirectToAuth`、`origin`；供 Task 3 注入 API 客户端。

- [ ] **Step 1: 写失败测试。** 使用 `createServer` 的 `vite.ssrLoadModule('/src/prototype/authenticated-fetch.ts')` 加载纯包装器；模拟 bearer token、保留原始请求方法/正文/自定义头、403 授权头、恶意 URL、并发 403、非嵌入模式及 session token 获取失败。关键断言：

```js
const response = new Response('', { status: 403, headers: {
  'X-SHOPLINE-API-Request-Failure-Reauthorize': '1',
  'X-SHOPLINE-API-Request-Failure-Reauthorize-Url': '/api/auth?handle=test-store',
} });
await Promise.all([client('/api/quantity-breaks/shop'), client('/api/quantity-breaks/campaigns')]);
assert.equal(redirects.length, 1);
assert.equal(redirects[0], 'https://app.example.com/api/auth?handle=test-store');
```

- [ ] **Step 2: 验证红灯。** 运行 `node --test web/test/authenticated-fetch.test.mjs`；预期模块或导出缺失。
- [ ] **Step 3: 最小实现。** 用 `Headers` 合并请求头；嵌入模式每次取 session token，设置 `Authorization: Bearer ...` 与 `X-Requested-With`；非嵌入模式不伪造 token。只在 `status===403` 且重授权头为 `1` 时处理，`new URL(raw, origin)` 后验证 `url.origin===origin`、`url.pathname==='/api/auth'`、无用户信息或 hash；首次调用 `redirectToAuth(url.href)`，其余 403 原样返回。不得自动重试。Hook 中保存初始 `lang` 判定，利用 React `useMemo` 维持 fetcher 引用稳定，并以 App Bridge `Redirect.create(app).replaceTo(url)` 导航。
- [ ] **Step 4: 验证绿灯与前端类型。** 运行 `node --test web/test/authenticated-fetch.test.mjs`、`npm run test:prototype -w web`、`npx tsc --noEmit -p web/tsconfig.json`；预期退出 0。
- [ ] **Step 5: 检查差异。** `git diff --check`；记录建议提交 `feat: handle SHOPLINE scope reauthorization in embedded requests`。

### Task 3：所有受保护的后台 API 共用鉴权通道

**Files:**
- Modify: `web/src/pages/quantity-breaks.tsx`
- Modify: `web/src/prototype/CampaignEditor.tsx`
- Modify: `web/src/prototype/Translations.tsx`
- Modify: `web/test/campaign-api.test.mjs`
- Create: `web/test/reauthorization-wiring.test.mjs`

**Interfaces:**
- Consumes: Task 2 的稳定 `useAuthenticatedFetch(): typeof fetch`；现有 `readShopIdentity(fetcher)`、`readCampaigns(fetcher)`、`saveCampaign(draft, revision, fetcher)`、`deleteCampaign(id, revision, fetcher)`、`changeCampaignStatus(id, status, revision, fetcher)`、`readTranslations(locale, fetcher)`、`writeTranslations(locale, copy, fetcher)`。
- Produces: `CampaignEditor` 与 `Translations` 各接收 `fetcher: typeof fetch`，所有 `/api/quantity-breaks/*` 读写请求使用该函数；本地 API 测试仍可注入模拟 fetcher。

- [ ] **Step 1: 写失败测试。** 在 `reauthorization-wiring.test.mjs` 检查页面用同一个鉴权 fetcher 调用店铺、活动读写，`CampaignEditor` 市场读取和 `Translations` 语言/译文读写也从 props 使用它；在现有 API 测试增加 `changeCampaignStatus` 收到 403 时拒绝且不重发 POST。测试可以使用 Vite 模块加载与 React SSR，不依赖真实店铺。
- [ ] **Step 2: 验证红灯。** 运行 `node --test web/test/reauthorization-wiring.test.mjs web/test/campaign-api.test.mjs`；预期新测试因直接 `fetch()` 调用失败。
- [ ] **Step 3: 最小实现。** `QuantityBreaksPrototype` 调用一次 `useAuthenticatedFetch()` 并把它传给全部现有 API 方法及 `CampaignEditor`/`Translations`；两个子组件使用 `fetcher(...)`，在 effect 的依赖数组加入稳定 fetcher。保留现有 AbortController、错误提示和保存按钮状态；不得在 auth 失败时把请求视为成功。
- [ ] **Step 4: 验证绿灯与构建。** 运行 `node --test web/test/reauthorization-wiring.test.mjs web/test/campaign-api.test.mjs`、`npm run test:prototype -w web`、`npm run build -w web`、`npm test -w app`、`npm run test:theme`、`go test ./... -count=1`（在 `product-discount-customizations/`）；预期全部退出 0。
- [ ] **Step 5: 复核及验收边界。** 检查 `rg -n 'fetch\(' web/src/pages/quantity-breaks.tsx web/src/prototype/CampaignEditor.tsx web/src/prototype/Translations.tsx` 只剩注入的 fetcher 调用；检查 `git diff --check`、新增文件及敏感信息。记录建议提交 `feat: route quantity breaks API through authenticated fetch`。真实店铺授权、拒绝、回调和三项只读 API 响应仍必须由商家在已部署的开发店确认，不能标 `VERIFIED`。

## 集成与交付

实施前从当前本地 `main` 创建独立 worktree；其中 `app/src/shopline.ts`、`shopline.app.toml`、`app/src/index.ts` 在原 `main` 有用户未提交改动。实现后只审查本计划文件，逐项与这些改动合并，保留原隧道 URL、安装记录 hook 与本地数据库；不能直接覆盖或清理。按 `AGENTS.md` 展示完整 diff、未跟踪文件、建议 commit message 和目标分支，等用户明确批准后才推送。已安装店铺重新授权是部署后的商家动作，不在本地测试中代替商家执行。

## 审查后补充

SDK 在 `afterAuth` 前保存回调会话，因此仅在 hook 中校验会导致缺权限的新会话覆盖原记录。实施时增加 `scopeCheckedSessionStorage`，在 `storeSession` 写入前拒绝不完整权限，并用真实 SQLite 存储测试确认旧记录保留。`afterAuth` 的校验仍作为第二道约束。目标店铺是否授予权限仍需商家操作后验收。
