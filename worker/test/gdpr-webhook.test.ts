import { createExecutionContext, env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import worker from '../src';
import { hmacBase64, hmacHex } from '../src/crypto';
import { applyMigrations } from '../src/db/migrate';
import type { Env } from '../src/env';

const secret = 'gdpr-webhook-secret';
const testEnv = { ...(env as Env), SHOPLINE_APP_SECRET: secret, now: () => Date.parse('2026-11-12T00:00:00.000Z') } as Env;

async function webhookRequest(path: string, topic: string, body: Record<string, unknown>, encoding: 'hex' | 'base64' | 'invalid' = 'hex'): Promise<Request> {
  const raw = JSON.stringify(body);
  const signature = encoding === 'hex' ? await hmacHex(secret, raw) : encoding === 'base64' ? await hmacBase64(secret, raw) : 'invalid';
  return new Request(`https://app.test${path}`, { method: 'POST', headers: {
    'content-type': 'application/json', 'X-Shopline-Hmac-Sha256': signature, 'X-Shopline-Topic': topic,
    'X-Shopline-Webhook-Id': `event-${topic.replace('/', '-')}`, 'X-Shopline-Shop-Id': '42', 'X-Shopline-Shop-Domain': 'alpha.myshopline.com',
  }, body: raw });
}

describe('GDPR webhooks', () => {
  beforeEach(async () => {
    await applyMigrations(testEnv.DB);
    await testEnv.DB.prepare('DELETE FROM gdpr_deletion_tasks').run();
  });

  it.each(['hex', 'base64'] as const)('returns an empty 200 for a signed customers/redact payload (%s)', async (encoding) => {
    const response = await worker.fetch(await webhookRequest('/api/webhooks/gdpr/customers-redact', 'customers/redact', { customer_id: 'customer-42' }, encoding), testEnv, createExecutionContext());
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
    await expect(testEnv.DB.prepare('SELECT kind, customer_id_digest FROM gdpr_deletion_tasks').first()).resolves.toMatchObject({ kind: 'customer_redact', customer_id_digest: expect.any(String) });
  });

  it('rejects an invalid signature without creating a task', async () => {
    const response = await worker.fetch(await webhookRequest('/api/webhooks/gdpr/merchants-redact', 'merchants/redact', {}, 'invalid'), testEnv, createExecutionContext());
    expect(response.status).toBe(401);
    await expect(testEnv.DB.prepare('SELECT count(*) AS total FROM gdpr_deletion_tasks').first()).resolves.toEqual({ total: 0 });
  });
});
