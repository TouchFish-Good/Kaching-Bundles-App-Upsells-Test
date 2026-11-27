(function (scope) {
  'use strict';

  // A product template can contain several blocks using the same script.
  if (scope.QuantityBreaksTheme?.start) {
    scope.QuantityBreaksTheme.start();
    return;
  }

  const APP_ORIGIN = 'https://app-test.vswwy.cn';

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
        price: Number(node.dataset.price) / (block.dataset.themeVersion === '2.1' ? 10 ** currencyFractionDigits(block.dataset.currency || block.dataset.shopCurrency || 'USD') : 100),
        compareAtPrice: node.dataset.compareAtPrice === '' || node.dataset.compareAtPrice == null ? null : Number(node.dataset.compareAtPrice) / (block.dataset.themeVersion === '2.1' ? 10 ** currencyFractionDigits(block.dataset.currency || block.dataset.shopCurrency || 'USD') : 100),
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
    if(!prices.every(safeAmount))return null;
    const originalMinor = prices.reduce((sum, price) => sum + price, 0);
    if(!safeAmount(originalMinor))return null;
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
    if(!lineDiscountedMinor.every(safeAmount) || !safeAmount(discountedMinor))return null;
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
      // Match exact official property identity for composite lines, or plain
      // legacy rows. Never select older personalized/same-variant gift rows,
      // or guess between multiple indistinguishable rows.
      const plain = line => propertyIdentity(line.properties) === propertyIdentity(item.properties) && propertyIdentity(line.properties) !== null;
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
          detail: { variantId: item.id, quantity: item.quantity, productId: item.productId || context.productId, productHandle: item.productHandle || context.productHandle, ...(keys[index] ? { lineItemKey: keys[index] } : {}) },
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
          variantId: item.id, quantity: item.quantity, productId: item.productId || context.productId, productHandle: item.productHandle || context.productHandle,
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

  // BEGIN GENERATED OFFERS (scripts/sync-theme-offer-core.mjs)
  const OfferCore = (() => { const exports = {};
'use strict';

// Pure application protocol. Catalog prices and availability are never config fields.
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= min && value <= max;
const id = value => typeof value === 'string' && value.trim().length > 0;
const uniqueIds = value => Array.isArray(value) && value.length > 0 && value.every(id) && new Set(value).size === value.length;
const clone = value => structuredClone(value);
function keys(raw, allowed, path, errors, optional = []) {
  if (!object(raw)) { errors.push(`${path} must be an object.`); return false; }
  for (const key of Object.keys(raw)) if (!allowed.includes(key)) errors.push(`Unknown ${path}.${key}.`);
  for (const key of allowed) if (!(key in raw) && !optional.includes(key)) errors.push(`${path}.${key} is required.`);
  return true;
}
function device(columns) {
  return { layout: { mode: 'grid', columns, columnGapPx: 12, rowGapPx: 12 }, image: { sizePx: 96, radiusPx: 6 } };
}
function defaultOfferModule(kind) {
  if (!['gifts', 'bundles'].includes(kind)) throw new Error('Unknown offer module kind.');
  return { version: 1, enabled: false, selectionMode: kind === 'gifts' ? 'all_eligible' : 'single', quantityMode: 'fixed', quotaScope: 'main_product', items: [], style: { desktop: device(3), mobile: device(1) } };
}
function normalizeOfferModule(raw, kind) {
  const defaults = defaultOfferModule(kind);
  if (raw === undefined) return defaults;
  if (!object(raw)) throw new Error(`${kind} must be an object.`);
  const candidate = { ...defaults, ...clone(raw) };
  if (raw.style !== undefined && !object(raw.style)) throw new Error(`${kind}.style must be an object.`);
  candidate.style = { ...defaults.style, ...candidate.style };
  for (const name of ['desktop', 'mobile']) {
    const source = candidate.style[name];
    if (!object(source)) throw new Error(`${kind}.style.${name} must be an object.`);
    candidate.style[name] = { ...defaults.style[name], ...source,
      layout: source.layout === undefined ? clone(defaults.style[name].layout) : object(source.layout) ? { ...defaults.style[name].layout, ...source.layout } : source.layout,
      image: source.image === undefined ? clone(defaults.style[name].image) : object(source.image) ? { ...defaults.style[name].image, ...source.image } : source.image };
  }
  const errors = validateOfferModule(candidate, kind);
  if (errors.length) throw new Error(errors.join(' '));
  // Validate historical values before reducing them: malformed quantities/IDs
  // must never become a valid discounted item by normalization.
  if (kind === 'bundles') candidate.items = candidate.items.map(rule => ({ ...rule, quantity: 1 }));
  return candidate;
}
function normalizeOfferModules(campaign) {
  return { ...campaign,
    ...(campaign.gifts !== undefined ? { gifts: normalizeOfferModule(campaign.gifts, 'gifts') } : {}),
    ...(campaign.bundles !== undefined ? { bundles: normalizeOfferModule(campaign.bundles, 'bundles') } : {}),
  };
}
function validateOfferModule(raw, kind, tiers) {
  const errors = [];
  if (raw === undefined) return errors;
  if (!['gifts', 'bundles'].includes(kind)) return ['Unknown offer module kind.'];
  if (!keys(raw, ['version','enabled','selectionMode','quantityMode','quotaScope','items','style'], kind, errors)) return errors;
  if (raw.version !== 1) errors.push(`${kind}.version must be 1.`);
  if (typeof raw.enabled !== 'boolean') errors.push(`${kind}.enabled must be boolean.`);
  if (!(kind === 'gifts' ? ['all_eligible'] : ['single','multiple']).includes(raw.selectionMode)) errors.push(`${kind}.selectionMode is invalid.`);
  if (raw.quantityMode !== 'fixed' || raw.quotaScope !== 'main_product') errors.push(`${kind} requires fixed quantities per main_product.`);
  if (!Array.isArray(raw.items)) errors.push(`${kind}.items must be an array.`);
  else {
    if (raw.enabled && raw.items.length === 0) errors.push(`${kind}.items must not be empty when enabled.`);
    const ruleIds = new Set(), orders = new Set(), currencies = new Map();
    for (const [index, rule] of raw.items.entries()) {
      const path = `${kind}.items[${index}]`;
      if (!keys(rule, ['ruleId','displayOrder','productId','allowedVariantIds','quantity','label','labelPosition','showImage','showSavings','discountType','discountValue','marketOverrides','trigger'], path, errors, ['marketOverrides','showSavings'])) continue;
      if (!id(rule.ruleId) || ruleIds.has(rule.ruleId)) errors.push(`${path}.ruleId must be unique and nonempty.`);
      else ruleIds.add(rule.ruleId);
      if (!integer(rule.displayOrder) || orders.has(rule.displayOrder)) errors.push(`${path}.displayOrder must be a unique safe nonnegative integer.`);
      else orders.add(rule.displayOrder);
      if (!id(rule.productId)) errors.push(`${path}.productId must be a nonempty string ID.`);
      if (!uniqueIds(rule.allowedVariantIds)) errors.push(`${path}.allowedVariantIds must contain unique nonempty string IDs.`);
      if (!integer(rule.quantity, 1)) errors.push(`${path}.quantity must be a positive safe integer.`);
      if (typeof rule.label !== 'string') errors.push(`${path}.label must be text.`);
      if (!['corner','below_title'].includes(rule.labelPosition)) errors.push(`${path}.labelPosition is invalid.`);
      if (rule.showSavings !== undefined && typeof rule.showSavings !== 'boolean') errors.push(`${path}.showSavings must be boolean.`);
      if (typeof rule.showImage !== 'boolean') errors.push(`${path}.showImage must be boolean.`);
      if (!['fixed_amount','fixed_price','percentage'].includes(rule.discountType) || !integer(rule.discountValue) || (rule.discountType === 'percentage' && rule.discountValue > 10000)) errors.push(`${path} has an invalid discount.`);
      if (kind === 'gifts' && (rule.discountType !== 'fixed_price' || rule.discountValue !== 0)) errors.push(`${path} gifts must be free (fixed_price 0).`);
      if (rule.marketOverrides !== undefined) {
        if (!object(rule.marketOverrides)) errors.push(`${path}.marketOverrides must be an object.`);
        else for (const [market, override] of Object.entries(rule.marketOverrides)) {
          if (!id(market) || !object(override)) { errors.push(`${path} invalid market override.`); continue; }
          if (override.mode === 'auto_convert') keys(override, ['mode'], `${path}.marketOverrides.${market}`, errors);
          else if (override.mode === 'specified_amount') {
            keys(override, ['mode','currencyCode','amountMinor'], `${path}.marketOverrides.${market}`, errors);
            if (!['fixed_amount','fixed_price'].includes(rule.discountType) || !integer(override.amountMinor) || typeof override.currencyCode !== 'string' || !/^[A-Z]{3}$/.test(override.currencyCode)) errors.push(`${path} invalid specified market amount.`);
            if (kind === 'gifts' && override.amountMinor !== 0) errors.push(`${path} gifts must be free in every market.`);
            if (currencies.has(market) && currencies.get(market) !== override.currencyCode) errors.push(`${path} market currency must be consistent.`);
            currencies.set(market, override.currencyCode);
          } else errors.push(`${path} invalid market mode.`);
        }
      }
      if (!object(rule.trigger)) errors.push(`${path}.trigger must be an object.`);
      else if (rule.trigger.type === 'tiers') {
        keys(rule.trigger, ['type','tierIds'], `${path}.trigger`, errors);
        if (!uniqueIds(rule.trigger.tierIds) || (Array.isArray(tiers) && rule.trigger.tierIds.some(tierId => !tiers.some(t => t?.tierId === tierId && integer(t.quantity, 1))))) errors.push(`${path}.trigger contains invalid tier IDs.`);
      } else if (rule.trigger.type === 'quantity') {
        keys(rule.trigger, ['type','operator','quantity'], `${path}.trigger`, errors);
        if (!['gt','gte','eq'].includes(rule.trigger.operator) || !integer(rule.trigger.quantity, 1)) errors.push(`${path}.trigger quantity is invalid.`);
      } else errors.push(`${path}.trigger type is invalid.`);
      if (Array.isArray(tiers) && !offerUnlockTier(rule, tiers)) errors.push(`${path}.trigger is unreachable from configured tiers.`);
    }
  }
  if (keys(raw.style, ['desktop','mobile'], `${kind}.style`, errors)) for (const name of ['desktop','mobile']) {
    const style = raw.style[name], path = `${kind}.style.${name}`;
    if (!keys(style, ['layout','image','colors','typography','card','badge'], path, errors, ['colors','typography','card','badge'])) continue;
    if (keys(style.layout, ['mode','columns','columnGapPx','rowGapPx','cardLayout'], `${path}.layout`, errors, ['cardLayout'])) {
      if (!['grid','carousel'].includes(style.layout.mode) || ![1,2,3].includes(style.layout.columns)) errors.push(`${path} invalid layout.`);
      if (style.layout.cardLayout !== undefined && !['stacked','horizontal','grid','list'].includes(style.layout.cardLayout)) errors.push(`${path}.layout.cardLayout is invalid.`);
      for (const key of ['columnGapPx','rowGapPx']) if (!integer(style.layout[key], 0, 128)) errors.push(`${path}.${key} must be 0–128px.`);
    }
    if (keys(style.image, ['sizePx','radiusPx'], `${path}.image`, errors)) {
      if (!integer(style.image.sizePx, 1, 1024) || !integer(style.image.radiusPx, 0, 1024)) errors.push(`${path} invalid image dimensions.`);
    }
    if (style.card !== undefined && keys(style.card, ['radiusPx'], `${path}.card`, errors) && !integer(style.card.radiusPx, 0, 1024)) errors.push(`${path}.card.radiusPx must be 0–1024px.`);
    if (style.badge !== undefined && keys(style.badge, ['radiusPx'], `${path}.badge`, errors) && !integer(style.badge.radiusPx, 0, 1024)) errors.push(`${path}.badge.radiusPx must be 0–1024px.`);
    if (style.colors !== undefined) {
      if (!object(style.colors)) errors.push(`${path}.colors must be an object.`);
      else for (const value of Object.values(style.colors)) if (typeof value !== 'string' || !/^#[\da-f]{6}([\da-f]{2})?$/i.test(value)) errors.push(`${path} colors must be #RRGGBB or #RRGGBBAA.`);
    }
    if (style.typography !== undefined) {
      if (!object(style.typography)) errors.push(`${path}.typography must be an object.`);
      else for (const [key, font] of Object.entries(style.typography)) {
        if (keys(font, ['sizePx','weight'], `${path}.typography.${key}`, errors) && (!integer(font.sizePx, 1) || !integer(font.weight, 100, 900) || font.weight % 100)) errors.push(`${path} invalid font.`);
      }
    }
  }
  return errors;
}
function offerEligible(rule, tiers, mainQuantity) {
  if (!object(rule?.trigger) || !integer(mainQuantity, 1)) return false;
  const trigger = rule.trigger;
  if (trigger.type === 'quantity' && integer(trigger.quantity, 1)) {
    return trigger.operator === 'gt' ? mainQuantity > trigger.quantity : trigger.operator === 'gte' ? mainQuantity >= trigger.quantity : trigger.operator === 'eq' && mainQuantity === trigger.quantity;
  }
  if (trigger.type !== 'tiers' || !uniqueIds(trigger.tierIds) || !Array.isArray(tiers)) return false;
  const reached = tiers.filter(tier => id(tier?.tierId) && integer(tier.quantity, 1) && tier.quantity <= mainQuantity).sort((a,b) => b.quantity - a.quantity)[0];
  return !!reached && trigger.tierIds.includes(reached.tierId);
}
function offerUnlockTier(rule, tiers) {
  if (!Array.isArray(tiers)) return undefined;
  return [...tiers].filter(tier => id(tier?.tierId) && integer(tier.quantity, 1) && offerEligible(rule, tiers, tier.quantity)).sort((a,b) => a.quantity - b.quantity || (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.tierId.localeCompare(b.tierId))[0];
}
function offerQuota(rule, tiers, mainProducts) {
  if (!integer(rule?.quantity, 1) || !Array.isArray(mainProducts)) return 0;
  const quantities = new Map();
  for (const item of mainProducts) {
    if (!id(item?.productId) || item.productId === rule.productId) continue;
    // Dropping a malformed row can falsely satisfy eq or highest-tier triggers.
    if (!integer(item.quantity, 1)) return 0;
    const total = (quantities.get(item.productId) ?? 0) + item.quantity;
    if (!integer(total, 1)) return 0;
    quantities.set(item.productId, total);
  }
  const count = [...quantities.values()].filter(quantity => offerEligible(rule, tiers, quantity)).length;
  const quota = count * rule.quantity;
  return integer(quota) ? quota : 0;
}
// Returns per-unit savings, not the resulting price. auto_convert requires the caller
// to supply a trusted converted specified_amount; this pure core does no FX lookup.
function offerDiscountMinor(unitPrice, rule, override) {
  if (!integer(unitPrice) || !integer(rule?.discountValue)) return 0;
  if (override !== undefined && (!object(override) || override.mode !== 'specified_amount' || !integer(override.amountMinor) || !/^[A-Z]{3}$/.test(override.currencyCode))) return 0;
  const value = override?.amountMinor ?? rule.discountValue;
  if (rule.discountType === 'fixed_amount') return Math.min(unitPrice, value);
  if (rule.discountType === 'fixed_price') return Math.max(0, unitPrice - value);
  if (rule.discountType !== 'percentage' || override !== undefined || value > 10000) return 0;
  const finalPrice = (BigInt(unitPrice) * BigInt(10000 - value) + 5000n) / 10000n;
  return unitPrice - Number(finalPrice);
}
function effectiveOfferColumns(width, layout) {
  if (!Number.isFinite(width) || width <= 0 || !object(layout) || ![1,2,3].includes(layout.columns) || !integer(layout.columnGapPx)) return 1;
  return Math.max(1, Math.min(layout.columns, Math.floor((width + layout.columnGapPx) / (100 + layout.columnGapPx))));
}
exports.defaultOfferModule = defaultOfferModule;
exports.normalizeOfferModule = normalizeOfferModule;
exports.normalizeOfferModules = normalizeOfferModules;
exports.validateOfferModule = validateOfferModule;
exports.offerEligible = offerEligible;
exports.offerUnlockTier = offerUnlockTier;
exports.offerQuota = offerQuota;
exports.offerDiscountMinor = offerDiscountMinor;
exports.effectiveOfferColumns = effectiveOfferColumns;

return exports; })();
  // Included in the existing app-block asset. No accessory asset/network request
  // is introduced for legacy or disabled modules. Business math comes from core.
  const offerBlockState = new WeakMap();
  const campaignRequests = new Map();
  const offerId = value => typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{0,127}$/i.test(value);
  const safeAmount = value => Number.isSafeInteger(value) && value >= 0;
  const propertyNames = ['_qb_protocol','_qb_campaign','_qb_role','_qb_rule','_qb_source_product','_qb_context'];
  function propertyIdentity(properties) {
    if (properties == null || (Array.isArray(properties) && properties.length === 0) || (!Array.isArray(properties) && typeof properties === 'object' && Object.keys(properties).length === 0)) return '';
    if (!Array.isArray(properties)) return null;
    const values = new Map();
    for (const p of properties) {
      if (!p || typeof p.name !== 'string' || typeof p.value !== 'string' || values.has(p.name)) return null;
      // Compare effective visibility: cart responses may include legacy show
      // defaults even when the request uses roleVisibility alone.
      let visibility=p.roleVisibility;
      if(visibility==null || visibility==='')visibility=p.show===true?'all':p.show===false || p.show==null?'none':null;
      if(!['customer','merchant','all','none'].includes(visibility))return null;
      values.set(p.name, [p.value,p.type,visibility]);
    }
    return JSON.stringify([...values].sort(([a],[b]) => a.localeCompare(b)));
  }
  function cartIdentity(line) {
    const id = line.variant_id || line.id;
    const properties = propertyIdentity(line.properties);
    return typeof id === 'string' && properties !== null ? JSON.stringify([id, properties]) : null;
  }
  function compositeQuantities(cart) {
    if (!Array.isArray(cart?.items)) return null;
    const result = new Map();
    for (const line of cart.items) {
      const key = cartIdentity(line);
      if (!key || !safeAmount(line.quantity)) return null;
      const total = (result.get(key) || 0) + line.quantity;
      if (!safeAmount(total)) return null;
      result.set(key,total);
    }
    return result;
  }
  function buildCompositeItems(main, accessories, context) {
    if (!offerId(context.campaignId) || !offerId(context.productId) || !offerId(context.context)) throw Error('Invalid composite context');
    const all = [...main.map(item => ({...item,role:'main',productId:context.productId,handle:context.productHandle})), ...accessories];
    const grouped = new Map();
    for (const item of all) {
      if (!offerId(item.id) || !offerId(item.productId) || !['main','gift','bundle'].includes(item.role) || !Number.isSafeInteger(item.quantity) || item.quantity <= 0 || (item.role !== 'main' && (!offerId(item.ruleId) || item.productId === context.productId))) throw Error('Invalid composite item');
      const data = { _qb_protocol:'gift-bundles-v1', _qb_campaign:context.campaignId, _qb_role:item.role, ...(item.role !== 'main' ? {_qb_rule:item.ruleId} : {}), _qb_source_product:context.productId, _qb_context:context.context };
      const properties = propertyNames.filter(name => name in data).map(name => ({name,value:data[name],type:'text',roleVisibility:'none'}));
      if (item.role === 'gift' && context.giftProperty) {
        const {name,value}=context.giftProperty;
        if(typeof name!=='string' || !name.trim() || name.startsWith('_qb_') || typeof value!=='string' || !value.trim())throw Error('Invalid gift property');
        properties.push({name,value,type:'text',roleVisibility:'all'});
      }
      const line = { id:item.id,quantity:item.quantity,properties,productId:item.productId,productHandle:item.handle || '' };
      const key = cartIdentity(line), prior = grouped.get(key);
      if (prior) { prior.quantity += item.quantity; if (!Number.isSafeInteger(prior.quantity)) throw Error('Unsafe quantity'); }
      else grouped.set(key,line);
    }
    // An actual Product/variant cannot simultaneously act as main/accessory.
    const mainIds = new Set(all.filter(i => i.role === 'main').map(i => i.id));
    if (all.some(i => i.role !== 'main' && mainIds.has(i.id))) throw Error('Conflicting roles');
    return [...grouped.values()];
  }
  async function addComposite(items, fetcher, cartReader) {
    const expected = compositeQuantities({items});
    if (!expected || !items.length) return {status:'invalid'};
    const read = cartReader || (async signal => {
      const response = await fetcher('/api/carts/ajax-cart',{method:'GET',credentials:'same-origin',headers:{Accept:'application/json'},...(signal?{signal}:{})});
      return response.ok ? response.json() : null;
    });
    async function bounded(work) {
      const controller=typeof scope.AbortController==='function'?new scope.AbortController():null;
      let timer;
      const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{controller?.abort();reject(Error('Cart deadline'));},8000);});
      try{return await Promise.race([work(controller?.signal),deadline]);}
      finally{clearTimeout(timer);}
    }
    let before = null;
    try { before = compositeQuantities(await bounded(read)); } catch (_) { /* unknown pre-write state */ }
    async function confirm() {
      let cart = null;
      try { cart = await bounded(read); } catch (_) { /* read only, never retry writes */ }
      const after = compositeQuantities(cart);
      const confirmed = before && after && [...expected].every(([key,q]) => (after.get(key)||0) - (before.get(key)||0) >= q);
      return confirmed ? {status:'added',cartResponse:cart} : {status:'uncertain',resolve:confirm};
    }
    try {
      const {response,body}=await bounded(async signal=>{
        const response=await fetcher('/cart/add',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',Accept:'application/json'},...(signal?{signal}:{}),body:JSON.stringify({items:items.map(({id,quantity,properties})=>({id,quantity,properties}))})});
        let body=null;
        try{body=await response.json();}catch(_){ /* unreadable write result */ }
        return {response,body};
      });
      if (!response.ok && response.status >= 400 && response.status < 500) return {status:'failed',httpStatus:response.status};
      const actual = compositeQuantities(body);
      return response.ok && actual && [...expected].every(([key,q]) => (actual.get(key)||0) >= q)
        ? {status:'added',cartResponse:body} : confirm();
    } catch (_) { return confirm(); }
  }
  function nativePriceMinor(text, currency, themeVersion) {
    if (typeof text !== 'string' || !/^\d+(?:\.\d+)?$/.test(text)) return null;
    let decimals;
    try {
      if (!Intl.supportedValuesOf('currency').includes(currency)) return null;
      decimals = currencyFractionDigits(currency);
    } catch (_) { return null; }
    // OS3 price is hundredths of major units; Handlebars price is the
    // currency subunit. Exact rational arithmetic rejects lossy conversion.
    const [whole,fraction=''] = text.split('.');
    const numerator = BigInt(whole + fraction) * (themeVersion === '2.1' ? 1n : 10n ** BigInt(decimals));
    const denominator = 10n ** BigInt(fraction.length) * (themeVersion === '2.1' ? 1n : 100n);
    if (numerator % denominator) return null;
    const result = Number(numerator / denominator);
    return safeAmount(result) ? result : null;
  }
  function offerImageUrl(value) {
    const image=typeof value==='string'?value.trim():'';
    if(/^data:image\//i.test(image))return image;
    try {
      const url=new URL(image.startsWith('//')?'https:'+image:image);
      return ['http:','https:'].includes(url.protocol)?url.href:'';
    } catch (_) { return ''; }
  }
  function readNativeOffers(block) {
    const root = block.querySelector('[data-offer-native-catalog]');
    if (!root) return null;
    const products = new Map(), entries = [], owners = new Map();
    for (const node of root.querySelectorAll('[data-offer-product]')) {
      const id = node.dataset.offerProduct;
      if (!offerId(id) || products.has(id)) return null;
      const variants = [], seen = new Set();
      for (const v of node.querySelectorAll('[data-offer-variant]')) {
        const variantId = v.dataset.offerVariant;
        if (!offerId(variantId) || seen.has(variantId)) return null;
        if(owners.has(variantId) && owners.get(variantId)!==id)return null;
        owners.set(variantId,id);
        seen.add(variantId);
        variants.push({id:variantId,title:v.dataset.title || '',available:v.dataset.available==='true'?true:v.dataset.available==='false'?false:null,priceMinor:nativePriceMinor(v.dataset.price,root.dataset.currency,block.dataset.themeVersion),image:offerImageUrl(v.dataset.image)});
      }
      products.set(id,{id,handle:node.dataset.handle,title:node.dataset.title || node.dataset.handle,image:offerImageUrl(node.dataset.image),variants});
    }
    for (const node of root.querySelectorAll('[data-offer-entry]')) entries.push({id:node.dataset.offerEntry,digest:node.dataset.digest,refs:Array.from(node.querySelectorAll('[data-offer-ref]'),r=>({id:r.dataset.offerRef,handle:r.dataset.handle,variantIds:Array.from(r.querySelectorAll('[data-offer-allowed]'),v=>v.dataset.offerAllowed)}))});
    return {currency:root.dataset.currency,locale:root.dataset.locale,country:root.dataset.countryCode || '',products,entries};
  }
  function offerContext(block) {
    return JSON.stringify([block.dataset.shop,block.dataset.shopId,block.dataset.productId,block.dataset.currency,block.dataset.shopCurrency,block.dataset.countryCode,normalizeLocale(block.dataset.locale)]);
  }
  function createOffers(block,campaign,envelope,native,state,doc,copy,currency,shopCurrency,locale,mediaQuery,chooseTier,rerender) {
    const container = element(doc,'div','qb-offers');
    const descriptor = campaign.catalogIndex;
    const matches = native?.entries.filter(entry=>entry.id===campaign.id && entry.digest===descriptor?.digest) || [];
    const trusted = offerId(campaign.id) && envelope?.version===2 && envelope.clientFeatures==='gift-bundles-v1' && Number.isSafeInteger(campaign.revision) && campaign.revision>=0 && campaign.catalogSource==='theme' && descriptor?.namespace==='qb_test_offers' && descriptor.key==='catalog_v1' && descriptor.version===1 && /^[a-f0-9]{64}$/.test(descriptor.digest) && campaign.offerCapability?.protocol==='gift-bundles-v1' && campaign.offerCapability.functionVerified===true && matches.length===1 && native.currency===currency && normalizeLocale(native.locale)===locale && native.country===(block.dataset.countryCode || '');
    const entry = matches[0];
    const groups = [];
    for (const kind of ['gifts','bundles']) {
      if (!campaign[kind]?.enabled) continue;
      try { groups.push({kind,module:OfferCore.normalizeOfferModule(campaign[kind],kind)}); } catch (_) { /* malformed extras cannot break main */ }
    }
    // Match Function qualification: all configured Products in enabled modules
    // are accessories, even if native data for a particular rule is unavailable.
    const accessoryProducts = new Set(groups.flatMap(g=>g.module.items.map(r=>r.productId)));
    const mainQualifies = !accessoryProducts.has(block.dataset.productId);
    const mainProducts = quantity=>mainQualifies?[{productId:block.dataset.productId,quantity}]:[];
    const validRules = new Set(groups.flatMap(g=>g.module.items.map(r=>r.ruleId)));
    for (const key of state.choices.keys()) if (!validRules.has(key)) state.choices.delete(key);
    const sellable = v=>v?.available===true && safeAmount(v.priceMinor);
    let quote={lines:[],original:0,savings:0,discounted:0,quantity:0,safe:true};
    function invalidate() {
      for(const card of container.querySelectorAll('[data-included="true"]')) {
        card.dataset.included='false';
        const label=card.querySelector('.qb-offer-state');
        if(label)label.textContent=copy('widget.offer_unavailable','Unavailable');
      }
      quote={lines:[],original:0,savings:0,discounted:0,quantity:0,safe:false};
      return quote;
    }
    let disposeLayout=[];
    function render(quantity) {
      disposeLayout.forEach(dispose=>dispose());disposeLayout=[];
      const focused=container.contains(doc.activeElement) ? doc.activeElement : null;
      const focusedRule=focused?.closest?.('[data-offer-rule]')?.dataset.offerRule;
      const focusedSlot=focused?.dataset?.offerSlot;
      const scrollPositions=new Map(Array.from(container.querySelectorAll('[data-offer-module]'),section=>[section.dataset.offerModule,section.querySelector('.qb-offer-grid')?.scrollLeft || 0]));
      container.replaceChildren();
      const allCards=[];
      for (const {kind,module} of groups) {
        const section=element(doc,'section','qb-offer-section'); section.dataset.offerModule=kind;
        const title=campaign.offerTitles?.[kind];
        if (typeof title==='string' && title) section.append(element(doc,'h4','qb-offer-heading',title));
        const device=module.style[mediaQuery.matches?'mobile':'desktop'];
        const grid=element(doc,'div',`qb-offer-grid${device.layout.mode==='carousel'?' qb-offer-carousel':''}`);
        grid.dataset.cardLayout=device.layout.cardLayout || (device.layout.columns===1?'stacked':device.layout.columns===2?'grid':'horizontal');
        const width=block.getBoundingClientRect?.().width || (mediaQuery.matches?332:700);
        for(const [key,value] of Object.entries({background:device.colors?.background || '#ffffff',text:device.colors?.text || '#171717','title-color':device.colors?.title || device.colors?.text || '#171717','section-title-color':device.colors?.sectionTitle || device.colors?.text || '#171717','badge-text':device.colors?.badgeText || '#ffffff','badge-background':device.colors?.badgeBackground || '#171717'}))section.style.setProperty('--qb-offer-'+key,value);
        for(const field of ['price','comparePrice','savings','variant','selectedBorder'])section.style.setProperty('--qb-offer-'+field+'-color',device.colors?.[field] || (field==='comparePrice'?'#777777':device.colors?.text || '#171717'));
        section.style.setProperty('--qb-offer-badge-radius',`${device.badge?.radiusPx ?? 4}px`);
        section.style.setProperty('--qb-offer-card-radius',`${device.card?.radiusPx ?? 8}px`);
        for(const [key,field,size] of [['title','title',14],['section-title','sectionTitle',16],['badge','badge',11],['price','price',14],['comparePrice','comparePrice',12],['savings','savings',12],['variant','variant',13]]){
          section.style.setProperty('--qb-offer-'+key+'-size',`${device.typography?.[field]?.sizePx || size}px`);
          section.style.setProperty('--qb-offer-'+key+'-weight',String(device.typography?.[field]?.weight || (['comparePrice','savings','variant'].includes(field)?400:600)));
        }
        const layout=['stacked','list'].includes(device.layout.cardLayout)?{...device.layout,columns:1}:device.layout;
        let effectiveColumns=OfferCore.effectiveOfferColumns(width,layout);
        grid.dataset.effectiveColumns=String(effectiveColumns);
        grid.style.setProperty('--qb-offer-columns',String(effectiveColumns));
        const selectionLayouts=[];
        grid.style.setProperty('--qb-offer-column-gap',`${device.layout.columnGapPx}px`);grid.style.setProperty('--qb-offer-row-gap',`${device.layout.rowGapPx}px`);
        grid.style.setProperty('--qb-offer-image-size',`${device.image.sizePx}px`);grid.style.setProperty('--qb-offer-image-radius',`${device.image.radiusPx}px`);
        const cards=module.items.slice().sort((a,b)=>a.displayOrder-b.displayOrder).map(rule=>{
          const ref=trusted && entry.refs.find(r=>r.id===rule.productId);
          const actual=ref && native.products.get(rule.productId);
          const product=actual && actual.handle===ref.handle && ref.variantIds.length===new Set(ref.variantIds).size && rule.allowedVariantIds.every(id=>ref.variantIds.includes(id)) ? actual : null;
          const eligible=mainQualifies && OfferCore.offerEligible(rule,campaign.tiers,quantity);
          const choice=state.choices.get(rule.ruleId) || {selected:false,slots:[]}; state.choices.set(rule.ruleId,choice);
          if(choice.productId && choice.productId!==rule.productId)choice.slots=[];
          choice.productId=rule.productId;
          // Revisions can remove a configured variant. Preserve every still
          // whitelisted slot, reset only those whose identity became invalid.
          choice.slots=choice.slots.map(id=>rule.allowedVariantIds.includes(id)?id:undefined);
          const count=rule.quantity;
          const allowed=product?.variants.filter(v=>rule.allowedVariantIds.includes(v.id)) || [];
          // Absence or unknown availability is not evidence of sold out stock.
          const soldOut=!!product && rule.allowedVariantIds.length>0 && rule.allowedVariantIds.every(id=>allowed.some(v=>v.id===id && v.available===false));
          const options=allowed.filter(v=>v.available!==false);
          const renderable=Number.isSafeInteger(count) && count>0 && count<=100;
          const selected=renderable?Array.from({length:count},(_,i)=>{
            const saved=choice.slots[i], v=(saved?options.find(v=>v.id===saved):null) || options.find(v=>v.available===true);
            if(v)choice.slots[i]=v.id;
            return v;
          }):[];
          const override=campaign.marketId?rule.marketOverrides?.[campaign.marketId]:undefined;
          const converted=!override ? currency===shopCurrency || rule.discountType==='percentage' || (kind==='gifts' && rule.discountValue===0) : override.mode==='specified_amount' && override.currencyCode===currency;
          let ready=!!product && renderable && selected.every(sellable) && converted;
          const cap=OfferCore.offerQuota(rule,campaign.tiers,mainProducts(quantity));
          const original=ready?selected.reduce((sum,v)=>sum+v.priceMinor,0):0;
          const savings=ready && eligible?selected.reduce((sum,v,i)=>sum+(i<cap?OfferCore.offerDiscountMinor(v.priceMinor,rule,override):0),0):0;
          const unlockTier=!eligible && mainQualifies && OfferCore.offerUnlockTier(rule,campaign.tiers);
          // Advertise the configured price at a reachable tier, while only
          // current eligibility can authorize quote savings and cart lines.
          const displayCap=eligible?cap:unlockTier?OfferCore.offerQuota(rule,campaign.tiers,mainProducts(unlockTier.quantity)):0;
          const displaySavings=ready?selected.reduce((sum,v,i)=>sum+(i<displayCap?OfferCore.offerDiscountMinor(v.priceMinor,rule,override):0),0):0;
          ready=ready && safeAmount(original) && safeAmount(savings) && safeAmount(original-savings) && safeAmount(displaySavings) && safeAmount(original-displaySavings);
          return {kind,module,rule,product,eligible,choice,count,options,selected,ready,original,savings,displaySavings,unlockTier,soldOut,included:ready && eligible && (kind==='gifts' || choice.selected)};
        }).filter(c=>!c.soldOut);
        if(kind==='bundles' && module.selectionMode==='single') {
          const candidates=cards.filter(c=>c.choice.selected && c.ready && c.eligible);
          const picked=candidates.sort((a,b)=>b.savings-a.savings || a.rule.displayOrder-b.rule.displayOrder)[0];
          cards.forEach(c=>{c.included=c===picked;});
        }
        for(const c of cards) {
          const {rule,choice}=c;
          const card=element(doc,'article','qb-offer-card');card.dataset.offerRule=rule.ruleId;card.dataset.offerRole=kind==='gifts'?'gift':'bundle';card.dataset.included=String(c.included);
          card.dataset.locked=String(!c.eligible);
          if(rule.label && rule.labelPosition==='corner')card.append(element(doc,'span','qb-badge qb-offer-label',rule.label));
          const image=c.selected.find(v=>v?.image)?.image || c.product?.image;
          const content=element(doc,'div',kind==='gifts'?'qb-offer-content':'qb-offer-product');
          const description=kind==='gifts'?content:element(doc,'div','qb-offer-description');
          const imageParent=kind==='gifts'?card:content;
          card.dataset.hasImage=String(!!(rule.showImage && image));
          if(rule.showImage && image){const img=element(doc,'img','qb-offer-image');img.src=image;img.alt='';imageParent.append(img);}
          const productTitle=element(doc,'strong','qb-offer-title',c.product?.title || copy('widget.offer_unavailable','Unavailable'));
          description.append(productTitle);
          if(rule.label && rule.labelPosition==='below_title')description.append(element(doc,'span','qb-badge qb-offer-label-below',rule.label));
          if(kind==='bundles')content.append(description);
          const tier=c.unlockTier;
          let topLine;
          if(kind==='bundles') {
            topLine=element(doc,'div','qb-offer-topline');
            const label=element(doc,'label','qb-offer-select');
            const toggle=element(doc,'input');toggle.type='checkbox';toggle.dataset.offerSelect='';toggle.checked=c.included;
            toggle.setAttribute('aria-label',c.product?.title || copy('widget.offer_select','Select'));
            toggle.disabled=!c.ready || !c.eligible;
            const changeSelection=selected=>{
              if(toggle.disabled)return;
              if(module.selectionMode==='single' && selected)cards.forEach(other=>other.choice.selected=false);
              choice.selected=selected;
              rerender();
            };
            toggle.addEventListener('change',()=>changeSelection(toggle.checked));
            toggle.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();changeSelection(!c.included);}});
            card.addEventListener('click',event=>{
              if(event.target.closest?.('select,option,input,button,label,a'))return;
              changeSelection(!c.included);
            });
            selectionLayouts.push(()=>{
              const multiple=effectiveColumns>1;
              label.dataset.visuallyHidden=String(multiple);
              if(multiple){card.setAttribute('role','group');card.setAttribute('aria-label',c.product?.title || copy('widget.offer_select','Select'));}
              else {card.removeAttribute('role');card.removeAttribute('aria-label');}
            });
            label.append(toggle);topLine.append(label);card.append(topLine);
          }
          card.append(content);
          if(!c.ready)description.append(element(doc,'span','qb-offer-state',copy('widget.offer_unavailable','Unavailable')));
          if(c.ready){
            if(kind==='bundles') {
              const prices=element(doc,'div','qb-offer-prices');
              prices.append(element(doc,'b','',moneyMinor(c.original-c.displaySavings,currency,locale)));
              if(c.displaySavings>0){
                prices.append(element(doc,'span','qb-offer-savings',copy('widget.tier_savings_badge','Save {saving_amount}',{saving_amount:moneyMinor(c.displaySavings,currency,locale)})));
                prices.append(element(doc,'del','',moneyMinor(c.original,currency,locale)));
              }
              topLine.append(prices);
            } else if(c.displaySavings>0 && rule.showSavings!==false)content.append(element(doc,'span','qb-offer-savings',copy('widget.tier_savings_badge','Save {saving_amount}',{saving_amount:moneyMinor(c.displaySavings,currency,locale)})));
          }
          if(c.selected.length && c.options.length)c.selected.forEach((v,i)=>{const select=element(doc,'select','qb-select qb-offer-variant');select.dataset.offerSlot=String(i);select.disabled=!c.eligible;select.setAttribute('aria-label',`${copy('widget.choose_option','Choose an option')} ${i+1}`);if(!v){const placeholder=element(doc,'option','',copy('widget.choose_option','Choose an option'));placeholder.value='';select.append(placeholder);}for(const option of c.options){const node=element(doc,'option','',option.title);node.value=option.id;node.selected=v?.id===option.id;node.disabled=!sellable(option);select.append(node);}select.addEventListener('change',()=>{choice.slots[i]=select.value;rerender();});(kind==='gifts'?content:card).append(select);});
          if(!c.eligible){
            const locked=copy('widget.offer_locked','Locked');
            const overlay=element(doc,'button','qb-offer-lock');overlay.type='button';overlay.disabled=!tier;
            overlay.setAttribute('aria-label',tier?`${locked}. ${copy('widget.offer_unlock','Unlock with {quantity} items',{quantity:tier.quantity})}`:locked);
            const icon=doc.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 48 56');icon.setAttribute('aria-hidden','true');
            const shackle=doc.createElementNS('http://www.w3.org/2000/svg','path');shackle.setAttribute('d','M12 23V15a12 12 0 0 1 24 0v8');shackle.setAttribute('fill','none');shackle.setAttribute('stroke','currentColor');shackle.setAttribute('stroke-width','5');
            const body=doc.createElementNS('http://www.w3.org/2000/svg','path');body.setAttribute('d','M7 22h34a4 4 0 0 1 4 4v26a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V26a4 4 0 0 1 4-4Zm17 9a4 4 0 0 0-2 7.46V44a2 2 0 0 0 4 0v-5.54A4 4 0 0 0 24 31Z');body.setAttribute('fill','currentColor');body.setAttribute('fill-rule','evenodd');icon.append(shackle,body);
            overlay.append(icon,element(doc,'span','',locked));
            overlay.addEventListener('click',()=>{if(overlay.disabled)return;if(kind==='bundles'){if(module.selectionMode==='single')cards.forEach(other=>other.choice.selected=false);choice.selected=true;}chooseTier(tier);});
            card.append(overlay);
          }
          grid.append(card);
        }
        const carousel=device.layout.mode==='carousel';
        const navButtons=[];
        const rtl=()=>scope.getComputedStyle?.(grid).direction==='rtl';
        const updateBounds=()=>{const position=rtl()?-grid.scrollLeft:grid.scrollLeft;navButtons.forEach((button,index)=>{button.disabled=index===0 ? !(position>1) : !(position+grid.clientWidth<grid.scrollWidth-1);button.hidden=button.disabled;});};
        const measureLayout=()=>{
          const actualWidth=grid.clientWidth || block.getBoundingClientRect?.().width || width;
          effectiveColumns=OfferCore.effectiveOfferColumns(actualWidth,layout);
          grid.dataset.effectiveColumns=String(effectiveColumns);
          grid.style.setProperty('--qb-offer-columns',String(effectiveColumns));
          selectionLayouts.forEach(update=>update());
          const badgeHeight=Math.max(0,...Array.from(grid.querySelectorAll('.qb-offer-label'),badge=>badge.getBoundingClientRect?.().height || 0));
          if(badgeHeight)grid.style.setProperty('--qb-offer-badge-clearance',`${Math.ceil(badgeHeight/2)+2}px`);
          updateBounds();
        };
        const reveal=target=>{
          if(!carousel)return;
          const card=target.closest?.('[data-offer-rule]');
          if(!card || !grid.getBoundingClientRect || !card.getBoundingClientRect)return;
          const a=card.getBoundingClientRect(),b=grid.getBoundingClientRect();
          const left=a.left<b.left?a.left-b.left:a.right>b.right?a.right-b.right:0;
          if(left)grid.scrollBy?.({left,behavior:'instant'});
        };
        if(carousel)grid.tabIndex=0;
        let revealTimer;
        const cancelReveal=()=>clearTimeout(revealTimer);disposeLayout.push(cancelReveal);
        const scheduleReveal=target=>{cancelReveal();revealTimer=setTimeout(()=>{if(grid.isConnected && doc.activeElement===target)reveal(target);},350);};
        grid.addEventListener('keydown',event=>{if(carousel && ['ArrowLeft','ArrowRight'].includes(event.key)){if(event.target===grid){event.preventDefault();grid.scrollBy?.({left:(event.key==='ArrowRight'?1:-1)*Math.max(220,grid.clientWidth || width),behavior:'smooth'});}else scheduleReveal(event.target);}});
        grid.addEventListener('keyup',event=>{if(event.target!==grid && ['ArrowLeft','ArrowRight'].includes(event.key))scheduleReveal(event.target);});
        for(const name of ['pointerdown','touchstart','wheel'])grid.addEventListener(name,cancelReveal,{passive:true});
        grid.addEventListener('focusin',event=>reveal(event.target));
        grid.addEventListener('scroll',updateBounds);
        const list=element(doc,'div','qb-offer-list');
        list.append(grid);
        if(carousel){const nav=element(doc,'div','qb-offer-nav');for(const [label,direction] of [[copy('widget.offer_previous','Previous'),-1],[copy('widget.offer_next','Next'),1]]){const b=element(doc,'button','',label);b.type='button';b.disabled=true;b.hidden=true;b.setAttribute('aria-label',label);b.textContent=direction<0?'‹':'›';b.addEventListener('click',()=>grid.scrollBy?.({left:direction*(rtl()?-1:1)*Math.max(220,grid.clientWidth || width),behavior:'smooth'}));nav.append(b);navButtons.push(b);}list.append(nav);}
        section.append(list);container.append(section);grid.scrollLeft=scrollPositions.get(kind) || 0;measureLayout();
        // Initial render can precede mounting the offers container. Recheck
        // actual geometry after mount, then track resizing and badge wrapping.
        const layoutTimer=setTimeout(measureLayout,0);disposeLayout.push(()=>clearTimeout(layoutTimer));
        if(typeof scope.ResizeObserver==='function'){const observer=new scope.ResizeObserver(measureLayout);observer.observe(grid);for(const badge of grid.querySelectorAll('.qb-offer-label'))observer.observe(badge);disposeLayout.push(()=>observer.disconnect());}
        allCards.push(...cards);
      }
      const included=allCards.filter(c=>c.included);
      const original=included.reduce((n,c)=>n+c.original,0),savings=included.reduce((n,c)=>n+c.savings,0),count=included.reduce((n,c)=>n+c.count,0);
      const safe=[original,savings,count,original-savings].every(safeAmount);
      quote={original:safe?original:0,savings:safe?savings:0,discounted:safe?original-savings:0,quantity:safe?count:0,safe,lines:safe?included.flatMap(c=>c.selected.map((v,i)=>({id:v.id,quantity:1,role:c.kind==='gifts'?'gift':'bundle',ruleId:c.rule.ruleId,showSavings:c.rule.showSavings!==false,productId:c.rule.productId,handle:c.product.handle,title:c.product.title,variantTitle:v.title,priceMinor:v.priceMinor,discountedMinor:v.priceMinor-(i<OfferCore.offerQuota(c.rule,campaign.tiers,mainProducts(quantity))?OfferCore.offerDiscountMinor(v.priceMinor,c.rule,campaign.marketId?c.rule.marketOverrides?.[campaign.marketId]:undefined):0)}))):[]};
      if(!safe){invalidate();container.append(element(doc,'p','qb-offer-unavailable',copy('widget.offer_unavailable','Unavailable')));}
      if(focusedRule)for(const input of container.querySelectorAll('[data-offer-select],[data-offer-slot]'))if(input.closest('[data-offer-rule]')?.dataset.offerRule===focusedRule && (focusedSlot===undefined ? input.hasAttribute('data-offer-select') : input.dataset.offerSlot===focusedSlot))input.focus({preventScroll:true});
      return quote;
    }
    return {container,render,invalidate,dispose(){disposeLayout.forEach(dispose=>dispose());disposeLayout=[];},get quote(){return quote;},hasModules:groups.length>0,enabled:groups.length>0 && trusted};
  }

  // END GENERATED OFFERS

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
    let saved = offerBlockState.get(block);
    if (!saved) { saved = { catalog:readCatalog(block), collections:readCollections(block), native:readNativeOffers(block), copy:Object.fromEntries(Array.from(block.querySelectorAll('[data-qb-copy]'), node=>[node.dataset.qbCopy,node.textContent?.trim() || ''])), choices:new Map(), context:null, generation:0 }; offerBlockState.set(block,saved); }
    const contextKey = offerContext(block), generation = ++saved.generation;
    if (saved.context && saved.context !== contextKey) { saved.choices.clear(); saved.native = null; }
    saved.context = contextKey;
    const catalog = saved.catalog;
    if (!catalog.variants.length) return;
    const locale = normalizeLocale(block.dataset.locale);
    let campaign, envelope;
    try {
      const url = new URL('/public/quantity-breaks/campaign', origin);
      if (shopId) {
        url.searchParams.set('shopId', shopId);
        url.searchParams.set('themeVersion', '2.1');
      } else url.searchParams.set('shop', shop);
      url.searchParams.set('productId', productId);
      url.searchParams.set('locale', locale);
      if (block.dataset.offerNative === '1') url.searchParams.set('clientFeatures','gift-bundles-v1');
      const countryCode = String(block.dataset.countryCode || '').trim().toUpperCase();
      if (/^[A-Z]{2}$/.test(countryCode)) url.searchParams.set('countryCode', countryCode);
      const collections = saved.collections;
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
      const requestKey = contextKey + url.href + (init.body || '');
      let pending = campaignRequests.get(requestKey);
      if (!pending) { pending = (async()=>{const response=await fetcher(url.href,init); return response.ok ? response.json() : null;})(); campaignRequests.set(requestKey,pending); pending.finally(()=>{if(campaignRequests.get(requestKey)===pending)campaignRequests.delete(requestKey);}).catch(()=>{}); }
      envelope = await pending;
      if (saved.generation !== generation || offerContext(block) !== contextKey || lifecycle.disposed) return;
      campaign = envelope?.campaign;
      if (!campaign || !Array.isArray(campaign.tiers) || !campaign.tiers.length) { hideBlock(); return; }
    } catch (_) { if(saved.generation===generation && offerContext(block)===contextKey)hideBlock(); return; }
    // Defend local previews/older envelopes too: an accessory Product never
    // receives a main-tier discount, matching Function's global exclusion.
    if ([campaign.gifts,campaign.bundles].some(module=>module?.enabled && module.items?.some(rule=>rule.productId===productId))) {
      campaign={...campaign,tiers:campaign.tiers.map(tier=>({...tier,discountType:'none',discountValue:0,marketOverrides:undefined}))};
    }
    if (lifecycle.disposed) return;
    saved.cleanup?.();
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
    const staticCopy = saved.copy;
    const copy = (key, fallback, variables = {}) => {
      const translated = campaign.copy?.[key];
      const template = typeof translated === 'string' && translated.trim() ? translated : staticCopy[key] || fallback;
      return template.replace(/\{([a-z_]+)\}/g, (match, name) => Object.prototype.hasOwnProperty.call(variables, name) ? String(variables[name]) : match);
    };
    const selections = saved.selections || []; saved.selections=selections;
    let adding = false;
    campaign.tiers=campaign.tiers.filter(tier=>Number.isSafeInteger(tier.quantity) && tier.quantity>0);
    if (!campaign.tiers.length) { hideBlock(); return; }
    let selectedTier = campaign.tiers.find(tier=>tier.tierId===saved.tierId) || campaign.tiers.find((tier) => tier.recommended) || campaign.tiers[0];
    // A presentation capacity, not a campaign/checkout quantity cap. Huge tiers
    // stay visible at their exact quantity and unavailable until representable.
    const maxQuantity = Math.min(100, Math.max(...campaign.tiers.map((tier) => tier.quantity)));
    for (let index = selections.length; index < maxQuantity; index++) selections[index] = activeConfig().variants?.defaultSelection === 'none' ? null : firstAvailable.id;
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
    const offers=createOffers(block,campaign,envelope,saved.native,saved,doc,copy,currency,shopCurrency,locale,mediaQuery,tier=>{selectedTier=tier;render();},()=>render());
    block.append(choices, ...(offers.hasModules?[offers.container]:[]), summary, button, status);

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
      if(lifecycle.disposed || saved.generation!==generation)return;
      choices.replaceChildren();
      const quantity = selectedTier.quantity;
      saved.tierId=selectedTier.tierId;
      let accessory=offers.render(quantity);
      const visible = visibleSelections(selections, quantity);
      const validity = quantity>100 ? {reason:'unrenderable'} : validateSelections(visible, catalog.variants);
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
        const tierPreview = tier.quantity>100 || validateSelections(tierSelections, catalog.variants).reason ? null : discountTotal(tier, tierSelections, catalog.variants, currency, shopCurrency, tierMarketOverride);
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
        if (quantity<=100 && tier.tierId === selectedTier.tierId && activeConfig().variants?.showSelectors !== false && catalog.optionNames.length > 0) {
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
        prices.append(element(doc, 'b', 'qb-product-price', safeAmount(discountedMinor)?moneyMinor(discountedMinor, currency, locale):copy('widget.calculated_at_checkout','Calculated at checkout')));
        if (safeAmount(originalMinor) && safeAmount(discountedMinor) && originalMinor > discountedMinor) prices.append(element(doc, 'del', 'qb-product-original', moneyMinor(originalMinor, currency, locale)));
        row.append(element(doc, 'span', '', `${label}${rowUnavailable ? ` (${copy('widget.sold_out', 'Sold out')})` : ''} × ${quantityForId}`), prices);
        lineItems.append(row);
      }
      originalRow.hidden = unavailable;
      savingsRow.hidden = unavailable;
      totalRow.hidden = unavailable;
      const safeComposite=summaryPricing && [summaryPricing.original+accessory.original,summaryPricing.discounted+accessory.discounted,summaryPricing.savings+accessory.savings,quantity+accessory.quantity].every(safeAmount);
      const accessoryActive=accessory.safe && safeComposite;
      if(!accessoryActive && accessory.quantity>0)accessory=offers.invalidate();
      for(const line of accessoryActive?accessory.lines:[]) {
        const row=element(doc,'div','qb-summary-row qb-offer-receipt');row.dataset.offerRole=line.role;
        row.append(element(doc,'span','',`${line.title} / ${line.variantTitle}${line.role==='gift'?'':` × ${line.quantity}`}`));
        if(line.role!=='gift')row.append(element(doc,'b','',moneyMinor(line.discountedMinor,currency,locale)));
        else if(line.showSavings!==false && line.priceMinor>line.discountedMinor)row.append(element(doc,'b','',copy('widget.tier_savings_badge','Save {saving_amount}',{saving_amount:moneyMinor(line.priceMinor-line.discountedMinor,currency,locale)})));
        lineItems.append(row);
      }
      originalAmount.textContent = summaryPricing ? moneyMinor(summaryPricing.original+(accessoryActive?accessory.original:0), currency, locale) : copy('widget.calculated_at_checkout', 'Calculated at checkout');
      savingsAmount.textContent = summaryPricing && preview?.total != null ? `-${moneyMinor(summaryPricing.savings+(accessoryActive?accessory.savings:0), currency, locale)}` : copy('widget.calculated_at_checkout', 'Calculated at checkout');
      total.textContent = preview?.total == null || !summaryPricing ? copy('widget.calculated_at_checkout', 'Calculated at checkout') : moneyMinor(summaryPricing.discounted+(accessoryActive?accessory.discounted:0), currency, locale);
      const requiresCheckoutNote = !unavailable && (preview?.total == null || !summaryPricing);
      checkoutNote.hidden = !requiresCheckoutNote;
      checkoutNote.textContent = requiresCheckoutNote ? copy('widget.calculated_at_checkout', 'Calculated at checkout') : '';
      const transaction=saved.transaction;
      const canCheck=transaction?.status==='uncertain' && typeof transaction.resolve==='function';
      buttonLabel.textContent = canCheck ? copy('widget.check_cart','Check cart') : unavailable
        ? copy('widget.sold_out', 'Sold out')
        : copy('widget.add_to_cart', 'Add {quantity} to cart · {price}', { quantity:quantity+(accessoryActive?accessory.quantity:0), price: total.textContent });
      const busy=adding || transaction?.status==='pending' || transaction?.checking===true;
      buttonLabel.hidden = busy;
      rotator.hidden = !busy;
      button.setAttribute('aria-label', buttonLabel.textContent);
      button.setAttribute('aria-busy', String(busy));
      button.disabled = busy || (transaction ? !canCheck : unavailable || Boolean(validity.reason));
      const result=saved.cartResult;
      status.textContent = result?.status === 'added' ? copy('widget.cart_success', '{quantity} items were added as {lines} cart lines.', {quantity:result.quantity,lines:result.lines}) : transaction?.status==='uncertain' || result?.status==='uncertain'
        ? copy('widget.cart_uncertain', 'We could not confirm your cart. Check it before trying again.') : result?.status==='invalid'
          ? copy('widget.no_stock', 'Not enough available variants for this quantity.') : result?.status==='failed' ? copy('widget.cart_failure', 'Bundle could not be added. Your selections have been kept so you can retry.') : '';
    }
    saved.render=render;
    const onViewportChange = () => render();
    const resizeObserver=typeof scope.ResizeObserver==='function'?new scope.ResizeObserver(()=>render()):null;
    resizeObserver?.observe(block);
    if (typeof mediaQuery.addEventListener === 'function') mediaQuery.addEventListener('change', onViewportChange);
    else if (typeof mediaQuery.addListener === 'function') mediaQuery.addListener(onViewportChange);
    lifecycle.cleanup = () => {
      offers.dispose?.();
      resizeObserver?.disconnect();
      if (typeof mediaQuery.removeEventListener === 'function') mediaQuery.removeEventListener('change', onViewportChange);
      else if (typeof mediaQuery.removeListener === 'function') mediaQuery.removeListener(onViewportChange);
    };
    saved.cleanup=lifecycle.cleanup;
    lifecycle.resume = () => {
      resizeObserver?.observe(block);
      if (typeof mediaQuery.addEventListener === 'function') mediaQuery.addEventListener('change', onViewportChange);
      else if (typeof mediaQuery.addListener === 'function') mediaQuery.addListener(onViewportChange);
      render();
    };
    button.addEventListener('click', async () => {
      if (button.disabled || adding || lifecycle.disposed || saved.generation!==generation) return;
      const pending=saved.transaction;
      if(pending) {
        if(pending.status!=='uncertain' || pending.checking || typeof pending.resolve!=='function')return;
        pending.checking=true;saved.render?.();
        let result;
        try{result=await pending.resolve();}catch(_){result={status:'uncertain',resolve:pending.resolve};}
        await settleCart(result,pending.items,pending);
        return;
      }
      adding = true;
      saved.cartResult=null;
      status.textContent = '';
      render();
      const quantity = selectedTier.quantity;
      const selectedItems = visibleSelections(selections, quantity);
      const mainItems=buildCartItems(selectedItems,catalog.variants);
      const accessory=offers.quote;
      const summaryPricing=calculateSummary(selectedTier,selectedItems,catalog.variants,campaign.marketId?selectedTier.marketOverrides?.[campaign.marketId]:undefined,currency);
      const safeComposite=summaryPricing && [summaryPricing.original+accessory.original,summaryPricing.discounted+accessory.discounted,quantity+accessory.quantity].every(safeAmount);
      const useComposite=offers.enabled;
      const context = scope.crypto?.randomUUID?.() || `qb-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const items=useComposite?buildCompositeItems(mainItems,accessory.safe && safeComposite?accessory.lines:[],{campaignId:campaign.id,productId,productHandle:block.dataset.productHandle || '',context,giftProperty:{name:copy('widget.gift_property_label','Gift'),value:copy('widget.gift_property_value','Received with {product_title}',{product_title:block.dataset.productTitle || block.dataset.productHandle || productId})}}):mainItems;
      const transaction=useComposite?{status:'pending',items,productId,productHandle:block.dataset.productHandle || '',themeVersion:block.dataset.themeVersion,fetcher}:null;
      if(transaction)saved.transaction=transaction;
      const result = useComposite?await addComposite(items,fetcher):await addBundle(selectedItems,catalog.variants,fetcher);
      adding = false;
      await settleCart(result,items,transaction);
      if(!transaction && result.status==='uncertain')button.disabled=true;
    });
    async function settleCart(result,items,transaction) {
      if(transaction && saved.transaction!==transaction)return;
      if(transaction && result.status==='uncertain') {
        transaction.status='uncertain';transaction.resolve=result.resolve;transaction.checking=false;
      } else if(transaction) saved.transaction=null;
      saved.cartResult={status:result.status,quantity:items.reduce((n,item)=>n+item.quantity,0),lines:items.length};
      saved.render?.();
      if(result.status==='added')await notifyThemeCartUpdated(items,{
        productId:transaction?.productId || productId,productHandle:transaction?.productHandle || block.dataset.productHandle || '',themeVersion:transaction?.themeVersion || block.dataset.themeVersion,
        cartResponse:result.cartResponse,fetcher:transaction?.fetcher || fetcher,
      },scope).catch(()=>{ /* Optional notification cannot change a confirmed result. */ });
    }
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
    buildCompositeItems,
    addComposite,
    nativePriceMinor,
    readNativeOffers,
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
