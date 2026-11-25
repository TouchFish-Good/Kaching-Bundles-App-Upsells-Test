export type WidgetTypography = { sizePx: number; weight: number };
export type CampaignWidgetStyleConfig = {
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
};
export type CampaignWidgetConfig = CampaignWidgetStyleConfig & { version: 1; mobile?: CampaignWidgetStyleConfig };

const defaults: CampaignWidgetConfig = {
  version: 1,
  layout: 'list',
  badgePosition: 'corner',
  card: { radiusPx: 9, gapPx: 10, tierSavingsBadgeRadiusPx: 5 },
  colors: {
    card: '#EDEDED', selected: '#F9F9F9', cardBorder: '#D4D4D4', border: '#171717', sectionTitle: '#171717',
    title: '#171717', subtitle: '#555555', price: '#171717', comparePrice: '#666666',
    badgeBackground: '#171717', badgeText: '#FFFFFF', variantTitle: '#626262',
    variantValue: '#262626', variantPrice: '#6D6D6D', variantOriginalPrice: '#8A8A8A', slotNumber: '#262626',
    variantBorder: '#E1E1E1', variantBackground: '#FFFFFF', variantSelectedBorder: '#171717', variantSelectedBackground: '#000000', variantSelectedText: '#FFFFFF', status: '#52615C',
    addButtonBackground: '#171717', addButtonText: '#FFFFFF', addButtonBorder: '#171717',
    savingsLabel: '#A13D29', savingsPrice: '#A13D29', cartLine: '#52615C',
    summaryLabel: '#666666', summaryAmount: '#171717', tierSavingsBadgeText: '#FF0000', tierSavingsBadgeBackground: '#EDEDED',
  },
  typography: {
    bodyPx: 14, sectionTitle: { sizePx: 14, weight: 800 }, title: { sizePx: 20, weight: 700 },
    subtitle: { sizePx: 14, weight: 400 }, price: { sizePx: 20, weight: 700},
    comparePrice: { sizePx: 14, weight: 500 }, badge: { sizePx: 12, weight: 700 },
    addButton: { sizePx: 16, weight: 700 },
    variantTitle: { sizePx: 14, weight: 700 }, variantValue: { sizePx: 14, weight: 700 },
    variantPrice: { sizePx: 15, weight: 700 }, variantOriginalPrice: { sizePx: 13, weight: 600 }, slotNumber: { sizePx: 14, weight: 700 },
    savingsLabel: { sizePx: 14, weight: 400 }, savingsPrice: { sizePx: 14, weight: 700 }, cartLine: { sizePx: 14, weight: 400 },
    summaryLabel: { sizePx: 14, weight: 400 }, summaryAmount: { sizePx: 14, weight: 700 },
    checkoutNote: { sizePx: 10, weight: 400 }, status: { sizePx: 12, weight: 400 }, tierSavingsBadge: { sizePx: 14, weight: 700 },
  },
  variants: {
    showSelectors: true, selectorStyle: 'dropdown', imageSizePx: 48,
    imageRadiusPx: 6, showImageColorValue: false, defaultSelection: 'first_available',
  },
  showCartVariantDetails: false,
  showPriceSummary: false,
  showTierSavingsBadge: true,
};

export function defaultCampaignWidgetConfig(): CampaignWidgetConfig {
  return structuredClone(defaults);
}

export function normalizeCampaignWidgetConfig(value: CampaignWidgetConfig): CampaignWidgetConfig {
  const legacyVisibility = value as CampaignWidgetConfig & { showOriginalAndDiscountedPrice?: boolean };
  const visibilityDefaults = legacyVisibility.showOriginalAndDiscountedPrice === false
    ? { showCartVariantDetails: false, showPriceSummary: false }
    : { showCartVariantDetails: true, showPriceSummary: true };
  const normalized = { ...structuredClone(value), badgePosition: value.badgePosition ?? defaults.badgePosition,
    ...visibilityDefaults,
    showCartVariantDetails: value.showCartVariantDetails ?? visibilityDefaults.showCartVariantDetails,
    showPriceSummary: value.showPriceSummary ?? visibilityDefaults.showPriceSummary,
    showTierSavingsBadge: value.showTierSavingsBadge ?? defaults.showTierSavingsBadge,
    card: { ...structuredClone(defaults.card), ...value.card },
    colors: { ...structuredClone(defaults.colors), ...value.colors },
    variants: Object.fromEntries(Object.entries(value.variants).filter(([key]) => key !== 'allowMixedVariants')) as CampaignWidgetConfig['variants'],
    typography: { ...structuredClone(defaults.typography), ...value.typography } };
  const styleCandidate = { ...normalized } as Partial<CampaignWidgetConfig>;
  delete styleCandidate.version;
  delete styleCandidate.mobile;
  const style = styleCandidate as CampaignWidgetStyleConfig;
  const mobileLegacyVisibility = value.mobile as (CampaignWidgetStyleConfig & { showOriginalAndDiscountedPrice?: boolean }) | undefined;
  const mobileVisibilityDefaults = mobileLegacyVisibility?.showOriginalAndDiscountedPrice === false
    ? { showCartVariantDetails: false, showPriceSummary: false }
    : { showCartVariantDetails: true, showPriceSummary: true };
  const mobile = value.mobile ? {
    ...structuredClone(defaults),
    ...structuredClone(value.mobile),
    ...mobileVisibilityDefaults,
    showCartVariantDetails: value.mobile.showCartVariantDetails ?? mobileVisibilityDefaults.showCartVariantDetails,
    showPriceSummary: value.mobile.showPriceSummary ?? mobileVisibilityDefaults.showPriceSummary,
    showTierSavingsBadge: value.mobile.showTierSavingsBadge ?? defaults.showTierSavingsBadge,
    card: { ...structuredClone(defaults.card), ...value.mobile.card },
    colors: { ...structuredClone(defaults.colors), ...value.mobile.colors },
    typography: { ...structuredClone(defaults.typography), ...value.mobile.typography },
    variants: Object.fromEntries(Object.entries(value.mobile.variants).filter(([key]) => key !== 'allowMixedVariants')) as CampaignWidgetConfig['variants'],
  } : structuredClone(style);
  delete (mobile as Partial<CampaignWidgetConfig>).version;
  delete (mobile as Partial<CampaignWidgetConfig>).mobile;
  if (normalized.variants.selectorStyle === 'swatch') normalized.variants.selectorStyle = 'text';
  if (mobile.variants.selectorStyle === 'swatch') mobile.variants.selectorStyle = 'text';
  return { ...normalized, mobile };
}
