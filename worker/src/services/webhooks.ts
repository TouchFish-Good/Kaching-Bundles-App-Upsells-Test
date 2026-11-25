import type { AuthContext } from '../auth/session';
import type { Env } from '../env';
import { shoplineAdminHeaders } from './shopline-admin-request-headers';

const ADMIN_API_VERSION = 'v20260901';
const REQUIRED_WEBHOOK_TOPICS = [
  'apps/installed_uninstalled',
  'appsubscription/create',
  'appsubscription/paid',
  'appsubscription/expiration',
] as const;

type RegisteredWebhook = { topic?: unknown; address?: unknown };
type RegistrationResult = { createdTopics: string[] };

function callbackUrlFor(env: Env): string {
  return `${(env.SHOPLINE_APP_URL || 'https://app-test.vswwy.cn').replace(/\/+$/, '')}/api/webhooks`;
}

function registeredWebhooks(payload: unknown): RegisteredWebhook[] {
  if (!payload || typeof payload !== 'object') return [];
  const source = payload as { webhooks?: unknown; data?: unknown };
  const nested = source.webhooks && typeof source.webhooks === 'object' && !Array.isArray(source.webhooks)
    ? (source.webhooks as { data?: unknown }).data
    : null;
  const candidates = [source.webhooks, nested, source.data];
  const records = candidates.find(Array.isArray);
  return Array.isArray(records) ? records as RegisteredWebhook[] : [];
}

function webhookUrl(session: AuthContext): string {
  return `https://${session.handle}.myshopline.com/admin/openapi/${ADMIN_API_VERSION}/webhooks.json`;
}

export async function registerInstallationWebhook(session: AuthContext, env: Env): Promise<RegistrationResult> {
  const callbackUrl = callbackUrlFor(env);
  const headers = shoplineAdminHeaders(session.accessToken);
  const response = await fetch(webhookUrl(session), { method: 'GET', headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error('SHOPLINE webhook listing failed.');
  const existing = new Set(registeredWebhooks(data)
    .filter((webhook) => webhook.address === callbackUrl && typeof webhook.topic === 'string')
    .map((webhook) => webhook.topic));
  const createdTopics: string[] = [];

  for (const topic of REQUIRED_WEBHOOK_TOPICS) {
    if (existing.has(topic)) continue;
    const registration = await fetch(webhookUrl(session), {
      method: 'POST',
      headers,
      body: JSON.stringify({ webhook: { topic, address: callbackUrl, api_version: ADMIN_API_VERSION, format: 'json' } }),
    });
    const registrationData = await registration.json().catch(() => ({})) as { webhook?: { id?: string | number }; id?: string | number };
    const webhookId = registrationData.webhook?.id ?? registrationData.id;
    if (!registration.ok || (typeof webhookId !== 'string' && typeof webhookId !== 'number')) throw new Error('SHOPLINE webhook registration did not return a webhook ID.');
    createdTopics.push(topic);
  }
  return { createdTopics };
}
