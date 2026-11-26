# 本批待批准变更清单

目标仓库：https://github.com/TouchFish-Good/Kaching-Bundles-App-Upsells-Test.git

分支：`codex/gifts-bundles-test`。拟提交：`fix(test): refine gift and bundle editor and preview behavior`。

修改编辑器／预览／主题运行时、共享样式校验和Worker预览元数据；新增款式／条件／颜色控件及本地验收截图。无删除，无正式环境或配置凭证改动。

## 修改文件

- `docs/APP_PROGRESS.md`
- `docs/COMPONENTS.md`
- `docs/DESIGN_SPEC.md`
- `docs/REQUIREMENTS.md`
- `docs/USER_FLOWS.md`
- `scripts/theme-offer-runtime.js`
- `shared/offer-core.cjs`
- `shared/offer-core.d.cts`
- `shared/offer-core.mjs`
- `tests/offer-modules/core.test.cjs`
- `tests/offer-modules/cross-layer.test.mjs`
- `tests/theme-app-extension/helpers/offer-fixture.mjs`
- `tests/theme-app-extension/offers.test.mjs`
- `theme-app-extension/compatibility/assets/app-block.css`
- `theme-app-extension/compatibility/assets/app-block.js`
- `theme-app-extension/public/app-block.css`
- `theme-app-extension/public/app-block.js`
- `web/src/prototype/OfferModulePanel.tsx`
- `web/src/prototype/OfferPreview.tsx`
- `web/src/prototype/OfferStyleEditor.tsx`
- `web/src/prototype/offer-preview-client.ts`
- `web/src/prototype/offer-selection.ts`
- `web/src/prototype/offers.module.css`
- `web/test/offer-editor.test.mjs`
- `worker/src/services/offer-index.ts`
- `worker/src/services/offer-preview.ts`
- `worker/test/offer-preview.test.ts`

## 新增源码

- `web/src/prototype/OfferColorPicker.tsx`
- `web/src/prototype/OfferTriggerEditor.tsx`
- `web/src/prototype/OfferVariantPicker.tsx`
- `web/src/prototype/offer-style-editor.module.css`
- `web/src/prototype/offer-ui-copy.ts`

## 新增验收资料

- `docs/local/gifts-bundles-refinement/CHANGESET.md`
- `docs/local/gifts-bundles-refinement/README.md`
- `docs/local/gifts-bundles-refinement/browser-evidence.json`
- `docs/local/gifts-bundles-refinement/color-popover-1440.png`
- `docs/local/gifts-bundles-refinement/color-popover-390.png`
- `docs/local/gifts-bundles-refinement/native-2.1-carousel-1440.png`
- `docs/local/gifts-bundles-refinement/native-2.1-carousel-390.png`
- `docs/local/gifts-bundles-refinement/native-2.1-grid-1440.png`
- `docs/local/gifts-bundles-refinement/native-2.1-grid-390.png`
- `docs/local/gifts-bundles-refinement/native-2.1-horizontal-1440.png`
- `docs/local/gifts-bundles-refinement/native-2.1-horizontal-390.png`
- `docs/local/gifts-bundles-refinement/native-2.1-list-1440.png`
- `docs/local/gifts-bundles-refinement/native-2.1-list-390.png`
- `docs/local/gifts-bundles-refinement/native-2.1-stacked-1440.png`
- `docs/local/gifts-bundles-refinement/native-2.1-stacked-390.png`
- `docs/local/gifts-bundles-refinement/native-3-carousel-1440.png`
- `docs/local/gifts-bundles-refinement/native-3-carousel-390.png`
- `docs/local/gifts-bundles-refinement/native-3-grid-1440.png`
- `docs/local/gifts-bundles-refinement/native-3-grid-390.png`
- `docs/local/gifts-bundles-refinement/native-3-horizontal-1440.png`
- `docs/local/gifts-bundles-refinement/native-3-horizontal-390.png`
- `docs/local/gifts-bundles-refinement/native-3-list-1440.png`
- `docs/local/gifts-bundles-refinement/native-3-list-390.png`
- `docs/local/gifts-bundles-refinement/native-3-stacked-1440.png`
- `docs/local/gifts-bundles-refinement/native-3-stacked-390.png`
- `docs/local/gifts-bundles-refinement/native-browser-evidence.json`
- `docs/local/gifts-bundles-refinement/preview-grid-1440.png`
- `docs/local/gifts-bundles-refinement/preview-grid-390.png`
- `docs/local/gifts-bundles-refinement/preview-horizontal-1440.png`
- `docs/local/gifts-bundles-refinement/preview-horizontal-390.png`
- `docs/local/gifts-bundles-refinement/preview-list-1440.png`
- `docs/local/gifts-bundles-refinement/preview-list-390.png`
- `docs/local/gifts-bundles-refinement/preview-stacked-1440.png`
- `docs/local/gifts-bundles-refinement/preview-stacked-390.png`
- `docs/local/gifts-bundles-refinement/protection-evidence.json`
- `docs/local/gifts-bundles-refinement/settings-1440.png`
- `docs/local/gifts-bundles-refinement/settings-390.png`
- `docs/local/gifts-bundles-refinement/style-opacity-1440.png`
- `docs/local/gifts-bundles-refinement/style-opacity-390.png`
- `docs/local/gifts-bundles-refinement/unpriced-1440.png`
- `docs/local/gifts-bundles-refinement/unpriced-390.png`
- `docs/local/gifts-bundles-refinement/variants-modal-1440.png`
- `docs/local/gifts-bundles-refinement/variants-modal-390.png`
- `docs/local/gifts-bundles-refinement/verification.json`
