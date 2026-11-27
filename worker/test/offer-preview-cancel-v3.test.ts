import { afterEach, expect, it, vi } from 'vitest';
import { resolveQueuedOfferPreview } from '../src/services/offer-preview';
afterEach(() => vi.unstubAllGlobals());
for (const stage of ['products/products.json', 'currency/currencies.json']) it(`cancels an active ${stage} fetch and releases the store queue`, async () => {
 const session = { handle: 'cancel-test', accessToken: stage, scope: 'read_products' };
 const selection = [{ productId: 'p', variantIds: ['v'] }]; const context = { marketId: 'primary', currencyCode: 'USD' };
 let started!: () => void; const ready = new Promise<void>(resolve => { started = resolve; }); let block = true, aborted = false;
 vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
  if (url.includes(stage) && block) { block = false; started(); return await new Promise<Response>((_, reject) => init.signal!.addEventListener('abort', () => { aborted = true; reject(new DOMException('Aborted', 'AbortError')); }, { once: true })); }
  if (url.includes('products/products.json')) return Response.json({products:[{id:'p',handle:'p',variants:[{id:'v',product_id:'p'}]}]});
  if (url.includes('currency/currencies.json')) return Response.json({currencies:[{currency:'USD',enabled:true}]});
  if (url.includes('markets.json')) return Response.json({markets:[{id:'primary',primary:true,enabled:true}]});
  return Response.json({data:{productVariant:{id:'gid://shopline/ProductVariant/v',productId:'gid://shopline/Product/p',availableForSale:true,price:'1.00'}}});
 }));
 const controller = new AbortController(); const first = resolveQueuedOfferPreview(session, selection, context, controller.signal); const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' });
 await ready; const second = resolveQueuedOfferPreview(session, selection, context); controller.abort(); await rejected;
 expect((await second).products[0].available).toBe(true); expect(aborted).toBe(true);
});
