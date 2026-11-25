CREATE TABLE IF NOT EXISTS feedback_requests (
  id TEXT PRIMARY KEY,
  submitter_store_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 100),
  content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 5000),
  normalized_title TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'in_progress', 'released', 'rejected')),
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'hidden')),
  hidden_reason TEXT,
  vote_count INTEGER NOT NULL DEFAULT 0 CHECK (vote_count >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  hidden_at TEXT,
  hidden_by_admin_id TEXT
);
CREATE TABLE IF NOT EXISTS feedback_votes (
  request_id TEXT NOT NULL REFERENCES feedback_requests(id) ON DELETE RESTRICT,
  store_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (request_id, store_id)
);
CREATE TABLE IF NOT EXISTS feedback_submission_keys (
  store_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_id TEXT NOT NULL REFERENCES feedback_requests(id) ON DELETE RESTRICT,
  content_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (store_id, idempotency_key)
);
CREATE TABLE IF NOT EXISTS feedback_status_history (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES feedback_requests(id) ON DELETE RESTRICT,
  previous_status TEXT,
  next_status TEXT NOT NULL CHECK (next_status IN ('pending', 'approved', 'in_progress', 'released', 'rejected')),
  public_note TEXT,
  changed_by_admin_id TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS feedback_replies (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES feedback_requests(id) ON DELETE RESTRICT,
  content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 5000),
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'hidden')),
  author_service TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS feedback_comments (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES feedback_requests(id) ON DELETE RESTRICT,
  author_store_id TEXT NOT NULL,
  author_handle_snapshot TEXT NOT NULL,
  is_anonymous INTEGER NOT NULL CHECK (is_anonymous IN (0, 1)),
  content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 2000),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS feedback_comment_attachments (
  id TEXT PRIMARY KEY,
  comment_id TEXT NOT NULL REFERENCES feedback_comments(id) ON DELETE RESTRICT,
  object_key TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/svg+xml')),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 5242880),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS feedback_rate_limits (
  rate_limit_key TEXT PRIMARY KEY,
  window_started_at INTEGER NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count >= 0),
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS feedback_admin_audit_logs (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES feedback_requests(id) ON DELETE RESTRICT,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_service TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_feedback_public_newest ON feedback_requests (visibility, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_public_status_newest ON feedback_requests (visibility, status, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_public_votes ON feedback_requests (visibility, vote_count DESC, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_comments_request_created ON feedback_comments (request_id, created_at ASC, id ASC);
CREATE INDEX IF NOT EXISTS idx_feedback_attachments_comment ON feedback_comment_attachments (comment_id, id ASC);
CREATE INDEX IF NOT EXISTS idx_feedback_replies_public ON feedback_replies (request_id, visibility, created_at ASC, id ASC);
CREATE INDEX IF NOT EXISTS idx_feedback_rate_limits_expires ON feedback_rate_limits (expires_at);
CREATE TRIGGER IF NOT EXISTS feedback_votes_insert_count AFTER INSERT ON feedback_votes
BEGIN UPDATE feedback_requests SET vote_count = vote_count + 1 WHERE id = NEW.request_id; END;
CREATE TRIGGER IF NOT EXISTS feedback_votes_delete_count AFTER DELETE ON feedback_votes
BEGIN UPDATE feedback_requests SET vote_count = CASE WHEN vote_count > 0 THEN vote_count - 1 ELSE 0 END WHERE id = OLD.request_id; END;
