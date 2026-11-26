import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';
import core from '../../../shared/offer-core.cjs';

export const digest = 'a'.repeat(64);
export function rule(id, trigger = 2, quantity = 1) {
  return { ruleId: id, displayOrder: id.charCodeAt(0), productId: `p-${id}`, allowedVariantIds: [`v-${id}`, `v-${id}-2`], quantity,
    label: '', labelPosition: 'corner', showImage: true, discountType: 'fixed_price', discountValue: 0,
    trigger: { type: 'quantity', operator: 'gte', quantity: trigger } };
}
export function offerCampaign() {
  return { id: 'offers', revision: 3, tiers: [1,2,4].map(quantity => ({ tierId: `t${quantity}`, quantity, discountType: 'none', recommended: quantity === 4 })),
    catalogSource: 'theme', catalogIndex: { namespace: 'qb_test_offers', key: 'catalog_v1', version: 1, digest },
    offerCapability: { protocol: 'gift-bundles-v1', functionVerified: true },
    offerTitles: { gifts: '🎁 Free gifts with your order', bundles: 'Frequently Bought Together' },
    gifts: { ...core.defaultOfferModule('gifts'), enabled: true, items: [rule('a'),rule('b',3)] },
    bundles: { ...core.defaultOfferModule('bundles'), enabled: true, selectionMode: 'multiple', items: ['c','d'].map(id => ({ ...rule(id), discountType: 'percentage', discountValue: 5000 })) } };
}
export function offerMarkup(campaign = offerCampaign()) {
  const rules = [...campaign.gifts.items, ...campaign.bundles.items];
  return `<div class="quantity-breaks-app-block" data-shop="test" data-product-id="main" data-product-handle="main-handle" data-currency="USD" data-country-code="US" data-shop-currency="USD" data-locale="en" data-offer-native="1" hidden>
    <span data-product-option="Size"></span><span data-variant-id="v-main" data-option1="S" data-price="1000" data-available="true"></span>
    <div data-offer-native-catalog data-currency="USD" data-locale="en" data-country-code="US" hidden>
      <div data-offer-entry="offers" data-digest="${digest}">${rules.map(r => `<div data-offer-ref="${r.productId}" data-handle="${r.productId}">${r.allowedVariantIds.map(id => `<i data-offer-allowed="${id}"></i>`).join('')}</div>`).join('')}</div>
      ${rules.map(r => `<div data-offer-product="${r.productId}" data-handle="${r.productId}" data-title="Product ${r.ruleId}">${r.allowedVariantIds.map((id,i) => `<span data-offer-variant="${id}" data-title="${i ? 'L' : 'S'}" data-price="${(i+1)*2000}" data-available="true"></span>`).join('')}</div>`).join('')}
    </div></div>`;
}
export function setupOffers({ campaign = offerCampaign(), response, markup = offerMarkup(campaign), fetcher, mobile = false, timers = {} } = {}) {
  const { document, window } = parseHTML(markup);
  const calls = [], changes = [];
  const media = { matches: mobile, addEventListener(_,fn) { changes.push(fn); }, removeEventListener() {} };
  const host = { fetch: fetcher || (async (url,init) => { calls.push({url,init}); return { ok: true, json: async () => response || ({version:2,clientFeatures:'gift-bundles-v1',campaign}) }; }), Event: window.Event, matchMedia: () => media };
  // Exercise canonical sources before the release sync writes generated assets.
  const generated = `  // BEGIN GENERATED OFFERS\n  const OfferCore = (() => { const exports = {};\n${readFileSync(new URL('../../../shared/offer-core.cjs', import.meta.url),'utf8')}\nreturn exports; })();\n${readFileSync(new URL('../../../scripts/theme-offer-runtime.js', import.meta.url),'utf8')}\n  // END GENERATED OFFERS`;
  const source = readFileSync(new URL('../../../theme-app-extension/public/app-block.js', import.meta.url),'utf8')
    .replace(/  \/\/ BEGIN GENERATED OFFERS[\s\S]*?  \/\/ END GENERATED OFFERS/, () => generated)
    .replace('  scope.QuantityBreaksTheme = {','  scope.__offerFixtureState = offerBlockState;\n  scope.QuantityBreaksTheme = {');
  vm.runInNewContext(source, { globalThis:host, URL, Intl, console, structuredClone, setTimeout, clearTimeout, ...timers });
  const block=document.querySelector('.quantity-breaks-app-block');
  return { theme: host.QuantityBreaksTheme, block, document, window, calls, media,
    setNativeAvailability(productId,variantId,available) { host.__offerFixtureState.get(block).native.products.get(productId).variants.find(v=>v.id===variantId).available=available; },
    resize() { media.matches = !media.matches; changes.forEach(fn => fn()); } };
}

// linkedom does not implement native checkbox activation/default change events.
// Browser QA separately exercises real click, label, Space and touch behavior.
export function changeOfferSelection(h, ruleId) {
  const input = h.block.querySelector(`[data-offer-rule="${ruleId}"] [data-offer-select]`);
  if (input.disabled) return;
  input.checked = !input.checked;
  input.dispatchEvent(new h.window.Event('change', { bubbles: true }));
}
