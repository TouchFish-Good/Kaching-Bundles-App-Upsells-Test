CREATE TABLE quantity_breaks_publications_next (
  shop_handle TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('idle', 'publishing', 'activating', 'updating', 'active', 'pausing', 'paused', 'unpublishing', 'entitlement_revoked', 'missing', 'needs_reconciliation')),
  discount_id TEXT,
  owner TEXT,
  last_verified_at TEXT,
  state_reason TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (shop_handle, campaign_id)
);

INSERT INTO quantity_breaks_publications_next
  (shop_handle, campaign_id, state, discount_id, owner, last_verified_at, state_reason, updated_at)
SELECT
  shop_handle,
  campaign_id,
  CASE state WHEN 'unpublishing' THEN 'needs_reconciliation' ELSE state END,
  discount_id,
  owner,
  NULL,
  CASE state WHEN 'unpublishing' THEN 'legacy_unpublishing' ELSE NULL END,
  updated_at
FROM quantity_breaks_publications;

DROP TABLE quantity_breaks_publications;

ALTER TABLE quantity_breaks_publications_next RENAME TO quantity_breaks_publications;

CREATE INDEX idx_publications_shop_state
  ON quantity_breaks_publications (shop_handle, state);
