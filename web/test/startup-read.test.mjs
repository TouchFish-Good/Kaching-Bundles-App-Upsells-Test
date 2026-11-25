import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';

test('a stalled startup read is aborted and finishes with a bounded recovery error', async (t) => {
  const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  const { readStartupResource } = await vite.ssrLoadModule('/src/prototype/startup-read.ts');
  await vite.close();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const signals = [];
  let failure;
  const result = readStartupResource((signal) => {
    signals.push(signal);
    return new Promise(() => {});
  }, () => true).catch((error) => { failure = error; });
  t.mock.timers.tick(15_000);
  for (let i = 0; i < 12; i++) await Promise.resolve();
  t.mock.timers.tick(250);
  for (let i = 0; i < 12; i++) await Promise.resolve();
  t.mock.timers.tick(15_000);
  for (let i = 0; i < 12; i++) await Promise.resolve();
  assert.equal(failure?.code, 'STARTUP_READ_TIMEOUT');
  assert.equal(signals.length, 2);
  assert.ok(signals.every((signal) => signal.aborted));
  await result;
});
