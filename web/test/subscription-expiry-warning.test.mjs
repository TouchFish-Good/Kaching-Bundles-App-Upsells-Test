import assert from 'node:assert/strict';
import { test } from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { createInstance } from 'i18next';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

const warning = '套餐即将在';

test('shows the store-time expiry warning and renewal action when no next period covers expiry', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/quantity-breaks?lang=zh-Hans' });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    PopStateEvent: globalThis.PopStateEvent,
    fetch: globalThis.fetch,
    IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT,
  };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, PopStateEvent: dom.window.PopStateEvent, IS_REACT_ACT_ENVIRONMENT: true });
  let nextValidFrom = null;
  globalThis.fetch = (input) => {
    const url = String(input);
    if (url.includes('/api/quantity-breaks/bootstrap')) return Promise.resolve(Response.json({
      subscription: { access: true, planPageRequired: false,
        entitlement: { state: 'active', activeSubscriptionId: 'sub-1', validUntil: Date.now() + 24 * 60 * 60 * 1000, nextValidFrom: null, nextValidUntil: null, nextDisplayFrom: nextValidFrom, nextDisplayUntil: nextValidFrom ? nextValidFrom + 30 * 24 * 60 * 60 * 1000 : null, graceUntil: null, autoRecurring: false, absenceConfirmations: 0 },
        plan: { spuKey: 'ultra', currency: 'USD', price: 14.99, periodDays: 30, label: 'Ultra' } },
      shop: { storeId: '42' }, campaigns: [],
    }));
    if (url.includes('/api/quantity-breaks/shop-timezone')) return Promise.resolve(Response.json({ timeZone: 'Asia/Shanghai' }));
    if (url.includes('/api/quantity-breaks/shop')) return Promise.resolve(Response.json({ shop: { storeId: '42' } }));
    if (url.includes('/api/quantity-breaks/campaigns')) return Promise.resolve(Response.json({ campaigns: [] }));
    return Promise.resolve(Response.json({}));
  };
  try {
    const { default: QuantityBreaksPrototype } = await vite.ssrLoadModule('/src/pages/quantity-breaks.tsx');
    const i18n = createInstance();
    await i18n.init({ lng: 'zh-Hans', resources: { 'zh-Hans': { translation: {} } } });
    const root = createRoot(document.getElementById('root'));
    const render = async (key) => act(async () => {
      root.render(React.createElement(I18nextProvider, { i18n }, React.createElement(QuantityBreaksPrototype, { key })));
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await Promise.resolve();
    });

    await render('ending');
    assert.match(document.body.textContent, new RegExp(warning));
    assert.match(document.body.textContent, /立即续费/);

    nextValidFrom = Date.now() + 24 * 60 * 60 * 1000;
    await render('renewing');
    assert.doesNotMatch(document.body.textContent, new RegExp(warning));
    assert.match(document.body.textContent, /下一期套餐将于/);
    assert.doesNotMatch(document.body.textContent, /到期后对应折扣将直接失效/);
    const notice = document.querySelector('[role="status"]');
    assert.ok(notice);
    assert.equal(notice.querySelector('br'), null, 'Subscription dates must flow inline without a forced line break');
    await act(async () => root.unmount());
  } finally {
    Object.assign(globalThis, previous);
    dom.window.close();
    await vite.close();
  }
});
