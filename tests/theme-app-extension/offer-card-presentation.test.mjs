import test from 'node:test';
import assert from 'node:assert/strict';
import { setupOffers, offerCampaign, offerMarkup, changeOfferSelection } from './helpers/offer-fixture.mjs';

function lockedCampaign() {
  const campaign = offerCampaign();
  campaign.bundles.items[0].trigger.quantity = 5;
  campaign.bundles.items[0].label = 'Best value';
  campaign.gifts.items[0].trigger.quantity = 5;
  campaign.tiers.push({ tierId: 't6', quantity: 6, discountType: 'none' });
  return campaign;
}

test('locked native card displays the reachable discount without adding it to the current quote', async () => {
  const h = setupOffers({ campaign: lockedCampaign() });
  await h.theme.mountBlock(h.block);
  const card = h.block.querySelector('[data-offer-rule="c"]');
  assert.equal(card.querySelector('.qb-offer-label')?.textContent, 'Best value');
  assert.equal(card.querySelector('.qb-offer-prices b')?.textContent, '$10.00');
  assert.equal(card.querySelector('.qb-offer-prices del')?.textContent, '$20.00');
  assert.equal(card.querySelector('.qb-offer-savings')?.textContent, 'Save $10.00');
  assert.equal(card.dataset.included, 'false');
  assert.equal(h.block.querySelector('[data-bundle-total]').textContent, '$40.00');
});

test('native lock overlay shows only Locked and unlocks the reachable tier with the bundle selected', async () => {
  const h = setupOffers({ campaign: lockedCampaign() });
  await h.theme.mountBlock(h.block);
  const card = () => h.block.querySelector('[data-offer-rule="c"]');
  const overlay = card().querySelector('button.qb-offer-lock');
  assert.ok(overlay);
  assert.equal(overlay.textContent, 'Locked');
  assert.match(overlay.getAttribute('aria-label'), /6/);
  assert.doesNotMatch(card().querySelector('.qb-offer-select').textContent, /Unlock|6/);
  assert.equal(card().querySelector('select').getAttribute('aria-label'), 'Choose an option 1');
  assert.doesNotMatch(card().textContent, /Choose an option|#1/);
  overlay.click();
  assert.equal(h.block.querySelector('[data-tier-id="t6"] .qb-tier-header').getAttribute('aria-pressed'), 'true');
  assert.equal(card().querySelector('[data-offer-select]').checked, true);
  assert.equal(card().querySelector('.qb-offer-lock'), null);
  changeOfferSelection(h, 'c');
  assert.equal(card().dataset.included, 'false');
});

test('native gift lock overlay unlocks an automatic gift with no cancellation control', async () => {
  const h = setupOffers({ campaign: lockedCampaign() });
  await h.theme.mountBlock(h.block);
  const overlay = h.block.querySelector('[data-offer-rule="a"] .qb-offer-lock');
  assert.ok(overlay);
  overlay.click();
  const gift = h.block.querySelector('[data-offer-rule="a"]');
  assert.equal(gift.dataset.included, 'true');
  assert.equal(gift.querySelector('[data-offer-select]'), null);
  assert.equal(gift.querySelector('button'), null);
});

test('native lock cannot turn unknown prices into a selectable or advertised offer', async () => {
  const campaign = lockedCampaign();
  const h = setupOffers({ campaign, markup: offerMarkup(campaign).replaceAll('data-price="2000"', 'data-price=""') });
  await h.theme.mountBlock(h.block);
  const card = h.block.querySelector('[data-offer-rule="c"]');
  assert.equal(card.querySelector('.qb-offer-lock')?.disabled, false);
  card.querySelector('.qb-offer-lock').click();
  const unlocked = h.block.querySelector('[data-offer-rule="c"]');
  assert.equal(unlocked.dataset.included, 'false');
  assert.equal(unlocked.querySelector('[data-offer-select]').disabled, true);
  assert.equal(card.querySelector('.qb-offer-prices'), null);
  assert.equal(card.querySelector('.qb-offer-savings'), null);
  assert.equal(card.dataset.included, 'false');
});

test('native carousel remeasures mounted bounds and makes room for a tall corner badge', async () => {
  const pending = new Map();
  let timerId = 0;
  const campaign = offerCampaign();
  campaign.bundles.style.desktop.layout.mode = 'carousel';
  campaign.bundles.items[0].label = 'A long configured promotional badge';
  const h = setupOffers({ campaign, timers: {
    setTimeout(fn) { pending.set(++timerId, fn); return timerId; },
    clearTimeout(id) { pending.delete(id); },
  } });
  await h.theme.mountBlock(h.block);
  const section = h.block.querySelector('[data-offer-module="bundles"]');
  const grid = section.querySelector('.qb-offer-grid');
  Object.defineProperties(grid, { clientWidth: { value: 300 }, scrollWidth: { value: 900 }, scrollLeft: { value: 0, writable: true } });
  section.querySelector('.qb-offer-label').getBoundingClientRect = () => ({ height: 80 });
  for (const fn of [...pending.values()]) fn();
  const buttons = section.querySelectorAll('.qb-offer-nav button');
  assert.equal(buttons[0].disabled, true);
  assert.equal(buttons[1].disabled, false);
  assert.ok(parseFloat(grid.style.getPropertyValue('--qb-offer-badge-clearance')) >= 40);
  grid.scrollLeft = 600;
  grid.dispatchEvent(new h.window.Event('scroll'));
  assert.equal(buttons[0].disabled, false);
  assert.equal(buttons[1].disabled, true);
});
