const {test}=require('node:test');
const assert=require('node:assert/strict');
const core=require('../../shared/offer-core.cjs');
const {moduleConfig}=require('./fixture.cjs');
test('module display defaults and selected settings survive normalization',()=>{
 assert.deepEqual(core.defaultOfferModule('gifts').display,{showImage:true,labelPosition:'corner',showSavings:true});
 const value=moduleConfig('gifts'); value.display={showImage:false,labelPosition:'below_title',showSavings:false};
 assert.deepEqual(core.validateOfferModule(value,'gifts'),[]);
 assert.deepEqual(core.normalizeOfferModule(value,'gifts').display,value.display);
});
test('module display rejects malformed values while historical modules stay valid',()=>{
 const legacy=moduleConfig('bundles'); delete legacy.display;
 assert.deepEqual(core.validateOfferModule(legacy,'bundles'),[]);
 for(const display of [null,{}, {showImage:'false',labelPosition:'corner'}, {showImage:true,labelPosition:'side'}, {showImage:true,labelPosition:'corner',showSavings:0}, {showImage:true,labelPosition:'corner',unknown:true}]) {
  assert.ok(core.validateOfferModule({...legacy,display},'bundles').length);
 }
});
