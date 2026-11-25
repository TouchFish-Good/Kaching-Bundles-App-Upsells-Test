# 店铺前台语言与翻译编辑实施计划

> **执行要求：** 使用 `superpowers:executing-plans` 逐项实施，步骤以复选框跟踪；实现前先读关联设计规格。不得未经许可推送。

**目标：** 翻译页面仅展示当前店铺使用的前台语言，并以清晰的「原始文案 → 商家译文」方式配置 Quantity Breaks 前台文案。

**架构：** 应用服务端通过鉴权 SHOPLINE Admin REST 获取店铺语言，前端以返回值构造语言下拉框。系统翻译键与实际 Widget 文案一一对应，译文按店铺和语言持久化；商家自定义的逐档标题/副标题/标签不混入系统文案表。

**技术栈：** React/TypeScript、CSS Modules、Express/TypeScript、SQLite、Node test runner、Vite。

**规格：** `docs/superpowers/specs/2026-10-14-tier-markets-and-translations-design.md`

## 全局约束

- `GET /store/languages.json` 返回 `default_language`、`supported_languages`；只展示当前店铺使用的语言。Admin token 不进入浏览器。
- 前台翻译与后台管理界面语言是两套设置；不能因为选中编辑语言就改变后台界面语言。
- 保存、加载与语言切换必须处理失败和未保存修改；未连接状态不能伪造已从店铺加载的语言。

## 重点风险

- 店铺只启用一种语言时仍能查看原文、编辑与保存，不出现空选择器。
- 接口返回空数组、重复代码或默认语言不在数组中时显示准确错误，不编造语言。
- 翻译中含变量占位符时必须保留占位符，否则前台价格/数量无法渲染。
- 切换语言前有未保存修改时，不得悄悄丢失当前草稿。
- 窄视口下原文与译文不能错行，长文案超高时分组滚动仍可访问保存按钮。

---

### Task 1: 店铺语言读取

**文件：** 新建 `app/src/service/store-languages.ts`、`app/src/controller/store-languages.ts`、对应测试；修改 `app/src/index.ts` 注册路由；新建 `web/src/prototype/store-languages.ts` 和测试。

**接口：** `GET /api/quantity-breaks/store-languages` 返回 `{defaultLanguage: string, languages: string[]}`；服务端从当前鉴权 session 调用 `GET /store/languages.json`。前端 `normalizeStoreLanguages` 去重并验证默认语言在列表内，失败返回有类型的错误。

规范化断言示例：

```js
assert.deepEqual(normalizeStoreLanguages({ default_language: "en", supported_languages: ["en", "fr", "fr"] }), { defaultLanguage: "en", languages: ["en", "fr"] });
assert.throws(() => normalizeStoreLanguages({ default_language: "en", supported_languages: [] }), /language/);
```

沿用 `app/src/index.ts` 中 `/api/*` 的 `shopline.validateAuthentication()`；先为 `app/package.json` 增加可运行的 Node/TypeScript 测试命令，所有新路由置于该鉴权中间件之后。

- [ ] 写失败测试：仅启用 `en`/`fr` 时只返回两项；重复语言去重；空响应和默认语言缺失报错；无授权 session 返回 401。
- [ ] 运行服务端测试，确认新模块测试先失败。
- [ ] 实现鉴权服务端代理和前端规范化；提供刷新能力而非无限期缓存。运行 `cd app && npm run build`、`cd web && npm run test:prototype && npm run build`。

### Task 2: 原文与译文编辑界面

**文件：** 修改 `web/src/pages/quantity-breaks.tsx`、`web/src/pages/quantity-breaks.module.css`、`web/src/prototype/StorefrontWidget.tsx`；新建 `web/src/prototype/storefront-copy.ts`、`web/test/storefront-copy.test.mjs`；修改 `web/test/coverage.test.mjs`。

**接口：** `storefront-copy.ts` 导出稳定的系统文案键、英文原文、前台出现位置和变量列表。翻译页每行显示只读原文和可编辑译文；前台组件通过同一键查找译文，缺失时使用默认文案。

每行结构示例：

```tsx
<div className={styles.translationRow} key={entry.key}>
  <label>原始文案<input value={entry.source} readOnly /></label>
  <label>商家译文<input value={draft[entry.key] ?? ""} onChange={(event) => update(entry.key, event.target.value)} /></label>
</div>
```

- [ ] 写失败测试：界面语言只来自店铺接口；系统文案键在实际 Widget 中被使用；译文缺失回退原文；变量占位符不得缺失；逐档商家自定义文案不出现在系统翻译键中。
- [ ] 运行 `cd web && npm run test:prototype`，确认新增断言失败。
- [ ] 用左原文、右译文的对照行实现编辑器；桌面以列对齐，手机按每条原文/译文成组堆叠。每个分组设 `max-height` 为视口可用高度并 `overflow-y: auto`，不让保存操作被内部滚动遮蔽。
- [ ] 添加加载、失败重试、空语言、未连接演示标识和保存反馈；同视口对比已观察的 Shopify 翻译页，记录未展示的交互为未验证。

### Task 3: 按店铺持久化与端到端验证

**文件：** 新建服务端翻译存储/路由与测试；修改前端翻译页的数据读取/保存路径、`theme-app-extension/public/app-block.js` 的前台翻译读取路径，并按 SHOPLINE Theme App Extension 的现有结构调整所需 block 配置；更新 `docs/APP_PROGRESS.md` 与 `docs/VISUAL_GAP_REPORT.md`。翻译配置另建按店铺隔离的数据表，不复用会话表。

**接口：** `GET/PUT /api/quantity-breaks/translations/:locale` 按当前店铺作用域读写 `{key: translatedText}`；保存前校验 locale 属于当前店铺启用语言，并检查变量占位符集合与原文一致。

隔离测试断言示例：

```js
assert.deepEqual(await repository.read("shop-a", "fr"), { "widget.add_to_cart": "Ajouter au panier" });
assert.deepEqual(await repository.read("shop-b", "fr"), {});
```

- [ ] 写失败测试：店铺 A 不能读取/覆盖店铺 B 译文；禁用语言保存被拒绝；丢失占位符被拒绝；网络保存失败保留草稿；语言切换前有未保存更改时给出保留/放弃选择。
- [ ] 运行服务端及前端测试，确认新增断言失败；实现最小持久化与界面状态，再运行全部相关测试。
- [ ] 在开发店验证主题扩展加载路径与语言上下文，再切换前台语言，验证保存后对应 Widget 文案出现，未翻译项正常回退；若无可用店铺则保持未验证状态，不能把原型组件测试冒充主题实测。完成桌面/手机截图对比及键盘、滚动检查。

### 本计划验收

执行 `cd app && npm run build`、`cd web && npm run test:prototype && npm run build`；在真实开发店验证已启用语言清单与前台文案。没有店铺实测时，只能报告本地 UI/服务端测试通过，不能标记端到端 `VERIFIED`。
