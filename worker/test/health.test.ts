import { createExecutionContext, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import worker from '../src';
import type { Env } from '../src/env';

describe('worker health', () => {
  it('returns a non-secret readiness response', async () => {
    if (!worker.fetch) {
      throw new Error('Worker fetch handler is missing');
    }

    const response = await worker.fetch(
      new Request('https://raised-stability-gaps-html.trycloudflare.com/health'),
      env as Env,
      createExecutionContext(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Trace-Id')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: 'shopline-quantity-breaks',
    });
  });
});
