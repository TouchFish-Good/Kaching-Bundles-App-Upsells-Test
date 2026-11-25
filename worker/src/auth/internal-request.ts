import { hmacHex, timingSafeEqual } from '../crypto';
import { currentTime, type Env } from '../env';
import { isTraceId } from '../observability/trace';

export async function authorizeInternalRequest(request: Request, env: Env): Promise<boolean> {
  const timestamp = request.headers.get('x-admin-timestamp') ?? '';
  const nonce = request.headers.get('x-admin-nonce') ?? '';
  const signature = request.headers.get('x-admin-signature') ?? '';
  const traceId = request.headers.get('x-trace-id') ?? '';
  const now = currentTime(env);
  if (!env.ADMIN_INTERNAL_SECRET || !/^\d{13}$/.test(timestamp) || Math.abs(now - Number(timestamp)) > 60_000 || !/^[A-Za-z0-9-]{8,128}$/.test(nonce) || !/^[a-f0-9]{64}$/i.test(signature) || !isTraceId(traceId)) return false;
  const url = new URL(request.url);
  const expected = await hmacHex(env.ADMIN_INTERNAL_SECRET, `${request.method}\n${url.pathname}${url.search}\n${timestamp}\n${nonce}\n${traceId}`);
  if (!timingSafeEqual(signature, expected)) return false;
  const result = await env.DB.batch([
    env.DB.prepare('DELETE FROM internal_request_nonces WHERE expires_at <= ?').bind(now),
    env.DB.prepare('INSERT INTO internal_request_nonces (nonce, expires_at) VALUES (?, ?) ON CONFLICT(nonce) DO NOTHING').bind(nonce, now + 60_000),
  ]);
  return (result[1].meta.changes ?? 0) === 1;
}
