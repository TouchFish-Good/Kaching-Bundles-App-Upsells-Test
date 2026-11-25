import assert from 'node:assert/strict';
import { test } from 'node:test';

import { reportBrowserError } from '../src/observability/browser-errors.mjs';

test('reports with the supplied SHOPLINE session token', async () => {
  const calls = [];
  reportBrowserError({ type: 'runtime', pagePath: '/quantity-breaks', code: 'RUNTIME_ERROR' }, async (...args) => { calls.push(args); return new Response(null, { status: 204 }); }, 'session-token');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(calls.length, 1);
  assert.equal(new Headers(calls[0][1].headers).get('Authorization'), 'Bearer session-token');
});
