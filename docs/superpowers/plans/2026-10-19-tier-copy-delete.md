# 数量档位复制与删除实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为每个活动档位加入可访问的复制与删除图标操作，删除必须二次确认，并保持现有拖拽、表单和实时预览可用。

**Architecture:** 档位数组仍由 `CampaignEditor` 管理；新增纯函数封装复制与删除的不可变更新，降低拖拽和表单状态相互影响。确认弹窗使用现有页面模态样式，但补齐焦点管理与 Escape 行为；所有操作在保存前仅修改草稿。

**Tech Stack:** React 18、TypeScript、Lucide、`@dnd-kit`、CSS Modules、Vite、`node:test`；弹窗交互测试增加 `jsdom` 开发依赖。

**Spec:** `docs/superpowers/specs/2026-10-19-admin-api-tier-actions-design.md`

## Global Constraints

- 复制生成新的稳定 `tierId`，插在源档位之后，数量取大于源数量的第一个未占用正整数，清除 `recommended`。
- 复制保留其余折扣、市场、标题、副标题和标签；嵌套市场覆盖必须独立，不能共享可变对象。
- 删除必须弹窗确认；只剩一个档位时禁用删除。取消、Escape、点击遮罩都不改草稿。
- 图标按钮与拖拽手柄独立，含 tooltip 和可访问名称；11 种后台语言需保持键值一致。
- 不改变真实折扣或远程数据，直到商家显式保存活动；不推送未经批准的文件。

## Review Focus

- 来源数量后方已有相邻数量：复制应跳到下一个未占用值；Task 1 测试覆盖。
- 来源是推荐档：复制不能产生第二个推荐档；Task 1 测试覆盖。
- 复制固定金额档：编辑副本市场覆盖不应修改原档；Task 1 测试覆盖。
- 删除弹窗打开后商家按 Escape 或点击遮罩：档位和焦点应恢复；Task 2 测试和浏览器检查覆盖。
- 拖拽后再复制/删除：动作目标应由稳定 `tierId` 决定，不能使用旧索引；Task 2 测试覆盖。

---

### Task 1: 档位数据操作

**Files:**
- Create: `web/src/prototype/tier-actions.ts`，只包含 `copyTierAfter`、`removeTierById` 两个纯函数。
- Create: `web/test/tier-actions.test.mjs`。

**Interfaces:**
- Consumes: `Tier` from `web/src/prototype/model.ts` and array item `Tier & { tierId: string }`。
- Produces: `copyTierAfter<T extends Tier & { tierId: string }>(tiers: T[], sourceId: string, newId: string): T[]`；`removeTierById<T extends Tier & { tierId: string }>(tiers: T[], id: string): T[]`。未知 ID 保持原数组；移除最后一个档位返回原数组。

- [ ] **Step 1: 写失败测试。** 在 Vite SSR 加载真实 `tier-actions.ts`，输入数量 `2, 3, 5`，复制数量 2 的档位，断言新档紧跟其后、数量是 4、新 ID 不同、不推荐；更改副本的 `marketOverrides` 后原档保持不变。另断言移除未知 ID 和唯一档位都不改变数组。

```js
const copied = copyTierAfter(tiers, 'two', 'copy');
assert.deepEqual(copied.map(({ quantity }) => quantity), [2, 4, 3, 5]);
assert.equal(copied[1].tierId, 'copy');
assert.equal(copied[1].recommended, false);
assert.notStrictEqual(copied[1].marketOverrides, copied[0].marketOverrides);
```

- [ ] **Step 2: 运行 `node --test web/test/tier-actions.test.mjs`。** 预期因模块/导出缺失而失败。
- [ ] **Step 3: 写最小实现。** 用 `findIndex` 定位来源；从 `source.quantity + 1` 起寻找未占用正整数；以 `structuredClone(source)` 复制嵌套值并覆写 `tierId`、`quantity`、`recommended: false`；`removeTierById` 仅在长度大于 1 且 ID 存在时过滤。
- [ ] **Step 4: 重跑定向测试和 `npm run test:prototype -w web`。** 检查红转绿，记录任何既有失败。
- [ ] **Step 5: 审查精确差异。** `git diff --check`；只在当前批次允许时创建本地提交，不自动推送。

### Task 2: 编辑器图标与确认弹窗

**Files:**
- Modify: `web/src/prototype/CampaignEditor.tsx`，接入纯函数、`Copy`/`Trash2` 图标和待删除 `tierId` 状态。
- Create: `web/src/prototype/TierDeleteDialog.tsx`，只负责可访问确认流程。
- Modify: `web/src/pages/quantity-breaks.module.css`，使用当前紧凑灰白编辑器风格；不改变其他页面。
- Modify: `web/package.json` 和锁文件，增加 `jsdom` 开发依赖以运行真实 DOM 事件测试。
- Test: `web/test/editor-structure.test.mjs`、`web/test/tier-delete-dialog.test.mjs`。

**Interfaces:**
- Consumes: Task 1 两个纯函数，以及现有 `ct()` 翻译键。
- Produces: `TierDeleteDialog({ label, quantity, onCancel, onConfirm, ... })`；确认后通过稳定 `tierId` 删除并清理该 ID 的金额草稿/错误及 `${tierId}:` 市场输入状态。

- [ ] **Step 1: 准备测试环境并写失败测试。** 执行 `npm install -D jsdom -w web`；通过 Vite SSR 渲染真实编辑器并断言每档都有命名为“Copy tier”和“Delete tier”的独立按钮。`tier-delete-dialog.test.mjs` 使用 `jsdom`、`react-dom/client` 和 `react-dom/test-utils` 挂载真实弹窗，派发 click/keydown，覆盖 Cancel、Escape、遮罩和 Confirm；Confirm 才调用删除。仅一个档位时删除按钮禁用。

```js
assert.match(html, /aria-label="Copy tier"/);
assert.match(html, /aria-label="Delete tier"/);
assert.equal(onConfirmCalls, 0); // Cancel、Escape 和遮罩关闭后
```

- [ ] **Step 2: 运行定向测试观察预期失败。** `node --test web/test/editor-structure.test.mjs web/test/tier-delete-dialog.test.mjs`。
- [ ] **Step 3: 最小 UI 实现。** 在 `SortableTierRow` 的面板标题区域放两个 `type="button"` 图标；阻止指针事件冒泡到拖拽手柄，但不更改拖拽传感器。`pendingDeleteId` 仅表示待确认档位；弹窗内部 Esc、遮罩、Cancel 调用 `onCancel`，Confirm 调用 `onConfirm`。焦点进入弹窗并在关闭后回到触发处；若原触发器随确认删除而消失，聚焦相邻档位标题。
- [ ] **Step 4: 验证状态清理。** 确认后调用 `removeTierById`，删除 `amountDrafts[id]`、`amountErrors[id]` 以及所有以 `${id}:` 开头的市场草稿/错误键；取消时一个状态也不改变。拖拽后依据 ID 而不是旧 index 操作。
- [ ] **Step 5: 跑测试。** `npm run test:prototype -w web` 与 `npm run build -w web`，修复新增失败；手动测试复制、取消、确认、Esc 和拖拽组合。

### Task 3: 翻译、响应式与回归

**Files:**
- Modify: `web/src/prototype/campaign-editor-messages.ts`，加入复制、删除和确认文案的 11 语言键。
- Test: `web/test/campaign-editor-messages.test.mjs`。
- Update: `docs/APP_PROGRESS.md`，记录该模块的实际验证状态。

**Interfaces:**
- Consumes: `campaignText(locale, key)`；新增键建议 `copyTier`、`deleteTier`、`deleteTierTitle`、`deleteTierBody`、`confirmDeleteTier`、`cancelDeleteTier`。
- Produces: 11 种语言同构字典；按钮、tooltip、弹窗从当前后台语言获取文案。

- [ ] **Step 1: 写失败测试。** 对 11 个 locale 逐一检查六个新键返回非空字符串；英文和简体中文断言实际可见文案，不使用英文硬编码替代其他语言。
- [ ] **Step 2: 运行字典测试看红灯，再补全部译文并看绿灯。** 保留字典数组键和值的索引一致性。
- [ ] **Step 3: 浏览器检查。** 如有可用浏览器工具，以 1440px 和 390px 查看创建与编辑页；核对按钮不遮住标题、tooltip、焦点、弹窗、长译文换行、拖拽、复制后实时预览和保存后重载。当前会话没有浏览器自动化工具；若执行时仍不可用，明确标记视觉验收未验证，不把 SSR 测试当作截图核验。
- [ ] **Step 4: 全量验证。** `npm run test:prototype -w web`、`npm test -w app`、`npm run build -w web`、`npm run build -w app`、`git diff --check`；不能用构建成功替代交互测试。
- [ ] **Step 5: 审查交付。** 更新进度和遗留问题，列出文件及拟提交信息；推送 GitHub 前必须按 `AGENTS.md` 再征得明确许可。
