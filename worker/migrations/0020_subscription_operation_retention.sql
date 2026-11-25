CREATE INDEX IF NOT EXISTS idx_subscription_operations_retention
ON quantity_breaks_subscription_operations (state, updated_at);
