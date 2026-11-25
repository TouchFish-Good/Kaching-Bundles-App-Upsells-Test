import { hmacHex } from '../crypto';
import type { Env } from '../env';

export async function deleteDeveloperAdminAudit(env: Env, input: { storeId: string; shopHandle: string | null }): Promise<void> {
  const path = '/internal/merchant-redaction/v1/audit-cleanup';
  const timestamp = String(env.now?.() ?? Date.now());
  const nonce = crypto.randomUUID();
  const traceId = crypto.randomUUID();
  const signature = await hmacHex(env.ADMIN_INTERNAL_SECRET, `POST\n${path}\n${timestamp}\n${nonce}\n${traceId}`);
  const response = await env.DEVELOPER_ADMIN.fetch(new Request(`https://developer-admin.internal${path}`, { method: 'POST', headers: {
    'content-type': 'application/json', 'x-admin-timestamp': timestamp, 'x-admin-nonce': nonce, 'x-trace-id': traceId, 'x-admin-signature': signature,
  }, body: JSON.stringify(input) }));
  if (!response.ok) throw new Error('ADMIN_AUDIT_CLEANUP_FAILED');
}
