import { env, createExecutionContext } from 'cloudflare:test';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import worker from '../src';
import { applyMigrations } from '../src/db/migrate';
import { D1CampaignRepository } from '../src/db/campaigns';
import { D1SessionStore } from '../src/db/sessions';
import { D1SubscriptionRepository } from '../src/db/subscriptions';
import { D1TranslationRepository } from '../src/db/translations';
import { offerDraft } from './helpers/offers';
import { hmacHex } from '../src/crypto';
import type { Env } from '../src/env';
const bindings={...(env as Env),SHOPLINE_APP_KEY:'offers-app',SHOPLINE_APP_SECRET:'offers-test',TOKEN_ENCRYPTION_KEY:'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY'};
let shop=''; let index=0;let revision=0;
function request(path='campaign',extra:Record<string,string>={},method='GET') { const params=new URLSearchParams({shop,productId:'main',clientFeatures:'gift-bundles-v1',...extra}); return worker.fetch(new Request(`https://example.com/public/quantity-breaks/${path}${method==='GET'?`?${params}`:''}`,{method,...(method==='POST'?{headers:{'Content-Type':'application/x-www-form-urlencoded'},body:params}: {})}),bindings,createExecutionContext()); }
beforeEach(async()=>{
 shop=`offers-${++index}`;await applyMigrations(bindings.DB);
 await new D1SessionStore(bindings.DB,bindings.TOKEN_ENCRYPTION_KEY).upsert({handle:shop,storeId:`90000${index}`,installed:true,accessToken:'test-admin-token',refreshToken:'test-refresh',scope:'read_products',expiresAt:'2099-01-01T00:00:00Z'});
 await new D1SubscriptionRepository(bindings.DB).writeEntitlement({appKey:bindings.SHOPLINE_APP_KEY,handle:shop,state:'active',featureKeys:['quantity_breaks_access'],activeSubscriptionId:'sub',activeSpuKey:'ultra',validFrom:null,validUntil:null,graceUntil:null,autoRecurring:true,absenceConfirmations:0});
 const repo=new D1CampaignRepository(bindings.DB);const c=offerDraft();c.status='draft';await repo.save(shop,c,0);const lease=await repo.beginPublication(shop,c.id,1,'publish');await repo.finishPublication(shop,c.id,1,'publish','discount',lease.owner);revision=(await repo.get(shop,c.id))!.revision;
});
afterEach(()=>vi.unstubAllGlobals());
it('negotiates native index descriptor and localized empty headings without public product proxy',async()=>{
 await new D1TranslationRepository(bindings.DB).write(shop,'fr',{'widget.gifts.title':'','widget.bundles.title':'Ensemble'});
 const response=await request('campaign',{locale:'fr'});expect(response.status).toBe(200);const result=await response.json() as any;
 expect(result).toMatchObject({version:2,campaign:{revision,gifts:{enabled:true},offerTitles:{gifts:'',bundles:'Ensemble'},catalogSource:'theme',catalogIndex:{namespace:'qb_test_offers',key:'catalog_v1',version:1},offerCapability:{functionVerified:false}}});expect(result.campaign.catalogIndex.digest).toMatch(/^[a-f0-9]{64}$/);expect(result.campaign).not.toHaveProperty('offerPaths');
 const old=await request('campaign',{clientFeatures:''});const legacy=await old.json() as any;expect(legacy.version).toBeUndefined();expect(legacy.campaign).not.toHaveProperty('gifts');
});
it('preserves legacy main collection rendering and performs no anonymous refresh with expired Admin credentials',async()=>{
 await bindings.DB.prepare("UPDATE quantity_breaks_campaigns SET campaign_json=json_set(campaign_json,'$.scope',json(?)) WHERE shop_handle=?").bind(JSON.stringify({kind:'collections',collectionIds:['collection'],resolvedProductIds:[],excludedProductIds:[]}),shop).run();
 await bindings.DB.prepare("UPDATE shopline_sessions SET expires_at='2020-01-01T00:00:00Z' WHERE handle=?").bind(shop).run();
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 const response=await request('campaign',{countryCode:'US',collectionsComplete:'true',collectionIds:'collection',collectionCount:'1'});expect(response.status).toBe(200);expect(fetcher).not.toHaveBeenCalled();
});
it('rejects unpublished, expired, out-of-scope, unsubscribed and uninstalled campaigns before native catalog authority',async()=>{
 expect((await request('campaign',{productId:'other'})).status).toBe(404);
 await bindings.DB.prepare("UPDATE quantity_breaks_publications SET state='paused' WHERE shop_handle=?").bind(shop).run();expect((await request()).status).toBe(404);
 await bindings.DB.prepare("UPDATE quantity_breaks_publications SET state='active' WHERE shop_handle=?").bind(shop).run();
 await bindings.DB.prepare("UPDATE quantity_breaks_campaigns SET campaign_json=json_set(campaign_json,'$.endsAt','2020-01-02T00:00:00Z') WHERE shop_handle=?").bind(shop).run();expect((await request()).status).toBe(404);
 await bindings.DB.prepare("UPDATE quantity_breaks_campaigns SET campaign_json=json_remove(campaign_json,'$.endsAt') WHERE shop_handle=?").bind(shop).run();
 await new D1SessionStore(bindings.DB,bindings.TOKEN_ENCRYPTION_KEY).markUninstalled(shop);expect((await request()).status).toBe(404);
});
it('rechecks current time and publication revision after an awaited upstream context lookup',async()=>{
 const clock={now:Date.now()};const local={...bindings,now:()=>clock.now};
 await bindings.DB.prepare("UPDATE quantity_breaks_campaigns SET campaign_json=json_set(campaign_json,'$.endsAt',?) WHERE shop_handle=?").bind(new Date(clock.now+1000).toISOString(),shop).run();
 vi.stubGlobal('fetch',vi.fn(async()=>{clock.now+=2000;return Response.json({markets:[]})}));
 const query=new URLSearchParams({shop,productId:'main',clientFeatures:'gift-bundles-v1',countryCode:'US'});
 expect((await worker.fetch(new Request(`https://example.com/public/quantity-breaks/campaign?${query}`),local,createExecutionContext())).status).toBe(404);
});
it('authenticates unsaved draft catalog preview, preserving exact whitelist without public publication authority',async()=>{
 const body={selection:[{productId:'gift-product',variantIds:['900719925474099312345']}],marketId:'primary',currencyCode:'USD',locale:'fr',revision:'draft-7'};
 const url='https://example.com/api/quantity-breaks/offer-preview';
 expect((await worker.fetch(new Request(url,{method:'POST',body:JSON.stringify(body)}),bindings,createExecutionContext())).status).toBe(401);
 const encode=(value:unknown)=>btoa(JSON.stringify(value)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');const head=encode({alg:'HS256',typ:'JWT'}), payload=encode({handle:shop,aud:bindings.SHOPLINE_APP_KEY,exp:Math.floor(Date.now()/1000)+3600});const signature=await hmacHex(btoa(bindings.SHOPLINE_APP_SECRET),`${head}.${payload}`);const signed=btoa(String.fromCharCode(...signature.match(/.{2}/g)!.map(part=>parseInt(part,16)))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
 vi.stubGlobal('fetch',vi.fn(async(url:RequestInfo|URL)=>String(url).includes('/products/products.json')?Response.json({products:[{id:'gift-product',handle:'gift',variants:[{id:'900719925474099312345',product_id:'gift-product'}]}]}):String(url).includes('/currency/')?Response.json({currencies:[{currency:'USD',enabled:true}]}):Response.json({markets:[]})));
 const response=await worker.fetch(new Request(url,{method:'POST',headers:{Authorization:`Bearer ${head}.${payload}.${signed}`,'Content-Type':'application/json'},body:JSON.stringify(body)}),bindings,createExecutionContext());
 expect(response.status).toBe(200);expect(await response.json()).toMatchObject({version:2,revision:'draft-7',products:[{id:'gift-product',available:false,variants:[{id:'900719925474099312345',price:null}]}]});
});
it('rejects revoked entitlement and mismatched shop identity for negotiated native authority',async()=>{
 expect((await request('campaign',{shopId:`90000${index}`,themeVersion:'2.1',shop:'another-shop'})).status).toBe(400);
 await new D1SubscriptionRepository(bindings.DB).writeEntitlement({appKey:bindings.SHOPLINE_APP_KEY,handle:shop,state:'inactive',featureKeys:[],activeSubscriptionId:null,activeSpuKey:null,validFrom:null,validUntil:null,graceUntil:null,autoRecurring:false,absenceConfirmations:0});expect((await request()).status).toBe(404);
});
it('returns409 when configuration revision changes during awaited context lookup',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>{await bindings.DB.prepare('UPDATE quantity_breaks_campaigns SET revision=revision+1 WHERE shop_handle=?').bind(shop).run();return Response.json({markets:[]})}));
 expect((await request('campaign',{countryCode:'CA'})).status).toBe(409);
});
