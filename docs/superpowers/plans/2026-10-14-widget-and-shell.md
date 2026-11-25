# 页面精简与任意数量规格选择实施计划

> **执行要求：** 使用 `superpowers:executing-plans` 逐项实施，步骤以复选框跟踪；实现前先读关联设计规格。不得未经许可推送。

**目标：** 清理重复导航/创建操作与不真实文案，修复数量超过五件的规格选择和价格预览。

**架构：** 沿用现有 React/Vite 原型与 `CampaignEditor`、`StorefrontWidget`。将档位数量对应的初始规格生成逻辑提为纯函数，再由组件使用；不修改购物车正式接口。

**技术栈：** React 18、TypeScript、CSS Modules、Node test runner、Vite。

**规格：** `docs/superpowers/specs/2026-10-14-tier-markets-and-translations-design.md`

## 全局约束

- 以已观察的 Shopify 页面为视觉基准；同视口截图对比，不凭印象宣布 `VERIFIED`。
- 保留现有活动操作和混合 Variant 行为；预览并非结账权威。
- 只改本计划涉及的 UI/原型文件；不调用真实店铺写入接口。

## 重点风险

- 数量 6、10、20 必须分别生成同数量选择器并参与总价；不能回到五件上限。
- 缩小再增大档位须保留仍有效的选择；不能让缺货规格被自动选中。
- 同 SKU 重复选择须合并库存校验；库存不足时不可报加购成功。
- 空活动列表只保留一个可见创建操作；搜索无结果时保持清除筛选操作。
- 未连接店铺时不得把 Mora Beauty、虚构销量或产品当作真实数据。

---

### Task 1: 规格数量与预览价格

**文件：** 新建 `web/src/prototype/slot-selection.ts`、`web/test/slot-selection.test.mjs`；修改 `web/src/prototype/StorefrontWidget.tsx`。

**接口：** `extendSlots(current: SlotSelection[], quantity: number, seed: SlotSelection): SlotSelection[]`，返回恰好 `quantity` 个位置，保留原有前缀；`quantity` 必须为正整数。价格预览对每档调用该函数后映射全部 Variant 价格。

测试断言示例：

```js
assert.equal(extendSlots(firstFive, 6, firstFive[0]).length, 6);
assert.equal(extendSlots(firstFive, 10, firstFive[0]).length, 10);
assert.deepEqual(extendSlots(firstFive, 1, firstFive[0]), [firstFive[0]]);
assert.throws(() => extendSlots(firstFive, 0, firstFive[0]), /positive integer/);
```

- [ ] 写失败测试：`extendSlots(five, 6, seed).length === 6`；`extendSlots(two, 10, seed).length === 10`；缩至 1 后首项不变；非法数量抛错。
- [ ] 运行 `cd web && npm run test:prototype`，确认新增测试因模块/函数不存在而失败。
- [ ] 实现纯函数并替换 `firstSlots.slice(...)` 两处；初始化与切换档位均调用它，组件所见位置数与数量一致。
- [ ] 添加组件结构测试：档位 6 的预览价格输入包含六项；相同 SKU 数量累计后按库存阻止模拟加购。再次运行测试，要求全部通过。
- [ ] 在本地页面分别选 1/5/6/10 件、切换桌面与手机，检查选择器、价格、售罄与失败反馈。保存同视口截图并更新 `docs/APP_PROGRESS.md`，只记录实际验证内容。

### Task 2: Overview 与文案真实性

**文件：** 修改 `web/src/pages/quantity-breaks.tsx`、`web/src/pages/quantity-breaks.module.css`、`web/src/prototype/data.ts`；修改 `web/test/home-layout.test.mjs`。

**接口：** Overview 有活动时只在页头显示一个主要创建按钮；空活动时仅显示一个创建按钮；导航不渲染无意义的层级或页脚。演示数据通过可见的演示标识与店铺数据区分。

结构测试断言示例：

```js
assert.equal((overviewMarkup.match(/Create campaign/g) ?? []).length, 1);
assert.doesNotMatch(overviewMarkup, /Apps \/ Bundle deals/);
assert.match(disconnectedMarkup, /Demo data|演示数据/);
```

- [ ] 写失败测试：有活动与空活动状态均只出现一个创建操作；页面不再包含 `Apps / Bundle deals` 或侧栏底部 `Bundle deals`；未连接时显示演示标识而非真实店铺断言。
- [ ] 运行 `cd web && npm run test:prototype`，记录预期失败。
- [ ] 删除重复入口并调整空状态条件；将虚构店铺名称、产品名和指标标识为演示，或在无数据时显示空/不可用状态，不保留假完成率。
- [ ] 运行 `cd web && npm run test:prototype && npm run build`；手动测试创建、搜索、筛选、编辑、停用、删除入口，确认原功能未退化。
- [ ] 用相同桌面/移动视口与 Shopify 参考图对照布局、字体、间距和状态；记录未验证项并更新 `docs/APP_PROGRESS.md` 与 `docs/VISUAL_GAP_REPORT.md`。

### 本计划验收

执行 `cd web && npm run test:prototype && npm run build`；通过所有新增断言后，再核对桌面/手机截图和主要交互。检查 `git diff` 与新增文件，不提交密钥。仅在用户批准本批文件后推送。
