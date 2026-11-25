import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

test('local original copy is available without any store language response', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { storefrontCopy } = await vite.ssrLoadModule('/src/prototype/storefront-copy.ts');
    assert.ok(storefrontCopy.length > 0);
    assert.ok(storefrontCopy.every((entry) => entry.source));
    const source = readFileSync(new URL('../src/prototype/Translations.tsx', import.meta.url), 'utf8');
    assert.match(source, /load\.status === "error"[\s\S]*translationCopy\.filter/);
    assert.match(source, /disabled=\{copyState !== "ready" \|\| load\.status !== "ready"\}/);
    assert.doesNotMatch(source, /\{t\('translationUnavailable'\)\} \(\{load\.error\}\)/);
    assert.match(source, /t\(groupKey\[group\]\)/);
    assert.match(source, /translationLoadingToolbar/);
    assert.match(source, /translationLoadingRows/);
    assert.doesNotMatch(source, /translationLoadingFrame[^\n]*loadingFrameHeader|translationLoadingFrame[^\n]*loadingFrameRows/);
    const shell = readFileSync(new URL('../src/pages/quantity-breaks.tsx', import.meta.url), 'utf8');
    assert.match(shell, /<Translations key=\{shop\?\.storeId/);
    assert.match(shell, /visibilitychange/);
  } finally { await vite.close(); }
});

test('translation list renders source copy above its merchant translation without column headings', () => {
  const source = readFileSync(new URL('../src/prototype/Translations.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/pages/quantity-breaks.module.css', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /translationListColumns|translationGroupColumns/);
  assert.doesNotMatch(source, /translationDefaultCopy|translationFallback|translationSubtitle/);
  assert.doesNotMatch(source, /<div><span>\{t\('translationOriginal'\)\}<\/span><p>\{entry.source\}<\/p><\/div>/);
  assert.match(source, /aria-label=\{`\$\{t\('translationMerchant'\)\}: \$\{entry.source\}`\}/);
  assert.match(css, /\.translationOriginalValue\s*\{/);
  assert.match(css, /\.translationRow\s*\{[^}]*grid-template-columns:minmax\(0,1fr\)/);
});

test('unsaved translation state uses a SaveBar and confirms before discarding', async () => {
  const source = await readFile(new URL('../src/prototype/Translations.tsx', import.meta.url), 'utf8');
  assert.match(source, /translationSaveBar/);
  assert.match(source, /discardAndSwitch/);
  assert.match(source, /saveAndSwitch/);
  assert.doesNotMatch(source, /UnsavedTranslationDialog/);
  assert.match(source, /BridgeConfirmation/);
  assert.match(source, /!app && discardConfirmationOpen/);
  assert.doesNotMatch(source, /EXIT_SAVE_BAR_CONFIRM/);
  assert.match(source, /discardChangesConfirm/);
});
