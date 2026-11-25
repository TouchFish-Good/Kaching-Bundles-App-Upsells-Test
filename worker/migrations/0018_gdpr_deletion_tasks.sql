CREATE TABLE IF NOT EXISTS gdpr_deletion_tasks (
  webhook_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('customer_redact', 'merchant_redact')),
  store_id TEXT NOT NULL,
  shop_domain TEXT,
  customer_id_digest TEXT,
  state TEXT NOT NULL CHECK (state IN ('pending', 'running', 'completed', 'retrying', 'failed')),
  received_at INTEGER NOT NULL,
  deadline_at INTEGER NOT NULL,
  completed_at INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at INTEGER NOT NULL,
  last_error_code TEXT
);

CREATE INDEX IF NOT EXISTS idx_gdpr_deletion_tasks_due ON gdpr_deletion_tasks (state, next_attempt_at, deadline_at);
CREATE INDEX IF NOT EXISTS idx_gdpr_deletion_tasks_store ON gdpr_deletion_tasks (store_id, received_at DESC);
