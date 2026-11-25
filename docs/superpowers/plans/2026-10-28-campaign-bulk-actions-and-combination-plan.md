# 活动批量操作与折扣叠加 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Quantity Breaks 活动支持订单、商品、运费三类折扣叠加，提供 App Bridge 确认的批量启用/暂停/删除操作，并修复创建校验、市场金额说明与多语言列表布局。

**Architecture:** 在 Worker 分支扩展持久化活动契约及 SHOPLINE 发布映射，缺失的旧 `productDiscounts` 一律兼容为 `false`。React 管理端由纯函数计算指定市场金额的受影响档位和动态文案；列表仅保留批量动作并通过既有 `BridgeConfirmation` 调用状态 API。表格通过语义化 `colgroup` 和单一 CSS 列宽策略维持中等屏幕可读性，手机沿用卡片。

**Tech Stack:** Cloudflare Workers + D1、TypeScript、Hono、React 18、Vite、SHOPLINE App Bridge、Vitest、Node test runner、CSS Modules。

**Spec:** `docs/superpowers/specs/2026-10-28-campaign-bulk-actions-and-combination-design.md`

## Global Constraints

- 实现和验证目标为 `codex/cloudflare-workers-d1` worktree：`/Users/SL/.codex/worktrees/cloudflare-workers-d1/bundles-app-upsells-new`；不得在桌面 `main` 覆盖用户未提交的 CSS 或订阅设计草稿。
- `combinesWith` 必须包含 `orderDiscounts`、`productDiscounts`、`shippingDiscounts`；新活动默认三项均为 `false`，旧记录缺少 `productDiscounts` 时按 `false` 读取。
- 指定市场金额命中时仍原样上传三种叠加选择；不得清空、锁定或改写选择。
- 指定市场金额说明仅在至少一种叠加项开启时出现，且只列固定类型的 `specified_amount` 档位。
- 批量操作仅保留启用、暂停、删除，且必须使用 App Bridge 确认；不得保留“结束活动”路径。
- 名称和开始时间在保存草稿、创建或发布均为必填；前端必须展开、聚焦并提供本地化反馈，Worker 继续强制校验。
- 后台新增文案必须覆盖 11 个 locale，且 key 集完全一致；不得为列表、操作或提示保留硬编码英语。
- 每个完成页面必须更新 `docs/APP_PROGRESS.md`，并保留实际本地截图；未经实际执行与验证不得写为已验证。
- 不执行 `git push`，除非用户对本次完整变更集再次明确授权。

## Review Focus

- 旧活动或平台响应缺少 `productDiscounts` 时，读取、编辑、再保存不得失败，且再发布默认为不与商品折扣叠加。
- 含指定市场金额且三类开关均开启时，SHOPLINE 请求仍保留三类 `true`，提示却只列正确的固定类型和市场。
- 一次批量选择中包含 active、scheduled、paused、draft 时，启用/暂停只能作用于需要变更的活动，删除仍按发布状态先清理平台折扣。
- 在嵌入式环境确认弹窗关闭或取消时，批量 API 不得被调用；非嵌入环境回退对话框仍可取消。
- 长译文和长活动名在 1024px 和 768px 不得与相邻列重叠，390px 必须保持可扫描卡片。

---

### Task 1: 扩展 Worker 活动契约与 SHOPLINE 发布载荷

**Files:**
- Modify: `worker/src/domain/campaign.ts`
- Modify: `worker/src/services/discounts.ts`
- Modify: `worker/test/campaign-repository.test.ts`
- Modify: `worker/test/discount-publication.test.ts`

**Interfaces:**
- Consumes: `CampaignDraft.combinesWith`、`validateCampaign()`。
- Produces: 包含 `productDiscounts` 的 Worker `CampaignDraft`，以及保持三类组合值的 `discountInput()` 请求体。

- [ ] **Step 1: 写出 Worker 回归测试**

```ts
it('publishes all selected combination modes even with specified market amounts', async () => {
  const body = publishedRequestBody({
    combinesWith: { orderDiscounts: true, productDiscounts: true, shippingDiscounts: true },
    tiers: [fixedTierWithSpecifiedAmount('JP')],
  });
  expect(body.combines_with_modes).toMatchObject({
    order_automatic_discount: true,
    product_automatic_discount: true,
    shipping_automatic_discount: true,
  });
});
```

- [ ] **Step 2: 运行定向测试，确认现状失败**

Run: `(cd worker && npm test -- --run test/discount-publication.test.ts test/campaign-repository.test.ts)`

Expected: FAIL，因为 `productDiscounts` 尚未出现在契约中，指定市场金额仍会强制将组合字段写为 `false`。

- [ ] **Step 3: 实现最小契约和发布映射**

```ts
type CampaignCombinesWith = {
  orderDiscounts: boolean;
  productDiscounts: boolean;
  shippingDiscounts: boolean;
};

combines_with_modes: {
  order_discount_code: campaign.combinesWith.orderDiscounts,
  order_automatic_discount: campaign.combinesWith.orderDiscounts,
  product_discount_code: campaign.combinesWith.productDiscounts,
  product_automatic_discount: campaign.combinesWith.productDiscounts,
  shipping_discount_code: campaign.combinesWith.shippingDiscounts,
  shipping_automatic_discount: campaign.combinesWith.shippingDiscounts,
}
```

添加读取边界的归一化：旧 D1 JSON 或平台响应缺少 `productDiscounts` 时，构造 `{ ...storedCombinesWith, productDiscounts: false }` 后再验证。移除 `specified` 对发布组合字段的条件覆写，但保留 Function 规则中的市场金额序列化。

- [ ] **Step 4: 运行定向测试，确认通过**

Run: `(cd worker && npm test -- --run test/discount-publication.test.ts test/campaign-repository.test.ts)`

Expected: PASS，三种组合字段与旧记录兼容均被覆盖。

### Task 2: 保持 legacy `app/` 的发布和验证契约一致

**Files:**
- Modify: `app/src/service/campaign/model.ts`
- Modify: `app/src/service/campaign/validate.ts`
- Modify: `app/src/service/campaign/discount-adapter.ts`
- Modify: `app/test/campaign-domain.test.cjs`
- Modify: `app/test/campaign-discount-adapter.test.cjs`
- Modify: `app/test/campaign-discount-rest.test.cjs`

**Interfaces:**
- Consumes: 与 Worker 相同的 `combinesWith` 业务语义。
- Produces: legacy 测试和工具路径中的三项组合映射，避免本地开发路径与生产 Worker 行为分叉。

- [ ] **Step 1: 写出 legacy 适配器失败测试**

```js
assert.equal(sent.body.combines_with_modes.product_automatic_discount, true);
assert.equal(sent.body.combines_with_modes.order_automatic_discount, true);
assert.equal(sent.body.combines_with_modes.shipping_automatic_discount, true);
```

测试样本必须含指定市场金额覆盖，证明它不会重写商家选择。

- [ ] **Step 2: 运行 legacy 定向测试，确认失败**

Run: `node --test app/test/campaign-domain.test.cjs app/test/campaign-discount-adapter.test.cjs app/test/campaign-discount-rest.test.cjs`

Expected: FAIL，因为 `product_automatic_discount` 仍被硬编码为 `false`。

- [ ] **Step 3: 实现兼容默认值和完整映射**

```ts
const combinesWith = {
  orderDiscounts: input.combines_with_modes.order_automatic_discount,
  productDiscounts: input.combines_with_modes.product_automatic_discount ?? false,
  shippingDiscounts: input.combines_with_modes.shipping_automatic_discount,
};
```

更新 model、validator 和 REST payload，使其与 Task 1 字段完全一致。

- [ ] **Step 4: 运行 legacy 定向测试，确认通过**

Run: `node --test app/test/campaign-domain.test.cjs app/test/campaign-discount-adapter.test.cjs app/test/campaign-discount-rest.test.cjs`

Expected: PASS。

### Task 3: 扩展前端活动模型和指定市场金额计算器

**Files:**
- Create: `web/src/prototype/combination-policy.ts`
- Modify: `web/src/prototype/model.ts`
- Modify: `web/src/prototype/campaign-adapter.ts`
- Modify: `web/test/campaign-adapter.test.mjs`
- Create: `web/test/combination-policy.test.mjs`

**Interfaces:**
- Consumes: `CampaignTier.marketOverrides`、`Campaign.combineOrder`、`Campaign.combineProduct`、`Campaign.combineShipping`。
- Produces: `getSpecifiedMarketCombinationRows()` 和 `getEnabledCombinationTypes()`，供编辑器渲染本地化说明和表格。

- [ ] **Step 1: 写出纯函数失败测试**

```js
assert.deepEqual(getEnabledCombinationTypes({ combineOrder: true, combineProduct: true, combineShipping: false }), ['product', 'order']);
assert.deepEqual(getSpecifiedMarketCombinationRows([percentageTier, fixedTier], markets), [
  { tierId: 'three', label: 'three', marketNames: ['Japan', 'Korea'] },
]);
```

再覆盖 `auto_convert`、百分比和没有开启叠加项时返回空数组的边界。

- [ ] **Step 2: 运行新测试，确认失败**

Run: `node --test web/test/combination-policy.test.mjs web/test/campaign-adapter.test.mjs`

Expected: FAIL，因为策略模块和 `combineProduct` 尚不存在。

- [ ] **Step 3: 实现前端模型、适配和策略模块**

```ts
export function getSpecifiedMarketCombinationRows(
  tiers: Tier[],
  marketsById: Record<string, string>,
): SpecifiedMarketCombinationRow[] {
  return tiers.flatMap((tier) => {
    if (!['fixed_amount', 'fixed_price', 'bundle_fixed_amount', 'bundle_fixed_price'].includes(tier.discountType)) return [];
    const marketNames = Object.entries(tier.marketOverrides ?? {})
      .filter(([, override]) => override.mode === 'specified_amount')
      .map(([marketId]) => marketsById[marketId] ?? marketId);
    return marketNames.length ? [{ tierId: tier.tierId, label: tier.label || tier.tierId, marketNames }] : [];
  });
}
```

在 `toAdminCampaign()`、`toCampaignDraft()` 中双向映射 `productDiscounts` / `combineProduct`，并对缺失服务端字段回退 `false`。创建初始 `Campaign` 的三个组合值全部为 `false`。

- [ ] **Step 4: 运行前端模型测试，确认通过**

Run: `node --test web/test/combination-policy.test.mjs web/test/campaign-adapter.test.mjs`

Expected: PASS。

### Task 4: 实现编辑器默认展开、必填反馈和市场金额提示

**Files:**
- Modify: `web/src/prototype/CampaignEditor.tsx`
- Modify: `web/src/prototype/campaign-editor-messages.ts`
- Modify: `web/src/pages/quantity-breaks.module.css`
- Modify: `web/test/editor-structure.test.mjs`
- Modify: `web/test/campaign-editor-messages.test.mjs`
- Modify: `web/test/admin-i18n.test.mjs`

**Interfaces:**
- Consumes: Task 3 的 `getEnabledCombinationTypes()` 和 `getSpecifiedMarketCombinationRows()`。
- Produces: `combineProduct` 开关、默认展开的设置 section、字段聚焦与 App Bridge 错误反馈、市场金额表格。

- [ ] **Step 1: 写出编辑器失败测试**

```js
assert.match(source, /<details[^>]*open[^>]*data-editor-section="settings"/);
assert.match(source, /setSettingsOpen\(true\)/);
assert.match(source, /getSpecifiedMarketCombinationRows/);
assert.match(renderedHtml, /因当前档位设置了指定市场金额/);
```

测试还需断言新建活动渲染的三个叠加开关均未勾选，以及提示表只显示 `three | Japan、Korea`。

- [ ] **Step 2: 运行编辑器定向测试，确认失败**

Run: `node --test web/test/editor-structure.test.mjs web/test/campaign-editor-messages.test.mjs web/test/admin-i18n.test.mjs`

Expected: FAIL，因为设置区不保证默认展开、商品叠加开关和新提示表均不存在。

- [ ] **Step 3: 实现编辑器交互与可访问结构**

```tsx
const invalidName = !name.trim();
const invalidStart = !startsAt;
if (invalidName || invalidStart) {
  setSettingsOpen(true);
  notify(ct(invalidName ? 'nameRequired' : 'startRequired'), 'error');
  queueMicrotask(() => document.getElementById(invalidName ? 'campaign-name' : 'schedule-starts-at')?.focus());
  return;
}
```

将“设置” section 初始状态设为展开；对保存草稿、创建和发布共用上述预校验。叠加区域新增商品开关，按 Task 3 的行数据渲染本地化说明和两列表格。`details` / `summary` 和表格保持原生语义；说明仅在存在开启项和受影响行时出现。

- [ ] **Step 4: 补齐 11 种编辑器 locale 并运行测试**

Run: `node --test web/test/editor-structure.test.mjs web/test/campaign-editor-messages.test.mjs web/test/admin-i18n.test.mjs`

Expected: PASS，所有 locale 有等量 key，缺失名称/开始时间以及指定市场说明均可本地化。

### Task 5: 将活动列表改为受确认的批量操作与多语言稳定表格

**Files:**
- Modify: `web/src/pages/quantity-breaks.tsx`
- Modify: `web/src/pages/quantity-breaks.module.css`
- Modify: `web/src/prototype/admin-workspace-messages.ts`
- Modify: `web/test/home-entry.test.mjs`
- Modify: `web/test/home-layout.test.mjs`
- Modify: `web/test/admin-dictionaries.test.mjs`

**Interfaces:**
- Consumes: `BridgeConfirmation`、`workspaceText()`、`Campaign.combineProduct`。
- Produces: `activate | pause | delete` 三种确认批量操作、完全本地化的列表/分页文字和稳定列布局。

- [ ] **Step 1: 写出列表失败测试**

```js
assert.doesNotMatch(source, /function CampaignActions/);
assert.doesNotMatch(source, /'end'/);
assert.match(source, /action: 'activate' \| 'pause' \| 'delete'/);
assert.match(source, /<BridgeConfirmation/);
assert.match(source, /<colgroup>/);
assert.match(styles, /overflow-wrap:anywhere/);
```

测试应模拟取消确认以断言 API 没有调用；确认后断言只对需要转换状态的活动调用 API。渲染英语和中文时，断言“商品折扣、订单折扣、运费折扣”以独立节点逐行出现且没有英文硬编码。

- [ ] **Step 2: 运行列表定向测试，确认失败**

Run: `node --test web/test/home-entry.test.mjs web/test/home-layout.test.mjs web/test/admin-dictionaries.test.mjs`

Expected: FAIL，因为当前仍存在行内操作、`end` 操作及英文批量按钮。

- [ ] **Step 3: 实现批量确认和状态处理**

```tsx
const [pendingBatch, setPendingBatch] = useState<BatchAction | null>(null);
const confirmBatch = () => {
  if (!pendingBatch) return;
  onBatchAction([...selectedIds], pendingBatch);
  setPendingBatch(null);
};
```

移除 `CampaignActions` 和行级 toggle/delete props。批量栏只渲染启用、暂停、删除、清除；每个动作设置 `pendingBatch`，再由 `BridgeConfirmation` 根据 action 选择 `confirm`、`warn` 或 `danger`。状态实现将 `active/scheduled` 暂停为 `paused`，将非 active/scheduled 启用为 `active`，删除路径继续先结束已发布的折扣再删除记录。成功和部分失败信息全部调用 `workspaceText()`。

用 `colgroup` 定义勾选、活动、商品、档位、状态、开始、结束、叠加列；删除所有互相覆盖的 `nth-child` 宽度。桌面表头和数据居中、允许换行，`1024px` 以下保留滚动容器，`767px` 以下使用已有移动卡片。对桌面和卡片内组合项使用 block/stack 显示。

- [ ] **Step 4: 补齐 11 种 workspace locale 并运行测试**

Run: `node --test web/test/home-entry.test.mjs web/test/home-layout.test.mjs web/test/admin-dictionaries.test.mjs web/test/admin-i18n.test.mjs`

Expected: PASS，确认文案、表头、选择数量、分页及三种叠加类型均为本地化文案。

### Task 6: 全量验证、视觉核验和进度记录

**Files:**
- Modify: `docs/APP_PROGRESS.md`
- Create: `docs/reference/screenshots/quantity-breaks-campaign-list-1440.png`
- Create: `docs/reference/screenshots/quantity-breaks-campaign-list-1024.png`
- Create: `docs/reference/screenshots/quantity-breaks-campaign-list-768.png`
- Create: `docs/reference/screenshots/quantity-breaks-campaign-list-390.png`

**Interfaces:**
- Consumes: Tasks 1-5 的完成代码和运行的开发服务。
- Produces: 可追溯的验证结果、截图与不夸大的 `APP_PROGRESS` 记录。

- [ ] **Step 1: 运行所有自动化验证**

Run:

```bash
(cd worker && npm test)
(cd worker && npm run typecheck)
(cd worker && npm run test:module-boundaries)
(cd worker && npm run build)
node --test app/test/*.test.cjs
(cd web && npm run test:prototype)
(cd web && npx tsc --noEmit)
(cd web && npm run build)
npm run test:theme
git diff --check
```

Expected: 全部退出码为 0；若测试环境仅输出已知 Vite WebSocket 警告，记录为警告而非成功证据缺失。

- [ ] **Step 2: 进行浏览器视觉核验**

在认证或本地可用的管理页分别以 `1440px`、`1024px`、`768px`、`390px` 截图。检查长英文、中文和至少一个较长欧洲语言下：列不重叠、标题可读、确认弹窗能取消、设置区默认展开、缺失名称/开始时间会聚焦对应字段。

- [ ] **Step 3: 更新进度文档**

将自动化命令的实际结果、截图路径、未能完成的真实 SHOPLINE 验证与任何已知限制写入 `docs/APP_PROGRESS.md`。不把无法访问真实店铺或 Function 结账的检查标注为完成。

- [ ] **Step 4: 审查变更集并遵守推送流程**

Run:

```bash
git status --short
git diff --check
git diff --stat
git diff -- worker app web docs
```

确认不包含 token、`.env`、数据库文件或桌面 `main` 的未关联修改。向用户列出新增、修改和删除文件及拟定提交信息；按 `AGENTS.md` 精确询问“本次代码/文档已在本地更新，是否推送到 GitHub？”，并在未得到明确授权前停止。
