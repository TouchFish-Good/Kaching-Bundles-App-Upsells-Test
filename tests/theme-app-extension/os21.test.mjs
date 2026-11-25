import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';
import { renderOs21, os21Context, os21Campaign } from './helpers/os21-fixture.mjs';
const extension = new URL('../../theme-app-extension/', import.meta.url);
function setup(context = os21Context) {
  const { document, window } = parseHTML(renderOs21(context));
  const calls = [];
  const host = { fetch: async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => ({ campaign: os21Campaign }) }; },
    Event: window.Event, matchMedia: () => ({ matches: false, addEventListener() {} }) };
  vm.runInNewContext(readFileSync(new URL('public/app-block.js', extension), 'utf8'), { globalThis: host, URL, Intl });
  return { document, block: document.querySelector('.quantity-breaks-app-block'), theme: host.QuantityBreaksTheme, calls };
}
test('renders OS2.1 escaped metadata, five option groups and localized theme copy', () => {
  const { block, theme } = setup();
  assert.equal(block.dataset.shopId, '1726037928557');
  assert.equal(block.dataset.productTitle, os21Context.product.title);
  assert.equal(block.querySelector('special'), null);
  assert.equal(block.querySelector('[data-qb-copy="widget.title"]').textContent, 'Bundle & save');
  const catalog = theme.readCatalog(block);
  assert.equal(catalog.variants[0].options.Material, 'Cotton');
  assert.equal(catalog.variants[0].options.Style, 'Regular');
  assert.equal(catalog.variants[0].price, 19.99);
  assert.equal(catalog.variants[1].available, false);
});
test('OS2.1 mounts by shop ID and requests live classification without trusting an old snapshot', async () => {
  const { block, theme, calls } = setup();
  await theme.mountBlock(block);
  assert.equal(calls.length, 1);
  const query = new URL(calls[0].url).searchParams;
  assert.equal(query.get('shopId'), '1726037928557');
  assert.equal(query.get('themeVersion'), '2.1');
  assert.equal(query.has('shop'), false);
  assert.equal(block.hidden, false);
  assert.equal(block.querySelector('.qb-slot .qb-variant-price b').textContent, '$15.99');
  assert.equal(block.querySelector('[data-bundle-total]').textContent, '$31.98');
});
test('OS2.1 hides unavailable products and supports Chinese static translations', () => {
  const sold = structuredClone(os21Context); sold.product.available = false;
  assert.equal(setup(sold).block, null);
  const chinese = structuredClone(os21Context); chinese.localization.language.iso_code = 'zh-hans-cn';
  const { block } = setup(chinese);
  const locale = JSON.parse(readFileSync(new URL('i18n/zh-hans-cn.json', extension), 'utf8'));
  assert.equal(block.querySelector('[data-qb-copy="widget.sold_out"]').textContent, locale.app_block.widget.sold_out);
});
test('OS2.1 assets and storefront locales preserve the shared source without OS3 editor locale files', () => {
  for (const name of ['app-block.js', 'app-block.css']) {
    assert.equal(readFileSync(new URL(`compatibility/assets/${name}`, extension), 'utf8'), readFileSync(new URL(`public/${name}`, extension), 'utf8'));
  }
  const names = readdirSync(new URL('compatibility/locales/', extension));
  assert.equal(names.some(name => name.endsWith('.schema.json')), false);
  for (const name of readdirSync(new URL('i18n/', extension)).filter(name => !name.endsWith('.schema.json'))) {
    assert.equal(readFileSync(new URL(`compatibility/locales/${name}`, extension), 'utf8'), readFileSync(new URL(`i18n/${name}`, extension), 'utf8'));
  }
});
test('initializes theme editor replacement blocks exactly once without duplicate cart handlers', async () => {
  const { document, window } = parseHTML('<html><body></body></html>');
  let requests = 0;
  let listeners = 0;
  const host = { document, MutationObserver: window.MutationObserver, fetch: async () => { requests++; return { ok: true, json: async () => ({ campaign: os21Campaign }) }; },
    Event: window.Event, matchMedia: () => ({ matches: false, addEventListener() { listeners++; }, removeEventListener() { listeners--; } }) };
  const context = { globalThis: host, URL, Intl };
  const source = readFileSync(new URL('public/app-block.js', extension), 'utf8');
  vm.runInNewContext(source, context);
  document.body.innerHTML = renderOs21();
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(requests, 1);
  assert.equal(document.querySelector('.quantity-breaks-app-block').hidden, false);
  vm.runInNewContext(source, context);
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(requests, 1, 'repeated asset loads do not mount the same node again');
  document.body.innerHTML = renderOs21();
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(requests, 2, 'a replaced node initializes without reloading the whole page');
  assert.equal(listeners, 1, 'removed blocks release viewport listeners');
});
test('renders every storefront locale and a product with a single option and no compare price', () => {
  for (const name of readdirSync(new URL('i18n/', extension)).filter(name => !name.endsWith('.schema.json'))) {
    const context = structuredClone(os21Context); context.localization.language.iso_code = name.replace('.json', '');
    const { block } = setup(context);
    assert.ok(block.querySelector('[data-qb-copy="widget.title"]').textContent);
    const template = readFileSync(new URL('compatibility/blocks/app-block.html', extension), 'utf8');
    const schema = JSON.parse(/{{#schema}}([\s\S]*?){{\/schema}}/.exec(template)[1]);
    const copy = JSON.parse(readFileSync(new URL(`compatibility/locales/${context.localization.language.iso_code}.json`, extension), 'utf8'));
    assert.equal(schema.target, 'section');
    assert.equal(schema.name, 'Multi-item Discounts');
    assert.deepEqual(schema.locales[context.localization.language.iso_code], copy);
    for (const [, key] of template.matchAll(/{{\s*t\s+'([^']+)'\s*}}/g)) {
      assert.equal(typeof key.split('.').reduce((value, part) => value?.[part], copy), 'string', `${name}:${key}`);
    }
  }
  const one = structuredClone(os21Context); one.product.options = ['Size'];
  one.product.variants = [{ id: 'single-sku', title: 'S', option1: 'S', price: 0, available: true }];
  const { theme, block } = setup(one);
  const variant = theme.readCatalog(block).variants[0];
  assert.equal(variant.price, 0); assert.equal(variant.compareAtPrice, null);
});
test('preserves metadata when a removed pending block fails and later returns to the document', async () => {
  const { document, window } = parseHTML('<html><body></body></html>');
  let rejectFirst; let requests = 0;
  const first = new Promise((_, reject) => { rejectFirst = reject; });
  const host = { document, MutationObserver: window.MutationObserver, fetch: async () => {
    requests++;
    if (requests === 1) return first;
    return { ok: true, json: async () => ({ campaign: os21Campaign }) };
  }, Event: window.Event, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) };
  vm.runInNewContext(readFileSync(new URL('public/app-block.js', extension), 'utf8'), { globalThis: host, URL, Intl });
  document.body.innerHTML = renderOs21();
  await new Promise(resolve => setTimeout(resolve, 10));
  const block = document.querySelector('.quantity-breaks-app-block'); block.remove();
  await new Promise(resolve => setTimeout(resolve, 10));
  rejectFirst(new Error('network failure'));
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.ok(block.querySelector('[data-variant-id]'), 'a removed block retains its template data');
  document.body.append(block);
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(requests, 2); assert.equal(block.hidden, false);
});
test('uses the OS2.1 product template identifier accepted by the platform schema validator', () => {
  const template = readFileSync(new URL('compatibility/blocks/app-block.html', extension), 'utf8');
  const schema = JSON.parse(/{{#schema}}([\s\S]*?){{\/schema}}/.exec(template)[1]);
  assert.deepEqual(schema.templates, ['products/detail']);
  const os3 = readFileSync(new URL('blocks/app-block.html', extension), 'utf8');
  const os3Schema = JSON.parse(/{{#schema}}([\s\S]*?){{\/schema}}/.exec(os3)[1]);
  assert.deepEqual(os3Schema.templates, ['product']);
});

test('actual OS2.1 template mounts JPY main and compare prices in native currency subunits',async()=>{
  const context=structuredClone(os21Context);
  context.shop.currency.iso_code='JPY';context.localization.country.currency.iso_code='JPY';
  context.product.variants[0].price=123;context.product.variants[0].compare_at_price=456;
  const {block,theme}=setup(context);const variant=theme.readCatalog(block).variants[0];
  assert.equal(variant.price,123);assert.equal(variant.compareAtPrice,456);
  await theme.mountBlock(block);
  assert.equal(block.querySelector('.qb-slot .qb-variant-price b').textContent,'¥98');
  assert.equal(block.querySelector('.qb-slot .qb-variant-price del').textContent,'¥123','current tier comparison uses original selling price');
  assert.equal(block.querySelector('[data-bundle-total]').textContent,'¥196');
});
