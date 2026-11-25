import { createHmac, timingSafeEqual } from 'crypto';

export function signRequest(secret: string, method: string, path: string, timestamp: string, nonce: string): string {
  return createHmac('sha256', secret).update(`${method.toUpperCase()}\n${path}\n${timestamp}\n${nonce}`).digest('hex');
}

export function verifyRequest(
  secret: string, method: string, path: string,
  headers: { timestamp?: string; nonce?: string; signature?: string },
  now: number, seen: Set<string>,
): boolean {
  const { timestamp, nonce, signature } = headers;
  if (!secret || !timestamp || !nonce || !signature || !/^\d{13}$/.test(timestamp) || !/^[a-zA-Z0-9-]{8,128}$/.test(nonce)) return false;
  if (Math.abs(now - Number(timestamp)) > 60000 || seen.has(nonce)) return false;
  const expected = Buffer.from(signRequest(secret, method, path, timestamp, nonce), 'hex');
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
  const received = Buffer.from(signature, 'hex');
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return false;
  seen.add(nonce);
  return true;
}
