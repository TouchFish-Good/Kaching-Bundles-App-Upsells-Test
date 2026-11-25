import { describe, expect, it, vi } from 'vitest';

import type { Env } from '../src/env';
import { exchangeCode } from '../src/services/shopline-oauth';

const env = {
  SHOPLINE_APP_KEY: 'test-key',
  SHOPLINE_APP_SECRET: 'test-secret',
  SCOPES: 'read_products',
} as Env;

describe('SHOPLINE OAuth token expiry', () => {
  it('rejects a token response with an invalid expiry', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      code: 200,
      data: { accessToken: 'access-token', expireTime: 'not-a-timestamp' },
    }), { status: 200 })));

    await expect(exchangeCode('demo', 'authorization-code', env))
      .rejects.toThrow('SHOPLINE token response has an invalid expiry');
  });
});
