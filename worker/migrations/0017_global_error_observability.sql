ALTER TABLE admin_error_events ADD COLUMN source TEXT;
ALTER TABLE admin_error_events ADD COLUMN operation TEXT;
ALTER TABLE admin_error_events ADD COLUMN route TEXT;
ALTER TABLE admin_error_events ADD COLUMN method TEXT;
ALTER TABLE admin_error_events ADD COLUMN http_status INTEGER;
ALTER TABLE admin_error_events ADD COLUMN message TEXT;
ALTER TABLE admin_error_events ADD COLUMN fingerprint TEXT;
ALTER TABLE admin_error_events ADD COLUMN related_trace_id TEXT;
ALTER TABLE admin_error_events ADD COLUMN expires_at INTEGER;

CREATE TABLE IF NOT EXISTS application_request_events (
  id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL,
  store_id TEXT,
  shop_handle TEXT,
  route TEXT NOT NULL,
  method TEXT NOT NULL,
  http_status INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'client_error', 'server_error')),
  occurred_at TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_error_events_store_occurred_at ON admin_error_events (store_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_error_events_source_occurred_at ON admin_error_events (source, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_error_events_fingerprint_occurred_at ON admin_error_events (fingerprint, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_error_events_expires_at ON admin_error_events (expires_at);
CREATE INDEX IF NOT EXISTS idx_application_request_events_trace_id ON application_request_events (trace_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_application_request_events_store_occurred_at ON application_request_events (store_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_application_request_events_route_occurred_at ON application_request_events (route, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_application_request_events_status_occurred_at ON application_request_events (http_status, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_application_request_events_expires_at ON application_request_events (expires_at);
