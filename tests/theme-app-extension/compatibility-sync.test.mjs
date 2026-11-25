import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const script = readFileSync(new URL('../../scripts/sync-theme-compatibility.mjs', import.meta.url));
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'qb-compat-sync-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const dir of ['scripts', 'theme-app-extension/public', 'theme-app-extension/i18n', 'theme-app-extension/compatibility/blocks', 'theme-app-extension/compatibility/locales']) {
    mkdirSync(join(root, dir), { recursive: true });
  }
  writeFileSync(join(root, 'scripts/sync-theme-compatibility.mjs'), script);
  const file = path => join(root, 'theme-app-extension', path);
  const copy = { app_block: { widget: { title: 'Merchant edited title $& $1 $$', add: 'Add {quantity}' } } };
  writeFileSync(file('i18n/en.json'), JSON.stringify(copy));
  writeFileSync(file('i18n/zh-hans-cn.json'), JSON.stringify({ app_block: { widget: { title: '多件折扣', add: '添加 {quantity} 件' } } }));
  writeFileSync(file('i18n/en.schema.json'), JSON.stringify({ appBlock: { block: { name: 'Multi-item Discounts' } } }));
  writeFileSync(file('public/app-block.js'), '// shared js');
  writeFileSync(file('public/app-block.css'), '/* shared css */');
  writeFileSync(file('compatibility/blocks/app-block.html'), "<h2>{{t 'app_block.widget.title'}}</h2>\n{{#schema}}\n" + JSON.stringify({ name: 't:appBlock.block.name', target: 'section', templates: ['products/detail'] }) + '\n{{/schema}}\n');
  const run = (...args) => spawnSync(process.execPath, [join(root, 'scripts/sync-theme-compatibility.mjs'), ...args], { encoding: 'utf8' });
  return { file, run, copy };
}

test('generates OS2.1 inline locales from edited storefront copy and leaves OS3 sources untouched', t => {
  const { file, run, copy } = fixture(t);
  const original = readFileSync(file('i18n/en.json'), 'utf8');
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  const template = readFileSync(file('compatibility/blocks/app-block.html'), 'utf8');
  const schema = JSON.parse(/{{#schema}}([\s\S]*?){{\/schema}}/.exec(template)[1]);
  assert.deepEqual(schema.locales.en, copy);
  assert.equal(schema.locales['zh-hans-cn'].app_block.widget.add, '添加 {quantity} 件');
  assert.equal(schema.name, 'Multi-item Discounts');
  assert.equal(schema.locales.en.app_block.widget.add, 'Add {quantity}');
  assert.deepEqual(readdirSync(file('compatibility/locales')).sort(), ['en.json', 'zh-hans-cn.json']);
  assert.equal(readFileSync(file('i18n/en.json'), 'utf8'), original);
  assert.ok(existsSync(file('i18n/en.schema.json')));
  assert.equal(run('--check').status, 0);
});

test('check detects inline locale drift without changing files', t => {
  const { file, run } = fixture(t);
  assert.equal(run().status, 0);
  const path = file('compatibility/blocks/app-block.html');
  writeFileSync(path, readFileSync(path, 'utf8').replace('Merchant edited title', 'Stale title'));
  const before = readFileSync(path, 'utf8');
  const result = run('--check');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /compatibility\/blocks\/app-block\.html/);
  assert.equal(readFileSync(path, 'utf8'), before);
});

test('migrates byte-identical generated OS3 editor copies but preserves custom and orphan locale files', t => {
  const { file, run } = fixture(t);
  const legacy = file('compatibility/locales/en.schema.json');
  writeFileSync(legacy, readFileSync(file('i18n/en.schema.json')));
  assert.notEqual(run('--check').status, 0);
  assert.ok(existsSync(legacy), 'check is read-only');
  assert.equal(run().status, 0);
  assert.equal(existsSync(legacy), false);
  writeFileSync(legacy, '{"custom":"preserve this"}');
  writeFileSync(file('compatibility/locales/custom.json'), '{"custom":"also preserve"}');
  const result = run();
  assert.notEqual(result.status, 0);
  assert.equal(readFileSync(legacy, 'utf8'), '{"custom":"preserve this"}');
  assert.equal(readFileSync(file('compatibility/locales/custom.json'), 'utf8'), '{"custom":"also preserve"}');
});

test('refuses missing template translations and oversized blocks before writing any artifacts', t => {
  const { file, run } = fixture(t);
  writeFileSync(file('i18n/zh-hans-cn.json'), '{}');
  const template = readFileSync(file('compatibility/blocks/app-block.html'), 'utf8');
  const result = run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /zh-hans-cn.*app_block.widget.title/);
  assert.equal(readFileSync(file('compatibility/blocks/app-block.html'), 'utf8'), template);
  assert.equal(existsSync(file('compatibility/assets/app-block.js')), false);
  writeFileSync(file('i18n/zh-hans-cn.json'), JSON.stringify({ app_block: { widget: { title: '字'.repeat(40000) } } }));
  const oversized = run();
  assert.notEqual(oversized.status, 0);
  assert.match(oversized.stderr, /102400|100\s*KiB/);
  assert.equal(readFileSync(file('compatibility/blocks/app-block.html'), 'utf8'), template);
});
