import { env } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';

import { activateAutomaticDiscount, buildDiscountRule, cleanupExpiredAutomaticDiscount, createAutomaticDiscount, deactivateAutomaticDiscount, deleteAutomaticDiscount, DiscountUncertainError, pauseAutomaticDiscount, readAutomaticDiscountState, updateAutomaticDiscount, updateAutomaticDiscountSchedule } from '../src/services/discounts';
import type { AuthContext } from '../src/auth/session';
import type { CampaignDraft } from '../src/domain/campaign';
import type { Env } from '../src/env';

const session: AuthContext = { handle: 'demo', accessToken: 'access', scope: 'write_discounts' };
const campaign: CampaignDraft = {
  id: 'offer-a', name: 'Buy more', status: 'active', startsAt: '2026-10-27T00:00:00.000Z',
  scope: { kind: 'products', productIds: ['product-a'], excludedProductIds: [] },
  tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 1, discountType: 'none' }],
  combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
};

it('does not send developer handle snapshots to the SHOPLINE Function rule', () => {
  const rule = buildDiscountRule({
    ...campaign,
    scope: { ...campaign.scope, productHandles: { 'product-a': 'fresh-serum' } },
  }, 'USD');

  expect(rule.scope).toEqual({ kind: 'products', productIds: ['product-a'], excludedProductIds: [] });
});

function createdActiveFetcher(id = '7757655103080239428') {
  return vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => String(input).includes('/sales/discount_automatic_app.json')
    ? Response.json({ app_discount_id: id })
    : Response.json({ discount_apps: [{ app_discount_id: id, status: 'active' }] }));
}

describe('SHOPLINE Function discount publication', () => {
  it('explains the SHOPLINE elapsed-end-time rejection while retaining its original diagnostic response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ errors: 'endAt is illegal, endAt before now' }, { status: 422, headers: { Traceid: 'elapsed-end-trace' } })));
    await expect(createAutomaticDiscount(session, campaign, { ...(env as Env), SHOPLINE_STORE_CURRENCY_CODE: 'USD' }))
      .rejects.toMatchObject({ message: '当前结束时间早于当前时间', metadata: {
        upstreamStatus: 422, upstreamRequestId: 'elapsed-end-trace',
        upstreamResponseMessage: 'endAt is illegal, endAt before now',
        upstreamResponseBody: '{"errors":"endAt is illegal, endAt before now"}',
      } });
  });

  it('does not mislabel another 422 response as an elapsed end time', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ errors: 'function_id is invalid' }, { status: 422 })));
    await expect(createAutomaticDiscount(session, campaign, { ...(env as Env), SHOPLINE_STORE_CURRENCY_CODE: 'USD' }))
      .rejects.toMatchObject({ message: 'SHOPLINE Function discount API returned 422.' });
  });

  it('reads a REST app discount ID through the Product Function discount list', async () => {
    const discountId = '7757655103080239428';
    const nodeId = 'gid://shopline/DiscountAutomaticNode/7757655103080239428';
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe('GET');
      expect(String(input)).toContain('/admin/openapi/v20261201/sales/discount_app.json');
      return Response.json({ discount_apps: [{ app_discount_id: discountId, status: 'active' }] });
    });
    vi.stubGlobal('fetch', fetcher);

    await expect(readAutomaticDiscountState(session, discountId, env as Env)).resolves.toMatchObject({
      state: 'active', discountId, nodeId,
    });
  });

  it('deactivates a REST app discount with a REST state read-back', async () => {
    const discountId = '7757655103080239428';
    const nodeId = 'gid://shopline/DiscountAutomaticNode/7757655103080239428';
    let stateReads = 0;
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'GET') {
        stateReads += 1;
        return Response.json({ discount_apps: [{ app_discount_id: discountId, status: stateReads === 1 ? 'active' : 'expired' }] });
      }
      const request = JSON.parse(String(init?.body)) as { query: string; variables: Record<string, unknown> };
      if (request.query.includes('DeactivateAutomaticDiscount')) {
        expect(request.variables).toEqual({ id: nodeId });
        return Response.json({ data: { discountAutomaticDeactivate: { userErrors: [] } } });
      }
      throw new Error(`Unexpected query: ${request.query}`);
    });
    vi.stubGlobal('fetch', fetcher);

    await expect(deactivateAutomaticDiscount(session, discountId, env as Env)).resolves.toBe(discountId);
  });

  it('uses the configured Function ID and returns the platform activity ID', async () => {
    const fetcher = createdActiveFetcher();
    vi.stubGlobal('fetch', fetcher);
    const result = await createAutomaticDiscount(session, campaign, { ...(env as Env), SHOPLINE_PRODUCT_DISCOUNT_FUNCTION_ID: 'dev-c02e7fd2-10f6-4063-9dab-8a1cd5ba8b8f', SHOPLINE_STORE_CURRENCY_CODE: 'USD' } as Env);
    expect(result).toEqual({ discountId: '7757655103080239428', nodeId: 'gid://shopline/DiscountAutomaticNode/7757655103080239428' });
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('/sales/discount_automatic_app.json'), expect.objectContaining({ method: 'POST', body: expect.stringContaining('dev-c02e7fd2-10f6-4063-9dab-8a1cd5ba8b8f') }));
  });

  it('uses the checkout-facing discount name for the SHOPLINE title', async () => {
    const fetcher = createdActiveFetcher();
    vi.stubGlobal('fetch', fetcher);

    await createAutomaticDiscount(session, { ...campaign, name: 'Internal campaign name', discountName: 'Cart and checkout name' }, { ...(env as Env), SHOPLINE_STORE_CURRENCY_CODE: 'USD' } as Env);

    expect(JSON.parse(String((fetcher.mock.calls[0][1] as RequestInit).body))).toMatchObject({ title: 'Cart and checkout name' });
  });

  it('does not report a newly created discount as active until SHOPLINE confirms it', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => init?.method === 'POST'
      ? Response.json({ app_discount_id: 'discount-1' })
      : Response.json({ discount_apps: [{ app_discount_id: 'discount-1', status: 'expired' }] }));
    vi.stubGlobal('fetch', fetcher);

    await expect(createAutomaticDiscount(session, campaign, { ...(env as Env), SHOPLINE_STORE_CURRENCY_CODE: 'USD' } as Env))
      .rejects.toThrow('creation was not confirmed');
  });

  it('confirms a briefly invisible new discount by reading again without creating twice', async () => {
    let reads = 0;
    let creates = 0;
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') { creates += 1; return Response.json({ app_discount_id: 'delayed-discount' }); }
      reads += 1;
      return Response.json({ discount_apps: reads < 3 ? [] : [{ app_discount_id: 'delayed-discount', status: 'ACTIVE' }] });
    }));
    await expect(createAutomaticDiscount(session, campaign, { ...(env as Env), SHOPLINE_STORE_CURRENCY_CODE: 'USD' }))
      .resolves.toEqual({ discountId: 'delayed-discount', nodeId: 'gid://shopline/DiscountAutomaticNode/delayed-discount' });
    expect(creates).toBe(1);
  });

  it('retains the accepted discount ID and latest lookup response while confirmation is pending', async () => {
    let creates = 0;
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') { creates += 1; return Response.json({ app_discount_id: 'pending-discount' }); }
      return Response.json({ discount_apps: [] }, { headers: { Traceid: 'pending-lookup-trace' } });
    }));
    await expect(createAutomaticDiscount(session, campaign, { ...(env as Env), SHOPLINE_STORE_CURRENCY_CODE: 'USD' }))
      .rejects.toMatchObject({ discountId: 'pending-discount', diagnosticCode: 'CREATE_CONFIRMATION_PENDING', metadata: {
        upstreamStatus: 200, upstreamRequestId: 'pending-lookup-trace', upstreamResponseBody: '{"discount_apps":[]}',
        upstreamPath: expect.stringContaining('/v20261201/sales/discount_app.json'),
      } });
    expect(creates).toBe(1);
  });

  it('keeps an accepted creation pending when the confirmation read is rate limited', async () => {
    let reads = 0;
    let creates = 0;
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') { creates += 1; return Response.json({ app_discount_id: 'rate-limited-discount' }); }
      reads += 1;
      return Response.json({ errors: 'Rate limited' }, { status: 429, headers: { Traceid: 'lookup-rate-limit', 'Retry-After': '17' } });
    }));
    await expect(createAutomaticDiscount(session, campaign, { ...(env as Env), SHOPLINE_STORE_CURRENCY_CODE: 'USD' }))
      .rejects.toMatchObject({ discountId: 'rate-limited-discount', diagnosticCode: 'CREATE_CONFIRMATION_PENDING', metadata: {
        upstreamStatus: 429, upstreamRequestId: 'lookup-rate-limit', retryAfterMs: 17_000,
      } });
    expect(creates).toBe(1);
    expect(reads).toBe(1);
  });

  it('updates the complete Function discount rule with a pause time ten seconds in the future', async () => {
    const discountId = 'discount-1';
    const now = '2026-11-03T14:30:00.000Z';
    const pauseAt = '2026-11-03T14:30:10.000Z';
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        expect(String(input)).toContain(`/admin/openapi/v20260901/sales/discount_automatic_app/${discountId}.json`);
        expect(JSON.parse(String(init.body))).toMatchObject({
          title: campaign.name,
          function_id: 'dev-c02e7fd2-10f6-4063-9dab-8a1cd5ba8b8f',
          starts_at: campaign.startsAt,
          ends_at: pauseAt,
          metafields: [{ namespace: 'sale', key: 'quantity_breaks', type: 'json' }],
        });
        return Response.json({ app_discount_id: discountId });
      }
      return Response.json({ discount_apps: [{ app_discount_id: discountId, status: 'active', ends_at: pauseAt }] });
    });
    vi.stubGlobal('fetch', fetcher);

    await expect(pauseAutomaticDiscount(session, discountId, campaign, { ...(env as Env), SHOPLINE_STORE_CURRENCY_CODE: 'USD', now: () => Date.parse(now) } as Env)).resolves.toEqual({ state: 'pausing', discountId, endsAt: pauseAt });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('cleans up an expired Function discount before a replacement is created', async () => {
    const discountId = 'discount-1';
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'GET') {
        const reads = fetcher.mock.calls.filter(([, request]) => request?.method === 'GET').length;
        return Response.json({ discount_apps: reads === 1 ? [{ app_discount_id: discountId, status: 'expired' }] : [] });
      }
      expect(String(input)).toBe(`https://demo.myshopline.com/admin/openapi/v20261201/sales/discount_apps/dev-c02e7fd2-10f6-4063-9dab-8a1cd5ba8b8f/${discountId}.json`);
      expect(init?.method).toBe('DELETE');
      return Response.json({ success: true });
    });
    vi.stubGlobal('fetch', fetcher);

    await expect(cleanupExpiredAutomaticDiscount(session, discountId, env as Env)).resolves.toMatchObject({ upstreamStatus: 200 });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('serializes the real store currency precision and specified market precision', async () => {
    const fetcher = createdActiveFetcher();
    vi.stubGlobal('fetch', fetcher);
    await createAutomaticDiscount(session, {
      ...campaign,
      tiers: [{ ...campaign.tiers[0], discountType: 'fixed_amount', discountValue: 100, marketOverrides: { market: { mode: 'specified_amount', currencyCode: 'BHD', amountMinor: 100 } } }],
    }, { ...(env as Env), SHOPLINE_STORE_CURRENCY_CODE: 'BHD' } as Env);

    const init = fetcher.mock.calls[0][1] as RequestInit;
    const rule = JSON.parse(JSON.parse(String(init.body)).metafields[0].value);
    expect(rule.storeCurrencyCode).toBe('BHD');
    expect(rule.storeCurrencyDecimals).toBe(3);
    expect(rule.tiers[0].marketOverrides.market.currencyDecimals).toBe(3);
  });

  it('preserves every selected combination mode with specified market amounts', async () => {
    const fetcher = createdActiveFetcher();
    vi.stubGlobal('fetch', fetcher);

    await createAutomaticDiscount(session, {
      ...campaign,
      combinesWith: { orderDiscounts: true, productDiscounts: true, shippingDiscounts: true },
      tiers: [{ ...campaign.tiers[0], discountType: 'fixed_amount', discountValue: 100, marketOverrides: { japan: { mode: 'specified_amount', currencyCode: 'JPY', amountMinor: 100 } } }],
    }, { ...(env as Env), SHOPLINE_STORE_CURRENCY_CODE: 'JPY' } as Env);

    const body = JSON.parse(String((fetcher.mock.calls[0][1] as RequestInit).body));
    expect(body.combines_with_modes).toMatchObject({
      order_discount_code: true,
      order_automatic_discount: true,
      product_discount_code: true,
      product_automatic_discount: true,
      shipping_discount_code: true,
      shipping_automatic_discount: true,
    });
  });

  it('preserves combination choices and every override when tiers use independent market modes', async () => {
    const fetcher = createdActiveFetcher();
    vi.stubGlobal('fetch', fetcher);

    await createAutomaticDiscount(session, {
      ...campaign,
      combinesWith: { orderDiscounts: true, productDiscounts: true, shippingDiscounts: false },
      tiers: [
        { tierId: 'percentage', displayOrder: 0, quantity: 2, discountType: 'percentage', discountValue: 1000, marketOverrides: { japan: { mode: 'auto_convert' }, bahrain: { mode: 'auto_convert' } } },
        { tierId: 'fixed-auto', displayOrder: 1, quantity: 3, discountType: 'fixed_amount', discountValue: 200, marketOverrides: { japan: { mode: 'auto_convert' } } },
        { tierId: 'fixed-specified', displayOrder: 2, quantity: 4, discountType: 'fixed_price', discountValue: 500, marketOverrides: { japan: { mode: 'specified_amount', currencyCode: 'JPY', amountMinor: 750 }, bahrain: { mode: 'specified_amount', currencyCode: 'BHD', amountMinor: 1250 } } },
      ],
    }, { ...(env as Env), SHOPLINE_STORE_CURRENCY_CODE: 'USD' } as Env);

    const body = JSON.parse(String((fetcher.mock.calls[0][1] as RequestInit).body));
    expect(body.combines_with_modes).toEqual({
      order_discount_code: true,
      order_automatic_discount: true,
      product_discount_code: true,
      product_automatic_discount: true,
      shipping_discount_code: false,
      shipping_automatic_discount: false,
    });
    const rule = JSON.parse(body.metafields[0].value);
    expect(rule.tiers).toEqual([
      { tierId: 'percentage', quantity: 2, discountType: 'percentage', discountValue: 1000, marketOverrides: { japan: { mode: 'auto_convert' }, bahrain: { mode: 'auto_convert' } } },
      { tierId: 'fixed-auto', quantity: 3, discountType: 'fixed_amount', discountValue: 200, marketOverrides: { japan: { mode: 'auto_convert' } } },
      { tierId: 'fixed-specified', quantity: 4, discountType: 'fixed_price', discountValue: 500, marketOverrides: { japan: { mode: 'specified_amount', currencyCode: 'JPY', amountMinor: 750, currencyDecimals: 0 }, bahrain: { mode: 'specified_amount', currencyCode: 'BHD', amountMinor: 1250, currencyDecimals: 3 } } },
    ]);
  });

  it('rejects an uncertain response without a valid activity ID', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    await expect(createAutomaticDiscount(session, campaign, { ...(env as Env), SHOPLINE_PRODUCT_DISCOUNT_FUNCTION_ID: 'function-id', SHOPLINE_STORE_CURRENCY_CODE: 'USD' } as Env)).rejects.toThrow('Publication is uncertain');
  });

  it('updates only the confirmed platform discount ID', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ app_discount_id: 'discount-2' }), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);

    await expect(updateAutomaticDiscount(session, 'discount-1', campaign, { ...(env as Env), SHOPLINE_STORE_CURRENCY_CODE: 'USD' } as Env)).rejects.toThrow('did not confirm the discount ID');
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('/sales/discount_automatic_app/discount-1.json'), expect.objectContaining({ method: 'PUT' }));
  });

  it('deletes through the Function discount REST endpoint and confirms the discount is missing afterward', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ discount_apps: [{ app_discount_id: 'activity-1', status: 'active' }] }))
      .mockResolvedValueOnce(Response.json({ success: true }))
      .mockResolvedValueOnce(Response.json({ discount_apps: [] }));
    vi.stubGlobal('fetch', fetcher);
    await deleteAutomaticDiscount(session, 'activity-1', { ...(env as Env), SHOPLINE_PRODUCT_DISCOUNT_FUNCTION_ID: 'function-id' } as Env);
    expect(fetcher.mock.calls[0][0]).toContain('/admin/openapi/v20261201/sales/discount_app.json');
    expect(fetcher.mock.calls[1][0]).toBe('https://demo.myshopline.com/admin/openapi/v20261201/sales/discount_apps/function-id/activity-1.json');
    expect(fetcher.mock.calls[1][1]).toMatchObject({ method: 'DELETE' });
  });

  it('confirms a 204 Function discount delete only after the list no longer contains the ID', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ discount_apps: [{ app_discount_id: 'expired-1', status: 'expired' }] }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(Response.json({ discount_apps: [] }));
    vi.stubGlobal('fetch', fetcher);

    await expect(deleteAutomaticDiscount(session, 'expired-1', env as Env)).resolves.toMatchObject({ upstreamStatus: 204 });
  });

  it('does not accept a 204 delete while the old discount remains in the list', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ discount_apps: [{ app_discount_id: 'expired-1', status: 'expired' }] }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(Response.json({ discount_apps: [{ app_discount_id: 'expired-1', status: 'expired' }] }));
    vi.stubGlobal('fetch', fetcher);

    await expect(deleteAutomaticDiscount(session, 'expired-1', env as Env)).rejects.toThrow('deletion was not confirmed');
  });

  it('updates both schedule fields when pausing a scheduled discount', async () => {
    const startsAt = '2026-11-03T14:30:00.000Z';
    const endsAt = '2026-11-03T14:30:10.000Z';
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe('PUT');
      expect(JSON.parse(String(init?.body))).toMatchObject({ starts_at: startsAt, ends_at: endsAt });
      return Response.json({ app_discount_id: 'scheduled-1' });
    });
    vi.stubGlobal('fetch', fetcher);

    await expect(updateAutomaticDiscountSchedule(session, 'scheduled-1', campaign, { ...(env as Env), SHOPLINE_STORE_CURRENCY_CODE: 'USD' } as Env, 'USD', { startsAt, endsAt })).resolves.toBe('scheduled-1');
  });

  it('updates only starts_at when starting a scheduled discount with no end time', async () => {
    const startsAt = '2026-11-03T14:30:00.000Z';
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe('PUT');
      expect(JSON.parse(String(init?.body))).toMatchObject({ starts_at: startsAt, ends_at: null });
      return Response.json({ app_discount_id: 'scheduled-1' });
    });
    vi.stubGlobal('fetch', fetcher);

    await expect(updateAutomaticDiscountSchedule(session, 'scheduled-1', campaign, { ...(env as Env), SHOPLINE_STORE_CURRENCY_CODE: 'USD' } as Env, 'USD', { startsAt, endsAt: null })).resolves.toBe('scheduled-1');
  });

  it('reads the current automatic discount state through Admin REST', async () => {
    const fetcher = vi.fn(async () => Response.json({ discount_apps: [{ app_discount_id: 'discount-1', status: 'active' }] }));
    vi.stubGlobal('fetch', fetcher);

    await expect(readAutomaticDiscountState(session, 'discount-1', env as Env)).resolves.toMatchObject({ state: 'active', discountId: 'discount-1' });
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('/admin/openapi/v20261201/sales/discount_app.json'), expect.objectContaining({ method: 'GET' }));
  });

  it('deactivates and reactivates the same discount ID with a verified state read-back', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ discount_apps: [{ app_discount_id: 'discount-1', status: 'active' }] }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { discountAutomaticDeactivate: { userErrors: [] } } }), { status: 200 }))
      .mockResolvedValueOnce(Response.json({ discount_apps: [{ app_discount_id: 'discount-1', status: 'expired' }] }))
      .mockResolvedValueOnce(Response.json({ discount_apps: [{ app_discount_id: 'discount-1', status: 'expired' }] }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { discountAutomaticActivate: { userErrors: [] } } }), { status: 200 }))
      .mockResolvedValueOnce(Response.json({ discount_apps: [{ app_discount_id: 'discount-1', status: 'active' }] }));
    vi.stubGlobal('fetch', fetcher);

    await expect(deactivateAutomaticDiscount(session, 'discount-1', env as Env)).resolves.toBe('discount-1');
    await expect(activateAutomaticDiscount(session, 'discount-1', env as Env)).resolves.toBe('discount-1');
    expect(fetcher.mock.calls[1][1]).toMatchObject({ method: 'POST', body: expect.stringContaining('discountAutomaticDeactivate') });
    expect(fetcher.mock.calls[4][1]).toMatchObject({ method: 'POST', body: expect.stringContaining('discountAutomaticActivate') });
  });

  it('treats an already missing discount as an idempotent confirmed deletion', async () => {
    const fetcher = vi.fn(async () => Response.json({ discount_apps: [] }));
    vi.stubGlobal('fetch', fetcher);

    await expect(deleteAutomaticDiscount(session, 'discount-1', env as Env)).resolves.toMatchObject({ upstreamStatus: 200 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('preserves a SHOPLINE retry-after delay when publication is rate limited', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 429, headers: { 'Retry-After': '17' } })));

    await expect(createAutomaticDiscount(session, campaign, { ...(env as Env), SHOPLINE_STORE_CURRENCY_CODE: 'USD' } as Env))
      .rejects.toMatchObject({ metadata: { upstreamStatus: 429, retryAfterMs: 17_000 } });
  });
});
