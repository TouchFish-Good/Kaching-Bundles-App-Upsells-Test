(function (scope) {
  'use strict';

  // A product template can contain several blocks using the same script.
  if (scope.QuantityBreaksTheme?.start) {
    scope.QuantityBreaksTheme.start();
    return;
  }

  const APP_ORIGIN = 'https://raised-stability-gaps-html.trycloudflare.com';

  function resolveVariant(variants, options) {
    const names = Object.keys(options);
    return variants.find((variant) => Object.keys(variant.options).length === names.length &&
      names.every((name) => variant.options[name] === options[name])) || null;
  }

  function visibleSelections(selections, quantity) {
    return selections.slice(0, Math.max(0, quantity));
  }

  function isSellableVariant(variant) {
    return variant.available === true;
  }

  function validateSelections(selections, variants) {
    if (!Array.isArray(selections) || selections.length === 0) return { reason: 'empty' };
    const catalog = new Map(variants.map((variant) => [String(variant.id), variant]));
    for (const id of selections) {
      const variant = catalog.get(String(id));
      if (!variant) return { reason: 'invalid_variant' };
      if (!isSellableVariant(variant)) return { reason: 'unavailable', id: String(id) };
    }
    return { reason: null };
  }

  function buildCartItems(selections, variants) {
    const validation = validateSelections(selections, variants);
    if (validation.reason) throw new Error(validation.reason);
    const quantities = new Map();
    for (const id of selections) quantities.set(String(id), (quantities.get(String(id)) || 0) + 1);
    return Array.from(quantities, ([id, quantity]) => ({ id, quantity }));
  }

  function cartQuantities(cart) {
    if (!cart || !Array.isArray(cart.items)) return null;
    const quantities = new Map();
    for (const line of cart.items) {
      const id = line.variant_id || line.id;
      if (!id || !Number.isInteger(line.quantity) || line.quantity < 0) return null;
      quantities.set(String(id), (quantities.get(String(id)) || 0) + line.quantity);
    }
    return quantities;
  }

  async function addBundle(selections, variants, fetcher, cartReader) {
    const validation = validateSelections(selections, variants);
    if (validation.reason) return { status: 'invalid', reason: validation.reason, id: validation.id };
    const items = buildCartItems(selections, variants);
    const readCart = cartReader || (async () => {
      const response = await fetcher('/api/carts/ajax-cart', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'same-origin',
      });
      if (!response.ok) return null;
      return response.json();
    });
    async function snapshot() {
      try { return cartQuantities(await readCart()); } catch (_) { return null; }
    }
    const before = await snapshot();
    async function confirmUncertain() {
      let cart = null;
      try { cart = await readCart(); } catch (_) { /* A failed read cannot confirm a write. */ }
      const after = cartQuantities(cart);
      if (!before || !after) return { status: 'uncertain' };
      const confirmed = items.every(({ id, quantity }) =>
        (after.get(id) || 0) - (before.get(id) || 0) >= quantity);
      return confirmed ? { status: 'added', cartResponse: cart } : { status: 'uncertain' };
    }
    try {
      const response = await fetcher('/cart/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ items }),
      });
      let body = null;
      try { body = await response.json(); } catch (_) { /* Keep unreadable results on the existing failure/confirmation path. */ }
      const stockRejected = (!response.ok || !Array.isArray(body?.items)) && [body?.message, body?.description].some((message) =>
        typeof message === 'string' && /^(?:out of stock|stock not enough)[.!]?$/i.test(message.trim()));
      if (stockRejected) return { status: 'invalid', reason: 'unavailable', httpStatus: response.status };
      if (!response.ok) return { status: 'failed', httpStatus: response.status };
      const returned = Array.isArray(body?.items) ? body.items : [];
      const complete = items.every((item) => returned.some((line) =>
        String(line.id) === item.id && Number(line.quantity) >= item.quantity));
      return complete ? { status: 'added', cartResponse: body } : confirmUncertain();
    } catch (_) {
      // A network failure may happen after the cart was updated; do not silently retry.
      return confirmUncertain();
    }
  }

  function readCatalog(block) {
    const optionNames = Array.from(block.querySelectorAll('[data-product-option]'), (node) => node.dataset.productOption).filter(Boolean);
    const variants = Array.from(block.querySelectorAll('[data-variant-id]'), (node) => {
      const options = {};
      optionNames.forEach((name, index) => { options[name] = node.dataset[`option${index + 1}`] || ''; });
      return {
        id: node.dataset.variantId,
        title: node.dataset.variantTitle || block.dataset.productTitle || 'Product',
        options,
        available: node.dataset.available === 'true',
        // SLine prices use hundredths even for JPY; the pricing helpers take major units.
        price: Number(node.dataset.price) / 100,
        compareAtPrice: node.dataset.compareAtPrice === '' || node.dataset.compareAtPrice == null ? null : Number(node.dataset.compareAtPrice) / 100,
        image: node.dataset.image || '',
      };
    }).filter((variant) => variant.id && Number.isFinite(variant.price) && variant.price >= 0);
    return { optionNames, variants };
  }

  function readCollections(block) {
    const metadata = block.querySelector('[data-product-collections]');
    if (!metadata) return null; // Old extension versions continue to use GET.
    const countText = metadata.dataset.collectionCount || '';
    const pagesText = metadata.dataset.collectionPages || '';
    const ids = Array.from(metadata.querySelectorAll('[data-collection-id]'), (node) => node.dataset.collectionId);
    const count = /^\d{1,7}$/.test(countText) ? Number(countText) : -1;
    const pages = /^\d{1,4}$/.test(pagesText) ? Number(pagesText) : -1;
    const complete = count >= 0 && count <= 1000 && pages >= 0 && pages <= 10 &&
      (count === 0 ? pages <= 1 : pages === Math.ceil(count / 100)) &&
      ids.length === count && new Set(ids).size === count && ids.every((id) => /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(id || ''));
    return { complete, count: Math.max(0, count), ids: complete ? ids : [] };
  }

  function element(document, tag, className, label) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (label !== undefined) node.textContent = label;
    return node;
  }

  function money(value, currency, locale) {
    try { return new Intl.NumberFormat(locale || 'en', { style: 'currency', currency }).format(value); }
    catch (_) { return `${currency} ${value.toFixed(2)}`; }
  }

  function currencyFractionDigits(currency) {
    try { return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits; }
    catch (_) { return 2; }
  }

  function moneyMinor(value, currency, locale) {
    return money(value / (10 ** currencyFractionDigits(currency)), currency, locale);
  }

  function normalizeLocale(value) {
    const lower = String(value || 'en').toLowerCase();
    if (lower === 'zh-cn' || lower === 'zh-sg' || lower === 'zh-hans-cn') return 'zh-Hans';
    if (lower === 'zh-tw' || lower === 'zh-hk' || lower === 'zh-mo' || lower === 'zh-hant-tw') return 'zh-Hant';
    if (lower === 'pt-br') return 'pt-BR';
    if (lower === 'pt-pt') return 'pt-PT';
    return value || 'en';
  }

  function normalizePriceMinor(value, currency = 'USD') {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.round(number * (10 ** currencyFractionDigits(currency))) : 0;
  }

  const widgetDefaults = {
    layout: 'stacked', badgePosition: 'corner', showTierSavingsBadge: false,
    card: { radiusPx: 9, gapPx: 8, tierSavingsBadgeRadiusPx: 50 },
    colors: {
      card: '#F7F7F7', selected: '#FFFFFF', cardBorder: '#D4D4D4', border: '#171717', sectionTitle: '#171717',
      title: '#171717', subtitle: '#555555', price: '#171717', comparePrice: '#666666', badgeBackground: '#171717', badgeText: '#FFFFFF',
      variantTitle: '#626262', variantValue: '#262626', variantPrice: '#6D6D6D', variantOriginalPrice: '#8A8A8A', slotNumber: '#262626', variantBorder: '#C6C6C6', variantBackground: '#FFFFFF', status: '#52615C',
      variantSelectedBorder: '#171717', variantSelectedBackground: '#FFFFFF', variantSelectedText: '#171717', addButtonBackground: '#171717',
      addButtonText: '#FFFFFF', addButtonBorder: '#171717', savingsLabel: '#A13D29', savingsPrice: '#A13D29', cartLine: '#52615C',
      summaryLabel: '#666666', summaryAmount: '#171717', tierSavingsBadgeText: '#FFFFFF', tierSavingsBadgeBackground: '#171717',
    },
    typography: {
      bodyPx: 14, sectionTitle: { sizePx: 14, weight: 700 }, title: { sizePx: 14, weight: 700 }, subtitle: { sizePx: 12, weight: 400 },
      price: { sizePx: 14, weight: 700 }, comparePrice: { sizePx: 11, weight: 600 }, badge: { sizePx: 12, weight: 600 }, addButton: { sizePx: 14, weight: 700 },
      variantTitle: { sizePx: 11, weight: 700 }, variantValue: { sizePx: 12, weight: 700 }, variantPrice: { sizePx: 11, weight: 700 }, variantOriginalPrice: { sizePx: 11, weight: 600 }, slotNumber: { sizePx: 11, weight: 800 },
      savingsLabel: { sizePx: 11, weight: 400 }, savingsPrice: { sizePx: 11, weight: 700 }, cartLine: { sizePx: 11, weight: 400 }, summaryLabel: { sizePx: 11, weight: 400 }, summaryAmount: { sizePx: 11, weight: 700 }, checkoutNote: { sizePx: 10, weight: 400 }, status: { sizePx: 12, weight: 400 }, tierSavingsBadge: { sizePx: 12, weight: 600 },
    },
    variants: { imageSizePx: 48, imageRadiusPx: 6 },
  };

  function mergeWidgetConfig(raw, inherited = widgetDefaults) {
    const value = raw && typeof raw === 'object' ? raw : {};
    const base = inherited && typeof inherited === 'object' ? inherited : widgetDefaults;
    const merged = {
      ...base, ...value,
      card: { ...widgetDefaults.card, ...(base.card || {}), ...(value.card || {}) },
      colors: { ...widgetDefaults.colors, ...(base.colors || {}), ...(value.colors || {}) },
      typography: Object.fromEntries(Object.entries(widgetDefaults.typography).map(([key, fallback]) => [
        key, fallback && typeof fallback === 'object' ? { ...fallback, ...(value.typography?.[key] || {}) } : value.typography?.[key] ?? fallback,
      ])),
      variants: { ...widgetDefaults.variants, ...(base.variants || {}), ...(value.variants || {}) },
    };
    for (const [key, fallback] of Object.entries(widgetDefaults.typography)) {
      if (fallback && typeof fallback === 'object') merged.typography[key] = { ...fallback, ...(base.typography?.[key] || {}), ...(value.typography?.[key] || {}) };
      else merged.typography[key] = value.typography?.[key] ?? base.typography?.[key] ?? fallback;
    }
    return merged;
  }

  function widgetTokenEntries(raw) {
    const config = mergeWidgetConfig(raw);
    const columns = config.layout === 'horizontal' ? 3 : config.layout === 'grid' ? 2 : 1;
    const colors = Object.entries(config.colors).map(([key, value]) => [
      ({ card: 'card', selected: 'selected', cardBorder: 'card-border', border: 'border', sectionTitle: 'heading-color', title: 'tier-title-color',
        subtitle: 'tier-subtitle-color', price: 'tier-price-color', comparePrice: 'compare-price', badgeBackground: 'badge-bg', badgeText: 'badge-text',
        variantTitle: 'variant-title', variantValue: 'variant-value', variantPrice: 'variant-price', variantOriginalPrice: 'variant-original-price', slotNumber: 'slot-number', variantBorder: 'variant-border', variantBackground: 'variant-background', status: 'status',
        variantSelectedBorder: 'variant-selected-border', variantSelectedBackground: 'variant-selected-background', variantSelectedText: 'variant-selected-text',
        addButtonBackground: 'button-bg', addButtonText: 'button-text', addButtonBorder: 'button-border', savingsLabel: 'savings-label', savingsPrice: 'savings-price',
        cartLine: 'cart-line', summaryLabel: 'summary-label', summaryAmount: 'summary-amount',
        tierSavingsBadgeText: 'tier-savings-badge-text', tierSavingsBadgeBackground: 'tier-savings-badge-background' })[key], value,
    ]);
    const typography = [['body-size', `${config.typography.bodyPx}px`]];
    const typographyMap = {
      sectionTitle: 'heading', title: 'tier-title', subtitle: 'tier-subtitle', price: 'tier-price', comparePrice: 'compare-price', badge: 'badge', addButton: 'add',
      variantTitle: 'variant-title', variantValue: 'variant-value', variantPrice: 'variant-price', variantOriginalPrice: 'variant-original-price', slotNumber: 'slot-number', savingsLabel: 'savings-label', savingsPrice: 'savings-price', cartLine: 'cart-line',
      summaryLabel: 'summary-label', summaryAmount: 'summary-amount', checkoutNote: 'checkout-note', status: 'status', tierSavingsBadge: 'tier-savings-badge',
    };
    for (const [key, name] of Object.entries(typographyMap)) {
      typography.push([`${name}-size`, `${config.typography[key].sizePx}px`], [`${name}-weight`, String(config.typography[key].weight)]);
    }
    return [
      ['card-gap', `${config.card.gapPx}px`], ['card-radius', `${config.card.radiusPx}px`], ['tier-savings-badge-radius', `${config.card.tierSavingsBadgeRadiusPx}px`], ['image-size', `${config.variants.imageSizePx}px`],
      ['image-radius', `${config.variants.imageRadiusPx}px`], ['tier-columns', String(columns)], ['list-border-color', config.layout === 'list' ? 'transparent' : config.colors.cardBorder],
      ['compare-price-display', config.showOriginalAndDiscountedPrice === false ? 'none' : 'block'],
      ['cart-details-display', config.showCartVariantDetails === false ? 'none' : 'contents'],
      ['price-summary-display', config.showPriceSummary === false ? 'none' : 'flex'],
      ['badge-position', config.badgePosition || 'corner'], ['badge-offset-x', '12px'], ['badge-offset-y', '0px'],
      ...colors, ...typography,
    ];
  }

  function applyWidgetTokens(block, desktop, mobile) {
    for (const [name, value] of widgetTokenEntries(desktop)) block.style.setProperty(`--qb-desktop-${name}`, String(value));
    for (const [name, value] of widgetTokenEntries(mobile || desktop)) block.style.setProperty(`--qb-mobile-${name}`, String(value));
  }

  function allocateBundleTotal(values, target) {
    const total = values.reduce((sum, value) => sum + value, 0);
    if (!total) return values.map(() => 0);
    const allocated = values.map((value) => Math.floor(target * value / total));
    let remainder = target - allocated.reduce((sum, value) => sum + value, 0);
    for (let index = 0; remainder > 0 && values.length > 0; index = (index + 1) % values.length) {
      if (values[index] > 0) { allocated[index] += 1; remainder -= 1; }
    }
    return allocated;
  }

  function calculateDisplayPricing(tier, selections, variants, marketOverride, currency = 'USD') {
    const catalog = new Map(variants.map((variant) => [String(variant.id), variant]));
    const chosen = selections.map((id) => catalog.get(String(id))).filter(Boolean);
    if (chosen.length !== selections.length) return null;
    const prices = chosen.map((variant) => normalizePriceMinor(variant.price, currency));
    const originalMinor = prices.reduce((sum, price) => sum + price, 0);
    const mode = tier.discountType || 'none';
    const configuredValue = marketOverride?.mode === 'specified_amount' ? Number(marketOverride.amountMinor) : Number(tier.discountValue || 0);
    let lineDiscountedMinor;
    if (mode === 'percentage') lineDiscountedMinor = prices.map((price) => Math.round(price * (10000 - configuredValue) / 10000));
    else if (mode === 'fixed_amount') lineDiscountedMinor = prices.map((price) => Math.max(0, price - configuredValue));
    else if (mode === 'fixed_price') lineDiscountedMinor = prices.map((price) => Math.min(price, configuredValue));
    else if (mode === 'bundle_fixed_amount') lineDiscountedMinor = allocateBundleTotal(prices, Math.max(0, originalMinor - configuredValue));
    else if (mode === 'bundle_fixed_price') lineDiscountedMinor = allocateBundleTotal(prices, Math.min(originalMinor, configuredValue));
    else lineDiscountedMinor = [...prices];
    const discountedMinor = lineDiscountedMinor.reduce((sum, value) => sum + value, 0);
    return { originalMinor, discountedMinor, savingsMinor: Math.max(0, originalMinor - discountedMinor), lineDiscountedMinor };
  }

  function calculateSummary(tier, selections, variants, marketOverride, currency = 'USD') {
    const pricing = calculateDisplayPricing(tier, selections, variants, marketOverride, currency);
    if (!pricing) return null;
    return {
      original: pricing.originalMinor, catalogTotal: pricing.originalMinor, discounted: pricing.discountedMinor, savings: pricing.savingsMinor,
      lineDiscountedMinor: pricing.lineDiscountedMinor,
    };
  }

  function discountTotal(tier, selections, variants, currency, shopCurrency, marketOverride) {
    const summary = calculateSummary(tier, selections, variants, marketOverride, currency);
    if (!summary) return null;
    if (marketOverride?.mode === 'specified_amount' && currency !== marketOverride.currencyCode) return { original: summary.original, total: null };
    if (tier.discountType !== 'none' && tier.discountType !== 'percentage' && currency !== shopCurrency && marketOverride?.mode !== 'specified_amount') return { original: summary.original, total: null };
    return { original: summary.original, total: summary.discounted };
  }

  // OS2.1 themes such as Mordern render cart sections through custom elements,
  // rather than listening to the OS3 event bridge. Keep cart writes separate:
  // refreshing a failed section must never add the bundle a second time.
  async function readThemeCartJson(url, fetcher) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    let timer;
    try {
      return await Promise.race([
        (async () => {
          const response = await fetcher(url, {
            method: 'GET', credentials: 'same-origin', cache: 'no-store',
            headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
            ...(controller ? { signal: controller.signal } : {}),
          });
          if (!response.ok) throw new Error('Cart section read failed');
          return response.json();
        })(),
        new Promise((_, reject) => {
          timer = setTimeout(() => { controller?.abort(); reject(new Error('Cart section read timed out')); }, 2500);
        }),
      ]);
    } finally { clearTimeout(timer); }
  }

  function cartLineKeys(items, cart) {
    return items.map(item => {
      // This bundle submits no properties. A full-cart read can also contain
      // older personalized rows for the same variant; never select those, or
      // guess between multiple indistinguishable rows.
      const plain = line => line.properties == null || (typeof line.properties === 'object' && Object.keys(line.properties).length === 0);
      const lines = (Array.isArray(cart?.items) ? cart.items : []).filter(line =>
        String(line.variant_id || line.id) === String(item.id) && typeof line.key === 'string' && line.key && plain(line));
      if (lines.length === 1) return lines[0].key;
      return !lines.length && items.length === 1 && typeof cart?.key === 'string' && plain(cart) ? cart.key : null;
    });
  }
  async function resolveCartLineKeys(items, context, host) {
    let keys = cartLineKeys(items, context.cartResponse);
    if (keys.some(key => !key)) {
      try {
        const fallback = cartLineKeys(items, await readThemeCartJson('/api/carts/ajax-cart', context.fetcher || host.fetch));
        keys = keys.map((key, index) => key || fallback[index]);
      } catch (_) { /* Unknown line identities must not select unrelated cart rows. */ }
    }
    return keys;
  }

  async function refreshLegacyCart(ui, items, context, host) {
    const doc = host.document;
    const fetcher = context.fetcher || host.fetch;
    if (!fetcher || !host.DOMParser || !host.location?.href) return;
    const notification = ui.localName === 'cart-notification';
    const keys = notification ? await resolveCartLineKeys(items, context, host) : [];
    if (notification && (!keys.length || keys.some(key => !key))) return;
    const specs = ui.getSectionsToRender();
    if (!Array.isArray(specs) || !specs.length || specs.some(section => typeof section.id !== 'string')) return;
    const url = new URL(host.location.href);
    url.searchParams.delete('section_id');
    url.searchParams.set('sections', [...new Set(specs.map(section => section.id))].join(','));
    let prepared;
    // Retry reads only. Preflight all sections to avoid partially replacing the
    // cart, or opening its old contents after a null/malformed section response.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const sections = await readThemeCartJson(url.pathname + url.search, fetcher);
        const parsed = new Map(specs.map(section => {
          if (typeof sections?.[section.id] !== 'string') throw new Error('Missing cart section');
          return [section.id, new host.DOMParser().parseFromString(sections[section.id], 'text/html')];
        }));
        if (notification) {
          const product = parsed.get('cart-notification-product');
          const rows = keys.map(key => product?.getElementById(`cart-notification-product-${key}`));
          if (rows.some(row => !row)) throw new Error('Missing added cart line');
          if (rows.length > 1) {
            // The native popup accepts a single key. Group only this bundle's
            // server-rendered rows under that key, retaining the theme's markup.
            const group = product.createElement('div');
            group.style.width = '100%';
            rows.forEach((row, index) => {
              const entry = product.createElement('div');
              entry.style.display = 'flex';
              if (index < rows.length - 1) entry.style.marginBottom = '16px';
              entry.innerHTML = row.innerHTML;
              group.append(entry);
            });
            rows[0].replaceChildren(group);
            sections['cart-notification-product'] = rows[0].outerHTML;
          }
        }
        for (const section of specs) {
          const target = notification ? doc.getElementById(section.id) : section.selector ? doc.querySelector(section.selector) : doc.getElementById(section.id);
          const content = notification && section.id === 'cart-notification-product'
            ? parsed.get(section.id).getElementById(`cart-notification-product-${keys[0]}`)
            : parsed.get(section.id).querySelector(section.selector || '.shopline-section');
          if (!target || !content) throw new Error('Cart section cannot be rendered');
        }
        prepared = { sections, ...(notification ? { key: keys[0] } : {}) };
        break;
      } catch (_) { /* A second read may recover a transient rendering failure. */ }
    }
    if (prepared && ui.isConnected) {
      try { await ui.renderContents(prepared); } catch (_) { /* Never retry a render that may already have opened the cart. */ }
    }
  }

  async function refreshModernNotification(ui, keys, context, host) {
    if (!host.DOMParser || !host.routes?.cartUrl) return false;
    const hasKeys = keys.length > 0 && keys.every(Boolean);
    const bubbles = Array.from(host.document.querySelectorAll('theme-cart-bubble')).filter(element =>
      typeof element.getRenderConfigs === 'function' && typeof element.replaceElement === 'function');
    const instances = [ui, ...bubbles];
    const specs = instances.flatMap(element => element.getRenderConfigs());
    const url = new URL(host.routes.cartUrl, host.location.href);
    if (url.origin !== host.location.origin) return false;
    url.searchParams.set('sections', [...new Set(specs.map(spec => spec.section))].join(','));
    let prepared;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const sections = await readThemeCartJson(url.pathname + url.search, context.fetcher || host.fetch);
        const documents = {};
        for (const spec of specs) {
          if (typeof sections?.[spec.section] !== 'string') throw new Error('Missing cart section');
          documents[spec.section] ||= new host.DOMParser().parseFromString(sections[spec.section], 'text/html');
        }
        for (const element of instances) for (const spec of element.getRenderConfigs()) {
          for (const selector of spec.selectors) {
            if (!element.querySelector(selector) || !documents[spec.section].querySelector(selector)) throw new Error('Missing cart content');
          }
        }
        const rows = Array.from(documents['cart-notification-product']?.querySelectorAll('.cart-item') || []);
        const addedRows = hasKeys ? keys.map(key => rows.find(row => row.dataset.key === key)?.cloneNode(true)) : [];
        if (addedRows.some(row => !row) || !ui.querySelector('.cart-notification__items')) throw new Error('Missing added cart line');
        if (addedRows.length > 1) {
          // The native renderer selects one .cart-item. Give it a detached group
          // containing all the original rows before it emits cart:opened.
          const product = documents['cart-notification-product'];
          const group = product.createElement('div');
          group.className = 'cart-item';
          group.dataset.key = keys[keys.length - 1];
          group.setAttribute('data-qb-cart-group', '');
          group.style.display = 'contents';
          group.append(...addedRows);
          product.body.replaceChildren(group);
        }
        prepared = { documents };
        break;
      } catch (_) { /* Retry only the read, before replacing any live cart content. */ }
    }
    if (!prepared || !ui.isConnected) return false;
    try {
      for (const bubble of bubbles) await bubble.replaceElement(prepared.documents);
      if (!hasKeys) {
        // Counts and totals do not need a line identity. Keep those current,
        // while leaving the unknown items closed rather than guessing a row.
        for (const spec of ui.getRenderConfigs()) for (const selector of spec.selectors) {
          ui.querySelector(selector).innerHTML = prepared.documents[spec.section].querySelector(selector).innerHTML;
        }
        return false;
      }
      // Match the native open -> render -> cart:opened order in the same task.
      // All sections and added rows were validated before opening the popup.
      host.themeEventCenter.dispatch(new host.ThemeEvent('cart:open', { detail: { refresh: false } }));
      await ui.replaceElement(prepared.documents, { lineItemKey: keys[keys.length - 1] });
      return true;
    } catch (_) { return false; } // Never retry a renderer that may have changed DOM.
  }

  async function notifyThemeCartUpdated(items, context = {}, host = scope) {
    // Preserve the public helper signature used by existing themes/tests: (items, host).
    if (host === scope && (context.cart || context.theme || context.document || context.themeEventCenter)) {
      host = context;
      context = {};
    }
    const legacyCart = host.document?.querySelector?.('cart-notification') || host.document?.querySelector?.('cart-drawer-entry');
    const legacyReady = typeof legacyCart?.getSectionsToRender === 'function' && typeof legacyCart?.renderContents === 'function';
    const useLegacy = context.themeVersion === '2.1' || !host.themeEventCenter?.dispatch;
    const cartPage = host.document?.body?.getAttribute('data-template') === 'cart';
    if (useLegacy && legacyReady && !cartPage) {
      try { await refreshLegacyCart(legacyCart, items, context, host); } catch (_) { /* A theme UI failure must not fail a confirmed add. */ }
      try {
        if (typeof host.CustomEvent === 'function') host.document.dispatchEvent(new host.CustomEvent('quantity-breaks:cart-updated', { detail: { items, productId: context.productId, productHandle: context.productHandle } }));
      } catch (_) { /* Optional app listeners must not affect a confirmed add. */ }
      return;
    }
    if (context.themeVersion === '2.1' && (cartPage || !legacyCart) && host.routes?.cart_url && host.location) {
      try {
        const url = new URL(host.routes.cart_url, host.location.href);
        if (url.origin === host.location.origin) { host.location.assign(url.pathname + url.search); return; }
      } catch (_) { /* Fall back to other theme bridges if the native route is unavailable. */ }
    }
    const modernNotification = host.document?.body?.dataset.cartAddType === 'notification' && host.document.body.dataset.pageType !== 'cart'
      ? host.document.querySelector('theme-cart-notification') : null;
    const modernReady = modernNotification && typeof modernNotification.getRenderConfigs === 'function' && typeof modernNotification.replaceElement === 'function';
    const hasEventBridge = host.themeEventCenter?.dispatch && typeof host.ThemeEvent === 'function';
    if (modernReady && hasEventBridge) {
      try {
        const keys = await resolveCartLineKeys(items, context, host);
        items.forEach((item, index) => host.themeEventCenter.dispatch(new host.ThemeEvent('variant:added', {
          detail: { variantId: item.id, quantity: item.quantity, productId: context.productId, productHandle: context.productHandle, ...(keys[index] ? { lineItemKey: keys[index] } : {}) },
        })));
        await refreshModernNotification(modernNotification, keys, context, host);
        host.document.dispatchEvent(new host.CustomEvent('quantity-breaks:cart-updated', { detail: { items, productId: context.productId, productHandle: context.productHandle } }));
      } catch (_) { /* A failed notification cannot change a confirmed add. */ }
      return;
    }
    const bridges = [host.Shopify?.theme?.cart, host.theme?.cart, host.cart].filter(Boolean);
    for (const bridge of bridges) {
      try {
        if (typeof bridge.refresh === 'function') bridge.refresh();
        else if (typeof bridge.update === 'function') bridge.update();
        else if (typeof bridge.open === 'function') bridge.open();
      } catch (_) { /* Theme adapters are optional. */ }
    }
    try {
      const { cartResponse, fetcher, themeVersion, ...eventContext } = context;
      const detail = { items, ...eventContext };
      if (host.themeEventCenter?.dispatch && typeof host.ThemeEvent === 'function') {
        const keys = cartLineKeys(items, cartResponse);
        items.forEach((item, index) => host.themeEventCenter.dispatch(new host.ThemeEvent('variant:added', { detail: {
          variantId: item.id, quantity: item.quantity, productId: context.productId, productHandle: context.productHandle,
          ...(keys[index] ? { lineItemKey: keys[index] } : {}),
        } })));
        host.themeEventCenter.dispatch(new host.ThemeEvent('cart:open', { detail: { refresh: true } }));
      }
      const event = typeof host.CustomEvent === 'function' ? new host.CustomEvent('quantity-breaks:cart-updated', { detail })
        : host.document?.createEvent ? (() => { const created = host.document.createEvent('CustomEvent'); created.initCustomEvent('quantity-breaks:cart-updated', true, false, detail); return created; })() : null;
      if (event && host.document?.dispatchEvent) host.document.dispatchEvent(event);
      if (host.document?.dispatchEvent && typeof host.Event === 'function') host.document.dispatchEvent(new host.Event('cart:refresh', { bubbles: true }));
      if (host.document?.dispatchEvent && typeof host.CustomEvent === 'function') {
        host.document.dispatchEvent(new host.CustomEvent('cart:updated', { bubbles: true, detail }));
        for (const item of items) host.document.dispatchEvent(new host.CustomEvent('cart:item:added', { bubbles: true, detail: { item, ...eventContext } }));
      }
    } catch (_) { /* A missing event bridge must not fail a successful add. */ }
  }

  async function mountBlock(block, fetcher = scope.fetch, lifecycle = {}) {
    const hideBlock = () => { if (lifecycle.disposed) return; block.replaceChildren(); block.setAttribute('hidden', ''); };
    if (block.dataset.productAvailable === 'false') { hideBlock(); return; }
    const shop = (block.dataset.shop || '').replace(/\.myshopline\.com$/i, '');
    const shopId = block.dataset.themeVersion === '2.1' ? (block.dataset.shopId || '') : '';
    const productId = block.dataset.productId || '';
    let origin;
    try {
      origin = new URL(APP_ORIGIN);
      if (origin.pathname !== '/' || origin.search || origin.hash) return;
    } catch (_) { return; }
    if ((!/^[a-z0-9][a-z0-9-]{0,127}$/i.test(shop) && !/^\d{1,64}$/.test(shopId)) || !/^[a-z0-9][a-z0-9_-]{0,127}$/i.test(productId)) return;
    const catalog = readCatalog(block);
    if (!catalog.variants.length) return;
    const locale = normalizeLocale(block.dataset.locale);
    let campaign;
    try {
      const url = new URL('/public/quantity-breaks/campaign', origin);
      if (shopId) {
        url.searchParams.set('shopId', shopId);
        url.searchParams.set('themeVersion', '2.1');
      } else url.searchParams.set('shop', shop);
      url.searchParams.set('productId', productId);
      url.searchParams.set('locale', locale);
      const countryCode = String(block.dataset.countryCode || '').trim().toUpperCase();
      if (/^[A-Z]{2}$/.test(countryCode)) url.searchParams.set('countryCode', countryCode);
      const collections = readCollections(block);
      const init = { method: 'GET', headers: { Accept: 'application/json' }, credentials: 'omit' };
      if (collections) {
        // A simple CORS form POST avoids long URLs and extra preflight round trips.
        url.searchParams.set('collectionIds', collections.ids.join(','));
        url.searchParams.set('collectionsComplete', String(collections.complete));
        url.searchParams.set('collectionCount', String(collections.count));
        init.method = 'POST';
        init.headers['Content-Type'] = 'application/x-www-form-urlencoded';
        init.body = url.searchParams.toString();
        url.search = '';
      }
      const response = await fetcher(url.href, init);
      if (!response.ok) { hideBlock(); return; }
      campaign = (await response.json()).campaign;
      if (!campaign || !Array.isArray(campaign.tiers) || !campaign.tiers.length) { hideBlock(); return; }
    } catch (_) { hideBlock(); return; }
    if (lifecycle.disposed) return;
    const doc = block.ownerDocument;
    const firstAvailable = catalog.variants.find(isSellableVariant) || catalog.variants[0];
    const currency = block.dataset.currency || block.dataset.shopCurrency || 'USD';
    const shopCurrency = block.dataset.shopCurrency || currency;
    const desktopConfig = mergeWidgetConfig(campaign.widget);
    const mobileConfig = mergeWidgetConfig(desktopConfig.mobile, desktopConfig);
    const mediaQuery = typeof scope.matchMedia === 'function'
      ? scope.matchMedia('(max-width: 750px)')
      : { matches: false, addEventListener() {}, addListener() {} };
    const activeConfig = () => mediaQuery.matches ? mobileConfig : desktopConfig;
    const staticCopy = Object.fromEntries(Array.from(block.querySelectorAll('[data-qb-copy]'), (node) => [node.dataset.qbCopy, node.textContent?.trim() || '']));
    const copy = (key, fallback, variables = {}) => {
      const translated = campaign.copy?.[key];
      const template = typeof translated === 'string' && translated.trim() ? translated : staticCopy[key] || fallback;
      return template.replace(/\{([a-z_]+)\}/g, (match, name) => Object.prototype.hasOwnProperty.call(variables, name) ? String(variables[name]) : match);
    };
    const selections = [];
    let adding = false;
    let selectedTier = campaign.tiers.find((tier) => tier.recommended) || campaign.tiers[0];
    const maxQuantity = Math.max(...campaign.tiers.map((tier) => tier.quantity));
    for (let index = 0; index < maxQuantity; index++) selections[index] = activeConfig().variants?.defaultSelection === 'none' ? null : firstAvailable.id;
    block.replaceChildren();
    block.removeAttribute('hidden');
    applyWidgetTokens(block, desktopConfig, mobileConfig);
    // A saved empty title intentionally hides the heading; missing copy uses the theme locale.
    const title = typeof campaign.copy?.['widget.title'] === 'string'
      ? campaign.copy['widget.title'].trim()
      : (typeof campaign.widgetTitle === 'string' && campaign.widgetTitle.trim()) || copy('widget.title', 'Bundle & save');
    const heading = title ? element(doc, 'h3', 'qb-heading', title) : null;
    const choices = element(doc, 'div', `qb-tiers qb-layout-${desktopConfig.layout || 'stacked'} qb-layout-${mobileConfig.layout || desktopConfig.layout || 'stacked'}`);
    choices.dataset.badgePosition = desktopConfig.badgePosition || 'corner';
    choices.dataset.desktopBadgePosition = desktopConfig.badgePosition || 'corner';
    choices.dataset.mobileBadgePosition = mobileConfig.badgePosition || desktopConfig.badgePosition || 'corner';
    const summary = element(doc, 'div', 'qb-summary');
    const lineItems = element(doc, 'div', 'qb-summary-lines');
    const originalRow = element(doc, 'div', 'qb-summary-row');
    const originalAmount = element(doc, 'strong', 'qb-original');
    originalRow.append(element(doc, 'span', '', copy('widget.original', 'Original')), originalAmount);
    const savingsRow = element(doc, 'div', 'qb-summary-row qb-savings');
    const savingsAmount = element(doc, 'strong', 'qb-savings-amount');
    savingsRow.append(element(doc, 'span', '', copy('widget.savings', 'Estimated savings')), savingsAmount);
    const totalRow = element(doc, 'div', 'qb-summary-row');
    const total = element(doc, 'strong', 'qb-total');
    total.dataset.bundleTotal = '';
    totalRow.append(element(doc, 'span', '', copy('widget.total', 'Bundle total')), total);
    summary.append(lineItems, originalRow, savingsRow, totalRow);
    const button = element(doc, 'button', 'qb-add');
    button.type = 'button';
    button.dataset.addBundle = '';
    const buttonLabel = element(doc, 'span');
    const rotator = element(doc, 'div', 'loading--rotator');
    rotator.hidden = true;
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [name, value] of Object.entries({ 'aria-hidden': 'true', focusable: 'false', class: 'icon', width: '20', height: '20', viewBox: '0 0 20 20', fill: 'none' })) svg.setAttribute(name, value);
    const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
    for (const [name, value] of Object.entries({ d: 'M18.3332 9.99935C18.3332 14.6017 14.6022 18.3327 9.99984 18.3327C5.39746 18.3327 1.6665 14.6017 1.6665 9.99935C1.6665 5.39698 5.39746 1.66602 9.99984 1.66602', stroke: 'currentColor', 'stroke-width': '2.5', 'stroke-linecap': 'round' })) path.setAttribute(name, value);
    svg.append(path);
    rotator.append(svg);
    button.append(buttonLabel, rotator);
    const status = element(doc, 'p', 'qb-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const checkoutNote = element(doc, 'p', 'qb-checkout-note');
    checkoutNote.hidden = true;
    summary.append(checkoutNote);
    if (heading) block.append(heading);
    block.append(choices, summary, button, status);

    function availableForOption(index, name, value) {
      const selected = catalog.variants.find((variant) => variant.id === selections[index]);
      const earlier = catalog.optionNames.slice(0, catalog.optionNames.indexOf(name));
      return catalog.variants.some((variant) => isSellableVariant(variant) && variant.options[name] === value &&
        earlier.every((option) => !selected || variant.options[option] === selected.options[option]));
    }
    function chooseVariant(index, name, value) {
      const current = catalog.variants.find((variant) => variant.id === selections[index]);
      const wanted = { ...(current?.options || {}), [name]: value };
      const exact = resolveVariant(catalog.variants, wanted);
      const earlier = catalog.optionNames.slice(0, catalog.optionNames.indexOf(name));
      const fallback = catalog.variants.find((variant) => isSellableVariant(variant) && variant.options[name] === value &&
        earlier.every((option) => !current || variant.options[option] === current.options[option]));
      selections[index] = (exact || fallback)?.id || null;
      if (activeConfig().variants?.allowMixedVariants === false) selections.fill(selections[index]);
      status.textContent = '';
      render();
    }
    let activePricing = null;
    function renderSelectedVariantPrice(slot, index) {
      const selectedVariant = catalog.variants.find((variant) => variant.id === selections[index]);
      if (!selectedVariant) return;
      const originalMinor = normalizePriceMinor(selectedVariant.price, currency);
      const discountedMinor = activePricing?.lineDiscountedMinor?.[index] ?? originalMinor;
      const price = element(doc, 'span', 'qb-variant-price');
      price.append(element(doc, 'b', '', moneyMinor(discountedMinor, currency, locale)));
      if (originalMinor > discountedMinor) price.append(element(doc, 'del', '', moneyMinor(originalMinor, currency, locale)));
      slot.append(price);
    }
    function renderOption(slot, index, name) {
      const config = activeConfig();
      const selectorStyle = config.variants?.selectorStyle || 'dropdown';
      const values = [...new Set(catalog.variants.map((variant) => variant.options[name]).filter(Boolean))];
      const selected = catalog.variants.find((variant) => variant.id === selections[index]);
      const optionIndex = catalog.optionNames.indexOf(name);
      const usesImages = selectorStyle === 'image' && optionIndex === 0;
      const row = element(doc, 'div', 'qb-option');
      row.append(element(doc, 'span', 'qb-option-name', name));
      if (selectorStyle === 'dropdown') {
        const select = element(doc, 'select', 'qb-select');
        select.dataset.slotIndex = String(index);
        select.dataset.optionName = name;
          select.setAttribute('aria-label', copy('widget.item_option', 'Item {index}: {option}', { index: index + 1, option: name }));
          if (!selected) select.append(element(doc, 'option', '', copy('widget.choose_option', 'Choose an option')));
        for (const value of values) {
          const soldOut = !availableForOption(index, name, value);
          const option = element(doc, 'option', '', `${value}${soldOut ? ' (Sold out)' : ''}`);
          option.value = value;
          option.selected = selected?.options[name] === value;
          select.append(option);
        }
        select.addEventListener('change', () => chooseVariant(index, name, select.value));
        row.append(select);
      } else {
        const valuesRow = element(doc, 'div', 'qb-values');
        for (const value of values) {
          const image = usesImages ? catalog.variants.find((variant) => variant.options[name] === value && variant.image)?.image : null;
          const hideCaption = usesImages
            ? !image || config.variants?.showImageColorValue === false
            : selectorStyle === 'swatch' && config.variants?.showImageColorValue === false;
          const valueStyle = usesImages ? 'image' : selectorStyle === 'swatch' ? 'swatch' : 'text';
          const choice = element(doc, 'button', `qb-value qb-value-${valueStyle}`, hideCaption ? '' : value);
          choice.type = 'button';
          const soldOut = !availableForOption(index, name, value);
          choice.classList.toggle('qb-value-sold-out', soldOut);
          choice.setAttribute('aria-label', `${copy('widget.item_option', 'Item {index}: {option}', { index: index + 1, option: name })}: ${value}`);
          choice.setAttribute('aria-pressed', String(selected?.options[name] === value));
          if (usesImages) {
            if (image) { const img = element(doc, 'img'); img.src = image; img.alt = ''; choice.prepend(img); }
          }
          if (selectorStyle === 'swatch') choice.style.setProperty('--qb-swatch', value);
          choice.addEventListener('click', () => chooseVariant(index, name, value));
          valuesRow.append(choice);
        }
        row.append(valuesRow);
      }
      slot.append(row);
    }
    function render() {
      choices.replaceChildren();
      const quantity = selectedTier.quantity;
      const visible = visibleSelections(selections, quantity);
      const validity = validateSelections(visible, catalog.variants);
      const unavailable = !catalog.variants.some(isSellableVariant) || validity.reason === 'unavailable';
      const marketOverride = campaign.marketId ? selectedTier.marketOverrides?.[campaign.marketId] : undefined;
      const preview = validity.reason ? null : discountTotal(selectedTier, visible, catalog.variants, currency, shopCurrency, marketOverride);
      const summaryPricing = preview?.total == null ? null : calculateSummary(selectedTier, visible, catalog.variants, marketOverride, currency);
      activePricing = summaryPricing;
      for (const tier of campaign.tiers) {
        const card = element(doc, 'div', `qb-tier${tier.tierId === selectedTier.tierId ? ' qb-tier-selected' : ''}`);
        card.dataset.tierId = tier.tierId;
        const header = element(doc, 'button', 'qb-tier-header');
        header.type = 'button';
        header.setAttribute('aria-pressed', String(tier.tierId === selectedTier.tierId));
        const tierSelections = visibleSelections(selections, tier.quantity);
        const tierMarketOverride = campaign.marketId ? tier.marketOverrides?.[campaign.marketId] : undefined;
        const tierPreview = validateSelections(tierSelections, catalog.variants).reason ? null : discountTotal(tier, tierSelections, catalog.variants, currency, shopCurrency, tierMarketOverride);
        const tierPricing = tierPreview?.total == null ? null : calculateSummary(tier, tierSelections, catalog.variants, tierMarketOverride, currency);
        const titleRow = element(doc, 'span', 'qb-tier-title-row');
        titleRow.append(element(doc, 'strong', '', tier.label || copy('widget.tier_items', '{quantity} items', { quantity: tier.quantity })));
        if (activeConfig().showTierSavingsBadge === true && tierPricing?.savings > 0) titleRow.append(element(doc, 'span', 'qb-tier-savings-badge', copy('widget.tier_savings_badge', 'Save {saving_amount}', { saving_amount: moneyMinor(tierPricing.savings, currency, locale) })));
        header.append(titleRow);
        const subtitle = typeof tier.subtitle === 'string' ? tier.subtitle.trim() : '';
        if (subtitle) header.append(element(doc, 'small', '', subtitle));
        if (tierPricing) {
          const tierPrice = element(doc, 'span', 'qb-tier-original');
          tierPrice.append(element(doc, 'span', 'qb-tier-price', moneyMinor(tierPricing.discounted, currency, locale)));
          if (tierPricing.original > tierPricing.discounted) tierPrice.append(element(doc, 'del', 'qb-tier-original', moneyMinor(tierPricing.original, currency, locale)));
          header.append(tierPrice);
        }
        if (tier.tag) header.append(element(doc, 'span', 'qb-badge', tier.tag));
        header.addEventListener('click', () => { selectedTier = tier; status.textContent = ''; render(); });
        card.append(header);
        if (tier.tierId === selectedTier.tierId && activeConfig().variants?.showSelectors !== false && catalog.optionNames.length > 0) {
          const slots = element(doc, 'div', 'qb-slots');
          for (let index = 0; index < quantity; index++) {
            const slot = element(doc, 'fieldset', 'qb-slot');
            slot.append(element(doc, 'legend', '', `#${index + 1}`));
            renderSelectedVariantPrice(slot, index);
            for (const name of catalog.optionNames) renderOption(slot, index, name);
            slots.append(slot);
          }
          card.append(slots);
        }
        choices.append(card);
      }
      lineItems.replaceChildren();
      const quantities = new Map();
      visible.forEach((id) => quantities.set(String(id), (quantities.get(String(id)) || 0) + 1));
      for (const [id, quantityForId] of quantities) {
        const variant = catalog.variants.find((item) => String(item.id) === id);
        if (!variant) continue;
        const row = element(doc, 'div', 'qb-summary-row qb-product-row');
        row.dataset.productRow = id;
        const label = Object.values(variant.options || {}).filter(Boolean).join(' / ') || variant.title;
        const rowUnavailable = !isSellableVariant(variant);
        const originalMinor = normalizePriceMinor(variant.price, currency) * quantityForId;
        const selectedIndexes = visible.reduce((indexes, selectedId, index) => {
          if (String(selectedId) === id) indexes.push(index);
          return indexes;
        }, []);
        const discountedMinor = selectedIndexes.reduce((sum, index) => sum + (summaryPricing?.lineDiscountedMinor?.[index] ?? normalizePriceMinor(variant.price, currency)), 0);
        const prices = element(doc, 'span', 'qb-product-prices');
        prices.append(element(doc, 'b', 'qb-product-price', moneyMinor(discountedMinor, currency, locale)));
        if (originalMinor > discountedMinor) prices.append(element(doc, 'del', 'qb-product-original', moneyMinor(originalMinor, currency, locale)));
        row.append(element(doc, 'span', '', `${label}${rowUnavailable ? ` (${copy('widget.sold_out', 'Sold out')})` : ''} × ${quantityForId}`), prices);
        lineItems.append(row);
      }
      originalRow.hidden = unavailable;
      savingsRow.hidden = unavailable;
      totalRow.hidden = unavailable;
      originalAmount.textContent = summaryPricing ? moneyMinor(summaryPricing.original, currency, locale) : copy('widget.calculated_at_checkout', 'Calculated at checkout');
      savingsAmount.textContent = summaryPricing && preview?.total != null ? `-${moneyMinor(summaryPricing.savings, currency, locale)}` : copy('widget.calculated_at_checkout', 'Calculated at checkout');
      total.textContent = preview?.total == null || !summaryPricing ? copy('widget.calculated_at_checkout', 'Calculated at checkout') : moneyMinor(summaryPricing.discounted, currency, locale);
      const requiresCheckoutNote = !unavailable && (preview?.total == null || !summaryPricing);
      checkoutNote.hidden = !requiresCheckoutNote;
      checkoutNote.textContent = requiresCheckoutNote ? copy('widget.calculated_at_checkout', 'Calculated at checkout') : '';
      buttonLabel.textContent = unavailable
        ? copy('widget.sold_out', 'Sold out')
        : copy('widget.add_to_cart', 'Add {quantity} to cart · {price}', { quantity, price: total.textContent });
      buttonLabel.hidden = adding;
      rotator.hidden = !adding;
      button.setAttribute('aria-label', buttonLabel.textContent);
      button.setAttribute('aria-busy', String(adding));
      button.disabled = adding || unavailable || Boolean(validity.reason);
    }
    const onViewportChange = () => render();
    if (typeof mediaQuery.addEventListener === 'function') mediaQuery.addEventListener('change', onViewportChange);
    else if (typeof mediaQuery.addListener === 'function') mediaQuery.addListener(onViewportChange);
    lifecycle.cleanup = () => {
      if (typeof mediaQuery.removeEventListener === 'function') mediaQuery.removeEventListener('change', onViewportChange);
      else if (typeof mediaQuery.removeListener === 'function') mediaQuery.removeListener(onViewportChange);
    };
    lifecycle.resume = () => {
      if (typeof mediaQuery.addEventListener === 'function') mediaQuery.addEventListener('change', onViewportChange);
      else if (typeof mediaQuery.addListener === 'function') mediaQuery.addListener(onViewportChange);
      render();
    };
    button.addEventListener('click', async () => {
      if (button.disabled || adding) return;
      adding = true;
      status.textContent = '';
      render();
      const quantity = selectedTier.quantity;
      const selectedItems = visibleSelections(selections, quantity);
      const result = await addBundle(selectedItems, catalog.variants, fetcher);
      const addedItems = result.status === 'added' ? buildCartItems(selectedItems, catalog.variants) : [];
      if (result.status === 'added') await notifyThemeCartUpdated(addedItems, {
        productId, productHandle: block.dataset.productHandle || '', themeVersion: block.dataset.themeVersion,
        cartResponse: result.cartResponse, fetcher,
      }, scope).catch(() => { /* Optional theme integration cannot change a confirmed cart result. */ });
      adding = false;
      status.textContent = result.status === 'added' ? copy('widget.cart_success', '{quantity} items were added as {lines} cart lines.', { quantity, lines: addedItems.length }) : result.status === 'uncertain'
        ? copy('widget.cart_uncertain', 'We could not confirm your cart. Check it before trying again.') : result.status === 'invalid'
          ? copy('widget.no_stock', 'Not enough available variants for this quantity.') : copy('widget.cart_failure', 'Bundle could not be added. Your selections have been kept so you can retry.');
      render();
      if (result.status === 'uncertain') button.disabled = true;
    });
    render();
  }

  const startedBlocks = new WeakSet();
  const blockLifecycles = new WeakMap();
  let observingBlocks = false;
  const mountOnce = (block) => {
    if (startedBlocks.has(block)) {
      const lifecycle = blockLifecycles.get(block);
      if (!lifecycle?.disposed) return;
      lifecycle.disposed = false;
      if (lifecycle.resume) { lifecycle.resume(); return; }
      if (lifecycle.loading) return;
      startedBlocks.delete(block);
    }
    const lifecycle = { disposed: false, loading: true };
    blockLifecycles.set(block, lifecycle);
    startedBlocks.add(block);
    mountBlock(block, scope.fetch, lifecycle).catch(() => block.setAttribute('hidden', '')).finally(() => { lifecycle.loading = false; });
  };
  const unmountBlock = (block) => {
    if (block.isConnected) return;
    const lifecycle = blockLifecycles.get(block);
    if (!lifecycle || lifecycle.disposed) return;
    lifecycle.disposed = true;
    lifecycle.cleanup?.();
  };
  const start = () => {
    if (!scope.document) return;
    const mount = () => {
      scope.document.querySelectorAll('.quantity-breaks-app-block').forEach(mountOnce);
      // Both theme generations may replace a section without loading the document again.
      if (observingBlocks || !scope.MutationObserver || !scope.document.documentElement) return;
      observingBlocks = true;
      new scope.MutationObserver((records) => {
        for (const record of records) for (const node of record.removedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.matches('.quantity-breaks-app-block')) unmountBlock(node);
          node.querySelectorAll('.quantity-breaks-app-block').forEach(unmountBlock);
        }
        for (const record of records) for (const node of record.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.matches('.quantity-breaks-app-block')) mountOnce(node);
          node.querySelectorAll('.quantity-breaks-app-block').forEach(mountOnce);
        }
      }).observe(scope.document.documentElement, { childList: true, subtree: true });
    };
    if (scope.document.readyState === 'loading') scope.document.addEventListener('DOMContentLoaded', mount, { once: true });
    else mount();
  };

  scope.QuantityBreaksTheme = {
    start,
    resolveVariant,
    visibleSelections,
    validateSelections,
    buildCartItems,
    addBundle,
    readCatalog,
    discountTotal,
    moneyMinor,
    normalizePriceMinor,
    calculateDisplayPricing,
    calculateSummary,
    notifyThemeCartUpdated,
    mountBlock,
  };

  start();
})(globalThis);
