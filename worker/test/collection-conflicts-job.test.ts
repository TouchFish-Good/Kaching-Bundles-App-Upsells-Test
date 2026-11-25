import { env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { applyMigrations } from '../src/db/migrate';
import { D1CampaignRepository } from '../src/db/campaigns';
import { D1SessionStore } from '../src/db/sessions';
import { refreshCollectionConflicts } from '../src/jobs/collection-conflicts';
import type { Env } from '../src/env';
import type { CampaignDraft } from '../src/domain/campaign';
import { readableCollectionDefinition } from './helpers/collection-definition';

const key = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY';
const testEnv = { ...(env as Env), SHOPLINE_APP_SECRET: 'job-secret', SHOPLINE_APP_KEY: 'job-key', TOKEN_ENCRYPTION_KEY: key, now: () => Date.parse('2026-10-27T00:00:00.000Z') } as Env;

const collection: CampaignDraft = {
  id: 'collection-offer', name: 'Collection offer', status: 'draft', startsAt: '2026-01-01T00:00:00.000Z',
  scope: { kind: 'collections', collectionIds: ['collection-a'], resolvedProductIds: ['old-product'], excludedProductIds: [] },
  tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 1, discountType: 'none' }],
  combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
};

function stubCollectionApi(members: Record<string, string[]> = { 'collection-a': ['new-product'] }, failVariables = false) {
  let variables = '';
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/metafield_definitions.json')) return readableCollectionDefinition(input);
    if (url.includes('/oauth/token/refresh')) return new Response(JSON.stringify({ access_token: 'fresh', refresh_token: 'refresh-2', expires_at: '2030-01-01T00:00:00.000Z' }));
    if (url.includes('/merchants/shop.json')) return new Response(JSON.stringify({ data: { id: '42' } }));
    if (url.includes('/metafields_set.json') && init?.method === 'POST') {
      if (failVariables) return new Response('{}', { status: 503 });
      variables = JSON.parse(String(init.body)).metafields[0].value;
      return new Response(JSON.stringify({ metafields: [{ namespace: '$app:quantity-breaks', key: 'collection-membership', owner_id: '42' }], fail_metafields: [] }));
    }
    if (url.includes('/metafields.json')) return new Response(JSON.stringify({ metafields: [{ namespace: '$app:quantity-breaks', key: 'collection-membership', owner_id: '42', value: variables }] }));
    const id = url.match(/\/products\/collections\/([^/]+)\/products.json/)?.[1];
    if (id && members[id]) return new Response(JSON.stringify({ products: members[id].map((id) => ({ id })) }));
    throw new Error(`Unexpected SHOPLINE request: ${url}`);
  }));
}

describe('collection conflict refresh job', () => {
  beforeEach(async () => {
    await applyMigrations(testEnv.DB);
    await testEnv.DB.batch([
      testEnv.DB.prepare('DELETE FROM quantity_breaks_collection_conflicts'),
      testEnv.DB.prepare('DELETE FROM quantity_breaks_publications'),
      testEnv.DB.prepare('DELETE FROM quantity_breaks_campaigns'),
      testEnv.DB.prepare('DELETE FROM quantity_breaks_shop_locks'),
      testEnv.DB.prepare('DELETE FROM shopline_sessions'),
    ]);
    const repository = new D1CampaignRepository(testEnv.DB, () => Date.parse('2026-10-20T00:00:00.000Z'));
    await repository.save('job-shop', collection, 0);
    const lease = await repository.beginPublication('job-shop', collection.id, 1, 'publish', ['old-product']);
    await repository.finishPublication('job-shop', collection.id, 1, 'publish', 'activity-1', lease.owner);
    await new D1SessionStore(testEnv.DB, key).upsert({ handle: 'job-shop', accessToken: 'expired', refreshToken: 'refresh', scope: 'read_products', expiresAt: '2026-10-26T00:00:00.000Z', installed: true });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('refreshes active collection snapshots without creating another discount', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/metafield_definitions.json')) return readableCollectionDefinition(input);
      if (url.includes('/oauth/token/refresh')) return new Response(JSON.stringify({ access_token: 'fresh', refresh_token: 'refresh-2', expires_at: '2030-01-01T00:00:00.000Z' }), { status: 200 });
      if (url.includes('/merchants/shop.json')) return new Response(JSON.stringify({ data: { id: '42' } }));
      if (url.includes('/metafields_set.json') && init?.method === 'POST') return new Response(JSON.stringify({ metafields: [{ namespace: '$app:quantity-breaks', key: 'collection-membership', owner_id: '42' }], fail_metafields: [] }));
      if (url.includes('/metafields.json')) return new Response(JSON.stringify({ metafields: [{ namespace: '$app:quantity-breaks', key: 'collection-membership', owner_id: '42', value: '{"inCollections":["collection-a"]}' }] }));
      return new Response(JSON.stringify({ products: [{ id: 'new-product', title: 'New product' }] }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetcher);
    const result = await refreshCollectionConflicts(testEnv, new Date('2026-10-26T00:00:00.000Z'));
    expect(result).toEqual({ scanned: 1, refreshed: 1, failed: 0 });
    await expect(new D1CampaignRepository(testEnv.DB).get('job-shop', collection.id)).resolves.toMatchObject({ scope: { resolvedProductIds: ['new-product'] } });
    expect(fetcher.mock.calls.filter(([input]) => String(input).includes('discount_automatic'))).toHaveLength(0);
  });

  it('uses one token refresh for an expired session during one scan', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/metafield_definitions.json')) return readableCollectionDefinition(input);
      if (url.includes('/oauth/token/refresh')) return new Response(JSON.stringify({ access_token: 'fresh', refresh_token: 'refresh-2', expires_at: '2030-01-01T00:00:00.000Z' }), { status: 200 });
      if (url.includes('/merchants/shop.json')) return new Response(JSON.stringify({ data: { id: '42' } }));
      if (url.includes('/metafields_set.json') && init?.method === 'POST') return new Response(JSON.stringify({ metafields: [{ namespace: '$app:quantity-breaks', key: 'collection-membership', owner_id: '42' }], fail_metafields: [] }));
      if (url.includes('/metafields.json')) return new Response(JSON.stringify({ metafields: [{ namespace: '$app:quantity-breaks', key: 'collection-membership', owner_id: '42', value: '{"inCollections":["collection-a"]}' }] }));
      return new Response(JSON.stringify({ products: [{ id: 'new-product' }] }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetcher);
    await refreshCollectionConflicts(testEnv);
    expect(fetcher.mock.calls.filter(([input]) => String(input).includes('/oauth/token/refresh'))).toHaveLength(1);
  });

  it('refreshes membership without changing the campaign edit time or revision', async () => {
    stubCollectionApi();
    await refreshCollectionConflicts(testEnv);
    const repository = new D1CampaignRepository(testEnv.DB);
    await expect(repository.get('job-shop', collection.id)).resolves.toMatchObject({
      updatedAt: '2026-10-20T00:00:00.000Z', revision: 2,
      scope: { resolvedProductIds: ['new-product'] },
    });
    await expect(repository.getCollectionConflict('job-shop', collection.id)).resolves.toMatchObject({
      state: 'clear', syncedAt: '2026-10-27T00:00:00.000Z',
    });
    await expect(repository.getProjection('job-shop', collection.id)).resolves.toMatchObject({
      collectionConflict: { syncedAt: '2026-10-27T00:00:00.000Z' },
    });
    await expect(repository.listProjections('job-shop')).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ collectionConflict: expect.objectContaining({ syncedAt: '2026-10-27T00:00:00.000Z' }) }),
    ]));
  });

  it('does not write an unchanged snapshot, but still records a successful sync', async () => {
    stubCollectionApi({ 'collection-a': ['old-product'] });
    // An unchanged refresh must also work when campaign writes are disallowed.
    await testEnv.DB.prepare(`CREATE TRIGGER reject_unchanged_campaign_write BEFORE UPDATE ON quantity_breaks_campaigns
      BEGIN SELECT RAISE(ABORT, 'campaign snapshot must not be rewritten'); END`).run();
    try {
      await expect(refreshCollectionConflicts(testEnv)).resolves.toEqual({ scanned: 1, refreshed: 1, failed: 0 });
      await expect(new D1CampaignRepository(testEnv.DB).getCollectionConflict('job-shop', collection.id)).resolves.toMatchObject({
        state: 'clear', syncedAt: '2026-10-27T00:00:00.000Z',
      });
    } finally {
      await testEnv.DB.prepare('DROP TRIGGER reject_unchanged_campaign_write').run();
    }
  });

  it('clears legacy product-vs-collection conflict warnings using the publication rules', async () => {
    const repository = new D1CampaignRepository(testEnv.DB);
    const product: CampaignDraft = { ...collection, id: 'product-offer', scope: { kind: 'products', productIds: ['new-product'], excludedProductIds: [] } };
    await repository.save('job-shop', product, 0);
    const lease = await repository.beginPublication('job-shop', product.id, 1, 'publish');
    await repository.finishPublication('job-shop', product.id, 1, 'publish', 'activity-2', lease.owner);
    await repository.setCollectionConflict('job-shop', collection.id, 'conflict', [product.id]);
    stubCollectionApi();
    await refreshCollectionConflicts(testEnv);
    await expect(repository.getCollectionConflict('job-shop', collection.id)).resolves.toMatchObject({ state: 'clear', campaignIds: [] });
    await expect(repository.getPublication('job-shop', product.id)).resolves.toMatchObject({ state: 'active', discountId: 'activity-2' });
  });

  it('does not mark different collection IDs as conflicts when their products overlap', async () => {
    const repository = new D1CampaignRepository(testEnv.DB);
    const other: CampaignDraft = { ...collection, id: 'other-collection', scope: { kind: 'collections', collectionIds: ['collection-b'], excludedProductIds: [] } };
    await repository.save('job-shop', other, 0);
    const lease = await repository.beginPublication('job-shop', other.id, 1, 'publish', ['new-product']);
    await repository.finishPublication('job-shop', other.id, 1, 'publish', 'activity-2', lease.owner);
    stubCollectionApi({ 'collection-a': ['new-product'], 'collection-b': ['new-product'] });
    await refreshCollectionConflicts(testEnv);
    for (const id of [collection.id, other.id]) {
      await expect(repository.getCollectionConflict('job-shop', id)).resolves.toMatchObject({ state: 'clear', campaignIds: [] });
    }
  });

  it.each([
    ['active', 'conflict', ['legacy-collection']],
    ['paused', 'clear', []],
  ] as const)('only warns about the same collection when the other publication is active (%s)', async (publication, state, campaignIds) => {
    // Seed legacy published data: new publications already reject this overlap.
    const other = { ...collection, id: 'legacy-collection', status: 'active' };
    await testEnv.DB.prepare('INSERT INTO quantity_breaks_campaigns (shop_handle, id, campaign_json, revision, updated_at) VALUES (?, ?, ?, 1, ?)')
      .bind('job-shop', other.id, JSON.stringify(other), '2026-10-20T00:00:00.000Z').run();
    await testEnv.DB.prepare('INSERT INTO quantity_breaks_publications (shop_handle, campaign_id, state, discount_id, updated_at) VALUES (?, ?, ?, ?, ?)')
      .bind('job-shop', other.id, publication, 'activity-2', '2026-10-20T00:00:00.000Z').run();
    stubCollectionApi();
    await refreshCollectionConflicts(testEnv);
    await expect(new D1CampaignRepository(testEnv.DB).getCollectionConflict('job-shop', collection.id)).resolves.toMatchObject({ state, campaignIds });
  });

  it('preserves the last successful sync time when later variable maintenance fails', async () => {
    stubCollectionApi();
    await refreshCollectionConflicts(testEnv);
    stubCollectionApi({ 'collection-a': ['new-product'] }, true);
    await refreshCollectionConflicts(testEnv, new Date('2026-10-28T00:00:00.000Z'));
    await expect(new D1CampaignRepository(testEnv.DB).getCollectionConflict('job-shop', collection.id)).resolves.toMatchObject({
      state: 'unknown', syncedAt: '2026-10-27T00:00:00.000Z',
    });
  });

  it('rejects stale revisions even when membership has not changed', async () => {
    await expect(new D1CampaignRepository(testEnv.DB).updateCollectionSnapshot('job-shop', collection.id, 99, ['old-product']))
      .rejects.toThrow('Published collection campaign changed');
  });
});
