ALTER TABLE feedback_requests ADD COLUMN submitter_handle_snapshot TEXT NOT NULL DEFAULT '';
ALTER TABLE feedback_requests ADD COLUMN is_anonymous INTEGER NOT NULL DEFAULT 0 CHECK (is_anonymous IN (0, 1));
