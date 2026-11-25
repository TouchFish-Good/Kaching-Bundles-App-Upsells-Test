import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import { readFileSync } from 'node:fs';

test('campaign API reads authenticated data and keeps server errors', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { readCampaigns, deleteCampaign, changeCampaignStatus } = await vite.ssrLoadModule('/src/prototype/campaign-api.ts');
    const campaigns = await readCampaigns(async () => ({ ok: true, json: async () => ({ campaigns: [{ id: 'a' }] }) }));
    assert.equal(campaigns[0].id, 'a');
    await assert.rejects(() => readCampaigns(async () => ({ ok: false, status: 401, json: async () => ({ error: 'AUTH_REQUIRED' }) })), (error) => error.status === 401);
    await assert.rejects(() => readCampaigns(async () => ({ ok: false, status: 401, json: async () => { throw new SyntaxError('HTML response'); } })), (error) => error.status === 401);
    let body;
    await deleteCampaign('a', 2, async (_url, options) => { body = JSON.parse(options.body); return { ok: true, json: async () => ({ deleted: true }) }; });
    assert.equal(body.expectedRevision, 2);
    let statusUrl;
    const updated = await changeCampaignStatus('a', 'paused', 3, async (url, options) => {
      statusUrl = url;
      body = JSON.parse(options.body);
      return { ok: true, json: async () => ({ campaign: { id: 'a', status: 'paused', revision: 4 } }) };
    });
    assert.equal(statusUrl, '/api/quantity-breaks/campaigns/a/status');
    assert.deepEqual(body, { status: 'paused', expectedRevision: 3 });
    assert.equal(updated.revision, 4);
  } finally { await vite.close(); }
});

test('campaign API reads one campaign for silent editor reconciliation', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { readCampaign } = await vite.ssrLoadModule('/src/prototype/campaign-api.ts');
    let requestedUrl = '';
    const campaign = await readCampaign('campaign/with space', async (url) => {
      requestedUrl = String(url);
      return { ok: true, status: 200, json: async () => ({ campaign: { id: 'campaign/with space' } }) };
    });
    assert.equal(requestedUrl, '/api/quantity-breaks/campaigns/campaign%2Fwith%20space');
    assert.equal(campaign.id, 'campaign/with space');
  } finally { await vite.close(); }
});

test('campaign API requests structured coverage conflicts', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { checkCampaignCoverage } = await vite.ssrLoadModule('/src/prototype/campaign-api.ts');
    const result = await checkCampaignCoverage({ id: 'editing', scope: { kind: 'products', productIds: ['product-a'], excludedProductIds: [] }, startsAt: '2026-10-28T00:00:00.000Z' }, async (url, options) => {
      assert.equal(url, '/api/quantity-breaks/campaigns/coverage');
      assert.deepEqual(JSON.parse(options.body), { campaign: { id: 'editing', scope: { kind: 'products', productIds: ['product-a'], excludedProductIds: [] }, startsAt: '2026-10-28T00:00:00.000Z' } });
      return { ok: true, json: async () => ({ state: 'conflict', conflicts: [{ campaignId: 'activity-a', campaignName: 'Activity A', itemId: 'product-a', itemName: 'Product A', type: 'products' }] }) };
    });
    assert.equal(result.conflicts[0].itemName, 'Product A');
  } finally { await vite.close(); }
});

test('connected campaign editor delegates saving to the App Bridge SaveBar', () => {
  const source = readFileSync(new URL('../src/prototype/CampaignEditor.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /<option>Renewal Serum<\/option>/);
  assert.match(source, /SaveBar\.create\(app\)/);
  assert.match(source, /onSave: \(\) => \{ void saveRef\.current\(campaign \? 'update' : 'publish'\); \}/);
  assert.doesNotMatch(source, /type="submit" name="intent" value="publish"/);
  assert.match(source, /const newCampaignId = useRef/);
  assert.doesNotMatch(source, /local-\$\{Date\.now\(\)\}/);
});

test('campaign status write rejects reauthorization response without retrying', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { changeCampaignStatus } = await vite.ssrLoadModule('/src/prototype/campaign-api.ts');
    let calls = 0;
    await assert.rejects(() => changeCampaignStatus('campaign-1', 'active', 1, async () => {
      calls++;
      return new Response('', { status: 403, headers: { 'X-SHOPLINE-API-Request-Failure-Reauthorize': '1' } });
    }), (error) => error.status === 403);
    assert.equal(calls, 1);
  } finally { await vite.close(); }
});

test('campaign API submits one batch status request and preserves per-campaign outcomes', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { changeCampaignStatuses } = await vite.ssrLoadModule('/src/prototype/campaign-api.ts');
    const results = await changeCampaignStatuses('active', [{ id: 'summer', revision: 2 }, { id: 'vip', revision: 4 }], async (url, options) => {
      assert.equal(url, '/api/quantity-breaks/campaigns/batch-status');
      assert.deepEqual(JSON.parse(options.body), { status: 'active', campaigns: [{ id: 'summer', expectedRevision: 2 }, { id: 'vip', expectedRevision: 4 }] });
      return { ok: true, json: async () => ({ results: [
        { id: 'summer', outcome: 'activated', campaign: { id: 'summer' } },
        { id: 'vip', outcome: 'conflict', message: 'VIP overlaps Summer.', conflict: { campaignId: 'vip', campaignName: 'VIP', conflictingCampaignId: 'summer', conflictingCampaignName: 'Summer', overlap: { type: 'products', ids: ['product-1'], names: ['Renewal Serum'] } } },
      ] }) };
    });
    assert.deepEqual(results.map((item) => item.outcome), ['activated', 'conflict']);
    assert.deepEqual(results[1].conflict, { campaignId: 'vip', campaignName: 'VIP', conflictingCampaignId: 'summer', conflictingCampaignName: 'Summer', overlap: { type: 'products', ids: ['product-1'], names: ['Renewal Serum'] } });
  } finally { await vite.close(); }
});

test('deletion polling waits through retries and does not treat a failed batch as all operations finished', async () => {
  const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  try {
    const { waitForCampaignOperationBatch } = await vite.ssrLoadModule('/src/prototype/campaign-api.ts');
    const states = ['retrying', 'succeeded'];
    const result = await waitForCampaignOperationBatch('batch', async (_url, init) => {
      assert.equal(init.method ?? 'GET', 'GET');
      return Response.json({ batch: { id: 'batch', state: 'failed', operations: [{ id: 'a', campaignId: 'deleted', state: states.shift(), lastError: null }, { id: 'b', campaignId: 'kept', state: 'failed', lastError: 'denied' }] } });
    }, { intervalMs: 1, timeoutMs: 100 });
    assert.equal(result.operations[0].state, 'succeeded');
    assert.equal(result.operations[1].state, 'failed');
  } finally { await vite.close(); }
});

test('deletion polling returns pending on deadline and aborts a hanging read', async () => {
  const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  try {
    const { waitForCampaignOperationBatch } = await vite.ssrLoadModule('/src/prototype/campaign-api.ts');
    const latest = await waitForCampaignOperationBatch('batch', async () => Response.json({ batch: { id: 'batch', state: 'running', operations: [{ id: 'a', campaignId: 'a', state: 'retrying', lastError: null }] } }), { intervalMs: 1, timeoutMs: 20 });
    assert.equal(latest.operations[0].state, 'retrying');
    const hanging = await waitForCampaignOperationBatch('batch', async (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })), { timeoutMs: 20 });
    assert.equal(hanging, null);
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(() => waitForCampaignOperationBatch('batch', async () => { throw new Error('must not read after cancellation'); }, { signal: controller.signal }), { name: 'AbortError' });
  } finally { await vite.close(); }
});

test('deletion polling preserves confirmed successes when a later result read fails', async () => {
  const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  try {
    const { waitForCampaignOperationBatch } = await vite.ssrLoadModule('/src/prototype/campaign-api.ts');
    let reads = 0;
    const result = await waitForCampaignOperationBatch('batch', async () => {
      if (++reads > 1) return Response.json({ error: 'temporarily unavailable' }, { status: 503 });
      return Response.json({ batch: { id: 'batch', state: 'running', operations: [{ id: 'op1', campaignId: 'deleted', state: 'succeeded', lastError: null }, { id: 'op2', campaignId: 'pending', state: 'running', lastError: null }] } });
    }, { intervalMs: 1 });
    assert.equal(result.operations[0].state, 'succeeded');
    assert.equal(result.operations[1].state, 'running');
  } finally { await vite.close(); }
});
