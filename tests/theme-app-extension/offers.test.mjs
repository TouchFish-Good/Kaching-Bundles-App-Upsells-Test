import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setupOffers,offerCampaign,offerMarkup,digest,rule } from './helpers/offer-fixture.mjs';
import { renderOs21,os21Context } from './helpers/os21-fixture.mjs';

test('native block negotiates v2 and includes cumulative immutable gifts, with multiple cancelable bundles', async () => {
  const h=setupOffers(); await h.theme.mountBlock(h.block);
  assert.equal(new URL(h.calls[0].url).searchParams.get('clientFeatures'),'gift-bundles-v1');
  assert.equal(h.block.querySelectorAll('[data-offer-role="gift"][data-included="true"]').length,2);
  assert.equal(h.block.querySelectorAll('[data-offer-role="gift"] input[type="checkbox"]').length,0);
  h.block.querySelector('[data-offer-rule="c"] [data-offer-select]').click();
  h.block.querySelector('[data-offer-rule="d"] [data-offer-select]').click();
  assert.equal(h.block.querySelectorAll('[data-offer-role="bundle"][data-included="true"]').length,2);
  assert.equal(h.block.querySelector('[data-bundle-total]').textContent,'$60.00');
  h.block.querySelector('[data-tier-id="t2"] .qb-tier-header').click();
  assert.equal(h.block.querySelectorAll('[data-offer-role="gift"][data-included="true"]').length,1);
  assert.equal(h.calls.length,1,'no accessory network transport');
});
test('native accessory nodes cannot contaminate main variants; missing price and foreign digest preserve main add', async () => {
  for (const change of [s=>s.replace('data-digest="'+digest+'"','data-digest="'+'b'.repeat(64)+'"'), s=>s.replaceAll('data-price="2000"','data-price=""').replaceAll('data-price="4000"','data-price=""')]) {
    const h=setupOffers({markup:change(offerMarkup())});
    assert.equal(h.theme.readCatalog(h.block).variants.length,1);
    await h.theme.mountBlock(h.block);
    assert.equal(h.block.querySelector('[data-add-bundle]').disabled,false);
    assert.equal(h.block.querySelectorAll('[data-offer-role="gift"][data-included="true"]').length,0);
  }
});
test('variant slots and selected bundle rules survive resize and revised matching campaign', async () => {
  const h=setupOffers(); await h.theme.mountBlock(h.block);
  h.block.querySelector('[data-offer-rule="c"] [data-offer-select]').click();
  const select=h.block.querySelector('[data-offer-rule="c"] select'); Array.from(select.options).forEach(option=>option.selected=option.value==='v-c-2'); select.dispatchEvent(new h.window.Event('change'));
  h.resize();
  assert.equal(h.block.querySelector('[data-offer-rule="c"]').dataset.included,'true');
  assert.equal(h.block.querySelector('[data-offer-rule="c"] select').value,'v-c-2');
  const next=offerCampaign(); next.revision=4; next.bundles.items.reverse();
  await h.theme.mountBlock(h.block,async()=>({ok:true,json:async()=>({version:2,clientFeatures:'gift-bundles-v1',campaign:next})}));
  assert.equal(h.block.querySelector('[data-offer-rule="c"] select').value,'v-c-2');
});
test('huge configured gift and shopper quantity remain unavailable without per-unit allocation', async () => {
  const campaign=offerCampaign(); campaign.gifts.items[0].quantity=4294967296;
  const h=setupOffers({campaign}); await h.theme.mountBlock(h.block);
  assert.equal(h.block.querySelector('[data-offer-rule="a"]').dataset.included,'false');
  h.block.querySelector('[data-offer-rule="c"] [data-offer-select]').click();
  const input=h.block.querySelector('[data-offer-rule="c"] input[type="number"]'); input.value='4294967296'; input.dispatchEvent(new h.window.Event('change'));
  assert.equal(h.block.querySelector('[data-offer-rule="c"]').dataset.included,'false');
  assert.equal(h.block.querySelector('[data-offer-rule="c"] input[type="number"]').value,'4294967296');
  assert.equal(h.block.querySelector('[data-add-bundle]').disabled,false);
});
test('legacy and disabled offers do not request accessory scripts/catalog or add accessory UI', async () => {
  const campaign=offerCampaign(); campaign.gifts.enabled=false; campaign.bundles.enabled=false;
  const h=setupOffers({campaign,response:{campaign}}); await h.theme.mountBlock(h.block);
  assert.equal(h.calls.length,1); assert.equal(h.block.querySelector('[data-offer-role]'),null);
});
test('composite cart submits one flat hidden-property batch and confirms by exact role identity only', async () => {
  const h=setupOffers(); await h.theme.mountBlock(h.block);
  const items=h.theme.buildCompositeItems([{id:'v-main',quantity:4}], [{id:'v-a',quantity:1,role:'gift',ruleId:'a',productId:'p-a',handle:'p-a'}], {campaignId:'offers',productId:'main',productHandle:'main-handle',context:'ctx'});
  assert.equal(items.length,2);
  for (const item of items) for (const p of item.properties) assert.deepEqual({type:p.type,show:p.show,roleVisibility:p.roleVisibility},{type:'text',show:false,roleVisibility:'none'});
  let posts=0,reads=0;
  const result=await h.theme.addComposite(items,async(url,init)=>{assert.equal(url,'/cart/add');posts++; const body=JSON.parse(init.body);assert.equal(body.items.length,2);assert.equal(body.items[0].item_components,undefined); throw Error('timeout');},async()=>{reads++; return {items:reads===1 ? [] : [{id:'v-main',quantity:4,properties:items[0].properties},{id:'v-a',quantity:1,properties:null}]};});
  assert.equal(posts,1);assert.equal(reads,2);assert.equal(result.status,'uncertain');
});

test('v2 capability, native context, exact digest/whitelist and explicit availability are required independently', async () => {
  for (const mutate of [
    c=>c.offerCapability.functionVerified=false,
    c=>c.catalogSource='https://foreign.invalid/products',
    c=>c.catalogIndex.namespace='foreign',
    c=>c.gifts.items[0].allowedVariantIds=['forged'],
  ]) {
    const campaign=offerCampaign(),markup=offerMarkup(campaign);mutate(campaign);
    const h=setupOffers({campaign,markup});await h.theme.mountBlock(h.block);
    assert.equal(h.block.querySelector('[data-offer-rule="a"]').dataset.included,'false');
    assert.equal(h.block.querySelector('[data-add-bundle]').disabled,false);assert.equal(h.calls.length,1);
  }
  for (const markup of [offerMarkup().replace('data-offer-native-catalog data-currency="USD"','data-offer-native-catalog data-currency="JPY"'),offerMarkup().replaceAll('data-available="true"','data-available="unknown"').replace('data-price="1000" data-available="unknown"','data-price="1000" data-available="true"')]) {
    const h=setupOffers({markup});await h.theme.mountBlock(h.block);
    assert.equal(h.block.querySelector('[data-offer-rule="a"]').dataset.included,'false');assert.equal(h.block.querySelector('[data-add-bundle]').disabled,false);
  }
});
test('exact native money distinguishes SLine hundredths from Handlebars currency subunits',()=>{
  const {theme}=setupOffers();
  for(const [value,currency,version,expected] of [['1999','USD','3',1999],['12300','JPY','3',123],['123','JPY','2.1',123],['123.5','JPY','3',null],['','USD','3',null],['900719925474099312345','USD','3',null],['0','USD','3',0],['10','ZZZ','3',null]]) assert.equal(theme.nativePriceMinor(value,currency,version),expected);
});
test('OS2.1 native template preloads lower scheduled candidates, filters product scope, deduplicates and bounds 20 handles',()=>{
  const context=structuredClone(os21Context),lookups=[];
  context.all_products=new Proxy({}, {get(_,handle){lookups.push(handle);return {id:handle,handle,title:handle,variants:[{id:`v-${handle}`,title:'S',price:1200,available:true}]};}});
  const entry=(campaignId,scope,handles)=>({campaignId,digest,scope,startsAt:'2099-01-01T00:00:00Z',products:handles.map(handle=>({id:handle,handle,variantIds:[`v-${handle}`]}))});
  context.shop.metafields={qb_test_offers:{catalog_v1:{value:{version:1,entries:[
    entry('irrelevant',{kind:'products',productIds:['other']},['irrelevant']),
    entry('lower',{kind:'all'},['lower','shared']),
    entry('future',{kind:'products',productIds:[context.product.id]},['higher','shared']),
    entry('excluded',{kind:'all',excludedProductIds:[context.product.id]},['excluded']),
    entry('many',{kind:'collections',collectionIds:['unknown-complete-membership']},Array.from({length:25},(_,i)=>`extra-${i}`)),
  ]}}}};
  const {block}=setupOffers({markup:renderOs21(context)});
  assert.equal(lookups[0],'higher');assert.equal(lookups.filter(id=>id==='shared').length,1);assert.equal(lookups.length,20);
  assert.equal(lookups.includes('irrelevant'),false);assert.equal(lookups.includes('excluded'),false);
  assert.ok(block.querySelector('[data-offer-entry="lower"]'),'future higher priority cannot suppress lower preload');
  assert.equal(block.querySelectorAll('[data-offer-product]').length,20);
});
test('timeout can confirm complete exact composite identities, and never retries a POST',async()=>{
  const {theme}=setupOffers();const items=theme.buildCompositeItems([{id:'main-v',quantity:4}],[{id:'gift-v',quantity:1,role:'gift',ruleId:'a',productId:'gift-p'}],{campaignId:'offers',productId:'main',context:'ctx'});
  let reads=0,posts=0;
  const result=await theme.addComposite(items,async()=>{posts++;throw Error('timeout');},async()=>({items:++reads===1?[]:items.map((item,i)=>({...item,key:`actual-${i}`}))}));
  assert.equal(result.status,'added');assert.equal(result.cartResponse.items[1].key,'actual-1');assert.equal(posts,1);assert.equal(reads,2);
});
test('theme events use actual accessory product/handle and exact property line key',async()=>{
  const {theme}=setupOffers();const items=theme.buildCompositeItems([{id:'main-v',quantity:2}],[{id:'gift-v',quantity:1,role:'gift',ruleId:'a',productId:'gift-p',handle:'gift-handle'}],{campaignId:'offers',productId:'main',productHandle:'main-handle',context:'ctx'});
  const events=[];const host={themeEventCenter:{dispatch:e=>events.push(e)},ThemeEvent:class{constructor(type,{detail}){this.type=type;this.detail=detail;}}};
  await theme.notifyThemeCartUpdated(items,{productId:'main',productHandle:'main-handle',cartResponse:{items:[{id:'gift-v',key:'normal-gift',properties:null},...items.map((item,i)=>({...item,key:`actual-${i}`}))]}},host);
  const gift=events.find(e=>e.type==='variant:added'&&e.detail.variantId==='gift-v');
  assert.equal(gift.detail.productId,'gift-p');assert.equal(gift.detail.productHandle,'gift-handle');assert.equal(gift.detail.lineItemKey,'actual-1');
});
test('native single selection fallback chooses maximum actual savings and supports cancellation',async()=>{
  const campaign=offerCampaign();campaign.bundles.selectionMode='single';campaign.bundles.items[1].discountValue=7500;
  const h=setupOffers({campaign});await h.theme.mountBlock(h.block);
  assert.equal(h.block.querySelector('[data-offer-rule="d"]').dataset.included,'true');
  h.block.querySelector('[data-offer-rule="d"] [data-offer-select]').click();
  assert.equal(h.block.querySelectorAll('[data-offer-role="bundle"][data-included="true"]').length,0);
  h.block.querySelector('[data-offer-rule="c"] [data-offer-select]').click();
  assert.equal(h.block.querySelector('[data-offer-rule="c"]').dataset.included,'true');
});
test('stale locale response is discarded and independent simultaneous blocks deduplicate negotiation',async()=>{
  let resolve,calls=0;const promise=new Promise(r=>resolve=r);
  const h=setupOffers({fetcher:()=>{calls++;return promise;}});
  const second=h.block.cloneNode(true);h.document.append(second);
  const a=h.theme.mountBlock(h.block),b=h.theme.mountBlock(second);
  h.block.dataset.locale='fr';
  resolve({ok:true,json:async()=>({version:2,clientFeatures:'gift-bundles-v1',campaign:offerCampaign()})});await Promise.all([a,b]);
  assert.equal(calls,1);assert.equal(h.block.hidden,true);assert.equal(second.hidden,false);
});
test('revision resets only removed invalid rule slots and retains valid shopper choices',async()=>{
  const h=setupOffers();await h.theme.mountBlock(h.block);
  h.block.querySelector('[data-offer-rule="c"] [data-offer-select]').click();
  const next=offerCampaign();next.revision++;next.bundles.items[0].allowedVariantIds=['v-c-2'];
  await h.theme.mountBlock(h.block,async()=>({ok:true,json:async()=>({version:2,clientFeatures:'gift-bundles-v1',campaign:next})}));
  assert.equal(h.block.querySelector('[data-offer-rule="c"]').dataset.included,'true');
  assert.equal(h.block.querySelector('[data-offer-rule="c"] select').value,'v-c-2');
});
test('unsafe aggregate accessories are visibly unavailable and huge main tier cannot allocate or silently change quantity',async()=>{
  const campaign=offerCampaign(),h=setupOffers({campaign,markup:offerMarkup(campaign).replaceAll('data-price="2000"','data-price="5000000000000000"')});
  await h.theme.mountBlock(h.block);
  assert.equal(h.block.querySelectorAll('[data-offer-role="gift"][data-included="true"]').length,0);
  assert.equal(h.block.querySelector('[data-bundle-total]').textContent,'$40.00');
  const huge=offerCampaign();huge.tiers[2].quantity=4294967296;
  const h2=setupOffers({campaign:huge});await h2.theme.mountBlock(h2.block);
  assert.ok(h2.block.querySelector('[data-tier-id="t4"]'));
  assert.equal(h2.block.querySelector('[data-add-bundle]').disabled,true);
  assert.ok(h2.block.querySelector('[data-add-bundle]').textContent.includes('4294967296'));
});
test('a hanging composite POST reaches an uncertain result after its deadline with read-only confirmation',async()=>{
  const timers=[];const {theme}=setupOffers({timers:{setTimeout(fn){timers.push(fn);return fn;},clearTimeout(fn){const index=timers.indexOf(fn);if(index>=0)timers.splice(index,1);}}});
  const items=theme.buildCompositeItems([{id:'main-v',quantity:1}],[],{campaignId:'offers',productId:'main',context:'ctx'});
  let posts=0,reads=0;
  const pending=theme.addComposite(items,()=>{posts++;return new Promise(()=>{});},async()=>{reads++;return {items:[]};});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(timers.length,1,'a POST deadline is armed');timers.shift()();
  const result=await pending;assert.equal(result.status,'uncertain');assert.equal(posts,1);assert.equal(reads,2);
});
test('selected bundles use localized Included copy and French receipt omits protocol role strings',async()=>{
  const markup=offerMarkup().replaceAll('data-locale="en"','data-locale="fr"').replace('<div data-offer-native-catalog','<span data-qb-copy="widget.offer_included" hidden>Inclus</span><span data-qb-copy="widget.offer_select" hidden>Sélectionner</span><div data-offer-native-catalog');
  const h=setupOffers({markup});await h.theme.mountBlock(h.block);
  assert.equal(h.block.querySelector('[data-offer-rule="c"] [data-offer-select]').textContent,'Sélectionner');
  h.block.querySelector('[data-offer-rule="c"] [data-offer-select]').click();
  assert.equal(h.block.querySelector('[data-offer-rule="c"] [data-offer-select]').textContent,'Inclus');
  const receipt=h.block.querySelectorAll('.qb-offer-receipt');
  assert.equal(receipt.length,3);assert.doesNotMatch(Array.from(receipt,row=>row.textContent).join(' '),/gift:|bundle:/);
  assert.equal(receipt[0].dataset.offerRole,'gift');assert.equal(receipt[2].dataset.offerRole,'bundle');
});
