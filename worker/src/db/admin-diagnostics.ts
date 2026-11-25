import { D1ApplicationRequestEvents } from './application-request-events';

export async function recordAdminError(
  database: D1Database,
  input: { storeId?: string; kind: string; code: string; at: string; traceId?: string },
): Promise<void> {
  await new D1ApplicationRequestEvents(database).recordError({
    source: 'worker', operation: input.kind, code: input.code, severity: 'error', traceId: input.traceId ?? crypto.randomUUID(), storeId: input.storeId, occurredAt: input.at,
  });
}
