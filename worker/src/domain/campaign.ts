export type WidgetTypography = { sizePx: number; weight: number };
export type CampaignWidgetConfig = {
  version: 1;
  layout: 'stacked' | 'horizontal' | 'grid' | 'list';
  badgePosition: 'corner' | 'below_subtitle';
  card: { radiusPx: number; gapPx: number; tierSavingsBadgeRadiusPx: number };
  colors: {
    card: string; selected: string; cardBorder: string; border: string; sectionTitle: string; title: string;
    subtitle: string; price: string; comparePrice: string; badgeBackground: string; badgeText: string;
    variantTitle: string; variantValue: string; variantPrice: string; variantOriginalPrice: string; slotNumber: string;
    variantBorder: string; variantBackground: string; variantSelectedBorder: string; variantSelectedBackground: string; variantSelectedText: string; status: string; addButtonBackground: string;
    addButtonText: string; addButtonBorder: string; savingsLabel: string; savingsPrice: string; cartLine: string;
    summaryLabel: string; summaryAmount: string; tierSavingsBadgeText: string; tierSavingsBadgeBackground: string;
  };
  typography: {
    bodyPx: number; sectionTitle: WidgetTypography; title: WidgetTypography;
    subtitle: WidgetTypography; price: WidgetTypography; comparePrice: WidgetTypography;
    badge: WidgetTypography; addButton: WidgetTypography; variantTitle: WidgetTypography;
    variantValue: WidgetTypography; variantPrice: WidgetTypography; variantOriginalPrice: WidgetTypography; slotNumber: WidgetTypography;
    savingsLabel: WidgetTypography; savingsPrice: WidgetTypography; cartLine: WidgetTypography;
    summaryLabel: WidgetTypography; summaryAmount: WidgetTypography; checkoutNote: WidgetTypography; status: WidgetTypography; tierSavingsBadge: WidgetTypography;
  };
  variants: {
    showSelectors: boolean;
    selectorStyle: 'dropdown' | 'image' | 'text' | 'swatch';
    imageSizePx: number; imageRadiusPx: number; showImageColorValue: boolean;
    defaultSelection: 'first_available' | 'none';
  };
  showCartVariantDetails: boolean;
  showPriceSummary: boolean;
  showTierSavingsBadge: boolean;
  mobile?: Omit<CampaignWidgetConfig, 'version' | 'mobile'>;
};

const defaults: CampaignWidgetConfig = {
  version: 1,
  layout: 'stacked',
  badgePosition: 'corner',
  card: { radiusPx: 9, gapPx: 8, tierSavingsBadgeRadiusPx: 50 },
  colors: {
    card: '#F7F7F7', selected: '#FFFFFF', cardBorder: '#D4D4D4', border: '#171717', sectionTitle: '#171717',
    title: '#171717', subtitle: '#555555', price: '#171717', comparePrice: '#666666',
    badgeBackground: '#171717', badgeText: '#FFFFFF', variantTitle: '#626262',
    variantValue: '#262626', variantPrice: '#6D6D6D', variantOriginalPrice: '#8A8A8A', slotNumber: '#262626',
    variantBorder: '#C6C6C6', variantBackground: '#FFFFFF', variantSelectedBorder: '#171717', variantSelectedBackground: '#FFFFFF', variantSelectedText: '#171717', status: '#52615C',
    addButtonBackground: '#171717', addButtonText: '#FFFFFF', addButtonBorder: '#171717',
    savingsLabel: '#A13D29', savingsPrice: '#A13D29', cartLine: '#52615C',
    summaryLabel: '#666666', summaryAmount: '#171717', tierSavingsBadgeText: '#FFFFFF', tierSavingsBadgeBackground: '#171717',
  },
  typography: {
    bodyPx: 14, sectionTitle: { sizePx: 14, weight: 700 }, title: { sizePx: 14, weight: 700 },
    subtitle: { sizePx: 12, weight: 400 }, price: { sizePx: 14, weight: 700 },
    comparePrice: { sizePx: 11, weight: 600 }, badge: { sizePx: 12, weight: 600 },
    addButton: { sizePx: 14, weight: 700 },
    variantTitle: { sizePx: 11, weight: 700 }, variantValue: { sizePx: 12, weight: 700 },
    variantPrice: { sizePx: 11, weight: 700 }, variantOriginalPrice: { sizePx: 11, weight: 600 }, slotNumber: { sizePx: 11, weight: 800 },
    savingsLabel: { sizePx: 11, weight: 400 }, savingsPrice: { sizePx: 11, weight: 700 }, cartLine: { sizePx: 11, weight: 400 },
    summaryLabel: { sizePx: 11, weight: 400 }, summaryAmount: { sizePx: 11, weight: 700 },
    checkoutNote: { sizePx: 10, weight: 400 }, status: { sizePx: 12, weight: 400 }, tierSavingsBadge: { sizePx: 12, weight: 600 },
  },
  variants: {
    showSelectors: true, selectorStyle: 'dropdown', imageSizePx: 48,
    imageRadiusPx: 6, showImageColorValue: true, defaultSelection: 'first_available',
  },
  showCartVariantDetails: true,
  showPriceSummary: true,
  showTierSavingsBadge: false,
};

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function checkKeys(value: unknown, keys: readonly string[], path: string, errors: string[], optional: readonly string[] = []): value is Record<string, unknown> {
  if (!object(value)) { errors.push(`${path} must be an object.`); return false; }
  for (const key of Object.keys(value)) if (!keys.includes(key)) errors.push(`Unknown ${path}.${key}.`);
  for (const key of keys) if (!(key in value) && !optional.includes(key)) errors.push(`${path}.${key} is required.`);
  return true;
}
function checkFontSize(value: unknown, name: string, errors: string[]): void {
  if (!Number.isInteger(value) || (value as number) <= 0) errors.push(`${name} must be a positive integer in px.`);
}
function checkInteger(value: unknown, min: number, max: number, name: string, errors: string[]): void {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) errors.push(`${name} must be ${min}–${max}px.`);
}

function migrateLegacyVisibility(value: unknown): unknown {
  if (!object(value)) return value;
  const migrated = { ...value } as Record<string, unknown>;
  if (typeof migrated.showOriginalAndDiscountedPrice === 'boolean') {
    migrated.showCartVariantDetails ??= migrated.showOriginalAndDiscountedPrice;
    migrated.showPriceSummary ??= migrated.showOriginalAndDiscountedPrice;
    delete migrated.showOriginalAndDiscountedPrice;
  }
  migrated.showTierSavingsBadge ??= defaults.showTierSavingsBadge;
  if (object(migrated.mobile)) migrated.mobile = migrateLegacyVisibility(migrated.mobile);
  return migrated;
}

export function defaultCampaignWidgetConfig(): CampaignWidgetConfig {
  return structuredClone(defaults);
}

export function validateCampaignWidgetConfig(raw: unknown): string[] {
  const errors: string[] = [];
  raw = migrateLegacyVisibility(raw);
  if (object(raw) && raw.badgePosition === undefined) raw = { ...raw, badgePosition: defaults.badgePosition };
  if (!checkKeys(raw, ['version', 'layout', 'badgePosition', 'card', 'colors', 'typography', 'variants', 'showCartVariantDetails', 'showPriceSummary', 'showTierSavingsBadge', 'mobile'], 'widget', errors, ['mobile'])) return errors;
  if (raw.version !== 1) errors.push('Unsupported widget version.');
  if (!['stacked', 'horizontal', 'grid', 'list'].includes(raw.layout as string)) errors.push('Unknown widget layout.');
  if (!['corner', 'below_subtitle'].includes(raw.badgePosition as string)) errors.push('Unknown badge position.');
  if (typeof raw.showCartVariantDetails !== 'boolean') errors.push('showCartVariantDetails must be boolean.');
  if (typeof raw.showPriceSummary !== 'boolean') errors.push('showPriceSummary must be boolean.');
  if (typeof raw.showTierSavingsBadge !== 'boolean') errors.push('showTierSavingsBadge must be boolean.');

  if (checkKeys(raw.card, ['radiusPx', 'gapPx', 'tierSavingsBadgeRadiusPx'], 'widget.card', errors)) {
    checkInteger(raw.card.radiusPx, 0, 24, 'Card radius', errors);
    checkInteger(raw.card.gapPx, 0, 32, 'Card gap', errors);
    checkInteger(raw.card.tierSavingsBadgeRadiusPx, 0, 50, 'Tier savings badge radius', errors);
  }
  const colorKeys = Object.keys(defaults.colors);
  const colors = object(raw.colors) ? { ...defaults.colors, ...raw.colors } : raw.colors;
  if (checkKeys(colors, colorKeys, 'widget.colors', errors)) {
    for (const key of colorKeys) if (typeof colors[key] !== 'string' || !/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(colors[key] as string)) errors.push(`${key} color must be #RRGGBB or #RRGGBBAA.`);
  }
  const typeKeys = Object.keys(defaults.typography);
  const typography = object(raw.typography) ? { ...defaults.typography, ...raw.typography } : raw.typography;
  if (checkKeys(typography, typeKeys, 'widget.typography', errors)) {
    checkFontSize(typography.bodyPx, 'Body size', errors);
    for (const key of typeKeys.slice(1)) {
      const item = typography[key];
      if (!checkKeys(item, ['sizePx', 'weight'], `widget.typography.${key}`, errors)) continue;
      checkFontSize(item.sizePx, `${key} size`, errors);
      if (!Number.isInteger(item.weight) || (item.weight as number) < 100 || (item.weight as number) > 900 || (item.weight as number) % 100 !== 0) errors.push(`${key} weight is invalid.`);
    }
  }
  if (checkKeys(raw.variants, Object.keys(defaults.variants), 'widget.variants', errors)) {
    const variants = raw.variants;
    for (const key of ['showSelectors', 'showImageColorValue']) if (typeof variants[key] !== 'boolean') errors.push(`${key} must be boolean.`);
    if (!['dropdown', 'image', 'text', 'swatch'].includes(variants.selectorStyle as string)) errors.push('Unknown selector style.');
    if (!['first_available', 'none'].includes(variants.defaultSelection as string)) errors.push('Unknown default selection.');
    checkInteger(variants.imageSizePx, 10, 96, 'Image size', errors);
    checkInteger(variants.imageRadiusPx, 0, 24, 'Image radius', errors);
  }
  if (raw.mobile !== undefined) {
    if (!object(raw.mobile)) { errors.push('widget.mobile must be an object.'); return errors; }
    const mobile = { version: 1, ...(raw.mobile as Record<string, unknown>) };
    const mobileErrors = validateCampaignWidgetConfig(mobile);
    for (const error of mobileErrors) errors.push(`widget.mobile.${error}`);
  }
  return errors;
}

export function normalizeCampaignWidgetConfig(raw: unknown): CampaignWidgetConfig {
  if (raw === undefined) return defaultCampaignWidgetConfig();
  const candidate = object(raw) ? { ...raw, badgePosition: raw.badgePosition ?? defaults.badgePosition, showTierSavingsBadge: raw.showTierSavingsBadge ?? defaults.showTierSavingsBadge,
    card: object(raw.card) ? { ...defaults.card, ...raw.card } : raw.card,
    colors: object(raw.colors) ? { ...defaults.colors, ...raw.colors } : raw.colors,
    typography: object(raw.typography) ? { ...defaults.typography, ...raw.typography } : raw,
    variants: object(raw.variants) ? Object.fromEntries(Object.entries(raw.variants).filter(([key]) => key !== 'allowMixedVariants')) : raw.variants,
    mobile: object(raw.mobile) ? { ...raw.mobile, showTierSavingsBadge: raw.mobile.showTierSavingsBadge ?? defaults.showTierSavingsBadge, card: object(raw.mobile.card) ? { ...defaults.card, ...raw.mobile.card } : raw.mobile.card, colors: object(raw.mobile.colors) ? { ...defaults.colors, ...raw.mobile.colors } : raw.mobile.colors,
      typography: object(raw.mobile.typography) ? { ...defaults.typography, ...raw.mobile.typography } : raw.mobile.typography,
      variants: object(raw.mobile.variants) ? Object.fromEntries(Object.entries(raw.mobile.variants).filter(([key]) => key !== 'allowMixedVariants')) : raw.mobile.variants } : raw.mobile } : raw;
  const errors = validateCampaignWidgetConfig(candidate);
  if (errors.length) throw new Error(errors.join(' '));
  return structuredClone(candidate as CampaignWidgetConfig);
}

export type CampaignStatus = 'draft' | 'active' | 'scheduled' | 'paused' | 'ended';
export type CampaignScope = {
  kind: 'all' | 'products' | 'collections';
  productIds?: string[];
  productHandles?: Record<string, string>;
  collectionIds?: string[];
  collectionHandles?: Record<string, string>;
  resolvedProductIds?: string[];
  excludedProductIds: string[];
};
export type MarketOverride = { mode: 'auto_convert' } | {
  mode: 'specified_amount'; currencyCode: string; amountMinor: number;
};
export type CampaignTier = {
  tierId: string;
  displayOrder: number;
  quantity: number;
  discountType: 'none' | 'percentage' | 'fixed_amount' | 'fixed_price' | 'bundle_fixed_amount' | 'bundle_fixed_price';
  discountValue?: number;
  marketOverrides?: Record<string, MarketOverride>;
  recommended?: boolean;
  label?: string;
  subtitle?: string;
  tag?: string;
};
export type CampaignDraft = {
  id: string;
  name: string;
  discountName?: string;
  status: CampaignStatus;
  startsAt?: string;
  endsAt?: string;
  neverExpires?: boolean;
  timeZone?: string;
  scope: CampaignScope;
  tiers: CampaignTier[];
  combinesWith: { orderDiscounts: boolean; productDiscounts: boolean; shippingDiscounts: boolean };
  widget?: CampaignWidgetConfig;
  pauseReason?: 'subscription_expired' | 'platform_missing';
};
export type Campaign = CampaignDraft & { revision: number; updatedAt: string };

// An explicit activation restarts a campaign after confirmed expiration.
// Keep the recorded end time until that publication succeeds.
export function campaignForActivation<T extends CampaignDraft>(campaign: T): T {
  return campaign.pauseReason === 'subscription_expired' || (campaign.status === 'paused' && Boolean(campaign.endsAt))
    ? { ...campaign, endsAt: undefined, neverExpires: true, pauseReason: undefined }
    : campaign;
}

export function campaignWithConfirmedEnd<T extends CampaignDraft>(campaign: T, confirmedAt: string, platformEndsAt?: string): T {
  const validPast = (value?: string) => Boolean(value) && Number.isFinite(Date.parse(value!)) && Date.parse(value!) <= Date.parse(confirmedAt);
  const endsAt = validPast(platformEndsAt) ? new Date(platformEndsAt!).toISOString()
    : validPast(campaign.endsAt) ? campaign.endsAt! : confirmedAt;
  return { ...campaign, endsAt, neverExpires: false };
}

export function resolvedDiscountName(campaign: Pick<CampaignDraft, 'name' | 'discountName'>): string {
  return campaign.discountName?.trim() || campaign.name;
}

const nonEmptyIds = (value: unknown): value is string[] => Array.isArray(value) && value.every((id) => typeof id === 'string' && id.trim().length > 0);
const unique = (values: string[]) => new Set(values).size === values.length;
const live = (status: string) => status === 'active' || status === 'scheduled';

function hasExactHandleSnapshot(value: unknown, ids: string[] | undefined): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !ids?.length) return false;
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.length === ids.length
    && ids.every((id) => Object.prototype.hasOwnProperty.call(value, id))
    && entries.every(([id, handle]) => ids.includes(id) && typeof handle === 'string' && handle.trim().length > 0 && handle.length <= 255);
}

export function validateCampaign(value: CampaignDraft): string[] {
  const errors: string[] = [];
  if (!value || typeof value !== 'object') return ['Campaign must be an object.'];
  if (typeof value.id !== 'string' || !value.id.trim()) errors.push('Campaign id is required.');
  if (typeof value.name !== 'string' || !value.name.trim()) errors.push('Campaign name is required.');
  if (value.discountName !== undefined && (typeof value.discountName !== 'string' || !value.discountName.trim())) errors.push('Discount name must not be empty.');
  if (!['draft', 'active', 'scheduled', 'paused', 'ended'].includes(value.status)) errors.push('Unknown campaign status.');
  const scope = value.scope;
  if (!scope || !['all', 'products', 'collections'].includes(scope.kind)) errors.push('Valid product scope is required.');
  else {
    if (!nonEmptyIds(scope.excludedProductIds) || !unique(scope.excludedProductIds)) errors.push('excludedProductIds must contain unique IDs.');
    if (scope.kind === 'products' && (!nonEmptyIds(scope.productIds) || !scope.productIds.length || !unique(scope.productIds))) errors.push('productIds must contain unique IDs.');
    if (scope.kind === 'collections' && (!nonEmptyIds(scope.collectionIds) || !scope.collectionIds.length || !unique(scope.collectionIds))) errors.push('collectionIds must contain unique IDs.');
    if (scope.productHandles !== undefined && !hasExactHandleSnapshot(scope.productHandles, scope.productIds)) errors.push('productHandles must contain one non-empty handle for every selected product.');
    if (scope.collectionHandles !== undefined && !hasExactHandleSnapshot(scope.collectionHandles, scope.collectionIds)) errors.push('collectionHandles must contain one non-empty handle for every selected collection.');
    if (live(value.status) && scope.kind === 'collections' && (!nonEmptyIds(scope.resolvedProductIds) || !scope.resolvedProductIds.length)) errors.push('Active collection scope needs resolvedProductIds.');
  }
  if (!Array.isArray(value.tiers) || !value.tiers.length) errors.push('At least one tier is required.');
  else {
    const quantities = new Set<number>();
    const tierIds = new Set<string>();
    const orders = new Set<number>();
    const marketCurrencies = new Map<string, string>();
    for (const tier of value.tiers) {
      if (!tier || typeof tier.tierId !== 'string' || !tier.tierId.trim() || tierIds.has(tier.tierId)) errors.push('Tier IDs must be unique.');
      else tierIds.add(tier.tierId);
      if (!Number.isInteger(tier.displayOrder) || tier.displayOrder < 0 || orders.has(tier.displayOrder)) errors.push('displayOrder must be a unique non-negative integer.');
      else orders.add(tier.displayOrder);
      if (!Number.isInteger(tier.quantity) || tier.quantity < 1) errors.push('Tier quantity must be a positive integer.');
      else if (quantities.has(tier.quantity)) errors.push('Tier quantities must be unique.');
      else quantities.add(tier.quantity);
      if (!['none', 'percentage', 'fixed_amount', 'fixed_price', 'bundle_fixed_amount', 'bundle_fixed_price'].includes(tier.discountType)) errors.push('Unknown discount type.');
      if (tier.discountType === 'none' && tier.discountValue !== undefined) errors.push('Original-price tier cannot have a discount value.');
      if (tier.discountType !== 'none' && (!Number.isInteger(tier.discountValue) || (tier.discountValue as number) < 0)) errors.push('Discount value must be a non-negative integer.');
      if (tier.discountType === 'percentage' && (tier.discountValue as number) > 10000) errors.push('Percentage cannot exceed 10000 basis points.');
      for (const [marketId, override] of Object.entries(tier.marketOverrides || {})) {
        if (!marketId.trim() || !override || !['auto_convert', 'specified_amount'].includes(override.mode)) errors.push('Invalid market override.');
        if (override?.mode === 'specified_amount' && (!Number.isInteger(override.amountMinor) || override.amountMinor < 0 || !/^[A-Z]{3}$/.test(override.currencyCode))) errors.push('Market amountMinor and currencyCode are required.');
        if (override?.mode === 'specified_amount') {
          if (!['fixed_amount', 'fixed_price', 'bundle_fixed_amount', 'bundle_fixed_price'].includes(tier.discountType)) errors.push('Specified market amounts require a fixed discount type.');
          const previousCurrency = marketCurrencies.get(marketId);
          if (previousCurrency && previousCurrency !== override.currencyCode) errors.push(`Market ${marketId} must use the same currency in every tier.`);
          marketCurrencies.set(marketId, override.currencyCode);
        }
      }
    }
  }
  if (!value.combinesWith || typeof value.combinesWith.orderDiscounts !== 'boolean' || typeof value.combinesWith.productDiscounts !== 'boolean' || typeof value.combinesWith.shippingDiscounts !== 'boolean') errors.push('Combination choices are required.');
  if (value.widget !== undefined) errors.push(...validateCampaignWidgetConfig(value.widget));
  if (!value.startsAt) errors.push('startsAt is required.');
  else if (Number.isNaN(Date.parse(value.startsAt))) errors.push('Invalid startsAt.');
  if (value.neverExpires !== undefined && typeof value.neverExpires !== 'boolean') errors.push('neverExpires must be boolean.');
  if (value.neverExpires === false && !value.endsAt) errors.push('endsAt is required unless neverExpires is true.');
  if (value.neverExpires === true && value.endsAt) errors.push('endsAt must be omitted when neverExpires is true.');
  if (value.endsAt && Number.isNaN(Date.parse(value.endsAt))) errors.push('Invalid endsAt.');
  if (value.startsAt && value.endsAt && Date.parse(value.endsAt) <= Date.parse(value.startsAt)) errors.push('endsAt must follow startsAt.');
  return errors;
}

export function scopesOverlap(left: CampaignScope, right: CampaignScope): boolean {
  const members = (scope: CampaignScope) => scope.kind === 'products' ? scope.productIds || [] : scope.resolvedProductIds || [];
  const included = (scope: CampaignScope, id: string) => !scope.excludedProductIds.includes(id) && (scope.kind === 'all' || members(scope).includes(id));
  if (left.kind === 'all' && right.kind === 'all') return true;
  if (left.kind === 'all') return members(right).some((id) => included(left, id) && included(right, id));
  if (right.kind === 'all') return members(left).some((id) => included(left, id) && included(right, id));
  return members(left).some((id) => included(left, id) && included(right, id));
}

export function campaignsConflict(left: CampaignDraft, right: CampaignDraft): boolean {
  if (!live(left.status) || !live(right.status)) return false;
  if (left.scope.kind === 'collections' && right.scope.kind === 'collections') {
    return schedulesOverlap(left, right) && (left.scope.collectionIds ?? []).some((id) => (right.scope.collectionIds ?? []).includes(id));
  }
  if (left.scope.kind !== 'products' || right.scope.kind !== 'products') return false;
  return schedulesOverlap(left, right) && scopesOverlap(left.scope, right.scope);
}

function schedulesOverlap(left: CampaignDraft, right: CampaignDraft): boolean {
  const start = Math.max(left.startsAt ? Date.parse(left.startsAt) : -Infinity, right.startsAt ? Date.parse(right.startsAt) : -Infinity);
  const end = Math.min(left.endsAt ? Date.parse(left.endsAt) : Infinity, right.endsAt ? Date.parse(right.endsAt) : Infinity);
  return start < end;
}
