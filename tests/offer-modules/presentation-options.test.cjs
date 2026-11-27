const {test}=require('node:test');
const assert=require('node:assert/strict');
const core=require('../../shared/offer-core.cjs');
const {moduleConfig,campaign}=require('./fixture.cjs');
test('savings visibility and independent device card styles survive validation and normalization',()=>{
 const value=moduleConfig('gifts');
 value.items[0].showSavings=false;
 value.style.desktop.card={radiusPx:18};
 value.style.desktop.colors={selectedBorder:'#12345680',savings:'#abcdef',variant:'#334455'};
 value.style.desktop.typography={savings:{sizePx:18,weight:700},variant:{sizePx:13,weight:400}};
 assert.deepEqual(core.validateOfferModule(value,'gifts',campaign().tiers),[]);
 const normalized=core.normalizeOfferModule(value,'gifts');
 assert.equal(normalized.items[0].showSavings,false);
 assert.deepEqual(normalized.style.desktop.card,{radiusPx:18});
 assert.equal(normalized.style.mobile.card,undefined);
});
test('invalid savings switches and card radii cannot be persisted',()=>{
 for(const mutate of [v=>v.items[0].showSavings='false',v=>v.style.desktop.card={radiusPx:-1},v=>v.style.desktop.card={radiusPx:1.5},v=>v.style.desktop.card={radiusPx:8,unknown:true}]){
 const value=moduleConfig('gifts');mutate(value);
 assert.ok(core.validateOfferModule(value,'gifts',campaign().tiers).length);
 }
});
