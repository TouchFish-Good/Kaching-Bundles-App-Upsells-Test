import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hmacHex } from '../src/crypto';
import { applyMigrations } from '../src/db/migrate';
import { D1CampaignRepository } from '../src/db/campaigns';
import { D1SessionStore } from '../src/db/sessions';
import { D1SubscriptionRepository } from '../src/db/subscriptions';
import type { AuthContext } from '../src/auth/session';
import type { CampaignDraft, CampaignScope } from '../src/domain/campaign';
import type { Env } from '../src/env';
import { registerCampaignRoutes } from '../src/routes/campaigns';
import { readableCollectionDefinition } from './helpers/collection-definition';

const key = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY';
const secret = 'scope-update-test-secret';
const testEnv = { ...(env as Env), SHOPLINE_APP_KEY: 'scope-update-key', SHOPLINE_APP_SECRET: secret, TOKEN_ENCRYPTION_KEY: key } as Env;
const products: CampaignScope = { kind: 'products', productIds: ['product-original'], excludedProductIds: [] };
const collections = (id: string): CampaignScope => ({ kind: 'collections', collectionIds: [id], excludedProductIds: [] });

function base64Url(value: string): string {
  return btoa(value).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function jwt(): Promise<string> {
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64Url(JSON.stringify({ aud: testEnv.SHOPLINE_APP_KEY, handle: 'scope-shop', exp: 1_900_000_000 }));
  const signature = base64Url(await hmacHex(btoa(secret), `${header}.${payload}`).then((hex) => String.fromCharCode(...(hex.match(/.{2}/g) ?? []).map((part) => Number.parseInt(part, 16)))));
  return `${header}.${payload}.${signature}`;
}

async function publish(repository: D1CampaignRepository, id: string, scope: CampaignScope) {
  const draft: CampaignDraft = {
    id, name: id, status: 'draft', startsAt: '2026-01-01T00:00:00.000Z', neverExpires: true, scope,
    tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 2, discountType: 'percentage', discountValue: 1000 }],
    combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
  };
  await repository.save('scope-shop', draft, 0);
  const lease = await repository.beginPublication('scope-shop', id, 1, 'publish', scope.kind === 'collections' ? ['product-member'] : []);
  return repository.finishPublication('scope-shop', id, 1, 'publish', `${id}-discount`, lease.owner);
}

describe('published campaign scope updates', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  beforeEach(async () => {
    await applyMigrations(testEnv.DB);
    await testEnv.DB.batch(['quantity_breaks_collection_conflicts', 'quantity_breaks_staged_updates', 'quantity_breaks_publications', 'quantity_breaks_campaigns', 'quantity_breaks_shop_locks']
      .map((table) => testEnv.DB.prepare(`DELETE FROM ${table}`)));
    await new D1SessionStore(testEnv.DB, key).upsert({ handle: 'scope-shop', storeId: '42', accessToken: 'access', refreshToken: 'refresh', scope: 'write_discounts', expiresAt: '2030-01-01T00:00:00.000Z', installed: true });
    await new D1SubscriptionRepository(testEnv.DB).writeEntitlement({ appKey: testEnv.SHOPLINE_APP_KEY, handle: 'scope-shop', state: 'active', featureKeys: ['quantity_breaks_access'], activeSubscriptionId: 'subscription', activeSpuKey: 'ultra', validFrom: null, validUntil: null, graceUntil: null, autoRecurring: true, absenceConfirmations: 0 });
  });

  it.each([
    ['products to collections', products, collections('new-collection')],
    ['products to collections with a forged client snapshot', products, { ...collections('new-collection'), resolvedProductIds: ['untrusted-client-snapshot'] }],
    ['unchanged collections without a client snapshot', collections('old-collection'), collections('old-collection')],
    ['collections to other collections', collections('old-collection'), collections('new-collection')],
    ['collections to products', collections('old-collection'), products],
  ] as const)('resolves and synchronizes %s while preserving other activities', async (_name, originalScope, nextScope) => {
    const repository = new D1CampaignRepository(testEnv.DB);
    const current = await publish(repository, 'edited', originalScope);
    await publish(repository, 'other', collections('other-collection'));
    const writes: string[][] = [];
    let field: Record<string, unknown> = {};
    let platformRule: Record<string, unknown> | undefined;
    const upstream = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/metafield_definitions.json')) return readableCollectionDefinition(input);
      if (url.includes('/sales/discount_app.json')) return Response.json({ discount_apps: ['edited', 'other'].map((id) => ({ app_discount_id: `${id}-discount`, status: 'active' })) });
      if (url.includes('/products/products.json')) return Response.json({ products: [{ id: 'product-original', handle: 'original-product' }] });
      if (url.includes('/products/collections/') && url.includes('fields=id,handle')) {
        const id = url.match(/\/collections\/([^/.]+)/)?.[1] ?? '';
        return Response.json({ collection: { id, handle: `${id}-handle` } });
      }
      if (url.includes('/products/collections/')) return Response.json({ products: [{ id: 'product-member' }] });
      if (url.includes('/currency/currencies.json')) return Response.json({ currencies: [{ currency: 'USD', enabled: true }] });
      if (url.includes('/merchants/shop.json')) return Response.json({ shop: { id: '42' } });
      if (url.includes('/metafields_set.json')) {
        field = { ...JSON.parse(String(init?.body)).metafields[0], namespace: 'app--test--quantity-breaks' };
        writes.push(JSON.parse(String(field.value)).inCollections);
        return Response.json({ metafields: [field] });
      }
      if (url.includes('/metafields.json')) return Response.json({ metafields: [field] });
      if (init?.method === 'PUT') {
        platformRule = JSON.parse(JSON.parse(String(init.body)).metafields[0].value);
        if (nextScope.kind === 'collections') expect(writes.at(-1)).toContain(nextScope.collectionIds![0]);
        return Response.json({ app_discount_id: 'edited-discount' });
      }
      throw new Error(`Unexpected platform request: ${url}`);
    });
    vi.stubGlobal('fetch', upstream);
    const app = new Hono<{ Bindings: Env; Variables: { auth: AuthContext } }>();
    registerCampaignRoutes(app);
    const ctx = createExecutionContext();
    const response = await app.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/campaigns/edited', {
      method: 'PUT', headers: { Authorization: `Bearer ${await jwt()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision: current.revision, campaign: { ...current, name: 'Edited offer', scope: nextScope } }),
    }), testEnv, ctx);
    expect(await response.json()).toMatchObject({ campaign: { id: 'edited', name: 'Edited offer', revision: current.revision + 1 } });
    expect(response.status).toBe(200);
    await waitOnExecutionContext(ctx);
    const saved = await repository.get('scope-shop', 'edited');
    expect(saved?.scope).toEqual(nextScope.kind === 'collections'
      ? { ...nextScope, resolvedProductIds: ['product-member'], collectionHandles: { [nextScope.collectionIds![0]]: `${nextScope.collectionIds![0]}-handle` } }
      : { ...nextScope, productHandles: { 'product-original': 'original-product' } });
    const { resolvedProductIds: _snapshot, ...publicScope } = nextScope;
    expect(platformRule?.scope).toEqual(publicScope);
    expect(writes.at(-1)).toEqual([...new Set(['other-collection', ...(nextScope.collectionIds ?? [])])].sort());
    if (originalScope.kind === 'collections' && nextScope.kind === 'collections') expect(writes[0]).toContain(originalScope.collectionIds![0]);
    await expect(repository.getPublication('scope-shop', 'edited')).resolves.toMatchObject({ state: 'active', discountId: 'edited-discount' });
  });

  it.each(['empty collection', 'unconfirmed variables', 'uncertain update', 'cleanup failure'] as const)('handles %s without losing the last confirmed configuration', async (scenario) => {
    const repository = new D1CampaignRepository(testEnv.DB);
    const originalScope = scenario === 'cleanup failure' ? collections('old-collection') : products;
    const current = await publish(repository, 'edited', originalScope);
    await publish(repository, 'other', collections('other-collection'));
    let field: Record<string, unknown> = {};
    let writes = 0;
    let updates = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/metafield_definitions.json')) return readableCollectionDefinition(input);
      if (url.includes('/sales/discount_app.json')) return Response.json({ discount_apps: ['edited', 'other'].map((id) => ({ app_discount_id: `${id}-discount`, status: 'active' })) });
      if (url.includes('/products/products.json')) return Response.json({ products: [{ id: 'product-original', handle: 'original-product' }] });
      if (url.includes('/products/collections/') && url.includes('fields=id,handle')) {
        const id = url.match(/\/collections\/([^/.]+)/)?.[1] ?? '';
        return Response.json({ collection: { id, handle: `${id}-handle` } });
      }
      if (url.includes('/products/collections/')) return Response.json({ products: scenario === 'empty collection' ? [] : [{ id: 'product-member' }] });
      if (url.includes('/currency/currencies.json')) return Response.json({ currencies: [{ currency: 'USD', enabled: true }] });
      if (url.includes('/merchants/shop.json')) return Response.json({ shop: { id: '42' } });
      if (url.includes('/metafields_set.json')) {
        writes += 1;
        if (scenario === 'unconfirmed variables' || (scenario === 'cleanup failure' && writes === 2)) return Response.json({ metafields: [], fail_metafields: [{ key: 'collection-membership' }] });
        field = { ...JSON.parse(String(init?.body)).metafields[0], namespace: 'app--test--quantity-breaks' };
        return Response.json({ metafields: [field] });
      }
      if (url.includes('/metafields.json')) return Response.json({ metafields: [field] });
      if (init?.method === 'PUT') {
        updates += 1;
        return scenario === 'uncertain update' ? Response.json({}, { status: 429 }) : Response.json({ app_discount_id: 'edited-discount' });
      }
      throw new Error(`Unexpected platform request: ${url}`);
    }));
    const app = new Hono<{ Bindings: Env; Variables: { auth: AuthContext } }>();
    registerCampaignRoutes(app);
    const ctx = createExecutionContext();
    const response = await app.fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/campaigns/edited', {
      method: 'PUT', headers: { Authorization: `Bearer ${await jwt()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision: current.revision, campaign: { ...current, scope: collections('new-collection') } }),
    }), testEnv, ctx);
    await waitOnExecutionContext(ctx);
    const saved = await repository.get('scope-shop', 'edited');
    const publication = await repository.getPublication('scope-shop', 'edited');
    if (scenario === 'cleanup failure') {
      expect(response.status).toBe(200);
      expect(saved?.scope).toMatchObject({ kind: 'collections', collectionIds: ['new-collection'], collectionHandles: { 'new-collection': 'new-collection-handle' }, resolvedProductIds: ['product-member'] });
      expect(publication.state).toBe('active');
      expect(JSON.parse(String(field.value)).inCollections).toEqual(['new-collection', 'old-collection', 'other-collection']);
    } else {
      expect(response.status).toBe(409);
      expect(saved).toEqual(current);
      expect(publication.state).toBe(scenario === 'uncertain update' ? 'needs_reconciliation' : 'active');
      expect(updates).toBe(scenario === 'uncertain update' ? 1 : 0);
      if (scenario === 'uncertain update') await expect(repository.getStagedUpdate('scope-shop', 'edited')).resolves.toMatchObject({ candidate: { scope: { collectionIds: ['new-collection'] } } });
    }
    expect(publication.discountId).toBe('edited-discount');
    await expect(repository.getPublication('scope-shop', 'other')).resolves.toMatchObject({ state: 'active', discountId: 'other-discount' });
    const lock = await testEnv.DB.prepare('SELECT owner FROM quantity_breaks_shop_locks WHERE shop_handle = ?').bind('scope-shop').first();
    expect(lock).toBeNull();
  });

});
