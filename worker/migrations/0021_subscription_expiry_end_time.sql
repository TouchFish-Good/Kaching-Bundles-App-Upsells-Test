-- Use only the recorded platform deletion confirmation; never invent historical expiry times.
UPDATE quantity_breaks_campaigns AS c
SET campaign_json = json_set(campaign_json,
  '$.endsAt', (SELECT p.last_verified_at FROM quantity_breaks_publications p
    WHERE p.shop_handle = c.shop_handle AND p.campaign_id = c.id),
  '$.neverExpires', json('false')),
  revision = revision + 1
WHERE json_extract(campaign_json, '$.status') = 'paused'
  AND json_extract(campaign_json, '$.pauseReason') = 'subscription_expired'
  AND EXISTS (
    SELECT 1 FROM quantity_breaks_publications p
    WHERE p.shop_handle = c.shop_handle AND p.campaign_id = c.id
      AND p.state = 'entitlement_revoked' AND p.discount_id IS NULL
      AND p.state_reason = 'subscription_expired'
      AND strftime('%s', p.last_verified_at) IS NOT NULL
      AND (json_extract(c.campaign_json, '$.endsAt') IS NOT p.last_verified_at
        OR json_extract(c.campaign_json, '$.neverExpires') IS NOT 0)
  );
