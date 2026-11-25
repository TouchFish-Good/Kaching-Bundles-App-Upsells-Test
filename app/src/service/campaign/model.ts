import type { OfferModuleConfig } from '../../../../shared/offer-core.cjs';
export type { OfferModuleKind, OfferModuleConfig, OfferRule, OfferDeviceStyle, OfferTrigger, OfferMarketOverride, OfferFunctionRule, OfferFunctionModule } from '../../../../shared/offer-core.cjs';
import type { CampaignWidgetConfig } from './widget-config';

export type CampaignStatus = 'draft' | 'active' | 'scheduled' | 'paused' | 'ended';
export type CampaignScope = {
  kind: 'all' | 'products' | 'collections';
  productIds?: string[];
  collectionIds?: string[];
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
  status: CampaignStatus;
  startsAt?: string;
  endsAt?: string;
  timeZone?: string;
  scope: CampaignScope;
  tiers: CampaignTier[];
  combinesWith: { orderDiscounts: boolean; productDiscounts: boolean; shippingDiscounts: boolean };
  widget?: CampaignWidgetConfig;
  gifts?: OfferModuleConfig;
  bundles?: OfferModuleConfig;
};
export type Campaign = CampaignDraft & { revision: number; updatedAt: string };
