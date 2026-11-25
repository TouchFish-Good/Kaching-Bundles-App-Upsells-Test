import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AuthContext } from '../src/auth/session';
import type { Env } from '../src/env';
import { registerInstallationWebhook } from '../src/services/webhooks';

const callbackUrl = 'https://raised-stability-gaps-html.trycloudflare.com/api/webhooks';
const requiredTopics = ['apps/installed_uninstalled', 'appsubscription/create', 'appsubscription/paid', 'appsubscription/expiration'];

afterEach(() => vi.unstubAllGlobals());

describe('SHOPLINE subscription webhook registration', () => {
  it('lists existing webhooks and registers only the required callback topics that are missing', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'GET') {
        return Response.json({ webhooks: [
          { id: 'uninstall', topic: 'apps/installed_uninstalled', address: callbackUrl },
          { id: 'paid', topic: 'appsubscription/paid', address: callbackUrl },
        ] });
      }
      return Response.json({ webhook: { id: crypto.randomUUID() } }, { status: 201 });
    });
    vi.stubGlobal('fetch', fetcher);

    const result = await registerInstallationWebhook(
      { handle: 'demo', accessToken: 'access', scope: 'write_discounts' } as AuthContext,
      { SHOPLINE_APP_URL: 'https://raised-stability-gaps-html.trycloudflare.com' } as Env,
    );

    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('/webhooks.json'), expect.objectContaining({ method: 'GET' }));
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('Accept')).toBe('application/json');
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('User-Agent')).toBe('SHOPLINE-Quantity-Breaks-App/1.0');
    const created = fetcher.mock.calls
      .filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST')
      .map(([, init]) => JSON.parse(String((init as RequestInit).body)).webhook);
    expect(created.map((webhook) => webhook.topic).sort()).toEqual(['appsubscription/create', 'appsubscription/expiration']);
    expect(created).toEqual(expect.arrayContaining([
      expect.objectContaining({ address: callbackUrl, api_version: 'v20260901', format: 'json' }),
    ]));
    expect(result).toEqual({ createdTopics: ['appsubscription/create', 'appsubscription/expiration'] });
    expect(requiredTopics).toContain('appsubscription/paid');
  });
});
