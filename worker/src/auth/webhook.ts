import { hmacHex, timingSafeEqual } from '../crypto';
import type { Env } from '../env';

export async function verifyWebhook(request: Request, env: Env): Promise<{ handle: string; topic: string; webhookId: string; body: unknown }> {
  const rawBody = await request.text();
  const received = request.headers.get('X-Shopline-Hmac-Sha256');
  const expected = await hmacHex(env.SHOPLINE_APP_SECRET, rawBody);
  if (!received || !timingSafeEqual(received, expected)) throw new Error('Invalid webhook signature');

  const body = JSON.parse(rawBody) as Record<string, unknown>;
  const handle = typeof body.handle === 'string' ? body.handle : '';
  const topic = request.headers.get('X-Shopline-Topic') ?? (typeof body.topic === 'string' ? body.topic : 'apps/installed_uninstalled');
  const webhookId = request.headers.get('X-Shopline-Webhook-Id') ?? (typeof body.webhook_id === 'string' ? body.webhook_id : typeof body.id === 'string' ? body.id : '');
  if (!handle || !webhookId) throw new Error('Invalid webhook body');
  return { handle, topic, webhookId, body };
}
