import assert from 'node:assert/strict';
import { test } from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { createInstance } from 'i18next';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

test('a transient startup read retries once and renders the campaign workspace', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/quantity-breaks' });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    PopStateEvent: globalThis.PopStateEvent,
    fetch: globalThis.fetch,
    IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT,
  };
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    PopStateEvent: dom.window.PopStateEvent,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  let bootstrapReads = 0;
  globalThis.fetch = (input) => {
    const url = String(input);
    if (url.includes('/api/quantity-breaks/bootstrap')) {
      bootstrapReads += 1;
      if (bootstrapReads === 1) return Promise.resolve(Response.json({ error: 'temporary' }, { status: 503 }));
      return Promise.resolve(Response.json({
        subscription: { entitlement: { state: 'active', activeSubscriptionId: 'sub-1', validUntil: null, graceUntil: null, autoRecurring: true, absenceConfirmations: 0 },
          access: true, planPageRequired: false, plan: { spuKey: 'ultra', currency: 'USD', price: 14.99, periodDays: 30, label: 'Ultra' } },
        shop: { storeId: '42' }, campaigns: [],
      }));
    }
    if (url.includes('/api/quantity-breaks/shop')) return Promise.resolve(Response.json({ shop: { storeId: '42' } }));
    if (url.includes('/api/quantity-breaks/campaigns')) return Promise.resolve(Response.json({ campaigns: [] }));
    return Promise.resolve(Response.json({}));
  };

  try {
    const { default: QuantityBreaksPrototype } = await vite.ssrLoadModule('/src/pages/quantity-breaks.tsx');
    const i18n = createInstance();
    await i18n.init({ lng: 'en', resources: { en: { translation: {} } } });
    const root = createRoot(document.getElementById('root'));
    await act(async () => {
      root.render(React.createElement(I18nextProvider, { i18n }, React.createElement(QuantityBreaksPrototype)));
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
      await Promise.resolve();
    });

    assert.equal(bootstrapReads, 2);
    assert.ok(document.querySelector('#campaigns'));
    assert.doesNotMatch(document.body.textContent, /Unable to load campaigns/);
    await act(async () => root.unmount());
  } finally {
    Object.assign(globalThis, previous);
    dom.window.close();
    await vite.close();
  }
});
