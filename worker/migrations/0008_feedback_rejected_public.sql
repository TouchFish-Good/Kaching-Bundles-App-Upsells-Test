UPDATE feedback_requests
SET visibility = 'public',
    hidden_reason = NULL,
    hidden_at = NULL,
    hidden_by_admin_id = NULL
WHERE status = 'rejected'
  AND COALESCE(hidden_reason, '') <> 'withdrawn_by_submitter';
