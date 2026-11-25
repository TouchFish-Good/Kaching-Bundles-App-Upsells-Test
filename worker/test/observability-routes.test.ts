import { createExecutionContext, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import worker from '../src';
import { applyMigrations } from '../src/db/migrate';
import type { Env } from '../src/env';

const testEnv = { ...(env as Env), TOKEN_ENCRYPTION_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY' } as Env;

describe('browser observability endpoint', () => {
  it('requires a merchant session before accepting browser errors', async () => {
    await applyMigrations(testEnv.DB);
    const response = await worker.fetch(new Request('https://app.test/api/observability/errors', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'runtime', pagePath: '/quantity-breaks' }),
    }), testEnv, createExecutionContext());
    expect(response.status).toBe(401);
  });
});
