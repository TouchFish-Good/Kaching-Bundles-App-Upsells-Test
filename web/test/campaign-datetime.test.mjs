import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';

test('server ISO schedule displays locally and unchanged input round trips exactly', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { toDateTimeInput, fromDateTimeInput } = await vite.ssrLoadModule('/src/prototype/campaign-datetime.ts');
    const original = '2026-10-20T10:30:42.000Z';
    const input = toDateTimeInput(original);
    assert.match(input, /^2026-10-20T\d{2}:30$/);
    assert.equal(fromDateTimeInput(input, original), original);
    assert.equal(fromDateTimeInput('', original), undefined);
  } finally { await vite.close(); }
});
