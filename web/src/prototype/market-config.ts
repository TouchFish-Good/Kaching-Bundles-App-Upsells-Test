import type { MarketOverride } from "./model";

export type StoreMarket = {
  id: string;
  name: string;
  enabled: boolean;
  currencyCode: string | null;
  regionCurrencyCodes: string[];
  specifiedAmountSupported: boolean;
  primary: boolean;
  defaultLocale: string | null;
  regionCodes: string[];
  autoExchangeRate: boolean;
  exchangeRate: number | null;
};
export type MarketsResponse = { markets: StoreMarket[]; shopCurrencyCode: string };

export function setMarketOverrideMode(current: Record<string, MarketOverride>, id: string, mode: MarketOverride["mode"], currencyCode: string): Record<string, MarketOverride> {
  return { ...current, [id]: mode === "auto_convert" ? { mode } : { mode, currencyCode } };
}

export function validateMarketOverrides(overrides: Record<string, MarketOverride> = {}): string {
  for (const [marketId, override] of Object.entries(overrides)) {
    if (override.mode === "specified_amount" && (!Number.isSafeInteger(override.amountMinor) || (override.amountMinor ?? -1) < 0)) return `Market amount is required for ${marketId}.`;
  }
  return "";
}
