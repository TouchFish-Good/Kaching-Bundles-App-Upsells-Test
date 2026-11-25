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
    allowMixedVariants: boolean; showSelectors: boolean;
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
    allowMixedVariants: true, showSelectors: true, selectorStyle: 'dropdown', imageSizePx: 48,
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
    for (const key of ['allowMixedVariants', 'showSelectors', 'showImageColorValue']) if (typeof variants[key] !== 'boolean') errors.push(`${key} must be boolean.`);
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
    mobile: object(raw.mobile) ? { ...raw.mobile, showTierSavingsBadge: raw.mobile.showTierSavingsBadge ?? defaults.showTierSavingsBadge, card: object(raw.mobile.card) ? { ...defaults.card, ...raw.mobile.card } : raw.mobile.card, colors: object(raw.mobile.colors) ? { ...defaults.colors, ...raw.mobile.colors } : raw.mobile.colors,
      typography: object(raw.mobile.typography) ? { ...defaults.typography, ...raw.mobile.typography } : raw.mobile.typography } : raw.mobile } : raw;
  const errors = validateCampaignWidgetConfig(candidate);
  if (errors.length) throw new Error(errors.join(' '));
  return structuredClone(candidate as CampaignWidgetConfig);
}
