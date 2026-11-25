import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { applyMigrations } from '../src/db/migrate';
import { D1CampaignOperationRepository, OPERATION_LEASE_MS } from '../src/db/campaign-operations';
import { D1CampaignRepository } from '../src/db/campaigns';
import { D1SessionStore } from '../src/db/sessions';
import type { Env } from '../src/env';
import { processCampaignOperations } from '../src/jobs/campaign-operations';

const database = (env as Env).DB;
const encryptionKey = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY';
const testEnv = { ...(env as Env), TOKEN_ENCRYPTION_KEY: encryptionKey, now: () => 1_000 } as Env;

describe('merchant campaign operations', () => {
  beforeEach(async () => {
    await applyMigrations(database);
    await database.batch([
      database.prepare('DELETE FROM quantity_breaks_campaign_operations'),
      database.prepare('DELETE FROM quantity_breaks_campaign_operation_batches'),
    ]);
  });

  it('persists independent per-campaign delete outcomes in a merchant batch', async () => {
    const repository = new D1CampaignOperationRepository(database, () => 1_000);
    const batch = await repository.enqueueBatch({ handle: 'demo', type: 'delete', campaigns: [
      { campaignId: 'expired-1', expectedRevision: 3 }, { campaignId: 'draft-1', expectedRevision: 1 },
    ] });

    await expect(repository.readBatch('demo', batch.id)).resolves.toMatchObject({
      id: batch.id, type: 'delete', operations: [
        { campaignId: 'expired-1', expectedRevision: 3, state: 'queued' },
        { campaignId: 'draft-1', expectedRevision: 1, state: 'queued' },
      ],
    });
  });

  it('returns a running operation to retrying after an interrupted lease expires', async () => {
    const repository = new D1CampaignOperationRepository(database, () => 1_000);
    await repository.enqueueBatch({ handle: 'demo', type: 'delete', campaigns: [{ campaignId: 'expired-1', expectedRevision: 3 }] });

    const first = await repository.claimDue(1_000, 1);
    expect(first[0]).toMatchObject({ state: 'running', attempts: 1 });
    const second = await repository.claimDue(1_000 + OPERATION_LEASE_MS + 1, 1);
    expect(second[0]).toMatchObject({ state: 'running', attempts: 2 });
  });

  it('retries a rate-limited platform deletion after SHOPLINE Retry-After', async () => {
    const campaigns = new D1CampaignRepository(database, () => 1_000);
    const draft = {
      id: 'expired-1', name: 'Expired', status: 'draft' as const, startsAt: '2026-11-01T00:00:00.000Z',
      scope: { kind: 'products' as const, productIds: ['product-1'], excludedProductIds: [] },
      tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 1, discountType: 'none' as const }],
      combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
    };
    await campaigns.save('demo', draft, 0);
    const publish = await campaigns.beginPublication('demo', draft.id, 1, 'publish');
    await campaigns.finishPublication('demo', draft.id, 1, 'publish', 'expired-discount', publish.owner);
    const pause = await campaigns.beginPublication('demo', draft.id, 2, 'pause');
    await campaigns.finishPublication('demo', draft.id, 2, 'pause', 'expired-discount', pause.owner);
    await new D1SessionStore(database, encryptionKey).upsert({
      handle: 'demo', accessToken: 'access', refreshToken: 'refresh', scope: 'write_discounts', expiresAt: '2030-01-01T00:00:00.000Z', installed: true,
    });
    const repository = new D1CampaignOperationRepository(database, () => 1_000);
    const batch = await repository.enqueueBatch({ handle: 'demo', type: 'delete', campaigns: [{ campaignId: draft.id, expectedRevision: 3 }] });
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => init?.method === 'GET'
      ? Response.json({ discount_apps: [{ app_discount_id: 'expired-discount', status: 'expired' }] })
      : new Response('{}', { status: 429, headers: { 'Retry-After': '17' } }));
    vi.stubGlobal('fetch', fetcher);

    await expect(processCampaignOperations(testEnv, 1_000)).resolves.toEqual({ processed: 1, failed: 1 });
    const operation = (await repository.readBatch('demo', batch.id))?.operations[0];
    expect(operation).toMatchObject({ state: 'retrying', nextAttemptAt: 18_000 });
  });

  it('cleans an expired replacement ID without consulting the newly active campaign mapping', async () => {
    await new D1SessionStore(database, encryptionKey).upsert({
      handle: 'demo', accessToken: 'access', refreshToken: 'refresh', scope: 'write_discounts', expiresAt: '2030-01-01T00:00:00.000Z', installed: true,
    });
    const repository = new D1CampaignOperationRepository(database, () => 1_000);
    const batch = await repository.enqueueBatch({ handle: 'demo', type: 'delete', campaigns: [{
      campaignId: 'replacement-active',
      expectedRevision: 8,
      candidate: { expiredDiscountId: 'expired-discount', expiredNodeId: 'gid://shopline/DiscountAutomaticNode/expired' },
    }] });
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/sales/discount_app.json')) {
        calls.push('list');
        return Response.json({ discount_apps: calls.filter((call) => call === 'list').length === 1
          ? [{ app_discount_id: 'expired-discount', status: 'expired', node_id: 'gid://shopline/DiscountAutomaticNode/expired' }]
          : [] });
      }
      if (url.includes('/admin/openapi/v20261201/sales/discount_apps/') && init?.method === 'DELETE') {
        calls.push('delete');
        expect(url).toContain('/expired-discount.json');
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected platform request: ${url}`);
    }));

    await expect(processCampaignOperations(testEnv, 1_000)).resolves.toEqual({ processed: 1, failed: 0 });
    await expect(repository.readBatch('demo', batch.id)).resolves.toMatchObject({ state: 'completed', operations: [{ state: 'succeeded' }] });
    expect(calls).toEqual(['list', 'delete', 'list']);
  });

  it('refreshes product handles before an asynchronous replacement is published', async () => {
    const campaigns = new D1CampaignRepository(database, () => 1_000);
    const campaign = {
      id: 'replace-handles', name: 'Replacement handles', status: 'draft' as const, startsAt: '2026-11-01T00:00:00.000Z',
      scope: { kind: 'products' as const, productIds: ['product-1'], excludedProductIds: [] },
      tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 1, discountType: 'none' as const }],
      combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
    };
    await campaigns.save('demo', campaign, 0);
    await new D1SessionStore(database, encryptionKey).upsert({
      handle: 'demo', accessToken: 'access', refreshToken: 'refresh', scope: 'write_discounts', expiresAt: '2030-01-01T00:00:00.000Z', installed: true,
    });
    const operations = new D1CampaignOperationRepository(database, () => 1_000);
    await operations.enqueueBatch({ handle: 'demo', type: 'replace_activate', campaigns: [{ campaignId: campaign.id, expectedRevision: 1 }] });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/products/products.json')) return Response.json({ products: [{ id: 'product-1', handle: 'fresh-serum' }] });
      if (url.includes('/currency/currencies.json')) return Response.json({ currencies: [{ currency: 'USD', enabled: true }] });
      if (url.includes('/sales/discount_automatic_app.json') && init?.method === 'POST') return Response.json({ app_discount_id: 'replacement-discount' });
      if (url.includes('/sales/discount_app.json')) return Response.json({ discount_apps: [{ app_discount_id: 'replacement-discount', status: 'active' }] });
      throw new Error(`Unexpected platform request: ${url}`);
    }));

    await expect(processCampaignOperations(testEnv, 1_000)).resolves.toEqual({ processed: 1, failed: 0 });
    await expect(campaigns.get('demo', campaign.id)).resolves.toMatchObject({ scope: { productHandles: { 'product-1': 'fresh-serum' } } });
  });

  it('does not delete an existing discount when an asynchronous replacement cannot refresh handles', async () => {
    const campaigns = new D1CampaignRepository(database, () => 1_000);
    const campaign = {
      id: 'replace-handle-failure', name: 'Replacement handle failure', status: 'draft' as const, startsAt: '2026-11-01T00:00:00.000Z',
      scope: { kind: 'products' as const, productIds: ['product-1'], excludedProductIds: [] },
      tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 1, discountType: 'none' as const }],
      combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
    };
    await campaigns.save('demo', campaign, 0);
    const published = await campaigns.beginPublication('demo', campaign.id, 1, 'publish');
    await campaigns.finishPublication('demo', campaign.id, 1, 'publish', 'old-discount', published.owner);
    const paused = await campaigns.beginPublication('demo', campaign.id, 2, 'pause');
    await campaigns.finishPublication('demo', campaign.id, 2, 'pause', 'old-discount', paused.owner);
    await new D1SessionStore(database, encryptionKey).upsert({
      handle: 'demo', accessToken: 'access', refreshToken: 'refresh', scope: 'write_discounts', expiresAt: '2030-01-01T00:00:00.000Z', installed: true,
    });
    const operations = new D1CampaignOperationRepository(database, () => 1_000);
    await operations.enqueueBatch({ handle: 'demo', type: 'replace_activate', campaigns: [{ campaignId: campaign.id, expectedRevision: 3 }] });
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/products/products.json')) return Response.json({ products: [] });
      throw new Error(`Unexpected platform request: ${input}`);
    });
    vi.stubGlobal('fetch', fetcher);

    await expect(processCampaignOperations(testEnv, 1_000)).resolves.toEqual({ processed: 1, failed: 1 });
    expect(fetcher.mock.calls.some(([input]) => String(input).includes('/sales/discount_app'))).toBe(false);
    await expect(campaigns.getPublication('demo', campaign.id)).resolves.toMatchObject({ state: 'paused', discountId: 'old-discount' });
  });
});
