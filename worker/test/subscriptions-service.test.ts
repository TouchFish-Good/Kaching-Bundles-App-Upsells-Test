import { describe, expect, it, vi } from 'vitest';

import {
  PartnerSubscriptionClient,
  PartnerSubscriptionError,
  selectUltraMonthlyUsdSku,
} from '../src/services/subscriptions';

const appKey = 'app-key';
const handle = 'demo';
const accessToken = 'partner-token-must-not-leak';

function responseFor(url: URL): Response {
  if (url.pathname.endsWith('/productList.json')) {
    return Response.json({ product_list: [{ spu_key: 'ultra', sku_list: [{ sku_id: 'ultra-usd-30', period: 30, period_type: 'DAY', price: { USD: 1499 } }] }] });
  }
  if (url.pathname.endsWith('/create_pay.json')) return Response.json({ url: 'https://checkout.example/pay' });
  if (url.pathname.endsWith('/charges/status.json')) return Response.json({ data: { status: '200' } });
  if (url.pathname.endsWith('/list.json')) return Response.json({ subscriptions: { data: [{ sub_id: 'sub-1', sub_status: 'active' }], last_page: true } });
  if (url.pathname.endsWith('/detail.json')) return Response.json({ subscription: { feature_key_list: ['quantity_breaks_access'] } });
  return new Response(null, { status: 404 });
}

describe('SHOPLINE Partner subscription client', () => {
  it('calls the Partner fetcher with the Worker global context', async () => {
    const fetcher = function (this: unknown, input: RequestInfo | URL, _init?: RequestInit): Promise<Response> {
      expect(this).toBe(globalThis);
      return Promise.resolve(responseFor(new URL(String(input))));
    };
    const client = new PartnerSubscriptionClient(accessToken, fetcher as typeof fetch);

    await expect(client.listProducts(appKey, ['ultra'])).resolves.toHaveLength(1);
  });

  it('sends create_pay fields inside the required application_charge object', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => responseFor(new URL(String(input))));
    const client = new PartnerSubscriptionClient(accessToken, fetcher);

    await client.createPayment({
      appKey,
      handle,
      spuKey: 'ultra',
      skuId: 'ultra-usd-30',
      outTradeNo: 'trade-1',
      returnUrl: 'https://app.example/return',
      currency: 'USD',
    });

    const request = fetcher.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({
      app_key: appKey,
      handle,
      application_charge: {
        spu_key: 'ultra',
        sku_id: 'ultra-usd-30',
        out_trade_no: 'trade-1',
        return_url: 'https://app.example/return',
        currency: 'USD',
      },
    });
  });

  it('uses the server-only token for every documented subscription endpoint', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => responseFor(new URL(String(input))));
    const client = new PartnerSubscriptionClient(accessToken, fetcher);

    await client.listProducts(appKey, ['ultra']);
    await client.createPayment({ appKey, handle, spuKey: 'ultra', skuId: 'ultra-usd-30', outTradeNo: 'trade-1', returnUrl: 'https://app.example/return', currency: 'USD' });
    await client.getChargeStatus(appKey, 'trade-1');
    await client.listSubscriptions({ appKey, handle });
    await client.getSubscriptionDetail({ appKey, handle, subId: 'sub-1' });

    expect(fetcher).toHaveBeenCalledTimes(5);
    for (const [, init] of fetcher.mock.calls) {
      expect(init).toEqual(expect.objectContaining({ headers: expect.objectContaining({ 'X-Shopline-Access-Token': accessToken }) }));
    }
    expect(fetcher.mock.calls.map(([input]) => new URL(String(input)).pathname)).toEqual([
      '/v20260901/app_subscribe/productList.json',
      '/v20260901/app_subscribe/create_pay.json',
      '/v20260901/app_subscribe/charges/status.json',
      '/v20260901/app_subscribe/list.json',
      '/v20260901/app_subscribe/detail.json',
    ]);
  });

  it('normalizes the current Partner subscription field names', async () => {
    const client = new PartnerSubscriptionClient(accessToken, async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/list.json')) return Response.json({ data: { list: [{ subId: 'sub-current', status: 'ACTIVE', subType: 'PAID', spuKey: 'ULTRA', handle: 'demo', startAt: 1_700_000_000_000, endAt: 1_700_002_592_000, autoRenewStatus: true, trial: false }], lastPage: true } });
      return responseFor(url);
    });

    await expect(client.listSubscriptions({ appKey, handle })).resolves.toEqual({
      subscriptions: [{ subId: 'sub-current', status: 'active', type: 'paid', spuKey: 'ultra', handle: 'demo', startAt: 1_700_000_000_000, endAt: 1_700_002_592_000, autoRecurring: true, isTrial: false }],
      lastPage: true,
    });
  });

  it('does not expose the partner token through an error', async () => {
    const client = new PartnerSubscriptionClient(accessToken, async () => new Response('upstream details', { status: 503 }));

    await expect(client.listProducts(appKey)).rejects.toEqual(expect.any(PartnerSubscriptionError));
    await expect(client.listProducts(appKey)).rejects.toMatchObject({ status: 503 });
    await expect(client.listProducts(appKey)).rejects.not.toThrow(accessToken);
  });

  it('retains only safe Partner error fields for diagnosing rejected payment links', async () => {
    const client = new PartnerSubscriptionClient(accessToken, async () => Response.json({
      code: 'INVALID_SKU',
      message: 'SKU is not enabled for this application.',
      access_token: accessToken,
      nested: { secret: 'must-not-be-recorded' },
    }, { status: 400 }));

    await expect(client.createPayment({ appKey, handle, spuKey: 'ultra', skuId: 'ultra-usd-30', outTradeNo: 'trade-1', returnUrl: 'https://app.example/return', currency: 'USD' }))
      .rejects.toMatchObject({
        status: 400,
        diagnostic: { code: 'INVALID_SKU', message: 'SKU is not enabled for this application.' },
      });
  });

  it('normalizes documented-style error code and message aliases without retaining other response fields', async () => {
    const client = new PartnerSubscriptionClient(accessToken, async () => Response.json({
      error_code: 'INVALID_CALLBACK',
      msg: 'return_url is not permitted.',
      request: { access_token: accessToken, callback: 'must-not-be-recorded' },
    }, { status: 400 }));

    await expect(client.createPayment({ appKey, handle, spuKey: 'ultra', skuId: 'ultra-usd-30', outTradeNo: 'trade-1', returnUrl: 'https://app.example/return', currency: 'USD' }))
      .rejects.toMatchObject({
        status: 400,
        diagnostic: { code: 'INVALID_CALLBACK', message: 'return_url is not permitted.' },
      });
  });

  it('extracts safe diagnostics from nested Partner error envelopes', async () => {
    const client = new PartnerSubscriptionClient(accessToken, async () => Response.json({
      data: {
        error: {
          errorCode: 'INVALID_RETURN_URL',
          message: 'return_url is not permitted.',
        },
        access_token: accessToken,
      },
    }, { status: 400 }));

    await expect(client.createPayment({ appKey, handle, spuKey: 'ultra', skuId: 'ultra-usd-30', outTradeNo: 'trade-1', returnUrl: 'https://app.example/return', currency: 'USD' }))
      .rejects.toMatchObject({
        status: 400,
        diagnostic: { code: 'INVALID_RETURN_URL', message: 'return_url is not permitted.' },
      });
  });

  it('retains a string errors field from a rejected Partner response without retaining other fields', async () => {
    const client = new PartnerSubscriptionClient(accessToken, async () => Response.json({
      errors: 'The selected plan is not available for this store.',
      request: { access_token: accessToken },
    }, { status: 400 }));

    await expect(client.createPayment({ appKey, handle, spuKey: 'ultra', skuId: 'ultra-usd-30', outTradeNo: 'trade-1', returnUrl: 'https://app.example/return', currency: 'USD' }))
      .rejects.toMatchObject({
        status: 400,
        diagnostic: { code: null, message: 'The selected plan is not available for this store.' },
      });
  });

  it('selects exactly one 30-day USD Ultra SKU without a hard-coded SKU ID', () => {
    expect(selectUltraMonthlyUsdSku([
      { spuKey: 'ultra', skus: [{ skuId: 'ultra-usd-30', period: 30, periodType: 'DAY', price: { USD: 1499 } }] },
    ])).toEqual({ skuId: 'ultra-usd-30', currency: 'USD' });

    expect(() => selectUltraMonthlyUsdSku([{ spuKey: 'ultra', skus: [] }])).toThrow('exactly one USD 30-day Ultra SKU');
    expect(() => selectUltraMonthlyUsdSku([{ spuKey: 'ultra', skus: [
      { skuId: 'one', period: 30, periodType: 'DAY', price: { USD: 1499 } },
      { skuId: 'two', period: 30, periodType: 'DAY', price: { USD: 1499 } },
    ] }])).toThrow('exactly one USD 30-day Ultra SKU');
  });
});
