import { describe, expect, it, vi } from 'vitest';

import { assertPublishedCollectionScopeUnchanged, fetchShopCurrency, resolveCollectionMembers, writeCollectionVariables } from '../src/services/collection-publication';
import { DiscountUncertainError } from '../src/services/discounts';
import { readableCollectionDefinition } from './helpers/collection-definition';

const session = { handle: 'demo', accessToken: 'access', scope: 'write_discounts' };

describe('collection publication prerequisites', () => {
  it('accepts an omitted optional failure list only after an exact readback', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => String(input).includes('/metafield_definitions.json')
      ? readableCollectionDefinition(input)
      : Response.json({ metafields: [{ namespace: '$app:quantity-breaks', key: 'collection-membership', owner_id: '42', value: '{"inCollections":["c1"]}' }] })));
    await expect(writeCollectionVariables(session, '42', ['c1'])).resolves.toBeUndefined();
  });

  it('reads the persisted namespace when the app alias returns an empty list', async () => {
    const field = { id: 20480363557744, namespace: 'app--103645--quantity-breaks', key: 'collection-membership', owner_id: '42', owner_resource: 'shop', type: 'json', value: '{"inCollections":["c1"]}' };
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/metafield_definitions.json')) return readableCollectionDefinition(input);
      if (init?.method === 'POST') {
        expect(JSON.parse(String(init.body)).metafields[0].namespace).toBe('$app:quantity-breaks');
        return Response.json({ metafields: [field] });
      }
      const query = new URL(String(input)).searchParams;
      return Response.json({ metafields: query.get('namespace') === 'app--103645--quantity-breaks' && query.get('key') === 'collection-membership' ? [field] : [] });
    });
    vi.stubGlobal('fetch', fetcher);
    await expect(writeCollectionVariables(session, '42', ['c1'])).resolves.toBeUndefined();
  });

  it('preserves the failure body and SHOPLINE TraceID for diagnosis without creating a discount', async () => {
    const body = { metafields: [], fail_metafields: [{ key: 'collection-membership', errors: 'Invalid namespace' }], access_token: 'do-not-record' };
    const fetcher = vi.fn(async () => new Response(JSON.stringify(body), { headers: { Traceid: 'shopline-trace-1' } }));
    vi.stubGlobal('fetch', fetcher);
    let failure: unknown;
    try { await writeCollectionVariables(session, '42', ['c1']); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(DiscountUncertainError);
    expect(failure).toMatchObject({ diagnosticCode: 'COLLECTION_METAFIELD_WRITE_UNCONFIRMED', metadata: { upstreamStatus: 200, upstreamRequestId: 'shopline-trace-1', upstreamPath: '/admin/openapi/v20260901/metafields_set.json' } });
    expect((failure as DiscountUncertainError).metadata.upstreamResponseBody).toContain('Invalid namespace');
    expect((failure as DiscountUncertainError).metadata.upstreamResponseBody).not.toContain('do-not-record');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('rejects a readback with a different namespace or different collection IDs', async () => {
    for (const readback of [
      { namespace: 'another-app', value: '{"inCollections":["c1"]}' },
      { owner_id: 'another-shop', value: '{"inCollections":["c1"]}' },
      { namespace: '$app:quantity-breaks', value: '{"inCollections":["c2"]}' },
    ]) {
      vi.stubGlobal('fetch', vi.fn(async (_input, init) => new Response(JSON.stringify({ fail_metafields: [], metafields: [{ namespace: '$app:quantity-breaks', key: 'collection-membership', owner_id: '42', ...(init?.method === 'POST' ? {} : readback) }] }))));
      await expect(writeCollectionVariables(session, '42', ['c1'])).rejects.toThrow(/readback/);
    }
  });

  it('retains the readback body and TraceID when the persisted namespace is still empty', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => init?.method === 'POST'
      ? Response.json({ metafields: [{ namespace: 'app--103645--quantity-breaks', key: 'collection-membership', owner_id: '42' }] })
      : Response.json({ metafields: [] }, { headers: { Traceid: 'empty-readback-trace' } }));
    vi.stubGlobal('fetch', fetcher);
    await expect(writeCollectionVariables(session, '42', ['c1'])).rejects.toMatchObject({
      diagnosticCode: 'COLLECTION_METAFIELD_READBACK_INVALID',
      metadata: { upstreamRequestId: 'empty-readback-trace', upstreamResponseBody: '{"metafields":[]}' },
    });
  });
  it('resolves every collection member page before publication', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return url.includes('page_info=next')
        ? new Response(JSON.stringify({ products: [{ id: 'product-2' }] }))
        : new Response(JSON.stringify({ products: [{ id: 'product-1' }] }), { headers: { Link: '<https://demo.myshopline.com/admin/openapi/v20260901/products/collections/collection-1/products.json?page_info=next>; rel="next"' } });
    });
    vi.stubGlobal('fetch', fetcher);

    await expect(resolveCollectionMembers(session, ['collection-1'])).resolves.toEqual(['product-1', 'product-2']);
  });

  it('uses the settlement currency returned by SHOPLINE rather than a default', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ currencies: [{ currency: 'BHD', enabled: true }] }))));
    await expect(fetchShopCurrency(session)).resolves.toBe('BHD');
  });

  it('writes and reads back the Function collection membership metafield', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/metafield_definitions.json')) return readableCollectionDefinition(input);
      if (init?.method === 'POST') return new Response(JSON.stringify({ metafields: [{ namespace: '$app:quantity-breaks', key: 'collection-membership', owner_id: '42' }], fail_metafields: [] }));
      if (url.includes('/metafields.json')) return new Response(JSON.stringify({ metafields: [{ namespace: '$app:quantity-breaks', key: 'collection-membership', owner_id: '42', value: '{"inCollections":["c1","c2"]}' }] }));
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetcher);

    await expect(writeCollectionVariables(session, '42', ['c2', 'c1', 'c1'])).resolves.toBeUndefined();
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method: 'POST' });
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('Accept')).toBe('application/json');
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('User-Agent')).toBe('SHOPLINE-Quantity-Breaks-App/1.0');
  });

  it('rejects a published collection update when current members differ from its snapshot', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ products: [{ id: 'product-1' }, { id: 'product-3' }] }))));

    await expect(assertPublishedCollectionScopeUnchanged(session, {
      id: 'collection-offer', name: 'Collection offer', status: 'active', startsAt: '2026-10-28T00:00:00.000Z',
      scope: { kind: 'collections', collectionIds: ['collection-1'], resolvedProductIds: ['product-1', 'product-2'], excludedProductIds: [] },
      tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 1, discountType: 'none' }], combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false }, revision: 2, updatedAt: '2026-10-28T00:00:00.000Z',
    })).rejects.toThrow('Collection membership changed');
  });
});
