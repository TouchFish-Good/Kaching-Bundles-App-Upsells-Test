import fetch from 'node-fetch';
import { ADMIN_REST_VERSION } from './admin-rest-version';
import { SHOPLINE_ACCEPT, SHOPLINE_USER_AGENT } from './admin-request-headers';

type Fetcher = typeof fetch;
type RawMarket = {
  market_id: string;
  market_name: string;
  enabled: boolean;
  currency_settings?: { base_currency?: { currency_code?: string } };
  regions?: { currency?: { currency_code?: string } }[];
};

export type StoreMarket = {
  id: string;
  name: string;
  enabled: boolean;
  currencyCode: string | null;
  regionCurrencyCodes: string[];
  specifiedAmountSupported: boolean;
};

function nextPageInfo(link: string | null): string | null {
  if (!link) return null;
  const next = link.split(',').find((part) => /rel="?next"?/.test(part));
  const match = next?.match(/<([^>]+)>/);
  return match ? new URL(match[1]).searchParams.get('page_info') : null;
}

export async function loadMarkets(handle: string, accessToken: string, fetcher: Fetcher = fetch, requestId?: string): Promise<{ markets: StoreMarket[]; shopCurrencyCode: string }> {
  if (!/^[a-zA-Z0-9-]+$/.test(handle) || !accessToken) throw new Error('Authenticated SHOPLINE session is required.');
  const base = `https://${handle}.myshopline.com/admin/openapi/${ADMIN_REST_VERSION}`;
  const options = { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=utf-8', Accept: SHOPLINE_ACCEPT, 'User-Agent': SHOPLINE_USER_AGENT } };
  const getJson = async (path: string) => {
    const endpoint = new URL(path, 'https://diagnostic.invalid').pathname;
    if (requestId) console.info('SHOPLINE Admin REST trace', { requestId, stage: 'upstream_request', method: 'GET', endpoint, version: ADMIN_REST_VERSION });
    const startedAt = Date.now();
    let response;
    try { response = await fetcher(`${base}${path}`, options); }
    catch (error) {
      if (requestId) console.error('SHOPLINE Admin REST trace', { requestId, stage: 'upstream_network_error', endpoint, durationMs: Date.now() - startedAt, errorType: error instanceof Error ? error.name : 'Unknown' });
      throw error;
    }
    if (requestId) {
      const rawTraceId = ['traceId', 'x-trace-id', 'x-shopline-trace-id'].map((name) => response.headers?.get(name)).find(Boolean);
      const traceId = rawTraceId && /^[A-Za-z0-9._:-]{1,128}$/.test(rawTraceId) ? rawTraceId : null;
      console.info('SHOPLINE Admin REST trace', { requestId, stage: 'upstream_response', endpoint, status: response.status, durationMs: Date.now() - startedAt, traceId });
    }
    if (!response.ok) throw new Error(`SHOPLINE Admin API ${path} returned ${response.status}.`);
    return { body: await response.json() as any, link: response.headers?.get('link') ?? null };
  };
  const settlement = await getJson('/currency/currencies.json');
  const enabledCurrencies = Array.isArray(settlement.body?.currencies)
    ? settlement.body.currencies.filter((item: { enabled?: unknown }) => item?.enabled === true)
    : [];
  const shopCurrencyCode = enabledCurrencies.length === 1 ? enabledCurrencies[0].currency : null;
  if (!/^[A-Z]{3}$/.test(shopCurrencyCode ?? '')) throw new Error('SHOPLINE settlement currency cannot be determined uniquely.');
  const markets: StoreMarket[] = [];
  const seenIds = new Set<string>();
  const seenPages = new Set<string>();
  let pageInfo: string | null = null;
  do {
    const page = await getJson(`/markets.json?limit=100${pageInfo ? `&page_info=${encodeURIComponent(pageInfo)}` : ''}`);
    if (!Array.isArray(page.body?.markets)) throw new Error('SHOPLINE markets response is invalid.');
    for (const raw of page.body.markets as RawMarket[]) {
      const baseCurrency = raw.currency_settings?.base_currency?.currency_code;
      if (!raw.market_id || !/^[A-Z]{3}$/.test(baseCurrency ?? '')) throw new Error(`Market ${raw.market_id ?? '(unknown)'} has no valid currency.`);
      if (seenIds.has(raw.market_id)) throw new Error(`Duplicate market ID: ${raw.market_id}.`);
      seenIds.add(raw.market_id);
      const regionCurrencyCodes = [...new Set((raw.regions ?? []).map((region) => region.currency?.currency_code).filter((code): code is string => Boolean(code)))];
      const specifiedAmountSupported = regionCurrencyCodes.length === 1 && regionCurrencyCodes[0] === baseCurrency;
      markets.push({ id: raw.market_id, name: raw.market_name, enabled: raw.enabled === true, currencyCode: specifiedAmountSupported ? baseCurrency : null, regionCurrencyCodes, specifiedAmountSupported });
    }
    pageInfo = nextPageInfo(page.link);
    if (pageInfo) {
      if (seenPages.has(pageInfo)) throw new Error('SHOPLINE markets pagination loop detected.');
      seenPages.add(pageInfo);
    }
  } while (pageInfo);
  return { markets, shopCurrencyCode };
}
