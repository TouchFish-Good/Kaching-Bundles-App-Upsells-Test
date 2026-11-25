import { hmacBase64, hmacHex, timingSafeEqual } from '../crypto';
import type { Env } from '../env';

export type VerifiedGdprWebhook = {
  webhookId: string; kind: 'customer_redact' | 'merchant_redact'; storeId: string; shopDomain: string; customerIdDigest?: string;
};

export class GdprWebhookError extends Error {
  constructor(readonly code: 'INVALID_SIGNATURE' | 'INVALID_WEBHOOK') { super(code); }
}

export async function verifyGdprWebhook(request: Request, env: Env, expectedTopic: 'customers/redact' | 'merchants/redact'): Promise<VerifiedGdprWebhook> {
  const raw = await request.text();
  const received = request.headers.get('X-Shopline-Hmac-Sha256') ?? '';
  const [hex, base64] = await Promise.all([hmacHex(env.SHOPLINE_APP_SECRET, raw), hmacBase64(env.SHOPLINE_APP_SECRET, raw)]);
  if (!received || (!timingSafeEqual(received, hex) && !timingSafeEqual(received, base64))) throw new GdprWebhookError('INVALID_SIGNATURE');
  const topic = request.headers.get('X-Shopline-Topic');
  const webhookId = request.headers.get('X-Shopline-Webhook-Id') ?? '';
  const storeId = request.headers.get('X-Shopline-Shop-Id') ?? '';
  const shopDomain = request.headers.get('X-Shopline-Shop-Domain') ?? '';
  if (topic !== expectedTopic || !/^[A-Za-z0-9_-]{1,128}$/.test(webhookId) || !/^\d{1,128}$/.test(storeId) || !/^[a-z0-9][a-z0-9.-]{0,252}$/i.test(shopDomain)) throw new GdprWebhookError('INVALID_WEBHOOK');
  if (expectedTopic === 'merchants/redact') return { webhookId, kind: 'merchant_redact', storeId, shopDomain };
  let body: Record<string, unknown>;
  try { body = JSON.parse(raw) as Record<string, unknown>; } catch { throw new GdprWebhookError('INVALID_WEBHOOK'); }
  const customerId = typeof body.customer_id === 'string' || typeof body.customer_id === 'number' ? String(body.customer_id) : '';
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(customerId)) throw new GdprWebhookError('INVALID_WEBHOOK');
  return { webhookId, kind: 'customer_redact', storeId, shopDomain, customerIdDigest: await hmacHex(env.SHOPLINE_APP_SECRET, customerId) };
}
