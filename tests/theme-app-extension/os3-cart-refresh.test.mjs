import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';

const source = readFileSync(new URL('../../theme-app-extension/public/app-block.js', import.meta.url), 'utf8');
const items = [{ id: 'sku-a', quantity: 2 }, { id: 'sku-b', quantity: 1 }];
const added = { items: [{ id: 'sku-a', key: 'key:a', quantity: 2 }, { id: 'sku-b', key: 'key:b', quantity: 1 }] };
const sections = {
  'cart-bubble': '<span class="cart-bubble__count">3</span>',
  'cart-notification': '<div class="cart-notification__subtotal">$30.00</div><div class="cart-notification__buttons">View cart (3)</div>',
  'cart-notification-product': '<div class="cart-item" data-key="old">Unrelated old item</div><div class="cart-item" data-key="key:a">SKU A × 2</div><div class="cart-item" data-key="key:b">SKU B × 1</div>',
  'cart-drawer': '<div class="cart-drawer__body">SKU A × 2; SKU B × 1</div>',
};
const json = value => new Response(JSON.stringify(value));

function setup(type = 'notification', fetcher = async () => json(sections)) {
  const { document, window } = parseHTML(`<html><body data-cart-add-type="${type}" data-page-type="products/detail">
    <theme-cart-bubble><span class="cart-bubble__count">0</span></theme-cart-bubble>
    <theme-cart-bubble><span class="cart-bubble__count">0</span></theme-cart-bubble>
    ${type === 'notification' ? '<theme-cart-notification><theme-modal><details class="cart-notification loading"><div class="cart-notification__items">Old popup</div><div class="cart-notification__subtotal">Old subtotal</div><div class="cart-notification__buttons">Old buttons</div></details></theme-modal></theme-cart-notification>' : type === 'drawer' ? '<theme-cart-drawer><theme-modal><div class="cart-drawer__body">Old drawer</div></theme-modal></theme-cart-drawer>' : ''}
  </body></html>`);
  const events = [], listeners = new Map(), detailCache = new Map(), reads = [];
  const host = { document, DOMParser: window.DOMParser, Event: window.Event, CustomEvent: window.CustomEvent,
    location: new URL('https://example.com/products/jacket?locale=en'), routes: { cartUrl: '/cart?locale=en' },
    ThemeEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    fetch: async (url, init) => { reads.push({ url, init }); return fetcher(url, init); },
    themeEventCenter: {
      addListener(type, fn) { const list = listeners.get(type) || []; list.push(fn); listeners.set(type, list); },
      getCurrentDetail: type => detailCache.get(type),
      dispatch(event) { events.push(event); detailCache.set(event.type, event.detail); for (const fn of listeners.get(event.type) || []) fn(event); },
    },
  };
  // Fashion2's public component contracts. Read/render/open behavior uses real
  // DOM; only platform networking and the event-center SDK are controlled.
  const replace = (ui, docs, configs) => {
    for (const config of configs) for (const selector of config.selectors) ui.querySelector(selector).innerHTML = docs[config.section].querySelector(selector).innerHTML;
  };
  const bubbles = [...document.querySelectorAll('theme-cart-bubble')];
  bubbles.forEach(ui => {
    ui.getRenderConfigs = () => [{ section: 'cart-bubble', selectors: ['.cart-bubble__count'] }];
    ui.replaceElement = docs => replace(ui, docs, ui.getRenderConfigs());
  });
  const popup = document.querySelector('theme-cart-notification');
  let currentKey;
  let opened = 0;
  if (popup) {
    popup.getRenderConfigs = () => [
      { section: 'cart-notification', selectors: ['.cart-notification__subtotal', '.cart-notification__buttons'] },
      { section: 'cart-notification-product', selectors: [] },
    ];
    popup.replaceElement = (docs, options) => {
      replace(popup, docs, popup.getRenderConfigs());
      const row = [...docs['cart-notification-product'].querySelectorAll('.cart-item')].find(node => node.dataset.key === options.lineItemKey);
      popup.querySelector('.cart-notification__items').replaceChildren(...(row ? [row] : []));
      popup.querySelector('.cart-notification').classList.remove('loading');
      host.themeEventCenter.dispatch(new host.ThemeEvent('cart:opened', { detail: { type: 'notification' } }));
    };
    host.themeEventCenter.addListener('variant:added', event => { currentKey = event.detail.lineItemKey; });
  }
  host.themeEventCenter.addListener('cart:open', event => {
    if (type === 'page') { host.location.href = new URL(host.routes.cartUrl, host.location).href; return; }
    if (type === 'drawer' || currentKey) { opened++; document.querySelector('theme-modal').setAttribute('open', ''); currentKey = ''; }
    if (event.detail.refresh) {
      host.fetch('/cart?sections=cart-bubble,cart-notification,cart-notification-product,cart-drawer', { method: 'GET' })
        .then(res => res.json()).then(data => {
          const docs = Object.fromEntries(Object.entries(data).map(([id, html]) => [id, new host.DOMParser().parseFromString(html, 'text/html')]));
          bubbles.forEach(ui => ui.replaceElement(docs));
          if (popup) popup.replaceElement(docs, { lineItemKey: host.themeEventCenter.getCurrentDetail('variant:added')?.lineItemKey });
          const drawer = document.querySelector('theme-cart-drawer');
          if (drawer) replace(drawer, docs, [{ section: 'cart-drawer', selectors: ['.cart-drawer__body'] }]);
        });
    }
  });
  vm.runInNewContext(source, { globalThis: host, URL, Intl, setTimeout, clearTimeout, AbortController });
  return { host, document, events, reads, theme: host.QuantityBreaksTheme, opened: () => opened };
}
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

test('OS3 notification opens once and renders all added lines, subtotal and both bubbles with one section read', async () => {
  const { theme, host, document, events, reads, opened } = setup();
  let duplicateRefresh = 0;
  document.addEventListener('cart:refresh', () => duplicateRefresh++);
  await theme.notifyThemeCartUpdated(items, { cartResponse: added }, host);
  await settle();
  assert.equal(opened(), 1);
  assert.equal(reads.length, 1);
  assert.equal(new URL(reads[0].url, host.location).searchParams.get('sections'), 'cart-notification,cart-notification-product,cart-bubble');
  assert.equal(reads[0].init.cache, 'no-store');
  assert.equal(document.querySelector('.cart-notification__subtotal').textContent, '$30.00');
  assert.equal(document.querySelector('.cart-notification__items').textContent, 'SKU A × 2SKU B × 1');
  assert.equal(document.querySelectorAll('.cart-notification__items .cart-item:not([data-qb-cart-group])').length, 2);
  assert.deepEqual([...document.querySelectorAll('.cart-bubble__count')].map(node => node.textContent), ['3', '3']);
  assert.deepEqual(events.filter(e => e.type === 'variant:added').map(e => e.detail.lineItemKey), ['key:a', 'key:b']);
  assert.equal(events.filter(e => e.type === 'cart:open').length, 1);
  assert.equal(events.filter(e => e.type === 'cart:opened').length, 1);
  assert.equal(duplicateRefresh, 0);
});

test('OS3 single-variant notification uses a real key and shows one cart line', async () => {
  const { theme, host, document, opened } = setup();
  await theme.notifyThemeCartUpdated([items[0]], { cartResponse: { items: [added.items[0]] } }, host);
  await settle();
  assert.equal(opened(), 1);
  assert.equal(document.querySelector('.cart-notification__items').textContent, 'SKU A × 2');
});

test('OS3 fills only missing keys and excludes old personalized rows when reading the cart', async () => {
  const cart = { items: [{ id: 'sku-b', key: 'old', properties: { Engraving: 'Alice' } }, ...added.items] };
  const { theme, host, document, reads, opened } = setup('notification', async url => json(url === '/api/carts/ajax-cart' ? cart : sections));
  await theme.notifyThemeCartUpdated(items, { cartResponse: { items: [added.items[0], items[1]] } }, host);
  await settle();
  assert.equal(opened(), 1);
  assert.equal(reads.filter(call => call.url === '/api/carts/ajax-cart').length, 1);
  assert.equal(document.querySelector('.cart-notification__items').textContent, 'SKU A × 2SKU B × 1');
});

test('OS3 does not open old notification content when section HTML omits a bundle row', async () => {
  let reads = 0;
  const { theme, host, document, opened } = setup('notification', async () => { reads++; return json({ ...sections, 'cart-notification-product': '<div class="cart-item" data-key="key:a">A only</div>' }); });
  await theme.notifyThemeCartUpdated(items, { cartResponse: added }, host);
  await settle();
  assert.equal(opened(), 0);
  assert.equal(reads, 2);
  assert.equal(document.querySelector('.cart-notification__items').textContent, 'Old popup');
  assert.equal(document.querySelector('.cart-notification__subtotal').textContent, 'Old subtotal');
});

test('OS3 retries section GET once after a transient error without another add', async () => {
  let reads = 0;
  const { theme, host, document, opened } = setup('notification', async (_url, init) => {
    assert.equal(init.method, 'GET');
    return ++reads === 1 ? new Response('Unavailable', { status: 503 }) : json(sections);
  });
  await theme.notifyThemeCartUpdated(items, { cartResponse: added }, host);
  await settle();
  assert.equal(reads, 2);
  assert.equal(opened(), 1);
  assert.equal(document.querySelector('.cart-notification__items').textContent, 'SKU A × 2SKU B × 1');
});

test('OS3 drawer retains native open/refresh and receives real per-variant line keys', async () => {
  const { theme, host, document, events, reads, opened } = setup('drawer');
  await theme.notifyThemeCartUpdated(items, { cartResponse: added }, host);
  await settle();
  assert.equal(opened(), 1);
  assert.equal(reads.length, 1);
  assert.equal(events.find(event => event.type === 'cart:open').detail.refresh, true);
  assert.deepEqual(events.filter(event => event.type === 'variant:added').map(event => event.detail.lineItemKey), ['key:a', 'key:b']);
  assert.match(document.querySelector('.cart-drawer__body').textContent, /SKU A.*SKU B/);
});

test('OS3 page cart mode retains native cart navigation without fetching notification sections', async () => {
  const { theme, host, events, reads, opened } = setup('page');
  await theme.notifyThemeCartUpdated(items, { cartResponse: added }, host);
  assert.equal(host.location.pathname, '/cart');
  assert.equal(reads.length, 0);
  assert.equal(opened(), 0);
  assert.deepEqual(events.filter(event => event.type === 'variant:added').map(event => event.detail.lineItemKey), ['key:a', 'key:b']);
});


test('OS3 cart:opened subscribers see an open notification with every added row', async () => {
  const { theme, host, document } = setup();
  const observed = [];
  host.themeEventCenter.addListener('cart:opened', () => observed.push({
    open: document.querySelector('theme-modal').hasAttribute('open'),
    text: document.querySelector('.cart-notification__items').textContent,
  }));
  await theme.notifyThemeCartUpdated(items, { cartResponse: added }, host);
  assert.deepEqual(observed, [{ open: true, text: 'SKU A × 2SKU B × 1' }]);
});

test('OS3 missing line keys still refreshes safe counts and subtotal without opening old items', async () => {
  const { theme, host, document, events, opened } = setup('notification', async url => json(url === '/api/carts/ajax-cart' ? { items: [] } : sections));
  await theme.notifyThemeCartUpdated(items, { cartResponse: { items } }, host);
  assert.equal(opened(), 0);
  assert.deepEqual([...document.querySelectorAll('.cart-bubble__count')].map(node => node.textContent), ['3', '3']);
  assert.equal(document.querySelector('.cart-notification__subtotal').textContent, '$30.00');
  assert.equal(document.querySelector('.cart-notification__items').textContent, 'Old popup');
  assert.equal(events.filter(event => event.type === 'cart:opened').length, 0);
});
