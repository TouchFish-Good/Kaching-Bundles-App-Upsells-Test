import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';

test('price client deduplicates, isolates clients, expires successes and does not cache failures', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { createPreviewPriceClient } = await vite.ssrLoadModule('/src/prototype/preview-price-client.ts');
    let calls = 0, now = 0, fail = false;
    const fetcher = async () => {
      calls++;
      if (fail) return new Response('{}', { status: 429 });
      return Response.json({ prices: [{ countryCode: 'US', amountMinor: 1234, currencyCode: 'USD' }] });
    };
    const client = createPreviewPriceClient(fetcher, { now: () => now, interval: 0 });
    const [a, b] = await Promise.all([client.load('one', 'US'), client.load('one', 'US')]);
    assert.equal(a.amountMinor, 1234); assert.deepEqual(a, b); assert.equal(calls, 1);
    await client.load('one', 'US'); assert.equal(calls, 1);
    now = 60001;
    await client.load('one', 'US'); assert.equal(calls, 2);
    await createPreviewPriceClient(fetcher, { interval: 0 }).load('one', 'US'); assert.equal(calls, 3);
    fail = true;
    await assert.rejects(client.load('bad', 'US'));
    fail = false;
    assert.equal((await client.load('bad', 'US')).amountMinor, 1234);
    assert.equal(calls, 5);
    await assert.rejects(client.load('one', 'CA'), /unavailable/i);
  } finally { await vite.close(); }
});

test('cancelled queued prices never reach the server and a new consumer can reuse the client', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { createPreviewPriceClient } = await vite.ssrLoadModule('/src/prototype/preview-price-client.ts');
    const sent = [];
    const client = createPreviewPriceClient(async (url) => {
      sent.push(url);
      return Response.json({ prices: [{ countryCode: 'US', amountMinor: 100, currencyCode: 'USD' }] });
    }, { interval: 10 });
    const controller = new AbortController();
    const old = client.load('old', 'US', controller.signal).catch(error => error.name);
    controller.abort();
    assert.equal(await old, 'AbortError');
    assert.equal((await client.load('new', 'US')).amountMinor, 100);
    assert.equal(sent.length, 1); assert.match(sent[0], /\/new\//);
  } finally { await vite.close(); }
});

test('cancelling one consumer leaves a shared lookup available to the other', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { createPreviewPriceClient } = await vite.ssrLoadModule('/src/prototype/preview-price-client.ts');
    let complete;
    const client = createPreviewPriceClient(async () => new Promise(resolve => { complete = () => resolve(Response.json({ prices: [{ countryCode: 'US', amountMinor: 0, currencyCode: 'USD' }] })); }), { interval: 0 });
    const controller = new AbortController();
    const cancelled = client.load('shared', 'US', controller.signal).catch(error => error.name);
    const retained = client.load('shared', 'US');
    controller.abort();
    await new Promise(resolve => setTimeout(resolve, 0));
    complete();
    assert.equal(await cancelled, 'AbortError');
    assert.equal((await retained).amountMinor, 0, 'zero is a confirmed valid price');
  } finally { await vite.close(); }
});
