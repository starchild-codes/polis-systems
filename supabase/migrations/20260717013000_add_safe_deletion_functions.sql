-- Safe administrative deletion for operational records.
-- Proof-of-work is intentionally never removed as a side effect of deleting a task.

CREATE OR REPLACE FUNCTION public.delete_task_safely(p_task_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only administrators can permanently delete tasks';
  END IF;

  IF EXISTS (SELECT 1 FROM public.submissions WHERE task_id = p_task_id) THEN
    RAISE EXCEPTION 'This task has a proof-of-work submission and cannot be deleted. Keep the record or remove the submission through an approved retention process.';
  END IF;

  DELETE FROM public.tasks WHERE id = p_task_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found or already deleted';
  END IF;

  -- task_events and whatsapp_sessions referencing the task use ON DELETE CASCADE.
  -- No storage bucket is declared by this project; reference_photo_path is metadata only.
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_collector_safely(p_collector_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only administrators can permanently delete collectors';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tasks
    WHERE collector_id = p_collector_id
      AND status IN ('assigned', 'accepted', 'in_progress', 'submitted')
  ) THEN
    RAISE EXCEPTION 'This collector has active assigned tasks. Reassign or remove those tasks before deleting the collector.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.submissions WHERE collector_id = p_collector_id) THEN
    RAISE EXCEPTION 'This collector has proof-of-work history and cannot be deleted while those submissions are retained.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.whatsapp_sessions
    WHERE collector_id = p_collector_id
      AND conversation_state <> 'idle'
  ) THEN
    RAISE EXCEPTION 'This collector has an active WhatsApp session. End the session before deleting the collector.';
  END IF;

  -- Idle sessions have no in-progress conversation and can be removed explicitly.
  DELETE FROM public.whatsapp_sessions
  WHERE collector_id = p_collector_id AND conversation_state = 'idle';

  DELETE FROM public.collectors WHERE id = p_collector_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Collector not found or already deleted';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_task_safely(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_collector_safely(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_task_safely(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_collector_safely(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_submission_safely(
  p_submission_id uuid,
  p_reviewer_id uuid,
  p_decision public.review_status,
  p_rejection_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task_id uuid;
  v_task_status public.task_status;
BEGIN
  IF p_reviewer_id IS DISTINCT FROM auth.uid()
    OR NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator')) THEN
    RAISE EXCEPTION 'Only the signed-in operator or administrator may review a submission';
  END IF;

  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Review decision must be approved or rejected';
  END IF;
  IF p_decision = 'rejected' AND COALESCE(btrim(p_rejection_reason), '') = '' THEN
    RAISE EXCEPTION 'A rejection reason is required';
  END IF;

  SELECT s.task_id, t.status INTO v_task_id, v_task_status
  FROM public.submissions s
  JOIN public.tasks t ON t.id = s.task_id
  WHERE s.id = p_submission_id AND s.review_status = 'pending'
  FOR UPDATE OF s, t;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission was not found or has already been reviewed';
  END IF;

  UPDATE public.submissions
  SET review_status = p_decision,
      reviewed_by = p_reviewer_id,
      reviewed_at = now(),
      rejection_reason = CASE WHEN p_decision = 'rejected' THEN btrim(p_rejection_reason) ELSE NULL END
  WHERE id = p_submission_id;

  UPDATE public.tasks
  SET status = CASE WHEN p_decision = 'approved' THEN 'approved'::public.task_status ELSE 'rejected'::public.task_status END,
      updated_at = now()
  WHERE id = v_task_id;

  INSERT INTO public.task_events (task_id, event_type, previous_status, new_status, actor_type, actor_id, metadata)
  VALUES (
    v_task_id,
    CASE WHEN p_decision = 'approved' THEN 'submission_approved' ELSE 'submission_rejected' END,
    v_task_status,
    CASE WHEN p_decision = 'approved' THEN 'approved'::public.task_status ELSE 'rejected'::public.task_status END,
    'operator', p_reviewer_id,
    jsonb_build_object(
      'message', CASE WHEN p_decision = 'approved' THEN 'Submission approved by operator' ELSE 'Submission rejected: ' || btrim(p_rejection_reason) END,
      'submission_id', p_submission_id,
      'rejection_reason', CASE WHEN p_decision = 'rejected' THEN btrim(p_rejection_reason) ELSE NULL END
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.review_submission_safely(uuid, uuid, public.review_status, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_submission_safely(uuid, uuid, public.review_status, text) TO authenticated;
