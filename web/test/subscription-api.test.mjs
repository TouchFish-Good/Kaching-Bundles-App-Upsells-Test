import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';

async function load() {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try { return await vite.ssrLoadModule('/src/prototype/subscription-api.ts'); }
  finally { await vite.close(); }
}

test('reads subscription state and surfaces a stable subscription error', async () => {
  const { readSubscription, SubscriptionApiError } = await load();
  const response = await readSubscription(async () => new Response(JSON.stringify({ entitlement: null, access: false }), { status: 200 }));
  assert.equal(response.access, false);
  await assert.rejects(() => readSubscription(async () => new Response(JSON.stringify({ error: 'Subscription required.', code: 'SUBSCRIPTION_REQUIRED' }), { status: 403 })), (error) => error instanceof SubscriptionApiError && error.code === 'SUBSCRIPTION_REQUIRED');
});
test('starts paid checkout only through an explicit subscribe call', async () => {
  const { startSubscriptionCheckout } = await load();
  const calls = [];
  const result = await startSubscriptionCheckout(async (input, init) => { calls.push({ input, init }); return new Response(JSON.stringify({ checkoutUrl: 'https://pay.example/one', outTradeNo: 'qb-one' }), { status: 200 }); });
  assert.equal(result.checkoutUrl, 'https://pay.example/one');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].init.body), { intent: 'subscribe' });
});

test('preserves a safe checkout failure code and request id for recovery UI', async () => {
  const { startSubscriptionCheckout, SubscriptionApiError } = await load();
  await assert.rejects(
    () => startSubscriptionCheckout(async () => new Response(JSON.stringify({ error: 'Unable to create the SHOPLINE payment link.', code: 'ORDER_PERSIST_FAILED', requestId: 'req_checkout_123' }), { status: 502, headers: { 'Content-Type': 'application/json' } })),
    (error) => error instanceof SubscriptionApiError && error.code === 'ORDER_PERSIST_FAILED' && error.requestId === 'req_checkout_123',
  );
});
