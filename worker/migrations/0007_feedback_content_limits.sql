-- Existing comments can be longer than the new 400-character authoring limit.
-- Keep them intact; the Worker validation enforces the new limit for every new comment.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE feedback_votes_next AS SELECT * FROM feedback_votes;
CREATE TABLE feedback_submission_keys_next AS SELECT * FROM feedback_submission_keys;
CREATE TABLE feedback_status_history_next AS SELECT * FROM feedback_status_history;
CREATE TABLE feedback_replies_next AS SELECT * FROM feedback_replies;
CREATE TABLE feedback_comments_next AS SELECT * FROM feedback_comments;
CREATE TABLE feedback_comment_attachments_next AS SELECT * FROM feedback_comment_attachments;
CREATE TABLE feedback_admin_audit_logs_next AS SELECT * FROM feedback_admin_audit_logs;

DROP TRIGGER IF EXISTS feedback_votes_insert_count;
DROP TRIGGER IF EXISTS feedback_votes_delete_count;
DROP TABLE feedback_comment_attachments;
DROP TABLE feedback_votes;
DROP TABLE feedback_submission_keys;
DROP TABLE feedback_status_history;
DROP TABLE feedback_replies;
DROP TABLE feedback_comments;
DROP TABLE feedback_admin_audit_logs;

CREATE TABLE feedback_requests_next (
  id TEXT PRIMARY KEY,
  submitter_store_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 100),
  content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 1000),
  normalized_title TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'in_progress', 'released', 'rejected')),
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'hidden')),
  hidden_reason TEXT,
  vote_count INTEGER NOT NULL DEFAULT 0 CHECK (vote_count >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  hidden_at TEXT,
  hidden_by_admin_id TEXT,
  submitter_handle_snapshot TEXT NOT NULL DEFAULT '',
  is_anonymous INTEGER NOT NULL DEFAULT 0 CHECK (is_anonymous IN (0, 1)),
  reviewed_at TEXT
);

INSERT INTO feedback_requests_next (
  id, submitter_store_id, title, content, normalized_title, content_hash, status,
  visibility, hidden_reason, vote_count, created_at, updated_at, hidden_at,
  hidden_by_admin_id, submitter_handle_snapshot, is_anonymous, reviewed_at
)
SELECT
  id, submitter_store_id, title, content, normalized_title, content_hash, status,
  visibility, hidden_reason, vote_count, created_at, updated_at, hidden_at,
  hidden_by_admin_id, submitter_handle_snapshot, is_anonymous, reviewed_at
FROM feedback_requests;

DROP TABLE feedback_requests;
ALTER TABLE feedback_requests_next RENAME TO feedback_requests;

CREATE TABLE feedback_votes (
  request_id TEXT NOT NULL REFERENCES feedback_requests(id) ON DELETE RESTRICT,
  store_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (request_id, store_id)
);
CREATE TABLE feedback_submission_keys (
  store_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_id TEXT NOT NULL REFERENCES feedback_requests(id) ON DELETE RESTRICT,
  content_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (store_id, idempotency_key)
);
CREATE TABLE feedback_status_history (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES feedback_requests(id) ON DELETE RESTRICT,
  previous_status TEXT,
  next_status TEXT NOT NULL CHECK (next_status IN ('pending', 'approved', 'in_progress', 'released', 'rejected')),
  public_note TEXT,
  changed_by_admin_id TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE feedback_replies (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES feedback_requests(id) ON DELETE RESTRICT,
  content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 5000),
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'hidden')),
  author_service TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE feedback_comments (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES feedback_requests(id) ON DELETE RESTRICT,
  author_store_id TEXT NOT NULL,
  author_handle_snapshot TEXT NOT NULL,
  is_anonymous INTEGER NOT NULL CHECK (is_anonymous IN (0, 1)),
  content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 2000),
  created_at TEXT NOT NULL
);
CREATE TABLE feedback_comment_attachments (
  id TEXT PRIMARY KEY,
  comment_id TEXT NOT NULL REFERENCES feedback_comments(id) ON DELETE RESTRICT,
  object_key TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/svg+xml')),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 5242880),
  created_at TEXT NOT NULL
);
CREATE TABLE feedback_admin_audit_logs (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES feedback_requests(id) ON DELETE RESTRICT,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_service TEXT NOT NULL,
  created_at TEXT NOT NULL
);

INSERT INTO feedback_votes SELECT * FROM feedback_votes_next;
INSERT INTO feedback_submission_keys SELECT * FROM feedback_submission_keys_next;
INSERT INTO feedback_status_history SELECT * FROM feedback_status_history_next;
INSERT INTO feedback_replies SELECT * FROM feedback_replies_next;
INSERT INTO feedback_comments SELECT * FROM feedback_comments_next;
INSERT INTO feedback_comment_attachments SELECT * FROM feedback_comment_attachments_next;
INSERT INTO feedback_admin_audit_logs SELECT * FROM feedback_admin_audit_logs_next;

DROP TABLE feedback_votes_next;
DROP TABLE feedback_submission_keys_next;
DROP TABLE feedback_status_history_next;
DROP TABLE feedback_replies_next;
DROP TABLE feedback_comments_next;
DROP TABLE feedback_comment_attachments_next;
DROP TABLE feedback_admin_audit_logs_next;

CREATE INDEX idx_feedback_public_newest ON feedback_requests (visibility, created_at DESC, id DESC);
CREATE INDEX idx_feedback_public_status_newest ON feedback_requests (visibility, status, created_at DESC, id DESC);
CREATE INDEX idx_feedback_public_votes ON feedback_requests (visibility, vote_count DESC, created_at DESC, id DESC);
CREATE INDEX idx_feedback_author_visible ON feedback_requests (submitter_store_id, created_at DESC, id DESC);
CREATE INDEX idx_feedback_public_reviewed ON feedback_requests (visibility, status, created_at DESC, id DESC);
CREATE INDEX idx_feedback_comments_request_created ON feedback_comments (request_id, created_at ASC, id ASC);
CREATE INDEX idx_feedback_attachments_comment ON feedback_comment_attachments (comment_id, id ASC);
CREATE INDEX idx_feedback_replies_public ON feedback_replies (request_id, visibility, created_at ASC, id ASC);

CREATE TRIGGER feedback_votes_insert_count AFTER INSERT ON feedback_votes
BEGIN
  UPDATE feedback_requests SET vote_count = vote_count + 1 WHERE id = NEW.request_id;
END;

CREATE TRIGGER feedback_votes_delete_count AFTER DELETE ON feedback_votes
BEGIN
  UPDATE feedback_requests
  SET vote_count = CASE WHEN vote_count > 0 THEN vote_count - 1 ELSE 0 END
  WHERE id = OLD.request_id;
END;
