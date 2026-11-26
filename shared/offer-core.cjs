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
      if (!keys(rule, ['ruleId','displayOrder','productId','allowedVariantIds','quantity','label','labelPosition','showImage','discountType','discountValue','marketOverrides','trigger'], path, errors, ['marketOverrides'])) continue;
      if (!id(rule.ruleId) || ruleIds.has(rule.ruleId)) errors.push(`${path}.ruleId must be unique and nonempty.`);
      else ruleIds.add(rule.ruleId);
      if (!integer(rule.displayOrder) || orders.has(rule.displayOrder)) errors.push(`${path}.displayOrder must be a unique safe nonnegative integer.`);
      else orders.add(rule.displayOrder);
      if (!id(rule.productId)) errors.push(`${path}.productId must be a nonempty string ID.`);
      if (!uniqueIds(rule.allowedVariantIds)) errors.push(`${path}.allowedVariantIds must contain unique nonempty string IDs.`);
      if (!integer(rule.quantity, 1)) errors.push(`${path}.quantity must be a positive safe integer.`);
      if (typeof rule.label !== 'string') errors.push(`${path}.label must be text.`);
      if (!['corner','below_title'].includes(rule.labelPosition)) errors.push(`${path}.labelPosition is invalid.`);
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
    if (!keys(style, ['layout','image','colors','typography'], path, errors, ['colors','typography'])) continue;
    if (keys(style.layout, ['mode','columns','columnGapPx','rowGapPx','cardLayout'], `${path}.layout`, errors, ['cardLayout'])) {
      if (!['grid','carousel'].includes(style.layout.mode) || ![1,2,3].includes(style.layout.columns)) errors.push(`${path} invalid layout.`);
      if (style.layout.cardLayout !== undefined && !['stacked','horizontal','grid','list'].includes(style.layout.cardLayout)) errors.push(`${path}.layout.cardLayout is invalid.`);
      for (const key of ['columnGapPx','rowGapPx']) if (!integer(style.layout[key], 0, 128)) errors.push(`${path}.${key} must be 0–128px.`);
    }
    if (keys(style.image, ['sizePx','radiusPx'], `${path}.image`, errors)) {
      if (!integer(style.image.sizePx, 1, 1024) || !integer(style.image.radiusPx, 0, 1024)) errors.push(`${path} invalid image dimensions.`);
    }
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
