import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { createInstance } from 'i18next';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

test('defines six concise localized Ultra plan capabilities for every supported language', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { subscriptionLocales, subscriptionPlanFeatures, subscriptionPlanUi } = await vite.ssrLoadModule('/src/prototype/subscription-messages.ts');
    for (const locale of subscriptionLocales) {
      const features = subscriptionPlanFeatures(locale);
      assert.equal(features.length, 6);
      for (const feature of features) {
        assert.ok(feature.title.length > 0);
        assert.ok(feature.description.length > 0);
      }
    }
    assert.match(subscriptionPlanFeatures('zh-Hans')[0].title, /多件阶梯优惠规则/);
    assert.equal(subscriptionPlanUi('zh-Hans').billingCycle, '每 30 天');
  } finally {
    await vite.close();
  }
});

test('uses the requested Inter system font stack for the application shell', () => {
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
  assert.match(css, /font-family:\s*Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif/);
});

test('plan page shows the subscribed state and offers native plan purchase during payment review', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/quantity-breaks/plan' });
  const previous = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement, fetch: globalThis.fetch, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  let checkoutAttempted = false;
  let anonymousSubscription = false;
  let entitlementState = 'inactive';
  globalThis.fetch = function browserBoundFetch(input) {
    assert.equal(this, globalThis, 'the browser fetch implementation must retain its global receiver');
    if (String(input).includes('/checkout')) {
      checkoutAttempted = true;
      return Promise.resolve(new Response(JSON.stringify({ error: 'Unable to create the SHOPLINE payment link.', code: 'ORDER_PERSIST_FAILED', requestId: 'req_checkout_123' }), { status: 502, headers: { 'Content-Type': 'application/json' } }));
    }
    return Promise.resolve(new Response(JSON.stringify({
      entitlement: anonymousSubscription ? null : { state: entitlementState, activeSubscriptionId: 'sub-1', validUntil: null, graceUntil: null, absenceConfirmations: 0 },
      access: !anonymousSubscription && entitlementState !== 'inactive',
      planPageRequired: anonymousSubscription || entitlementState === 'inactive',
      plan: { spuKey: 'ultra', currency: 'USD', price: 9.99, periodDays: 30, label: 'USD 9.99 / month (every 30 days)' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  };
  try {
    const { default: QuantityBreaksPlan } = await vite.ssrLoadModule('/src/pages/quantity-breaks/plan.tsx');
    const i18n = createInstance();
    await i18n.init({ lng: 'en', resources: { en: { translation: {} } } });
    const root = createRoot(document.getElementById('root'));
    await act(async () => {
      root.render(React.createElement(I18nextProvider, { i18n }, React.createElement(QuantityBreaksPlan)));
      await Promise.resolve();
      await Promise.resolve();
    });
    assert.match(document.body.textContent, /Renew now/);
    assert.equal(document.querySelector('.subscription-plan__trial-hint')?.textContent, 'First-time users can try the app free for 7 days. Click the subscription button below to select the trial.');
    assert.doesNotMatch(document.body.textContent, /grace period/);
    assert.match(document.body.textContent, /App plan/);
    assert.doesNotMatch(document.body.textContent, /Quantity Breaks/);
    assert.equal(document.querySelector('.billing-price')?.textContent, '$9.99');
    assert.equal(document.querySelector('#billingGrowthCycle')?.textContent, 'Every 30 days');

    await act(async () => {
      document.querySelector('button').click();
      await Promise.resolve();
      await Promise.resolve();
    });
    assert.equal(checkoutAttempted, true);
    assert.match(document.body.textContent, /req_checkout_123/);

    dom.window.history.replaceState(null, '', '/quantity-breaks/plan?payment=review_pending');
    await act(async () => root.render(React.createElement(I18nextProvider, { i18n }, React.createElement(QuantityBreaksPlan))));
    assert.doesNotMatch(document.body.textContent, /We are verifying your payment with SHOPLINE|Editing is temporarily locked/);
    assert.ok([...document.querySelectorAll('button')].some((button) => /Subscribe|Renew|View plans/.test(button.textContent)));

    anonymousSubscription = true;
    dom.window.history.replaceState(null, '', '/quantity-breaks/plan');
    await act(async () => {
      root.render(React.createElement(I18nextProvider, { i18n }, React.createElement(QuantityBreaksPlan, { key: 'anonymous-plan' })));
      await Promise.resolve();
      await Promise.resolve();
    });
    assert.equal(document.querySelectorAll('button').length, 1);
    assert.match(document.body.textContent, /Subscribe now/);
    assert.match(document.body.textContent, /Quantity break rules/);
    await act(async () => root.unmount());
  } finally {
    Object.assign(globalThis, previous);
    dom.window.close();
    await vite.close();
  }
});

test('valid access leaves the application plan route without rendering a payment card', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/quantity-breaks/plan' });
  const previous = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement, fetch: globalThis.fetch, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  globalThis.fetch = () => Promise.resolve(new Response(JSON.stringify({ entitlement: { state: 'trial', activeSubscriptionId: 'sub-trial', validUntil: null, graceUntil: null, absenceConfirmations: 0 }, access: true, planPageRequired: false, plan: { spuKey: 'ultra', currency: 'USD', price: 9.99, periodDays: 30, label: 'USD 9.99 / month (every 30 days)' } }), { status: 200 }));
  try {
    const { default: QuantityBreaksPlan } = await vite.ssrLoadModule('/src/pages/quantity-breaks/plan.tsx');
    const i18n = createInstance();
    await i18n.init({ lng: 'en', resources: { en: { translation: {} } } });
    const root = createRoot(document.getElementById('root'));
    await act(async () => { root.render(React.createElement(I18nextProvider, { i18n }, React.createElement(QuantityBreaksPlan))); await Promise.resolve(); await Promise.resolve(); });
    assert.equal(dom.window.location.pathname, '/quantity-breaks');
    assert.equal(document.querySelector('.subscription-plan__card'), null);
    await act(async () => root.unmount());
  } finally {
    Object.assign(globalThis, previous);
    dom.window.close();
    await vite.close();
  }
});

test('polls a payment return until the entitlement is visible and cleans up on unmount', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/quantity-breaks/plan?payment=review_pending&handle=shop-a&appkey=test-app&embedded=1' });
  const previous = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement, fetch: globalThis.fetch, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  const timers = [];
  globalThis.setTimeout = ((callback, delay) => {
    const timer = { callback, delay, cancelled: false };
    timers.push(timer);
    return timer;
  });
  globalThis.clearTimeout = (timer) => { if (timer) timer.cancelled = true; };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  let reads = 0;
  globalThis.fetch = () => {
    reads += 1;
    const state = reads >= 3 ? 'active' : 'review_pending';
    return Promise.resolve(new Response(JSON.stringify({
      entitlement: state === 'review_pending' ? { state, activeSubscriptionId: 'sub-1', validUntil: null, graceUntil: null, absenceConfirmations: 0 } : { state, activeSubscriptionId: 'sub-1', validUntil: null, graceUntil: null, absenceConfirmations: 0 },
      access: state === 'active', planPageRequired: state !== 'active',
      plan: { spuKey: 'ultra', currency: 'USD', price: 9.99, periodDays: 30, label: 'USD 9.99 / month (every 30 days)' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  };
  try {
    const { default: QuantityBreaksPlan } = await vite.ssrLoadModule('/src/pages/quantity-breaks/plan.tsx');
    const i18n = createInstance();
    await i18n.init({ lng: 'en', resources: { en: { translation: {} } } });
    const root = createRoot(document.getElementById('root'));
    await act(async () => {
      root.render(React.createElement(I18nextProvider, { i18n }, React.createElement(QuantityBreaksPlan)));
      await Promise.resolve();
      await Promise.resolve();
    });
    assert.ok([...document.querySelectorAll('button')].some((button) => button.textContent === 'Subscribe now'));
    assert.equal(reads, 1);
    const firstPoll = timers.find((timer) => timer.delay === 2000 && !timer.cancelled);
    assert.ok(firstPoll);
    await act(async () => {
      firstPoll.callback();
      await Promise.resolve();
      await Promise.resolve();
    });
    const secondPoll = timers.find((timer) => timer.delay === 2000 && !timer.cancelled && timer !== firstPoll);
    assert.ok(secondPoll);
    await act(async () => {
      secondPoll.callback();
      await Promise.resolve();
      await Promise.resolve();
    });
    assert.equal(reads, 3);
    assert.equal(dom.window.location.pathname, '/quantity-breaks');
    assert.equal(document.querySelector('.subscription-plan__card'), null);
    assert.doesNotMatch(document.body.textContent, /We are verifying your payment with SHOPLINE/);

    dom.window.history.replaceState(null, '', '/quantity-breaks/plan?payment=review_pending');
    reads = 0;
    await act(async () => root.render(React.createElement(I18nextProvider, { i18n }, React.createElement(QuantityBreaksPlan, { key: 'cleanup-plan' }))));
    const pendingTimer = timers.find((timer) => timer.delay === 2000 && !timer.cancelled);
    assert.ok(pendingTimer);
    await act(async () => root.unmount());
    await act(async () => {
      pendingTimer.callback();
      await Promise.resolve();
    });
    assert.equal(reads, 1);
  } finally {
    Object.assign(globalThis, previous);
    dom.window.close();
    await vite.close();
  }
});
