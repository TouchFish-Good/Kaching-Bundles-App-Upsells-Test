import { env, createExecutionContext } from 'cloudflare:test';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { hmacHex } from '../src/crypto';
import { applyMigrations } from '../src/db/migrate';
import { D1CampaignRepository } from '../src/db/campaigns';
import { D1SessionStore } from '../src/db/sessions';
import { D1SubscriptionRepository } from '../src/db/subscriptions';
import type { AuthContext } from '../src/auth/session';
import type { Env } from '../src/env';
import { registerCampaignRoutes } from '../src/routes/campaigns';

const key = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY';
const secret = 'replacement-route-secret';
const testEnv = { ...(env as Env), SHOPLINE_APP_KEY: 'replacement-route-key', SHOPLINE_APP_SECRET: secret, TOKEN_ENCRYPTION_KEY: key, now: () => Date.parse('2026-10-27T00:00:00.000Z') } as Env;

function base64Url(value: string): string {
  return btoa(value).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function jwt(): Promise<string> {
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64Url(JSON.stringify({ aud: 'replacement-route-key', handle: 'replacement-shop', exp: 1_900_000_000 }));
  const signature = base64Url(await hmacHex(btoa(secret), `${header}.${payload}`).then((hex) => String.fromCharCode(...(hex.match(/.{2}/g) ?? []).map((part) => Number.parseInt(part, 16)))));
  return `${header}.${payload}.${signature}`;
}

function campaignApp() {
  const app = new Hono<{ Bindings: Env; Variables: { auth: AuthContext } }>();
  registerCampaignRoutes(app);
  return app;
}

async function pausedCampaign(id: string, name: string, productId = 'product-1') {
  const repository = new D1CampaignRepository(testEnv.DB);
  const campaign = {
    id, name, status: 'draft' as const, startsAt: '2026-10-28T00:00:00.000Z',
    scope: { kind: 'products' as const, productIds: [productId], excludedProductIds: [] },
    tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 1, discountType: 'none' as const }],
    combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
  };
  await repository.save('replacement-shop', campaign, 0);
  const publish = await repository.beginPublication('replacement-shop', id, 1, 'publish');
  await repository.finishPublication('replacement-shop', id, 1, 'publish', `${id}-expired`, publish.owner, `gid://shopline/DiscountAutomaticNode/${id}-expired`);
  const pause = await repository.beginPublication('replacement-shop', id, 2, 'pause');
  await repository.finishPublication('replacement-shop', id, 2, 'pause', `${id}-expired`, pause.owner, `gid://shopline/DiscountAutomaticNode/${id}-expired`);
  return { campaign, repository };
}

function replacementFetcher(expiredId: string, replacementId: string, requests: string[], failure?: string) {
  const failures = new Set(failure?.split('+') ?? []);
  let created = false;
  let deleted = false;
  let metafields: unknown[] = [];
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/products/products.json')) {
      const ids = new URL(url).searchParams.get('ids')?.split(',') ?? [];
      return Response.json({ products: ids.map((id) => ({ id, handle: `${id}-handle` })) });
    }
    if (url.includes('/sales/discount_app.json')) return Response.json({ discount_apps: [
      ...(!deleted ? [{ app_discount_id: expiredId, status: 'expired', node_id: `gid://shopline/DiscountAutomaticNode/${expiredId}` }] : []),
      ...(created ? [{ app_discount_id: replacementId, status: 'active', node_id: `gid://shopline/DiscountAutomaticNode/${replacementId}`, metafields }] : []),
    ] });
    if (url.includes('/currency/currencies.json')) return Response.json({ currencies: [{ currency: 'USD', enabled: true }] });
    if (url.includes('/sales/discount_automatic_app.json') && init?.method === 'POST') {
      requests.push('create');
      metafields = JSON.parse(String(init?.body)).metafields;
      if (failures.has('create')) return Response.json({}, { status: 422 });
      if (failures.has('create-uncertain-missing')) return Response.json({}, { status: 500 });
      if (failures.has('create-uncertain')) { created = true; return Response.json({}, { status: 500 }); }
      created = true;
      return Response.json({ app_discount_id: replacementId });
    }
    if (url.includes('/admin/openapi/v20261201/sales/discount_apps/') && init?.method === 'DELETE') {
      requests.push('delete');
      if (failures.has('delete-rate-limit')) return Response.json({}, { status: 429, headers: { 'Retry-After': '5' } });
      if (failures.has('delete-network')) throw new Error('Connection reset');
      if (failures.has('delete')) return Response.json({ success: false }, { status: 422 });
      if (failures.has('delete-unconfirmed')) return new Response(null, { status: 204 });
      deleted = true;
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected platform request: ${url}`);
  });
}

describe('expired campaign replacement routes', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  beforeEach(async () => {
    await applyMigrations(testEnv.DB);
    await testEnv.DB.batch([
      testEnv.DB.prepare('DELETE FROM quantity_breaks_campaign_operations'),
      testEnv.DB.prepare('DELETE FROM quantity_breaks_campaign_operation_batches'),
      testEnv.DB.prepare('DELETE FROM quantity_breaks_staged_updates'),
      testEnv.DB.prepare('DELETE FROM quantity_breaks_publications'),
      testEnv.DB.prepare('DELETE FROM quantity_breaks_campaigns'),
      testEnv.DB.prepare('DELETE FROM quantity_breaks_shop_locks'),
    ]);
    await new D1SessionStore(testEnv.DB, key).upsert({
      handle: 'replacement-shop', accessToken: 'access', refreshToken: 'refresh', scope: 'write_discounts', expiresAt: '2030-01-01T00:00:00.000Z', installed: true,
    });
    await new D1SubscriptionRepository(testEnv.DB).writeEntitlement({
      appKey: testEnv.SHOPLINE_APP_KEY, handle: 'replacement-shop', state: 'active', featureKeys: ['quantity_breaks_access'],
      activeSubscriptionId: 'active-subscription', activeSpuKey: 'ultra', validFrom: null, validUntil: null,
      graceUntil: null, autoRecurring: true, absenceConfirmations: 0,
    });
  });

  it.each(['', '/list-ended'])('returns the SHOPLINE end time through the verified list/detail path %s', async (suffix) => {
    await pausedCampaign('list-ended', 'Ended offer');
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ discount_apps: [{ app_discount_id: 'list-ended-expired', status: 'expired', ends_at: '2026-10-29T10:00:00+08:00' }] })));
    const response = await campaignApp().fetch(new Request(`https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/campaigns${suffix}`, { headers: { Authorization: `Bearer ${await jwt()}` } }), testEnv, createExecutionContext());
    expect(response.status).toBe(200);
    const result = await response.json() as { campaign?: { endsAt: string; neverExpires: boolean }; campaigns?: Array<{ endsAt: string; neverExpires: boolean }> };
    expect(result.campaign ?? result.campaigns?.[0]).toMatchObject({ endsAt: '2026-10-29T02:00:00.000Z', neverExpires: false });
  });

  async function activate(id: string, revision = 3) {
    return campaignApp().fetch(new Request(`https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/campaigns/${id}/status`, {
      method: 'POST', headers: { Authorization: `Bearer ${await jwt()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active', expectedRevision: revision }),
    }), testEnv, createExecutionContext());
  }

  it('starts creating while deletion is still pending and removes the old row only after confirmed deletion', async () => {
    const { repository } = await pausedCampaign('parallel', 'Original');
    let releaseDelete!: () => void;
    const deleting = new Promise<void>((resolve) => { releaseDelete = resolve; });
    const requests: string[] = [];
    const upstream = replacementFetcher('parallel-expired', 'new-discount', requests);
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'DELETE') await deleting;
      return upstream(input, init);
    }));
    const pending = activate('parallel');
    let response!: Response;
    try {
      await vi.waitFor(() => expect(requests).toContain('create'), { timeout: 1500 });
      const during = await repository.list('replacement-shop');
      expect(during).toHaveLength(2);
      expect(during.find((item) => item.id === 'parallel')).toMatchObject({ name: 'Original', status: 'paused', neverExpires: false });
      // A concurrent read must not clear the publication owner or release its lease.
      const listing = await campaignApp().fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/campaigns', { headers: { Authorization: `Bearer ${await jwt()}` } }), testEnv, createExecutionContext());
      expect(listing.status).toBe(200);
      expect((await repository.getPublication('replacement-shop', 'parallel')).owner).not.toBeNull();
    } finally { releaseDelete(); response = await pending; }
    expect(response.status).toBe(200);
    const { campaign: created } = await response.json() as { campaign: { id: string } };
    expect(created.id).not.toBe('parallel');
    expect(await repository.get('replacement-shop', 'parallel')).toBeNull();
    const remaining = await repository.list('replacement-shop');
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toMatchObject({ id: created.id, status: 'active', neverExpires: true });
    await expect(repository.getPublication('replacement-shop', created.id)).resolves.toMatchObject({ state: 'active', discountId: 'new-discount' });
  });

  it.each(['delete', 'delete-unconfirmed', 'delete-rate-limit', 'delete-network'])('returns separate expired and active application rows after %s', async (failure) => {
    const { repository } = await pausedCampaign('retained', 'Original');
    const old = await repository.get('replacement-shop', 'retained');
    const requests: string[] = [];
    vi.stubGlobal('fetch', replacementFetcher('retained-expired', 'new-discount', requests, failure));
    const response = await activate('retained');
    expect(response.status).toBe(200);
    const { campaign: created } = await response.json() as { campaign: { id: string } };
    expect(created.id).not.toBe('retained');
    const listResponse = await campaignApp().fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/campaigns', { headers: { Authorization: `Bearer ${await jwt()}` } }), testEnv, createExecutionContext());
    const { campaigns } = await listResponse.json() as { campaigns: Array<{ id: string; status: string; platformDiscountId: string; endsAt?: string }> };
    expect(campaigns).toHaveLength(2);
    expect(campaigns.find((item) => item.id === 'retained')).toMatchObject({ status: 'paused', platformDiscountId: 'retained-expired', endsAt: old!.endsAt });
    expect(campaigns.find((item) => item.id === created.id)).toMatchObject({ status: 'active', platformDiscountId: 'new-discount' });
    expect(requests.filter((item) => item === 'create')).toHaveLength(1);
    const duplicate = await activate('retained');
    expect(duplicate.status).not.toBe(200);
    expect(requests.filter((item) => item === 'create')).toHaveLength(1);
  });

  it.each(['batch', 'edit'])('keeps the accepted new ID pending after %s while old deletion fails', async (entry) => {
    const { campaign, repository } = await pausedCampaign('pending-old', 'Pending original');
    const requests: string[] = [];
    const upstream = replacementFetcher('pending-old-expired', 'accepted-new', requests, 'delete');
    let visible = false;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/sales/discount_app.json') && !visible) {
        return Response.json({ discount_apps: [{ app_discount_id: 'pending-old-expired', status: 'EXPIRED' }] }, { headers: { Traceid: 'not-yet-visible' } });
      }
      return upstream(input, init);
    }));
    const response = await campaignApp().fetch(new Request(`https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/campaigns/${entry === 'batch' ? 'batch-status' : campaign.id}`, {
      method: entry === 'batch' ? 'POST' : 'PUT', headers: { Authorization: `Bearer ${await jwt()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(entry === 'batch' ? { status: 'active', campaigns: [{ id: campaign.id, expectedRevision: 3 }] }
        : { expectedRevision: 3, campaign: { ...campaign, neverExpires: true } }),
    }), testEnv, createExecutionContext());
    expect(response.status).toBe(200);
    const result = await response.json() as { results?: Array<{ outcome: string; campaign: { id: string } }>; campaign?: { id: string } };
    if (entry === 'batch') expect(result.results?.[0].outcome).toBe('activation_pending');
    const created = result.campaign ?? result.results![0].campaign;
    expect(created.id).not.toBe('pending-old');
    await expect(repository.getPublication('replacement-shop', created.id)).resolves.toMatchObject({ state: 'needs_reconciliation', discountId: 'accepted-new' });
    await expect(repository.getPublication('replacement-shop', 'pending-old')).resolves.toMatchObject({ state: 'paused', discountId: 'pending-old-expired' });
    const list = async () => (await campaignApp().fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/campaigns', { headers: { Authorization: `Bearer ${await jwt()}` } }), testEnv, createExecutionContext())).json() as Promise<{ campaigns: Array<{ id: string; platformStatus: string; platformDiscountId: string }> }>;
    const pending = (await list()).campaigns.find((item) => item.id === created.id);
    expect(pending).toMatchObject({ platformStatus: 'unverified', platformDiscountId: 'accepted-new' });
    await activate(created.id, 1);
    expect(requests.filter((item) => item === 'create')).toHaveLength(1);
    visible = true;
    const confirmed = (await list()).campaigns;
    expect(confirmed.find((item) => item.id === created.id)).toMatchObject({ platformStatus: 'active', platformDiscountId: 'accepted-new' });
    expect(confirmed.find((item) => item.id === 'pending-old')).toMatchObject({ platformStatus: 'paused', platformDiscountId: 'pending-old-expired' });
    expect(requests.filter((item) => item === 'create')).toHaveLength(1);
  });

  it('separates pending and successful activations in one batch while retaining both failed deletions', async () => {
    const { repository } = await pausedCampaign('batch-first', 'First old offer', 'product-a');
    await pausedCampaign('batch-second', 'Second old offer', 'product-b');
    const newDiscounts: Array<{ app_discount_id: string; status: string; product: string }> = [];
    let visible = false;
    let creates = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/products/products.json')) {
        const ids = new URL(url).searchParams.get('ids')?.split(',') ?? [];
        return Response.json({ products: ids.map((id) => ({ id, handle: `${id}-handle` })) });
      }
      if (url.includes('/sales/discount_app.json')) return Response.json({ discount_apps: [
        { app_discount_id: 'batch-first-expired', status: 'EXPIRED' },
        { app_discount_id: 'batch-second-expired', status: 'EXPIRED' },
        ...newDiscounts.filter((item) => visible || item.product === 'product-b'),
      ] });
      if (url.includes('/currency/currencies.json')) return Response.json({ currencies: [{ currency: 'USD', enabled: true }] });
      if (init?.method === 'DELETE') return Response.json({ success: false }, { status: 422 });
      if (init?.method === 'POST') {
        creates += 1;
        const rule = JSON.parse(JSON.parse(String(init.body)).metafields[0].value);
        const app_discount_id = `new-platform-${creates}`;
        newDiscounts.push({ app_discount_id, status: 'ACTIVE', product: rule.scope.productIds[0] });
        return Response.json({ app_discount_id });
      }
      throw new Error(`Unexpected request: ${url}`);
    }));
    const response = await campaignApp().fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/campaigns/batch-status', {
      method: 'POST', headers: { Authorization: `Bearer ${await jwt()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active', campaigns: ['batch-first', 'batch-second'].map((id) => ({ id, expectedRevision: 3 })) }),
    }), testEnv, createExecutionContext());
    const result = await response.json() as { results: Array<{ outcome: string; campaign: { id: string } }> };
    expect(result.results.map((item) => item.outcome)).toEqual(['activation_pending', 'activated']);
    expect(await repository.list('replacement-shop')).toHaveLength(4);
    expect(creates).toBe(2);
    visible = true;
    await campaignApp().fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/campaigns', { headers: { Authorization: `Bearer ${await jwt()}` } }), testEnv, createExecutionContext());
    for (const item of result.results) await expect(repository.getPublication('replacement-shop', item.campaign.id)).resolves.toMatchObject({ state: 'active' });
    for (const id of ['batch-first', 'batch-second']) await expect(repository.getPublication('replacement-shop', id)).resolves.toMatchObject({ state: 'paused' });
    expect(creates).toBe(2);
  });

  it('retains a first publication ID through pending reads and confirms it without publishing again', async () => {
    const repository = new D1CampaignRepository(testEnv.DB);
    const draft = { id: 'first-publish', name: 'First publication', status: 'draft' as const, startsAt: '2026-10-27T00:00:00.000Z',
      scope: { kind: 'products' as const, productIds: ['product-first'], excludedProductIds: [] },
      tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 1, discountType: 'none' as const }],
      combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false } };
    await repository.save('replacement-shop', draft, 0);
    let visible = false;
    let creates = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/products/products.json')) return Response.json({ products: [{ id: 'product-first', handle: 'product-first-handle' }] });
      if (String(input).includes('/currency/currencies.json')) return Response.json({ currencies: [{ currency: 'USD', enabled: true }] });
      if (init?.method === 'POST') { creates += 1; return Response.json({ app_discount_id: 'first-platform' }); }
      return Response.json({ discount_apps: visible ? [{ app_discount_id: 'first-platform', status: 'ACTIVE' }] : [] });
    }));
    const response = await activate('first-publish', 1);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ campaign: { id: 'first-publish', platformDiscountId: 'first-platform', platformStatus: 'unverified' } });
    await activate('first-publish', 1);
    await expect(repository.getPublication('replacement-shop', 'first-publish')).resolves.toMatchObject({ state: 'needs_reconciliation', discountId: 'first-platform' });
    expect(creates).toBe(1);
    visible = true;
    const listed = await campaignApp().fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/campaigns', { headers: { Authorization: `Bearer ${await jwt()}` } }), testEnv, createExecutionContext());
    expect(await listed.json()).toMatchObject({ campaigns: [{ id: 'first-publish', platformStatus: 'active', platformDiscountId: 'first-platform' }] });
    expect(creates).toBe(1);
  });

  it('reserves coverage for an accepted draft while another item in the same batch is published', async () => {
    const repository = new D1CampaignRepository(testEnv.DB);
    for (const id of ['draft-a', 'draft-b']) await repository.save('replacement-shop', {
      id, name: id, status: 'draft', startsAt: '2026-10-27T00:00:00.000Z',
      scope: { kind: 'products', productIds: ['shared-product'], excludedProductIds: [] },
      tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 1, discountType: 'none' }],
      combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
    }, 0);
    let creates = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/products/products.json')) return Response.json({ products: [{ id: 'shared-product', handle: 'shared-product-handle' }] });
      if (String(input).includes('/currency/currencies.json')) return Response.json({ currencies: [{ currency: 'USD', enabled: true }] });
      if (init?.method === 'POST') { creates += 1; return Response.json({ app_discount_id: `draft-platform-${creates}` }); }
      if (String(input).includes('/sales/discount_app.json')) return Response.json({ discount_apps: [] });
      return Response.json({ products: [] });
    }));
    const response = await campaignApp().fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/campaigns/batch-status', {
      method: 'POST', headers: { Authorization: `Bearer ${await jwt()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active', campaigns: ['draft-a', 'draft-b'].map((id) => ({ id, expectedRevision: 1 })) }),
    }), testEnv, createExecutionContext());
    const result = await response.json() as { results: Array<{ outcome: string }> };
    expect(result.results.map((item) => item.outcome)).toEqual(['activation_pending', 'conflict']);
    expect(creates).toBe(1);
  });

  it('keeps the old config and end time separate from an edited scheduled replacement', async () => {
    const { campaign, repository } = await pausedCampaign('edit-expired', 'Original offer');
    const old = await repository.get('replacement-shop', campaign.id);
    const requests: string[] = [];
    vi.stubGlobal('fetch', replacementFetcher('edit-expired-expired', 'edited-replacement', requests, 'delete'));
    const response = await campaignApp().fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/campaigns/edit-expired', {
      method: 'PUT', headers: { Authorization: `Bearer ${await jwt()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision: 3, campaign: { ...campaign, name: 'Edited future offer', status: 'paused', startsAt: '2026-12-01T00:00:00.000Z', neverExpires: true } }),
    }), testEnv, createExecutionContext());
    expect(response.status).toBe(200);
    const { campaign: created } = await response.json() as { campaign: { id: string } };
    expect(created.id).not.toBe(campaign.id);
    await expect(repository.get('replacement-shop', campaign.id)).resolves.toMatchObject({ name: 'Original offer', status: 'paused', endsAt: old!.endsAt });
    await expect(repository.get('replacement-shop', created.id)).resolves.toMatchObject({ name: 'Edited future offer', status: 'scheduled', startsAt: '2026-12-01T00:00:00.000Z', neverExpires: true });
  });

  it.each(['create', 'delete+create'])('preserves the expired config when %s fails', async (failure) => {
    const { repository } = await pausedCampaign('failed-create', 'Original config');
    const requests: string[] = [];
    vi.stubGlobal('fetch', replacementFetcher('failed-create-expired', 'replacement', requests, failure));
    expect((await activate('failed-create')).status).not.toBe(200);
    const rows = await repository.list('replacement-shop');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'failed-create', name: 'Original config', status: 'paused', neverExpires: false });
    await expect(repository.getPublication('replacement-shop', 'failed-create')).resolves.toMatchObject(failure === 'create' ? { state: 'removed', discountId: null } : { state: 'paused', discountId: 'failed-create-expired' });
    if (failure !== 'create') return;
    const retry: string[] = [];
    vi.stubGlobal('fetch', replacementFetcher('no-old', 'retry-discount', retry));
    expect((await activate('failed-create', rows[0].revision)).status).toBe(200);
    expect(retry).toEqual(['create']);
  });

  it.each(['create-uncertain', 'create-uncertain-missing', 'delete+create-uncertain', 'delete+create-uncertain-missing'])('reconciles the new identity without duplicating a %s result', async (failure) => {
    const { repository } = await pausedCampaign('uncertain', 'Original config');
    const requests: string[] = [];
    vi.stubGlobal('fetch', replacementFetcher('uncertain-expired', 'replacement', requests, failure));
    expect((await activate('uncertain')).status).not.toBe(200);
    const pending = (await repository.list('replacement-shop')).find((item) => item.id !== 'uncertain');
    expect(pending).toBeDefined();
    await expect(repository.getPublication('replacement-shop', pending!.id)).resolves.toMatchObject({ state: 'needs_reconciliation', discountId: null });
    const listing = await campaignApp().fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/campaigns', { headers: { Authorization: `Bearer ${await jwt()}` } }), testEnv, createExecutionContext());
    expect(listing.status).toBe(200);
    const recovered = await repository.get('replacement-shop', pending!.id);
    if (!failure.endsWith('-missing')) {
      expect(recovered).toMatchObject({ status: 'active', neverExpires: true });
      expect(recovered!.endsAt).toBeUndefined();
      await expect(repository.getPublication('replacement-shop', pending!.id)).resolves.toMatchObject({ state: 'active', discountId: 'replacement' });
    } else {
      expect(recovered).toMatchObject({ status: 'draft' });
      await expect(repository.getPublication('replacement-shop', pending!.id)).resolves.toMatchObject({ state: 'idle', discountId: null });
    }
    expect(requests.filter((item) => item === 'create')).toHaveLength(1);
  });

  it('removes only the old application row when a previously unconfirmed deletion is later verified', async () => {
    const { repository } = await pausedCampaign('late-delete', 'Original');
    vi.stubGlobal('fetch', replacementFetcher('late-delete-expired', 'new-discount', [], 'delete-unconfirmed'));
    const response = await activate('late-delete');
    expect(response.status).toBe(200);
    const { campaign: created } = await response.json() as { campaign: { id: string } };
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ discount_apps: [{ app_discount_id: 'new-discount', status: 'active' }] })));
    const listing = await campaignApp().fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/campaigns', { headers: { Authorization: `Bearer ${await jwt()}` } }), testEnv, createExecutionContext());
    const { campaigns } = await listing.json() as { campaigns: Array<{ id: string }> };
    expect(campaigns.map((item) => item.id)).toEqual([created.id]);
    await expect(repository.get('replacement-shop', 'late-delete')).resolves.toBeNull();
    await expect(repository.getPublication('replacement-shop', created.id)).resolves.toMatchObject({ discountId: 'new-discount', state: 'active' });
  });

  it('recovers an interrupted concurrent replacement by reading its new identity without creating again', async () => {
    const { repository } = await pausedCampaign('interrupted', 'Original');
    const old = await repository.get('replacement-shop', 'interrupted');
    const lease = await repository.beginExpiredReplacement('replacement-shop', { ...old!, status: 'paused', endsAt: undefined, neverExpires: true, startsAt: '2026-01-01T00:00:00.000Z' }, old!.revision);
    await testEnv.DB.prepare('UPDATE quantity_breaks_shop_locks SET expires_at = 0 WHERE shop_handle = ?').bind('replacement-shop').run();
    const requests: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(init?.method ?? 'GET');
      return Response.json({ discount_apps: [{ app_discount_id: 'recovered-new', status: 'active', metafields: [{ namespace: 'sale', key: 'quantity_breaks', value: JSON.stringify({ campaignId: lease.campaign.id }) }] }] });
    }));
    const listing = await campaignApp().fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/campaigns', { headers: { Authorization: `Bearer ${await jwt()}` } }), testEnv, createExecutionContext());
    expect(listing.status).toBe(200);
    const { campaigns } = await listing.json() as { campaigns: Array<{ id: string; status: string }> };
    expect(campaigns).toHaveLength(1);
    expect(campaigns[0]).toMatchObject({ id: lease.campaign.id, status: 'active' });
    await expect(repository.getPublication('replacement-shop', lease.campaign.id)).resolves.toMatchObject({ state: 'active', discountId: 'recovered-new', owner: null });
    expect(requests).toEqual(['GET']);
  });

  it('does not delete or create when publication prerequisites fail', async () => {
    const { repository } = await pausedCampaign('preflight', 'Original');
    const requests: string[] = [];
    const upstream = replacementFetcher('preflight-expired', 'never-created', requests);
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/currency/currencies.json')) throw new Error('Currency unavailable');
      return upstream(input, init);
    }));
    expect((await activate('preflight')).status).not.toBe(200);
    expect(requests).toEqual([]);
    const rows = await repository.list('replacement-shop');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'preflight', status: 'paused' });
    await expect(repository.getPublication('replacement-shop', 'preflight')).resolves.toMatchObject({ state: 'paused', discountId: 'preflight-expired', owner: null });
  });


  it.each(['2026-10-26T00:00:00.000Z', '2026-10-27T00:00:00.000Z'])('rejects an elapsed end time %s before deleting or creating platform discounts', async (endsAt) => {
    const { campaign, repository } = await pausedCampaign('past-end', 'Original');
    const writes: string[] = [];
    vi.stubGlobal('fetch', replacementFetcher('past-end-expired', 'never-created', writes));
    const response = await campaignApp().fetch(new Request('https://raised-stability-gaps-html.trycloudflare.com/api/quantity-breaks/campaigns/past-end', {
      method: 'PUT', headers: { Authorization: `Bearer ${await jwt()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision: 3, campaign: { ...campaign, status: 'paused', startsAt: '2026-10-20T00:00:00.000Z', endsAt, neverExpires: false } }),
    }), testEnv, createExecutionContext());
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: '当前结束时间早于当前时间' });
    expect(writes).toEqual([]);
    expect(await repository.list('replacement-shop')).toHaveLength(1);
    await expect(repository.getPublication('replacement-shop', 'past-end')).resolves.toMatchObject({ state: 'paused', discountId: 'past-end-expired', owner: null });
  });

});
