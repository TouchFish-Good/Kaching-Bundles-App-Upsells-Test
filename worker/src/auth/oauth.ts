import { hmacHex, timingSafeEqual } from '../crypto';
import { D1SessionStore } from '../db/sessions';
import { currentTime, type Env } from '../env';
import { exchangeCode } from '../services/shopline-oauth';
import { registerInstallationWebhook } from '../services/webhooks';
import { fetchStoreId } from '../services/collection-publication';
import { recordAdminError } from '../db/admin-diagnostics';

const MAX_TIMESTAMP_DRIFT_MS = 10 * 60 * 1000;

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

async function authorizationFailure(env: Env, code: string): Promise<Response> {
  try { await recordAdminError(env.DB, { kind: 'oauth', code, at: new Date(currentTime(env)).toISOString() }); }
  catch { /* Diagnostics must not obscure the authorization response. */ }
  return jsonError('SHOPLINE authorization failed', 502);
}

function validHandle(handle: string | null): handle is string {
  return Boolean(handle && /^[a-z0-9][a-z0-9-]*$/i.test(handle));
}

function entryHandle(raw: string | null): string | null {
  if (!raw) return null;
  const value = raw.trim().replace(/^https?:\/\//i, '').split('/')[0].replace(/\.myshopline\.com$/i, '');
  return validHandle(value) ? value : null;
}

function embeddedOAuthUrl(env: Env, origin: string, handle: string): string {
  const destination = new URL(env.SHOPLINE_APP_URL || origin);
  destination.search = '';
  destination.hash = '';
  destination.searchParams.set('uninstalled', 'true');
  destination.searchParams.set('embedded', '1');
  destination.searchParams.set('appkey', env.SHOPLINE_APP_KEY);
  destination.searchParams.set('handle', handle);
  destination.searchParams.set('shop', handle);
  destination.searchParams.set('host', `${handle}.myshopline.com`);
  destination.searchParams.set('scope', env.SCOPES);
  destination.searchParams.set('redirectUri', `${env.SHOPLINE_APP_URL}/api/auth/callback`);
  return destination.toString();
}

export async function beginOAuthFromAppEntry(request: Request, env: Env): Promise<Response | null> {
  if (request.method !== 'GET') return null;
  const url = new URL(request.url);
  if (!['/', '/quantity-breaks', '/quantity-breaks/'].includes(url.pathname)) return null;

  const handle = entryHandle(url.searchParams.get('handle') ?? url.searchParams.get('shop'));
  if (!handle) return null;
  const embedded = url.searchParams.get('embedded') === '1' || url.searchParams.has('lang');

  try {
    const installed = await env.DB.prepare(
      "SELECT 1 AS installed FROM shopline_sessions WHERE handle = ? AND installed = 1 LIMIT 1",
    ).bind(handle).first<{ installed: number }>();
    if (installed) {
      if (url.searchParams.get('uninstalled') === 'true') return Response.redirect(appHomeUrl(env, handle, url.searchParams.get('lang')), 302);
      return null;
    }
  } catch {
    // A temporary D1 failure must not be treated as an uninstalled store.
    return null;
  }

  if (embedded) {
    const handoffUrl = embeddedOAuthUrl(env, url.origin, handle);
    const handoffParams = new URL(handoffUrl).searchParams;
    if (url.searchParams.get('uninstalled') === 'true'
      && [...handoffParams].every(([key, value]) => url.searchParams.get(key) === value)) return null;
    return Response.redirect(handoffUrl, 302);
  }
  return Response.redirect(`${url.origin}/api/auth?handle=${encodeURIComponent(handle)}`, 302);
}

function appHomeUrl(env: Env, handle: string, lang: string | null): string {
  const destination = new URL(env.SHOPLINE_APP_URL);
  destination.search = '';
  destination.hash = '';
  destination.searchParams.set('appkey', env.SHOPLINE_APP_KEY);
  destination.searchParams.set('handle', handle);
  destination.searchParams.set('shop', handle);
  destination.searchParams.set('host', `${handle}.myshopline.com`);
  destination.searchParams.set('isFromAppListPage', '1');

  const locale = lang?.split(',').at(-1)?.trim();
  destination.searchParams.set('embedded', locale ? '1' : '0');
  if (locale) destination.searchParams.set('lang', locale);
  return destination.toString();
}

function signedPayload(request: Request): string {
  const params = new URL(request.url).searchParams;
  return [...params.entries()]
    .filter(([key]) => key !== 'sign')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}

async function verifySignedQuery(request: Request, env: Env): Promise<boolean> {
  const url = new URL(request.url);
  const received = url.searchParams.get('sign');
  const timestamp = Number(url.searchParams.get('timestamp'));
  if (!received || !Number.isFinite(timestamp) || Math.abs(currentTime(env) - timestamp) > MAX_TIMESTAMP_DRIFT_MS) return false;
  return timingSafeEqual(received, await hmacHex(env.SHOPLINE_APP_SECRET, signedPayload(request)));
}

export async function beginOAuth(request: Request, env: Env): Promise<Response> {
  const handle = new URL(request.url).searchParams.get('handle');
  if (!validHandle(handle)) return jsonError('Invalid SHOPLINE store handle', 400);

  const query = new URLSearchParams({
    appKey: env.SHOPLINE_APP_KEY,
    responseType: 'code',
    scope: env.SCOPES,
    redirectUri: `${env.SHOPLINE_APP_URL}/api/auth/callback`,
    customField: '',
  });
  return Response.redirect(`https://${handle}.myshopline.com/admin/oauth-web/#/oauth/authorize?${query}`, 302);
}

export async function finishOAuth(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const handle = url.searchParams.get('handle');
  const code = url.searchParams.get('code');
  if (!validHandle(handle) || !code || !(await verifySignedQuery(request, env))) return jsonError('Invalid OAuth callback', 400);

  let token;
  try {
    token = await exchangeCode(handle, code, env);
  } catch {
    return authorizationFailure(env, 'OAUTH_TOKEN_EXCHANGE_FAILED');
  }

  const authenticated = { handle, accessToken: token.accessToken, scope: token.scope };
  let storeId;
  try {
    storeId = await fetchStoreId(authenticated);
  } catch {
    return authorizationFailure(env, 'OAUTH_STORE_LOOKUP_FAILED');
  }

  try {
    const store = new D1SessionStore(env.DB, env.TOKEN_ENCRYPTION_KEY);
    const installedAt = new Date(currentTime(env)).toISOString();
    await store.upsert({ handle, storeId, accessToken: token.accessToken, refreshToken: token.refreshToken, scope: token.scope, expiresAt: token.expiresAt, installed: true });
    await store.recordInstallation({ storeId, handle, scope: token.scope, at: installedAt });
  } catch {
    return authorizationFailure(env, 'OAUTH_INSTALLATION_PERSIST_FAILED');
  }

  try {
    await registerInstallationWebhook(authenticated, env);
  } catch {
    console.error('SHOPLINE webhook registration failed after authorization');
  }
  return Response.redirect(appHomeUrl(env, handle, url.searchParams.get('lang')), 302);
}
