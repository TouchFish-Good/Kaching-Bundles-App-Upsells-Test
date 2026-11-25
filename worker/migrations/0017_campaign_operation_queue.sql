CREATE TABLE IF NOT EXISTS quantity_breaks_campaign_operation_batches (
  id TEXT PRIMARY KEY,
  shop_handle TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('delete', 'replace_activate', 'replace_update')),
  state TEXT NOT NULL CHECK (state IN ('queued', 'running', 'completed', 'failed')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS quantity_breaks_campaign_operations (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES quantity_breaks_campaign_operation_batches(id) ON DELETE CASCADE,
  shop_handle TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('delete', 'replace_activate', 'replace_update')),
  expected_revision INTEGER NOT NULL CHECK (expected_revision >= 0),
  candidate_json TEXT,
  state TEXT NOT NULL CHECK (state IN ('queued', 'running', 'retrying', 'succeeded', 'failed', 'requires_pause')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  lease_expires_at INTEGER,
  next_attempt_at INTEGER NOT NULL,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_campaign_operations_due ON quantity_breaks_campaign_operations (state, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_campaign_operations_shop_state ON quantity_breaks_campaign_operations (shop_handle, state);
CREATE INDEX IF NOT EXISTS idx_campaign_operations_batch ON quantity_breaks_campaign_operations (batch_id, created_at);
