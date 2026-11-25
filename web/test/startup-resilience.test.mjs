import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { createInstance } from 'i18next';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

const subscription = { entitlement: { state: 'active', activeSubscriptionId: 'sub-1', validUntil: null, graceUntil: null, autoRecurring: true, absenceConfirmations: 0 }, access: true, planPageRequired: false, plan: { spuKey: 'ultra', currency: 'USD', price: 14.99, periodDays: 30, label: 'Ultra' } };

const deletableOffer = { id: 'delete-offer', name: 'Delete this offer', status: 'draft', scope: { kind: 'all', excludedProductIds: [] }, tiers: [{ tierId: 't', displayOrder: 0, quantity: 2, discountType: 'percentage', discountValue: 1000 }], revision: 2, updatedAt: '2026-11-13T00:00:00Z', combinesWith: { orderDiscounts: false, shippingDiscounts: false } };
async function confirmOfferDeletion(document) {
  await act(async () => document.querySelector('input[aria-label="Select all campaigns on this page"]').click());
  await act(async () => [...document.querySelectorAll('[role="toolbar"] button')].find((b) => b.textContent === 'Delete').click());
  await act(async () => [...document.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent === 'Delete').click());
}

test('queued deletion waits for confirmation, removes the row and cannot reopen stale editor cache', async () => {
  let resolveBatch;
  const pending = new Promise((resolve) => { resolveBatch = resolve; });
  await workspace('/quantity-breaks', (url) => {
    if (url.endsWith('/campaigns/batch-delete')) return Response.json({ batch: { id: 'b', state: 'queued' }, results: [{ id: 'delete-offer', outcome: 'queued' }] }, { status: 202 });
    if (url.endsWith('/campaign-operations/b')) return pending;
    if (url.split('?')[0].endsWith('/campaigns')) return Response.json({ campaigns: [deletableOffer] });
    return null;
  }, async ({ document, window, flush }) => {
    await act(async () => document.querySelector('a[href$="/delete-offer/edit"]').click());
    await act(async () => { window.history.pushState(null, '', '/quantity-breaks'); window.dispatchEvent(new window.PopStateEvent('popstate')); });
    await flush();
    await confirmOfferDeletion(document);
    assert.doesNotMatch(document.querySelector('[role="status"]')?.textContent ?? '', /campaigns deleted/);
    assert.ok(document.querySelector('a[href$="/delete-offer/edit"]'));
    resolveBatch(Response.json({ batch: { id: 'b', state: 'completed', operations: [{ id: 'op', campaignId: 'delete-offer', state: 'succeeded', lastError: null }] } }));
    await flush();
    assert.equal(document.querySelector('a[href$="/delete-offer/edit"]'), null);
    assert.match(document.querySelector('[role="status"]').textContent, /1 campaigns deleted/);
    await act(async () => window.dispatchEvent(new window.Event('pageshow')));
    await flush();
    assert.equal(document.querySelector('a[href$="/delete-offer/edit"]'), null);
    await act(async () => { window.history.pushState(null, '', '/quantity-breaks/campaigns/delete-offer/edit'); window.dispatchEvent(new window.PopStateEvent('popstate')); });
    await flush();
    assert.match(document.body.textContent, /Campaign not found/);
    assert.equal(document.querySelector('input[value="Delete this offer"]'), null);
  });
});

for (const outcome of ['failed', 'requires_pause']) {
  test(`a ${outcome} deletion preserves the campaign and never reports success`, async () => {
    await workspace('/quantity-breaks', (url) => {
      if (url.endsWith('/campaigns/batch-delete')) return Response.json({ batch: { id: 'b', state: 'queued' }, results: [{ id: 'delete-offer', outcome: 'queued' }] }, { status: 202 });
      if (url.endsWith('/campaign-operations/b')) return Response.json({ batch: { id: 'b', state: outcome === 'failed' ? 'failed' : 'completed', operations: [{ id: 'op', campaignId: 'delete-offer', state: outcome, lastError: outcome === 'failed' ? 'SHOPLINE unavailable' : null }] } });
      if (url.split('?')[0].endsWith('/campaigns')) return Response.json({ campaigns: [deletableOffer] });
      return null;
    }, async ({ document, flush }) => {
      await confirmOfferDeletion(document);
      await flush();
      assert.ok(document.querySelector('a[href$="/delete-offer/edit"]'));
      assert.ok(document.querySelector('[role="alert"]'));
      assert.doesNotMatch(document.querySelector('[role="status"]')?.textContent ?? '', /campaigns deleted/);
    });
  });
}

test('partially completed deletion removes only confirmed successes', async () => {
  await workspace('/quantity-breaks', (url) => {
    if (url.endsWith('/campaigns/batch-delete')) return Response.json({ batch: { id: 'b', state: 'queued' }, results: ['delete-offer', 'keep-offer'].map((id) => ({ id, outcome: 'queued' })) }, { status: 202 });
    if (url.endsWith('/campaign-operations/b')) return Response.json({ batch: { id: 'b', state: 'failed', operations: [{ id: 'op1', campaignId: 'delete-offer', state: 'succeeded', lastError: null }, { id: 'op2', campaignId: 'keep-offer', state: 'failed', lastError: 'SHOPLINE unavailable' }] } });
    if (url.split('?')[0].endsWith('/campaigns')) return Response.json({ campaigns: [deletableOffer, { ...deletableOffer, id: 'keep-offer', name: 'Keep this offer' }] });
    return null;
  }, async ({ document, flush }) => {
    await confirmOfferDeletion(document);
    await flush();
    assert.equal(document.querySelector('a[href$="/delete-offer/edit"]'), null);
    assert.ok(document.querySelector('a[href$="/keep-offer/edit"]'));
  });
});

test('batch activation shows pending confirmation then refreshes to active without another status write', async () => {
  let submitted = false;
  let visible = false;
  let writes = 0;
  const old = { ...deletableOffer, status: 'paused', platformStatus: 'paused', platformDiscountId: 'old-platform' };
  const pending = { ...deletableOffer, id: 'new-offer', name: 'New offer', status: 'active', platformStatus: 'unverified', platformOperationState: 'needs_reconciliation', platformDiscountId: 'new-platform' };
  await workspace('/quantity-breaks', (url) => {
    if (url.endsWith('/campaigns/batch-status')) {
      writes += 1;
      submitted = true;
      return Response.json({ results: [{ id: old.id, outcome: 'activation_pending', campaign: pending }] });
    }
    if (url.split('?')[0].endsWith('/campaigns')) return Response.json({ campaigns: submitted ? [old, { ...pending, ...(visible ? { platformStatus: 'active', platformOperationState: 'active' } : {}) }] : [old] });
    return null;
  }, async ({ document, flush }) => {
    await act(async () => document.querySelector('input[aria-label="Select all campaigns on this page"]').click());
    await act(async () => [...document.querySelectorAll('[role="toolbar"] button')].find((b) => b.textContent === 'Enable').click());
    await act(async () => [...document.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent === 'Enable').click());
    await flush();
    assert.match(document.body.textContent, /confirming.*activation/i);
    assert.match(document.querySelector('a[href$="/new-offer/edit"]').closest('tr').textContent, /Starting/);
    assert.doesNotMatch(document.body.textContent, /Some campaigns could not|creation was not confirmed/);
    assert.ok(document.querySelector('a[href$="/delete-offer/edit"]'));
    visible = true;
    await flush(2200);
    const link = document.querySelector('a[href$="/new-offer/edit"]');
    assert.ok(link);
    assert.match(link.closest('tr').textContent, /Active/);
    assert.equal(writes, 1);
  });
});

for (const alreadyPending of [false, true]) {
  test(`pause confirmation refreshes to ended without another write (${alreadyPending ? 'reopened list' : 'batch pause'})`, async () => {
    let submitted = alreadyPending;
    let confirmed = false;
    let writes = 0;
    let reads = 0;
    const offer = { ...deletableOffer, status: 'active', platformStatus: 'active', platformOperationState: 'active', platformDiscountId: 'same-platform' };
    await workspace('/quantity-breaks', (url) => {
      if (url.endsWith('/campaigns/batch-status')) {
        writes += 1;
        submitted = true;
        return Response.json({ results: [{ id: offer.id, outcome: 'pausing' }] });
      }
      if (url.split('?')[0].endsWith('/campaigns')) {
        reads += 1;
        return Response.json({ campaigns: [{ ...offer, ...(submitted ? { platformOperationState: 'pausing' } : {}), ...(confirmed ? { status: 'paused', platformStatus: 'paused', platformOperationState: 'paused', neverExpires: false, endsAt: '2026-11-23T00:00:00Z' } : {}) }] });
      }
      return null;
    }, async ({ document, flush }) => {
      if (!alreadyPending) {
        await act(async () => document.querySelector('input[aria-label="Select all campaigns on this page"]').click());
        await act(async () => [...document.querySelectorAll('[role="toolbar"] button')].find((b) => b.textContent === 'Disable').click());
        await act(async () => [...document.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent === 'Disable').click());
        await flush();
      }
      assert.match(document.querySelector('a[href$="/delete-offer/edit"]').closest('tr').textContent, /Disabling/);
      const before = reads;
      confirmed = true;
      await flush(2200);
      assert.ok(reads > before, 'pending pause must trigger an authoritative status read');
      assert.match(document.querySelector('a[href$="/delete-offer/edit"]').closest('tr').textContent, /Ended/);
      assert.equal(writes, alreadyPending ? 0 : 1);
      if (!alreadyPending) {
        assert.match(document.querySelector('[role="status"]').textContent, /confirming.*disabl/i);
        assert.doesNotMatch(document.querySelector('[role="status"]').textContent, /1 campaigns paused/);
      }
      const completedReads = reads;
      await flush(2200);
      assert.equal(reads, completedReads, 'confirmed pause must stop polling');
    });
  });
}

test('pending disable response keeps the row disabling while the follow-up read is delayed', async () => {
  const offer = { ...deletableOffer, status: 'active', platformStatus: 'active', platformOperationState: 'active', platformDiscountId: 'same-platform' };
  let submitted = false;
  let writes = 0;
  let resolveRead;
  const delayedRead = new Promise((resolve) => { resolveRead = resolve; });
  await workspace('/quantity-breaks', (url) => {
    if (url.endsWith('/campaigns/batch-status')) {
      submitted = true;
      writes += 1;
      return Response.json({ results: [{ id: offer.id, outcome: 'pausing', campaign: { ...offer, platformOperationState: 'pausing', platformState: 'pausing' } }] });
    }
    if (url.split('?')[0].endsWith('/campaigns')) return submitted ? delayedRead : Response.json({ campaigns: [offer] });
    return null;
  }, async ({ document, flush }) => {
    await act(async () => document.querySelector('input[aria-label="Select all campaigns on this page"]').click());
    await act(async () => [...document.querySelectorAll('[role="toolbar"] button')].find((b) => b.textContent === 'Disable').click());
    await act(async () => [...document.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent === 'Disable').click());
    await flush();
    const row = () => document.querySelector('a[href$="/delete-offer/edit"]').closest('tr');
    assert.match(document.querySelector('[role="status"]').textContent, /confirming.*disabl/i);
    assert.match(row().textContent, /Disabling/);
    assert.doesNotMatch(row().textContent, /Active/);
    assert.equal(document.querySelector('input[aria-label="Select Delete this offer"]').disabled, true);
    resolveRead(Response.json({ campaigns: [{ ...offer, status: 'paused', platformStatus: 'paused', platformOperationState: 'paused', neverExpires: false, endsAt: '2026-11-23T00:00:00Z' }] }));
    await flush();
    assert.match(row().textContent, /Ended/);
    assert.doesNotMatch(row().textContent, /Disabling/);
    assert.equal(writes, 1, 'confirmation must not resubmit the disable request');
  });
});

for (const action of ['activate', 'pause']) {
  test(`batch ${action} shows immediate progress and separates successes from failures`, async () => {
    let resolveWrite;
    let writes = 0;
    let committed = false;
    const response = new Promise((resolve) => { resolveWrite = resolve; });
    const original = { ...deletableOffer, status: action === 'activate' ? 'draft' : 'active', platformStatus: action === 'activate' ? 'missing' : 'active', platformDiscountId: 'platform-1' };
    const failed = { ...original, id: 'failed-offer', name: 'Failed offer' };
    const changed = { ...original, status: action === 'activate' ? 'active' : 'paused', platformStatus: action === 'activate' ? 'active' : 'paused', platformOperationState: action === 'activate' ? 'active' : 'paused' };
    await workspace('/quantity-breaks', (url) => {
      if (url.endsWith('/campaigns/batch-status')) { writes += 1; return response; }
      if (url.split('?')[0].endsWith('/campaigns')) return Response.json({ campaigns: [committed ? changed : original, failed] });
      return null;
    }, async ({ document, flush }) => {
      const label = action === 'activate' ? 'Enable' : 'Disable';
      await act(async () => document.querySelector('input[aria-label="Select all campaigns on this page"]').click());
      await act(async () => [...document.querySelectorAll('[role="toolbar"] button')].find((button) => button.textContent === label).click());
      await act(async () => [...document.querySelectorAll('[role="dialog"] button')].find((button) => button.textContent === label).click());
      await flush();
      assert.equal(document.querySelector('[role="dialog"]'), null, 'confirmation must close while the API is processing');
      for (const id of [original.id, failed.id]) {
        assert.match(document.querySelector(`a[href$="/${id}/edit"]`).closest('tr').textContent, action === 'activate' ? /Starting/ : /Disabling/);
      }
      assert.ok([...document.querySelectorAll('[role="toolbar"] button')].every((button) => button.disabled));
      assert.equal(writes, 1);
      committed = true;
      resolveWrite(Response.json({ results: [{ id: original.id, outcome: action === 'activate' ? 'activated' : 'paused', campaign: changed }, { id: failed.id, outcome: 'failed', message: 'Test upstream failure' }] }));
      await flush();
      assert.match(document.querySelector('a[href$="/delete-offer/edit"]').closest('tr').textContent, action === 'activate' ? /Active/ : /Ended/);
      assert.match(document.querySelector('a[href$="/failed-offer/edit"]').closest('tr').textContent, action === 'activate' ? /Draft/ : /Active/);
      assert.match(document.querySelector('[role="alert"]').textContent, /Test upstream failure/);
      assert.equal(writes, 1);
    });
  });
}

test('a failed batch request restores the original rows and does not retry the write', async () => {
  let resolveWrite;
  let writes = 0;
  const response = new Promise((resolve) => { resolveWrite = resolve; });
  await workspace('/quantity-breaks', (url) => {
    if (url.endsWith('/campaigns/batch-status')) { writes += 1; return response; }
    if (url.split('?')[0].endsWith('/campaigns')) return Response.json({ campaigns: [deletableOffer] });
    return null;
  }, async ({ document, flush }) => {
    await act(async () => document.querySelector('input[aria-label="Select all campaigns on this page"]').click());
    await act(async () => [...document.querySelectorAll('[role="toolbar"] button')].find((button) => button.textContent === 'Enable').click());
    await act(async () => [...document.querySelectorAll('[role="dialog"] button')].find((button) => button.textContent === 'Enable').click());
    assert.match(document.querySelector('tbody').textContent, /Starting/);
    resolveWrite(Response.json({ error: 'Batch unavailable' }, { status: 503 }));
    await flush();
    assert.doesNotMatch(document.querySelector('tbody').textContent, /Starting/);
    assert.match(document.querySelector('tbody').textContent, /Draft/);
    assert.match(document.querySelector('[role="alert"]').textContent, /Batch unavailable/);
    assert.equal(document.querySelector('input[aria-label="Select all campaigns on this page"]').disabled, false);
    assert.equal(writes, 1);
  });
});

async function workspace(path, respond, check, { blockedStorage = false } = {}) {
  const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: `http://localhost${path}${path.includes('?') ? '&' : '?'}lang=en` });
  const names = ['window', 'document', 'HTMLElement', 'PopStateEvent', 'fetch', 'ResizeObserver', 'IS_REACT_ACT_ENVIRONMENT'];
  const previous = Object.fromEntries(names.map((key) => [key, globalThis[key]]));
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, PopStateEvent: dom.window.PopStateEvent, IS_REACT_ACT_ENVIRONMENT: true });
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  if (blockedStorage) for (const key of ['localStorage', 'sessionStorage']) Object.defineProperty(dom.window, key, { get() { throw new dom.window.DOMException('Storage blocked', 'SecurityError'); } });
  const calls = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('/api/quantity-breaks/bootstrap')) {
      const subscriptionResponse = await respond('/api/quantity-breaks/subscription', init) ?? Response.json(subscription);
      if (!subscriptionResponse.ok) return subscriptionResponse;
      const entitlement = await subscriptionResponse.json();
      if (!entitlement.access) return Response.json({ subscription: entitlement });
      const shopResponse = await respond('/api/quantity-breaks/shop', init) ?? Response.json({ shop: { storeId: '42' } });
      if (!shopResponse.ok) return shopResponse;
      const shop = (await shopResponse.json()).shop;
      const campaignResponse = await respond('/api/quantity-breaks/campaigns?view=configuration', init) ?? Response.json({ campaigns: [] });
      if (!campaignResponse.ok) return campaignResponse;
      return Response.json({ subscription: entitlement, shop, campaigns: (await campaignResponse.json()).campaigns });
    }
    const result = await respond(url, init);
    if (result) return result;
    if (url.endsWith('/subscription')) return Response.json(subscription);
    if (url.endsWith('/shop')) return Response.json({ shop: { storeId: '42' } });
    if (url.split('?')[0].endsWith('/campaigns')) return Response.json({ campaigns: [] });
    if (url.endsWith('/store-languages')) return Response.json({ defaultLanguage: 'en', languages: ['en'] });
    if (url.includes('/translations/')) return Response.json({ translations: {} });
    if (url.includes('/feedback')) return Response.json({ data: { items: [], counts: { all: 0, pending: 0, approved: 0, in_progress: 0, released: 0, rejected: 0 }, mineCount: 0, total: 0, page: 1, pageSize: 10, totalPages: 1 } });
    return Response.json({});
  };
  let root;
  try {
    const { default: Page } = await vite.ssrLoadModule('/src/pages/quantity-breaks.tsx');
    const i18n = createInstance();
    await i18n.init({ lng: 'en', resources: { en: { translation: JSON.parse(await readFile(new URL('../src/locales/en.json', import.meta.url), 'utf8')) } } });
    root = createRoot(document.getElementById('root'));
    const flush = async (ms = 0) => act(async () => { if (ms) await new Promise((resolve) => setTimeout(resolve, ms)); else for (let i = 0; i < 12; i++) await Promise.resolve(); });
    await act(async () => root.render(React.createElement(I18nextProvider, { i18n }, React.createElement(Page))));
    await flush();
    await check({ calls, flush, document: dom.window.document, window: dom.window });
  } finally {
    if (root) await act(async () => root.unmount());
    Object.assign(globalThis, previous);
    dom.window.close();
    await vite.close();
  }
}

for (const path of ['/quantity-breaks', '/quantity-breaks/translations', '/quantity-breaks/feedback']) {
  test(`${path}: unavailable subscription ends loading and exposes recovery`, async () => {
    await workspace(path, async (url) => url.endsWith('/subscription') ? Response.json({ error: 'temporary' }, { status: 503 }) : null, async ({ document, flush }) => {
      await flush(350);
      assert.ok(document.querySelector('[role="alert"]'));
      assert.equal(document.querySelector('[role="status"]'), null);
      assert.ok([...document.querySelectorAll('button')].some((button) => button.textContent === 'Retry'));
    });
  });
}

for (const path of ['/quantity-breaks/translations', '/quantity-breaks/feedback']) {
  test(`${path}: does not request unrelated campaigns`, async () => {
    await workspace(path, async () => null, async ({ calls, document, flush }) => {
      await flush(350);
      assert.equal(document.querySelector('main [role="alert"]'), null);
      assert.equal(calls.some((url) => url.split('?')[0].endsWith('/campaigns')), false);
      assert.ok(calls.some((url) => path.endsWith('translations') ? url.endsWith('/store-languages') : url.includes('/feedback')));
    });
  });
}

test('shop identity can load while subscription is pending', async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  await workspace('/quantity-breaks', (url) => url.endsWith('/subscription') ? pending : null, async ({ calls, flush }) => {
    assert.ok(calls.some((url) => url.includes('/bootstrap')));
    release(Response.json(subscription));
    await flush();
  });
});

test('the header setup guide opens after dismissing the setup notice', async () => {
  await workspace('/quantity-breaks', async () => null, async ({ document }) => {
    await act(async () => document.querySelector('[data-theme-guide-dismiss]').click());
    assert.equal(document.querySelector('[data-theme-guide-dismiss]'), null);
    const create = [...document.querySelectorAll('button')].find((button) => button.textContent === 'Create campaign');
    const guide = [...create.parentElement.querySelectorAll('button')].find((button) => button.textContent === 'Setup guide');
    assert.ok(guide, 'setup guide should remain next to Create campaign');
    const headerItems = [...create.parentElement.children];
    assert.ok(headerItems.indexOf(headerItems.find((item) => item.textContent.includes('App language'))) < headerItems.indexOf(guide));
    assert.ok(headerItems.indexOf(guide) < headerItems.indexOf(create));
    await act(async () => guide.click());
    const dialog = document.querySelector('[role="dialog"]');
    assert.ok(dialog);
    assert.equal(dialog.querySelectorAll('img').length, 2);
    await act(async () => dialog.querySelector('header button').click());
    assert.equal(document.querySelector('[role="dialog"]'), null);
  });
});

test('the campaign heading and language control render before private data is authorized', async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  await workspace('/quantity-breaks', (url) => url.endsWith('/subscription') ? pending : null, async ({ document, flush }) => {
    assert.equal(document.querySelector('h1')?.textContent, 'Quantity breaks');
    assert.ok([...document.querySelectorAll('label')].find((label) => label.textContent.startsWith('App language'))?.querySelector('select'));
    assert.equal(document.querySelector('#campaigns'), null);
    assert.ok([...document.querySelectorAll('button')].find((button) => button.textContent === 'Create campaign')?.disabled);
    release(Response.json(subscription));
    await flush();
  });
});

test('campaign startup failure preserves the page heading and retries', async () => {
  let failing = true;
  await workspace('/quantity-breaks', (url) => url.split('?')[0].endsWith('/campaigns') && failing ? Response.json({}, { status: 503 }) : null, async ({ document, calls, flush }) => {
    await flush(350);
    assert.equal(document.querySelector('h1')?.textContent, 'Quantity breaks');
    assert.equal(document.querySelector('#campaigns'), null);
    failing = false;
    await act(async () => [...document.querySelectorAll('button')].find((button) => button.textContent === 'Retry').click());
    await flush();
    assert.ok(document.querySelector('#campaigns'));
    assert.ok(calls.filter((url) => url.includes('/bootstrap')).length >= 2);
  });
});

test('translation heading and language selection do not wait for shop identity', async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  await workspace('/quantity-breaks/translations', (url) => url.endsWith('/shop') ? pending : null, async ({ document, calls, flush }) => {
    assert.ok(document.body.textContent.includes('Storefront copy'));
    assert.ok([...document.querySelectorAll('label')].find((label) => label.textContent.startsWith('App language'))?.querySelector('select'));
    assert.equal(calls.some((url) => url.endsWith('/store-languages')), false);
    assert.equal(document.querySelector('textarea'), null);
    release(Response.json({ shop: { storeId: '42' } }));
    await flush();
  });
});

test('an explicit language selected during startup survives shop verification and is stored for that shop', async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  await workspace('/quantity-breaks', (url) => url.endsWith('/shop') ? pending : null, async ({ document, window, flush }) => {
    const select = document.querySelector('select');
    await act(async () => { select.value = 'fr'; select.dispatchEvent(new window.Event('change', { bubbles: true })); });
    release(Response.json({ shop: { storeId: '42' } }));
    await flush();
    assert.equal(document.querySelector('select').value, 'fr');
    assert.equal(window.localStorage.getItem('quantity-breaks:admin-locale:42'), 'fr');
  });
});

test('returning to a visible tab retains the campaign view during refresh', async () => {
  let holdShop = false;
  let release;
  await workspace('/quantity-breaks', (url) => holdShop && url.endsWith('/shop') ? new Promise((resolve) => { release = resolve; }) : null, async ({ document, window, flush }) => {
    assert.ok(document.querySelector('#campaigns'));
    holdShop = true;
    await act(async () => window.dispatchEvent(new window.Event('pageshow')));
    assert.ok(document.querySelector('#campaigns'));
    release?.(Response.json({ shop: { storeId: '42' } }));
    await flush();
  });
});

test('blocked iframe storage cannot blank the translation workspace', async () => {
  await workspace('/quantity-breaks/translations', async () => null, async ({ document, flush }) => {
    await flush();
    assert.ok(document.querySelector('main').children.length > 0);
    assert.ok(document.body.textContent.includes('Storefront copy'));
  }, { blockedStorage: true });
});

test('an invalid subscription 200 is retried without routing a subscribed store to plans', async () => {
  let reads = 0;
  await workspace('/quantity-breaks', async (url) => {
    if (url.endsWith('/subscription') && ++reads === 1) return new Response('<html>temporary edge response</html>', { status: 200 });
    return null;
  }, async ({ document, window, flush }) => {
    await flush(350);
    assert.equal(window.location.pathname, '/quantity-breaks');
    assert.ok(document.querySelector('#campaigns'));
    assert.equal(reads, 2);
  });
});

test('campaign recovery does not repeat successful identity and subscription reads', async () => {
  let campaignReads = 0;
  await workspace('/quantity-breaks', async (url) => url.split('?')[0].endsWith('/campaigns') && ++campaignReads === 1 ? Response.json({}, { status: 200 }) : null, async ({ calls, document, flush }) => {
    await flush(350);
    assert.ok(document.querySelector('#campaigns'));
    assert.ok(calls.some((url) => url.includes('/bootstrap')));
    assert.ok(campaignReads >= 2);
  });
});

test('campaign configuration renders while live SHOPLINE verification is pending', async () => {
  const campaign = { id: 'offer', name: 'Saved offer', status: 'active', platformDiscountId: 'discount-1', platformStatus: 'unverified', scope: { kind: 'all', excludedProductIds: [] }, tiers: [{ tierId: 't', displayOrder: 0, quantity: 2, discountType: 'percentage', discountValue: 1000 }], revision: 2, updatedAt: '2026-11-13T00:00:00Z', combinesWith: { orderDiscounts: false, shippingDiscounts: false } };
  let release;
  const verification = new Promise((resolve) => { release = resolve; });
  await workspace('/quantity-breaks', (url) => {
    if (url.includes('/campaigns?view=configuration')) return Response.json({ campaigns: [campaign] });
    if (url.endsWith('/campaigns')) return verification;
    return null;
  }, async ({ document, calls, flush }) => {
    assert.ok(document.querySelector('#campaigns'));
    assert.ok(document.body.textContent.includes('Saved offer'));
    assert.ok(calls.includes('/api/quantity-breaks/campaigns'));
    release(Response.json({ campaigns: [{ ...campaign, platformStatus: 'active' }] }));
    await flush();
    assert.ok(document.querySelector('#campaigns'));
  });
});

test('a new campaign shows a loading frame until its store and subscription are verified', async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  await workspace('/quantity-breaks/new', (url) => url.endsWith('/subscription') ? pending : null, async ({ document, flush }) => {
    assert.ok(document.querySelector('main [role="status"]'));
    assert.equal(document.querySelector('main input'), null);
    release(Response.json(subscription));
    await flush();
  });
});

for (const path of ['/quantity-breaks/translations', '/quantity-breaks/feedback']) {
  test(`${path}: pending identity uses its own loading frame`, async () => {
    let release;
    const pending = new Promise((resolve) => { release = resolve; });
    await workspace(path, (url) => url.endsWith('/shop') ? pending : null, async ({ document, flush }) => {
      assert.ok(document.querySelector('main [role="status"]'));
      assert.equal(document.body.textContent.includes('Loading campaigns'), false);
      release(Response.json({ shop: { storeId: '42' } }));
      await flush();
    });
  });
}

test('a pending campaign is not incorrectly rendered as missing in its editor', async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  await workspace('/quantity-breaks/campaigns/offer/edit', (url) => url.split('?')[0].endsWith('/campaigns') ? pending : null, async ({ document, flush }) => {
    assert.ok(document.querySelector('main [role="status"]'));
    assert.equal(document.querySelector('main [role="alert"]'), null);
    release(Response.json({ campaigns: [] }));
    await flush();
    assert.ok(document.querySelector('main [role="alert"]'));
    assert.equal(document.querySelector('main [role="status"]'), null);
  });
});

test('a verified store change replaces previous campaigns after the new startup result', async () => {
  let changedStore = false;
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const campaign = { id: 'old-offer', name: 'Previous store offer', status: 'draft', scope: { kind: 'all', excludedProductIds: [] }, tiers: [], revision: 1, updatedAt: '2026-11-13T00:00:00Z', combinesWith: {} };
  await workspace('/quantity-breaks', (url) => {
    if (url.endsWith('/subscription') && changedStore) return pending.then((response) => response.clone());
    if (url.endsWith('/shop')) return Response.json({ shop: { storeId: changedStore ? '99' : '42' } });
    if (url.split('?')[0].endsWith('/campaigns')) return Response.json({ campaigns: changedStore ? [] : [campaign] });
    return null;
  }, async ({ document, window, flush }) => {
    assert.ok(document.body.textContent.includes('Previous store offer'));
    changedStore = true;
    await act(async () => window.dispatchEvent(new window.Event('pageshow')));
    await flush();
    assert.equal(document.body.textContent.includes('Previous store offer'), true);
    release(Response.json(subscription));
    await flush();
    assert.ok(document.querySelector('#campaigns'));
    assert.equal(document.body.textContent.includes('Previous store offer'), false);
  });
});

test('a confirmed subscription denial clears campaigns and routes to plans', async () => {
  let denied = false;
  await workspace('/quantity-breaks', (url) => url.endsWith('/subscription') && denied
    ? Response.json({ ...subscription, access: false, planPageRequired: true }) : null,
  async ({ document, window, flush, calls }) => {
    assert.ok(document.querySelector('#campaigns'));
    denied = true;
    await act(async () => window.dispatchEvent(new window.Event('pageshow')));
    await flush();
    assert.equal(window.location.pathname, '/quantity-breaks/plan', JSON.stringify(calls));
    assert.equal(document.querySelector('#campaigns'), null);
  });
});

test('in-app navigation rechecks subscription without clearing the current page first', async () => {
  let denied = false;
  let reads = 0;
  await workspace('/quantity-breaks/translations', (url) => {
    if (url.endsWith('/subscription')) { reads++; return Response.json({ ...subscription, access: !denied, planPageRequired: denied }); }
    return null;
  }, async ({ document, window, flush }) => {
    denied = true;
    await act(async () => {
      window.history.pushState(null, '', '/quantity-breaks');
      window.dispatchEvent(new window.PopStateEvent('popstate'));
    });
    await flush();
    // The plan component also performs its own subscription read.
    assert.ok(reads >= 2);
    assert.equal(window.location.pathname, '/quantity-breaks/plan');
    assert.equal(document.querySelector('#campaigns'), null);
  });
});

test('a failed result read still clears already confirmed deletions and warns about pending tasks', async () => {
  let reads = 0;
  await workspace('/quantity-breaks', (url) => {
    if (url.endsWith('/campaigns/batch-delete')) return Response.json({ batch: { id: 'b', state: 'queued' }, results: ['delete-offer', 'keep-offer'].map((id) => ({ id, outcome: 'queued' })) }, { status: 202 });
    if (url.endsWith('/campaign-operations/b')) {
      if (++reads > 1) return Response.json({ error: 'temporary' }, { status: 503 });
      return Response.json({ batch: { id: 'b', state: 'running', operations: [{ id: 'op1', campaignId: 'delete-offer', state: 'succeeded', lastError: null }, { id: 'op2', campaignId: 'keep-offer', state: 'running', lastError: null }] } });
    }
    if (url.split('?')[0].endsWith('/campaigns')) return Response.json({ campaigns: [deletableOffer, { ...deletableOffer, id: 'keep-offer', name: 'Pending offer' }] });
    return null;
  }, async ({ document, flush }) => {
    await confirmOfferDeletion(document);
    await flush(1100);
    assert.equal(document.querySelector('a[href$="/delete-offer/edit"]'), null);
    assert.ok(document.querySelector('a[href$="/keep-offer/edit"]'));
    assert.match(document.querySelector('[role="status"]').textContent, /not yet confirmed/);
    assert.doesNotMatch(document.querySelector('[role="status"]').textContent, /2 campaigns deleted/);
  });
});

test('a late deletion result from the previous store cannot remove the current store campaign', async () => {
  let storeId = '42';
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  await workspace('/quantity-breaks', (url) => {
    if (url.endsWith('/shop')) return Response.json({ shop: { storeId } });
    if (url.endsWith('/campaigns/batch-delete')) return Response.json({ batch: { id: 'b', state: 'queued' }, results: [{ id: 'delete-offer', outcome: 'queued' }] }, { status: 202 });
    if (url.endsWith('/campaign-operations/b')) return pending;
    if (url.split('?')[0].endsWith('/campaigns')) return Response.json({ campaigns: [deletableOffer] });
    return null;
  }, async ({ document, window, flush }) => {
    await confirmOfferDeletion(document);
    storeId = '99';
    await act(async () => window.dispatchEvent(new window.Event('pageshow')));
    await flush();
    release(Response.json({ batch: { id: 'b', state: 'completed', operations: [{ id: 'op', campaignId: 'delete-offer', state: 'succeeded', lastError: null }] } }));
    await flush();
    assert.ok(document.querySelector('a[href$="/delete-offer/edit"]'));
    assert.doesNotMatch(document.querySelector('[role="status"]')?.textContent ?? '', /campaigns deleted/);
  });
});
