CREATE TABLE quantity_breaks_publications_next (
  shop_handle TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('idle', 'publishing', 'updating', 'active', 'unpublishing', 'needs_reconciliation')),
  discount_id TEXT,
  owner TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (shop_handle, campaign_id)
);

INSERT INTO quantity_breaks_publications_next (shop_handle, campaign_id, state, discount_id, owner, updated_at)
  SELECT shop_handle, campaign_id, state, discount_id, owner, updated_at
  FROM quantity_breaks_publications;

DROP TABLE quantity_breaks_publications;

ALTER TABLE quantity_breaks_publications_next RENAME TO quantity_breaks_publications;

CREATE INDEX idx_publications_shop_state
  ON quantity_breaks_publications (shop_handle, state);

CREATE TABLE quantity_breaks_staged_updates (
  shop_handle TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  candidate_json TEXT NOT NULL,
  expected_revision INTEGER NOT NULL,
  discount_id TEXT NOT NULL,
  PRIMARY KEY (shop_handle, campaign_id)
);
