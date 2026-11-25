import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

test('a late bootstrap still mounts after the document recovery has already held the skeleton', async () => {
  const source = await readFile(new URL('../src/index.tsx', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } });
  let releaseI18n;
  const pendingI18n = new Promise((resolve) => { releaseI18n = resolve; });
  const timers = [];
  let mounted = 0;
  const modules = {
    react: { default: { createElement: (...args) => args, StrictMode: 'strict' } },
    'react-dom/client': { default: { createRoot: () => ({ render: () => { mounted++; } }) } },
    './index.css': {}, './pages/quantity-breaks.module.css': { default: { appShell: 'shell' } },
    './utils/i18n': { initI18next: () => pendingI18n },
    './utils/embedded-workspace-styles': { installEmbeddedWorkspaceStyleGuard() {} },
    './entry-route': { resolveEntryPath: () => '/quantity-breaks', resolveEntryHref: () => '/quantity-breaks' },
    './pages/quantity-breaks': { default: () => null },
    './prototype/embedded-auth': { initEmbeddedOAuth: () => false },
    './prototype/bootstrap-recovery': { BOOTSTRAP_TIMEOUT_MS: 5000, claimBootstrapRecovery: () => 'hold', clearBootstrapRecovery() {} },
    './prototype/browser-storage': { browserStorage: () => ({ removeItem() {} }) },
    './prototype/startup-performance': { markStartup() {} },
  };
  vm.runInNewContext(outputText, {
    exports: {}, require: (id) => { assert.ok(id in modules, `Unexpected import ${id}`); return modules[id]; },
    window: { location: { pathname: '/quantity-breaks', search: '', hash: '' }, sessionStorage: {}, setTimeout: (callback) => { timers.push(callback); return 1; }, requestAnimationFrame: (callback) => callback() },
    document: { getElementById: () => ({}) }, console: { error() {} },
  });
  for (const callback of timers) callback();
  for (let i = 0; i < 12; i++) await Promise.resolve();
  assert.equal(mounted, 0);
  releaseI18n();
  for (let i = 0; i < 12; i++) await Promise.resolve();
  assert.equal(mounted, 1);
});
