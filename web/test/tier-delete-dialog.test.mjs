import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

test('tier deletion requires confirmation; cancel, Escape and backdrop only close the dialog', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const dom = new JSDOM('<!doctype html><html><body><button id="trigger">Delete</button><div id="root"></div></body></html>', { url: 'http://localhost' });
  const previous = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
  try {
    const { TierDeleteDialog } = await vite.ssrLoadModule('/src/prototype/TierDeleteDialog.tsx');
    const root = createRoot(document.getElementById('root'));
    const trigger = document.getElementById('trigger');
    let cancelCount = 0;
    let confirmCount = 0;
    const render = () => act(() => root.render(React.createElement(TierDeleteDialog, {
      title: 'Delete this tier?', body: 'Delete Single?', cancelLabel: 'Cancel', confirmLabel: 'Delete tier',
      onCancel: () => { cancelCount++; }, onConfirm: () => { confirmCount++; }, returnFocus: trigger,
    })));
    await render();
    assert.equal(document.activeElement.textContent, 'Cancel');
    await act(() => document.querySelector('button[class*="tierDialogCancel"]').click());
    assert.equal(cancelCount, 1);
    assert.equal(confirmCount, 0);
    await act(() => document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    assert.equal(cancelCount, 2);
    assert.equal(confirmCount, 0);
    await act(() => document.querySelector('[role="presentation"]').dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true })));
    assert.equal(cancelCount, 3);
    assert.equal(confirmCount, 0);
    await act(() => document.querySelector('button[class*="tierDialogDelete"]').click());
    assert.equal(confirmCount, 1);
    await act(() => root.unmount());
    assert.equal(document.activeElement, trigger);
  } finally {
    Object.assign(globalThis, previous);
    if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
    else delete globalThis.navigator;
    dom.window.close();
    await vite.close();
  }
});
