CREATE TABLE quantity_breaks_publications_owner_next (
  shop_handle TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('idle', 'publishing', 'activating', 'updating', 'active', 'pausing', 'paused', 'unpublishing', 'deleting', 'removed', 'entitlement_revoked', 'missing', 'needs_reconciliation')),
  discount_id TEXT,
  platform_node_id TEXT,
  owner TEXT,
  resume_status TEXT CHECK (resume_status IS NULL OR resume_status IN ('active', 'scheduled')),
  last_verified_at TEXT,
  state_reason TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (shop_handle, campaign_id)
);

INSERT INTO quantity_breaks_publications_owner_next
  (shop_handle, campaign_id, state, discount_id, platform_node_id, owner, resume_status, last_verified_at, state_reason, updated_at)
SELECT p.shop_handle, p.campaign_id, p.state, p.discount_id, p.platform_node_id, p.owner,
  CASE WHEN json_extract(c.campaign_json, '$.status') IN ('active', 'scheduled') THEN json_extract(c.campaign_json, '$.status') ELSE NULL END,
  p.last_verified_at, p.state_reason, p.updated_at
FROM quantity_breaks_publications p
LEFT JOIN quantity_breaks_campaigns c ON c.shop_handle = p.shop_handle AND c.id = p.campaign_id;

DROP TABLE quantity_breaks_publications;
ALTER TABLE quantity_breaks_publications_owner_next RENAME TO quantity_breaks_publications;
CREATE INDEX idx_publications_shop_state ON quantity_breaks_publications (shop_handle, state);
