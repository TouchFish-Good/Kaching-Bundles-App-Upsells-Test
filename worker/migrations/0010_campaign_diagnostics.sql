CREATE TABLE IF NOT EXISTS campaign_diagnostic_events (
  id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL,
  worker_name TEXT NOT NULL,
  store_id TEXT,
  shop_handle TEXT,
  campaign_id TEXT,
  event_type TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure', 'uncertain')),
  upstream_service TEXT,
  upstream_path TEXT,
  upstream_status INTEGER,
  upstream_request_id TEXT,
  error_code TEXT,
  duration_ms INTEGER,
  occurred_at TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_campaign_diagnostics_trace_id
  ON campaign_diagnostic_events (trace_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_diagnostics_store_occurred_at
  ON campaign_diagnostic_events (store_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_diagnostics_campaign_occurred_at
  ON campaign_diagnostic_events (campaign_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_diagnostics_expires_at
  ON campaign_diagnostic_events (expires_at);
