import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import { D1ApplicationRequestEvents } from '../src/db/application-request-events';
import { applyMigrations } from '../src/db/migrate';
import type { Env } from '../src/env';

const database = (env as Env).DB;
const now = Date.parse('2026-11-04T08:00:00.000Z');
const traceId = '11111111-1111-4111-8111-111111111111';

describe('application request events', () => {
  beforeEach(async () => {
    await applyMigrations(database);
    await database.batch([
      database.prepare('DELETE FROM admin_error_events'),
      database.prepare('DELETE FROM application_request_events'),
    ]);
  });

  it('redacts credentials and query strings before persisting an error', async () => {
    const events = new D1ApplicationRequestEvents(database, () => now);

    await events.recordError({
      source: 'browser', operation: 'runtime', code: 'UNHANDLED_REJECTION', severity: 'error', traceId,
      storeId: '42', route: '/api/quantity-breaks/campaigns?token=leak',
      message: 'Authorization: Bearer secret-token password=secret', occurredAt: new Date(now).toISOString(),
    });

    await expect(database.prepare('SELECT route, message FROM admin_error_events').first<{ route: string; message: string }>())
      .resolves.toEqual({ route: '/api/quantity-breaks/campaigns', message: '[REDACTED]' });
  });

  it('purges expired request summaries and errors after 30 days', async () => {
    const events = new D1ApplicationRequestEvents(database, () => now);
    const old = new Date(now - 31 * 24 * 60 * 60 * 1000).toISOString();

    await events.recordRequest({ traceId, route: '/api/quantity-breaks/campaigns', method: 'GET', httpStatus: 200, durationMs: 4, occurredAt: old });
    await events.recordError({ source: 'worker', operation: 'worker_http_failure', code: 'HTTP_500', severity: 'error', traceId, occurredAt: old });

    await expect(events.purgeExpired(now)).resolves.toEqual({ errors: 1, requests: 1 });
    await expect(database.prepare('SELECT count(*) AS total FROM application_request_events').first<{ total: number }>()).resolves.toEqual({ total: 0 });
    await expect(database.prepare('SELECT count(*) AS total FROM admin_error_events').first<{ total: number }>()).resolves.toEqual({ total: 0 });
  });
});
