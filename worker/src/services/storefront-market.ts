import { withFreshAccessToken } from '../auth/session';
import type { AuthContext } from '../auth/session';
import type { Env } from '../env';
import { shoplineAdminHeaders } from './shopline-admin-request-headers';

const VERSION = 'v20260901';
const CACHE_TTL_MS = 5 * 60 * 1000;
type MarketRecord = { id: string; name: string | null; currencyCode: string | null; enabled: boolean; regions: string[] };
type CacheEntry = { expiresAt: number; markets: MarketRecord[] };

const cache = new Map<string, CacheEntry>();

function country(value: string | undefined): string | null {
  const normalized = String(value || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) ? normalized : null;
}

function marketsFromPayload(payload: unknown): MarketRecord[] {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { markets?: unknown }).markets)) throw new Error('SHOPLINE markets response is invalid.');
  return (payload as { markets: unknown[] }).markets.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return [];
    const source = raw as { market_id?: unknown; id?: unknown; market_name?: unknown; name?: unknown; currency_settings?: unknown; currency_code?: unknown; enabled?: unknown; regions?: unknown };
    const id = String(source.market_id ?? source.id ?? '');
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return [];
    const name = typeof source.market_name === 'string' ? source.market_name.trim() : typeof source.name === 'string' ? source.name.trim() : '';
    const nestedCurrency = source.currency_settings && typeof source.currency_settings === 'object'
      ? ((source.currency_settings as { base_currency?: { currency_code?: unknown } }).base_currency?.currency_code) : undefined;
    const currency = typeof nestedCurrency === 'string' ? nestedCurrency.trim().toUpperCase() : typeof source.currency_code === 'string' ? source.currency_code.trim().toUpperCase() : '';
    const regions = Array.isArray(source.regions)
      ? source.regions.flatMap((region) => region && typeof region === 'object' && typeof (region as { code?: unknown }).code === 'string'
        ? [String((region as { code: string }).code).trim().toUpperCase()] : [])
      : [];
    return [{ id, name: name || null, currencyCode: /^[A-Z]{3}$/.test(currency) ? currency : null, enabled: source.enabled === true, regions }];
  });
}

async function loadMarkets(shopHandle: string, env: Env): Promise<MarketRecord[]> {
  const existing = cache.get(shopHandle);
  const now = env.now?.() ?? Date.now();
  if (existing && existing.expiresAt > now) return existing.markets;
  const session = await withFreshAccessToken(shopHandle, env);
  const response = await fetch(`https://${shopHandle}.myshopline.com/admin/openapi/${VERSION}/markets.json?limit=100`, {
    headers: shoplineAdminHeaders(session.accessToken),
  });
  if (!response.ok) throw new Error(`SHOPLINE markets request failed: ${response.status}`);
  const markets = marketsFromPayload(await response.json());
  cache.set(shopHandle, { expiresAt: now + CACHE_TTL_MS, markets });
  return markets;
}

export async function resolveStorefrontMarketId(shopHandle: string, countryCode: string | undefined, env: Env): Promise<string | undefined> {
  const normalized = country(countryCode);
  if (!normalized) return undefined;
  try {
    const markets = await loadMarkets(shopHandle, env);
    return markets.find((market) => market.enabled && market.regions.includes(normalized))?.id;
  } catch {
    return undefined;
  }
}

export async function resolveCampaignMarketMetadata(session: AuthContext, marketIds: string[], env: Env): Promise<Array<{ marketId: string; marketName: string | null; currencyCode: string | null }>> {
  const ids = [...new Set(marketIds.filter((marketId) => /^[A-Za-z0-9_-]{1,128}$/.test(marketId)))];
  if (!ids.length) return [];
  const markets = await loadMarkets(session.handle, env);
  const byId = new Map(markets.map((market) => [market.id, market]));
  return ids.map((marketId) => {
    const market = byId.get(marketId);
    return { marketId, marketName: market?.name ?? null, currencyCode: market?.currencyCode ?? null };
  });
}

