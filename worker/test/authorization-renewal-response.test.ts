import { describe, expect, it } from 'vitest';

import { reauthorizationRequired } from '../src/auth/reauthorization';
import type { Env } from '../src/env';

const testEnv = {
  SHOPLINE_APP_KEY: 'test-key',
  SHOPLINE_APP_URL: 'https://raised-stability-gaps-html.trycloudflare.com',
  SCOPES: 'read_products,write_products',
} as Pick<Env, 'SHOPLINE_APP_KEY' | 'SHOPLINE_APP_URL' | 'SCOPES'>;

describe('SHOPLINE authorization renewal response', () => {
  it('uses App Bridge headers and a safe body for an expired Admin session', async () => {
    const response = reauthorizationRequired('demo-shop', testEnv);

    expect(response.status).toBe(403);
    expect(response.headers.get('X-SHOPLINE-API-Request-Failure-Reauthorize')).toBe('1');
    expect(response.headers.get('X-SHOPLINE-API-Request-Failure-Reauthorize-Url')).toBe('/?uninstalled=true&embedded=1&appkey=test-key&handle=demo-shop&shop=demo-shop&host=demo-shop.myshopline.com&scope=read_products%2Cwrite_products&redirectUri=https%3A%2F%2Fraised-stability-gaps-html.trycloudflare.com%2Fapi%2Fauth%2Fcallback');
    await expect(response.json()).resolves.toEqual({ error: 'SHOPLINE authorization needs to be renewed.' });
  });
});
