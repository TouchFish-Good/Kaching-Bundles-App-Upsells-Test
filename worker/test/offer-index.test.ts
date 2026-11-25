import { env } from 'cloudflare:test';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { applyMigrations } from '../src/db/migrate';
import { D1CampaignRepository } from '../src/db/campaigns';
import { D1SessionStore } from '../src/db/sessions';
import { campaignRepository, buildOfferIndex, writeOfferIndex } from '../src/services/offer-index';
import { offerConfigDigest } from '../src/services/offer-config';
import { offerDraft } from './helpers/offers';
import type { Env } from '../src/env';
const bindings={...(env as Env),TOKEN_ENCRYPTION_KEY:'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY',SHOPLINE_PRODUCT_DISCOUNT_FUNCTION_ID:'test-function',SHOPLINE_OFFER_FUNCTION_CAPABILITIES:JSON.stringify({demo:{functionId:'test-function',protocol:'gift-bundles-v1',skuIsVariantId:true,lineTotalTargets:true}})};
const session={handle:'demo',accessToken:'test-only-admin',scope:'read_products,write_products'};
function product(id='gift-product',variant='900719925474099312345'){return {id,handle:`handle-${id}`,variants:[{id:variant,product_id:id}]};}
let stored:any;
function upstream(){return vi.fn(async (url:RequestInfo|URL,init?:RequestInit)=>{
 const target=new URL(String(url));
 if(target.pathname.endsWith('/products/products.json'))return Response.json({products:[product()]});
 if(init?.method==='POST'||init?.method==='PUT'){const body=JSON.parse(String(init.body));stored={id:'900719925474099312399',namespace:'qb_test_offers',key:'catalog_v1',owner_resource:'shop',type:'json',...body.metafield};return Response.json({metafield:stored});}
 return Response.json({metafields:stored?[stored]:[]});
});}
beforeEach(async()=>{await applyMigrations(bindings.DB);stored=undefined;await bindings.DB.batch(['quantity_breaks_campaigns','quantity_breaks_publications','quantity_breaks_shop_locks','quantity_breaks_staged_updates'].map(table=>bindings.DB.prepare(`DELETE FROM ${table}`)));await new D1SessionStore(bindings.DB,bindings.TOKEN_ENCRYPTION_KEY).upsert({...session,storeId:'900001',refreshToken:'test-only-refresh',expiresAt:'2099-01-01T00:00:00Z',installed:true});});
afterEach(()=>vi.unstubAllGlobals());
it('digest ignores lifecycle/style/title but detects exact whitelist and scope changes',async()=>{
 const c=offerDraft(),first=await offerConfigDigest(c);expect(first).toMatch(/^[a-f0-9]{64}$/);
 c.gifts!.items[0].label='new visual';c.gifts!.style.mobile.image.sizePx=150;expect(await offerConfigDigest({...c,status:'scheduled',revision:99} as any)).toBe(first);
 c.gifts!.items[0].allowedVariantIds=['900719925474099312346'];expect(await offerConfigDigest(c)).not.toBe(first);
});
it('builds aggregate exact native references without price/stock and never drops another published campaign',async()=>{
 const c=offerDraft(),other={...offerDraft(),id:'other',scope:{kind:'products' as const,productIds:['main-other'],excludedProductIds:[]}};
 const fetcher=upstream();vi.stubGlobal('fetch',fetcher);
 const index=await buildOfferIndex(session,[other],c);expect(index.entries.map(entry=>entry.campaignId)).toEqual(['offers','other']);expect(index.entries[0]).toMatchObject({products:[{id:'gift-product',handle:'handle-gift-product',variantIds:['900719925474099312345']}],scope:{kind:'products',productIds:['main']}});expect(JSON.stringify(index)).not.toMatch(/price|stock|token|Visual|style/);
});
it.each(['foreign-product','foreign-variant','numeric-id','missing-handle'])('rejects %s identities rather than guessing',async mode=>{
 const p=product();if(mode==='foreign-product')p.id='foreign';if(mode==='foreign-variant')p.variants[0].id='foreign';if(mode==='numeric-id')(p as any).id=9007199254740993;if(mode==='missing-handle')p.handle='';vi.stubGlobal('fetch',vi.fn(async()=>Response.json({products:[p]})));
 await expect(buildOfferIndex(session,[],offerDraft())).rejects.toThrow(/identity|variant|handle|Product/i);
});
it('uses exact namespace/key, idempotent create/readback and known-ID update with required Admin headers',async()=>{
 const fetcher=upstream();vi.stubGlobal('fetch',fetcher);const index=await buildOfferIndex(session,[],offerDraft());
 await writeOfferIndex(session,index);await writeOfferIndex(session,index);const changed={...index,entries:[]};await writeOfferIndex(session,changed);
 const mutations=fetcher.mock.calls.filter(([,init])=>init?.method==='POST'||init?.method==='PUT');expect(mutations.map(([,init])=>init?.method)).toEqual(['POST','PUT']);expect(String(mutations[1][0])).toContain('/metafields/900719925474099312399.json');for(const [,init] of mutations){const headers=new Headers(init?.headers);expect(headers.get('Accept')).toBe('application/json');expect(headers.get('User-Agent')).toBe('SHOPLINE-Quantity-Breaks-App/1.0');}
});
it('syncs candidate overlay inside existing lease before acknowledgement and keeps digest after final row revision',async()=>{
 const fetcher=upstream();vi.stubGlobal('fetch',fetcher);const repo=campaignRepository(bindings),c=offerDraft();c.status='draft';await repo.save('demo',c,0);
 const lease=await repo.beginPublication('demo',c.id,1,'publish');expect(stored.value.entries).toHaveLength(1);expect((await repo.get('demo',c.id))?.revision).toBe(1);
 const done=await repo.finishPublication('demo',c.id,1,'publish','discount',lease.owner);expect(stored.value.entries[0].digest).toBe(await offerConfigDigest(done));expect(done.revision).toBe(2);
});
it('index write failure leaves publication unacknowledged and releases the shop lease for safe retry',async()=>{
 const fetcher=upstream();vi.stubGlobal('fetch',vi.fn(async(url:RequestInfo|URL,init?:RequestInit)=>init?.method==='POST'?new Response('',{status:503}):fetcher(url,init)));
 const repo=campaignRepository(bindings),c=offerDraft();c.status='draft';await repo.save('demo',c,0);await expect(repo.beginPublication('demo',c.id,1,'publish')).rejects.toThrow();expect((await repo.getPublication('demo',c.id)).state).toBe('idle');expect((await repo.get('demo',c.id))?.status).toBe('draft');expect(await bindings.DB.prepare('SELECT * FROM quantity_breaks_shop_locks').first()).toBeNull();
});
it('stale lease owner cannot write the index or acknowledge publication',async()=>{
 const fetcher=upstream();vi.stubGlobal('fetch',vi.fn(async(url:RequestInfo|URL,init?:RequestInit)=>{if(String(url).includes('/metafields.json')&&!init?.method)await bindings.DB.prepare("UPDATE quantity_breaks_shop_locks SET owner='another-owner'").run();return fetcher(url,init)}));
 const repo=campaignRepository(bindings),c=offerDraft();c.status='draft';await repo.save('demo',c,0);await expect(repo.beginPublication('demo',c.id,1,'publish')).rejects.toThrow(/lock|lease/i);expect(stored).toBeUndefined();
});
it('pure v1 publication adds no index requests',async()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);const repo=campaignRepository(bindings),c=offerDraft();delete c.gifts;c.status='draft';await repo.save('demo',c,0);const lease=await repo.beginPublication('demo',c.id,1,'publish');await repo.finishPublication('demo',c.id,1,'publish','discount',lease.owner);expect(fetcher).not.toHaveBeenCalled();
});
it('publication of a second campaign and disabling the first preserves all other index entries',async()=>{
 const fetcher=upstream();vi.stubGlobal('fetch',fetcher);const repo=campaignRepository(bindings);
 for(const id of ['first','second']){const c={...offerDraft(),id,status:'draft' as const,scope:{kind:'products' as const,productIds:[`main-${id}`],excludedProductIds:[]}};await repo.save('demo',c,0);const lease=await repo.beginPublication('demo',id,1,'publish');await repo.finishPublication('demo',id,1,'publish',`discount-${id}`,lease.owner);}
 expect(stored.value.entries.map((entry:any)=>entry.campaignId)).toEqual(['first','second']);
 const first=(await repo.get('demo','first'))!;first.gifts!.enabled=false;const update=await repo.beginUpdate('demo',first,first.revision,'discount-first');expect(stored.value.entries.map((entry:any)=>entry.campaignId)).toEqual(['second']);await repo.finishUpdate('demo','first',first.revision,'discount-first',update.owner);expect(stored.value.entries[0].digest).toBe(await offerConfigDigest((await repo.get('demo','second'))!));
});
it('unconfirmed index readback never acknowledges a publication and can safely retry',async()=>{
 const base=upstream();let reads=0;vi.stubGlobal('fetch',vi.fn(async(url:RequestInfo|URL,init?:RequestInit)=>{if(String(url).includes('/metafields.json')&&!init?.method&&++reads>1)return Response.json({metafields:[]});return base(url,init)}));
 const repo=campaignRepository(bindings),c=offerDraft();c.status='draft';await repo.save('demo',c,0);await expect(repo.beginPublication('demo',c.id,1,'publish')).rejects.toThrow(/readback/);expect((await repo.getPublication('demo',c.id)).state).toBe('idle');expect((await repo.get('demo',c.id))?.revision).toBe(1);
 vi.stubGlobal('fetch',base);const lease=await repo.beginPublication('demo',c.id,1,'publish');await repo.finishPublication('demo',c.id,1,'publish','discount',lease.owner);expect((await repo.getPublication('demo',c.id)).state).toBe('active');
});
it('unsafe numeric metafield identities are rejected before update rather than rounded',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({metafields:[{id:9007199254740993,namespace:'qb_test_offers',key:'catalog_v1',owner_resource:'shop',type:'json',value:{version:1,entries:[]}}]})));
 await expect(writeOfferIndex(session,{version:1,entries:[]})).rejects.toThrow(/unsafe/);
});
it('requires explicit Function capability before any index mutation or catalog request',async()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);const repo=campaignRepository({...bindings,SHOPLINE_OFFER_FUNCTION_CAPABILITIES:undefined}),c=offerDraft();c.status='draft';await repo.save('demo',c,0);await expect(repo.beginPublication('demo',c.id,1,'publish')).rejects.toThrow(/capability/);expect(fetcher).not.toHaveBeenCalled();
});
