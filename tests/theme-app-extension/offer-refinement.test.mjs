import test from 'node:test';
import assert from 'node:assert/strict';
import { setupOffers, offerCampaign, offerMarkup } from './helpers/offer-fixture.mjs';

test('gift cards show only savings and hide gift quantities in the receipt', async () => {
  const h=setupOffers();await h.theme.mountBlock(h.block);
  const card=h.block.querySelector('[data-offer-rule="a"]');
  assert.ok(!card.querySelector('.qb-offer-prices b'));
  assert.ok(!card.querySelector('.qb-offer-prices del'));
  assert.equal(card.querySelector('.qb-offer-savings')?.textContent,'Save $20.00');
  const receipt=h.block.querySelector('.qb-offer-receipt[data-offer-role="gift"]');
  assert.doesNotMatch(receipt.textContent,/×|\$0\.00/);assert.match(receipt.textContent,/Save \$20\.00/);
});
test('gift savings can be hidden without removing the qualifying free gift',async()=>{
  const campaign=offerCampaign();campaign.gifts.items[0].showSavings=false;
  const h=setupOffers({campaign});await h.theme.mountBlock(h.block);
  const card=h.block.querySelector('[data-offer-rule="a"]');
  assert.equal(card.dataset.included,'true');assert.ok(!card.querySelector('.qb-offer-savings'));
  assert.ok(!h.block.querySelector('.qb-offer-receipt[data-offer-role="gift"]').querySelector('b'));
});
test('composite gift property is visible and localized while protocol fields stay hidden',()=>{
  const {theme}=setupOffers();
  const items=theme.buildCompositeItems([{id:'main-v',quantity:4}],[{id:'gift-v',quantity:1,role:'gift',ruleId:'a',productId:'gift-p'},{id:'bundle-v',quantity:1,role:'bundle',ruleId:'b',productId:'bundle-p'}],{campaignId:'offers',productId:'main',context:'ctx',giftProperty:{name:'赠品',value:'参与「商品A」活动获得'}});
  const gift=items[1], visible=gift.properties.filter(p=>p.roleVisibility==='all');
  assert.deepEqual(JSON.parse(JSON.stringify(visible)),[{name:'赠品',value:'参与「商品A」活动获得',type:'text',roleVisibility:'all'}]);
  for(const item of items)for(const p of item.properties){assert.equal(Object.hasOwn(p,'show'),false);if(p.name.startsWith('_qb_'))assert.equal(p.roleVisibility,'none');}
  assert.ok(items[0].properties.every(p=>p.roleVisibility==='none'));assert.ok(items[2].properties.every(p=>p.roleVisibility==='none'));
});
test('gift property on actual add uses the main title and store translated copy',async()=>{
  const campaign=offerCampaign();campaign.copy={'widget.gift_property_label':'赠品','widget.gift_property_value':'参与「{product_title}」活动获得'};
  let posted;const h=setupOffers({campaign,markup:offerMarkup(campaign).replace('data-product-handle="main-handle"','data-product-handle="main-handle" data-product-title="商品A"'),fetcher:async(url,init)=>{
    if(url.includes('/campaign'))return {ok:true,json:async()=>({version:2,clientFeatures:'gift-bundles-v1',campaign})};
    if(url==='/cart/add'){posted=JSON.parse(init.body);return {ok:true,json:async()=>({items:posted.items})};}
    return {ok:true,json:async()=>url.includes('/api/carts')?{items:[]}:{version:2,clientFeatures:'gift-bundles-v1',campaign}};
  }});
  await h.theme.mountBlock(h.block);h.block.querySelector('[data-add-bundle]').click();
  for(let i=0;i<15&&!posted;i++)await new Promise(resolve=>setTimeout(resolve,0));
  assert.ok(posted);const gift=posted.items.find(i=>i.properties?.some(p=>p.name==='_qb_role'&&p.value==='gift'));
  assert.ok(gift.properties.some(p=>p.name==='赠品'&&p.value==='参与「商品A」活动获得'&&p.roleVisibility==='all'));
});
test('carousel hides the corresponding arrow at each boundary and keeps both in the list wrapper',async()=>{
 const pending=[];const campaign=offerCampaign();campaign.bundles.style.desktop.layout.mode='carousel';
 const h=setupOffers({campaign,timers:{setTimeout(fn){pending.push(fn);return pending.length;},clearTimeout(){}}});await h.theme.mountBlock(h.block);
 const section=h.block.querySelector('[data-offer-module="bundles"]'),grid=section.querySelector('.qb-offer-grid');
 Object.defineProperties(grid,{clientWidth:{value:300},scrollWidth:{value:900},scrollLeft:{value:0,writable:true}});pending.forEach(fn=>fn());
 const [prev,next]=section.querySelectorAll('.qb-offer-nav button');assert.equal(prev.hidden,true);assert.equal(next.hidden,false);
 assert.equal(prev.closest('.qb-offer-list').querySelector('.qb-offer-grid'),grid);
 grid.scrollLeft=600;grid.dispatchEvent(new h.window.Event('scroll'));assert.equal(prev.hidden,false);assert.equal(next.hidden,true);
});
test('offer price, variant and border presentation tokens follow the active device',async()=>{
  const campaign=offerCampaign();
  for(const kind of ['gifts','bundles']){
    campaign[kind].style.desktop={...campaign[kind].style.desktop,colors:{price:'#112233',comparePrice:'#223344',savings:'#334455',variant:'#445566',selectedBorder:'#556677'},typography:{price:{sizePx:19,weight:700},comparePrice:{sizePx:15,weight:300},savings:{sizePx:17,weight:500},variant:{sizePx:18,weight:400}},card:{radiusPx:24}};
    campaign[kind].style.mobile={...campaign[kind].style.mobile,colors:{savings:'#998877'},card:{radiusPx:12}};
  }
  const h=setupOffers({campaign});await h.theme.mountBlock(h.block);
  for(const kind of ['gifts','bundles']){
    const style=h.block.querySelector(`[data-offer-module="${kind}"]`).style;
    assert.equal(style.getPropertyValue('--qb-offer-price-color'),'#112233');assert.equal(style.getPropertyValue('--qb-offer-price-size'),'19px');
    assert.equal(style.getPropertyValue('--qb-offer-comparePrice-weight'),'300');assert.equal(style.getPropertyValue('--qb-offer-savings-color'),'#334455');
    assert.equal(style.getPropertyValue('--qb-offer-variant-size'),'18px');assert.equal(style.getPropertyValue('--qb-offer-selectedBorder-color'),'#556677');assert.equal(style.getPropertyValue('--qb-offer-card-radius'),'24px');
  }
  h.resize();
  for(const kind of ['gifts','bundles']){
    const style=h.block.querySelector(`[data-offer-module="${kind}"]`).style;
    assert.equal(style.getPropertyValue('--qb-offer-savings-color'),'#998877');assert.equal(style.getPropertyValue('--qb-offer-card-radius'),'12px');
  }
});
test('omitted presentation fields render the defaults advertised by the editor',async()=>{
 const h=setupOffers();await h.theme.mountBlock(h.block);
 const style=h.block.querySelector('[data-offer-module="bundles"]').style;
 for(const [key,value] of Object.entries({'card-radius':'8px','price-size':'14px','comparePrice-size':'12px','comparePrice-color':'#777777','comparePrice-weight':'400','variant-weight':'400','savings-weight':'400'}))assert.equal(style.getPropertyValue('--qb-offer-'+key),value,key);
});
