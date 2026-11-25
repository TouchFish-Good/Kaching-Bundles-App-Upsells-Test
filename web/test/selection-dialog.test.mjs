import assert from 'node:assert/strict';
import { test } from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

test('selection dialog keeps its result scroll position while a checkbox rerenders its parent', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const previous = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  const originalFocus = dom.window.HTMLElement.prototype.focus;
  class ResizeObserverStub { observe() {} disconnect() {} }
  dom.window.requestAnimationFrame = (callback) => { callback(0); return 1; };
  dom.window.cancelAnimationFrame = () => {};
  dom.window.HTMLElement.prototype.focus = function focus() {
    const body = this.matches('[data-dialog-autofocus]') ? this.closest('[role="dialog"]')?.querySelector('[class*="selectionDialogBody"]') : null;
    if (body) body.scrollTop = 0;
  };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, ResizeObserver: ResizeObserverStub, IS_REACT_ACT_ENVIRONMENT: true });
  try {
    const { SelectionDialog } = await vite.ssrLoadModule('/src/prototype/SelectionDialog.tsx');
    const root = createRoot(document.getElementById('root'));
    function Harness() {
      const [checked, setChecked] = React.useState(false);
      return React.createElement(SelectionDialog, { ariaLabel: 'Choose items', title: 'Choose items', closeLabel: 'Close', onClose: () => {} },
        React.createElement('input', { 'data-dialog-autofocus': true, type: 'search' }),
        React.createElement('input', { type: 'checkbox', checked, onChange: () => setChecked(!checked) }),
      );
    }
    await act(async () => root.render(React.createElement(Harness)));
    const body = document.querySelector('[class*="selectionDialogBody"]');
    body.scrollTop = 240;
    await act(async () => document.querySelector('input[type="checkbox"]').click());
    assert.equal(body.scrollTop, 240);
    await act(async () => root.unmount());
  } finally {
    dom.window.HTMLElement.prototype.focus = originalFocus;
    Object.assign(globalThis, previous);
    dom.window.close();
    await vite.close();
  }
});
