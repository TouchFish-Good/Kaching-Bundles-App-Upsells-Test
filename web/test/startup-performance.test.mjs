import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';

async function loadStartupPerformance() {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try { return await vite.ssrLoadModule('/src/prototype/startup-performance.ts'); }
  finally { await vite.close(); }
}

test('startup marks use a stable local namespace', async () => {
  const { markStartup } = await loadStartupPerformance();
  const marks = [];

  markStartup('react-mounted', { mark: (name) => marks.push(name) });

  assert.deepEqual(marks, ['quantity-breaks:react-mounted']);
});

test('startup marks never block rendering when browser performance APIs are unavailable', async () => {
  const { markStartup } = await loadStartupPerformance();

  assert.doesNotThrow(() => markStartup('campaigns-ready', undefined));
});
