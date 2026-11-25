import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import { readFile } from 'node:fs/promises';

test('server campaigns map real status, tiers and revision without invented products', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { toAdminCampaign } = await vite.ssrLoadModule('/src/prototype/campaign-adapter.ts');
    const campaign = toAdminCampaign({ id: 'a', name: 'Offer', status: 'draft', scope: { kind: 'all', excludedProductIds: [] }, tiers: [{ tierId: 't', displayOrder: 1, quantity: 3, discountType: 'percentage', discountValue: 2000, label: 'Three' }], revision: 2, updatedAt: '2026-10-14T00:00:00Z', combinesWith: { orderDiscounts: false, shippingDiscounts: false } });
    assert.equal(campaign.status, 'Draft');
    assert.equal(campaign.products, 'All eligible products');
    assert.equal(campaign.tiers[0].discountPercent, 20);
    assert.equal(campaign.revision, 2);
    assert.equal(campaign.combineProduct, false);
  } finally { await vite.close(); }
});

test('campaign names preserve the internal name while legacy records fall back for the checkout name', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { toAdminCampaign, toCampaignDraft } = await vite.ssrLoadModule('/src/prototype/campaign-adapter.ts');
    const legacy = { id: 'legacy', name: 'Internal legacy name', status: 'draft', scope: { kind: 'all', excludedProductIds: [] }, tiers: [], revision: 1, updatedAt: '2026-11-09T00:00:00.000Z', combinesWith: { orderDiscounts: false, shippingDiscounts: false } };
    const current = { ...legacy, discountName: 'Cart and checkout name' };

    assert.equal(toAdminCampaign(legacy).discountName, 'Internal legacy name');
    assert.equal(toAdminCampaign(current).discountName, 'Cart and checkout name');
    assert.equal(toCampaignDraft(toAdminCampaign(current), current).discountName, 'Cart and checkout name');
  } finally { await vite.close(); }
});

test('drafts remain drafts while only created future campaigns are scheduled', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { toAdminCampaign } = await vite.ssrLoadModule('/src/prototype/campaign-adapter.ts');
    const base = {
      id: 'status-campaign', name: 'Status campaign', scope: { kind: 'products', productIds: ['product-1'], excludedProductIds: [] },
      tiers: [{ tierId: 'tier-1', displayOrder: 0, quantity: 1, discountType: 'none' }],
      combinesWith: { orderDiscounts: false, shippingDiscounts: false }, revision: 1, updatedAt: '2026-11-04T00:00:00.000Z',
    };

    assert.equal(toAdminCampaign({ ...base, status: 'draft', startsAt: '2027-01-01T00:00:00.000Z' }).status, 'Draft');
    assert.equal(toAdminCampaign({ ...base, status: 'active', platformDiscountId: 'discount-1', platformStatus: 'active', startsAt: '2027-01-01T00:00:00.000Z' }).status, 'Scheduled');
    assert.equal(toAdminCampaign({ ...base, status: 'active', platformDiscountId: 'discount-1', platformStatus: 'active', startsAt: '2020-01-01T00:00:00.000Z' }).status, 'Active');
  } finally { await vite.close(); }
});

test('unverified SHOPLINE publication state never renders as an active campaign', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { toAdminCampaign } = await vite.ssrLoadModule('/src/prototype/campaign-adapter.ts');
    const campaign = toAdminCampaign({
      id: 'a', name: 'Offer', status: 'active', platformState: 'needs_reconciliation', platformStatus: 'unverified',
      scope: { kind: 'all', excludedProductIds: [] }, tiers: [], revision: 2,
      updatedAt: '2026-10-14T00:00:00Z', combinesWith: { orderDiscounts: false, shippingDiscounts: false },
    });

    assert.equal(campaign.status, 'Unverified');
    assert.equal(campaign.listStatus, 'Unverified');
  } finally { await vite.close(); }
});

test('the latest SHOPLINE platform status takes precedence over a historical D1 operation state', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { toAdminCampaign } = await vite.ssrLoadModule('/src/prototype/campaign-adapter.ts');
    const campaign = toAdminCampaign({
      id: 'a', name: 'Offer', status: 'paused', platformState: 'needs_reconciliation', platformStatus: 'active',
      scope: { kind: 'all', excludedProductIds: [] }, tiers: [], revision: 2,
      updatedAt: '2026-10-14T00:00:00Z', combinesWith: { orderDiscounts: false, shippingDiscounts: false },
    });

    assert.equal(campaign.status, 'Active');
    assert.equal(campaign.listStatus, 'Active');
  } finally { await vite.close(); }
});

test('campaign adapter preserves product-discount combination and defaults legacy records to false', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { toAdminCampaign, toCampaignDraft } = await vite.ssrLoadModule('/src/prototype/campaign-adapter.ts');
    const legacy = { id: 'a', name: 'Offer', status: 'draft', scope: { kind: 'all', excludedProductIds: [] }, tiers: [], revision: 2, updatedAt: '2026-10-14T00:00:00Z', combinesWith: { orderDiscounts: false, shippingDiscounts: false } };
    assert.equal(toAdminCampaign(legacy).combineProduct, false);
    const current = { ...legacy, combinesWith: { ...legacy.combinesWith, productDiscounts: true } };
    assert.equal(toCampaignDraft(toAdminCampaign(current), current).combinesWith.productDiscounts, true);
  } finally { await vite.close(); }
});

test('draft conversion preserves money units and refuses sample product names', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { toCampaignDraft } = await vite.ssrLoadModule('/src/prototype/campaign-adapter.ts');
    const base = { id: 'a', name: 'Offer', products: 'All eligible products', status: 'Draft', tiers: [{ tierId: 't', quantity: 3, label: 'Three', discountType: 'percentage', discountPercent: 20, discountValue: 20 }], schedule: 'No schedule', updated: '' };
    assert.equal(toCampaignDraft(base).tiers[0].discountValue, 2000);
    assert.throws(() => toCampaignDraft({ ...base, products: 'Renewal Serum' }), /product selection/i);
  } finally { await vite.close(); }
});

test('draft conversion omits the end time only when never expires is selected', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { toCampaignDraft } = await vite.ssrLoadModule('/src/prototype/campaign-adapter.ts');
    const base = {
      id: 'a', name: 'Offer', products: 'All eligible products', status: 'Draft', tiers: [], schedule: '', updated: '',
      scope: { kind: 'all', excludedProductIds: [] }, startsAt: '2026-11-04T10:00:00.000Z', endsAt: '2026-11-05T10:00:00.000Z',
    };
    assert.equal(toCampaignDraft({ ...base, neverExpires: true }).endsAt, undefined);
    assert.equal(toCampaignDraft({ ...base, neverExpires: false }).endsAt, base.endsAt);
  } finally { await vite.close(); }
});

test('published campaign edits preserve active status without requiring pause', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { toCampaignDraft } = await vite.ssrLoadModule('/src/prototype/campaign-adapter.ts');
    const campaign = { id: 'a', name: 'Offer', products: 'Selected products', status: 'Active', scope: { kind: 'products', productIds: ['p1'], excludedProductIds: [] }, tiers: [], schedule: 'No schedule', updated: '' };
    assert.equal(toCampaignDraft(campaign).status, 'active');
  } finally { await vite.close(); }
});

test('specified product scope survives editor conversion and never uses a display label as identity', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { toAdminCampaign, toCampaignDraft } = await vite.ssrLoadModule('/src/prototype/campaign-adapter.ts');
    const server = { id: 'a', name: 'Offer', status: 'draft', scope: { kind: 'products', productIds: ['p1', 'p2'], excludedProductIds: [] }, tiers: [], revision: 2, updatedAt: '2026-10-14T00:00:00Z', combinesWith: { orderDiscounts: false, shippingDiscounts: false } };
    const admin = toAdminCampaign(server);
    assert.deepEqual(admin.scope.productIds, ['p1', 'p2']);
    assert.deepEqual(toCampaignDraft({ ...admin, products: 'Renamed display only' }, server).scope, server.scope);
    assert.deepEqual(toCampaignDraft({ ...admin, scope: { ...admin.scope, productIds: ['p2', 'p2'] } }, server).scope.productIds, ['p2']);
    assert.throws(() => toCampaignDraft({ ...admin, scope: { kind: 'products', productIds: [], excludedProductIds: [] } }, server), /select.*product/i);
  } finally { await vite.close(); }
});

test('an existing collection draft retains its scope when saved without scope changes', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { toAdminCampaign, toCampaignDraft } = await vite.ssrLoadModule('/src/prototype/campaign-adapter.ts');
    const server = { id: 'a', name: 'Collection offer', status: 'draft', scope: { kind: 'collections', collectionIds: ['c1'], excludedProductIds: [] }, tiers: [], revision: 1, updatedAt: '2026-10-14T00:00:00Z', combinesWith: { orderDiscounts: false, shippingDiscounts: false } };
    assert.deepEqual(toCampaignDraft(toAdminCampaign(server), server).scope, server.scope);
  } finally { await vite.close(); }
});

test('a new collection draft saves unique real collection IDs', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { toCampaignDraft } = await vite.ssrLoadModule('/src/prototype/campaign-adapter.ts');
    const draft = { id: 'new', name: 'Collection offer', products: '', status: 'Draft', tiers: [], schedule: '', updated: '', scope: { kind: 'collections', collectionIds: ['c1', 'c1', 'c2'], excludedProductIds: [] } };
    assert.deepEqual(toCampaignDraft(draft).scope.collectionIds, ['c1', 'c2']);
    assert.throws(() => toCampaignDraft({ ...draft, scope: { kind: 'collections', collectionIds: [], excludedProductIds: [] } }), /collection/i);
  } finally { await vite.close(); }
});

test('editing a scheduled campaign preserves its timezone and schedule', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { toAdminCampaign, toCampaignDraft } = await vite.ssrLoadModule('/src/prototype/campaign-adapter.ts');
    const original = { id: 'a', name: 'Offer', status: 'paused', scope: { kind: 'all', excludedProductIds: [] }, tiers: [], revision: 2, updatedAt: '2026-10-14T00:00:00Z', combinesWith: { orderDiscounts: false, shippingDiscounts: false }, startsAt: '2026-10-20T10:30:00.000Z', endsAt: '2026-10-21T10:30:00.000Z', timeZone: 'Europe/Paris' };
    const admin = toAdminCampaign(original);
    assert.equal(admin.status, 'Paused');
    assert.equal(toCampaignDraft(admin, original).timeZone, 'Europe/Paris');
    assert.equal(toCampaignDraft(admin, original).startsAt, original.startsAt);
  } finally { await vite.close(); }
});

test('a requested pause stays visible while SHOPLINE still reports the discount active', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { toAdminCampaign } = await vite.ssrLoadModule('/src/prototype/campaign-adapter.ts');
    const campaign = toAdminCampaign({ id: 'a', name: 'Offer', status: 'active', platformStatus: 'active', platformOperationState: 'pausing', scope: { kind: 'all', excludedProductIds: [] }, tiers: [], revision: 2, updatedAt: '2026-11-03T14:30:00.000Z', combinesWith: { orderDiscounts: false, shippingDiscounts: false } });
    assert.equal(campaign.status, 'Pausing');
    assert.equal(campaign.listStatus, 'Pausing');
  } finally { await vite.close(); }
});

test('campaign widget edits survive admin conversion and draft save', async () => {
  const fixture = JSON.parse(await readFile(new URL('../../app/test/fixtures/campaign-widget-config.json', import.meta.url), 'utf8'));
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { toAdminCampaign, toCampaignDraft } = await vite.ssrLoadModule('/src/prototype/campaign-adapter.ts');
    const original = { id: 'a', name: 'Offer', status: 'draft', scope: { kind: 'all', excludedProductIds: [] }, tiers: [], revision: 2, updatedAt: '2026-10-14T00:00:00Z', combinesWith: { orderDiscounts: false, shippingDiscounts: false }, widget: fixture };
    const admin = toAdminCampaign(original);
    assert.equal(admin.widget.colors.card, '#F7F7F7');
    const changed = { ...admin, widget: { ...admin.widget, colors: { ...admin.widget.colors, card: '#123456' } } };
    assert.equal(toCampaignDraft(changed, original).widget.colors.card, '#123456');
    assert.equal(original.widget.colors.card, '#F7F7F7');
  } finally { await vite.close(); }
});

test('server campaign conversion restores missing detailed appearance defaults', async () => {
  const fixture = JSON.parse(await readFile(new URL('../../app/test/fixtures/campaign-widget-config.json', import.meta.url), 'utf8'));
  delete fixture.badgePosition;
  delete fixture.colors.variantBorder;
  delete fixture.typography.cartLine;
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { toAdminCampaign } = await vite.ssrLoadModule('/src/prototype/campaign-adapter.ts');
    const admin = toAdminCampaign({ id: 'a', name: 'Offer', status: 'draft', scope: { kind: 'all', excludedProductIds: [] }, tiers: [], revision: 1, updatedAt: '2026-10-14T00:00:00Z', combinesWith: { orderDiscounts: false, shippingDiscounts: false }, widget: fixture });
    assert.equal(admin.widget.badgePosition, 'corner');
    assert.equal(admin.widget.colors.variantBorder, '#C6C6C6');
    assert.equal(admin.widget.typography.cartLine.sizePx, 11);
  } finally { await vite.close(); }
});

test('campaign adapter preserves independent mobile widget styles', async () => {
  const fixture = JSON.parse(await readFile(new URL('../../app/test/fixtures/campaign-widget-config.json', import.meta.url), 'utf8'));
  fixture.mobile = { ...fixture, layout: 'grid', card: { ...fixture.card, gapPx: 3 } };
  delete fixture.mobile.version;
  delete fixture.mobile.mobile;
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { toAdminCampaign, toCampaignDraft } = await vite.ssrLoadModule('/src/prototype/campaign-adapter.ts');
    const original = { id: 'a', name: 'Offer', status: 'draft', scope: { kind: 'all', excludedProductIds: [] }, tiers: [], revision: 2, updatedAt: '2026-10-14T00:00:00Z', combinesWith: { orderDiscounts: false, shippingDiscounts: false }, widget: fixture };
    const admin = toAdminCampaign(original);
    assert.equal(admin.widget.mobile.layout, 'grid');
    const draft = toCampaignDraft(admin, original);
    assert.equal(draft.widget.mobile.card.gapPx, 3);
    assert.equal(draft.widget.layout, fixture.layout);
  } finally { await vite.close(); }
});
