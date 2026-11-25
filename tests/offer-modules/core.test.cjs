const assert=require('node:assert/strict');
const {test}=require('node:test');
const core=require('../../shared/offer-core.cjs');
const {rule,moduleConfig,campaign}=require('./fixture.cjs');
const tiers=campaign().tiers;
test('missing modules default independently disabled with desktop3/mobile1 and normalize without mutation',()=>{
 const gifts=core.defaultOfferModule('gifts'),bundles=core.defaultOfferModule('bundles');
 assert.equal(gifts.enabled,false);assert.equal(gifts.selectionMode,'all_eligible');assert.equal(bundles.selectionMode,'single');
 assert.equal(gifts.style.desktop.layout.columns,3);assert.equal(gifts.style.mobile.layout.columns,1);
 gifts.style.desktop.layout.columns=2;assert.equal(bundles.style.desktop.layout.columns,3);
 const raw=moduleConfig('gifts');delete raw.style.mobile;raw.style.desktop.layout.columnGapPx=0;raw.items[0].showImage=false;
 const snapshot=structuredClone(raw),normalized=core.normalizeOfferModule(raw,'gifts');
 assert.deepEqual(raw,snapshot);assert.equal(normalized.items[0].label,'');assert.equal(normalized.items[0].discountValue,0);
 assert.equal(normalized.items[0].showImage,false);assert.equal(normalized.style.desktop.layout.columnGapPx,0);assert.equal(normalized.style.mobile.layout.columns,1);
 assert.deepEqual(core.normalizeOfferModule(undefined,'bundles'),core.defaultOfferModule('bundles'));
});
test('strict validation rejects unsafe amounts, IDs, unknown snapshots, duplicates, triggers and styles',()=>{
 assert.deepEqual(core.validateOfferModule(moduleConfig(),'gifts',tiers),[]);
 const mutations=[
 m=>m.items[0].productId=9007199254740992,
 m=>m.items[0].allowedVariantIds=[],m=>m.items[0].allowedVariantIds.push(m.items[0].allowedVariantIds[0]),
 m=>m.items[0].quantity=Number.MAX_SAFE_INTEGER+1,m=>m.items[0].quantity=0,
 m=>m.items[0].discountValue=1,m=>m.selectionMode='single',
 m=>m.items[0].price=0,m=>m.items[0].available=true,
 m=>m.items.push({...m.items[0]}),m=>m.items.push({...m.items[0],ruleId:'two'}),
 m=>m.items[0].trigger={type:'tiers',tierIds:['missing']},
 m=>m.items[0].trigger={type:'quantity',operator:'eq',quantity:2},
 m=>m.style.desktop.layout.columns=4,m=>m.style.desktop.layout.columnGapPx=-1,
 m=>m.style.mobile.colors={title:'url(evil)'},m=>m.style.desktop.typography={title:{sizePx:14,weight:450}},
 m=>m.items[0].marketOverrides={market:{mode:'specified_amount',currencyCode:'USD',amountMinor:1}}
 ];
 for(const mutate of mutations){const config=moduleConfig();mutate(config);assert.ok(core.validateOfferModule(config,'gifts',tiers).length>0,String(mutate));}
 const disabled=moduleConfig('gifts',{enabled:false});assert.deepEqual(core.normalizeOfferModule(disabled,'gifts'),disabled);
 const invalid=moduleConfig();invalid.items[0].discountValue=Number.MAX_SAFE_INTEGER+1;assert.throws(()=>core.normalizeOfferModule(invalid,'gifts'));
});
test('bundles accept fixed and basis-point discounts and validate market overrides per rule',()=>{
 const config=moduleConfig('bundles');assert.deepEqual(core.validateOfferModule(config,'bundles',tiers),[]);
 config.items[0].discountValue=10001;assert.ok(core.validateOfferModule(config,'bundles',tiers).length);
 config.items[0].discountType='fixed_amount';config.items[0].discountValue=100;
 config.items[0].marketOverrides={us:{mode:'specified_amount',currencyCode:'USD',amountMinor:0}};
 assert.deepEqual(core.validateOfferModule(config,'bundles',tiers),[]);
 config.items[0].marketOverrides.us.amountMinor=1.5;assert.ok(core.validateOfferModule(config,'bundles',tiers).length);
});
test('independent gifts stay eligible together and unlock at smallest configured reachable tier',()=>{
 const a=rule({trigger:{type:'quantity',operator:'gte',quantity:2}}),b=rule();
 assert.equal(core.offerEligible(a,tiers,2),true);assert.equal(core.offerEligible(b,tiers,2),false);
 assert.equal(core.offerEligible(a,tiers,4),true);assert.equal(core.offerEligible(b,tiers,4),true);
 assert.equal(core.offerUnlockTier(a,tiers).tierId,'three');
 assert.equal(core.offerUnlockTier(rule({trigger:{type:'quantity',operator:'gt',quantity:3}}),tiers).tierId,'four');
 assert.equal(core.offerUnlockTier(rule({trigger:{type:'quantity',operator:'eq',quantity:2}}),tiers),undefined);
 const selected=rule({trigger:{type:'tiers',tierIds:['three']}});
 assert.equal(core.offerEligible(selected,tiers,3),true);assert.equal(core.offerEligible(selected,tiers,4),false);
 assert.equal(core.offerEligible(a,tiers,NaN),false);
});
test('quota groups variants/lines by exact Product, never combines different Products or multiplies contexts',()=>{
 const offer=rule();
 assert.equal(core.offerQuota(offer,tiers,[{productId:'A',quantity:3},{productId:'B',quantity:3}]),2);
 assert.equal(core.offerQuota(offer,tiers,[{productId:'A',quantity:2},{productId:'B',quantity:1}]),0);
 assert.equal(core.offerQuota(offer,tiers,[{productId:'A',quantity:1},{productId:'A',quantity:2},{productId:'A',quantity:3}]),1);
 assert.equal(core.offerQuota({...offer,quantity:2},tiers,[{productId:'A',quantity:6},{productId:'B',quantity:3}]),4);
 assert.equal(core.offerQuota(offer,tiers,[{productId:123,quantity:3},{productId:'A',quantity:NaN}]),0);
 assert.equal(core.offerQuota(offer,tiers,[{productId:offer.productId,quantity:3}]),0);
});
test('money computes exact integer savings and fails closed for absent/unsafe prices or unconverted overrides',()=>{
 assert.equal(core.offerDiscountMinor(999,rule()),999);
 assert.equal(core.offerDiscountMinor(1000,rule({discountType:'fixed_price',discountValue:300})),700);
 assert.equal(core.offerDiscountMinor(1000,rule({discountType:'fixed_amount',discountValue:1200})),1000);
 assert.equal(core.offerDiscountMinor(101,rule({discountType:'percentage',discountValue:5000})),50);
 assert.equal(core.offerDiscountMinor(Number.MAX_SAFE_INTEGER,rule({discountType:'percentage',discountValue:5000})),4503599627370495);
 assert.equal(core.offerDiscountMinor(1000,rule({discountType:'fixed_price',discountValue:200}),{mode:'specified_amount',currencyCode:'JPY',amountMinor:300}),700);
 assert.equal(core.offerDiscountMinor(1000,rule({discountType:'fixed_price',discountValue:200}),{mode:'auto_convert'}),0);
 for(const price of [undefined,null,NaN,-1,1.2,Number.MAX_SAFE_INTEGER+1])assert.equal(core.offerDiscountMinor(price,rule()),0);
});
test('columns clamp grid and carousel to real container widths without mutating configured count',()=>{
 for(const mode of ['grid','carousel']){const layout={mode,columns:3,columnGapPx:12,rowGapPx:12};
 assert.equal(core.effectiveOfferColumns(700,layout),3);assert.equal(core.effectiveOfferColumns(600,layout),2);
 assert.equal(core.effectiveOfferColumns(400,layout),1);assert.equal(core.effectiveOfferColumns(320,layout),1);
 assert.equal(core.effectiveOfferColumns(0,layout),1);assert.equal(layout.columns,3);}
});
test('nested style omissions inherit device defaults without replacing explicit values',()=>{
 const normalized=core.normalizeOfferModule({style:{desktop:{image:{radiusPx:0}},mobile:{layout:{columnGapPx:0}}}},'bundles');
 assert.equal(normalized.style.desktop.layout.columns,3);assert.equal(normalized.style.desktop.image.radiusPx,0);
 assert.equal(normalized.style.mobile.layout.columns,1);assert.equal(normalized.style.mobile.layout.columnGapPx,0);
});
