import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import { campaign, moduleConfig } from './fixture.cjs';
const require=createRequire(import.meta.url);
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node'}});
const {buildDiscountRule}=require('../../app/src/service/campaign/discount-adapter.ts');
const {validateTranslations}=require('../../app/src/service/translations.ts');
let vite,copy,defaults,groups;
before(async()=>{vite=await createServer({root:process.cwd(),configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom'});copy=await vite.ssrLoadModule('/web/src/prototype/storefront-copy.ts');defaults=await vite.ssrLoadModule('/web/src/prototype/storefront-translation-defaults.ts');groups=await vite.ssrLoadModule('/web/src/prototype/translation-preview.ts');});
after(async()=>{await vite?.close();});
test('legacy publisher rejects enabled offers instead of silently dropping their discount while preserving disabled v1',()=>{
 assert.throws(()=>buildDiscountRule(campaign({gifts:moduleConfig()}),'USD'),/capability/i);
 assert.throws(()=>buildDiscountRule(campaign({bundles:moduleConfig('bundles')}),'USD'),/capability/i);
 const result=buildDiscountRule(campaign({gifts:moduleConfig('gifts',{enabled:false})}),'USD');assert.equal(result.schemaVersion,1);assert.equal(result.gifts,undefined);
});
test('legacy translation validator preserves editable empty gift/bundle headings',()=>{
 assert.equal(validateTranslations({'widget.gifts.title':'','widget.bundles.title':'Together'}),'');
});
test('title source defaults and translation preview groups preserve deliberate empty locale headings',()=>{
 const draft=defaults.initialTranslationDraft('en',{});
 assert.equal(draft['widget.gifts.title'],'🎁 Free gifts with your order');assert.equal(draft['widget.bundles.title'],'Frequently Bought Together');
 for(const key of ['widget.gifts.title','widget.bundles.title']){
  assert.equal(copy.renderStorefrontCopy(key,{[key]:''}),'');
  assert.equal(copy.renderStorefrontCopy(key,{[key]:'Mon titre'}),'Mon titre');
  assert.ok(groups.translationCopy.some(entry=>entry.key===key&&entry.location==='Widget header'));
 }
 assert.equal(defaults.initialTranslationDraft('fr',{'widget.gifts.title':''})['widget.gifts.title'],'');
});
