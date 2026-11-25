const initialMigration = `
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
CREATE TABLE IF NOT EXISTS quantity_breaks_staged_updates (
  shop_handle TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  candidate_json TEXT NOT NULL,
  expected_revision INTEGER NOT NULL,
  discount_id TEXT NOT NULL,
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
  synced_at TEXT,
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
  occurred_at TEXT NOT NULL,
  source TEXT,
  operation TEXT,
  route TEXT,
  method TEXT,
  http_status INTEGER,
  message TEXT,
  fingerprint TEXT,
  related_trace_id TEXT,
  expires_at INTEGER
);
CREATE TABLE IF NOT EXISTS application_request_events (
  id TEXT PRIMARY KEY, trace_id TEXT NOT NULL, store_id TEXT, shop_handle TEXT, route TEXT NOT NULL, method TEXT NOT NULL,
  http_status INTEGER NOT NULL, duration_ms INTEGER NOT NULL, outcome TEXT NOT NULL CHECK (outcome IN ('success', 'client_error', 'server_error')),
  occurred_at TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS campaign_diagnostic_events (
  id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL,
  worker_name TEXT NOT NULL,
  store_id TEXT,
  shop_handle TEXT,
  campaign_id TEXT,
  event_type TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure', 'uncertain')),
  upstream_service TEXT,
  upstream_path TEXT,
  upstream_status INTEGER,
  upstream_request_id TEXT,
  upstream_response_code TEXT,
  upstream_response_message TEXT,
  upstream_response_body TEXT,
  error_code TEXT,
  duration_ms INTEGER,
  occurred_at TEXT NOT NULL,
  expires_at INTEGER NOT NULL
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
CREATE TABLE IF NOT EXISTS quantity_breaks_entitlements (
  app_key TEXT NOT NULL,
  shop_handle TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('unknown', 'trial', 'active', 'grace', 'review_pending', 'inactive')),
  feature_keys_json TEXT NOT NULL,
  active_subscription_id TEXT,
  active_spu_key TEXT,
  valid_from INTEGER,
  valid_until INTEGER,
  next_valid_from INTEGER,
  next_valid_until INTEGER,
  next_display_from INTEGER,
  next_display_until INTEGER,
  grace_until INTEGER,
  auto_recurring INTEGER,
  absence_confirmations INTEGER NOT NULL DEFAULT 0 CHECK (absence_confirmations >= 0),
  last_verified_at INTEGER NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  PRIMARY KEY (app_key, shop_handle)
);
CREATE TABLE IF NOT EXISTS quantity_breaks_subscription_snapshots (
  app_key TEXT NOT NULL,
  shop_handle TEXT NOT NULL,
  subscription_json TEXT,
  last_verified_at INTEGER,
  last_attempt_at INTEGER NOT NULL,
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
CREATE INDEX IF NOT EXISTS idx_campaigns_shop_updated_at ON quantity_breaks_campaigns (shop_handle, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_publications_shop_state ON quantity_breaks_publications (shop_handle, state);
CREATE INDEX IF NOT EXISTS idx_shop_locks_expires_at ON quantity_breaks_shop_locks (expires_at);
CREATE INDEX IF NOT EXISTS idx_collection_conflicts_shop_checked_at ON quantity_breaks_collection_conflicts (shop_handle, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_events_received_at ON webhook_events (received_at);
CREATE INDEX IF NOT EXISTS idx_admin_error_events_occurred_at ON admin_error_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_error_events_store_occurred_at ON admin_error_events (store_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_error_events_source_occurred_at ON admin_error_events (source, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_error_events_fingerprint_occurred_at ON admin_error_events (fingerprint, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_error_events_expires_at ON admin_error_events (expires_at);
CREATE INDEX IF NOT EXISTS idx_application_request_events_trace_id ON application_request_events (trace_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_application_request_events_store_occurred_at ON application_request_events (store_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_application_request_events_route_occurred_at ON application_request_events (route, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_application_request_events_status_occurred_at ON application_request_events (http_status, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_application_request_events_expires_at ON application_request_events (expires_at);
CREATE INDEX IF NOT EXISTS idx_campaign_diagnostics_trace_id ON campaign_diagnostic_events (trace_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_diagnostics_store_occurred_at ON campaign_diagnostic_events (store_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_diagnostics_campaign_occurred_at ON campaign_diagnostic_events (campaign_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_diagnostics_expires_at ON campaign_diagnostic_events (expires_at);
CREATE INDEX IF NOT EXISTS idx_token_refresh_locks_expires_at ON token_refresh_locks (expires_at);
CREATE INDEX IF NOT EXISTS idx_public_rate_limits_expires_at ON public_rate_limits (expires_at);
CREATE INDEX IF NOT EXISTS idx_internal_request_nonces_expires_at ON internal_request_nonces (expires_at);
CREATE INDEX IF NOT EXISTS idx_entitlements_state ON quantity_breaks_entitlements (app_key, state);
CREATE INDEX IF NOT EXISTS idx_subscription_operations_due ON quantity_breaks_subscription_operations (state, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_subscription_operations_retention ON quantity_breaks_subscription_operations (state, updated_at);
CREATE INDEX IF NOT EXISTS idx_subscription_operations_shop ON quantity_breaks_subscription_operations (app_key, shop_handle);
CREATE INDEX IF NOT EXISTS idx_campaign_operations_due ON quantity_breaks_campaign_operations (state, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_campaign_operations_shop_state ON quantity_breaks_campaign_operations (shop_handle, state);
CREATE INDEX IF NOT EXISTS idx_campaign_operations_batch ON quantity_breaks_campaign_operations (batch_id, created_at);
CREATE TABLE IF NOT EXISTS feedback_requests (
  id TEXT PRIMARY KEY, submitter_store_id TEXT NOT NULL, submitter_handle_snapshot TEXT NOT NULL DEFAULT '', is_anonymous INTEGER NOT NULL DEFAULT 0 CHECK (is_anonymous IN (0, 1)), title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 100), content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 1000), normalized_title TEXT NOT NULL, content_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'in_progress', 'released', 'rejected')), visibility TEXT NOT NULL DEFAULT 'hidden' CHECK (visibility IN ('public', 'hidden')), hidden_reason TEXT, reviewed_at TEXT,
  vote_count INTEGER NOT NULL DEFAULT 0 CHECK (vote_count >= 0), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, hidden_at TEXT, hidden_by_admin_id TEXT
);
CREATE TABLE IF NOT EXISTS feedback_votes (request_id TEXT NOT NULL REFERENCES feedback_requests(id) ON DELETE RESTRICT, store_id TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (request_id, store_id));
CREATE TABLE IF NOT EXISTS feedback_submission_keys (store_id TEXT NOT NULL, idempotency_key TEXT NOT NULL, request_id TEXT NOT NULL REFERENCES feedback_requests(id) ON DELETE RESTRICT, content_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, PRIMARY KEY (store_id, idempotency_key));
CREATE TABLE IF NOT EXISTS feedback_status_history (id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES feedback_requests(id) ON DELETE RESTRICT, previous_status TEXT, next_status TEXT NOT NULL CHECK (next_status IN ('pending', 'approved', 'in_progress', 'released', 'rejected')), public_note TEXT, changed_by_admin_id TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS feedback_replies (id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES feedback_requests(id) ON DELETE RESTRICT, content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 5000), visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'hidden')), author_service TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS feedback_comments (id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES feedback_requests(id) ON DELETE RESTRICT, author_store_id TEXT NOT NULL, author_handle_snapshot TEXT NOT NULL, is_anonymous INTEGER NOT NULL CHECK (is_anonymous IN (0, 1)), content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 400), created_at TEXT NOT NULL, visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'hidden')), deleted_at TEXT, deleted_by_admin_id TEXT, deletion_reason TEXT);
CREATE TABLE IF NOT EXISTS feedback_comment_attachments (id TEXT PRIMARY KEY, comment_id TEXT NOT NULL REFERENCES feedback_comments(id) ON DELETE RESTRICT, object_key TEXT NOT NULL UNIQUE, original_filename TEXT NOT NULL, content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/svg+xml')), byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 5242880), created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS feedback_rate_limits (rate_limit_key TEXT PRIMARY KEY, window_started_at INTEGER NOT NULL, request_count INTEGER NOT NULL CHECK (request_count >= 0), expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS feedback_admin_audit_logs (id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES feedback_requests(id) ON DELETE RESTRICT, target_type TEXT NOT NULL, target_id TEXT NOT NULL, action TEXT NOT NULL, actor_service TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_feedback_public_newest ON feedback_requests (visibility, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_public_status_newest ON feedback_requests (visibility, status, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_public_votes ON feedback_requests (visibility, vote_count DESC, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_author_visible ON feedback_requests (submitter_store_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_public_reviewed ON feedback_requests (visibility, status, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_comments_request_created ON feedback_comments (request_id, created_at ASC, id ASC);
CREATE INDEX IF NOT EXISTS idx_feedback_comments_visibility ON feedback_comments (request_id, visibility, created_at ASC, id ASC);
CREATE INDEX IF NOT EXISTS idx_feedback_attachments_comment ON feedback_comment_attachments (comment_id, id ASC);
CREATE INDEX IF NOT EXISTS idx_feedback_replies_public ON feedback_replies (request_id, visibility, created_at ASC, id ASC);
CREATE INDEX IF NOT EXISTS idx_feedback_rate_limits_expires ON feedback_rate_limits (expires_at);
CREATE TABLE IF NOT EXISTS gdpr_deletion_tasks (
  webhook_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('customer_redact', 'merchant_redact')),
  store_id TEXT NOT NULL,
  shop_domain TEXT,
  handle_snapshot TEXT,
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
`;

export async function applyMigrations(database: D1Database): Promise<void> {
  const statements = initialMigration
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean)
    .map((statement) => database.prepare(statement));

  await database.batch(statements);
  const columns = await database.prepare('PRAGMA table_info(feedback_requests)').all<{ name: string }>();
  const names = new Set(columns.results.map((column) => column.name));
  const compatibility = [];
  const collectionColumns = await database.prepare('PRAGMA table_info(quantity_breaks_collection_conflicts)').all<{ name: string }>();
  if (!collectionColumns.results.some((column) => column.name === 'synced_at')) {
    compatibility.push(database.prepare('ALTER TABLE quantity_breaks_collection_conflicts ADD COLUMN synced_at TEXT'));
  }
  if (!names.has('submitter_handle_snapshot')) compatibility.push(database.prepare("ALTER TABLE feedback_requests ADD COLUMN submitter_handle_snapshot TEXT NOT NULL DEFAULT ''"));
  if (!names.has('is_anonymous')) compatibility.push(database.prepare('ALTER TABLE feedback_requests ADD COLUMN is_anonymous INTEGER NOT NULL DEFAULT 0 CHECK (is_anonymous IN (0, 1))'));
  if (!names.has('reviewed_at')) compatibility.push(database.prepare('ALTER TABLE feedback_requests ADD COLUMN reviewed_at TEXT'));
  const commentColumns = await database.prepare('PRAGMA table_info(feedback_comments)').all<{ name: string }>();
  const commentNames = new Set(commentColumns.results.map((column) => column.name));
  if (!commentNames.has('visibility')) compatibility.push(database.prepare("ALTER TABLE feedback_comments ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'hidden'))"));
  if (!commentNames.has('deleted_at')) compatibility.push(database.prepare('ALTER TABLE feedback_comments ADD COLUMN deleted_at TEXT'));
  if (!commentNames.has('deleted_by_admin_id')) compatibility.push(database.prepare('ALTER TABLE feedback_comments ADD COLUMN deleted_by_admin_id TEXT'));
  if (!commentNames.has('deletion_reason')) compatibility.push(database.prepare('ALTER TABLE feedback_comments ADD COLUMN deletion_reason TEXT'));
  const publicationColumns = await database.prepare('PRAGMA table_info(quantity_breaks_publications)').all<{ name: string }>();
  const publicationNames = new Set(publicationColumns.results.map((column) => column.name));
  if (!publicationNames.has('platform_node_id')) {
    compatibility.push(database.prepare('ALTER TABLE quantity_breaks_publications ADD COLUMN platform_node_id TEXT'));
  }
  if (!publicationNames.has('resume_status')) {
    compatibility.push(database.prepare("ALTER TABLE quantity_breaks_publications ADD COLUMN resume_status TEXT CHECK (resume_status IS NULL OR resume_status IN ('active', 'scheduled'))"));
  }
  const entitlementColumns = await database.prepare('PRAGMA table_info(quantity_breaks_entitlements)').all<{ name: string }>();
  const entitlementNames = new Set(entitlementColumns.results.map((column) => column.name));
  if (!entitlementNames.has('next_valid_from')) compatibility.push(database.prepare('ALTER TABLE quantity_breaks_entitlements ADD COLUMN next_valid_from INTEGER'));
  if (!entitlementNames.has('next_valid_until')) compatibility.push(database.prepare('ALTER TABLE quantity_breaks_entitlements ADD COLUMN next_valid_until INTEGER'));
  if (!entitlementNames.has('next_display_from')) compatibility.push(database.prepare('ALTER TABLE quantity_breaks_entitlements ADD COLUMN next_display_from INTEGER'));
  if (!entitlementNames.has('next_display_until')) compatibility.push(database.prepare('ALTER TABLE quantity_breaks_entitlements ADD COLUMN next_display_until INTEGER'));
  const diagnosticColumns = await database.prepare('PRAGMA table_info(campaign_diagnostic_events)').all<{ name: string }>();
  const diagnosticNames = new Set(diagnosticColumns.results.map((column) => column.name));
  if (!diagnosticNames.has('upstream_response_code')) compatibility.push(database.prepare('ALTER TABLE campaign_diagnostic_events ADD COLUMN upstream_response_code TEXT'));
  if (!diagnosticNames.has('upstream_response_message')) compatibility.push(database.prepare('ALTER TABLE campaign_diagnostic_events ADD COLUMN upstream_response_message TEXT'));
  if (!diagnosticNames.has('upstream_response_body')) compatibility.push(database.prepare('ALTER TABLE campaign_diagnostic_events ADD COLUMN upstream_response_body TEXT'));
  const errorColumns = await database.prepare('PRAGMA table_info(admin_error_events)').all<{ name: string }>();
  const errorNames = new Set(errorColumns.results.map((column) => column.name));
  const errorColumnsToAdd: Array<[string, string]> = [
    ['source', 'TEXT'], ['operation', 'TEXT'], ['route', 'TEXT'], ['method', 'TEXT'], ['http_status', 'INTEGER'], ['message', 'TEXT'],
    ['fingerprint', 'TEXT'], ['related_trace_id', 'TEXT'], ['expires_at', 'INTEGER'],
  ];
  for (const [name, definition] of errorColumnsToAdd) if (!errorNames.has(name)) compatibility.push(database.prepare(`ALTER TABLE admin_error_events ADD COLUMN ${name} ${definition}`));
  const gdprColumns = await database.prepare('PRAGMA table_info(gdpr_deletion_tasks)').all<{ name: string }>();
  if (!gdprColumns.results.some((column) => column.name === 'handle_snapshot')) compatibility.push(database.prepare('ALTER TABLE gdpr_deletion_tasks ADD COLUMN handle_snapshot TEXT'));
  if (compatibility.length) await database.batch(compatibility);
  if (!entitlementNames.has('next_display_from') || !entitlementNames.has('next_display_until')) {
    await database.prepare('UPDATE quantity_breaks_entitlements SET next_display_from = next_valid_from, next_display_until = next_valid_until').run();
  }
  await database.batch([
    database.prepare(`UPDATE quantity_breaks_campaigns AS c
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
  )`),
    database.prepare(`UPDATE feedback_requests
      SET visibility = 'hidden', hidden_reason = COALESCE(hidden_reason, 'awaiting_review')
      WHERE status = 'pending' AND visibility = 'public' AND COALESCE(hidden_reason, '') <> 'withdrawn_by_submitter'`),
    database.prepare(`UPDATE feedback_requests
      SET visibility = 'public', hidden_reason = NULL, hidden_at = NULL, hidden_by_admin_id = NULL
      WHERE status = 'rejected' AND COALESCE(hidden_reason, '') NOT IN ('withdrawn_by_submitter', 'owner_rejected_display')`),
    database.prepare(`CREATE TRIGGER IF NOT EXISTS feedback_votes_insert_count AFTER INSERT ON feedback_votes
      BEGIN UPDATE feedback_requests SET vote_count = vote_count + 1 WHERE id = NEW.request_id; END`),
    database.prepare(`CREATE TRIGGER IF NOT EXISTS feedback_votes_delete_count AFTER DELETE ON feedback_votes
      BEGIN UPDATE feedback_requests SET vote_count = CASE WHEN vote_count > 0 THEN vote_count - 1 ELSE 0 END WHERE id = OLD.request_id; END`),
    database.prepare('CREATE INDEX IF NOT EXISTS idx_feedback_comments_visibility ON feedback_comments (request_id, visibility, created_at ASC, id ASC)'),
  ]);
}
