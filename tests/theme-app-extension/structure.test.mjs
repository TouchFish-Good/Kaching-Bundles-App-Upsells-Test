import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const extension = new URL('../../theme-app-extension/', import.meta.url);

test('product block includes its own CDN resources when schema injection is absent', () => {
  const block = readFileSync(new URL('blocks/app-block.html', extension), 'utf8');
  assert.match(block, /<link[^>]+href="\{\{ "app-block\.css" \| asset_url\(\) \}\}"/);
  assert.match(block, /<script[^>]+src="\{\{ "app-block\.js" \| asset_url\(\) \}\}"[^>]+defer/);
});

test('publishable theme extension keeps tests and package dependencies outside its root', () => {
  assert.equal(existsSync(new URL('test/', extension)), false);
  assert.equal(existsSync(new URL('tests/', extension)), false);
  assert.equal(existsSync(new URL('node_modules/', extension)), false);
  assert.equal(existsSync(new URL('package.json', extension)), false);
});

test('product App Block has a localized merchant-facing identity without a merchant origin setting', () => {
  const block = readFileSync(new URL('blocks/app-block.html', extension), 'utf8');
  assert.match(block, /"target": "section"/);
  assert.match(block, /"templates": \["product"\]/);
  assert.doesNotMatch(block, /api_origin|apiOrigin/);
  for (const [locale, name] of [['en', 'Multi-item Discounts'], ['zh-hans-cn', '多件折扣'], ['zh-hant-tw', '多件折扣']]) {
    const schema = JSON.parse(readFileSync(new URL(`i18n/${locale}.schema.json`, extension), 'utf8'));
    assert.equal(schema.appBlock.block.name, name);
    assert.equal(Object.prototype.hasOwnProperty.call(schema.appBlock.block.settings, 'apiOrigin'), false);
  }
});

test('product metadata and corner badges stay scoped to their own tier cards', () => {
  const block = readFileSync(new URL('blocks/app-block.html', extension), 'utf8');
  const css = readFileSync(new URL('public/app-block.css', extension), 'utf8');
  assert.match(block, /data-product-title="\{\{ product\.title \}\}"/);
  assert.match(block, /data-variant-title="\{\{ variant\.title \}\}"/);
  assert.match(block, /data-compare-at-price="\{\{ variant\.compare_at_price \}\}"/);
  assert.match(css, /\.quantity-breaks-app-block \.qb-tier \{[^}]*position:\s*relative;/);
  assert.match(css, /\.qb-tiers\[data-desktop-badge-position="corner"\] \.qb-badge \{[^}]*position:\s*absolute;/);
  assert.match(css, /\.qb-tiers\[data-mobile-badge-position="corner"\] \.qb-badge \{[^}]*position:\s*absolute;/);
});

test('theme widget option rows and long text values wrap within their cards', () => {
  const css = readFileSync(new URL('public/app-block.css', extension), 'utf8');

  assert.match(css, /\.qb-option\s*\{[\s\S]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(50%,\s*1fr\)\)/);
  assert.match(css, /\.qb-tier-header\s*>\s*\.qb-tier-original\s*\{[\s\S]*overflow-wrap:\s*anywhere/);
  assert.match(css, /\.qb-value-text\s*\{[\s\S]*word-break:\s*break-word/);
});

test('theme CSS activates mobile aliases at 750px and maps Grid to two columns', () => {
  const css = readFileSync(new URL('public/app-block.css', extension), 'utf8');
  assert.match(css, /\.qb-layout-grid\s*\{[^}]*grid-template-columns:\s*repeat\(var\(--qb-tier-columns\),\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /@media\s*\(max-width:\s*750px\)[\s\S]*--qb-tier-columns:\s*var\(--qb-mobile-tier-columns/);
  assert.match(css, /@media\s*\(max-width:\s*750px\)[\s\S]*--qb-badge-size:\s*var\(--qb-mobile-badge-size/);
  assert.match(css, /@media\s*\(max-width:\s*750px\)[\s\S]*--qb-summary-amount-size:\s*var\(--qb-mobile-summary-amount-size/);
});

test('ships complete locale-specific static widget copy for all supported storefront locales', () => {
  const locales = ['ar', 'bg', 'cs', 'da', 'de', 'el', 'en', 'es', 'et', 'fi', 'fr', 'hi', 'hr', 'hu', 'id', 'it', 'ja', 'ko', 'lt', 'lv', 'ms', 'nb', 'nl', 'pl', 'pt-br', 'pt-pt', 'ro', 'ru', 'sk', 'sl', 'sv', 'th', 'tr', 'vi', 'zh-hans-cn', 'zh-hant-tw'];
  const keys = ['title', 'tier_savings_badge', 'description', 'tier_rule', 'original', 'savings', 'total', 'add_to_cart', 'add_to_cart_quantity', 'adding', 'cart_failure', 'cart_success', 'cart_uncertain', 'choose_option', 'item_option', 'tier_items', 'sold_out', 'no_stock', 'calculated_at_checkout'];
  assert.equal(locales.length, 36);
  for (const locale of locales) {
    const copy = JSON.parse(readFileSync(new URL(`i18n/${locale}.json`, extension), 'utf8'));
    assert.ok(copy.app_block?.widget);
    for (const key of keys) assert.equal(typeof copy.app_block.widget[key], 'string', `${locale}:${key}`);
    assert.match(copy.app_block.widget.add_to_cart_quantity, /\{quantity\}/, `${locale}:add_to_cart_quantity placeholder`);
    assert.match(copy.app_block.widget.tier_savings_badge, /\{saving_amount\}/, `${locale}:tier_savings_badge placeholder`);
  }
});
