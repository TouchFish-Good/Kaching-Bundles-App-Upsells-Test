import assert from 'node:assert/strict';
import { test } from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { createInstance } from 'i18next';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

test('rechecks subscription after the plan route returns to the workspace', async () => {
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
    if (String(input).endsWith('/api/quantity-breaks/subscription')) {
      return Promise.resolve(Response.json({
        entitlement: { state: 'active', activeSubscriptionId: 'sub-1', validUntil: null, graceUntil: null, absenceConfirmations: 0 },
        access: true, planPageRequired: false,
        plan: { spuKey: 'ultra', currency: 'USD', price: 14.99, periodDays: 30, label: 'Ultra' },
      }));
    }
    if (String(input).includes('/api/quantity-breaks/bootstrap')) {
      bootstrapReads += 1;
      const active = bootstrapReads >= 2;
      return Promise.resolve(new Response(JSON.stringify({
        subscription: { entitlement: active ? { state: 'active', featureKeys: ['quantity_breaks_access'], activeSubscriptionId: 'sub-1', validUntil: null, graceUntil: null, absenceConfirmations: 0 } : { state: 'unknown', featureKeys: [], activeSubscriptionId: null, validUntil: null, graceUntil: null, absenceConfirmations: 0 },
          access: active, planPageRequired: !active, plan: { spuKey: 'ultra', currency: 'USD', price: 14.99, periodDays: 30, label: 'USD 14.99 / month (every 30 days)' } },
        ...(active ? { shop: { storeId: '42' }, campaigns: [] } : {}),
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }
    return Promise.resolve(new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } }));
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
      await Promise.resolve();
    });
    assert.equal(dom.window.location.pathname, '/quantity-breaks');
    assert.ok(bootstrapReads >= 2);
    await act(async () => root.unmount());
  } finally {
    Object.assign(globalThis, previous);
    dom.window.close();
    await vite.close();
  }
});
