CREATE TABLE IF NOT EXISTS shopline_sessions (
  handle TEXT PRIMARY KEY,
  store_id TEXT,
  access_token_ciphertext TEXT NOT NULL,
  refresh_token_ciphertext TEXT NOT NULL,
  scope TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  installed INTEGER NOT NULL CHECK (installed IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quantity_breaks_campaigns (
  shop_handle TEXT NOT NULL,
  id TEXT NOT NULL,
  campaign_json TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (shop_handle, id)
);

CREATE TABLE IF NOT EXISTS quantity_breaks_publications (
  shop_handle TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('idle', 'publishing', 'active', 'unpublishing', 'needs_reconciliation')),
  discount_id TEXT,
  owner TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (shop_handle, campaign_id)
);

CREATE TABLE IF NOT EXISTS quantity_breaks_shop_locks (
  shop_handle TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS quantity_breaks_collection_conflicts (
  shop_handle TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('clear', 'conflict', 'unknown')),
  campaign_ids_json TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  PRIMARY KEY (shop_handle, campaign_id)
);

CREATE TABLE IF NOT EXISTS quantity_breaks_translations (
  shop_handle TEXT NOT NULL,
  locale TEXT NOT NULL,
  copy_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (shop_handle, locale)
);

CREATE TABLE IF NOT EXISTS webhook_events (
  webhook_id TEXT PRIMARY KEY,
  shop_handle TEXT NOT NULL,
  topic TEXT NOT NULL,
  received_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_stores (
  store_id TEXT PRIMARY KEY,
  handle TEXT NOT NULL UNIQUE,
  scope TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('installed', 'uninstalled')),
  installed_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_installations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id TEXT NOT NULL,
  installed_at TEXT NOT NULL,
  uninstalled_at TEXT,
  UNIQUE (store_id, installed_at)
);

CREATE TABLE IF NOT EXISTS admin_error_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id TEXT,
  kind TEXT NOT NULL,
  severity TEXT NOT NULL,
  code TEXT NOT NULL,
  trace_id TEXT,
  occurred_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS token_refresh_locks (
  shop_handle TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS public_rate_limits (
  rate_limit_key TEXT PRIMARY KEY,
  window_started_at INTEGER NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count >= 0),
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS internal_request_nonces (
  nonce TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_campaigns_shop_updated_at
  ON quantity_breaks_campaigns (shop_handle, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_publications_shop_state
  ON quantity_breaks_publications (shop_handle, state);
CREATE INDEX IF NOT EXISTS idx_shop_locks_expires_at
  ON quantity_breaks_shop_locks (expires_at);
CREATE INDEX IF NOT EXISTS idx_collection_conflicts_shop_checked_at
  ON quantity_breaks_collection_conflicts (shop_handle, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_events_received_at
  ON webhook_events (received_at);
CREATE INDEX IF NOT EXISTS idx_admin_error_events_occurred_at
  ON admin_error_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_refresh_locks_expires_at
  ON token_refresh_locks (expires_at);
CREATE INDEX IF NOT EXISTS idx_public_rate_limits_expires_at
  ON public_rate_limits (expires_at);
CREATE INDEX IF NOT EXISTS idx_internal_request_nonces_expires_at
  ON internal_request_nonces (expires_at);
