CREATE TABLE IF NOT EXISTS quantity_breaks_subscription_snapshots (
  app_key TEXT NOT NULL,
  shop_handle TEXT NOT NULL,
  subscription_json TEXT,
  last_verified_at INTEGER,
  last_attempt_at INTEGER NOT NULL,
  PRIMARY KEY (app_key, shop_handle)
);
