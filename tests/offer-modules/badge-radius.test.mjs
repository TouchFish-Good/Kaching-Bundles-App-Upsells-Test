import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../../shared/offer-core.mjs';
import { moduleConfig } from './fixture.cjs';

test('independent desktop and mobile badge radii survive JSON persistence and normalization', () => {
  const value = moduleConfig('gifts');
  value.style.desktop.badge = { radiusPx: 0 };
  value.style.mobile.badge = { radiusPx: 24 };
  assert.deepEqual(core.validateOfferModule(value, 'gifts'), []);
  const restored = core.normalizeOfferModule(JSON.parse(JSON.stringify(value)), 'gifts');
  assert.equal(restored.style.desktop.badge.radiusPx, 0);
  assert.equal(restored.style.mobile.badge.radiusPx, 24);
});

test('legacy activities keep their implicit badge radius', () => {
  const restored = core.normalizeOfferModule(moduleConfig('bundles'), 'bundles');
  assert.equal(restored.style.desktop.badge, undefined);
  assert.equal(restored.style.mobile.badge, undefined);
});

test('invalid badge radius objects are rejected before persistence', () => {
  for (const badge of [null, {}, { radiusPx: -1 }, { radiusPx: 1.5 }, { radiusPx: '4' }, { radiusPx: 1025 }, { radiusPx: 4, extra: true }]) {
    const value = moduleConfig('bundles');
    value.style.desktop.badge = badge;
    assert.ok(core.validateOfferModule(value, 'bundles').length, JSON.stringify(badge));
    assert.throws(() => core.normalizeOfferModule(value, 'bundles'));
  }
});
