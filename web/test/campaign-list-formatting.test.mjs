import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createServer } from 'vite';

test('campaign list timestamps include seconds in the campaign timezone', async () => {
  const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  try {
    const { formatCampaignDateTime } = await vite.ssrLoadModule('/src/prototype/campaign-adapter.ts');
    assert.match(formatCampaignDateTime('2026-10-27T12:34:56Z', 'zh-Hans', 'Asia/Shanghai'), /20:34:56/);
    assert.equal(formatCampaignDateTime(undefined, 'zh-Hans'), '持续进行');
  } finally { await vite.close(); }
});

test('campaign list tiers show quantity, discount type, and configured major-unit value', async () => {
  const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  try {
    const { formatTierSummary } = await vite.ssrLoadModule('/src/prototype/campaign-adapter.ts');
    assert.equal(formatTierSummary([
      { quantity: 1, discountType: 'none', discountPercent: 0 },
      { quantity: 2, discountType: 'percentage', discountValue: 10, discountPercent: 10 },
      { quantity: 3, discountType: 'bundle_fixed_amount', discountValue: 10000, discountPercent: 0 },
    ], 'zh-Hans'), '1件 原价 · 2件 百分比折扣 10 · 3件 整单固定减免 100');
  } finally { await vite.close(); }
});

test('campaign list bulk cancellation is localized and the fallback pause dialog uses Cancel and Pause', async () => {
  const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  try {
    const { workspaceText } = await vite.ssrLoadModule('/src/prototype/admin-workspace-messages.ts');
    assert.equal(workspaceText('zh-Hans', 'clearSelection'), '取消');
    assert.equal(workspaceText('en', 'clearSelection'), 'Cancel');

    const source = await readFile(new URL('../src/pages/quantity-breaks.tsx', import.meta.url), 'utf8');
    assert.match(source, /action === 'pause' \? wt\('pause'\) : wt\('enable'\)/);
    assert.match(source, /<Button variant="secondary" disabled=\{submitting\} onClick=\{onClose\}>\{t\('cancel'\)\}<\/Button><Button variant=\{action === 'delete' \? 'danger' : 'primary'\} disabled=\{submitting\} onClick=\{onConfirm\}>\{actionLabel\}<\/Button>/);
    assert.match(source, /type=\{action === 'delete' \? 'danger' : 'confirm'\}/);
  } finally { await vite.close(); }
});

test('campaign list checkbox column is input-sized and preserves the table layout', async () => {
  const css = await readFile(new URL('../src/pages/quantity-breaks.module.css', import.meta.url), 'utf8');
  const source = await readFile(new URL('../src/pages/quantity-breaks.tsx', import.meta.url), 'utf8');
  assert.match(css, /\.listCheckCol\s*\{\s*width:32px;\s*\}/);
  assert.match(css, /\.listCampaignCol\s*\{\s*width:calc\(\(100% - 32px\) \* \.12\);\s*\}/);
  assert.match(css, /\.listDiscountNameCol\s*\{\s*width:calc\(\(100% - 32px\) \* \.12\);\s*\}/);
  assert.match(css, /\.listCombinationsCol\s*\{\s*width:calc\(\(100% - 32px\) \* \.20\);\s*\}/);
  assert.match(css, /\.homeCampaignTable\{min-width:1160px;table-layout:fixed\}/);
  assert.match(css, /\.homeCampaignTable \.checkboxColumn\{width:32px;padding:0 0 0 16px;text-align:center\}/);
  assert.doesNotMatch(css, /\.homeCampaignTable thead,.homeCampaignTable tbody\{display:block\}/);
  assert.doesNotMatch(css, /\.homeCampaignTable tr\{display:grid/);
  assert.match(css, /\.mobileCampaignCard dd>span\{display:block\}/);
  assert.match(source, /<colgroup><col className=\{styles\.listCheckCol\}/);
});

test('campaign list shows the localized checkout discount name immediately after activity', async () => {
  const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  try {
    const { workspaceText } = await vite.ssrLoadModule('/src/prototype/admin-workspace-messages.ts');
    const source = await readFile(new URL('../src/pages/quantity-breaks.tsx', import.meta.url), 'utf8');
    assert.equal(workspaceText('zh-Hans', 'discountName'), '折扣名称');
    assert.match(source, /<th scope="col">\{wt\('campaign'\)\}<\/th><th scope="col">\{wt\('discountName'\)\}<\/th>/);
    assert.match(source, /campaign\.discountName \|\| campaign\.name/);
    assert.match(source, /<dt>\{wt\('discountName'\)\}<\/dt><dd>\{campaign\.discountName \|\| campaign\.name\}<\/dd>/);
  } finally { await vite.close(); }
});
