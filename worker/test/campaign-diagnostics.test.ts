import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import { D1CampaignDiagnostics } from '../src/db/campaign-diagnostics';
import { applyMigrations } from '../src/db/migrate';
import type { Env } from '../src/env';

const database = (env as Env).DB;
const now = Date.parse('2026-11-03T00:00:00.000Z');

describe('campaign diagnostics repository', () => {
  beforeEach(async () => {
    await applyMigrations(database);
    await database.prepare('DELETE FROM campaign_diagnostic_events').run();
  });

  it('stores redacted SHOPLINE response details without request secrets', async () => {
    const diagnostics = new D1CampaignDiagnostics(database, () => now);
    await diagnostics.record({
      traceId: '550e8400-e29b-41d4-a716-446655440000', workerName: 'shopline-quantity-breaks',
      storeId: '42', shopHandle: 'alpha', campaignId: 'campaign-1', eventType: 'shopline_api', outcome: 'failure',
      upstreamService: 'SHOPLINE', upstreamPath: '/sales/discount_apps', upstreamStatus: 504,
      upstreamRequestId: 'shopline-request-1', errorCode: 'UPSTREAM_TIMEOUT', durationMs: 5000,
      upstreamResponseCode: 'UPSTREAM_TIMEOUT', upstreamResponseMessage: 'SHOPLINE timed out while processing the request.',
      upstreamResponseBody: JSON.stringify({ error: { code: 'UPSTREAM_TIMEOUT', message: 'SHOPLINE timed out while processing the request.' }, details: { retryable: true } }),
    });

    const row = await database.prepare('SELECT trace_id, upstream_path, upstream_request_id, error_code, upstream_response_code, upstream_response_message, upstream_response_body FROM campaign_diagnostic_events').first<Record<string, unknown>>();
    expect(row).toEqual({ trace_id: '550e8400-e29b-41d4-a716-446655440000', upstream_path: '/sales/discount_apps', upstream_request_id: 'shopline-request-1', error_code: 'UPSTREAM_TIMEOUT', upstream_response_code: 'UPSTREAM_TIMEOUT', upstream_response_message: 'SHOPLINE timed out while processing the request.', upstream_response_body: JSON.stringify({ error: { code: 'UPSTREAM_TIMEOUT', message: 'SHOPLINE timed out while processing the request.' }, details: { retryable: true } }) });
    expect(JSON.stringify(row)).not.toContain('token');
  });

  it('purges only diagnostics older than the 30-day expiry boundary', async () => {
    const diagnostics = new D1CampaignDiagnostics(database, () => now);
    const old = now - 31 * 24 * 60 * 60 * 1000;
    await diagnostics.record({ traceId: '550e8400-e29b-41d4-a716-446655440000', workerName: 'shopline-quantity-breaks', eventType: 'worker_error', outcome: 'failure', occurredAt: new Date(old).toISOString(), expiresAt: old });
    await diagnostics.record({ traceId: '650e8400-e29b-41d4-a716-446655440000', workerName: 'shopline-quantity-breaks', eventType: 'worker_error', outcome: 'failure', occurredAt: new Date(now).toISOString(), expiresAt: now + 1 });

    await expect(diagnostics.purgeExpired(now)).resolves.toBe(1);
    await expect(database.prepare('SELECT COUNT(*) AS total FROM campaign_diagnostic_events').first<{ total: number }>()).resolves.toEqual({ total: 1 });
  });
});
