import test from 'node:test';
import assert from 'node:assert/strict';
import {setupOffers,offerCampaign} from './helpers/offer-fixture.mjs';
const card=(h,id='c')=>h.block.querySelector(`[data-offer-rule="${id}"]`);
function keyboard(h,target,key){const event=new h.window.Event('keydown',{bubbles:true,cancelable:true});event.key=key;target.dispatchEvent(event);return event;}

test('single column separates bundle price header from image and title selectors',async()=>{
 const campaign=offerCampaign();campaign.bundles.style.desktop.layout.columns=1;
 const h=setupOffers({campaign});await h.theme.mountBlock(h.block);
 const c=card(h),top=c.querySelector('.qb-offer-topline'),product=c.querySelector('.qb-offer-product');
 assert.ok(top);assert.ok(product);assert.ok(top.querySelector('[data-offer-select]'));assert.ok(!top.querySelector('.qb-offer-title'));
 assert.equal(product.querySelector('.qb-offer-title')?.textContent,'Product c');
 assert.deepEqual([...top.querySelector('.qb-offer-prices').children].map(n=>n.tagName),['B','SPAN','DEL']);
 assert.equal(c.querySelector('select').parentNode,c.querySelector('.qb-offer-description'));
 assert.equal(c.getAttribute('role'),null);assert.equal(c.querySelector('.qb-offer-select').dataset.visuallyHidden,'false');
 assert.equal(c.closest('.qb-offer-grid').dataset.effectiveColumns,'1');
});
test('multi column bundle supports card pointer and keyboard selection without a duplicate checkbox tab stop',async()=>{
 const h=setupOffers();await h.theme.mountBlock(h.block);
 assert.equal(card(h).getAttribute('role'),'group');assert.equal(card(h).querySelector('[data-offer-select]').checked,false);
 assert.equal(card(h).hasAttribute('tabindex'),false);assert.equal(card(h).querySelector('.qb-offer-select').dataset.visuallyHidden,'true');assert.equal(card(h).querySelector('[data-offer-select]').hidden,false);
 card(h).querySelector('.qb-offer-title').click();assert.equal(card(h).dataset.included,'true');assert.equal(card(h).querySelector('[data-offer-select]').checked,true);
 keyboard(h,card(h).querySelector('input'),'Enter');assert.equal(card(h).dataset.included,'false');keyboard(h,card(h).querySelector('input'),'Enter');assert.equal(card(h).dataset.included,'true');
 const select=card(h).querySelector('select');keyboard(h,select,' ');select.click();assert.equal(card(h).dataset.included,'true');
});
test('gift product content groups title, savings and variants beside its image without selection semantics',async()=>{
 const h=setupOffers();h.block.querySelector('[data-offer-product="p-a"]').dataset.image='https://cdn.example.com/gift.png';await h.theme.mountBlock(h.block);
 const gift=card(h,'a');assert.ok(gift.querySelector('.qb-offer-content .qb-offer-title'));assert.ok(gift.querySelector('.qb-offer-content .qb-offer-savings'));assert.ok(gift.querySelector('.qb-offer-content select'));
 assert.equal(gift.querySelector('.qb-offer-image')?.parentNode,gift);assert.equal(gift.getAttribute('role'),null);
});
test('actual container width switches card selection semantics and effective columns on resize measurement',async()=>{
 const pending=[];const h=setupOffers({timers:{setTimeout(fn){pending.push(fn);return pending.length;},clearTimeout(){}}});let width=500;h.block.getBoundingClientRect=()=>({width});
 await h.theme.mountBlock(h.block);const c=card(h),grid=c.closest('.qb-offer-grid');assert.equal(grid.dataset.effectiveColumns,'3');assert.equal(c.getAttribute('role'),'group');
 width=90;pending.forEach(fn=>fn());assert.equal(grid.dataset.effectiveColumns,'1');assert.equal(c.getAttribute('role'),null);assert.equal(c.querySelector('.qb-offer-select').dataset.visuallyHidden,'false');
 c.click();assert.equal(card(h).dataset.included,'true');
 width=500;pending.forEach(fn=>fn());const current=card(h);assert.equal(current.closest('.qb-offer-grid').dataset.effectiveColumns,'3');assert.equal(current.getAttribute('role'),'group');current.click();assert.equal(card(h).dataset.included,'false');
});
test('locked card body cannot select and its overlay preserves tier unlocking behavior',async()=>{
 const campaign=offerCampaign();campaign.bundles.items[0].trigger.quantity=5;campaign.tiers.push({tierId:'t6',quantity:6,discountType:'none'});
 const h=setupOffers({campaign});await h.theme.mountBlock(h.block);card(h).click();keyboard(h,card(h),'Enter');assert.equal(card(h).dataset.included,'false');
 card(h).querySelector('.qb-offer-lock').click();assert.equal(card(h).dataset.included,'true');assert.ok(!card(h).querySelector('.qb-offer-lock'));
});

test('unpriced multi-column bundle remains unavailable when its card body or keyboard control is activated',async()=>{
 const h=setupOffers();
 for(const node of h.block.querySelectorAll('[data-offer-product="p-c"] [data-offer-variant]'))node.dataset.price='';
 await h.theme.mountBlock(h.block);assert.equal(card(h).querySelector('input').disabled,true);
 card(h).querySelector('.qb-offer-title').click();keyboard(h,card(h).querySelector('input'),'Enter');assert.equal(card(h).dataset.included,'false');
});

test('single column card toggles title and body while select retains native behavior',async()=>{
 const campaign=offerCampaign();campaign.bundles.style.desktop.layout.columns=1;const h=setupOffers({campaign});await h.theme.mountBlock(h.block);
 card(h).querySelector('.qb-offer-title').click();assert.equal(card(h).dataset.included,'true');card(h).querySelector('select').click();assert.equal(card(h).dataset.included,'true');card(h).click();assert.equal(card(h).dataset.included,'false');
});

test('module display overrides rule flags and variant image falls back to product image',async()=>{
 const campaign=offerCampaign();campaign.gifts.display={showImage:true,labelPosition:'below_title',showSavings:false};campaign.gifts.items[0].showImage=false;campaign.gifts.items[0].label='Gift';
 const h=setupOffers({campaign}),product=h.block.querySelector('[data-offer-product="p-a"]');product.dataset.image='https://cdn.example.com/product.png';product.querySelector('[data-offer-variant]').dataset.image='https://cdn.example.com/variant.png';await h.theme.mountBlock(h.block);
 const gift=()=>card(h,'a');assert.equal(gift().querySelector('img').src,'https://cdn.example.com/variant.png');assert.equal(gift().querySelector('.qb-offer-savings'),null);assert.ok(gift().querySelector('.qb-offer-label-below'));
 const select=gift().querySelector('select');Object.defineProperty(select,'value',{configurable:true,value:campaign.gifts.items[0].allowedVariantIds[1]});select.dispatchEvent(new h.window.Event('change',{bubbles:true}));assert.equal(gift().querySelector('img').src,'https://cdn.example.com/product.png');
});
