-- Stage 4: atomically review submissions and enqueue one WhatsApp outcome.
-- Message bodies and collector phone numbers are intentionally not stored.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'submissions_id_organization_key'
      AND conrelid = 'public.submissions'::regclass
  ) THEN
    ALTER TABLE public.submissions
      ADD CONSTRAINT submissions_id_organization_key UNIQUE (id, organization_id);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'submissions_rejection_reason_length_check'
      AND conrelid = 'public.submissions'::regclass
  ) THEN
    ALTER TABLE public.submissions
      ADD CONSTRAINT submissions_rejection_reason_length_check
      CHECK (
        rejection_reason IS NULL
        OR (char_length(btrim(rejection_reason)) BETWEEN 1 AND 500)
      );
  END IF;
END
$$;

CREATE TABLE public.whatsapp_review_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  collector_id uuid NOT NULL,
  task_id uuid NOT NULL,
  submission_id uuid NOT NULL,
  notification_type text NOT NULL
    CHECK (notification_type IN ('submission_approved', 'submission_rejected')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  twilio_message_sid text UNIQUE
    CHECK (twilio_message_sid IS NULL OR char_length(twilio_message_sid) <= 64),
  attempt_count integer NOT NULL DEFAULT 0
    CHECK (attempt_count BETWEEN 0 AND 5),
  last_error_code text
    CHECK (last_error_code IS NULL OR char_length(last_error_code) <= 64),
  claimed_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_review_notifications_id_organization_key
    UNIQUE (id, organization_id),
  CONSTRAINT whatsapp_review_notifications_submission_outcome_key
    UNIQUE (submission_id, notification_type),
  CONSTRAINT whatsapp_review_notifications_submission_organization_fkey
    FOREIGN KEY (submission_id, organization_id)
    REFERENCES public.submissions(id, organization_id) ON DELETE CASCADE,
  CONSTRAINT whatsapp_review_notifications_task_organization_fkey
    FOREIGN KEY (task_id, organization_id)
    REFERENCES public.tasks(id, organization_id) ON DELETE CASCADE,
  CONSTRAINT whatsapp_review_notifications_collector_organization_fkey
    FOREIGN KEY (collector_id, organization_id)
    REFERENCES public.collectors(id, organization_id) ON DELETE CASCADE
);

CREATE INDEX idx_whatsapp_review_notifications_delivery_queue
  ON public.whatsapp_review_notifications(status, created_at)
  WHERE status IN ('pending', 'failed');
CREATE INDEX idx_whatsapp_review_notifications_organization
  ON public.whatsapp_review_notifications(organization_id, created_at DESC);

ALTER TABLE public.whatsapp_review_notifications ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.review_submission_with_whatsapp_outbox(
  p_submission_id uuid,
  p_organization_id uuid,
  p_reviewer_id uuid,
  p_decision public.review_status,
  p_rejection_reason text DEFAULT NULL
)
RETURNS TABLE(result text, notification_id uuid, notification_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_submission public.submissions%ROWTYPE;
  target_task public.tasks%ROWTYPE;
  reviewer_role public.organization_role;
  normalized_reason text := nullif(btrim(coalesce(p_rejection_reason, '')), '');
  target_notification_id uuid;
  target_notification_status text;
  target_notification_type text;
BEGIN
  IF p_decision NOT IN ('approved'::public.review_status, 'rejected'::public.review_status) THEN
    RAISE EXCEPTION 'invalid_review_decision';
  END IF;
  IF p_decision = 'rejected'::public.review_status AND normalized_reason IS NULL THEN
    RAISE EXCEPTION 'rejection_reason_required';
  END IF;
  IF normalized_reason IS NOT NULL AND char_length(normalized_reason) > 500 THEN
    RAISE EXCEPTION 'rejection_reason_too_long';
  END IF;

  SELECT membership.role INTO reviewer_role
  FROM public.organization_members AS membership
  WHERE membership.organization_id = p_organization_id
    AND membership.user_id = p_reviewer_id
    AND membership.is_active
    AND membership.role IN ('admin'::public.organization_role, 'operator'::public.organization_role);
  IF reviewer_role IS NULL THEN RAISE EXCEPTION 'review_authorization_failed'; END IF;

  SELECT submission.* INTO target_submission
  FROM public.submissions AS submission
  WHERE submission.id = p_submission_id
    AND submission.organization_id = p_organization_id
  FOR UPDATE;
  IF target_submission.id IS NULL THEN RAISE EXCEPTION 'review_submission_not_found'; END IF;

  SELECT task.* INTO target_task
  FROM public.tasks AS task
  WHERE task.id = target_submission.task_id
    AND task.organization_id = p_organization_id
    AND task.collector_id = target_submission.collector_id
  FOR UPDATE;
  IF target_task.id IS NULL THEN RAISE EXCEPTION 'review_task_not_found'; END IF;

  target_notification_type := CASE
    WHEN p_decision = 'approved'::public.review_status THEN 'submission_approved'
    ELSE 'submission_rejected'
  END;

  IF target_submission.review_status <> 'pending'::public.review_status THEN
    IF target_submission.review_status <> p_decision THEN
      RAISE EXCEPTION 'review_decision_already_finalized';
    END IF;
    SELECT notification.id, notification.status
      INTO target_notification_id, target_notification_status
    FROM public.whatsapp_review_notifications AS notification
    WHERE notification.submission_id = p_submission_id
      AND notification.organization_id = p_organization_id
      AND notification.notification_type = target_notification_type;
    IF target_notification_id IS NULL THEN RAISE EXCEPTION 'review_outbox_missing'; END IF;
    RETURN QUERY SELECT 'already_reviewed'::text, target_notification_id, target_notification_status;
    RETURN;
  END IF;

  IF target_task.status <> 'submitted'::public.task_status THEN
    RAISE EXCEPTION 'review_task_not_submitted';
  END IF;

  UPDATE public.submissions AS submission
  SET review_status = p_decision,
      reviewed_by = p_reviewer_id,
      reviewed_at = now(),
      rejection_reason = CASE
        WHEN p_decision = 'rejected'::public.review_status THEN normalized_reason
        ELSE NULL
      END,
      updated_at = now()
  WHERE submission.id = p_submission_id
    AND submission.organization_id = p_organization_id;

  UPDATE public.tasks AS task
  SET status = CASE
        WHEN p_decision = 'approved'::public.review_status
          THEN 'approved'::public.task_status
        ELSE 'rejected'::public.task_status
      END,
      updated_at = now()
  WHERE task.id = target_task.id
    AND task.organization_id = p_organization_id;

  INSERT INTO public.task_events (
    organization_id, task_id, event_type, previous_status, new_status,
    actor_type, actor_id, metadata
  ) VALUES (
    p_organization_id,
    target_task.id,
    target_notification_type,
    target_task.status,
    CASE
      WHEN p_decision = 'approved'::public.review_status
        THEN 'approved'::public.task_status
      ELSE 'rejected'::public.task_status
    END,
    reviewer_role::text::public.actor_type,
    p_reviewer_id,
    jsonb_build_object(
      'message', CASE
        WHEN p_decision = 'approved'::public.review_status
          THEN 'Submission approved by operator'
        ELSE 'Submission rejected: ' || normalized_reason
      END,
      'submission_id', p_submission_id,
      'rejection_reason', CASE
        WHEN p_decision = 'rejected'::public.review_status THEN normalized_reason
        ELSE NULL
      END
    )
  );

  INSERT INTO public.whatsapp_review_notifications (
    organization_id, collector_id, task_id, submission_id, notification_type
  ) VALUES (
    p_organization_id,
    target_submission.collector_id,
    target_task.id,
    target_submission.id,
    target_notification_type
  )
  RETURNING id, status
    INTO target_notification_id, target_notification_status;

  RETURN QUERY SELECT 'reviewed'::text, target_notification_id, target_notification_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_whatsapp_review_notification(
  p_notification_id uuid,
  p_organization_id uuid,
  p_actor_id uuid
)
RETURNS TABLE(
  result text,
  notification_id uuid,
  notification_type text,
  phone_e164 text,
  task_title text,
  rejection_reason text,
  last_interaction_at timestamptz,
  attempt_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_notification public.whatsapp_review_notifications%ROWTYPE;
  target_phone text;
  target_title text;
  target_reason text;
  target_last_interaction timestamptz;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members AS membership
    WHERE membership.organization_id = p_organization_id
      AND membership.user_id = p_actor_id
      AND membership.is_active
      AND membership.role IN ('admin'::public.organization_role, 'operator'::public.organization_role)
  ) THEN
    RAISE EXCEPTION 'notification_authorization_failed';
  END IF;

  SELECT notification.* INTO target_notification
  FROM public.whatsapp_review_notifications AS notification
  WHERE notification.id = p_notification_id
    AND notification.organization_id = p_organization_id
  FOR UPDATE;
  IF target_notification.id IS NULL THEN RAISE EXCEPTION 'notification_not_found'; END IF;
  IF target_notification.status = 'sent' THEN
    RETURN QUERY SELECT 'already_sent'::text, target_notification.id,
      target_notification.notification_type, NULL::text, NULL::text, NULL::text,
      NULL::timestamptz, target_notification.attempt_count;
    RETURN;
  END IF;
  IF target_notification.status NOT IN ('pending', 'failed') THEN
    RAISE EXCEPTION 'notification_not_claimable';
  END IF;
  IF target_notification.attempt_count >= 5 THEN
    RAISE EXCEPTION 'notification_attempt_limit';
  END IF;

  SELECT collector.phone_e164, task.title, submission.rejection_reason,
         session.last_interaction_at
    INTO target_phone, target_title, target_reason, target_last_interaction
  FROM public.collectors AS collector
  JOIN public.tasks AS task
    ON task.id = target_notification.task_id
   AND task.organization_id = target_notification.organization_id
   AND task.collector_id = collector.id
  JOIN public.submissions AS submission
    ON submission.id = target_notification.submission_id
   AND submission.organization_id = target_notification.organization_id
   AND submission.task_id = task.id
   AND submission.collector_id = collector.id
  LEFT JOIN public.whatsapp_sessions AS session
    ON session.organization_id = target_notification.organization_id
   AND session.task_id = task.id
   AND session.collector_id = collector.id
  WHERE collector.id = target_notification.collector_id
    AND collector.organization_id = target_notification.organization_id;
  IF target_title IS NULL THEN RAISE EXCEPTION 'notification_context_unavailable'; END IF;

  UPDATE public.whatsapp_review_notifications AS notification
  SET status = 'sending',
      attempt_count = notification.attempt_count + 1,
      claimed_at = now(),
      last_error_code = NULL,
      updated_at = now()
  WHERE notification.id = target_notification.id
    AND notification.organization_id = target_notification.organization_id;

  RETURN QUERY SELECT 'claimed'::text, target_notification.id,
    target_notification.notification_type, target_phone, target_title,
    target_reason, target_last_interaction, target_notification.attempt_count + 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_whatsapp_review_notification(
  p_notification_id uuid,
  p_twilio_message_sid text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_notification public.whatsapp_review_notifications%ROWTYPE;
  normalized_sid text := btrim(coalesce(p_twilio_message_sid, ''));
BEGIN
  IF normalized_sid = '' OR char_length(normalized_sid) > 64
     OR normalized_sid ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'invalid_twilio_message_sid';
  END IF;
  SELECT notification.* INTO target_notification
  FROM public.whatsapp_review_notifications AS notification
  WHERE notification.id = p_notification_id
  FOR UPDATE;
  IF target_notification.id IS NULL THEN RAISE EXCEPTION 'notification_not_found'; END IF;
  IF target_notification.status = 'sent' THEN
    RETURN target_notification.twilio_message_sid = normalized_sid;
  END IF;
  IF target_notification.status <> 'sending' THEN
    RAISE EXCEPTION 'notification_not_sending';
  END IF;
  UPDATE public.whatsapp_review_notifications AS notification
  SET status = 'sent',
      twilio_message_sid = normalized_sid,
      sent_at = now(),
      last_error_code = NULL,
      updated_at = now()
  WHERE notification.id = p_notification_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_whatsapp_review_notification(
  p_notification_id uuid,
  p_error_code text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  normalized_error text := lower(btrim(coalesce(p_error_code, 'notification_delivery_failed')));
BEGIN
  IF normalized_error !~ '^[a-z0-9_]{1,64}$' THEN
    normalized_error := 'notification_delivery_failed';
  END IF;
  UPDATE public.whatsapp_review_notifications AS notification
  SET status = 'failed',
      last_error_code = normalized_error,
      updated_at = now()
  WHERE notification.id = p_notification_id
    AND notification.status = 'sending';
  RETURN FOUND;
END;
$$;

REVOKE ALL ON TABLE public.whatsapp_review_notifications
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.review_submission_safely(uuid, uuid, public.review_status, text)
  FROM authenticated;

REVOKE ALL ON FUNCTION public.review_submission_with_whatsapp_outbox(uuid, uuid, uuid, public.review_status, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_whatsapp_review_notification(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_whatsapp_review_notification(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_whatsapp_review_notification(uuid, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.review_submission_with_whatsapp_outbox(uuid, uuid, uuid, public.review_status, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_whatsapp_review_notification(uuid, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_whatsapp_review_notification(uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_whatsapp_review_notification(uuid, text)
  TO service_role;
