-- Development/test-only helper: creates ONE pending submission for Review.
-- Run in the Supabase SQL editor as an administrator. It does not insert rows
-- when no assigned task without a submission is available.

WITH candidate AS (
  SELECT t.id AS task_id, t.collector_id
  FROM public.tasks t
  WHERE t.collector_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.submissions s WHERE s.task_id = t.id)
  ORDER BY t.created_at DESC
  LIMIT 1
), inserted AS (
  INSERT INTO public.submissions (
    task_id, collector_id, waste_type, quantity_estimate, collector_notes,
    submitted_at, review_status
  )
  SELECT task_id, collector_id, 'Mixed Municipal', '25',
    'Development-only Review test submission.', now(), 'pending'
  FROM candidate
  RETURNING task_id
), updated AS (
  UPDATE public.tasks t
  SET status = 'submitted', updated_at = now()
  FROM inserted i
  WHERE t.id = i.task_id
  RETURNING t.id
)
INSERT INTO public.task_events (task_id, event_type, previous_status, new_status, actor_type, metadata)
SELECT id, 'submission_received', 'assigned', 'submitted', 'system',
  jsonb_build_object('message', 'Development Review test submission created')
FROM updated;

-- Verify after approving/rejecting in the Review UI:
-- SELECT s.review_status, t.status, e.event_type, e.new_status, e.metadata
-- FROM submissions s JOIN tasks t ON t.id = s.task_id
-- LEFT JOIN task_events e ON e.task_id = t.id
-- ORDER BY e.created_at DESC;
