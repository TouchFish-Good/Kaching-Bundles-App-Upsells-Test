import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setupOffers,offerCampaign,offerMarkup,digest,rule,changeOfferSelection } from './helpers/offer-fixture.mjs';
import { renderOs21,os21Context } from './helpers/os21-fixture.mjs';

test('native block negotiates v2 and includes cumulative immutable gifts, with multiple cancelable bundles', async () => {
  const h=setupOffers(); await h.theme.mountBlock(h.block);
  assert.equal(new URL(h.calls[0].url).searchParams.get('clientFeatures'),'gift-bundles-v1');
  assert.equal(h.block.querySelectorAll('[data-offer-role="gift"][data-included="true"]').length,2);
  assert.equal(h.block.querySelectorAll('[data-offer-role="gift"] input[type="checkbox"]').length,0);
  assert.equal(h.block.querySelector('[data-check-cart]'),null,'no extra cart-check control is rendered');
  changeOfferSelection(h,'c');
  changeOfferSelection(h,'d');
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
  changeOfferSelection(h,'c');
  const select=h.block.querySelector('[data-offer-rule="c"] select'); Array.from(select.options).forEach(option=>option.selected=option.value==='v-c-2'); select.dispatchEvent(new h.window.Event('change'));
  h.resize();
  assert.equal(h.block.querySelector('[data-offer-rule="c"]').dataset.included,'true');
  assert.equal(h.block.querySelector('[data-offer-rule="c"] select').value,'v-c-2');
  const next=offerCampaign(); next.revision=4; next.bundles.items.reverse();
  await h.theme.mountBlock(h.block,async()=>({ok:true,json:async()=>({version:2,clientFeatures:'gift-bundles-v1',campaign:next})}));
  assert.equal(h.block.querySelector('[data-offer-rule="c"] select').value,'v-c-2');
});
test('huge gift remains unavailable while valid historical bundle quantity becomes one', async () => {
  const campaign=offerCampaign(); campaign.gifts.items[0].quantity=4294967296;campaign.bundles.items[0].quantity=4294967296;
  const h=setupOffers({campaign}); await h.theme.mountBlock(h.block);
  assert.equal(h.block.querySelector('[data-offer-rule="a"]').dataset.included,'false');
  changeOfferSelection(h,'c');
  assert.equal(h.block.querySelector('[data-offer-rule="c"]').dataset.included,'true');
  assert.equal(h.block.querySelector('[data-offer-rule="c"] input[type="number"]'),null);
  assert.equal(h.block.querySelectorAll('[data-offer-rule="c"] select').length,1);
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
  for (const item of items) for (const p of item.properties) {
    assert.equal(p.type,'text');assert.equal(p.roleVisibility,'none');
    assert.equal(Object.hasOwn(p,'show'),false,'mutually exclusive visibility inputs must not be sent together');
  }
  let posts=0,reads=0;
  const result=await h.theme.addComposite(items,async(url,init)=>{assert.equal(url,'/cart/add');posts++; const body=JSON.parse(init.body);assert.equal(body.items.length,2);assert.equal(body.items[0].item_components,undefined); throw Error('timeout');},async()=>{reads++; return {items:reads===1 ? [] : [{id:'v-main',quantity:4,properties:items[0].properties},{id:'v-a',quantity:1,properties:null}]};});
  assert.equal(posts,1);assert.equal(reads,2);assert.equal(result.status,'uncertain');
});
test('composite add accepts equivalent hidden visibility defaults in the platform response',async()=>{
  const {theme}=setupOffers();
  const items=theme.buildCompositeItems([{id:'main-v',quantity:2}],[{id:'gift-v',quantity:1,role:'gift',ruleId:'a',productId:'gift-p'}],{campaignId:'offers',productId:'main',context:'ctx'});
  let posts=0;
  const result=await theme.addComposite(items,async(url,init)=>{
    assert.equal(url,'/cart/add');posts++;
    const sent=JSON.parse(init.body).items;
    for(const item of sent)for(const p of item.properties)assert.equal(Object.hasOwn(p,'show'),false);
    return {ok:true,json:async()=>({items:sent.map(item=>({...item,properties:item.properties.map(p=>({...p,show:false}))}))})};
  },async()=>({items:[]}));
  assert.equal(result.status,'added');assert.equal(posts,1);
});
test('visibility normalization rejects differently visible or invalid cart lines',async()=>{
  const {theme}=setupOffers();
  const items=theme.buildCompositeItems([{id:'main-v',quantity:1}],[{id:'gift-v',quantity:1,role:'gift',ruleId:'a',productId:'gift-p'}],{campaignId:'offers',productId:'main',context:'ctx'});
  for(const roleVisibility of ['customer','merchant','all','invalid']){
    const visible=items.map(item=>({...item,properties:item.properties.map(p=>({...p,roleVisibility}))}));
    let reads=0;
    const result=await theme.addComposite(items,async()=>({ok:true,json:async()=>({items:visible})}),async()=>({items:++reads===1?[]:visible}));
    assert.equal(result.status,'uncertain',roleVisibility);
  }
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
test('OS2.1 rendered index resolves a native gift through nested scopes and mounts its title and price',async()=>{
  const context=structuredClone(os21Context),campaign=offerCampaign();
  context.product.id='main';campaign.gifts.items=[rule('a')];campaign.bundles.enabled=false;
  context.all_products={'gift-handle':{id:'p-a',handle:'gift-handle',title:'Native gift T-shirt',featured_image:'//cdn.example.com/gift.jpg',variants:[
    {id:'v-a',title:'S',price:2000,available:true},
    {id:'v-a-2',title:'L',price:4000,available:false},
  ]}};
  context.shop.metafields={qb_test_offers:{catalog_v1:{value:{version:1,entries:[{
    campaignId:'offers',digest,scope:{kind:'products',productIds:['main'],excludedProductIds:['p-a']},
    products:[{id:'p-a',handle:'gift-handle',variantIds:['v-a','v-a-2']}],
  }]}}}};
  const h=setupOffers({campaign,markup:renderOs21(context)});
  assert.equal(h.block.querySelector('[data-offer-product="p-a"]')?.dataset.title,'Native gift T-shirt');
  await h.theme.mountBlock(h.block);
  const card=h.block.querySelector('[data-offer-rule="a"]');
  assert.equal(card?.dataset.included,'true');
  assert.equal(card.querySelector('.qb-offer-title').textContent,'Native gift T-shirt');
  assert.equal(card.querySelector('img')?.getAttribute('src'),'https://cdn.example.com/gift.jpg');
  assert.match(card.textContent,/\$20\.00/);
  assert.doesNotMatch(card.textContent,/Unavailable/);
  assert.equal(card.querySelectorAll('select option').length,1,'sold out variant is not selectable');
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
test('single bundles preserve empty, canceled, ineligible and unavailable intentional choices without paid substitution',async()=>{
  const campaign=offerCampaign();campaign.bundles.selectionMode='single';campaign.bundles.items[1].discountValue=7500;campaign.bundles.items[0].trigger.quantity=3;
  const h=setupOffers({campaign});await h.theme.mountBlock(h.block);
  const included=()=>Array.from(h.block.querySelectorAll('[data-offer-role="bundle"][data-included="true"]'),n=>n.dataset.offerRule);
  assert.deepEqual(included(),[],'initial mount cannot opt into a paid item');
  changeOfferSelection(h,'c');
  assert.deepEqual(included(),['c'],'larger saving on unchosen d cannot replace c');
  h.block.querySelector('[data-tier-id="t2"] .qb-tier-header').click();
  assert.deepEqual(included(),[],'eligible but unchosen d cannot replace now-ineligible c');
  h.block.querySelector('[data-tier-id="t4"] .qb-tier-header').click();
  assert.deepEqual(included(),['c'],'chosen rule survives temporary ineligibility');
  const unavailable=structuredClone(campaign);unavailable.revision++;unavailable.marketId="local";unavailable.bundles.items[0].marketOverrides={local:{mode:"specified_amount",currencyCode:"JPY",amountMinor:1}};
  await h.theme.mountBlock(h.block,async()=>({ok:true,json:async()=>({version:2,clientFeatures:'gift-bundles-v1',campaign:unavailable})}));

  assert.deepEqual(included(),[],'unavailable c cannot substitute ready d');h.resize();assert.deepEqual(included(),[]);
  const next=structuredClone(campaign);next.revision++;next.bundles.items=next.bundles.items.filter(r=>r.ruleId!=='c');
  await h.theme.mountBlock(h.block,async()=>({ok:true,json:async()=>({version:2,clientFeatures:'gift-bundles-v1',campaign:next})}));
  assert.deepEqual(included(),[],'deleted chosen rule leaves empty selection');
  changeOfferSelection(h,'d');assert.deepEqual(included(),['d']);
  changeOfferSelection(h,'d');h.resize();assert.deepEqual(included(),[]);
});
test('single bundle monetary fallback considers only anomalous explicitly selected rules',async()=>{
  const campaign=offerCampaign();campaign.bundles.items[1].discountValue=7500;
  const h=setupOffers({campaign});await h.theme.mountBlock(h.block);
  changeOfferSelection(h,'c');changeOfferSelection(h,'d');
  const next=structuredClone(campaign);next.revision++;next.bundles.selectionMode='single';
  await h.theme.mountBlock(h.block,async()=>({ok:true,json:async()=>({version:2,clientFeatures:'gift-bundles-v1',campaign:next})}));
  assert.equal(h.block.querySelector('[data-offer-rule="d"]').dataset.included,'true');
  assert.equal(h.block.querySelector('[data-offer-rule="c"]').dataset.included,'false');
});
test('all configured accessory Products are excluded from main eligibility, quotas, unlock and receipt',async()=>{
  for(const missingNative of [false,true]) {
    const campaign=offerCampaign();
    const h=setupOffers({campaign,markup:offerMarkup(campaign).replace('data-product-id="main"','data-product-id="p-a"').replace(missingNative?'data-offer-product="p-a"':'NO-MATCH','data-offer-product="absent"')});await h.theme.mountBlock(h.block);
    assert.equal(h.block.querySelectorAll('[data-included="true"]').length,0,'accessory main cannot unlock any other rule');
    assert.equal(h.block.querySelector('.qb-offer-unlock'),null,'no tier can qualify excluded main');
    for(const input of h.block.querySelectorAll('[data-offer-select]')){input.checked=true;input.dispatchEvent(new h.window.Event('change'));}
    assert.equal(h.block.querySelectorAll('.qb-offer-receipt').length,0);
    assert.equal(h.block.querySelector('[data-bundle-total]').textContent,'$40.00');
  }
});
test('disabled retained accessory config does not exclude its Product from main qualification',async()=>{
  const campaign=offerCampaign();campaign.gifts.enabled=false;
  const h=setupOffers({campaign,markup:offerMarkup(campaign).replace('data-product-id="main"','data-product-id="p-a"')});await h.theme.mountBlock(h.block);
  changeOfferSelection(h,'c');
  assert.equal(h.block.querySelector('[data-offer-rule="c"]').dataset.included,'true');
  assert.equal(h.block.querySelector('[data-bundle-total]').textContent,'$50.00');
});
const flushCart=()=>new Promise(resolve=>setImmediate(resolve));
test('unresolved composite transaction survives render, forced click, lifecycle, revision and read-only checks',async()=>{
  let posts=0,reads=0,confirmed=false,posted;
  const campaign=offerCampaign();
  const fetcher=async(url,init)=>{
    if(url==='/cart/add'){posts++;posted=JSON.parse(init.body).items;throw Error('ambiguous write');}
    if(url==='/api/carts/ajax-cart'){reads++;return {ok:true,json:async()=>({items:confirmed?posted:[]})};}
    return {ok:true,json:async()=>({version:2,clientFeatures:'gift-bundles-v1',campaign})};
  };
  const h=setupOffers({fetcher}),lifecycle={};await h.theme.mountBlock(h.block,fetcher,lifecycle);
  h.block.querySelector('[data-add-bundle]').click();await flushCart();
  assert.equal(posts,1);assert.equal(h.block.querySelector('[data-add-bundle]').disabled,false,'existing action can perform a read-only check');
  h.resize();assert.equal(h.block.querySelector('[data-add-bundle]').disabled,false);
  h.block.querySelector('[data-tier-id="t2"] .qb-tier-header').click();assert.equal(h.block.querySelector('[data-add-bundle]').disabled,false);
  const forceClick=()=>{const b=h.block.querySelector('[data-add-bundle]');b.disabled=false;b.dispatchEvent(new h.window.Event('click'));};
  forceClick();await flushCart();assert.equal(posts,1,'handler checks persistent lock');
  lifecycle.disposed=true;lifecycle.cleanup();h.block.remove();h.document.append(h.block);lifecycle.disposed=false;lifecycle.resume();
  assert.equal(h.block.querySelector('[data-add-bundle]').disabled,false);
  campaign.revision++;campaign.gifts.enabled=false;campaign.bundles.enabled=false;await h.theme.mountBlock(h.block,fetcher);
  assert.equal(h.block.querySelector('[data-add-bundle]').disabled,false,'disabled-offer revision retains a read-only action for the original transaction');
  assert.match(h.block.querySelector('.qb-status').textContent,/confirm/);
  assert.equal(h.block.querySelector('[data-check-cart]'),null,'no standalone check cart button');
  const check=h.block.querySelector('[data-add-bundle]');assert.match(check.textContent,/Check cart/);
  check.click();await flushCart();assert.match(h.block.querySelector('.qb-status').textContent,/confirm/,'empty cart snapshot is not proof write failed');
  assert.equal(posts,1);assert.equal(reads,4);
  confirmed=true;h.block.querySelector('[data-add-bundle]').click();await flushCart();
  assert.equal(posts,1,'resolution never reissues POST');assert.equal(reads,5);
  assert.equal(h.block.querySelector('[data-add-bundle]').disabled,false,'exact confirmed transaction clears lock');
  assert.doesNotMatch(h.block.querySelector('[data-add-bundle]').textContent,/Check cart/);
});
test('pending composite write is locked across remount before ambiguous response arrives',async()=>{
  let posts=0,rejectPost;
  const campaign=offerCampaign();
  const fetcher=async(url,init)=>{
    if(url==='/cart/add'){posts++;return new Promise((_,reject)=>rejectPost=reject);}
    if(url==='/api/carts/ajax-cart')return {ok:true,json:async()=>({items:[]})};
    return {ok:true,json:async()=>({version:2,clientFeatures:'gift-bundles-v1',campaign})};
  };
  const h=setupOffers({fetcher});await h.theme.mountBlock(h.block,fetcher);h.block.querySelector('[data-add-bundle]').click();await flushCart();
  campaign.revision++;await h.theme.mountBlock(h.block,fetcher);
  assert.equal(h.block.querySelector('[data-add-bundle]').disabled,true);
  h.block.querySelector('[data-add-bundle]').dispatchEvent(new h.window.Event('click'));assert.equal(posts,1);
  rejectPost(Error('timeout'));await flushCart();
  assert.equal(h.block.querySelector('[data-add-bundle]').disabled,false);
  assert.equal(h.block.querySelector('[data-check-cart]'),null);
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
  changeOfferSelection(h,'c');
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
test('native checkboxes expose localized Product identity and gift status is absent in French',async()=>{
  const markup=offerMarkup().replaceAll('data-locale="en"','data-locale="fr"').replace('<div data-offer-native-catalog','<span data-qb-copy="widget.offer_included" hidden>Inclus</span><span data-qb-copy="widget.offer_select" hidden>Sélectionner</span><div data-offer-native-catalog');
  const h=setupOffers({markup});await h.theme.mountBlock(h.block);
  assert.equal(h.block.querySelector('[data-offer-rule="c"] [data-offer-select]').getAttribute('aria-label'),'Product c');
  changeOfferSelection(h,'c');
  assert.equal(h.block.querySelector('[data-offer-rule="c"] [data-offer-select]').checked,true);
  assert.doesNotMatch(h.block.querySelector('[data-offer-module="gifts"]').textContent,/Inclus|Included/);
  const receipt=h.block.querySelectorAll('.qb-offer-receipt');
  assert.equal(receipt.length,3);assert.doesNotMatch(Array.from(receipt,row=>row.textContent).join(' '),/gift:|bundle:/);
  assert.equal(receipt[0].dataset.offerRole,'gift');assert.equal(receipt[2].dataset.offerRole,'bundle');
});

test('native fixed-one checkboxes include locked and disabled cards without duplicate toggle controls',async()=>{
 const campaign=offerCampaign();campaign.bundles.items[0].quantity=3;campaign.bundles.items[0].trigger.quantity=5;campaign.tiers.push({tierId:'t6',quantity:6,discountType:'none'});
 const h=setupOffers({campaign});await h.theme.mountBlock(h.block);
 const card=()=>h.block.querySelector('[data-offer-rule="c"]'),input=()=>card().querySelector('[data-offer-select]');
 assert.equal(input()?.type,'checkbox');assert.equal(input().checked,false);assert.equal(input().disabled,true);assert.match(input().getAttribute('aria-label'),/Product c/);assert.ok(card().querySelector('.qb-offer-lock'));assert.equal(card().querySelector('input[type="number"]'),null);assert.equal(card().querySelectorAll('select').length,1);
 card().querySelector('.qb-offer-lock').click();assert.equal(card().dataset.included,'true');
 input().checked=false;input().dispatchEvent(new h.window.Event('change'));assert.equal(card().dataset.included,'false');
 assert.doesNotMatch(h.block.querySelector('[data-offer-module="gifts"]').textContent,/Included/);
 const unavailable=setupOffers({markup:offerMarkup().replaceAll('data-available="true"','data-available="unknown"')});await unavailable.theme.mountBlock(unavailable.block);assert.equal(unavailable.block.querySelector('[data-offer-select]').disabled,true);
});

test('accessory Product main quote does not advertise any tier savings',async()=>{
 const campaign=offerCampaign();campaign.gifts.items[0].productId='main';campaign.tiers.forEach(t=>{t.discountType='percentage';t.discountValue=5000;});const h=setupOffers({campaign});await h.theme.mountBlock(h.block);
 assert.equal(h.block.querySelector('[data-bundle-total]').textContent,'$40.00');assert.equal(h.block.querySelector('[data-tier-id="t2"] .qb-tier-price').textContent,'$20.00');
});
test('theme carousel nested select arrows stay native and buttons track scroll boundaries',async()=>{
 const campaign=offerCampaign();campaign.bundles.style.desktop.layout.mode='carousel';const h=setupOffers({campaign});await h.theme.mountBlock(h.block);
 const section=h.block.querySelector('[data-offer-module="bundles"]'),grid=section.querySelector('.qb-offer-grid');
 const select=grid.querySelector('select'),event=new h.window.Event('keydown',{bubbles:true,cancelable:true});Object.defineProperty(event,'key',{value:'ArrowRight'});select.dispatchEvent(event);assert.equal(event.defaultPrevented,false);
 Object.defineProperties(grid,{clientWidth:{value:300},scrollWidth:{value:900},scrollLeft:{value:0,writable:true}});grid.dispatchEvent(new h.window.Event('scroll'));const buttons=section.querySelectorAll('.qb-offer-nav button');assert.equal(buttons[0].disabled,true);assert.equal(buttons[1].disabled,false);
 grid.scrollLeft=600;grid.dispatchEvent(new h.window.Event('scroll'));assert.equal(buttons[0].disabled,false);assert.equal(buttons[1].disabled,true);
});

test('native bundle checkbox labels show the Product title once and reuse the tier dropdown',async()=>{
 const h=setupOffers();await h.theme.mountBlock(h.block);
 const card=h.block.querySelector('[data-offer-rule="c"]');
 assert.equal(card.textContent.split('Product c').length-1,1);
 assert.equal(card.querySelector('label .qb-offer-title')?.textContent,'Product c');
 assert.ok(card.querySelector('select').classList.contains('qb-select'));
 assert.equal(card.querySelector('[data-offer-select]').checked,false);
});

test('native filters confirmed soldout variants and defaults to the first available allowed variant',async()=>{
 const h=setupOffers({markup:offerMarkup().replace('data-offer-variant="v-c" data-title="S" data-price="2000" data-available="true"','data-offer-variant="v-c" data-title="S" data-price="2000" data-available="false"')});
 await h.theme.mountBlock(h.block);
 const select=h.block.querySelector('[data-offer-rule="c"] select');
 assert.equal(select.value,'v-c-2');assert.deepEqual(Array.from(select.options,o=>o.value),['v-c-2']);
 changeOfferSelection(h,'c');assert.equal(h.block.querySelector('[data-offer-rule="c"]').dataset.included,'true');
});

test('native saved variant becoming soldout falls back while preserving an explicit bundle selection',async()=>{
 const h=setupOffers();await h.theme.mountBlock(h.block);changeOfferSelection(h,'c');
 h.setNativeAvailability('p-c','v-c',false);
 const next=offerCampaign();next.revision++;
 await h.theme.mountBlock(h.block,async()=>({ok:true,json:async()=>({version:2,clientFeatures:'gift-bundles-v1',campaign:next})}));
 const card=h.block.querySelector('[data-offer-rule="c"]');
 assert.equal(card.querySelector('select').value,'v-c-2');assert.equal(card.dataset.included,'true');
});

test('native hides only wholly confirmed soldout Products and retains unknown or unpriced Products unavailable',async()=>{
 for(const status of ['false','unknown','missing-price']) {
   const h=setupOffers();
   for(const node of h.block.querySelectorAll('[data-offer-product="p-c"] [data-offer-variant]')) {
     if(status==='missing-price')node.dataset.price='';else node.dataset.available=status;
   }
   await h.theme.mountBlock(h.block);
   const card=h.block.querySelector('[data-offer-rule="c"]');
   if(status==='false'){assert.equal(!!card,false);continue;}
   assert.ok(card);assert.equal(card.dataset.included,'false');assert.equal(card.querySelector('[data-offer-select]').disabled,true);
   assert.ok(card.querySelector('.qb-offer-state'));assert.equal(card.querySelector('.qb-offer-prices'),null);
   h.block.querySelector('[data-add-bundle]').click();await flushCart();
   const post=h.calls.find(c=>c.url==='/cart/add');
   assert.ok(post);assert.equal(JSON.parse(post.init.body).items.some(i=>i.id==='v-c'||i.id==='v-c-2'),false);
 }
});

test('native module typography colors badges and layout remain independent from carousel mode',async()=>{
 const campaign=offerCampaign(),style=campaign.bundles.style.desktop;
 style.layout.cardLayout='list';style.layout.mode='carousel';
 style.typography={sectionTitle:{sizePx:21,weight:700},title:{sizePx:18,weight:500},badge:{sizePx:13,weight:800}};
 style.colors={sectionTitle:'#112233',title:'#223344',text:'#334455',background:'#ddeeff',badgeText:'#ffffff',badgeBackground:'#556677'};
 campaign.bundles.items[0].label='Recommended';campaign.bundles.items[1].label='Save more';campaign.bundles.items[1].labelPosition='below_title';
 const h=setupOffers({campaign});await h.theme.mountBlock(h.block);
 const section=h.block.querySelector('[data-offer-module="bundles"]'),grid=section?.querySelector('.qb-offer-grid');
 assert.ok(grid);assert.equal(grid.dataset.cardLayout,'list');assert.ok(grid.classList.contains('qb-offer-carousel'));assert.equal(grid.style.getPropertyValue('--qb-offer-columns'),'1');
 for(const [name,value] of [['section-title-size','21px'],['section-title-weight','700'],['title-size','18px'],['title-weight','500'],['badge-size','13px'],['badge-weight','800'],['section-title-color','#112233'],['title-color','#223344'],['text','#334455'],['background','#ddeeff'],['badge-text','#ffffff'],['badge-background','#556677']])assert.equal(section.style.getPropertyValue('--qb-offer-'+name),value,name);
 assert.ok(section.querySelector('.qb-offer-label.qb-badge'));assert.ok(section.querySelector('.qb-offer-label-below.qb-badge'));
 const below=section.querySelector('[data-offer-rule="d"]');assert.ok(below.textContent.indexOf('Save more')>below.textContent.indexOf('Product d'));
 h.resize();assert.equal(h.block.querySelector('[data-offer-module="bundles"] .qb-offer-grid').dataset.cardLayout,'stacked');
});

test('native legacy columns infer card layout and narrow width lowers columns without changing layout mode',async()=>{
 for(const [columns,layout] of [[1,'stacked'],[2,'grid'],[3,'horizontal']]) {
  const campaign=offerCampaign();campaign.bundles.style.desktop.layout.columns=columns;
  const h=setupOffers({campaign});h.block.getBoundingClientRect=()=>({width:180});await h.theme.mountBlock(h.block);
  const grid=h.block.querySelector('[data-offer-module="bundles"] .qb-offer-grid');assert.equal(grid.dataset.cardLayout,layout);assert.equal(grid.style.getPropertyValue('--qb-offer-columns'),'1');assert.equal(grid.classList.contains('qb-offer-carousel'),false);
 }
});

test('native known sellable variants default independently from missing prices',async()=>{
 const h=setupOffers({markup:offerMarkup().replace('data-offer-variant="v-c" data-title="S" data-price="2000" data-available="true"','data-offer-variant="v-c" data-title="S" data-price="" data-available="true"')});await h.theme.mountBlock(h.block);
 const card=h.block.querySelector('[data-offer-rule="c"]');assert.equal(card.querySelector('select').value,'v-c');assert.equal(card.dataset.included,'false');assert.equal(card.querySelector('[data-offer-select]').disabled,true);
});
