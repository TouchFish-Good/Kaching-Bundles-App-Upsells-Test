ALTER TABLE feedback_comments ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public'
  CHECK (visibility IN ('public', 'hidden'));
ALTER TABLE feedback_comments ADD COLUMN deleted_at TEXT;
ALTER TABLE feedback_comments ADD COLUMN deleted_by_admin_id TEXT;
ALTER TABLE feedback_comments ADD COLUMN deletion_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_feedback_comments_visibility
  ON feedback_comments (request_id, visibility, created_at ASC, id ASC);
