import { describe, expect, it, vi } from 'vitest';

import type { AuthContext } from '../src/auth/session';
import type { Env } from '../src/env';
import { deactivateAutomaticDiscount, DiscountUncertainError, listAutomaticDiscountStates, readAutomaticDiscountState } from '../src/services/discounts';

const session: AuthContext = { handle: 'demo', accessToken: 'access', scope: 'write_discounts' };
const env = {} as Env;

describe('automatic discount state resolution', () => {
  it('reads an app discount status from the Product Function discount list', async () => {
    const discountId = '7757655103080239428';
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(init?.method).toBe('GET');
      expect(new Headers(init?.headers).get('Accept')).toBe('application/json');
      expect(new Headers(init?.headers).get('User-Agent')).toBe('SHOPLINE-Quantity-Breaks-App/1.0');
      expect(url.pathname).toBe('/admin/openapi/v20261201/sales/discount_app.json');
      expect(url.searchParams.get('discount_type')).toBe('automatic');
      expect(url.searchParams.get('function_id')).toBe('754292a155d740809a5437a3f8c59231');
      expect(url.searchParams.get('limit')).toBe('100');
      return Response.json(
        { discount_apps: [{ app_discount_id: discountId, status: 'active' }] },
        { headers: { 'x-shopline-request-id': 'rest-request-1' } },
      );
    });
    vi.stubGlobal('fetch', fetcher);

    await expect(readAutomaticDiscountState(session, discountId, env)).resolves.toMatchObject({
      state: 'active', discountId, nodeId: `gid://shopline/DiscountAutomaticNode/${discountId}`,
      metadata: { upstreamStatus: 200, upstreamRequestId: 'rest-request-1' },
    });
  });

  it('uses the node ID returned by the Product Function discount list', async () => {
    const discountId = '7757655103080239428';
    const nodeId = 'gid://shopline/DiscountAutomaticNode/platform-node-7757655103080239428';
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      discount_apps: [{ app_discount_id: discountId, status: 'expired', node_id: nodeId }],
    })));

    await expect(readAutomaticDiscountState(session, discountId, env)).resolves.toMatchObject({
      state: 'paused', discountId, nodeId,
    });
  });

  it('retains the platform expiry timestamp for the activity list', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ discount_apps: [{ app_discount_id: 'expired', status: 'expired', ends_at: '2026-11-18T09:30:00+08:00' }] })));
    await expect(readAutomaticDiscountState(session, 'expired', env)).resolves.toMatchObject({ state: 'paused', endsAt: '2026-11-18T01:30:00.000Z' });
  });

  it('keeps the app rule campaign ID when listing Function discounts for reconciliation', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ discount_apps: [{
      app_discount_id: 'recoverable-discount', status: 'active',
      metafields: [{ namespace: 'sale', key: 'quantity_breaks', value: JSON.stringify({ campaignId: 'campaign-to-recover' }) }],
    }] })));

    const states = await listAutomaticDiscountStates(session, env);
    expect(states.get('recoverable-discount')).toMatchObject({ state: 'active', campaignId: 'campaign-to-recover' });
  });

  it('captures SHOPLINE Traceid response headers as the upstream request ID', async () => {
    const discountId = 'trace-header-discount';
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(
      { discount_apps: [{ app_discount_id: discountId, status: 'active' }] },
      { headers: { Traceid: 'shopline-trace-1' } },
    )));

    await expect(readAutomaticDiscountState(session, discountId, env)).resolves.toMatchObject({
      metadata: { upstreamRequestId: 'shopline-trace-1' },
    });
  });

  it('captures a redacted SHOPLINE error response for diagnostics', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(
      { error: { code: 'DISCOUNT_UNAVAILABLE', message: 'Discount state is temporarily unavailable.', accessToken: 'secret' }, details: { retryable: true, authorization: 'Bearer secret' } },
      { status: 436 },
    )));

    await expect(readAutomaticDiscountState(session, 'response-summary-discount', env)).rejects.toMatchObject({
      metadata: {
        upstreamResponseCode: 'DISCOUNT_UNAVAILABLE', upstreamResponseMessage: 'Discount state is temporarily unavailable.',
        upstreamResponseBody: JSON.stringify({ error: { code: 'DISCOUNT_UNAVAILABLE', message: 'Discount state is temporarily unavailable.' }, details: { retryable: true } }),
      },
    });
  });

  it('stops paging once an individual Product Function discount is found', async () => {
    const discountId = '7757655103080239428';
    const fetcher = vi.fn(async () => Response.json({
      discount_apps: [{ app_discount_id: discountId, status: 'active' }],
      page_info: { next_page_info: 'next-page' },
    }));
    vi.stubGlobal('fetch', fetcher);

    await expect(readAutomaticDiscountState(session, discountId, env)).resolves.toMatchObject({ state: 'active', discountId });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('reads later pages from the confirmed Function discount list endpoint', async () => {
    const discountId = '7757655103080239428';
    const requests: URL[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      requests.push(url);
      if (url.searchParams.get('page_info') === 'next-page') {
        return Response.json({ discount_apps: [{ app_discount_id: discountId, status: 'active' }] });
      }
      return Response.json({ discount_apps: [], page_info: { next_page_info: 'next-page' } });
    });
    vi.stubGlobal('fetch', fetcher);

    await expect(readAutomaticDiscountState(session, discountId, env)).resolves.toMatchObject({ state: 'active', discountId });
    expect(requests).toHaveLength(2);
    expect(requests.map((url) => url.pathname)).toEqual([
      '/admin/openapi/v20261201/sales/discount_app.json',
      '/admin/openapi/v20261201/sales/discount_app.json',
    ]);
    expect(requests[1].searchParams.get('page_info')).toBe('next-page');
  });

  it('keeps an expired Product Function discount recoverable for a REST update resume', async () => {
    const discountId = '7773865563165036580';
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      discount_apps: [{ app_discount_id: discountId, status: 'expired', ends_at: '2026-01-01T00:00:00.000Z' }],
    })));

    await expect(readAutomaticDiscountState(session, discountId, env)).resolves.toMatchObject({
      state: 'paused', discountId, nodeId: `gid://shopline/DiscountAutomaticNode/${discountId}`,
    });
  });

  it('treats a scheduled Product Function discount as platform-active', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      discount_apps: [{ app_discount_id: 'discount-1', status: 'scheduled' }],
    })));

    await expect(readAutomaticDiscountState(session, 'discount-1', env)).resolves.toMatchObject({ state: 'active', discountId: 'discount-1' });
  });

  it('verifies a deactivation with the Product Function discount list', async () => {
    const discountId = '7757655103080239428';
    const nodeId = 'gid://shopline/DiscountAutomaticNode/7757655103080239428';
    let stateReads = 0;
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('Accept')).toBe('application/json');
      expect(new Headers(init?.headers).get('User-Agent')).toBe('SHOPLINE-Quantity-Breaks-App/1.0');
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

    await expect(deactivateAutomaticDiscount(session, discountId, env)).resolves.toBe(discountId);
  });

  it('confirms a 204 deactivation response through the Function discount list', async () => {
    const discountId = '7757655103080239428';
    let stateReads = 0;
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'GET') {
        stateReads += 1;
        return Response.json({ discount_apps: [{ app_discount_id: discountId, status: stateReads === 1 ? 'active' : 'inactive' }] });
      }
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal('fetch', fetcher);

    await expect(deactivateAutomaticDiscount(session, discountId, env)).resolves.toBe(discountId);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('does not report a 204 deactivation as paused until the Function discount list confirms it', async () => {
    const discountId = '7757655103080239428';
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'GET') return Response.json({ discount_apps: [{ app_discount_id: discountId, status: 'active' }] });
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal('fetch', fetcher);

    await expect(deactivateAutomaticDiscount(session, discountId, env)).rejects.toThrow('deactivation was not confirmed after an empty response');
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('marks an incomplete Product Function discount response as unverified', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      discount_apps: null,
    })));

    await expect(readAutomaticDiscountState(session, '7773865563165036580', env))
      .rejects.toMatchObject({ diagnosticCode: 'INVALID_REST_DISCOUNT_APP_LIST' } satisfies Partial<DiscountUncertainError>);
  });
});
