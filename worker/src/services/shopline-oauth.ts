import { hmacHex } from '../crypto';
import type { Env } from '../env';

type TokenResponse = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  scope: string;
  storeId?: string;
};

function tokenValue(body: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === 'string' && value) return value;
  }
  throw new Error(`SHOPLINE token response is missing ${keys[0]}`);
}

function optionalTokenValue(body: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === 'string') return value;
  }
  return '';
}

function tokenPayload(body: Record<string, unknown>): Record<string, unknown> {
  const data = body.data;
  return data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : body;
}

export function readTokenExpiry(body: Record<string, unknown>): string {
  const expiresAt = tokenValue(body, 'expiresAt', 'expireTime', 'expires_at');
  if (Number.isNaN(Date.parse(expiresAt))) throw new Error('SHOPLINE token response has an invalid expiry');
  return expiresAt;
}

export async function exchangeCode(handle: string, code: string, env: Env): Promise<TokenResponse> {
  const timestamp = String(Date.now());
  const body = JSON.stringify({ code });
  const response = await fetch(`https://${handle}.myshopline.com/admin/oauth/token/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      appkey: env.SHOPLINE_APP_KEY,
      timestamp,
      sign: await hmacHex(env.SHOPLINE_APP_SECRET, body + timestamp),
    },
    body,
  });
  if (!response.ok) throw new Error(`SHOPLINE token exchange failed: ${response.status}`);
  const responseBody = await response.json() as Record<string, unknown>;
  if (typeof responseBody.code === 'number' && responseBody.code !== 200) throw new Error('SHOPLINE token exchange was rejected');
  const payload = tokenPayload(responseBody);
  return {
    accessToken: tokenValue(payload, 'accessToken', 'access_token'),
    refreshToken: optionalTokenValue(payload, 'refreshToken', 'refresh_token'),
    expiresAt: readTokenExpiry(payload),
    scope: typeof payload.scope === 'string' ? payload.scope : env.SCOPES,
    ...(typeof payload.storeId === 'string' ? { storeId: payload.storeId } : {}),
  };
}
