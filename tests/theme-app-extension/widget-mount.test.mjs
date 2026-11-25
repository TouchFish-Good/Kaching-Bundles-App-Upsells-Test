import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';
import { createServer } from 'vite';

const source = readFileSync(new URL('../../theme-app-extension/public/app-block.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../theme-app-extension/public/app-block.css', import.meta.url), 'utf8');
const markup = `<div class="quantity-breaks-app-block" data-shop="shop-a" data-product-id="product-1" hidden>
  <span data-product-option="Color"></span><span data-product-option="Size"></span>
  <span data-variant-id="black-s" data-option1="Black" data-option2="S" data-price="10000" data-available="true" data-inventory-quantity="2"></span>
  <span data-variant-id="white-l" data-option1="White" data-option2="L" data-price="11600" data-available="true" data-inventory-policy="continue" data-inventory-quantity="3"></span>
  <span data-variant-id="black-m" data-option1="Black" data-option2="M" data-price="9800" data-available="false" data-inventory-tracker="true" data-inventory-quantity="0"></span>
</div>`;
const campaign = { id: 'offer-a', name: 'Bundle & save', tiers: [
  { tierId: 'single', quantity: 1, discountType: 'none', label: 'Single' },
  { tierId: 'trio', quantity: 3, discountType: 'percentage', discountValue: 2000, label: 'Trio', recommended: true },
] };

function setup(fetcher, mobile = false) {
  const { document, window } = parseHTML(markup);
  const context = { globalThis: { fetch: fetcher, Event: window.Event, matchMedia: () => ({ matches: mobile, addEventListener() {}, addListener() {} }) }, URL, Intl, console };
  vm.runInNewContext(source, context);
  return { theme: context.globalThis.QuantityBreaksTheme, block: document.querySelector('.quantity-breaks-app-block'), window };
}

test('converts SLine hundredths to major-unit catalog prices, including zero-decimal currencies', () => {
  for (const sample of [
    { currency: 'USD', price: '1999', compare: '2499', expected: 19.99, expectedCompare: 24.99 },
    { currency: 'JPY', price: '90804100', compare: '100000000', expected: 908041, expectedCompare: 1000000 },
    { currency: 'CNY', price: '8888', compare: '', expected: 88.88, expectedCompare: null },
    { currency: 'USD', price: '0', compare: '0', expected: 0, expectedCompare: 0 },
  ]) {
    const { theme, block } = setup();
    block.dataset.currency = sample.currency;
    const node = block.querySelector('[data-variant-id="black-s"]');
    node.dataset.price = sample.price;
    node.dataset.compareAtPrice = sample.compare;
    const variant = theme.readCatalog(block).variants[0];
    assert.equal(variant.price, sample.expected, sample.currency);
    assert.equal(variant.compareAtPrice, sample.expectedCompare, sample.currency);
  }
});

test('renders SLine prices at the native scale in tiers, variant slots, totals and add button', async () => {
  for (const sample of [
    { currency: 'USD', price: '1999', unit: '$19.99', discountedUnit: '$15.99', total: '$31.98', original: '$39.98', savings: '$8.00' },
    { currency: 'JPY', price: '90804100', unit: '¥908,041', discountedUnit: '¥726,433', total: '¥1,452,866', original: '¥1,816,082', savings: '¥363,216' },
  ]) {
    const published = { ...campaign, tiers: [campaign.tiers[0], { tierId: 'pair', quantity: 2, discountType: 'percentage', discountValue: 2000, recommended: true }] };
    const { theme, block } = setup(async () => ({ ok: true, json: async () => ({ campaign: published }) }));
    block.dataset.currency = sample.currency;
    block.dataset.locale = 'en-US';
    block.querySelector('[data-variant-id="black-s"]').dataset.price = sample.price;
    await theme.mountBlock(block);
    assert.equal(block.querySelector('[data-tier-id="single"] .qb-tier-original .qb-tier-price').textContent, sample.unit);
    assert.equal(block.querySelector('.qb-slot .qb-variant-price b').textContent, sample.discountedUnit);
    assert.equal(block.querySelector('[data-bundle-total]').textContent, sample.total);
    assert.equal(block.querySelector('[data-add-bundle]').textContent, `Add 2 to cart · ${sample.total}`);
    assert.equal(block.querySelector('.qb-original').textContent, sample.original);
    assert.equal(block.querySelector('.qb-savings-amount').textContent, `-${sample.savings}`);
  }
});

test('keeps JPY specified market amounts in yen after normalizing SLine product prices', async () => {
  const tiers = [
    { tierId: 'amount', discountType: 'fixed_amount', discountValue: 1000, quantity: 2, marketOverrides: { jp: { mode: 'specified_amount', currencyCode: 'JPY', amountMinor: 23 } } },
    { tierId: 'price', discountType: 'fixed_price', discountValue: 2000, quantity: 2, marketOverrides: { jp: { mode: 'specified_amount', currencyCode: 'JPY', amountMinor: 45 } } },
    { tierId: 'bundle-amount', discountType: 'bundle_fixed_amount', discountValue: 10000, quantity: 2, marketOverrides: { jp: { mode: 'specified_amount', currencyCode: 'JPY', amountMinor: 300 } } },
    { tierId: 'bundle-price', discountType: 'bundle_fixed_price', discountValue: 12000, quantity: 2, marketOverrides: { jp: { mode: 'specified_amount', currencyCode: 'JPY', amountMinor: 340 } } },
  ];
  const published = { ...campaign, marketId: 'jp', tiers };
  const { theme, block } = setup(async () => ({ ok: true, json: async () => ({ campaign: published }) }));
  Object.assign(block.dataset, { currency: 'JPY', shopCurrency: 'USD', locale: 'en-US' });
  block.querySelector('[data-variant-id="black-s"]').dataset.price = '90804100';
  await theme.mountBlock(block);
  for (const [tierId, total, unit] of [
    ['amount', '¥1,816,036', '¥908,018'],
    ['price', '¥90', '¥45'],
    ['bundle-amount', '¥1,815,782', '¥907,891'],
    ['bundle-price', '¥340', '¥170'],
  ]) {
    block.querySelector(`[data-tier-id="${tierId}"] .qb-tier-header`).click();
    assert.equal(block.querySelector('[data-bundle-total]').textContent, total, tierId);
    assert.equal(block.querySelector('.qb-slot .qb-variant-price b').textContent, unit, tierId);
    assert.equal(block.querySelector('.qb-original').textContent, '¥1,816,082', tierId);
  }
});

test('sends every rendered collection page as display context, including membership after the first 100', async () => {
  for (const count of [101, 1000]) {
    let sent;
    const { theme, block } = setup(async (url, init) => {
      sent = { url, init };
      return { ok: true, json: async () => ({ campaign }) };
    });
    const ids = Array.from({ length: count }, (_, index) => `collection-${index + 1}`);
    block.insertAdjacentHTML('beforeend', `<div data-product-collections data-collection-count="${count}" data-collection-pages="${Math.ceil(count / 100)}">${ids.map((id) => `<span data-collection-id="${id}"></span>`).join('')}</div>`);
    await theme.mountBlock(block);
    assert.equal(sent.init.method, 'POST');
    const params = new URLSearchParams(sent.init.body);
    assert.equal(params.get('collectionsComplete'), 'true');
    assert.equal(params.get('collectionCount'), String(count));
    assert.equal(params.get('collectionIds').split(',').at(-1), `collection-${count}`);
    assert.equal(new URL(sent.url).search, '');
    assert.equal(block.hasAttribute('hidden'), false);
  }
});

test('distinguishes zero collections from missing or incomplete theme metadata', async () => {
  for (const [count, pages, ids, complete] of [
    ['0', '0', [], 'true'],
    ['0', '1', [], 'true'],
    ['101', '2', ['collection-1'], 'false'],
    ['', '', [], 'false'],
    ['1001', '11', ['collection-1'], 'false'],
  ]) {
    let params;
    const { theme, block } = setup(async (_, init) => {
      params = new URLSearchParams(init.body);
      return { ok: true, json: async () => ({ campaign }) };
    });
    block.insertAdjacentHTML('beforeend', `<div data-product-collections data-collection-count="${count}" data-collection-pages="${pages}">${ids.map((id) => `<span data-collection-id="${id}"></span>`).join('')}</div>`);
    await theme.mountBlock(block);
    assert.equal(params.get('collectionsComplete'), complete);
    assert.equal(params.get('collectionIds'), '');
  }
});

test('allows available variants with zero stock regardless of tracking or policy metadata', async () => {
  for (const attrs of [{ inventoryPolicy: '', inventoryTracker: '' }, { inventoryPolicy: 'continue', inventoryTracker: 'true' }, { inventoryPolicy: 'deny', inventoryTracker: 'false' }, { inventoryPolicy: 'deny', inventoryTracker: 'true' }]) {
    const { theme, block } = setup(async () => ({ ok: true, json: async () => ({ campaign }) }));
    for (const node of block.querySelectorAll('[data-variant-id]')) {
      Object.assign(node.dataset, attrs, { available: 'true', inventoryQuantity: '0' });
    }
    await theme.mountBlock(block);
    assert.equal(block.hasAttribute('hidden'), false);
    assert.equal(block.querySelector('[data-add-bundle]').disabled, false);
    assert.doesNotMatch(block.querySelector('.qb-summary-lines').textContent, /Sold out/);
    assert.equal(block.querySelector('.qb-original').parentElement.hidden, false);
    assert.equal(block.querySelector('[data-bundle-total]').textContent, '$240.00');
    const color = block.querySelector('select[data-slot-index="0"][data-option-name="Color"]');
    assert.doesNotMatch(color.textContent, /Sold out/);
  }
});

test('blocks unavailable variants even when stock metadata would previously allow overselling', async () => {
  for (const attrs of [{ inventoryTracker: 'false', inventoryPolicy: 'deny' }, { inventoryTracker: 'true', inventoryPolicy: 'continue' }]) {
    const { theme, block } = setup(async () => ({ ok: true, json: async () => ({ campaign }) }));
    for (const node of block.querySelectorAll('[data-variant-id]')) {
      Object.assign(node.dataset, attrs, { available: 'false', inventoryQuantity: '100' });
    }
    await theme.mountBlock(block);
    assert.equal(block.hasAttribute('hidden'), false);
    assert.equal(block.querySelector('[data-add-bundle]').disabled, true);
    assert.match(block.querySelector('[data-add-bundle]').textContent, /Sold out/);
    assert.equal(block.querySelectorAll('.qb-summary > .qb-summary-row[hidden]').length, 3);
  }
});

test('renders all-sold-out tiers but blocks cart additions', async () => {
  const { theme, block } = setup(async () => ({ ok: true, json: async () => ({ campaign }) }));
  for (const node of block.querySelectorAll('[data-variant-id]')) {
    Object.assign(node.dataset, { available: 'false', inventoryPolicy: 'deny', inventoryTracker: 'true', inventoryQuantity: '0' });
  }
  await theme.mountBlock(block);
  assert.equal(block.hasAttribute('hidden'), false);
  assert.equal(block.querySelectorAll('.qb-tier').length, 2);
  assert.equal(block.querySelector('[data-add-bundle]').disabled, true);
  assert.match(block.querySelector('[data-add-bundle]').textContent, /Sold out/);
});

test('does not read missing stock quantity as zero', async () => {
  const { theme, block } = setup(async () => ({ ok: true, json: async () => ({ campaign }) }));
  for (const node of block.querySelectorAll('[data-variant-id]')) {
    Object.assign(node.dataset, { available: 'true', inventoryPolicy: 'deny', inventoryTracker: 'true', inventoryQuantity: '' });
  }
  await theme.mountBlock(block);
  assert.equal(block.querySelector('[data-add-bundle]').disabled, false);
});

test('unchanged default desktop and mobile configuration renders a usable widget', async () => {
  const vite = await createServer({ root: fileURLToPath(new URL('../../web/', import.meta.url)), server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { defaultCampaignWidgetConfig } = await vite.ssrLoadModule('/src/prototype/widget-config.ts');
    for (const mobile of [false, true]) {
      const { theme, block } = setup(async () => ({ ok: true, json: async () => ({ campaign: { ...campaign, widget: defaultCampaignWidgetConfig() } }) }), mobile);
      block.querySelector('[data-variant-id="black-s"]').dataset.inventoryQuantity = '100';
      await theme.mountBlock(block);
      assert.equal(block.hasAttribute('hidden'), false);
      assert.equal(block.querySelectorAll('.qb-tier').length, 2);
      assert.equal(block.querySelector('[data-add-bundle]').disabled, false);
      assert.equal(block.style.getPropertyValue('--qb-desktop-card-gap'), '8px');
      assert.equal(block.style.getPropertyValue('--qb-mobile-card-gap'), '8px');
    }
  } finally { await vite.close(); }
});

test('repeated resource execution mounts each block once and can discover newly inserted blocks', async () => {
  const { document, window } = parseHTML(markup);
  let requests = 0;
  const context = vm.createContext({ globalThis: { document, Event: window.Event, fetch: async () => {
    requests += 1;
    return { ok: true, json: async () => ({ campaign }) };
  } }, URL, Intl, console });
  vm.runInContext(source, context);
  vm.runInContext(source, context);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests, 1);
  assert.equal(document.querySelectorAll('[data-add-bundle]').length, 1);
  document.body.insertAdjacentHTML('beforeend', markup);
  vm.runInContext(source, context);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests, 2);
  assert.equal(document.querySelectorAll('[data-add-bundle]').length, 2);
});

test('selecting mixed market tiers keeps header, slot, summary and cart prices on that tier override', async () => {
  // The storefront defers non-primary automatic fixed conversions to checkout.
  // These literal expectations also distinguish specified overrides from base amounts.
  const rows = [
    ['original', 'none', 0, null, null, '$100.00', '€60.00', '$100.00', '€60.00'],
    ['percentage', 'percentage', 1000, null, null, '$180.00', '€108.00', '$90.00', '€54.00'],
    ['auto-amount', 'fixed_amount', 1000, null, null, '$270.00', null, '$90.00', null],
    ['specified-amount', 'fixed_amount', 900, 700, 2000, '$372.00', '€160.00', '$93.00', '€40.00'],
    ['auto-price', 'fixed_price', 8000, null, null, '$400.00', null, '$80.00', null],
    ['specified-price', 'fixed_price', 9900, 6500, 3500, '$390.00', '€210.00', '$65.00', '€35.00'],
    ['auto-bundle-amount', 'bundle_fixed_amount', 3000, null, null, '$670.00', null, '$95.72', null],
    ['specified-bundle-amount', 'bundle_fixed_amount', 800, 4000, 2500, '$760.00', '€455.00', '$95.00', '€56.88'],
    ['auto-bundle-price', 'bundle_fixed_price', 70000, null, null, '$700.00', null, '$77.78', null],
    ['specified-bundle-price', 'bundle_fixed_price', 90000, 75000, 45000, '$750.00', '€450.00', '$75.00', '€45.00'],
  ];
  const tiers = rows.map(([tierId, discountType, discountValue, us, eu], index) => ({
    tierId, label: tierId, quantity: index + 1, discountType, discountValue,
    marketOverrides: us === null ? { us: { mode: 'auto_convert' }, eu: { mode: 'auto_convert' } } : {
      us: { mode: 'specified_amount', currencyCode: 'USD', amountMinor: us },
      eu: { mode: 'specified_amount', currencyCode: 'EUR', amountMinor: eu },
    },
  }));
  for (const market of [
    { id: 'us', currency: 'USD', price: '10000', expectedColumn: 5, slotColumn: 7 },
    { id: 'eu', currency: 'EUR', price: '6000', expectedColumn: 6, slotColumn: 8 },
  ]) {
    const published = { ...campaign, marketId: market.id, tiers };
    const { theme, block } = setup(async () => ({ ok: true, json: async () => ({ campaign: published }) }));
    block.dataset.currency = market.currency;
    block.dataset.shopCurrency = 'USD';
    const variant = block.querySelector('[data-variant-id="black-s"]');
    variant.dataset.inventoryQuantity = '100';
    variant.dataset.price = market.price;
    await theme.mountBlock(block);
    // Move from specified tiers back to automatic/original tiers to expose stale selection state.
    for (const index of [9, 2, 5, 0, 7, 4, 3, 8, 1, 6]) {
      const row = rows[index];
      block.querySelector(`[data-tier-id="${row[0]}"] .qb-tier-header`).click();
      assert.equal(block.querySelector('.qb-tier-selected').dataset.tierId, row[0]);
      const expected = row[market.expectedColumn];
      assert.equal(block.querySelector('[data-bundle-total]').textContent, expected ?? 'Calculated at checkout', `${market.id}: selected ${row[0]}`);
      assert.equal(block.querySelector('.qb-checkout-note').hidden, expected !== null);
      assert.equal(block.querySelector('[data-add-bundle]').disabled, false);
      assert.equal(block.querySelector('[data-add-bundle]').textContent, `Add ${index + 1} to cart · ${expected ?? 'Calculated at checkout'}`);
      rows.forEach((headerRow) => {
        assert.equal(block.querySelector(`[data-tier-id="${headerRow[0]}"] .qb-tier-original .qb-tier-price`)?.textContent ?? null, headerRow[market.expectedColumn], `${market.id}: header ${headerRow[0]}, selected ${row[0]}`);
      });
      if (expected !== null) {
        assert.equal(block.querySelector('.qb-product-price').textContent, expected);
        assert.equal(block.querySelector('.qb-slot .qb-variant-price b').textContent, row[market.slotColumn]);
      }
    }
  }
});

test('emits mobile style values while CSS owns the responsive switch', async () => {
  const styled = { ...campaign, widget: {
    layout: 'stacked', card: { gapPx: 8, radiusPx: 8 },
    mobile: { layout: 'grid', card: { gapPx: 3, radiusPx: 4 } },
  } };
  const { document, window } = parseHTML(markup);
  const context = { globalThis: { fetch: async () => ({ ok: true, json: async () => ({ campaign: styled }) }), Event: window.Event, matchMedia: () => ({ matches: true, addEventListener() {}, addListener() {} }) }, URL, Intl, console };
  vm.runInNewContext(source, context);
  const block = document.querySelector('.quantity-breaks-app-block');
  await context.globalThis.QuantityBreaksTheme.mountBlock(block);
  assert.equal(block.querySelector('.qb-layout-grid') !== null, true);
  assert.equal(block.style.getPropertyValue('--qb-desktop-card-gap'), '8px');
  assert.equal(block.style.getPropertyValue('--qb-mobile-card-gap'), '3px');
});

test('writes complete desktop and mobile root tokens without selecting one device at mount', async () => {
  const styled = { ...campaign, widget: {
    layout: 'horizontal',
    card: { gapPx: 8, radiusPx: 8 },
    typography: { title: { sizePx: 16, weight: 700 } },
    mobile: {
      layout: 'grid',
      card: { gapPx: 3, radiusPx: 4 },
      typography: { title: { sizePx: 13, weight: 600 } },
    },
  } };
  const { theme, block } = setup(async () => ({ ok: true, json: async () => ({ campaign: styled }) }));
  await theme.mountBlock(block);
  assert.equal(block.style.getPropertyValue('--qb-desktop-tier-columns'), '3');
  assert.equal(block.style.getPropertyValue('--qb-mobile-tier-columns'), '2');
  assert.equal(block.style.getPropertyValue('--qb-desktop-tier-title-size'), '16px');
  assert.equal(block.style.getPropertyValue('--qb-mobile-tier-title-size'), '13px');
});

test('emits mobile color tokens independently and inherits an omitted mobile color from desktop', async () => {
  const styled = { ...campaign, widget: {
    colors: { card: '#112233', title: '#223344', badgeBackground: '#334455' },
    mobile: { colors: { card: '#aabbcc', badgeBackground: '#ddeeff' } },
  } };
  const { theme, block } = setup(async () => ({ ok: true, json: async () => ({ campaign: styled }) }));
  await theme.mountBlock(block);

  assert.equal(block.style.getPropertyValue('--qb-desktop-card'), '#112233');
  assert.equal(block.style.getPropertyValue('--qb-mobile-card'), '#aabbcc');
  assert.equal(block.style.getPropertyValue('--qb-mobile-badge-bg'), '#ddeeff');
  assert.equal(block.style.getPropertyValue('--qb-mobile-tier-title-color'), '#223344');
});

test('uses independent desktop and mobile tokens for variant original prices', async () => {
  const styled = { ...campaign, widget: {
    colors: { variantOriginalPrice: '#112233' },
    typography: { variantOriginalPrice: { sizePx: 12, weight: 500 } },
    mobile: { colors: { variantOriginalPrice: '#445566' }, typography: { variantOriginalPrice: { sizePx: 10, weight: 400 } } },
  } };
  const { theme, block } = setup(async () => ({ ok: true, json: async () => ({ campaign: styled }) }));
  await theme.mountBlock(block);

  assert.equal(block.style.getPropertyValue('--qb-desktop-variant-original-price'), '#112233');
  assert.equal(block.style.getPropertyValue('--qb-desktop-variant-original-price-size'), '12px');
  assert.equal(block.style.getPropertyValue('--qb-desktop-variant-original-price-weight'), '500');
  assert.equal(block.style.getPropertyValue('--qb-mobile-variant-original-price'), '#445566');
  assert.equal(block.style.getPropertyValue('--qb-mobile-variant-original-price-size'), '10px');
  assert.equal(block.style.getPropertyValue('--qb-mobile-variant-original-price-weight'), '400');
  assert.match(css, /--qb-desktop-variant-original-price/);
  assert.match(css, /--qb-mobile-variant-original-price/);
});

test('keeps desktop and mobile badge position and original-price visibility available to CSS', async () => {
  const styled = { ...campaign, widget: {
    badgePosition: 'corner', showOriginalAndDiscountedPrice: true, showCartVariantDetails: true, showPriceSummary: false,
    mobile: { badgePosition: 'below_subtitle', showOriginalAndDiscountedPrice: false, showCartVariantDetails: false, showPriceSummary: true },
  } };
  const { theme, block } = setup(async () => ({ ok: true, json: async () => ({ campaign: styled }) }));
  await theme.mountBlock(block);

  const choices = block.querySelector('.qb-tiers');
  assert.equal(choices.dataset.desktopBadgePosition, 'corner');
  assert.equal(choices.dataset.mobileBadgePosition, 'below_subtitle');
  assert.equal(block.style.getPropertyValue('--qb-desktop-compare-price-display'), 'block');
  assert.equal(block.style.getPropertyValue('--qb-mobile-compare-price-display'), 'none');
  assert.equal(block.style.getPropertyValue('--qb-desktop-cart-details-display'), 'contents');
  assert.equal(block.style.getPropertyValue('--qb-mobile-cart-details-display'), 'none');
  assert.equal(block.style.getPropertyValue('--qb-desktop-price-summary-display'), 'none');
  assert.equal(block.style.getPropertyValue('--qb-mobile-price-summary-display'), 'flex');
});

test('passes the storefront country to the public campaign and renders the saved tier subtitle', async () => {
  const calls = [];
  const localized = { ...campaign, tiers: campaign.tiers.map((tier) => ({ ...tier, subtitle: tier.tierId === 'trio' ? 'Save on every item' : 'Start here' })) };
  const { theme, block } = setup(async (url, options = {}) => {
    calls.push({ url, options });
    return { ok: true, json: async () => ({ campaign: localized }) };
  });
  block.dataset.countryCode = 'FR';
  await theme.mountBlock(block);
  assert.match(String(calls[0].url), /countryCode=FR/);
  assert.equal(block.querySelector('[data-tier-id="trio"] small').textContent, 'Save on every item');
});

test('renders a localized tier savings badge only for tiers with a positive discount', async () => {
  const localized = {
    ...campaign,
    copy: { 'widget.tier_savings_badge': 'Save {saving_amount}' },
    widget: { showTierSavingsBadge: true },
  };
  const { theme, block } = setup(async () => ({ ok: true, json: async () => ({ campaign: localized }) }));
  block.querySelector('[data-variant-id="black-s"]').dataset.inventoryQuantity = '3';
  await theme.mountBlock(block);
  assert.equal(block.querySelector('[data-tier-id="single"] .qb-tier-savings-badge'), null);
  assert.equal(block.querySelector('[data-tier-id="trio"] .qb-tier-savings-badge').textContent, 'Save $60.00');
});

test('emits independent tier savings badge tokens for desktop and mobile styles', async () => {
  const styled = {
    ...campaign,
    widget: {
      showTierSavingsBadge: true,
      card: { tierSavingsBadgeRadiusPx: 13 },
      colors: { tierSavingsBadgeText: '#556677', tierSavingsBadgeBackground: '#667788' },
      typography: { tierSavingsBadge: { sizePx: 16, weight: 800 } },
      mobile: {
        card: { tierSavingsBadgeRadiusPx: 5 },
        colors: { tierSavingsBadgeText: '#112233', tierSavingsBadgeBackground: '#223344' },
        typography: { tierSavingsBadge: { sizePx: 12, weight: 600 } },
      },
    },
  };
  const { theme, block } = setup(async () => ({ ok: true, json: async () => ({ campaign: styled }) }));
  await theme.mountBlock(block);
  assert.match(block.getAttribute('style'), /--qb-desktop-tier-savings-badge-text:\s*#556677/);
  assert.match(block.getAttribute('style'), /--qb-desktop-tier-savings-badge-background:\s*#667788/);
  assert.match(block.getAttribute('style'), /--qb-desktop-tier-savings-badge-radius:\s*13px/);
  assert.match(block.getAttribute('style'), /--qb-desktop-tier-savings-badge-size:\s*16px/);
  assert.match(block.getAttribute('style'), /--qb-desktop-tier-savings-badge-weight:\s*800/);
  assert.match(block.getAttribute('style'), /--qb-mobile-tier-savings-badge-text:\s*#112233/);
  assert.match(block.getAttribute('style'), /--qb-mobile-tier-savings-badge-background:\s*#223344/);
  assert.match(block.getAttribute('style'), /--qb-mobile-tier-savings-badge-radius:\s*5px/);
  assert.match(block.getAttribute('style'), /--qb-mobile-tier-savings-badge-size:\s*12px/);
  assert.match(block.getAttribute('style'), /--qb-mobile-tier-savings-badge-weight:\s*600/);
  assert.match(css, /--qb-tier-savings-badge-radius: var\(--qb-mobile-tier-savings-badge-radius/);
  assert.match(css, /--qb-tier-savings-badge-background: var\(--qb-mobile-tier-savings-badge-background/);
  assert.match(css, /--qb-tier-savings-badge-size: var\(--qb-mobile-tier-savings-badge-size/);
});

test('does not render a default tier subtitle when the campaign did not save one', async () => {
  const { theme, block } = setup(async () => ({ ok: true, json: async () => ({ campaign }) }));
  await theme.mountBlock(block);
  assert.equal(block.querySelector('[data-tier-id="single"] small'), null);
  assert.equal(block.querySelector('[data-tier-id="trio"] small'), null);
});

test('uses the mobile selector configuration at the mobile breakpoint', async () => {
  const styled = { ...campaign, widget: {
    variants: { showSelectors: true, selectorStyle: 'dropdown', showImageColorValue: true, defaultSelection: 'first_available' },
    mobile: { variants: { showSelectors: true, selectorStyle: 'text', showImageColorValue: false, defaultSelection: 'none' } },
  } };
  const { theme, block } = setup(async () => ({ ok: true, json: async () => ({ campaign: styled }) }), true);
  await theme.mountBlock(block);
  assert.equal(block.querySelector('.qb-select'), null);
  assert.ok(block.querySelector('.qb-value-text'));
  assert.equal(block.querySelector('[data-product-row]'), null);
});

test('emits configurable status and unselected variant surface tokens for both devices', async () => {
  const styled = { ...campaign, widget: {
    colors: { variantBackground: '#f1f2f3', status: '#112233' }, typography: { status: { sizePx: 13, weight: 600 } },
    mobile: { colors: { variantBackground: '#d1d2d3', status: '#445566' }, typography: { status: { sizePx: 11, weight: 400 } } },
  } };
  const { theme, block } = setup(async () => ({ ok: true, json: async () => ({ campaign: styled }) }));
  await theme.mountBlock(block);
  assert.equal(block.style.getPropertyValue('--qb-desktop-variant-background'), '#f1f2f3');
  assert.equal(block.style.getPropertyValue('--qb-mobile-variant-background'), '#d1d2d3');
  assert.equal(block.style.getPropertyValue('--qb-desktop-status'), '#112233');
  assert.equal(block.style.getPropertyValue('--qb-mobile-status-size'), '11px');
});

test('mounts a published tier with one independent selector per option and item', async () => {
  const calls = [];
  const { theme, block, window } = setup(async (url, options = {}) => {
    calls.push({ url, options });
    if (url.startsWith('https://raised-stability-gaps-html.trycloudflare.com/')) return { ok: true, json: async () => ({ campaign }) };
    if (options.method === 'GET') return { ok: true, json: async () => ({ items: [] }) };
    return { ok: true, json: async () => ({ items: [{ id: 'black-s', quantity: 2 }, { id: 'white-l', quantity: 1 }] }) };
  });
  await theme.mountBlock(block);
  assert.equal(block.hasAttribute('hidden'), false);
  assert.equal(block.querySelectorAll('[data-tier-id]').length, 2);
  assert.equal(block.querySelectorAll('[data-slot-index]').length, 6);
  const color = block.querySelector('select[data-slot-index="1"][data-option-name="Color"]');
  color.querySelector('option[value="White"]').selected = true;
  color.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.equal(block.querySelector('select[data-slot-index="1"][data-option-name="Size"]').value, 'L');
  assert.equal(block.querySelector('[data-bundle-total]').textContent, '$252.80');
  assert.equal(block.querySelectorAll('[data-product-row]').length, 2);
  const blackSummary = block.querySelector('[data-product-row="black-s"]');
  assert.equal(blackSummary.querySelector('.qb-product-original').textContent, '$200.00');
  assert.equal(blackSummary.querySelector('.qb-product-price').textContent, '$160.00');
  assert.match(block.querySelector('.qb-original').textContent, /\$316\.00/);
  assert.match(block.querySelector('.qb-savings-amount').textContent, /-\$63\.20/);
  block.querySelector('[data-add-bundle]').click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const post = calls.find((call) => call.options.method === 'POST');
  assert.deepEqual(JSON.parse(post.options.body), { items: [{ id: 'black-s', quantity: 2 }, { id: 'white-l', quantity: 1 }] });
});

test('renders a tier price and one discounted variant price below each item number', async () => {
  const { theme, block } = setup(async () => ({ ok: true, json: async () => ({ campaign }) }));
  block.querySelector('[data-variant-id="black-s"]').dataset.inventoryQuantity = '3';
  await theme.mountBlock(block);
  const tierOriginal = block.querySelector('[data-tier-id="trio"] .qb-tier-original');
  assert.equal(tierOriginal.tagName, 'SPAN');
  assert.equal(tierOriginal.firstElementChild.tagName, 'SPAN');
  assert.equal(tierOriginal.firstElementChild.classList.contains('qb-tier-price'), true);
  assert.equal(tierOriginal.querySelector('.qb-tier-price').textContent, '$240.00');
  assert.equal(tierOriginal.querySelector('del.qb-tier-original').textContent, '$300.00');
  assert.doesNotMatch(tierOriginal.textContent, /Original/);

  const slots = [...block.querySelectorAll('[data-tier-id="trio"] .qb-slot')];
  assert.equal(slots.length, 3);
  for (const slot of slots) {
    const prices = slot.querySelectorAll('.qb-variant-price');
    assert.equal(prices.length, 1);
    const variantPrice = prices[0];
    assert.equal(slot.querySelector('legend').nextElementSibling, variantPrice);
    assert.equal(variantPrice.querySelector('b').textContent, '$80.00');
    assert.equal(variantPrice.querySelector('del').textContent, '$100.00');
  }
});

test('uses widget.add_to_cart for an available bundle button', async () => {
  const localized = { ...campaign, copy: { 'widget.add_to_cart': '加入 {quantity} 件，合计 {price}' } };
  const { theme, block } = setup(async () => ({ ok: true, json: async () => ({ campaign: localized }) }));
  block.querySelector('[data-variant-id="black-s"]').dataset.inventoryQuantity = '3';
  await theme.mountBlock(block);
  assert.equal(block.querySelector('[data-add-bundle]').textContent, '加入 3 件，合计 $240.00');
});

test('shows localized stock feedback and retains chosen variants after server stock rejection', async () => {
  const localized = { ...campaign, copy: { 'widget.no_stock': '库存不足，请调整数量或规格。' } };
  let posts = 0;
  const { theme, block, window } = setup(async (url) => {
    if (url === '/api/carts/ajax-cart') return new Response(JSON.stringify({ items: [] }));
    if (url === '/cart/add') {
      posts++;
      return new Response(JSON.stringify({ items: null, message: 'Out of stock', description: 'stock not enough' }), { status: 422 });
    }
    return { ok: true, json: async () => ({ campaign: localized }) };
  });
  await theme.mountBlock(block);
  const color = block.querySelector('select[data-slot-index="1"][data-option-name="Color"]');
  color.querySelector('option[value="White"]').selected = true;
  color.dispatchEvent(new window.Event('change', { bubbles: true }));
  const before = [...block.querySelectorAll('.qb-select')].map((select) => select.value);
  block.querySelector('[data-add-bundle]').click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(block.querySelector('.qb-status').textContent, '库存不足，请调整数量或规格。');
  assert.deepEqual([...block.querySelectorAll('.qb-select')].map((select) => select.value), before);
  assert.equal(block.querySelector('[data-add-bundle]').disabled, false);
  assert.equal(posts, 1);
});

test('shows a button spinner while adding and prevents duplicate writes across a re-render', async () => {
  let finish;
  let posts = 0;
  const response = new Promise((resolve) => { finish = resolve; });
  const { theme, block } = setup(async (url) => {
    if (url === '/api/carts/ajax-cart') return { ok: true, json: async () => ({ items: [] }) };
    if (url === '/cart/add') { posts++; return response; }
    return { ok: true, json: async () => ({ campaign }) };
  });
  await theme.mountBlock(block);
  const button = block.querySelector('[data-add-bundle]');
  const label = button.textContent;
  button.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(button.getAttribute('aria-busy'), 'true');
  assert.equal(button.querySelector('.loading--rotator').hidden, false);
  assert.equal(button.querySelector('.loading--rotator svg path').getAttribute('stroke'), 'currentColor');
  assert.equal(button.querySelector('.loading--rotator svg').getAttribute('viewBox'), '0 0 20 20');
  assert.equal(block.querySelector('.qb-status').textContent, '');
  block.querySelector('[data-tier-id="single"] .qb-tier-header').click();
  button.click();
  assert.equal(button.disabled, true);
  assert.equal(button.querySelector('.loading--rotator').hidden, false);
  assert.equal(posts, 1);
  finish({ ok: true, json: async () => ({ items: [{ id: 'black-s', quantity: 3 }] }) });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(button.getAttribute('aria-busy'), 'false');
  assert.equal(button.querySelector('.loading--rotator').hidden, true);
  assert.equal(button.disabled, false);
  assert.match(block.querySelector('.qb-status').textContent, /3 items were added as 1 cart lines/);
  assert.doesNotMatch(block.textContent, /Adding bundle/);
  assert.ok(label);
});

test('keeps the block hidden when its public campaign cannot be loaded', async () => {
  const { theme, block } = setup(async () => ({ ok: false, status: 404 }));
  await theme.mountBlock(block);
  assert.equal(block.hasAttribute('hidden'), true);
});

test('theme heading uses configured storefront copy and disappears when it is blank', async () => {
  const blank = { ...campaign, widgetTitle: '', copy: { 'widget.title': '   ' } };
  const { theme, block } = setup(async () => ({ ok: true, json: async () => ({ campaign: blank }) }));
  await theme.mountBlock(block);
  assert.equal(block.querySelector('.qb-heading'), null);
  const named = { ...campaign, widgetTitle: 'Bundle offer' };
  const namedBlock = setup(async () => ({ ok: true, json: async () => ({ campaign: named }) }));
  await namedBlock.theme.mountBlock(namedBlock.block);
  assert.equal(namedBlock.block.querySelector('.qb-heading').textContent, 'Bundle offer');
});

test('theme summary uses the saved storefront labels', async () => {
  const localized = { ...campaign, copy: { 'widget.original': '原价', 'widget.savings': '预计节省', 'widget.total': '组合总价' } };
  const { theme, block } = setup(async () => ({ ok: true, json: async () => ({ campaign: localized }) }));
  await theme.mountBlock(block);
  assert.match(block.querySelector('.qb-summary').textContent, /原价/);
  assert.match(block.querySelector('.qb-summary').textContent, /预计节省/);
  assert.match(block.querySelector('.qb-summary').textContent, /组合总价/);
});

test('theme widget renders saved copy for runtime-only messages', async () => {
  const localized = { ...campaign, widget: { variants: { defaultSelection: 'none' } }, copy: {
    'widget.choose_option': '请选择规格',
    'widget.item_option': '第 {index} 件：{option}',
    'widget.tier_items': '{quantity} 件商品',
    'widget.calculated_at_checkout': '结账时计算',
    'widget.cart_uncertain': '购物车状态暂未确认。',
  } };
  const { theme, block } = setup(async () => ({ ok: true, json: async () => ({ campaign: localized }) }));
  await theme.mountBlock(block);
  assert.equal(block.querySelector('select[data-option-name="Color"]').getAttribute('aria-label'), '第 1 件：Color');
  assert.match(block.textContent, /结账时计算/);
});

test('keeps sold-out option values selectable and marks them without disabling the control', async () => {
  const { theme, block } = setup(async () => ({ ok: true, json: async () => ({ campaign }) }));
  await theme.mountBlock(block);
  const unavailable = block.querySelector('select[data-slot-index="0"][data-option-name="Size"] option[value="L"]');
  assert.equal(unavailable.disabled ?? false, false);
  assert.match(unavailable.textContent, /Sold out/i);
  const tracked = block.querySelector('select[data-slot-index="0"][data-option-name="Size"] option[value="M"]');
  assert.equal(tracked.disabled ?? false, false);
});

test('localizes unavailable rows, hides invalid amounts, and disables the quantity button', async () => {
  const localized = { ...campaign, copy: { 'widget.sold_out': '已售罄', 'widget.add_to_cart_quantity': '添加 {quantity} 件' } };
  const { theme, block, window } = setup(async () => ({ ok: true, json: async () => ({ campaign: localized }) }));
  await theme.mountBlock(block);
  const size = block.querySelector('select[data-slot-index="0"][data-option-name="Size"]');
  size.querySelector('option[value="M"]').selected = true;
  size.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.match(block.querySelector('[data-product-row]').textContent, /\(已售罄\)/);
  const summaryRows = [...block.querySelectorAll('.qb-summary > .qb-summary-row')];
  assert.equal(summaryRows.length, 3);
  assert.equal(summaryRows.every((row) => row.hidden), true);
  assert.equal(block.querySelector('[data-add-bundle]').textContent, '已售罄');
  assert.equal(block.querySelector('[data-add-bundle]').disabled, true);
});

test('marks only the unavailable SKU row as sold out', async () => {
  const localized = { ...campaign, copy: { 'widget.sold_out': '已售罄' } };
  const { theme, block, window } = setup(async () => ({ ok: true, json: async () => ({ campaign: localized }) }));
  await theme.mountBlock(block);
  const size = block.querySelector('select[data-slot-index="0"][data-option-name="Size"]');
  size.querySelector('option[value="M"]').selected = true;
  size.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.match(block.querySelector('[data-product-row="black-m"]').textContent, /\(已售罄\)/);
  assert.doesNotMatch(block.querySelector('[data-product-row="black-s"]').textContent, /\(已售罄\)/);
});

test('renders the checkout note when presentment pricing cannot be previewed', async () => {
  const fixed = { ...campaign, tiers: [{ ...campaign.tiers[0], discountType: 'fixed_price', discountValue: 800, marketOverrides: { 'market-eur': { mode: 'specified_amount', amountMinor: 800, currencyCode: 'EUR' } } }], marketId: 'market-eur', copy: { 'widget.calculated_at_checkout': '结账时计算' } };
  const { theme, block } = setup(async () => ({ ok: true, json: async () => ({ campaign: fixed }) }));
  block.dataset.currency = 'USD';
  block.dataset.shopCurrency = 'USD';
  await theme.mountBlock(block);
  assert.equal(block.querySelector('.qb-checkout-note').textContent, '结账时计算');
});

test('applies published activity typography and image settings to its own block', async () => {
  const styled = { ...campaign, widget: {
    layout: 'grid', card: { gapPx: 6, radiusPx: 12 },
    colors: { variantValue: '#123456', summaryLabel: '#556677' },
    typography: { variantValue: { sizePx: 15, weight: 600 }, summaryLabel: { sizePx: 13, weight: 500 } },
    variants: { selectorStyle: 'image', imageSizePx: 24, imageRadiusPx: 3, showImageColorValue: false },
  } };
  const { theme, block } = setup(async () => ({ ok: true, json: async () => ({ campaign: styled }) }));
  await theme.mountBlock(block);
  assert.equal(block.style.getPropertyValue('--qb-desktop-variant-value'), '#123456');
  assert.equal(block.style.getPropertyValue('--qb-desktop-variant-value-size'), '15px');
  assert.equal(block.style.getPropertyValue('--qb-desktop-image-size'), '24px');
  assert.equal(block.style.getPropertyValue('--qb-desktop-image-radius'), '3px');
  assert.equal(block.querySelector('.qb-layout-grid') !== null, true);
  assert.equal(block.querySelector('.qb-value-image').textContent, '');
  assert.equal(block.querySelector('.qb-value-image img'), null);
});

test('renders an available variant image for each first-option image tile', async () => {
  const styled = { ...campaign, widget: { variants: { selectorStyle: 'image', showImageColorValue: true } } };
  const { theme, block } = setup(async () => ({ ok: true, json: async () => ({ campaign: styled }) }));
  // Black's first matching SKU has no image, while another Black variant does.
  block.querySelector('[data-variant-id="black-s"]').dataset.image = '';
  block.querySelector('[data-variant-id="white-l"]').dataset.image = '/white-l.jpg';
  block.querySelector('[data-variant-id="black-m"]').dataset.image = '/black-m.jpg';
  await theme.mountBlock(block);
  const optionRows = [...block.querySelectorAll('.qb-slot .qb-option')];
  assert.ok(optionRows.length > 0);
  for (let index = 0; index < optionRows.length; index += 2) {
    assert.ok(optionRows[index].querySelector('.qb-value-image'));
    assert.equal(optionRows[index].querySelector('.qb-value-image img[src="/black-m.jpg"]') !== null || optionRows[index].querySelector('.qb-value-image img[src="/white-l.jpg"]') !== null, true);
    assert.equal(optionRows[index + 1].querySelector('.qb-value-image'), null);
    assert.ok(optionRows[index + 1].querySelector('.qb-value-text'));
  }
});

test('theme widget exposes the corner badge position for compact tier layouts', async () => {
  const styled = { ...campaign, widget: { layout: 'horizontal', badgePosition: 'corner' } };
  const { theme, block } = setup(async () => ({ ok: true, json: async () => ({ campaign: styled }) }));
  await theme.mountBlock(block);
  assert.equal(block.querySelector('.qb-layout-horizontal').dataset.badgePosition, 'corner');
});

test('published border colors and swatches respect image tile controls', async () => {
  const styled = { ...campaign, widget: {
    colors: { cardBorder: '#112233', border: '#223344', addButtonBorder: '#334455' },
    variants: { selectorStyle: 'swatch', imageSizePx: 30, imageRadiusPx: 5, showImageColorValue: false },
  } };
  const { theme, block } = setup(async () => ({ ok: true, json: async () => ({ campaign: styled }) }));
  await theme.mountBlock(block);
  assert.equal(block.style.getPropertyValue('--qb-desktop-card-border'), '#112233');
  assert.equal(block.style.getPropertyValue('--qb-desktop-border'), '#223344');
  assert.equal(block.style.getPropertyValue('--qb-desktop-button-border'), '#334455');
  const swatch = block.querySelector('.qb-value-swatch');
  assert.ok(swatch);
  assert.equal(swatch.textContent, '');
  assert.equal(swatch.getAttribute('aria-label'), 'Item 1: Color: Black');
});

test('can add the first available variant when selectors are hidden', async () => {
  const calls = [];
  const hidden = { ...campaign, widget: { variants: { showSelectors: false, defaultSelection: 'first_available' } } };
  const { theme, block } = setup(async (url, options = {}) => {
    calls.push({ url, options });
    if (url.startsWith('https://raised-stability-gaps-html.trycloudflare.com/')) return { ok: true, json: async () => ({ campaign: hidden }) };
    if (options.method === 'GET') return { ok: true, json: async () => ({ items: [] }) };
    return { ok: true, json: async () => ({ items: [{ id: 'black-s', quantity: 1 }] }) };
  });
  await theme.mountBlock(block);
  block.querySelector('[data-tier-id="single"] .qb-tier-header').click();
  assert.equal(block.querySelector('[data-add-bundle]').disabled, false);
  block.querySelector('[data-add-bundle]').click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(JSON.parse(calls.find((call) => call.options.method === 'POST').options.body), { items: [{ id: 'black-s', quantity: 1 }] });
});

test('keeps every item on one variant when mixed variants are disabled', async () => {
  const singleVariant = { ...campaign, widget: { variants: { allowMixedVariants: false, selectorStyle: 'dropdown' } } };
  const { theme, block, window } = setup(async () => ({ ok: true, json: async () => ({ campaign: singleVariant }) }));
  await theme.mountBlock(block);
  const color = block.querySelector('select[data-slot-index="1"][data-option-name="Color"]');
  color.querySelector('option[value="White"]').selected = true;
  color.dispatchEvent(new window.Event('change', { bubbles: true }));
  for (const select of block.querySelectorAll('select[data-option-name="Color"]')) assert.equal(select.value, 'White');
});


test('theme heading falls back to theme language only when the title was not configured', async () => {
  for (const [titleCopy, expected] of [[{}, '多买多省'], [{ 'widget.title': '自定义标题' }, '自定义标题'], [{ 'widget.title': '' }, null]]) {
    const published = { ...campaign, name: 'Internal name must stay private', widgetTitle: '', copy: titleCopy };
    const { theme, block } = setup(async () => ({ ok: true, json: async () => ({ campaign: published }) }));
    block.insertAdjacentHTML('beforeend', '<span data-qb-copy="widget.title" hidden>多买多省</span>');
    await theme.mountBlock(block);
    assert.equal(block.querySelector('.qb-heading')?.textContent ?? null, expected);
    assert.ok(!block.textContent.includes('Internal name must stay private'));
  }
  const { theme, block } = setup(async () => ({ ok: true, json: async () => ({ campaign }) }));
  await theme.mountBlock(block);
  assert.equal(block.querySelector('.qb-heading').textContent, 'Bundle & save');
});

test('savings label typography is independent from the amount on desktop and mobile', async () => {
  const published = { ...campaign, widget: {
    typography: { savingsLabel: { sizePx: 24, weight: 500 }, savingsPrice: { sizePx: 13, weight: 700 } },
    mobile: { typography: { savingsLabel: { sizePx: 8, weight: 900 }, savingsPrice: { sizePx: 12, weight: 600 } } },
  } };
  const { theme, block } = setup(async () => ({ ok: true, json: async () => ({ campaign: published }) }));
  await theme.mountBlock(block);
  assert.equal(block.style.getPropertyValue('--qb-desktop-savings-label-size'), '24px');
  assert.equal(block.style.getPropertyValue('--qb-desktop-savings-label-weight'), '500');
  assert.equal(block.style.getPropertyValue('--qb-desktop-savings-price-size'), '13px');
  assert.equal(block.style.getPropertyValue('--qb-mobile-savings-label-size'), '8px');
  assert.equal(block.style.getPropertyValue('--qb-mobile-savings-label-weight'), '900');
  assert.equal(block.style.getPropertyValue('--qb-mobile-savings-price-size'), '12px');
  const legacy = setup(async () => ({ ok: true, json: async () => ({ campaign }) }));
  await legacy.theme.mountBlock(legacy.block);
  assert.equal(legacy.block.style.getPropertyValue('--qb-desktop-savings-label-size'), '11px');
  assert.equal(legacy.block.style.getPropertyValue('--qb-desktop-savings-label-weight'), '400');
});


test('hides a product declared unavailable before requesting an activity even if a variant is available', async () => {
  let requests = 0;
  const { theme, block } = setup(async () => {
    requests++;
    return { ok: true, json: async () => ({ campaign }) };
  });
  block.dataset.productAvailable = 'false';
  await theme.mountBlock(block);
  assert.equal(block.hasAttribute('hidden'), true);
  assert.equal(Boolean(block.querySelector('.qb-tiers')), false);
  assert.equal(requests, 0);
});

test('keeps an available product visible while sold-out selections disable buying and recover on reselection', async () => {
  const { theme, block, window } = setup(async () => ({ ok: true, json: async () => ({ campaign }) }));
  block.dataset.productAvailable = 'true';
  await theme.mountBlock(block);
  assert.equal(block.hasAttribute('hidden'), false);
  assert.equal(block.querySelector('[data-add-bundle]').disabled, false);
  for (const [sizeValue, soldOut] of [['M', true], ['S', false]]) {
    const size = block.querySelector('select[data-slot-index="0"][data-option-name="Size"]');
    size.querySelector(`option[value="${sizeValue}"]`).selected = true;
    size.dispatchEvent(new window.Event('change', { bubbles: true }));
    assert.equal(block.hasAttribute('hidden'), false);
    assert.equal(block.querySelector('[data-add-bundle]').disabled, soldOut);
    if (soldOut) assert.equal(block.querySelector('[data-add-bundle]').textContent, 'Sold out');
    else assert.match(block.querySelector('[data-add-bundle]').textContent, /^Add 3 to cart/);
  }
});

test('omits equal original prices from tier headers, item slots and aggregated variant lines', async () => {
  for (const mobile of [false, true]) {
    for (const discountType of ['none', 'percentage']) {
      const published = { ...campaign, tiers: [{ tierId: 'same-price', quantity: 2, discountType, discountValue: 0 }] };
      const { theme, block } = setup(async () => ({ ok: true, json: async () => ({ campaign: published }) }), mobile);
      Object.assign(block.dataset, { productAvailable: 'true', currency: 'USD', locale: 'en-US' });
      block.querySelector('[data-variant-id="black-s"]').dataset.price = '7029000';
      await theme.mountBlock(block);
      const header = block.querySelector('.qb-tier-header .qb-tier-original');
      assert.equal(header.querySelector('.qb-tier-price').textContent, '$140,580.00');
      assert.equal(Boolean(header.querySelector('del')), false);
      for (const slot of block.querySelectorAll('.qb-variant-price')) {
        assert.equal(slot.querySelector('b').textContent, '$70,290.00');
        assert.equal(Boolean(slot.querySelector('del')), false);
      }
      const line = block.querySelector('[data-product-row="black-s"] .qb-product-prices');
      assert.equal(line.querySelector('b').textContent, '$140,580.00');
      assert.equal(Boolean(line.querySelector('del')), false);
    }
  }
});

test('retains distinct original prices when switching from a full-price tier to a discounted tier', async () => {
  const { theme, block } = setup(async () => ({ ok: true, json: async () => ({ campaign }) }));
  await theme.mountBlock(block);
  block.querySelector('[data-tier-id="single"] .qb-tier-header').click();
  assert.equal(Boolean(block.querySelector('.qb-slot .qb-variant-price del')), false);
  assert.equal(Boolean(block.querySelector('.qb-product-prices del')), false);
  block.querySelector('[data-tier-id="trio"] .qb-tier-header').click();
  assert.equal(block.querySelector('.qb-slot .qb-variant-price b').textContent, '$80.00');
  assert.equal(block.querySelector('.qb-slot .qb-variant-price del').textContent, '$100.00');
  assert.equal(block.querySelector('.qb-product-price').textContent, '$240.00');
  assert.equal(block.querySelector('.qb-product-original').textContent, '$300.00');
});

test('omits original prices when currency rounding makes a nonzero discount equal to the original', async () => {
  for (const [currency, rawPrice, expected, expectedTotal] of [['USD', '0', '$0.00', '$0.00'], ['USD', '1', '$0.01', '$0.02'], ['JPY', '100', '¥1', '¥2']]) {
    const published = { ...campaign, tiers: [{ tierId: 'rounded', quantity: 2, discountType: 'percentage', discountValue: 1 }] };
    const { theme, block } = setup(async () => ({ ok: true, json: async () => ({ campaign: published }) }));
    Object.assign(block.dataset, { currency, locale: 'en-US' });
    block.querySelector('[data-variant-id="black-s"]').dataset.price = rawPrice;
    await theme.mountBlock(block);
    assert.equal(block.querySelector('.qb-variant-price b').textContent, expected);
    assert.equal(Boolean(block.querySelector('.qb-variant-price del')), false);
    assert.equal(block.querySelector('.qb-product-price').textContent, expectedTotal);
    assert.equal(Boolean(block.querySelector('.qb-product-original')), false);
    assert.equal(Boolean(block.querySelector('.qb-tier-header del')), false);
  }
});
