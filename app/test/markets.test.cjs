const assert = require('node:assert/strict');
const { test } = require('node:test');

const market = (id, currency, regions = [currency], enabled = true) => ({
  market_id: id, market_name: id, enabled,
  currency_settings: { base_currency: { currency_code: currency } },
  regions: regions.map((code) => ({ currency: { currency_code: code } })),
});

test('loads all market pages and keeps enabled status and region currencies', async () => {
  const { loadMarkets } = require('../src/service/markets');
  const seen = [];
  const fetcher = async (url, options) => {
    seen.push(url);
    assert.match(url, /\/admin\/openapi\/v20260901\//);
    assert.equal(options.headers['Content-Type'], 'application/json; charset=utf-8');
    assert.equal(options.headers.Accept, 'application/json');
    assert.equal(options.headers['User-Agent'], 'SHOPLINE-Quantity-Breaks-App/1.0');
    if (url.endsWith('/currency/currencies.json')) return { ok: true, json: async () => ({ currencies: [{ currency: 'USD', enabled: true, rate_update_at: '' }, { currency: 'EUR', enabled: false, rate_update_at: '' }] }) };
    if (url.includes('page_info=next')) return { ok: true, headers: { get: () => null }, json: async () => ({ markets: [market('fr', 'EUR', ['EUR'], false)] }) };
    return { ok: true, headers: { get: () => '<https://demo.myshopline.com/admin/openapi/v20260901/markets.json?page_info=next>; rel="next"' }, json: async () => ({ markets: [market('us', 'USD'), market('mixed', 'EUR', ['EUR', 'GBP'])] }) };
  };
  const result = await loadMarkets('demo', 'token', fetcher);
  assert.equal(seen.length, 3);
  assert.equal(result.shopCurrencyCode, 'USD');
  assert.equal(seen.some((url) => url.includes('/merchants/shop.json')), false);
  assert.deepEqual(result.markets.map((item) => [item.id, item.enabled, item.currencyCode, item.specifiedAmountSupported]), [
    ['us', true, 'USD', true], ['mixed', true, null, false], ['fr', false, 'EUR', true],
  ]);
});

test('rejects missing currency and a market response failure', async () => {
  const { loadMarkets } = require('../src/service/markets');
  const currencies = { ok: true, json: async () => ({ currencies: [{ currency: 'USD', enabled: true, rate_update_at: '' }] }) };
  await assert.rejects(() => loadMarkets('demo', 'token', async (url) => url.endsWith('/currency/currencies.json') ? currencies : { ok: true, headers: { get: () => null }, json: async () => ({ markets: [market('bad', undefined)] }) }), /currency/i);
  await assert.rejects(() => loadMarkets('demo', 'token', async (url) => url.endsWith('/currency/currencies.json') ? currencies : { ok: false, status: 503 }), /\/markets\.json.*503/);
});

test('settlement currency is not guessed when multiple currencies are enabled', async () => {
  const { loadMarkets } = require('../src/service/markets');
  await assert.rejects(() => loadMarkets('demo', 'token', async () => ({
    ok: true, json: async () => ({ currencies: [
      { currency: 'USD', enabled: true, rate_update_at: '' },
      { currency: 'EUR', enabled: true, rate_update_at: '' },
    ] }),
  })), /settlement currency/i);
});

test('market controller rejects requests without an authenticated session', async () => {
  const { marketsController } = require('../src/controller/markets');
  const response = { locals: {}, status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } };
  await marketsController({}, response);
  assert.equal(response.code, 401);
  assert.match(response.body.error, /authenticated/i);
});

test('market upstream diagnostics correlate settlement and market requests without leaking the Admin token', async () => {
  const { loadMarkets } = require('../src/service/markets');
  const logs = [];
  const previous = console.info;
  console.info = (...parts) => logs.push(parts);
  try {
    await assert.rejects(() => loadMarkets('demo', 'private-token', async (url) => ({
      ok: false, status: 436,
      headers: { get: (name) => name === 'x-trace-id' ? 'trace-436' : null },
    }), 'request-markets'), /436/);
  } finally { console.info = previous; }
  assert.deepEqual(logs.map((entry) => entry[1].stage), ['upstream_request', 'upstream_response']);
  assert.equal(logs[0][1].endpoint, '/currency/currencies.json');
  assert.equal(logs[0][1].version, 'v20260901');
  assert.equal(logs[1][1].status, 436);
  assert.equal(logs[1][1].traceId, 'trace-436');
  assert.equal(typeof logs[1][1].durationMs, 'number');
  assert.equal(logs.every((entry) => entry[1].requestId === 'request-markets'), true);
  assert.equal(JSON.stringify(logs).includes('private-token'), false);
});
