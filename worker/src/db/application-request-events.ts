import { eventFingerprint, sanitizeObservableCode, sanitizeObservableMessage, sanitizePath } from '../observability/sanitize';

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
type Outcome = 'success' | 'client_error' | 'server_error';
type Source = 'worker' | 'browser';

function occurredAt(value: string | undefined, now: number): string {
  return value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : new Date(now).toISOString();
}

function outcome(status: number): Outcome {
  return status >= 500 ? 'server_error' : status >= 400 ? 'client_error' : 'success';
}

function optionalText(value: string | undefined, maximum: number): string | null {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, maximum) : null;
}

export type ApplicationRequestInput = { traceId: string; storeId?: string; shopHandle?: string; route: string; method: string; httpStatus: number; durationMs: number; occurredAt?: string };
export type ApplicationErrorInput = { source: Source; operation: string; code?: string; severity: 'error' | 'warning'; traceId: string; storeId?: string; route?: string; method?: string; httpStatus?: number; message?: string; relatedTraceId?: string; occurredAt?: string };

export class D1ApplicationRequestEvents {
  constructor(private readonly database: D1Database, private readonly clock: () => number = Date.now) {}

  async recordRequest(input: ApplicationRequestInput): Promise<void> {
    const now = this.clock();
    const at = occurredAt(input.occurredAt, now);
    const status = Number.isInteger(input.httpStatus) && input.httpStatus >= 100 && input.httpStatus <= 599 ? input.httpStatus : 500;
    const duration = Number.isInteger(input.durationMs) && input.durationMs >= 0 ? input.durationMs : 0;
    const route = sanitizePath(input.route) ?? '/';
    await this.database.prepare(`INSERT INTO application_request_events (id, trace_id, store_id, shop_handle, route, method, http_status, duration_ms, outcome, occurred_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      crypto.randomUUID(), input.traceId, optionalText(input.storeId, 128), optionalText(input.shopHandle, 255), route, input.method.toUpperCase().slice(0, 16), status, duration, outcome(status), at, Date.parse(at) + RETENTION_MS,
    ).run();
  }

  async recordError(input: ApplicationErrorInput): Promise<void> {
    const now = this.clock();
    const at = occurredAt(input.occurredAt, now);
    const route = sanitizePath(input.route);
    const message = sanitizeObservableMessage(input.message);
    const code = sanitizeObservableCode(input.code);
    const fingerprint = await eventFingerprint({ source: input.source, operation: input.operation, route, code, message });
    await this.database.prepare(`INSERT INTO admin_error_events (store_id, kind, severity, code, trace_id, occurred_at, source, operation, route, method, http_status, message, fingerprint, related_trace_id, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      optionalText(input.storeId, 128), input.operation, input.severity, code, input.traceId, at, input.source, input.operation, route,
      optionalText(input.method, 16)?.toUpperCase() ?? null, Number.isInteger(input.httpStatus) && input.httpStatus! >= 100 && input.httpStatus! <= 599 ? input.httpStatus : null,
      message, fingerprint, optionalText(input.relatedTraceId, 64), Date.parse(at) + RETENTION_MS,
    ).run();
  }

  async purgeExpired(now = this.clock()): Promise<{ errors: number; requests: number }> {
    const [errors, requests] = await this.database.batch([
      this.database.prepare('DELETE FROM admin_error_events WHERE expires_at IS NOT NULL AND expires_at <= ?').bind(now),
      this.database.prepare('DELETE FROM application_request_events WHERE expires_at <= ?').bind(now),
    ]);
    return { errors: errors.meta.changes ?? 0, requests: requests.meta.changes ?? 0 };
  }
}
