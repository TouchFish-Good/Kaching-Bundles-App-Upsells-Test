import { env, createExecutionContext } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src';
import { applyMigrations } from '../src/db/migrate';
import { D1CampaignRepository } from '../src/db/campaigns';
import { D1SubscriptionRepository } from '../src/db/subscriptions';
import type { CampaignDraft, CampaignScope } from '../src/domain/campaign';
import type { Env } from '../src/env';

const testEnv = { ...(env as Env), SHOPLINE_APP_KEY: 'storefront-test' } as Env;
const shop = 'collection-shop';

async function publish(id: string, scope: Omit<CampaignScope, 'excludedProductIds'> & { excludedProductIds?: string[] }, dates: Partial<CampaignDraft> = {}) {
  const repository = new D1CampaignRepository(testEnv.DB);
  await repository.save(shop, {
    id, name: id, status: 'draft', scope: { excludedProductIds: [], ...scope },
    startsAt: '2026-01-01T00:00:00.000Z',
    tiers: [{ tierId: 'one', displayOrder: 0, quantity: 1, discountType: 'none' }],
    combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
    ...dates,
  }, 0);
  const lease = await repository.beginPublication(shop, id, 1, 'publish', scope.resolvedProductIds ?? ['old-product']);
  await repository.finishPublication(shop, id, 1, 'publish', `discount-${id}`, lease.owner);
}

function request(ids?: string[], complete = true) {
  const params = new URLSearchParams({ shop, productId: 'product-1' });
  if (ids === undefined) return worker.fetch(new Request(`https://raised-stability-gaps-html.trycloudflare.com/public/quantity-breaks/campaign?${params}`), testEnv, createExecutionContext());
  params.set('collectionIds', ids.join(','));
  params.set('collectionsComplete', String(complete));
  params.set('collectionCount', String(ids.length));
  return worker.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/public/quantity-breaks/campaign', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString(),
  }), testEnv, createExecutionContext());
}

describe('storefront current product collection membership', () => {
  beforeEach(async () => {
    await applyMigrations(testEnv.DB);
    await new D1SubscriptionRepository(testEnv.DB).writeEntitlement({
      appKey: testEnv.SHOPLINE_APP_KEY, handle: shop, state: 'active', featureKeys: ['quantity_breaks_access'],
      activeSubscriptionId: 'sub', activeSpuKey: 'ultra', validFrom: null, validUntil: null,
      graceUntil: null, autoRecurring: true, absenceConfirmations: 0,
    });
  });

  it.each([101, 1000])('uses current membership across %i categories for a product absent from the snapshot', async (count) => {
    await publish('collection-offer', { kind: 'collections', collectionIds: ['collection-101'], resolvedProductIds: ['old-product'] });
    const ids = Array.from({ length: count }, (_, index) => `collection-${index + 1}`);
    const response = await request(ids);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ campaign: { id: 'collection-offer' } });
    const saved = await new D1CampaignRepository(testEnv.DB).get(shop, 'collection-offer');
    expect(saved?.scope.resolvedProductIds).toEqual(['old-product']);
  });

  it.each([{ ids: [] }, { ids: ['another-collection'] }])('does not use stale cached membership after a product leaves the collection: %j', async ({ ids }) => {
    await publish('collection-offer', { kind: 'collections', collectionIds: ['collection-1'], resolvedProductIds: ['product-1'] });
    expect((await request(ids)).status).toBe(404);
  });

  it('does not treat incomplete membership as a trustworthy cached or current match', async () => {
    await publish('collection-offer', { kind: 'collections', collectionIds: ['collection-1'], resolvedProductIds: ['product-1'] });
    expect((await request(['collection-1'], false)).status).toBe(404);
  });

  it('keeps product exclusions ahead of current membership', async () => {
    await publish('collection-offer', { kind: 'collections', collectionIds: ['collection-1'], excludedProductIds: ['product-1'] });
    expect((await request(['collection-1'])).status).toBe(404);
  });

  it('prefers a published product offer over a matching collection offer for old and new themes', async () => {
    await publish('collection-offer', { kind: 'collections', collectionIds: ['collection-1'], resolvedProductIds: ['product-1'] });
    await publish('product-offer', { kind: 'products', productIds: ['product-1'] });
    for (const ids of [undefined, ['collection-1']]) {
      const response = await request(ids);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ campaign: { id: 'product-offer' } });
    }
  });

  it.each([
    { startsAt: '2099-01-01T00:00:00.000Z' },
    { endsAt: '2026-01-02T00:00:00.000Z' },
  ])('falls back to the collection offer when the product offer is outside its active period: %j', async (dates) => {
    await publish('collection-offer', { kind: 'collections', collectionIds: ['collection-1'] });
    await publish('product-offer', { kind: 'products', productIds: ['product-1'] }, dates);
    const response = await request(['collection-1']);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ campaign: { id: 'collection-offer' } });
  });

  it('keeps old theme GET requests compatible with the existing snapshot', async () => {
    await publish('collection-offer', { kind: 'collections', collectionIds: ['collection-1'], resolvedProductIds: ['product-1'] });
    expect((await request()).status).toBe(200);
  });

  it('still requires subscription access with current collection membership', async () => {
    await publish('collection-offer', { kind: 'collections', collectionIds: ['collection-1'] });
    await testEnv.DB.prepare('DELETE FROM quantity_breaks_entitlements WHERE app_key = ? AND shop_handle = ?').bind(testEnv.SHOPLINE_APP_KEY, shop).run();
    expect((await request(['collection-1'])).status).toBe(404);
  });

  it('rejects invalid or excessive collection IDs', async () => {
    expect((await request(['bad/id'])).status).toBe(400);
    expect((await request(Array.from({ length: 1001 }, (_, index) => `collection-${index}`))).status).toBe(400);
  });
});
