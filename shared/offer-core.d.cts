export type OfferModuleKind = 'gifts' | 'bundles';
export type OfferMarketOverride = { mode: 'auto_convert' } | { mode: 'specified_amount'; currencyCode: string; amountMinor: number };
export type OfferTrigger = { type: 'tiers'; tierIds: string[] } | { type: 'quantity'; operator: 'gt' | 'gte' | 'eq'; quantity: number };
export type OfferRule = {
  ruleId: string; displayOrder: number; productId: string; allowedVariantIds: string[]; quantity: number;
  label: string; labelPosition: 'corner' | 'below_title'; showImage: boolean;
  discountType: 'fixed_amount' | 'fixed_price' | 'percentage'; discountValue: number;
  marketOverrides?: Record<string, OfferMarketOverride>; trigger: OfferTrigger;
};
export type OfferLayout = { mode: 'grid' | 'carousel'; columns: 1 | 2 | 3; columnGapPx: number; rowGapPx: number };
export type OfferDeviceStyle = {
  layout: OfferLayout; image: { sizePx: number; radiusPx: number };
  colors?: Record<string, string>; typography?: Record<string, { sizePx: number; weight: number }>;
};
export type OfferModuleConfig = {
  version: 1; enabled: boolean; selectionMode: 'all_eligible' | 'single' | 'multiple';
  quantityMode: 'fixed'; quotaScope: 'main_product'; items: OfferRule[];
  style: { desktop: OfferDeviceStyle; mobile: OfferDeviceStyle };
};
export type OfferTier = { tierId: string; quantity: number; displayOrder?: number };
export type OfferMainProduct = { productId: string; quantity: number };
export type OfferFunctionRule = Omit<OfferRule, 'label' | 'labelPosition' | 'showImage' | 'marketOverrides'> & { marketOverrides?: Record<string, { mode: 'auto_convert' } | { mode: 'specified_amount'; currencyCode: string; currencyDecimals: number; amountMinor: number }> };
export type OfferFunctionModule = Omit<OfferModuleConfig, 'style' | 'items'> & { items: OfferFunctionRule[] };
export function defaultOfferModule(kind: OfferModuleKind): OfferModuleConfig;
export function normalizeOfferModule(raw: unknown, kind: OfferModuleKind): OfferModuleConfig;
export function validateOfferModule(raw: unknown, kind: OfferModuleKind, tiers?: readonly OfferTier[]): string[];
export function offerEligible(rule: Pick<OfferRule, 'trigger'>, tiers: readonly OfferTier[], mainQuantity: number): boolean;
export function offerUnlockTier<T extends OfferTier>(rule: Pick<OfferRule, 'trigger'>, tiers: readonly T[]): T | undefined;
export function offerQuota(rule: Pick<OfferRule, 'trigger' | 'quantity' | 'productId'>, tiers: readonly OfferTier[], mainProducts: readonly OfferMainProduct[]): number;
/** Per-unit savings. Unknown prices or unresolved auto-conversion return zero. */
export function offerDiscountMinor(unitPrice: number, rule: Pick<OfferRule, 'discountType' | 'discountValue'>, override?: OfferMarketOverride): number;
export function effectiveOfferColumns(width: number, layout: OfferLayout): 1 | 2 | 3;
