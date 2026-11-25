import { env } from 'cloudflare:test';
import { beforeEach, expect, it, vi } from 'vitest';

import { D1SessionStore } from '../src/db/sessions';
import { applyMigrations } from '../src/db/migrate';
import type { Env } from '../src/env';
import { resolveCampaignMarketMetadata } from '../src/services/storefront-market';

const encryptionKey = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY';
const now = Date.parse('2026-11-12T00:00:00.000Z');
const testEnv = { ...(env as Env), TOKEN_ENCRYPTION_KEY: encryptionKey, now: () => now } as Env;

beforeEach(async () => {
  vi.unstubAllGlobals();
  await applyMigrations(testEnv.DB);
  await testEnv.DB.prepare('DELETE FROM shopline_sessions').run();
  await new D1SessionStore(testEnv.DB, encryptionKey).upsert({
    handle: 'market-shop', accessToken: 'access', refreshToken: 'refresh', scope: 'read_markets',
    expiresAt: '2030-01-01T00:00:00.000Z', installed: true,
  });
});

it('caches validated market metadata for five minutes and sends SHOPLINE admin headers', async () => {
  const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({ markets: [{
    market_id: 'market-us', market_name: 'United States', enabled: true,
    currency_settings: { base_currency: { currency_code: 'USD' } }, regions: [{ code: 'US' }],
  }] }));
  vi.stubGlobal('fetch', fetch);
  const session = (await new D1SessionStore(testEnv.DB, encryptionKey).get('market-shop'))!;

  await expect(resolveCampaignMarketMetadata(session, ['market-us'], testEnv)).resolves.toEqual([
    { marketId: 'market-us', marketName: 'United States', currencyCode: 'USD' },
  ]);
  await expect(resolveCampaignMarketMetadata(session, ['market-us'], testEnv)).resolves.toEqual([
    { marketId: 'market-us', marketName: 'United States', currencyCode: 'USD' },
  ]);

  expect(fetch).toHaveBeenCalledTimes(1);
  const headers = new Headers(fetch.mock.calls[0][1]?.headers);
  expect(headers.get('Accept')).toBe('application/json');
  expect(headers.get('User-Agent')).toBe('SHOPLINE-Quantity-Breaks-App/1.0');
  expect(headers.get('Authorization')).toBe('Bearer access');
});
