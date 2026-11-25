import { env } from 'cloudflare:test';
import { afterEach, expect, it, vi } from 'vitest';
import { resolveOfferPreview } from '../src/services/offer-preview';
import type { Env } from '../src/env';
const session={handle:'demo',accessToken:'test-admin',scope:'read_products'};
const selection=[{productId:'gift-product',variantIds:['900719925474099312345']}];
function upstream(mode='valid'){return vi.fn(async(url:RequestInfo|URL)=>{
 if(String(url).includes('/products/products.json'))return Response.json({products:[{id:'gift-product',handle:'gift',title:'Actual gift',image:{src:'https://example.com/gift.png'},options:[{name:'Size'}],variants:[{id:'900719925474099312345',product_id:'gift-product'}]}]});
 if(String(url).includes('/currency/'))return Response.json({currencies:[{currency:mode==='jpy'?'JPY':'USD',enabled:true}]});
 if(String(url).includes('/markets.json'))return Response.json({markets:[{id:'primary',primary:true,enabled:true,regions:[{code:'US'}]}]});
 if(mode==='rate')return new Response('',{status:429,headers:{'Retry-After':'7'}});
 return Response.json({data:{productVariant:{id:mode==='identity'?'other':'900719925474099312345',productId:'gift-product',title:'Large',availableForSale:mode==='unavailable'?false:mode==='unknown'?undefined:true,price:mode==='no-price'?null:mode==='jpy'?'1200':'12.34',selectedOptions:[{name:'Size',value:'Large'}]}}});
});}
afterEach(()=>vi.unstubAllGlobals());
it('previews legitimate unsaved whitelist with explicit Admin availability and exact store-currency money',async()=>{
 const fetcher=upstream();vi.stubGlobal('fetch',fetcher);const result=await resolveOfferPreview(session,selection,{marketId:'primary',currencyCode:'USD',countryCode:'US'});
 expect(result.products[0]).toMatchObject({id:'gift-product',title:'Actual gift',imageUrl:'https://example.com/gift.png',optionNames:['Size'],identityVerified:true,available:true,variants:[{id:'900719925474099312345',available:true,price:{amountMinor:1234,currencyCode:'USD',currencyDecimals:2}}]});expect(fetcher.mock.calls.every(([url])=>!String(url).includes('/storefront/'))).toBe(true);
});
it.each(['identity','unknown','unavailable','no-price'])('fails closed for %s without inventory inference',async mode=>{
 vi.stubGlobal('fetch',upstream(mode));const result=await resolveOfferPreview(session,selection,{marketId:'primary',currencyCode:'USD'});expect(result.products[0].variants[0].available).toBe(false);if(mode==='no-price')expect(result.products[0].variants[0].price).toBeNull();
});
it('same-currency non-primary or unknown market cannot reuse default-context prices',async()=>{
 const fetcher=upstream();vi.stubGlobal('fetch',fetcher);for(const marketId of ['other-usd-market',undefined]){const result=await resolveOfferPreview(session,selection,{marketId,currencyCode:'USD'});expect(result.products[0].variants[0].price).toBeNull();expect(result.products[0].available).toBe(false);}expect(fetcher.mock.calls.every(([url])=>!String(url).includes('/admin/graph/'))).toBe(true);
});
it('uses trusted zero-decimal currency precision and bounded retry-after',async()=>{
 vi.stubGlobal('fetch',upstream('jpy'));const result=await resolveOfferPreview(session,selection,{marketId:'primary',currencyCode:'JPY'});expect(result.products[0].variants[0].price?.amountMinor).toBe(1200);
 vi.stubGlobal('fetch',upstream('rate'));const rate=await resolveOfferPreview(session,selection,{marketId:'primary',currencyCode:'USD'});expect(rate.retryAfter).toBe(7);expect(rate.products[0].available).toBe(false);
});
