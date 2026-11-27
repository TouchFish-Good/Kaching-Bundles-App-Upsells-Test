import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
test('independent preview paths share an authenticated request queue',async()=>{
 const vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});
 try {
 const {loadOfferPreview}=await vite.ssrLoadModule('/src/prototype/offer-preview-client.ts');
 const calls=[];let active=0,max=0;
 const fetcher=async(url,options)=>{active++;max=Math.max(max,active);calls.push(url);await new Promise(r=>setTimeout(r,10));active--;const body=JSON.parse(options.body);return new Response(JSON.stringify({version:2,...body,locale:'en',products:[]}),{status:200});};
 await Promise.all(['gifts','bundles'].map(kind=>loadOfferPreview([],kind,{},fetcher,undefined,kind)));
 assert.deepEqual(calls,['/api/quantity-breaks/gifts/preview','/api/quantity-breaks/bundles/preview']);assert.equal(max,1);
 } finally {await vite.close();}
});

test('module hooks debounce edits independently and retain valid cached products',async()=>{
 const {JSDOM}=await import('jsdom'); const React=await import('react');
 const dom=new JSDOM('<div id="root"></div>'); const old={window:globalThis.window,document:globalThis.document,IS_REACT_ACT_ENVIRONMENT:globalThis.IS_REACT_ACT_ENVIRONMENT};
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
 const {createRoot}=await import('react-dom/client');const root=createRoot(document.getElementById('root'));
 const vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});
 try {
 const {useOfferModulePreview}=await vite.ssrLoadModule('/src/prototype/offer-preview-client.ts');let states;const calls=[];
 const module=ids=>({enabled:true,items:ids.map(id=>({productId:id,allowedVariantIds:[id+'v']}))});
 const fetcher=async(url,opts)=>{const body=JSON.parse(opts.body);calls.push({url,selection:body.selection});return Response.json({version:2,...body,locale:'en',products:body.selection.map(s=>({id:s.productId,identityVerified:true,available:true,variants:s.variantIds.map(id=>({id,available:true,price:null}))}))});};
 function Probe({gifts,bundles}){states={gifts:useOfferModulePreview('gifts',gifts,{sessionKey:'shop-a'},fetcher),bundles:useOfferModulePreview('bundles',bundles,{sessionKey:'shop-a'},fetcher)};return null;}
 const render=async props=>React.act(()=>root.render(React.createElement(Probe,props)));
 const settle=async()=>React.act(()=>new Promise(r=>setTimeout(r,350)));
 await render({gifts:module(['a']),bundles:module(['b'])});await settle();assert.equal(calls.length,2);const oldProduct=states.gifts.products[0];
 await render({gifts:module(['a','c']),bundles:module(['b'])});assert.equal(states.gifts.products[0],oldProduct);assert.equal(states.bundles.state,'ready');
 await render({gifts:module(['a','d']),bundles:module(['b'])});await settle();
 assert.equal(calls.length,3);assert.equal(calls[2].url,'/api/quantity-breaks/gifts/preview');assert.deepEqual(calls[2].selection,[{productId:'d',variantIds:['dv']}]);assert.equal(states.gifts.products[0],oldProduct);
 } finally {await React.act(()=>root.unmount());await vite.close();dom.window.close();Object.assign(globalThis,old);}
});

test('429 cooldown spans both modules but does not leak across store sessions',async()=>{
 const vite=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});
 try {
 const {loadOfferPreview}=await vite.ssrLoadModule('/src/prototype/offer-preview-client.ts');const calls=[];
 const fetcher=async(url,opts)=>{const body=JSON.parse(opts.body);calls.push({url,session:body.sessionKey,time:Date.now()});if(calls.length===1)return Response.json({retryAfter:1},{status:429,headers:{'Retry-After':'1'}});return Response.json({version:2,...body,locale:'en',products:[]});};
 await assert.rejects(loadOfferPreview([],'first',{sessionKey:'a'},fetcher,undefined,'gifts'));
 const controller=new AbortController();const queued=loadOfferPreview([],'cancel',{sessionKey:'a'},fetcher,controller.signal,'bundles');const rejected=assert.rejects(queued,{name:'AbortError'});controller.abort();await rejected;
 await loadOfferPreview([],'other',{sessionKey:'b'},fetcher,undefined,'bundles');assert.equal(calls.length,2);
 await loadOfferPreview([],'retry',{sessionKey:'a'},fetcher,undefined,'bundles');assert.equal(calls.length,3);assert.ok(calls[2].time-calls[0].time>=990);assert.equal(calls[1].session,'b');
 }finally{await vite.close();}
});
