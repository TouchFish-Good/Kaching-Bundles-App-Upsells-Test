const test = require('node:test');
const assert = require('node:assert/strict');
const { registerWebhooksBestEffort } = require('../src/auth/webhook-registration');

test('a failed webhook registration does not reject a completed OAuth callback', async () => {
  const originalError = console.error;
  const messages = [];
  console.error = (...parts) => messages.push(parts);
  try {
    await assert.doesNotReject(() => registerWebhooksBestEffort(async () => { throw new Error('secret response'); }));
  } finally { console.error = originalError; }
  assert.deepEqual(messages, [['SHOPLINE webhook registration failed after authorization']]);
  assert.equal(JSON.stringify(messages).includes('secret'), false);
});
