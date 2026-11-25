import { env } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';

import { registerInstallationWebhook } from '../src/services/webhooks';
import type { AuthContext } from '../src/auth/session';
import type { Env } from '../src/env';

describe('SHOPLINE webhook registration', () => {
  it('registers the uninstall webhook at the Worker callback URL', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ webhook: { id: 'webhook-1' } }), { status: 201 }));
    vi.stubGlobal('fetch', fetcher);
    const workerEnv = { ...(env as Env), SHOPLINE_APP_URL: 'https://raised-stability-gaps-html.trycloudflare.com' } as Env;
    await registerInstallationWebhook({ handle: 'demo', accessToken: 'access', scope: 'write_discounts' } as AuthContext, workerEnv);
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('/webhooks.json'), expect.objectContaining({ method: 'POST', body: expect.stringContaining('https://raised-stability-gaps-html.trycloudflare.com/api/webhooks') }));
  });

  it('rejects a response without a confirmed webhook id', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 201 })));
    await expect(registerInstallationWebhook({ handle: 'demo', accessToken: 'access', scope: '' }, { ...(env as Env), SHOPLINE_APP_URL: 'https://raised-stability-gaps-html.trycloudflare.com' } as Env)).rejects.toThrow('webhook');
  });
});
