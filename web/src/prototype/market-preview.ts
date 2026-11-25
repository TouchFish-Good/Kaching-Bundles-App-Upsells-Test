import type { Tier } from './model';
import type { StoreMarket } from './market-config';
import { minorUnits } from './money';

const fixedTypes = new Set<Tier['discountType']>(['fixed_amount', 'fixed_price', 'bundle_fixed_amount', 'bundle_fixed_price']);

export function selectPreviewMarket(markets: StoreMarket[]): StoreMarket | undefined {
  return markets.find((market) => market.enabled && market.primary)
    ?? markets.find((market) => market.enabled)
    ?? markets[0];
}

type PreviewMarket = Pick<StoreMarket, 'primary' | 'autoExchangeRate' | 'exchangeRate'> & { shopCurrencyCode?: string; marketCurrencyCode?: string };

function fixedRateAmount(amountMinor: number, market: PreviewMarket): number | null {
  if (market.autoExchangeRate || !Number.isFinite(market.exchangeRate) || (market.exchangeRate ?? 0) <= 0 || !market.shopCurrencyCode || !market.marketCurrencyCode) return null;
  try {
    const minor = Math.round(amountMinor * market.exchangeRate! * 10 ** (minorUnits(market.marketCurrencyCode) - minorUnits(market.shopCurrencyCode)));
    return Number.isSafeInteger(minor) && minor >= 0 ? minor : null;
  } catch { return null; }
}

export function resolveMarketPreviewTier(tier: Tier, marketId: string, market?: PreviewMarket): { status: 'ready' | 'auto_convert' | 'unavailable'; tier: Tier } {
  if (!fixedTypes.has(tier.discountType ?? 'percentage')) return { status: 'ready', tier };
  const override = tier.marketOverrides?.[marketId];
  if (override?.mode === 'specified_amount') {
    if (!Number.isSafeInteger(override.amountMinor) || (override.amountMinor ?? -1) < 0) return { status: 'unavailable', tier };
    return { status: 'ready', tier: { ...tier, discountValue: override.amountMinor } };
  }
  if (market?.primary) return { status: 'ready', tier };
  const convertedAmount = Number.isSafeInteger(tier.discountValue) ? fixedRateAmount(tier.discountValue!, market ?? { primary: false, autoExchangeRate: true, exchangeRate: null }) : null;
  return { status: 'auto_convert', tier: convertedAmount === null ? tier : { ...tier, discountValue: convertedAmount } };
}
