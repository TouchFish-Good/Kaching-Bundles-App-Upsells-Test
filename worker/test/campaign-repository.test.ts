import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import { applyMigrations } from '../src/db/migrate';
import { CampaignConflictError, D1CampaignRepository } from '../src/db/campaigns';
import { campaignsConflict, defaultCampaignWidgetConfig, validateCampaign, validateCampaignWidgetConfig, type CampaignDraft } from '../src/domain/campaign';
import type { Env } from '../src/env';

const database = (env as Env).DB;

const directProductCampaign: CampaignDraft = {
  id: 'offer-a', name: 'Direct product', status: 'active', startsAt: '2026-01-01T00:00:00.000Z',
  scope: { kind: 'products', productIds: ['product-a'], excludedProductIds: [] },
  tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 1, discountType: 'none' }],
  combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
};

const collectionCampaign: CampaignDraft = {
  id: 'offer-b', name: 'Collection', status: 'active', startsAt: '2026-01-01T00:00:00.000Z',
  scope: { kind: 'collections', collectionIds: ['collection-a'], resolvedProductIds: ['product-a'], excludedProductIds: [] },
  tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 1, discountType: 'none' }],
  combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false },
};

describe('D1 campaign repository', () => {
  beforeEach(async () => {
    await applyMigrations(database);
    await database.batch([
      database.prepare('DELETE FROM quantity_breaks_collection_conflicts'),
      database.prepare('DELETE FROM quantity_breaks_staged_updates'),
      database.prepare('DELETE FROM quantity_breaks_publications'),
      database.prepare('DELETE FROM quantity_breaks_campaigns'),
      database.prepare('DELETE FROM quantity_breaks_shop_locks'),
    ]);
  });

  it('saves and reloads desktop and mobile typography outside the previous size ranges', async () => {
    const repository = new D1CampaignRepository(database);
    const widget = defaultCampaignWidgetConfig();
    const mobile = defaultCampaignWidgetConfig();
    for (const config of [widget, mobile]) {
      config.typography.bodyPx = 4;
      for (const item of Object.values(config.typography)) {
        if (typeof item === 'object') item.sizePx = config === widget ? 48 : 4;
      }
    }
    widget.mobile = mobile;
    await repository.save('shop-a', { ...directProductCampaign, status: 'draft', widget }, 0);
    expect((await repository.get('shop-a', directProductCampaign.id))?.widget).toEqual(widget);
    widget.typography.addButton.sizePx = 72;
    widget.typography.savingsLabel = { sizePx: 25, weight: 900 };
    await repository.save('shop-a', { ...directProductCampaign, status: 'draft', widget }, 1);
    expect((await repository.get('shop-a', directProductCampaign.id))?.widget?.typography.addButton.sizePx).toBe(72);
    expect((await repository.get('shop-a', directProductCampaign.id))?.widget?.typography.savingsLabel).toEqual({ sizePx: 25, weight: 900 });
  });

  it.each([0, -1, 1.5, NaN, Infinity, '16', null])('rejects invalid typography size %s on both devices', (size) => {
    const widget = defaultCampaignWidgetConfig();
    const mobile = defaultCampaignWidgetConfig();
    widget.typography.bodyPx = size as number;
    widget.typography.addButton.sizePx = size as number;
    mobile.typography.summaryAmount.sizePx = size as number;
    widget.mobile = mobile;
    const errors = validateCampaignWidgetConfig(widget);
    expect(errors).toContain('Body size must be a positive integer in px.');
    expect(errors).toContain('addButton size must be a positive integer in px.');
    expect(errors).toContain('widget.mobile.summaryAmount size must be a positive integer in px.');
  });

  it('requires an end time unless the campaign explicitly never expires', () => {
    expect(validateCampaign({ ...directProductCampaign, status: 'draft', neverExpires: false, endsAt: undefined }))
      .toContain('endsAt is required unless neverExpires is true.');
    expect(validateCampaign({ ...directProductCampaign, status: 'draft', neverExpires: true, endsAt: undefined }))
      .not.toContain('endsAt is required unless neverExpires is true.');
  });

  it('rejects scope handle snapshots that do not exactly describe the selected resources', () => {
    expect(validateCampaign({
      ...directProductCampaign,
      scope: { ...directProductCampaign.scope, productHandles: { 'product-a': '', 'product-b': 'unselected-product' } },
    })).toContain('productHandles must contain one non-empty handle for every selected product.');

    expect(validateCampaign({
      ...collectionCampaign,
      scope: { ...collectionCampaign.scope, collectionHandles: { 'collection-a': 'summer-edit', 'collection-b': 'unselected-collection' } },
    })).toContain('collectionHandles must contain one non-empty handle for every selected collection.');
  });

  it('allows independent market modes across percentage and fixed tiers', () => {
    const errors = validateCampaign({
      ...directProductCampaign,
      tiers: [
        { tierId: 'percentage', displayOrder: 0, quantity: 2, discountType: 'percentage', discountValue: 1000, marketOverrides: { japan: { mode: 'auto_convert' } } },
        { tierId: 'fixed-auto', displayOrder: 1, quantity: 3, discountType: 'fixed_amount', discountValue: 200, marketOverrides: { japan: { mode: 'auto_convert' } } },
        { tierId: 'fixed-specified', displayOrder: 2, quantity: 4, discountType: 'fixed_price', discountValue: 500, marketOverrides: { japan: { mode: 'specified_amount', currencyCode: 'JPY', amountMinor: 750 } } },
      ],
    });

    expect(errors).not.toContain('Market japan has mixed shop and presentment currency modes across tiers.');
    expect(errors).toEqual([]);
  });

  it('still rejects specified market amounts on a percentage tier', () => {
    expect(validateCampaign({
      ...directProductCampaign,
      tiers: [{ tierId: 'percentage', displayOrder: 0, quantity: 2, discountType: 'percentage', discountValue: 1000, marketOverrides: { japan: { mode: 'specified_amount', currencyCode: 'JPY', amountMinor: 750 } } }],
    })).toContain('Specified market amounts require a fixed discount type.');
  });

  it('still requires consistent specified currencies for the same market', () => {
    expect(validateCampaign({
      ...directProductCampaign,
      tiers: [
        { tierId: 'fixed-jpy', displayOrder: 0, quantity: 2, discountType: 'fixed_amount', discountValue: 100, marketOverrides: { japan: { mode: 'specified_amount', currencyCode: 'JPY', amountMinor: 750 } } },
        { tierId: 'fixed-usd', displayOrder: 1, quantity: 3, discountType: 'fixed_price', discountValue: 500, marketOverrides: { japan: { mode: 'specified_amount', currencyCode: 'USD', amountMinor: 500 } } },
      ],
    })).toContain('Market japan must use the same currency in every tier.');
  });

  it.each(['save', 'publish', 'update', 'replace'] as const)('allows independent campaign currency modes during %s', async (operation) => {
    const repository = new D1CampaignRepository(database, () => Date.parse('2026-10-27T00:00:00.000Z'));
    await repository.save('shop-a', {
      ...directProductCampaign,
      tiers: [{ tierId: 'percentage', displayOrder: 0, quantity: 2, discountType: 'percentage', discountValue: 1000 }],
    }, 0);
    const candidate: CampaignDraft = {
      ...directProductCampaign,
      id: 'offer-b',
      status: 'draft',
      scope: { kind: 'products', productIds: ['product-b'], excludedProductIds: [] },
      tiers: [{ tierId: 'fixed', displayOrder: 0, quantity: 2, discountType: 'fixed_amount', discountValue: 100, marketOverrides: { japan: { mode: 'auto_convert' } } }],
    };
    const specified: CampaignDraft = {
      ...candidate,
      tiers: [{ ...candidate.tiers[0], marketOverrides: { japan: { mode: 'specified_amount', currencyCode: 'JPY', amountMinor: 750 } } }],
    };

    if (operation === 'save') {
      await expect(repository.save('shop-a', { ...specified, status: 'active' }, 0)).resolves.toMatchObject({ id: 'offer-b', tiers: specified.tiers });
      return;
    }
    await repository.save('shop-a', operation === 'publish' ? specified : candidate, 0);
    if (operation === 'publish') {
      const publication = await repository.beginPublication('shop-a', 'offer-b', 1, 'publish');
      expect(publication.campaign.tiers).toEqual(specified.tiers);
      return;
    }
    const publication = await repository.beginPublication('shop-a', 'offer-b', 1, 'publish');
    await repository.finishPublication('shop-a', 'offer-b', 1, 'publish', 'discount-b', publication.owner);
    if (operation === 'update') {
      await repository.beginUpdate('shop-a', specified, 2, 'discount-b');
      await expect(repository.getStagedUpdate('shop-a', 'offer-b')).resolves.toMatchObject({ candidate: { tiers: specified.tiers } });
      return;
    }
    const pause = await repository.beginPublication('shop-a', 'offer-b', 2, 'pause');
    await repository.finishPublication('shop-a', 'offer-b', 2, 'pause', 'discount-b', pause.owner);
    await expect(repository.beginExpiredReplacement('shop-a', { ...specified, status: 'paused' }, 3))
      .resolves.toMatchObject({ campaign: { status: 'active', tiers: specified.tiers } });
  });

  it('rejects a second publication lock for the same store', async () => {
    const repository = new D1CampaignRepository(database);
    await repository.save('shop-a', { ...directProductCampaign, status: 'draft' }, 0);
    await repository.save('shop-a', { ...directProductCampaign, id: 'offer-b', status: 'draft' }, 0);
    await repository.beginPublication('shop-a', 'offer-a', 1, 'publish');
    await expect(repository.beginPublication('shop-a', 'offer-b', 1, 'publish')).rejects.toThrow('publication in progress');
  });

  it('persists refreshed scope handles when republishing a campaign', async () => {
    const repository = new D1CampaignRepository(database);
    await repository.save('shop-a', { ...directProductCampaign, status: 'draft' }, 0);

    const scope = { ...directProductCampaign.scope, productHandles: { 'product-a': 'renewed-serum' } };
    const lease = await repository.beginPublication('shop-a', 'offer-a', 1, 'publish', [], scope);

    expect(lease.campaign.scope).toMatchObject({ productHandles: { 'product-a': 'renewed-serum' } });
    await expect(repository.get('shop-a', 'offer-a')).resolves.toMatchObject({ scope: { productHandles: { 'product-a': 'renewed-serum' } } });
  });

  it('does not compare collection and product campaigns for coverage conflicts', async () => {
    const repository = new D1CampaignRepository(database);
    await repository.save('shop-a', directProductCampaign, 0);
    await expect(repository.save('shop-a', collectionCampaign, 0)).resolves.toMatchObject({ id: collectionCampaign.id });
    await expect(repository.save('shop-a', {
      ...collectionCampaign,
      id: 'offer-collection-b',
      name: 'Second collection',
      scope: { kind: 'collections', collectionIds: ['collection-b'], resolvedProductIds: ['product-a'], excludedProductIds: [] },
    }, 0)).resolves.toMatchObject({ id: 'offer-collection-b' });
    await expect(repository.save('shop-a', { ...directProductCampaign, id: 'offer-c' }, 0)).rejects.toThrow('overlaps');
  });

  it('treats shared collection IDs as a conflict but never compares collections to products', () => {
    const first = { ...collectionCampaign, status: 'active' as const, startsAt: '2026-10-28T00:00:00.000Z' };
    const sameCollection = {
      ...collectionCampaign,
      id: 'offer-collection-b',
      name: 'Second collection',
      status: 'active' as const,
      startsAt: '2026-10-28T00:00:00.000Z',
      scope: { kind: 'collections' as const, collectionIds: ['collection-a', 'collection-b'], resolvedProductIds: ['product-z'], excludedProductIds: [] },
    };
    const productCampaign: CampaignDraft = {
      ...directProductCampaign,
      id: 'offer-product-b',
      status: 'active',
    };

    expect(campaignsConflict(first, sameCollection)).toBe(true);
    expect(campaignsConflict(first, productCampaign)).toBe(false);
  });

  it('keeps product overlap conflicts limited to overlapping schedules', () => {
    const first: CampaignDraft = { ...directProductCampaign, startsAt: '2026-10-01T00:00:00.000Z', endsAt: '2026-11-01T00:00:00.000Z' };
    const second: CampaignDraft = {
      ...directProductCampaign,
      id: 'offer-b',
      tiers: [{ tierId: 'fixed', displayOrder: 0, quantity: 2, discountType: 'fixed_amount', discountValue: 100, marketOverrides: { japan: { mode: 'specified_amount', currencyCode: 'JPY', amountMinor: 750 } } }],
    };

    expect(campaignsConflict(first, { ...second, startsAt: '2026-10-31T00:00:00.000Z' })).toBe(true);
    expect(campaignsConflict(first, { ...second, startsAt: '2026-11-01T00:00:00.000Z' })).toBe(false);
  });

  it('keeps revisions tenant-scoped and rejects stale writes', async () => {
    const repository = new D1CampaignRepository(database);
    const saved = await repository.save('shop-a', { ...directProductCampaign, status: 'draft' }, 0);
    expect(saved.revision).toBe(1);
    await expect(repository.save('shop-a', { ...directProductCampaign, status: 'draft' }, 0)).rejects.toThrow('revision');
    await expect(repository.get('shop-b', directProductCampaign.id)).resolves.toBeNull();
  });

  it('allows a stale local active record without a platform discount to be saved as a draft', async () => {
    const repository = new D1CampaignRepository(database);
    await repository.save('shop-a', directProductCampaign, 0);

    await expect(repository.save('shop-a', {
      ...directProductCampaign,
      status: 'draft',
      name: 'Recovered draft',
    }, 1)).resolves.toMatchObject({ status: 'draft', name: 'Recovered draft', revision: 2 });
  });

  it('allows only one concurrent write with the same expected revision', async () => {
    const repository = new D1CampaignRepository(database);
    await repository.save('shop-a', { ...directProductCampaign, status: 'draft' }, 0);

    const results = await Promise.allSettled([
      repository.save('shop-a', { ...directProductCampaign, name: 'First', status: 'draft' }, 1),
      repository.save('shop-a', { ...directProductCampaign, name: 'Second', status: 'draft' }, 1),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    await expect(repository.get('shop-a', directProductCampaign.id)).resolves.toMatchObject({ revision: 2 });
  });

  it('serializes concurrent writes for different campaigns in one shop', async () => {
    const repository = new D1CampaignRepository(database);
    const [left, right] = await Promise.allSettled([
      repository.save('shop-a', directProductCampaign, 0),
      repository.save('shop-a', { ...directProductCampaign, id: 'offer-b', name: 'Second direct product' }, 0),
    ]);

    expect([left, right].filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect([left, right].filter((result) => result.status === 'rejected')).toHaveLength(1);
    await expect(repository.list('shop-a')).resolves.toHaveLength(1);
  });

  it('exposes a publication state transition and platform discount id', async () => {
    const repository = new D1CampaignRepository(database);
    await repository.save('shop-a', { ...directProductCampaign, status: 'draft' }, 0);
    const pending = await repository.beginPublication('shop-a', directProductCampaign.id, 1, 'publish');
    expect(pending.campaign.status).toBe('draft');
    const active = await repository.finishPublication('shop-a', directProductCampaign.id, 1, 'publish', 'discount-1', pending.owner);
    expect(active.status).toBe('active');
    await expect(repository.getPublication('shop-a', directProductCampaign.id)).resolves.toMatchObject({ state: 'active', discountId: 'discount-1', owner: null, lastVerifiedAt: expect.any(String) });
  });

  it('loads campaign, publication, and collection-conflict projections without per-row repository reads', async () => {
    const repository = new D1CampaignRepository(database);
    await repository.save('shop-a', { ...directProductCampaign, status: 'draft' }, 0);
    const publication = await repository.beginPublication('shop-a', directProductCampaign.id, 1, 'publish');
    await repository.finishPublication('shop-a', directProductCampaign.id, 1, 'publish', 'discount-1', publication.owner);

    await expect(repository.listProjections('shop-a')).resolves.toMatchObject([{
      campaign: { id: directProductCampaign.id, status: 'active' },
      publication: { state: 'active', discountId: 'discount-1' },
    }]);
  });

  it.each(['single', 'batch', 'pause', 'deletion', 'cleanup'] as const)('records and preserves the confirmed platform end time through %s', async (method) => {
    let now = Date.parse('2026-11-18T02:00:00.000Z');
    const repository = new D1CampaignRepository(database, () => now);
    await repository.save('shop-a', { ...directProductCampaign, status: 'draft', neverExpires: true }, 0);
    const publish = await repository.beginPublication('shop-a', directProductCampaign.id, 1, 'publish');
    await repository.finishPublication('shop-a', directProductCampaign.id, 1, 'publish', 'discount-1', publish.owner);
    const endedAt = '2026-11-18T01:30:00.000Z';
    if (method === 'batch') await repository.reconcilePlatformStates('shop-a', [{ campaignId: directProductCampaign.id, state: 'paused', nodeId: null, endsAt: endedAt }]);
    else if (method === 'single') await repository.reconcilePlatformState('shop-a', directProductCampaign.id, 'paused', null, endedAt);
    else if (method === 'deletion') {
      const deletion = await repository.beginPlatformDeletion('shop-a', directProductCampaign.id, 2);
      await repository.finishPlatformDeletion('shop-a', directProductCampaign.id, 2, deletion.owner);
    } else if (method === 'cleanup') await repository.finishExpiredPauseCleanup('shop-a', directProductCampaign.id, 2);
    else {
      const pause = await repository.beginPublication('shop-a', directProductCampaign.id, 2, 'pause');
      await repository.finishPublication('shop-a', directProductCampaign.id, 2, 'pause', 'discount-1', pause.owner);
    }
    const ended = await repository.get('shop-a', directProductCampaign.id);
    expect(ended).toMatchObject({ status: 'paused', neverExpires: false, endsAt: ['pause', 'deletion', 'cleanup'].includes(method) ? new Date(now).toISOString() : endedAt });
    now += 60_000;
    await repository.reconcilePlatformState('shop-a', directProductCampaign.id, 'paused', null);
    await expect(repository.get('shop-a', directProductCampaign.id)).resolves.toEqual(ended);
  });

  it('fills a legacy expired ongoing campaign on the next verified read without changing active campaigns', async () => {
    const now = Date.parse('2026-11-18T02:00:00.000Z');
    const repository = new D1CampaignRepository(database, () => now);
    await repository.save('shop-a', { ...directProductCampaign, status: 'draft', neverExpires: true }, 0);
    const published = await repository.beginPublication('shop-a', directProductCampaign.id, 1, 'publish');
    await repository.finishPublication('shop-a', directProductCampaign.id, 1, 'publish', 'discount-1', published.owner);
    await repository.reconcilePlatformState('shop-a', directProductCampaign.id, 'active', null);
    expect((await repository.get('shop-a', directProductCampaign.id))?.endsAt).toBeUndefined();
    await database.prepare("UPDATE quantity_breaks_campaigns SET campaign_json = json_set(campaign_json, '$.status', 'paused') WHERE shop_handle = ? AND id = ?").bind('shop-a', directProductCampaign.id).run();
    await database.prepare("UPDATE quantity_breaks_publications SET state = 'paused' WHERE shop_handle = ? AND campaign_id = ?").bind('shop-a', directProductCampaign.id).run();
    await repository.reconcilePlatformState('shop-a', directProductCampaign.id, 'paused', null);
    await expect(repository.get('shop-a', directProductCampaign.id)).resolves.toMatchObject({ endsAt: new Date(now).toISOString(), neverExpires: false });
  });

  it('clears an expired merchant-paused platform discount mapping after cleanup', async () => {
    const repository = new D1CampaignRepository(database);
    await repository.save('shop-a', { ...directProductCampaign, status: 'draft' }, 0);
    const publish = await repository.beginPublication('shop-a', directProductCampaign.id, 1, 'publish');
    await repository.finishPublication('shop-a', directProductCampaign.id, 1, 'publish', 'discount-1', publish.owner);

    const pause = await repository.beginPublication('shop-a', directProductCampaign.id, 2, 'pause');
    await repository.finishPublication('shop-a', directProductCampaign.id, 2, 'pause', 'discount-1', pause.owner);

    await repository.finishExpiredPauseCleanup('shop-a', directProductCampaign.id, 3);

    await expect(repository.get('shop-a', directProductCampaign.id)).resolves.toMatchObject({ status: 'paused', revision: 4 });
    await expect(repository.getPublication('shop-a', directProductCampaign.id)).resolves.toMatchObject({ state: 'removed', discountId: null, owner: null, stateReason: 'merchant_paused' });
  });

  it('persists independent old and new records when replacement deletion fails', async () => {
    const now = Date.parse('2026-10-27T00:00:00.000Z');
    const repository = new D1CampaignRepository(database, () => now);
    await repository.save('shop-a', { ...directProductCampaign, status: 'draft' }, 0);
    const publish = await repository.beginPublication('shop-a', directProductCampaign.id, 1, 'publish');
    await repository.finishPublication('shop-a', directProductCampaign.id, 1, 'publish', 'expired-discount', publish.owner, 'gid://shopline/DiscountAutomaticNode/expired');
    const pause = await repository.beginPublication('shop-a', directProductCampaign.id, 2, 'pause');
    await repository.finishPublication('shop-a', directProductCampaign.id, 2, 'pause', 'expired-discount', pause.owner, 'gid://shopline/DiscountAutomaticNode/expired');

    const replacement = await repository.beginExpiredReplacement('shop-a', {
      ...directProductCampaign,
      name: 'Replacement offer',
      status: 'paused',
      startsAt: '2026-11-01T00:00:00.000Z',
      neverExpires: true,
    }, 3);

    expect(replacement).toMatchObject({ previousDiscountId: 'expired-discount', previousNodeId: 'gid://shopline/DiscountAutomaticNode/expired', campaign: { status: 'scheduled' } });
    await expect(repository.getPublication('shop-a', directProductCampaign.id)).resolves.toMatchObject({ state: 'activating', discountId: 'expired-discount' });

    expect(replacement.campaign.id).not.toBe(directProductCampaign.id);
    const before = await repository.get('shop-a', directProductCampaign.id);
    await expect(repository.settleExpiredReplacement('shop-a', directProductCampaign.id, 3, replacement.owner, {
      deleted: false, created: { discountId: 'replacement-discount', nodeId: 'gid://shopline/DiscountAutomaticNode/replacement' }, uncertain: false,
    })).resolves.toMatchObject({ id: replacement.campaign.id, name: 'Replacement offer', status: 'scheduled', revision: 1 });
    await expect(repository.get('shop-a', directProductCampaign.id)).resolves.toMatchObject({ status: 'paused', endsAt: before!.endsAt, revision: 4 });
    await expect(repository.getPublication('shop-a', directProductCampaign.id)).resolves.toMatchObject({ state: 'paused', discountId: 'expired-discount' });
    await expect(repository.getPublication('shop-a', replacement.campaign.id)).resolves.toMatchObject({ state: 'active', discountId: 'replacement-discount' });
    expect(await repository.list('shop-a')).toHaveLength(2);
  });

  it('keeps a pause request pending until SHOPLINE confirms the discount is expired', async () => {
    const repository = new D1CampaignRepository(database);
    await repository.save('shop-a', { ...directProductCampaign, status: 'draft' }, 0);
    const publish = await repository.beginPublication('shop-a', directProductCampaign.id, 1, 'publish');
    await repository.finishPublication('shop-a', directProductCampaign.id, 1, 'publish', 'discount-1', publish.owner);

    const pause = await repository.beginPublication('shop-a', directProductCampaign.id, 2, 'pause');
    await repository.finishPausePending('shop-a', directProductCampaign.id, 2, 'discount-1', pause.owner);
    await repository.reconcilePlatformState('shop-a', directProductCampaign.id, 'active', null);

    await expect(repository.get('shop-a', directProductCampaign.id)).resolves.toMatchObject({ status: 'active', revision: 2 });
    await expect(repository.getPublication('shop-a', directProductCampaign.id)).resolves.toMatchObject({ state: 'pausing', discountId: 'discount-1', owner: null });

    await repository.reconcilePlatformState('shop-a', directProductCampaign.id, 'paused', null);
    await expect(repository.get('shop-a', directProductCampaign.id)).resolves.toMatchObject({ status: 'paused', revision: 3 });
    await expect(repository.getPublication('shop-a', directProductCampaign.id)).resolves.toMatchObject({ state: 'paused', discountId: 'discount-1', owner: null });
  });

  it('marks subscription revocation separately from a merchant pause and clears the deleted discount ID', async () => {
    const repository = new D1CampaignRepository(database);
    await repository.save('shop-a', { ...directProductCampaign, status: 'draft' }, 0);
    const publish = await repository.beginPublication('shop-a', directProductCampaign.id, 1, 'publish');
    await repository.finishPublication('shop-a', directProductCampaign.id, 1, 'publish', 'discount-1', publish.owner);

    await repository.pauseForSubscriptionExpiration('shop-a', directProductCampaign.id);

    await expect(repository.getPublication('shop-a', directProductCampaign.id)).resolves.toMatchObject({ state: 'entitlement_revoked', discountId: null, owner: null });
  });

  it.each([true, false])('ends a subscription-expired campaign at the confirmed expiry time (ongoing=%s)', async (ongoing) => {
    let now = Date.parse('2026-11-17T13:30:00.000Z');
    const repository = new D1CampaignRepository(database, () => now);
    await repository.save('shop-a', {
      ...directProductCampaign, status: 'draft', neverExpires: ongoing,
      ...(ongoing ? {} : { endsAt: '2026-12-01T00:00:00.000Z' }),
    }, 0);
    const lease = await repository.beginPublication('shop-a', directProductCampaign.id, 1, 'publish');
    await repository.finishPublication('shop-a', directProductCampaign.id, 1, 'publish', 'discount-1', lease.owner);

    const expired = await repository.pauseForSubscriptionExpiration('shop-a', directProductCampaign.id);
    expect(expired).toMatchObject({ status: 'paused', pauseReason: 'subscription_expired', neverExpires: false, endsAt: new Date(now).toISOString() });
    expect(validateCampaign(expired!)).toEqual([]);
    now += 60_000;
    expect(await repository.pauseForSubscriptionExpiration('shop-a', directProductCampaign.id)).toEqual(expired);
    await expect(repository.get('shop-a', directProductCampaign.id)).resolves.toEqual(expired);
  });

  it('keeps the recorded expiry until a renewed merchant explicitly republishes successfully', async () => {
    const now = Date.parse('2026-11-17T13:30:00.000Z');
    const repository = new D1CampaignRepository(database, () => now);
    await repository.save('shop-a', { ...directProductCampaign, status: 'draft', neverExpires: true }, 0);
    const first = await repository.beginPublication('shop-a', directProductCampaign.id, 1, 'publish');
    await repository.finishPublication('shop-a', directProductCampaign.id, 1, 'publish', 'discount-1', first.owner);
    const expired = await repository.pauseForSubscriptionExpiration('shop-a', directProductCampaign.id);

    const retry = await repository.beginPublication('shop-a', directProductCampaign.id, expired!.revision, 'publish');
    expect(retry.campaign.endsAt).toBeUndefined();
    expect(retry.campaign.neverExpires).toBe(true);
    await repository.markPublicationFailure('shop-a', directProductCampaign.id, false, 'publish', retry.owner);
    await expect(repository.get('shop-a', directProductCampaign.id)).resolves.toEqual(expired);

    const renewed = await repository.beginPublication('shop-a', directProductCampaign.id, expired!.revision, 'publish');
    const active = await repository.finishPublication('shop-a', directProductCampaign.id, expired!.revision, 'publish', 'discount-2', renewed.owner);
    expect(active.status).toBe('active');
    expect(active.endsAt).toBeUndefined();
    expect(active.neverExpires).toBe(true);
    expect(active.pauseReason).toBeUndefined();
  });

  it.each([true, false])('reconciles an uncertain renewed publication without losing its expiry history (found=%s)', async (found) => {
    const repository = new D1CampaignRepository(database, () => Date.parse('2026-11-17T13:30:00.000Z'));
    await repository.save('shop-a', { ...directProductCampaign, status: 'draft', neverExpires: true }, 0);
    const initial = await repository.beginPublication('shop-a', directProductCampaign.id, 1, 'publish');
    await repository.finishPublication('shop-a', directProductCampaign.id, 1, 'publish', 'discount-1', initial.owner);
    const expired = await repository.pauseForSubscriptionExpiration('shop-a', directProductCampaign.id);
    const renewed = await repository.beginPublication('shop-a', directProductCampaign.id, expired!.revision, 'publish');
    await repository.markPublicationFailure('shop-a', directProductCampaign.id, true, 'publish', renewed.owner);

    await repository.reconcileUnlinkedPublication('shop-a', directProductCampaign.id, found ? { discountId: 'discount-2', nodeId: null, state: 'active' } : null);
    const saved = await repository.get('shop-a', directProductCampaign.id);
    if (found) {
      expect(saved).toMatchObject({ status: 'active', neverExpires: true });
      expect(saved?.endsAt).toBeUndefined();
      expect(saved?.pauseReason).toBeUndefined();
    } else {
      expect(saved).toMatchObject({ status: 'paused', pauseReason: 'subscription_expired', endsAt: expired!.endsAt, neverExpires: false });
      const retry = await repository.beginPublication('shop-a', directProductCampaign.id, saved!.revision, 'publish');
      expect(retry.campaign.endsAt).toBeUndefined();
    }
  });

  it('does not release a newer shop publication lock when an older publication fails', async () => {
    let now = Date.parse('2026-10-27T00:00:00.000Z');
    const repository = new D1CampaignRepository(database, () => now);
    await repository.save('shop-a', { ...directProductCampaign, status: 'draft' }, 0);
    await repository.save('shop-a', { ...directProductCampaign, id: 'offer-b', status: 'draft' }, 0);
    const first = await repository.beginPublication('shop-a', 'offer-a', 1, 'publish');
    now += 60_001;
    const second = await repository.beginPublication('shop-a', 'offer-b', 1, 'publish');

    await repository.markPublicationFailure('shop-a', 'offer-a', true, 'publish', first.owner);
    await expect(repository.finishPublication('shop-a', 'offer-b', 1, 'publish', 'discount-2', second.owner)).resolves.toMatchObject({ id: 'offer-b', status: 'active' });
  });

  it('stages an active campaign update and preserves the confirmed campaign until finish', async () => {
    const repository = new D1CampaignRepository(database);
    await repository.save('shop-a', { ...directProductCampaign, status: 'draft' }, 0);
    const publication = await repository.beginPublication('shop-a', 'offer-a', 1, 'publish');
    await repository.finishPublication('shop-a', 'offer-a', 1, 'publish', 'discount-1', publication.owner);

    await repository.beginUpdate('shop-a', { ...directProductCampaign, name: 'Changed title', status: 'paused' }, 2, 'discount-1');

    await expect(repository.get('shop-a', 'offer-a')).resolves.toMatchObject({ name: 'Direct product', status: 'active', revision: 2 });
    await expect(repository.getPublication('shop-a', 'offer-a')).resolves.toMatchObject({ state: 'updating', discountId: 'discount-1' });
    await expect(repository.getStagedUpdate('shop-a', 'offer-a')).resolves.toMatchObject({ candidate: { name: 'Changed title', status: 'active' }, expectedRevision: 2, discountId: 'discount-1' });
  });

  it('retains an uncertain staged update and blocks a second update until reconciliation', async () => {
    const repository = new D1CampaignRepository(database);
    await repository.save('shop-a', { ...directProductCampaign, status: 'draft' }, 0);
    const publication = await repository.beginPublication('shop-a', 'offer-a', 1, 'publish');
    await repository.finishPublication('shop-a', 'offer-a', 1, 'publish', 'discount-1', publication.owner);
    const update = await repository.beginUpdate('shop-a', { ...directProductCampaign, name: 'Changed title', status: 'active' }, 2, 'discount-1');

    await repository.markUpdateFailure('shop-a', 'offer-a', true, update.owner);

    await expect(repository.getPublication('shop-a', 'offer-a')).resolves.toMatchObject({ state: 'needs_reconciliation', discountId: 'discount-1' });
    await expect(repository.getStagedUpdate('shop-a', 'offer-a')).resolves.toMatchObject({ candidate: { name: 'Changed title' } });
    await expect(repository.beginUpdate('shop-a', { ...directProductCampaign, name: 'Second change' }, 2, 'discount-1')).rejects.toThrow('reconciliation');
  });
});
