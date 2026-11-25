import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

async function loadStylesGuard() {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const module = await vite.ssrLoadModule('/src/utils/embedded-workspace-styles.ts');
  return {
    ensureEmbeddedWorkspaceStyles: module.ensureEmbeddedWorkspaceStyles,
    installEmbeddedWorkspaceStyleGuard: module.installEmbeddedWorkspaceStyleGuard,
    close: () => vite.close(),
  };
}

async function loadStylesFallback() {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  return {
    ensureEmbeddedWorkspaceStyleFallback: (await vite.ssrLoadModule('/src/utils/embedded-workspace-style-fallback.ts')).ensureEmbeddedWorkspaceStyleFallback,
    close: () => vite.close(),
  };
}

test('injects the embedded workspace stylesheet when the linked stylesheet is not applied', async () => {
  const { ensureEmbeddedWorkspaceStyles, close } = await loadStylesGuard();
  const dom = new JSDOM('<!doctype html><html><head></head><body><div class="workspace-root"></div></body></html>');

  try {
    const injected = ensureEmbeddedWorkspaceStyles(dom.window.document, 'workspace-root', '.workspace-root { display: grid; }');

    assert.equal(injected, true);
    assert.equal(dom.window.document.querySelectorAll('#quantity-breaks-embedded-workspace-styles').length, 1);
    assert.equal(dom.window.getComputedStyle(dom.window.document.querySelector('.workspace-root')).display, 'grid');
  } finally {
    dom.window.close();
    await close();
  }
});

test('does not inject a duplicate stylesheet when the linked workspace stylesheet is already applied', async () => {
  const { ensureEmbeddedWorkspaceStyles, close } = await loadStylesGuard();
  const dom = new JSDOM('<!doctype html><html><head><style>.workspace-root { display: grid; }</style></head><body><div class="workspace-root"></div></body></html>');

  try {
    const injected = ensureEmbeddedWorkspaceStyles(dom.window.document, 'workspace-root', '.workspace-root { color: red; }');

    assert.equal(injected, false);
    assert.equal(dom.window.document.querySelector('#quantity-breaks-embedded-workspace-styles'), null);
  } finally {
    dom.window.close();
    await close();
  }
});

test('loads the compiled CSS only through the fallback module after an embedded style failure', async () => {
  const { ensureEmbeddedWorkspaceStyleFallback, close } = await loadStylesFallback();
  const dom = new JSDOM('<!doctype html><html><head></head><body><div class="workspace-root"></div></body></html>');

  try {
    assert.equal(ensureEmbeddedWorkspaceStyleFallback(dom.window.document, 'workspace-root'), true);
    assert.match(dom.window.document.getElementById('quantity-breaks-embedded-workspace-styles').textContent, /appShell/);
  } finally {
    dom.window.close();
    await close();
  }
});

test('waits for React to mount the workspace before deciding whether embedded styles need recovery', async () => {
  const { installEmbeddedWorkspaceStyleGuard, close } = await loadStylesGuard();
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>');
  let recoveries = 0;

  try {
    installEmbeddedWorkspaceStyleGuard(dom.window.document, 'workspace-root', () => { recoveries += 1; });
    dom.window.document.getElementById('root').innerHTML = '<div class="workspace-root"></div>';
    await Promise.resolve();

    assert.equal(recoveries, 1);
  } finally {
    dom.window.close();
    await close();
  }
});
