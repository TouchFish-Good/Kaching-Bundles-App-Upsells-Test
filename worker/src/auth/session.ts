import { hmacHex, timingSafeEqual } from '../crypto';
import { D1SessionStore, type ShoplineSession } from '../db/sessions';
import { currentTime, type Env } from '../env';
import { readTokenExpiry } from '../services/shopline-oauth';
import { reauthorizationRequired } from './reauthorization';

export type AuthContext = { handle: string; accessToken: string; scope: string };
class InactiveInstallationError extends Error {
  constructor() { super('SHOPLINE installation is not active'); }
}

export class ShoplineTokenRefreshError extends Error {
  constructor(readonly status: number) {
    super(`SHOPLINE token refresh failed: ${status}`);
    this.name = 'ShoplineTokenRefreshError';
  }
}

function requiresReauthorization(error: unknown): error is ShoplineTokenRefreshError {
  return error instanceof ShoplineTokenRefreshError && (error.status === 401 || error.status === 403);
}

function decode(value: string): string {
  return decodeURIComponent(escape(atob(value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '='))));
}

function hexToBase64Url(value: string): string {
  const bytes = value.match(/.{2}/g)?.map((part) => Number.parseInt(part, 16)) ?? [];
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function parseJwt(token: string): { encodedHeader: string; encodedPayload: string; signature: string; header: Record<string, unknown>; payload: Record<string, unknown> } {
  const [encodedHeader, encodedPayload, signature] = token.split('.');
  if (!encodedHeader || !encodedPayload || !signature) throw new Error('Invalid session token');
  const header = JSON.parse(decode(encodedHeader)) as Record<string, unknown>;
  const payload = JSON.parse(decode(encodedPayload)) as Record<string, unknown>;
  return { encodedHeader, encodedPayload, signature, header, payload };
}

async function verifyJwt(token: string, env: Env): Promise<{ handle: string; appKey: string }> {
  const parsed = parseJwt(token);
  if (parsed.header.alg !== 'HS256') throw new Error('Invalid session token');
  const audiences = typeof parsed.payload.aud === 'string'
    ? [parsed.payload.aud]
    : Array.isArray(parsed.payload.aud) ? parsed.payload.aud.filter((value): value is string => typeof value === 'string') : [];
  const appKey = audiences.includes(env.SHOPLINE_APP_KEY) ? env.SHOPLINE_APP_KEY : '';
  const handle = typeof parsed.payload.handle === 'string' ? parsed.payload.handle : '';
  const exp = typeof parsed.payload.exp === 'number' ? parsed.payload.exp : 0;
  if (appKey !== env.SHOPLINE_APP_KEY || !handle || exp <= Math.floor(currentTime(env) / 1000)) throw new Error('Invalid session token');
  const expected = await hmacHex(btoa(env.SHOPLINE_APP_SECRET), `${parsed.encodedHeader}.${parsed.encodedPayload}`);
  if (!timingSafeEqual(hexToBase64Url(expected), parsed.signature)) throw new Error('Invalid session token');
  return { handle, appKey };
}

async function refreshSession(session: ShoplineSession, env: Env): Promise<ShoplineSession> {
  const timestamp = String(currentTime(env));
  const response = await fetch(`https://${session.handle}.myshopline.com/admin/oauth/token/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', appkey: env.SHOPLINE_APP_KEY, timestamp, sign: await hmacHex(env.SHOPLINE_APP_SECRET, timestamp) },
    body: '',
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new ShoplineTokenRefreshError(response.status);
  const responseBody = await response.json() as Record<string, unknown>;
  const payload = responseBody.data && typeof responseBody.data === 'object' && !Array.isArray(responseBody.data)
    ? responseBody.data as Record<string, unknown>
    : responseBody;
  const accessToken = typeof payload.access_token === 'string' ? payload.access_token : typeof payload.accessToken === 'string' ? payload.accessToken : '';
  if (!accessToken) throw new Error('SHOPLINE token refresh returned no access token');
  const refreshToken = typeof payload.refresh_token === 'string' ? payload.refresh_token : typeof payload.refreshToken === 'string' ? payload.refreshToken : session.refreshToken;
  const expiresAt = readTokenExpiry(payload);
  return { ...session, accessToken, refreshToken, expiresAt };
}

export async function withFreshAccessToken(handle: string, env: Env, options: { force?: boolean } = {}): Promise<AuthContext> {
  const store = new D1SessionStore(env.DB, env.TOKEN_ENCRYPTION_KEY);
  const session = await store.get(handle);
  if (!session || !session.installed) throw new InactiveInstallationError();
  if (!options.force && Date.parse(session.expiresAt) > currentTime(env) + 5 * 60 * 1000) return { handle, accessToken: session.accessToken, scope: session.scope };

  const owner = crypto.randomUUID();
  const acquired = await env.DB.prepare(`INSERT INTO token_refresh_locks (shop_handle, owner, expires_at) VALUES (?, ?, ?) ON CONFLICT(shop_handle) DO UPDATE SET owner = excluded.owner, expires_at = excluded.expires_at WHERE token_refresh_locks.expires_at < ?`).bind(handle, owner, currentTime(env) + 30_000, currentTime(env)).run();
  if ((acquired.meta.changes ?? 0) === 1) {
    try {
      // Another request may have finished between the initial read and our lock.
      const latest = await store.get(handle);
      if (!latest || !latest.installed) throw new InactiveInstallationError();
      if ((latest.accessToken !== session.accessToken || latest.expiresAt !== session.expiresAt) && Date.parse(latest.expiresAt) > currentTime(env)) {
        return { handle, accessToken: latest.accessToken, scope: latest.scope };
      }
      const fresh = await refreshSession(latest, env);
      if (!(await store.updateRefreshed(latest, fresh))) throw new Error('SHOPLINE installation changed during token refresh');
      return { handle, accessToken: fresh.accessToken, scope: fresh.scope };
    } finally {
      await env.DB.prepare('DELETE FROM token_refresh_locks WHERE shop_handle = ? AND owner = ?').bind(handle, owner).run();
    }
  }

  const waitUntil = Date.now() + 10_000;
  for (let attempt = 0; attempt < 100 && Date.now() < waitUntil; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const updated = await store.get(handle);
    if (!updated || !updated.installed) throw new InactiveInstallationError();
    const changed = updated.accessToken !== session.accessToken || updated.expiresAt !== session.expiresAt;
    if (changed && Date.parse(updated.expiresAt) > currentTime(env)) return { handle, accessToken: updated.accessToken, scope: updated.scope };
  }
  throw new Error('SHOPLINE token refresh is still in progress');
}

export async function requireShoplineSession(request: Request, env: Env): Promise<AuthContext | Response> {
  const header = request.headers.get('Authorization') ?? '';
  if (!header.startsWith('Bearer ')) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { handle } = await verifyJwt(header.slice(7), env);
    try {
      return await withFreshAccessToken(handle, env);
    } catch (error) {
      if (requiresReauthorization(error)) return reauthorizationRequired(handle, env);
      if (error instanceof InactiveInstallationError) return Response.json({ error: 'Unauthorized' }, { status: 401 });
      return Response.json({ error: 'SHOPLINE token refresh is temporarily unavailable.', code: 'TOKEN_REFRESH_UNAVAILABLE' }, { status: 503, headers: { 'Retry-After': '1' } });
    }
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
