import { describe, expect, it, vi } from 'vitest';

import { getCampaignProducts, ShoplineAdminClient } from '../src/services/shopline-admin';

describe('SHOPLINE Admin client', () => {
  it('uses the established REST version and bearer token', async () => {
    const fetcher = vi.fn(async () => new Response('{}', { status: 200 }));
    const client = new ShoplineAdminClient({ handle: 'demo', accessToken: 'access', scope: 'read_products' }, fetcher);

    await client.get('/products.json');

    expect(fetcher).toHaveBeenCalledWith('https://demo.myshopline.com/admin/api/v20260901/products.json', expect.objectContaining({ headers: expect.any(Headers) }));
    const [, request] = fetcher.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit];
    expect(new Headers(request.headers).get('Authorization')).toBe('Bearer access');
    expect(new Headers(request.headers).get('Accept')).toBe('application/json');
    expect(new Headers(request.headers).get('User-Agent')).toBe('SHOPLINE-Quantity-Breaks-App/1.0');
  });

  it('gets selected products in caller order and reports missing IDs', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ products: [
      { id: '100', title: 'First returned' },
      { id: '200', title: 'Second returned' },
    ] })));

    const result = await getCampaignProducts({ handle: 'demo', accessToken: 'access', scope: 'read_products' }, ['200', '100', '300'], fetcher);

    expect(result.products.map((item) => item.id)).toEqual(['200', '100']);
    expect(result.missingIds).toEqual(['300']);
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('/admin/openapi/v20260901/products/products.json?'), expect.objectContaining({ headers: expect.any(Headers) }));
    const [, request] = fetcher.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit];
    expect(new Headers(request.headers).get('Authorization')).toBe('Bearer access');
    expect(new Headers(request.headers).get('User-Agent')).toBe('SHOPLINE-Quantity-Breaks-App/1.0');
  });

  it('splits fifty-one selected products into a fifty-ID and one-ID request', async () => {
    const ids = Array.from({ length: 51 }, (_, index) => String(index + 1));
    const batches: string[][] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const batch = url.searchParams.get('ids')?.split(',') ?? [];
      batches.push(batch);
      return new Response(JSON.stringify({ products: batch.map((id) => ({ id, title: `Product ${id}` })) }));
    });

    const result = await getCampaignProducts({ handle: 'demo', accessToken: 'access', scope: 'read_products' }, ids, fetcher);

    expect(batches.map((batch) => batch.length)).toEqual([50, 1]);
    expect(result.products.map((item) => item.id)).toEqual(ids);
    expect(result.missingIds).toEqual([]);
  });
});
