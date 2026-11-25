import { env } from 'cloudflare:test';
import { beforeEach, expect, it } from 'vitest';
import { applyMigrations } from '../src/db/migrate';
import { D1CampaignRepository } from '../src/db/campaigns';
import { defaultOfferModule, type OfferRule } from '../../shared/offer-core.mjs';
import type { CampaignDraft } from '../src/domain/campaign';
import type { Env } from '../src/env';
const database = (env as Env).DB;
const rule: OfferRule = { ruleId: 'free', displayOrder: 0, productId: '900719925474099312345', allowedVariantIds: ['900719925474099312346'], quantity: 1, label: '', labelPosition: 'corner', showImage: false, discountType: 'fixed_price', discountValue: 0, trigger: { type: 'quantity', operator: 'gte', quantity: 3 } };
function draft(): CampaignDraft {
  const gifts = defaultOfferModule('gifts'); gifts.enabled = true; gifts.items = [structuredClone(rule)];
  const bundles = defaultOfferModule('bundles'); bundles.enabled = true; bundles.selectionMode = 'multiple'; bundles.items = [{ ...structuredClone(rule), discountType: 'fixed_amount', discountValue: 50 }];
  return { id: 'offer', name: 'Offer', status: 'draft', startsAt: '2020-01-01T00:00:00Z', scope: { kind: 'products', productIds: ['main-product'], excludedProductIds: [] }, tiers: [{ tierId: 'three', displayOrder: 0, quantity: 3, discountType: 'percentage', discountValue: 1000 }], combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false }, gifts, bundles };
}
beforeEach(async () => {
  await applyMigrations(database);
  await database.batch(['quantity_breaks_collection_conflicts','quantity_breaks_staged_updates','quantity_breaks_publications','quantity_breaks_campaigns','quantity_breaks_shop_locks'].map(table => database.prepare(`DELETE FROM ${table}`)));
});
it('D1 create/update/read retains exact independent accessory configs and disabled drafts', async () => {
  const repository = new D1CampaignRepository(database), first = draft();
  await repository.save('shop-a', first, 0);
  expect((await repository.get('shop-a', 'offer'))?.gifts).toEqual(first.gifts);
  expect((await repository.get('shop-a', 'offer'))?.bundles).toEqual(first.bundles);
  first.gifts!.enabled = false; first.bundles!.items[0].quantity = 2;
  await repository.save('shop-a', first, 1);
  const read = await repository.get('shop-a', 'offer');
  expect(read?.gifts).toEqual(first.gifts); expect(read?.bundles).toEqual(first.bundles);
  expect(await repository.get('shop-b', 'offer')).toBeNull();
});
it('D1 rejects malformed saves and revalidates enabled modules before publication', async () => {
  const repository = new D1CampaignRepository(database), first = draft();
  first.gifts!.items[0].discountValue = 1;
  await expect(repository.save('shop-a', first, 0)).rejects.toThrow(/gifts/);
  first.gifts!.items[0].discountValue = 0;
  await repository.save('shop-a', first, 0);
  first.gifts!.items = [];
  await database.prepare('UPDATE quantity_breaks_campaigns SET campaign_json = ? WHERE shop_handle = ? AND id = ?').bind(JSON.stringify(first), 'shop-a', 'offer').run();
  await expect(repository.beginPublication('shop-a', 'offer', 1, 'publish')).rejects.toThrow(/gifts/);
});
