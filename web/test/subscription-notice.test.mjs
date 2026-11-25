import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';

test('subscription notice uses store time and warns for a gap or missing next period', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { subscriptionNotice } = await vite.ssrLoadModule('/src/prototype/subscription-notice.ts');
    const now = Date.parse('2026-11-14T00:00:00Z');
    const end = Date.parse('2026-11-16T00:00:00Z');
    const base = { validUntil: end, nextValidFrom: null, nextValidUntil: null, timeZone: 'Asia/Shanghai', locale: 'zh-Hans', now };
    assert.deepEqual(subscriptionNotice(base), {
      urgent: true,
      current: '套餐即将在2026/11/16 08:00到期，到期后对应折扣将直接失效。',
      next: null,
    });
    assert.deepEqual(subscriptionNotice({ ...base, nextValidFrom: end, nextValidUntil: end + 100_000 }), {
      urgent: false,
      current: '当前套餐将于2026/11/16 08:00到期，',
      next: '下一期套餐将于2026/11/16 08:00生效。',
    });
    const gap = subscriptionNotice({ ...base, nextValidFrom: end + 86_400_000, nextValidUntil: end + 100_000_000 });
    assert.equal(gap.urgent, true);
    assert.equal(gap.current, '套餐即将在2026/11/16 08:00到期，到期后对应折扣将直接失效。');
    assert.equal(gap.next, '下一期套餐将于2026/11/17 08:00生效。');
  } finally { await vite.close(); }
});
