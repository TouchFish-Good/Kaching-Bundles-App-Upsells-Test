import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import { campaign, moduleConfig } from './fixture.cjs';
const require = createRequire(import.meta.url);
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node'}});
const { validateCampaign: validateLegacy } = require('../../app/src/service/campaign/validate.ts');
const { CampaignRepository } = require('../../app/src/service/campaign/repository.ts');
const sqlite3 = require('sqlite3');
let vite, validateWorker, toAdminCampaign, toCampaignDraft;
before(async()=>{
 vite = await createServer({root:process.cwd(),configFile:false,server:{middlewareMode:true},appType:'custom'});
 ({validateCampaign:validateWorker}=await vite.ssrLoadModule('/worker/src/domain/campaign.ts'));
 ({toAdminCampaign,toCampaignDraft}=await vite.ssrLoadModule('/web/src/prototype/campaign-adapter.ts'));
});
after(async()=>{await vite?.close();});
for (const [name, validate] of [['legacy',validateLegacy],['worker',value=>validateWorker(value)]]) {
 test(`${name} rejects malformed accessory configuration on drafts`,()=>{
  assert.ok(validate(campaign({gifts:{enabled:true,items:[{productId:123}]}})).some(error=>/gifts/i.test(error)));
 });
 test(`${name} rejects enabled empty modules and nonfree gifts on publication`,()=>{
  assert.ok(validate(campaign({status:'active',gifts:moduleConfig('gifts',{items:[]})})).length>0);
  const gifts=moduleConfig();gifts.items[0].discountValue=100;
  assert.ok(validate(campaign({status:'active',gifts})).some(error=>/gift/i.test(error)));
 });
}
test('web roundtrip preserves independently disabled drafts and exact IDs, zeros, empty labels',()=>{
 const gifts=moduleConfig('gifts',{enabled:false}),bundles=moduleConfig('bundles');
 const original=campaign({gifts,bundles,revision:2,updatedAt:'2026-01-01T00:00:00Z'});
 const admin=toAdminCampaign(original);
 assert.deepEqual(admin.gifts,gifts);assert.deepEqual(admin.bundles,bundles);
 const draft=toCampaignDraft(admin,original);
 assert.deepEqual(draft.gifts,gifts);assert.deepEqual(draft.bundles,bundles);
 admin.gifts.items[0].label='edited';assert.equal(original.gifts.items[0].label,'');
});
test('legacy activity JSON create/update/read retains both independent module configs',async()=>{
 const db=new sqlite3.Database(':memory:');
 try{
 const repo=new CampaignRepository(db),gifts=moduleConfig(),bundles=moduleConfig('bundles');
 await repo.save('test-shop',campaign({gifts,bundles}),0);
 const read=await repo.get('test-shop','offer');assert.deepEqual(read.gifts,gifts);assert.deepEqual(read.bundles,bundles);
 gifts.enabled=false;bundles.items[0].quantity=2;
 await repo.save('test-shop',campaign({gifts,bundles}),1);
 const updated=await repo.get('test-shop','offer');assert.deepEqual(updated.gifts,gifts);assert.deepEqual(updated.bundles,{...bundles,items:bundles.items.map(r=>({...r,quantity:1}))});
 await assert.rejects(repo.save('test-shop',campaign({gifts:{enabled:true}}),2),/gifts/i);
 }finally{await new Promise(resolve=>db.close(resolve));}
});

test('historical bundle quantity normalizes across actual legacy read and web save roundtrip',async()=>{
 const db=new sqlite3.Database(':memory:');try{
 const repo=new CampaignRepository(db),bundles=moduleConfig('bundles'),draft=campaign({bundles});bundles.items[0].quantity=3;
 const admin=toAdminCampaign({...draft,revision:1,updatedAt:'2026-01-01T00:00:00Z'});assert.equal(admin.bundles.items[0].quantity,1);
 assert.equal(toCampaignDraft(admin,draft).bundles.items[0].quantity,1);
 await repo.save('test-shop',draft,0);
 const raw=await new Promise((resolve,reject)=>db.get('SELECT campaign_json FROM quantity_breaks_campaigns',(e,r)=>e?reject(e):resolve(r)));
 assert.equal(JSON.parse(raw.campaign_json).bundles.items[0].quantity,1);
 await new Promise((resolve,reject)=>db.run('UPDATE quantity_breaks_campaigns SET campaign_json = ?',[JSON.stringify(draft)],e=>e?reject(e):resolve()));
 assert.equal((await repo.get('test-shop','offer')).bundles.items[0].quantity,1);
 }finally{await new Promise(resolve=>db.close(resolve));}
});
