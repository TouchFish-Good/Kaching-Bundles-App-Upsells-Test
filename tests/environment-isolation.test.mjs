import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const origin = /appUrl\s*=\s*"([^"]+)"/.exec(read('shopline.app.toml'))[1];
const key = /appKey\s*=\s*"([^"]+)"/.exec(read('shopline.app.toml'))[1];
const functionId = '754292a155d740809a5437a3f8c59231';

test('theme assets fetch campaigns from the test app origin', () => {
  for (const path of ['theme-app-extension/public/app-block.js', 'theme-app-extension/compatibility/assets/app-block.js']) {
    assert.ok(read(path).includes(`const APP_ORIGIN = '${origin}';`), path);
  }
});
test('both backends default to the preserved test Discount Function', () => {
  for (const path of ['app/src/controller/campaigns.ts', 'worker/src/services/discounts.ts']) {
    assert.ok(read(path).includes(`= '${functionId}';`), path);
    assert.ok(!read(path).includes('66a964153c3c4b42a6713162369e0df9'), path);
  }
});
test('Worker deployment config uses independent resources and test identity', () => {
  const config = read('worker/wrangler.toml');
  assert.match(config, /name = "shopline-quantity-breaks-test"/);
  assert.match(config, /database_name = "shopline-quantity-breaks-test"/);
  assert.match(config, /database_id = "[0-9a-f-]{36}"/);
  assert.ok(config.includes('pattern = "app-test.vswwy.cn"'));
  for (const value of ['app.vswwy.cn', '16f852cc-24c0-40fe-8147-c1786ed9750c', 'kaching-developer-admin']) assert.ok(!config.includes(value));
  assert.ok(config.includes(key));
  assert.ok(config.includes(origin));
  assert.ok(config.includes(functionId));
  assert.ok(!read('worker/src/services/webhooks.ts').includes('app.vswwy.cn'));
});
test('local Worker secrets and database files stay ignored', () => {
  const ignore = read('.gitignore');
  assert.match(ignore, /\.dev\.vars/);
  assert.match(ignore, /app\/quantity-breaks\.sqlite/);
  assert.match(ignore, /app\/admin-read\.sqlite/);
});

test('gift and bundle publication is enabled only for the documented test shop and Function', () => {
  const config = read('worker/wrangler.toml');
  const entry = /^SHOPLINE_OFFER_FUNCTION_CAPABILITIES\s*=\s*'([^']+)'\s*$/m.exec(config);
  assert.ok(entry, 'Test deployment must carry the verified gift/bundle capability map.');
  const capabilities = JSON.parse(entry[1]);
  assert.deepEqual(Object.keys(capabilities), ['buchaqian']);
  assert.deepEqual(capabilities.buchaqian, {
    functionId, protocol: 'gift-bundles-v1', skuIsVariantId: true, lineTotalTargets: true,
  });
});
