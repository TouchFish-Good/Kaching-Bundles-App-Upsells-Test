import type { Env } from '../env';

const REAUTHORIZE = 'X-SHOPLINE-API-Request-Failure-Reauthorize';
const REAUTHORIZE_URL = 'X-SHOPLINE-API-Request-Failure-Reauthorize-Url';

export function reauthorizationRequired(handle: string, env: Pick<Env, 'SHOPLINE_APP_KEY' | 'SHOPLINE_APP_URL' | 'SCOPES'>): Response {
  const params = new URLSearchParams({
    uninstalled: 'true',
    embedded: '1',
    appkey: env.SHOPLINE_APP_KEY,
    handle,
    shop: handle,
    host: `${handle}.myshopline.com`,
    scope: env.SCOPES,
    redirectUri: `${env.SHOPLINE_APP_URL}/api/auth/callback`,
  });
  return Response.json(
    { error: 'SHOPLINE authorization needs to be renewed.' },
    {
      status: 403,
      headers: {
        [REAUTHORIZE]: '1',
        [REAUTHORIZE_URL]: `/?${params.toString()}`,
      },
    },
  );
}
