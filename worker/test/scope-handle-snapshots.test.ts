import { expect, it, vi } from 'vitest';
import { refreshScopeHandleSnapshots } from '../src/services/scope-handle-snapshots';

const session = { handle: 'north-star', accessToken: 'access-token', scope: 'read_products', expiresAt: '2030-01-01T00:00:00.000Z', installed: true };

it('records the current handles for every product and collection in a campaign scope', async () => {
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/products/products.json')) return Response.json({ products: [
      { id: 'product-a', handle: 'serum' }, { id: 'product-b', handle: 'night-cream' },
    ] });
    if (url.includes('/products/collections/collection-a.json')) return Response.json({ collection: { id: 'collection-a', handle: 'skincare' } });
    if (url.includes('/products/collections/collection-b.json')) return Response.json({ collection: { id: 'collection-b', handle: 'best-sellers' } });
    throw new Error(`Unexpected SHOPLINE request: ${url}`);
  });

  await expect(refreshScopeHandleSnapshots(session, {
    kind: 'products', productIds: ['product-b', 'product-a'], excludedProductIds: [],
  }, fetcher)).resolves.toMatchObject({
    productHandles: { 'product-a': 'serum', 'product-b': 'night-cream' },
  });

  await expect(refreshScopeHandleSnapshots(session, {
    kind: 'collections', collectionIds: ['collection-b', 'collection-a'], excludedProductIds: [],
  }, fetcher)).resolves.toMatchObject({
    collectionHandles: { 'collection-a': 'skincare', 'collection-b': 'best-sellers' },
  });
});
