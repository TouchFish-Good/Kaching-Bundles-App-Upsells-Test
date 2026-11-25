import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

test('theme setup guide offers a dismissible two-step guide with both supplied images', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { ThemeSetupGuide } = await vite.ssrLoadModule('/src/prototype/ThemeSetupGuide.tsx');
    const html = renderToStaticMarkup(React.createElement(ThemeSetupGuide, { language: 'zh-Hans' }));

    assert.match(html, /完成设置/);
    assert.match(html, /设置指南/);
    assert.match(html, /Multi-item-Discounts-Theme-Editor-Guide\.png\?w=1672&amp;h=941/);
    assert.match(html, /Multi-item-Discounts-Theme-Editor-Guide-\(1\)\.png\?w=1672&amp;h=941/);
    assert.match(html, /data-theme-guide-dismiss/);
  } finally {
    await vite.close();
  }
});
