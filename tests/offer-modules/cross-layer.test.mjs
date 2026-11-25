import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { offerCampaign, offerMarkup, setupOffers, digest, changeOfferSelection } from '../theme-app-extension/helpers/offer-fixture.mjs';

let vite, modules;
before(async () => {
  vite = await createServer({ root: fileURLToPath(new URL('../../', import.meta.url)), configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  modules = await Promise.all([
    '/worker/src/db/migrate.ts', '/worker/src/db/campaigns.ts', '/worker/src/db/sessions.ts',
    '/worker/src/db/subscriptions.ts', '/worker/src/db/translations.ts', '/worker/src/index.ts',
    '/worker/src/services/discounts.ts',
  ].map(path => vite.ssrLoadModule(path)));
});
after(async () => { await vite?.close(); });

async function savedShop({ disabled = false, mutate } = {}) {
  const [{ applyMigrations }, { D1CampaignRepository }, { D1SessionStore }, { D1SubscriptionRepository }, { D1TranslationRepository }, { default: worker }, { buildDiscountRule }] = modules;
  const database = sqliteD1();
  await applyMigrations(database);
  const handle = 'local-offer-integration';
  // Synthetic values only, never load .env, TOML or a merchant session.
  const bindings = { DB: database, SHOPLINE_APP_KEY: 'local-app', TOKEN_ENCRYPTION_KEY: Buffer.from('0123456789abcdef0123456789abcdef').toString('base64url'), SHOPLINE_PRODUCT_DISCOUNT_FUNCTION_ID: 'local-function', SHOPLINE_OFFER_FUNCTION_CAPABILITIES: JSON.stringify({ [handle]: { functionId: 'local-function', protocol: 'gift-bundles-v1', skuIsVariantId: true, lineTotalTargets: true } }) };
  await new D1SessionStore(database, bindings.TOKEN_ENCRYPTION_KEY).upsert({ handle, storeId: '900001', installed: true, accessToken: 'synthetic-only', refreshToken: 'synthetic-only', scope: 'read_products', expiresAt: '2099-01-01T00:00:00Z' });
  await new D1SubscriptionRepository(database).writeEntitlement({ appKey: bindings.SHOPLINE_APP_KEY, handle, state: 'active', featureKeys: ['quantity_breaks_access'], activeSubscriptionId: 'local-sub', activeSpuKey: 'ultra', validFrom: null, validUntil: null, graceUntil: null, autoRecurring: true, absenceConfirmations: 0 });
  const fixture = offerCampaign();
  fixture.bundles.items.forEach(rule => { rule.quantity = 3; });
  const campaign = { id: fixture.id, name: 'Local integration', status: 'draft', startsAt: '2020-01-01T00:00:00Z', scope: { kind: 'products', productIds: ['main', 'main-2'], excludedProductIds: [] }, tiers: fixture.tiers.map((tier, displayOrder) => ({ ...tier, displayOrder })), combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false }, gifts: fixture.gifts, bundles: fixture.bundles };
  if (disabled) { campaign.gifts.enabled = false; campaign.bundles.enabled = false; }
  mutate?.(campaign);
  const repository = new D1CampaignRepository(database);
  await repository.save(handle, campaign, 0);
  const stored = await database.prepare("SELECT campaign_json FROM quantity_breaks_campaigns WHERE shop_handle = ? AND id = ?").bind(handle, campaign.id).first();
  assert.ok(JSON.parse(stored.campaign_json).bundles.items.every(rule => rule.quantity === 1), "persisted canonical bundle quantity");
  // Seed actual historical JSON locally, proving read compatibility without a remote migration.
  await database.prepare("UPDATE quantity_breaks_campaigns SET campaign_json = ? WHERE shop_handle = ? AND id = ?").bind(JSON.stringify(campaign), handle, campaign.id).run();
  const lease = await repository.beginPublication(handle, campaign.id, 1, 'publish');
  // Local repository acknowledgement only; no platform publication is performed.
  await repository.finishPublication(handle, campaign.id, 1, 'publish', 'local-discount', lease.owner);
  const saved = await repository.get(handle, campaign.id);
  assert.ok(saved.bundles.items.every(rule => rule.quantity === 1), "save/read canonical bundle quantity");
  const translations = new D1TranslationRepository(database);
  const pending = [];
  async function response(locale = 'en', negotiate = true, expectedStatus = 200) {
    const query = new URLSearchParams({ shop: handle, productId: 'main', locale, ...(negotiate ? { clientFeatures: 'gift-bundles-v1' } : {}) });
    const result = await worker.fetch(new Request(`https://local.invalid/public/quantity-breaks/campaign?${query}`), bindings, { waitUntil(promise) { pending.push(promise); } });
    assert.equal(result.status, expectedStatus);
    await Promise.all(pending.splice(0));
    return result.json();
  }
  return { database, saved, translations, response, rule: buildDiscountRule(saved, 'USD') };
}

function evaluate(rule, batch, transform = value => value) {
  const lines = batch.map((item, index) => ({ id: `line-${index}`, quantity: item.quantity, properties: item.properties,
    merchandise: { productVariant: { sku: item.id, product: { id: item.id === 'v-main' ? 'main' : `p-${item.id.slice(2, 3)}` }, priceSet: { shopMoney: { amount: item.id === 'v-main' ? '10.00' : '20.00', currencyCode: 'USD' }, presentmentMoney: { amount: item.id === 'v-main' ? '10.00' : '20.00', currencyCode: 'USD' } } } } }));
  const request = transform({ cart: { lines }, discountNodes: [{ priceRuleId: 'local-rule', metafields: [{ namespace: 'sale', key: 'quantity_breaks', type: 'json', value: JSON.stringify(rule) }] }], localization: { marketId: 'local-market' } });
  const run = spawnSync('go', ['test', './internal/discount', '-run', '^TestOfferCrossLayerCodec$', '-count=1', '-v'], { cwd: fileURLToPath(new URL('../../product-discount-customizations/', import.meta.url)), env: { ...process.env, QB_LOCAL_INTEGRATION_REQUEST: JSON.stringify(request) }, encoding: 'utf8' });
  assert.ifError(run.error);
  assert.equal(run.status, 0, run.stdout + run.stderr);
  const encoded = run.stdout.match(/^QB_LOCAL_RESULT=(.*)$/m);
  assert.ok(encoded, run.stdout);
  const result = JSON.parse(encoded[1]);
  return (result.discounts || []).flatMap(discount => discount.targets || []).map(target => ({ line: target.cartLine.id, quantity: target.cartLine.quantity, amount: target.value.fixedAmount.amount, each: target.value.fixedAmount.appliesToEachItem })).sort((a, b) => a.line.localeCompare(b.line));
}

async function cartFromPublic(response, quantity) {
  const campaign = response.campaign;
  const source = offerCampaign();
  const markup = offerMarkup(source).replace(digest, campaign.catalogIndex.digest);
  let batch;
  const h = setupOffers({ response, markup, fetcher: async (url, init) => {
    if (url === '/cart/add') { assert.equal(batch, undefined, 'one write per explicit action'); batch = JSON.parse(init.body).items; return { ok: true, json: async () => ({ items: batch }) }; }
    if (url === '/api/carts/ajax-cart') return { ok: true, json: async () => ({ items: [] }) };
    assert.match(String(url), /\/public\/quantity-breaks\/campaign/);
    return { ok: true, json: async () => response };
  } });
  await h.theme.mountBlock(h.block);
  h.block.querySelector(`[data-tier-id="t${quantity}"] .qb-tier-header`).click();
  for (const id of ['c', 'd']) changeOfferSelection(h,id);
  h.block.querySelector('[data-add-bundle]').click();
  for (let i = 0; i < 100 && !batch; i++) await new Promise(resolve => setImmediate(resolve));
  assert.ok(batch, 'mounted widget must submit the actual composite batch');
  return { h, batch };
}

for (const [quantity, roles, discounts] of [
  [2, ['main', 'gift', 'bundle', 'bundle'], [['line-1', '20.00'], ['line-2', '10.00'], ['line-3', '10.00']]],
  [4, ['main', 'gift', 'gift', 'bundle', 'bundle'], [['line-1', '20.00'], ['line-2', '20.00'], ['line-3', '10.00'], ['line-4', '10.00']]],
]) test(`saved D1 → Worker v2 → mounted theme batch → real Go codec at main quantity ${quantity}`, async () => {
  const local = await savedShop();
  try {
    const response = await local.response();
    assert.equal(response.campaign.revision, local.saved.revision);
    assert.ok(response.campaign.bundles.items.every(rule => rule.quantity === 1));
    assert.ok(local.rule.bundles.items.every(rule => rule.quantity === 1));
    assert.deepEqual(response.campaign.gifts, local.saved.gifts);
    assert.equal(response.campaign.offerCapability.functionVerified, true);
    const { batch } = await cartFromPublic(response, quantity);
    assert.deepEqual(batch.map(item => item.properties.find(p => p.name === '_qb_role').value), roles);
    assert.equal(batch[0].quantity, quantity);
    const expected = discounts.map(([line, amount]) => ({ line, quantity: 1, amount, each: false }));
    assert.deepEqual(evaluate(local.rule, batch), expected);
    assert.deepEqual(evaluate(local.rule, batch, request => { request.cart.lines.slice(1).forEach(line => line.quantity = 3); return request; }), expected, 'excess accessory units remain normal priced');
    assert.deepEqual(evaluate(local.rule, batch, request => {
      const duplicate = structuredClone(request.cart.lines[1]); duplicate.id = 'z-duplicate-context';
      duplicate.properties.find(p => p.name === '_qb_context').value = 'another-context';
      request.cart.lines.push(duplicate); return request;
    }), expected, 'a new context cannot mint another quota');
    assert.deepEqual(evaluate(local.rule, batch, request => { request.cart.lines[0].quantity = 1; return request; }), [], 'accessories cannot fund their own triggers');
    assert.deepEqual(evaluate(local.rule, batch, request => { request.cart.lines.slice(1).forEach(line => line.properties.find(p => p.name === '_qb_rule').value = 'forged'); return request; }), [], 'forged rule properties receive no discount');
  } finally { local.database.close(); }
});

test('Go pools two qualifying Products once and caps actual line totals across duplicate contexts', async () => {
  const local = await savedShop();
  try {
    const { batch } = await cartFromPublic(await local.response(), 4);
    const result = evaluate(local.rule, batch, request => {
      const main = structuredClone(request.cart.lines[0]); main.id = 'second-main';
      main.merchandise.productVariant.product.id = 'main-2'; main.merchandise.productVariant.sku = 'v-main-2';
      main.properties.find(p => p.name === '_qb_source_product').value = 'main-2';
      request.cart.lines.slice(1).forEach(line => line.quantity = 3);
      const duplicate = structuredClone(request.cart.lines[1]); duplicate.id = 'z-duplicate-context'; duplicate.quantity = 1;
      duplicate.properties.find(p => p.name === '_qb_context').value = 'another-context';
      request.cart.lines.push(main, duplicate); return request;
    });
    assert.deepEqual(result, [
      { line: 'line-1', quantity: 2, amount: '40.00', each: false },
      { line: 'line-2', quantity: 2, amount: '40.00', each: false },
      { line: 'line-3', quantity: 2, amount: '20.00', each: false },
      { line: 'line-4', quantity: 2, amount: '20.00', each: false },
    ], 'two Products grant two units; extra units and new contexts get no extra discount');
  } finally { local.database.close(); }
});

test('saved locale title and explicit empty heading reach the actual theme without disabling gifts', async () => {
  const local = await savedShop();
  try {
    await local.translations.write('local-offer-integration', 'fr', { 'widget.gifts.title': '', 'widget.bundles.title': 'Ensemble choisi' });
    const response = await local.response('fr');
    const { h } = await cartFromPublic({ ...response, campaign: { ...response.campaign } }, 4);
    assert.ok(h.block.querySelector('[data-offer-module="gifts"]'));
    assert.equal(h.block.querySelector('[data-offer-module="gifts"] h4'), null);
    assert.match(h.block.textContent, /Ensemble choisi/);
    assert.equal(h.block.querySelectorAll('[data-offer-role="gift"][data-included="true"]').length, 2);
    const english = await local.response('en');
    assert.deepEqual(english.campaign.offerTitles, { gifts: '🎁 Free gifts with your order', bundles: 'Frequently Bought Together' });
  } finally { local.database.close(); }
});

test('both saved disabled modules and nonnegotiating clients preserve v1 and main-only widget initialization', async () => {
  for (const disabled of [false, true]) {
    const local = await savedShop({ disabled });
    try {
      const response = await local.response('en', disabled);
      assert.equal(response.version, undefined);
      assert.equal(response.campaign.gifts, undefined);
      assert.equal(response.campaign.catalogIndex, undefined);
      const h = setupOffers({ response }); await h.theme.mountBlock(h.block);
      assert.equal(h.block.querySelectorAll('[data-offer-rule]').length, 0);
      assert.equal(h.calls.length, 1);
      if (disabled) { assert.equal(local.rule.schemaVersion, 1); assert.equal(local.rule.gifts, undefined); }
    } finally { local.database.close(); }
  }
});

test('effective accessory exclusion agrees from public protocols through actual Go main price output',async()=>{
 const local=await savedShop({mutate:c=>{c.gifts.items[0].productId='main';c.tiers.forEach(t=>{t.discountType='percentage';t.discountValue=50;});}});
 try{
 for(const negotiate of [false,true])await local.response('en',negotiate,404);
 const batch=[{id:'v-main',quantity:4,properties:[]}];assert.deepEqual(evaluate(local.rule,batch),[],'Go charges full $40 main price for accessory Product');
 const ordinary=structuredClone(local.rule);delete ordinary.gifts;delete ordinary.bundles;ordinary.schemaVersion=1;ordinary.scope.excludedProductIds=[];
 assert.deepEqual(evaluate(ordinary,batch,request=>{request.discountNodes.push({priceRuleId:'accessory-other',metafields:[{namespace:'sale',key:'quantity_breaks',type:'json',value:JSON.stringify(local.rule)}]});return request;}),[],'cross-campaign accessory node also prevents legacy main discounts');
 }finally{local.database.close();}
});
