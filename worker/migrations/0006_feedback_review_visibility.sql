ALTER TABLE feedback_requests ADD COLUMN reviewed_at TEXT;

UPDATE feedback_requests
SET visibility = 'hidden', hidden_reason = COALESCE(hidden_reason, 'awaiting_review')
WHERE status = 'pending'
  AND visibility = 'public'
  AND COALESCE(hidden_reason, '') <> 'withdrawn_by_submitter';

CREATE INDEX IF NOT EXISTS idx_feedback_author_visible
  ON feedback_requests (submitter_store_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_feedback_public_reviewed
  ON feedback_requests (visibility, status, created_at DESC, id DESC);
