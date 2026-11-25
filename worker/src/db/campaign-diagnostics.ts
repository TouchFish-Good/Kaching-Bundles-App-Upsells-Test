import { validDiagnosticResponseBody } from '../observability/diagnostic-response';

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export type CampaignDiagnosticEventType = 'shopline_api' | 'worker_error' | 'campaign_pause' | 'campaign_platform_delete' | 'campaign_read';
export type CampaignDiagnosticOutcome = 'success' | 'failure' | 'uncertain';

export type CampaignDiagnosticInput = {
  traceId: string;
  workerName: string;
  eventType: CampaignDiagnosticEventType;
  outcome: CampaignDiagnosticOutcome;
  storeId?: string;
  shopHandle?: string;
  campaignId?: string;
  upstreamService?: string;
  upstreamPath?: string;
  upstreamStatus?: number;
  upstreamRequestId?: string;
  upstreamResponseCode?: string;
  upstreamResponseMessage?: string;
  upstreamResponseBody?: string;
  errorCode?: string;
  durationMs?: number;
  occurredAt?: string;
  expiresAt?: number;
};

export type CampaignDiagnosticItem = {
  id: string;
  traceId: string;
  workerName: string;
  storeId: string | null;
  shopHandle: string | null;
  campaignId: string | null;
  eventType: CampaignDiagnosticEventType;
  outcome: CampaignDiagnosticOutcome;
  upstreamService: string | null;
  upstreamPath: string | null;
  upstreamStatus: number | null;
  upstreamRequestId: string | null;
  upstreamResponseCode: string | null;
  upstreamResponseMessage: string | null;
  upstreamResponseBody: string | null;
  errorCode: string | null;
  durationMs: number | null;
  occurredAt: string;
};

export type CampaignDiagnosticFilters = {
  traceId?: string;
  storeId?: string;
  shopHandle?: string;
  campaignId?: string;
  eventType?: CampaignDiagnosticEventType;
  outcome?: CampaignDiagnosticOutcome;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
};

type DiagnosticRow = {
  id: string;
  trace_id: string;
  worker_name: string;
  store_id: string | null;
  shop_handle: string | null;
  campaign_id: string | null;
  event_type: CampaignDiagnosticEventType;
  outcome: CampaignDiagnosticOutcome;
  upstream_service: string | null;
  upstream_path: string | null;
  upstream_status: number | null;
  upstream_request_id: string | null;
  upstream_response_code: string | null;
  upstream_response_message: string | null;
  upstream_response_body: string | null;
  error_code: string | null;
  duration_ms: number | null;
  occurred_at: string;
};

function optionalText(value: string | undefined, maximum = 512): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maximum) : null;
}

function responseCode(value: string | undefined): string | null {
  const code = optionalText(value, 128);
  return code && /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(code) ? code : null;
}

function responseMessage(value: string | undefined): string | null {
  const message = optionalText(value, 512);
  return message && !/(?:authorization|cookie|access[_ -]?token|refresh[_ -]?token|bearer\s+\S+|password|secret)/i.test(message) ? message : null;
}

function occurredAt(input: string | undefined, now: number): string {
  if (input && Number.isFinite(Date.parse(input))) return new Date(input).toISOString();
  return new Date(now).toISOString();
}

function toItem(row: DiagnosticRow): CampaignDiagnosticItem {
  return {
    id: row.id,
    traceId: row.trace_id,
    workerName: row.worker_name,
    storeId: row.store_id,
    shopHandle: row.shop_handle,
    campaignId: row.campaign_id,
    eventType: row.event_type,
    outcome: row.outcome,
    upstreamService: row.upstream_service,
    upstreamPath: row.upstream_path,
    upstreamStatus: row.upstream_status,
    upstreamRequestId: row.upstream_request_id,
    upstreamResponseCode: row.upstream_response_code,
    upstreamResponseMessage: row.upstream_response_message,
    upstreamResponseBody: row.upstream_response_body,
    errorCode: row.error_code,
    durationMs: row.duration_ms,
    occurredAt: row.occurred_at,
  };
}

export class D1CampaignDiagnostics {
  constructor(private readonly database: D1Database, private readonly clock: () => number = Date.now) {}

  async record(input: CampaignDiagnosticInput): Promise<void> {
    const now = this.clock();
    const at = occurredAt(input.occurredAt, now);
    const defaultExpiry = Date.parse(at) + RETENTION_MS;
    const expiresAt = Number.isFinite(input.expiresAt) ? Math.floor(input.expiresAt!) : defaultExpiry;
    const upstreamStatus = Number.isInteger(input.upstreamStatus) && input.upstreamStatus! >= 100 && input.upstreamStatus! <= 599
      ? input.upstreamStatus : null;
    const durationMs = Number.isInteger(input.durationMs) && input.durationMs! >= 0 ? input.durationMs : null;

    await this.database.prepare(`INSERT INTO campaign_diagnostic_events (
      id, trace_id, worker_name, store_id, shop_handle, campaign_id, event_type, outcome,
      upstream_service, upstream_path, upstream_status, upstream_request_id, upstream_response_code, upstream_response_message, upstream_response_body, error_code, duration_ms, occurred_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        crypto.randomUUID(), input.traceId, input.workerName, optionalText(input.storeId, 128), optionalText(input.shopHandle, 255), optionalText(input.campaignId, 255),
        input.eventType, input.outcome, optionalText(input.upstreamService, 128), optionalText(input.upstreamPath, 1024), upstreamStatus,
        optionalText(input.upstreamRequestId, 512), responseCode(input.upstreamResponseCode), responseMessage(input.upstreamResponseMessage), validDiagnosticResponseBody(input.upstreamResponseBody), optionalText(input.errorCode, 128), durationMs, at, expiresAt,
      ).run();
  }

  async list(filters: CampaignDiagnosticFilters = {}): Promise<{ items: CampaignDiagnosticItem[]; total: number }> {
    const predicates: string[] = [];
    const bindings: (string | number)[] = [];
    const add = (column: string, value: string | undefined) => {
      if (!value) return;
      predicates.push(`${column} = ?`);
      bindings.push(value);
    };
    add('trace_id', filters.traceId);
    add('store_id', filters.storeId);
    add('shop_handle', filters.shopHandle);
    add('campaign_id', filters.campaignId);
    add('event_type', filters.eventType);
    add('outcome', filters.outcome);
    if (filters.from) { predicates.push('occurred_at >= ?'); bindings.push(filters.from); }
    if (filters.to) { predicates.push('occurred_at <= ?'); bindings.push(filters.to); }
    const where = predicates.length ? ` WHERE ${predicates.join(' AND ')}` : '';
    const count = await this.database.prepare(`SELECT COUNT(*) AS total FROM campaign_diagnostic_events${where}`).bind(...bindings).first<{ total: number }>();
    const limit = Math.min(100, Math.max(1, Math.floor(filters.limit ?? 50)));
    const offset = Math.max(0, Math.floor(filters.offset ?? 0));
    const rows = await this.database.prepare(`SELECT id, trace_id, worker_name, store_id, shop_handle, campaign_id, event_type, outcome,
      upstream_service, upstream_path, upstream_status, upstream_request_id, upstream_response_code, upstream_response_message, upstream_response_body, error_code, duration_ms, occurred_at
      FROM campaign_diagnostic_events${where} ORDER BY occurred_at DESC, id DESC LIMIT ? OFFSET ?`)
      .bind(...bindings, limit, offset).all<DiagnosticRow>();
    return { items: rows.results.map(toItem), total: Number(count?.total ?? 0) };
  }

  async purgeExpired(now = this.clock()): Promise<number> {
    const result = await this.database.prepare('DELETE FROM campaign_diagnostic_events WHERE expires_at <= ?').bind(now).run();
    return result.meta.changes ?? 0;
  }
}
