# PC 与移动端独立样式实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让 Quantity Breaks 活动的全部组件样式可按 PC 与移动端分别编辑、预览、保存，并让主题前台按视口宽度使用对应配置。

**Architecture:** 保留现有 `CampaignWidgetConfig` 根字段作为 PC 配置，增加可选的完整 `mobile` 配置。编辑器使用一个 `activePreviewDevice` 选择当前配置，预览和样式表单共享该选择；旧活动没有移动配置时由规范化函数深拷贝 PC 配置。主题在 768px 断点使用 PC 或移动配置，保留活动与购物车数据，只重新应用组件样式和选择器行为。

**Tech Stack:** React 18、TypeScript、CSS Modules、SHOPLINE theme vanilla JavaScript/CSS、Node `node:test`、Express 服务端校验。

**Spec:** `docs/superpowers/specs/2026-10-21-device-specific-widget-style-design.md`

## Global Constraints

- 现有 `widget.version: 1` 和 PC 根级字段保持兼容。
- 移动端配置是完整样式配置，不使用未定义的差异补丁格式。
- 旧活动没有 `widget.mobile` 时，移动端使用 PC 配置的深拷贝。
- 公开活动 API 不新增权限或接口。
- 768px 以下使用移动配置，缺少移动配置时回退 PC 配置。
- 不改变 Discount Function input、发布流程、折扣计算或活动翻译数据。
- 视觉验收必须保留桌面与 390px 截图；无法访问真实店铺时在 `docs/APP_PROGRESS.md` 标记未验收。

## Review Focus

- 旧活动没有移动配置：读取、保存和主题渲染都必须保持原有 PC 外观。
- 两端同时有无效 HEX：保存必须定位到具体设备与字段，而不是只校验当前设备。
- 移动端设置布局为 horizontal/grid：768px 以下仍应遵循移动端配置和单列规则，不与 PC 设置泄漏。
- PC/移动切换时有混搭 Variant：若新设备禁止混搭，应保留第一个有效 Variant 或按默认选择恢复，不能发送无效加购组合。
- 主题跨越 768px 断点：不得重复请求活动、清空选中档位或规格选择。

### Task 1: 扩展样式配置模型与服务端校验

**Files:**
- Modify: `web/src/prototype/widget-config.ts`
- Modify: `app/src/service/campaign/widget-config.ts`
- Test: `web/test/widget-layout.test.mjs`
- Test: `app/test/campaign-domain.test.cjs`

**Interfaces:**
- Produces `CampaignWidgetConfig.mobile?: CampaignWidgetStyleConfig` semantics while preserving existing root PC fields.
- `normalizeCampaignWidgetConfig` returns a fully usable PC config and a mobile fallback without mutating input.
- `validateCampaignWidgetConfig` validates the root config and mobile config with the same field limits and unknown-field rules.

- [ ] **Step 1: Write the failing tests**

Add tests that assert a legacy config normalizes with a mobile copy equal to PC, a mobile color/layout change remains independent, nested colors and typography are deep-cloned, and invalid mobile color/unknown fields are rejected.

- [ ] **Step 2: Run the focused tests and verify failure**

Run `node --test test/widget-layout.test.mjs` from `web` and `node --test -r ts-node/register test/campaign-domain.test.cjs` from `app`. Expected failure: the current config has no mobile property and service validation does not inspect it.

- [ ] **Step 3: Implement the shared config shape and normalization**

Extract or define the style-only type so the existing root fields remain the PC representation. Add optional `mobile` to the public config type. Normalize by cloning the root style into `mobile` when absent; clone nested `card`, `colors`, `typography`, and `variants` independently. Keep `version` only at the root and accept legacy configs without `badgePosition` using current defaults.

- [ ] **Step 4: Implement server validation**

Validate root and mobile with the same allowed keys, integer ranges, color regex, typography weight rules, layout/badge/selector enums, and boolean checks. Return existing validation error style with a `widget.mobile` path for mobile failures.

- [ ] **Step 5: Run focused and domain tests**

Run both commands from Step 2. Expected: all new and existing tests pass.

### Task 2: Add device selection to the style editor and synchronize preview

**Files:**
- Modify: `web/src/prototype/CampaignEditor.tsx`
- Modify: `web/src/prototype/CampaignStyleEditor.tsx`
- Modify: `web/src/pages/quantity-breaks.module.css`
- Test: `web/test/editor-structure.test.mjs`
- Test: `web/test/widget-layout.test.mjs`

**Interfaces:**
- `CampaignEditor` owns `activePreviewDevice: 'desktop' | 'mobile'` and passes the current config plus `onChange` to the style editor.
- `CampaignStyleEditor` receives `device`, `value`, and `onChange`; it renders the PC/mobile segmented control and never mutates the inactive config.
- Preview receives the selected device config and existing `device` prop.

- [ ] **Step 1: Write failing interaction tests**

Render the editor with a legacy campaign, click the mobile style toggle, change layout/color, click PC, and assert the PC value is unchanged while the mobile value changed. Assert the preview and style toggle expose the same `aria-pressed` device. Add a test that an invalid mobile color causes the editor save validation to select mobile and target the mobile color field.

- [ ] **Step 2: Run tests and verify failure**

Run `npm run test:prototype` from `web`. Expected failure: no style-level device control exists and the editor has only one widget object.

- [ ] **Step 3: Implement editor state and config selection**

Keep `activePreviewDevice` as the single source of truth. Derive `desktopWidget` from the root config and `mobileWidget` from `widget.mobile ?? clone(desktopWidget)`. When a mobile field changes, write the complete mobile object; when a desktop field changes, update root fields and preserve mobile. Close open color popovers on device change.

- [ ] **Step 4: Add the style segmented control**

Place a compact PC/mobile control at the top of the existing style editor using the same visual treatment as `.previewDeviceToggle`, with accessible labels and `aria-pressed`. Keep all existing layout, card, color, typography, and variant controls bound to the selected config.

- [ ] **Step 5: Bind preview to selected config**

Pass the selected config to `StorefrontWidget` and keep the existing mobile phone frame. Preview device buttons call the same state setter used by the style editor. Preserve selected product, tier, and existing preview interaction.

- [ ] **Step 6: Handle validation focus for both devices**

Compute invalid color keys for desktop and mobile. On submit, prefer the first invalid device, set `activePreviewDevice`, open the style panel, and focus an ID that includes the device and color key. Do not hide an invalid inactive-device value.

- [ ] **Step 7: Run the full frontend test suite**

Run `npm run test:prototype`, `npx tsc --noEmit`, and `npm run build` from `web`. Expected: all tests pass, type check and production build succeed.

### Task 3: Apply device-specific configuration in the theme widget

**Files:**
- Modify: `theme-app-extension/public/app-block.js`
- Modify: `theme-app-extension/public/app-block.css`
- Test: `tests/theme-app-extension/widget-mount.test.mjs`

**Interfaces:**
- Theme campaign payload remains `{ campaign: { widget } }`.
- Runtime selects `widget.mobile` when `window.matchMedia('(max-width: 767px)')` matches, otherwise root PC widget.

- [ ] **Step 1: Write failing theme tests**

Add tests with a campaign containing distinct PC/mobile layout, badge position, colors, and selector settings. Mock `matchMedia` for desktop and mobile and assert the rendered container data/layout/CSS variables use the correct config. Assert a legacy campaign without mobile uses the PC config.

- [ ] **Step 2: Run theme tests and verify failure**

Run `npm run test:theme` from the repository root. Expected failure: the current theme always reads root `campaign.widget`.

- [ ] **Step 3: Implement runtime config selection**

Create a small selector that returns the mobile config when the media query matches and otherwise returns root config, falling back to root when mobile is absent. Keep the active tier and selections outside the style config so selection state survives rerender.

- [ ] **Step 4: Reapply on media query changes**

Register one `change` listener on the media query after mount. Re-render the widget using the selected config without fetching the campaign again. Remove the listener on block teardown or before remount to avoid duplicate handlers.

- [ ] **Step 5: Align CSS breakpoints**

Change only the relevant horizontal/grid responsive selectors from `520px` to `767px` where needed, preserving existing theme layout and user-approved Grid column behavior. Ensure mobile configuration is not overwritten by CSS declarations intended only for PC.

- [ ] **Step 6: Run theme tests and inspect diff**

Run `npm run test:theme` and `git diff --check`. Expected: all theme tests pass and no whitespace errors appear.

### Task 4: Persist, migrate, and verify end-to-end behavior

**Files:**
- Modify: `web/src/prototype/campaign-adapter.ts`
- Modify: `app/src/service/campaign/repository.ts` only if serialization needs an explicit migration
- Modify: `docs/APP_PROGRESS.md`
- Test: `web/test/campaign-adapter.test.mjs`
- Test: `app/test/campaign-repository.test.cjs`

**Interfaces:**
- Existing admin campaign payloads with root `widget` continue round-tripping without dropping `mobile`.
- Repository persists the complete normalized widget object and increments revisions through the existing save path.

- [ ] **Step 1: Write migration and round-trip tests**

Assert adapter conversion preserves independent desktop/mobile configs, repository save/read retains both nested configs, and legacy campaign read returns mobile fallback without modifying stored JSON until an explicit save.

- [ ] **Step 2: Implement adapter/repository compatibility**

Ensure API-to-editor conversion normalizes mobile without aliasing the desktop object and editor-to-API conversion serializes both configs. Keep publication payload generation unchanged apart from carrying the widget display configuration already returned to storefront.

- [ ] **Step 3: Run all automated checks**

Run `npm run test:prototype`, `npm run test:theme`, `npm test` in `app`, `/usr/local/go/bin/go test ./...` in `product-discount-customizations`, `npx tsc --noEmit`, both `npm run build` commands, and `git diff --check`. Expected: all commands exit 0; note existing Vite WebSocket `EPERM` warnings if they appear.

- [ ] **Step 4: Perform visual verification**

Start the local web app, capture the editor at approximately 1440px and 390px, switch PC/mobile style controls, set visibly different colors/layouts, and verify each preview changes independently with no overflow. Capture screenshots under `docs/reference/screenshots/`. If browser or store authentication is unavailable, record that limitation instead of marking visual verification complete.

- [ ] **Step 5: Update progress and review files**

Append a dated `IN_PROGRESS` or `VERIFIED` entry to `docs/APP_PROGRESS.md` with exact test counts, screenshot paths, and any unavailable real-store checks. Review `git status`, all changed and untracked files, and exclude tunnel addresses, tokens, build artifacts, and unrelated prior changes from the eventual commit.

- [ ] **Step 6: Commit the approved implementation set**

After user review of the completed local change set, stage only reviewed files and commit with a descriptive message. Pushing requires a separate explicit approval under `AGENTS.md`.
