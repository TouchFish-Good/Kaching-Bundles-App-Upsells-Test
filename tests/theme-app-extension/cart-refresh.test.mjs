import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';
import { renderOs21, os21Campaign } from './helpers/os21-fixture.mjs';

const source = readFileSync(new URL('../../theme-app-extension/public/app-block.js', import.meta.url), 'utf8');
const json = value => new Response(JSON.stringify(value));
const items = [{ id: 'sku21', quantity: 2 }, { id: 'sku-b', quantity: 1 }];
const added = { items: [{ id: 'sku21', quantity: 2, key: 'line:a' }, { id: 'sku-b', quantity: 1, key: 'line:b' }] };
const badgeSections = {
  'cart-icon-bubble': '<div id="cart-icon-bubble-wrapper">3</div>',
  'cart-icon-bubble-mobile': '<div id="cart-icon-bubble-wrapper-mobile">3</div>',
};
const drawerSections = { ...badgeSections, 'cart-drawer': '<div class="cart-drawer__body">SKU A × 2; SKU B × 1</div>' };
const notificationSections = { ...badgeSections,
  'cart-notification-product': '<div id="cart-notification-product-line:a"><span>SKU A</span></div><div id="cart-notification-product-line:b"><span>SKU B</span></div><div id="cart-notification-product-old"><span>Unrelated old item</span></div>',
  'cart-notification-button': '<a class="cart-notification-button">View cart (3)</a>',
  'cart-notification-subtotal': '<div class="cart-notification-subtotal">$30.00</div>',
};

function setup(type = 'drawer', fetcher = async () => json(drawerSections), timers = {}) {
  const { document, window } = parseHTML(`<html><body>
    <div id="cart-icon-bubble"><span id="cart-icon-bubble-wrapper">0</span></div>
    <div id="cart-icon-bubble-mobile"><span id="cart-icon-bubble-wrapper-mobile">0</span></div>
    ${type === 'drawer' ? '<cart-drawer-entry><cart-drawer><div class="cart-drawer__body">Old cart</div></cart-drawer></cart-drawer-entry>' : type === 'notification' ? '<cart-notification><div id="cart-notification"><div id="cart-notification-product">Old product</div><div id="cart-notification-button"></div><div id="cart-notification-subtotal"></div></div></cart-notification>' : ''}
  </body></html>`);
  const host = { document, DOMParser: window.DOMParser, Event: window.Event, CustomEvent: window.CustomEvent,
    location: new URL('https://example.com/products/jacket?locale=en'), fetch: fetcher,
    matchMedia: () => ({ matches: false, addEventListener() {} }),
  };
  const ui = document.querySelector('cart-notification, cart-drawer-entry');
  if (ui) {
    // The supplied Mordern theme's rendering contract, with real DOM updates.
    // Network is controlled; destinations, parsing, opening and badges are real.
    ui.getSectionsToRender = () => type === 'drawer' ? [
      { id: 'cart-drawer', selector: '.cart-drawer__body' },
      { id: 'cart-icon-bubble', selector: '#cart-icon-bubble-wrapper' },
      { id: 'cart-icon-bubble-mobile', selector: '#cart-icon-bubble-wrapper-mobile' },
    ] : [
      { id: 'cart-notification-product', selector: `[id="cart-notification-product-${ui.cartItemKey}"]` },
      { id: 'cart-notification-button', selector: '.cart-notification-button' },
      { id: 'cart-icon-bubble', selector: '#cart-icon-bubble-wrapper' },
      { id: 'cart-icon-bubble-mobile', selector: '#cart-icon-bubble-wrapper-mobile' },
      { id: 'cart-notification-subtotal', selector: '.cart-notification-subtotal' },
    ];
    ui.renderContents = response => {
      ui.cartItemKey = response.key;
      for (const section of ui.getSectionsToRender()) {
        const target = type === 'drawer' ? document.querySelector(section.selector) : document.getElementById(section.id);
        target.innerHTML = new host.DOMParser().parseFromString(response.sections[section.id], 'text/html').querySelector(section.selector).innerHTML;
      }
      document.querySelector(type === 'drawer' ? 'cart-drawer' : '#cart-notification').classList.add('active');
      if (type === 'drawer') document.body.classList.add('overflow-hidden');
    };
  }
  vm.runInNewContext(source, { globalThis: host, URL, Intl, setTimeout, clearTimeout, AbortController, ...timers });
  return { host, document, ui, theme: host.QuantityBreaksTheme };
}

test('OS2.1 refreshes server-rendered drawer and both badges before opening, without generic duplicate events', async () => {
  const reads = [];
  const { theme, host, document } = setup('drawer', async (url, init) => { reads.push({ url, init }); return json(drawerSections); });
  let generic = 0;
  document.addEventListener('cart:refresh', () => generic++);
  await theme.notifyThemeCartUpdated(items, { cartResponse: added }, host);
  assert.equal(document.querySelector('.cart-drawer__body').textContent, 'SKU A × 2; SKU B × 1');
  assert.equal(document.querySelector('#cart-icon-bubble-wrapper').textContent, '3');
  assert.equal(document.querySelector('#cart-icon-bubble-mobile').textContent, '3');
  assert.ok(document.querySelector('cart-drawer').classList.contains('active'));
  assert.ok(document.body.classList.contains('overflow-hidden'));
  assert.equal(reads.length, 1);
  const url = new URL(reads[0].url, host.location.origin);
  assert.equal(url.pathname, '/products/jacket');
  assert.equal(url.searchParams.get('locale'), 'en');
  assert.equal(url.searchParams.get('sections'), 'cart-drawer,cart-icon-bubble,cart-icon-bubble-mobile');
  assert.equal(reads[0].init.method, 'GET');
  assert.equal(reads[0].init.cache, 'no-store');
  assert.equal(generic, 0);
});

test('OS2.1 notification uses cart-line keys and displays every added variant, excluding unrelated cart rows', async () => {
  const { theme, host, document } = setup('notification', async () => json(notificationSections));
  await theme.notifyThemeCartUpdated(items, { cartResponse: added }, host);
  const popup = document.querySelector('#cart-notification');
  assert.ok(popup.classList.contains('active'));
  assert.match(document.querySelector('#cart-notification-product').textContent, /SKU A/);
  assert.match(document.querySelector('#cart-notification-product').textContent, /SKU B/);
  assert.doesNotMatch(document.querySelector('#cart-notification-product').textContent, /Unrelated/);
  assert.equal(document.querySelector('#cart-notification-subtotal').textContent, '$30.00');
  assert.equal(document.querySelector('#cart-icon-bubble-mobile').textContent, '3');
});

test('OS2.1 reads cart keys when the batch response omits them', async () => {
  const calls = [];
  const { theme, host, document } = setup('notification', async (url, init) => {
    calls.push({ url, init });
    return json(url === '/api/carts/ajax-cart' ? added : notificationSections);
  });
  await theme.notifyThemeCartUpdated(items, { cartResponse: { items } }, host);
  assert.ok(document.querySelector('#cart-notification').classList.contains('active'));
  assert.equal(calls.filter(call => call.url === '/api/carts/ajax-cart').length, 1);
  assert.ok(calls.every(call => call.init.method === 'GET'));
});

test('OS2.1 cart fallback excludes old personalized lines of the same variant', async () => {
  for (const properties of [{ Engraving: 'Alice' }, [{ name: 'Engraving', value: 'Alice', type: 'text' }]]) {
    const cart = { items: [{ id: 'sku21', key: 'old-personalized', quantity: 1, properties }, ...added.items] };
    const sections = { ...notificationSections, 'cart-notification-product': notificationSections['cart-notification-product'] + '<div id="cart-notification-product-old-personalized">Old personalized item for Alice</div>' };
    const { theme, host, document } = setup('notification', async url => json(url === '/api/carts/ajax-cart' ? cart : sections));
    await theme.notifyThemeCartUpdated(items, { cartResponse: { items } }, host);
    assert.ok(document.querySelector('#cart-notification').classList.contains('active'));
    assert.match(document.querySelector('#cart-notification-product').textContent, /SKU A.*SKU B/);
    assert.doesNotMatch(document.querySelector('#cart-notification-product').textContent, /Alice/);
  }
});

test('OS2.1 preserves known POST keys when only another variant needs a cart lookup', async () => {
  const cart = { items: [{ id: 'sku21', key: 'another-line-a' }, added.items[1]] };
  const { theme, host, document } = setup('notification', async url => json(url === '/api/carts/ajax-cart' ? cart : notificationSections));
  await theme.notifyThemeCartUpdated(items, { cartResponse: { items: [added.items[0], items[1]] } }, host);
  assert.ok(document.querySelector('#cart-notification').classList.contains('active'));
  assert.match(document.querySelector('#cart-notification-product').textContent, /SKU A.*SKU B/);
});

test('OS2.1 avoids a misleading notification when multiple cart rows match one submitted variant', async () => {
  const cart = { items: [added.items[0], { id: 'sku21', key: 'ambiguous-second', properties: {} }, added.items[1]] };
  const { theme, host, document } = setup('notification', async url => json(url === '/api/carts/ajax-cart' ? cart : notificationSections));
  await theme.notifyThemeCartUpdated(items, { cartResponse: cart }, host);
  assert.equal(document.querySelector('#cart-notification-product').textContent, 'Old product');
  assert.ok(!document.querySelector('#cart-notification').classList.contains('active'));
});

test('OS2.1 retries only the section read when HTML is temporarily unavailable', async () => {
  let reads = 0;
  const { theme, host, document } = setup('drawer', async (_url, init) => {
    assert.equal(init.method, 'GET');
    return ++reads === 1 ? new Response('Unavailable', { status: 503 }) : json(drawerSections);
  });
  await theme.notifyThemeCartUpdated(items, { cartResponse: added }, host);
  assert.equal(reads, 2);
  assert.ok(document.querySelector('cart-drawer').classList.contains('active'));
});

test('OS2.1 validates every section before changing DOM or opening a stale drawer', async () => {
  let reads = 0;
  const { theme, host, document } = setup('drawer', async () => { reads++; return json({ ...drawerSections, 'cart-icon-bubble-mobile': null }); });
  await theme.notifyThemeCartUpdated(items, { cartResponse: added }, host);
  assert.equal(reads, 2);
  assert.equal(document.querySelector('.cart-drawer__body').textContent, 'Old cart');
  assert.equal(document.querySelector('#cart-icon-bubble-wrapper').textContent, '0');
  assert.ok(!document.querySelector('cart-drawer').classList.contains('active'));
});

test('OS2.1 bounds stalled section reads and leaves the existing cart intact', async () => {
  let reads = 0;
  const { theme, host, document } = setup('drawer', () => { reads++; return new Promise(() => {}); }, {
    setTimeout: callback => setTimeout(callback, 5),
  });
  await theme.notifyThemeCartUpdated(items, { cartResponse: added }, host);
  assert.equal(reads, 2);
  assert.equal(document.querySelector('.cart-drawer__body').textContent, 'Old cart');
  assert.ok(!document.querySelector('cart-drawer').classList.contains('active'));
});

test('OS2.1 does not retry a native renderer that already opened the cart then threw', async () => {
  let reads = 0;
  const { theme, host, document, ui } = setup('drawer', async () => { reads++; return json(drawerSections); });
  const render = ui.renderContents;
  ui.renderContents = response => { render(response); throw new Error('Theme payment-button SDK unavailable'); };
  await theme.notifyThemeCartUpdated(items, { cartResponse: added }, host);
  assert.equal(reads, 1);
  assert.ok(document.querySelector('cart-drawer').classList.contains('active'));
  assert.equal(document.querySelector('#cart-icon-bubble-wrapper').textContent, '3');
});

test('OS2.1 rejects notification HTML missing a bundle line before updating any cart content', async () => {
  const incomplete = { ...notificationSections, 'cart-notification-product': '<div id="cart-notification-product-line:a">Only A</div>' };
  const { theme, host, document } = setup('notification', async () => json(incomplete));
  await theme.notifyThemeCartUpdated(items, { cartResponse: added }, host);
  assert.equal(document.querySelector('#cart-notification-product').textContent, 'Old product');
  assert.equal(document.querySelector('#cart-icon-bubble-wrapper').textContent, '0');
  assert.ok(!document.querySelector('#cart-notification').classList.contains('active'));
});

test('confirmed timeout outcome preserves real cart keys for native notification without another write or cart read', async () => {
  const { theme, host, document } = setup('notification', async () => json(notificationSections));
  let posts = 0;
  const reads = [{ items: [] }, added];
  const result = await theme.addBundle(['sku21', 'sku21', 'sku-b'], [
    { id: 'sku21', available: true }, { id: 'sku-b', available: true },
  ], async () => { posts++; throw new Error('Response lost'); }, async () => reads.shift());
  assert.equal(result.status, 'added');
  await theme.notifyThemeCartUpdated(items, { cartResponse: result.cartResponse }, host);
  assert.equal(posts, 1);
  assert.equal(reads.length, 0);
  assert.match(document.querySelector('#cart-notification-product').textContent, /SKU A.*SKU B/);
});

test('OS3 keeps its existing event bridge and does not fetch OS2.1 sections', async () => {
  const { theme, host } = setup('none', async () => { throw new Error('Unexpected fetch'); });
  const events = [];
  host.ThemeEvent = class { constructor(type, options) { this.type = type; this.detail = options.detail; } };
  host.themeEventCenter = { dispatch: event => events.push(event) };
  await theme.notifyThemeCartUpdated(items, {}, host);
  assert.deepEqual(events.map(event => event.type), ['variant:added', 'variant:added', 'cart:open']);
});

test('OS3 event bridge takes precedence over similarly named cart custom elements', async () => {
  let reads = 0;
  const { theme, host } = setup('drawer', async () => { reads++; return json(drawerSections); });
  const events = [];
  host.ThemeEvent = class { constructor(type) { this.type = type; } };
  host.themeEventCenter = { dispatch: event => events.push(event) };
  await theme.notifyThemeCartUpdated(items, { productId: 'product-21', cartResponse: added }, host);
  assert.deepEqual(events.map(event => event.type), ['variant:added', 'variant:added', 'cart:open']);
  assert.equal(reads, 0);
});

test('OS2.1 page cart mode follows the native cart route after confirmed add', async () => {
  const { theme, host } = setup('none');
  let destination;
  host.routes = { cart_url: '/cart' };
  host.location.assign = value => { destination = value; };
  await theme.notifyThemeCartUpdated(items, { themeVersion: '2.1' }, host);
  assert.equal(destination, '/cart');
});

test('mounted OS2.1 block keeps confirmed add successful even if section refresh fails, never posting twice', async () => {
  let posts = 0;
  let sectionReads = 0;
  const { theme, host, document } = setup('drawer', async (url, init) => {
    if (url === '/cart/add') { posts++; return json({ items: [{ id: 'sku21', quantity: 2, key: 'line:a' }] }); }
    if (url === '/api/carts/ajax-cart') return json({ items: [] });
    if (url.includes('sections=')) { sectionReads++; return new Response('Unavailable', { status: 503 }); }
    return json({ campaign: os21Campaign });
  });
  document.body.insertAdjacentHTML('beforeend', renderOs21());
  const block = document.querySelector('.quantity-breaks-app-block');
  await theme.mountBlock(block, host.fetch);
  block.querySelector('[data-add-bundle]').click();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(posts, 1);
  assert.equal(sectionReads, 2);
  assert.match(block.querySelector('.qb-status').textContent, /2 items were added/);
  assert.equal(block.querySelector('[data-add-bundle]').getAttribute('aria-busy'), 'false');
});
