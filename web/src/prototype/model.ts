import type { CampaignWidgetConfig } from './widget-config';

export type CampaignStatus = "Active" | "Scheduled" | "Paused" | "Pausing" | "Starting" | "Draft" | "Ended" | "Unverified";
export type CampaignListStatus = "Active" | "Scheduled" | "Paused" | "Pausing" | "Starting" | "Draft" | "Ended" | "Unverified";
export type WorkspacePage = "dashboard" | "campaigns" | "editor" | "detail" | "widget" | "translations" | "plan" | "feedback";
export type MarketOverride = { mode: "auto_convert" } | { mode: "specified_amount"; amountMinor?: number; currencyCode: string };
export type Tier = { tierId?: string; quantity: number; label: string; subtitle?: string; tag?: string; discountPercent: number; discountType?: "none" | "percentage" | "fixed_amount" | "fixed_price" | "bundle_fixed_amount" | "bundle_fixed_price"; discountValue?: number; marketOverrides?: Record<string, MarketOverride>; recommended?: boolean };
export type Campaign = {
  id: string;
  name: string;
  discountName?: string;
  products: string;
  scope?: { kind: 'all' | 'products' | 'collections'; productIds?: string[]; collectionIds?: string[]; excludedProductIds: string[] };
  tiers: Tier[];
  status: CampaignStatus;
  listStatus?: CampaignListStatus;
  schedule: string;
  startTime?: string;
  endTime?: string;
  updated: string;
  revision?: number;
  startsAt?: string;
  endsAt?: string;
  neverExpires?: boolean;
  timeZone?: string;
  combineOrder?: boolean;
  combineProduct?: boolean;
  combineShipping?: boolean;
  widget?: CampaignWidgetConfig;
  collectionConflict?: { state: 'clear' | 'conflict' | 'unknown'; campaignIds: string[] };
};

export type Variant = {
  id: string;
  options: Record<string, string>;
  price: number;
  compareAtPrice?: number | null;
  inventory: number;
  inventoryPolicy?: "deny" | "continue";
  inventoryTracker?: boolean;
  available: boolean;
  image: string | null;
};

export type SlotSelection = Record<string, string>;
export type Toast = { message: string; tone: "success" | "error" | "notice" } | null;
