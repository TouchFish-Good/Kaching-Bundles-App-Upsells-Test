CREATE TABLE IF NOT EXISTS quantity_breaks_entitlements (
  app_key TEXT NOT NULL,
  shop_handle TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('unknown', 'trial', 'active', 'grace', 'review_pending', 'inactive')),
  feature_keys_json TEXT NOT NULL,
  active_subscription_id TEXT,
  active_spu_key TEXT,
  valid_from INTEGER,
  valid_until INTEGER,
  grace_until INTEGER,
  auto_recurring INTEGER,
  absence_confirmations INTEGER NOT NULL DEFAULT 0 CHECK (absence_confirmations >= 0),
  last_verified_at INTEGER NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  PRIMARY KEY (app_key, shop_handle)
);

CREATE TABLE IF NOT EXISTS quantity_breaks_trial_ledger (
  app_key TEXT NOT NULL,
  shop_handle TEXT NOT NULL,
  trial_consumed_at INTEGER NOT NULL,
  trial_subscription_id TEXT NOT NULL,
  source_event_id TEXT,
  PRIMARY KEY (app_key, shop_handle)
);

CREATE TABLE IF NOT EXISTS quantity_breaks_subscription_orders (
  out_trade_no TEXT PRIMARY KEY,
  app_key TEXT NOT NULL,
  shop_handle TEXT NOT NULL,
  spu_key TEXT NOT NULL,
  sku_id TEXT NOT NULL,
  status TEXT NOT NULL,
  subscription_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS quantity_breaks_subscription_operations (
  operation_key TEXT PRIMARY KEY,
  app_key TEXT NOT NULL,
  shop_handle TEXT NOT NULL,
  entitlement_version INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('reconcile', 'pause_campaign', 'disable_storefront', 'resume_check')),
  state TEXT NOT NULL CHECK (state IN ('pending', 'running', 'succeeded', 'retrying', 'blocked', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at INTEGER NOT NULL,
  last_error TEXT,
  campaign_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_entitlements_state ON quantity_breaks_entitlements (app_key, state);
CREATE INDEX IF NOT EXISTS idx_subscription_operations_due ON quantity_breaks_subscription_operations (state, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_subscription_operations_shop ON quantity_breaks_subscription_operations (app_key, shop_handle);
