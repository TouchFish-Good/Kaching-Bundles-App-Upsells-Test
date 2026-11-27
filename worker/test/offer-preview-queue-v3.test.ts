import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../src/services/offer-index', () => ({ verifiedOfferReferences: vi.fn(async () => [{ id: 'p', title: 'P', variants: [{ id: 'v' }] }]), OfferIndexError: class extends Error {} }));
vi.mock('../src/services/collection-publication', () => ({ fetchShopCurrency: vi.fn(async () => 'USD'), ShoplineAdminApiError: class extends Error {} }));
import { resolveQueuedOfferPreview } from '../src/services/offer-preview';
const session = { handle: 'queue-test', accessToken: 'test-token', scope: 'read_products' };
const context = { marketId: 'primary', currencyCode: 'USD' };
const selection = [{ productId: 'p', variantIds: ['v'] }];
afterEach(() => vi.unstubAllGlobals());
it('serializes authenticated module resolution and skips an aborted queued request', async () => {
 let active = 0, maxActive = 0, requests = 0;
 vi.stubGlobal('fetch', vi.fn(async (url: string) => {
  requests++; active++; maxActive = Math.max(active, maxActive); await new Promise(resolve => setTimeout(resolve, 5)); active--;
  return Response.json(url.includes('markets.json') ? { markets: [{ id: 'primary', primary: true, enabled: true }] } : { data: { productVariant: { id: 'gid://shopline/ProductVariant/v', productId: 'gid://shopline/Product/p', availableForSale: true, price: '1.00' } } });
 }));
 const first = resolveQueuedOfferPreview(session, selection, context);
 const controller = new AbortController(); const cancelled = resolveQueuedOfferPreview(session, selection, context, controller.signal);
 const rejected = expect(cancelled).rejects.toThrow('Aborted'); controller.abort();
 const second = resolveQueuedOfferPreview(session, selection, context);
 await first; await rejected; await second; expect(maxActive).toBe(1); expect(requests).toBe(4);
});
