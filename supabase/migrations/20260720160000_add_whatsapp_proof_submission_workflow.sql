-- Stage 3 WhatsApp proof workflow and private proof storage.
-- Message bodies and Twilio media URLs are intentionally never persisted.

ALTER TABLE public.whatsapp_sessions
  ADD COLUMN IF NOT EXISTS proof_step text
    CHECK (proof_step IS NULL OR proof_step IN ('waste_type', 'waste_quantity', 'notes'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'whatsapp_sessions_proof_step_state_check'
      AND conrelid = 'public.whatsapp_sessions'::regclass
  ) THEN
    ALTER TABLE public.whatsapp_sessions
      ADD CONSTRAINT whatsapp_sessions_proof_step_state_check
      CHECK (
        (conversation_state = 'awaiting_details'::public.whatsapp_conversation_state
          AND proof_step IS NOT NULL)
        OR
        (conversation_state <> 'awaiting_details'::public.whatsapp_conversation_state
          AND proof_step IS NULL)
      );
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_active_proof
  ON public.whatsapp_sessions(organization_id, collector_id, conversation_state)
  WHERE conversation_state IN (
    'awaiting_before_photo'::public.whatsapp_conversation_state,
    'awaiting_after_photo'::public.whatsapp_conversation_state,
    'awaiting_details'::public.whatsapp_conversation_state
  );

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'task-proof',
  'task-proof',
  false,
  10485760,
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Stage 2 creates the ACCEPT event after updating the task and session. Moving
-- the accepted session into proof collection here keeps the Stage 2 RPC intact.
CREATE OR REPLACE FUNCTION public.start_whatsapp_proof_after_acceptance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.event_type = 'accepted'
     AND NEW.actor_type = 'collector'::public.actor_type
     AND NEW.actor_id IS NOT NULL THEN
    UPDATE public.whatsapp_sessions
    SET conversation_state = 'awaiting_before_photo'::public.whatsapp_conversation_state,
        proof_step = NULL,
        expires_at = now() + interval '7 days',
        before_photo_path = NULL,
        after_photo_path = NULL,
        temporary_waste_type = NULL,
        temporary_quantity = NULL,
        temporary_notes = NULL,
        last_interaction_at = now(),
        updated_at = now()
    WHERE task_id = NEW.task_id
      AND collector_id = NEW.actor_id
      AND organization_id = NEW.organization_id
      AND assignment_status = 'accepted';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS start_whatsapp_proof_after_acceptance ON public.task_events;
CREATE TRIGGER start_whatsapp_proof_after_acceptance
  AFTER INSERT ON public.task_events
  FOR EACH ROW
  EXECUTE FUNCTION public.start_whatsapp_proof_after_acceptance();

CREATE OR REPLACE FUNCTION public.record_whatsapp_proof_prompt(
  p_collector_id uuid,
  p_organization_id uuid,
  p_inbound_message_sid text,
  p_response_code text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_session public.whatsapp_sessions%ROWTYPE;
  target_task public.tasks%ROWTYPE;
  final_response_code text := p_response_code;
BEGIN
  IF p_response_code IS NULL OR char_length(p_response_code) > 32 THEN
    RAISE EXCEPTION 'invalid_response_code';
  END IF;

  PERFORM 1
  FROM public.whatsapp_webhook_events AS webhook_event
  WHERE webhook_event.twilio_message_sid = p_inbound_message_sid
    AND webhook_event.processing_status = 'received'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'webhook_event_not_claimed';
  END IF;

  SELECT session.*
  INTO target_session
  FROM public.whatsapp_sessions AS session
  WHERE session.collector_id = p_collector_id
    AND session.organization_id = p_organization_id
  FOR UPDATE;

  IF target_session.id IS NULL THEN
    final_response_code := 'no_active_session';
  ELSE
    SELECT task.*
    INTO target_task
    FROM public.tasks AS task
    WHERE task.id = target_session.task_id
      AND task.organization_id = p_organization_id
    FOR UPDATE;

    IF target_session.assignment_status <> 'accepted'
       OR target_session.conversation_state NOT IN (
         'awaiting_before_photo'::public.whatsapp_conversation_state,
         'awaiting_after_photo'::public.whatsapp_conversation_state,
         'awaiting_details'::public.whatsapp_conversation_state
       ) THEN
      final_response_code := 'no_active_session';
    ELSIF target_session.expires_at IS NULL OR target_session.expires_at <= now() THEN
      UPDATE public.whatsapp_sessions
      SET conversation_state = 'idle'::public.whatsapp_conversation_state,
          proof_step = NULL,
          assignment_status = 'expired',
          updated_at = now()
      WHERE id = target_session.id;
      final_response_code := 'proof_expired';
    ELSIF target_task.id IS NULL
       OR target_task.collector_id IS DISTINCT FROM p_collector_id
       OR target_task.status NOT IN (
         'accepted'::public.task_status,
         'in_progress'::public.task_status
       ) THEN
      UPDATE public.whatsapp_sessions
      SET conversation_state = 'idle'::public.whatsapp_conversation_state,
          proof_step = NULL,
          assignment_status = 'cancelled',
          updated_at = now()
      WHERE id = target_session.id;
      final_response_code := 'task_unavailable';
    ELSE
      UPDATE public.whatsapp_sessions
      SET last_inbound_message_sid = p_inbound_message_sid,
          last_message_sid = p_inbound_message_sid,
          last_interaction_at = now(),
          updated_at = now()
      WHERE id = target_session.id;
    END IF;
  END IF;

  UPDATE public.whatsapp_webhook_events
  SET processing_status = 'recognized',
      collector_id = p_collector_id,
      organization_id = p_organization_id,
      response_code = final_response_code,
      error_code = NULL
  WHERE twilio_message_sid = p_inbound_message_sid;

  RETURN final_response_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.store_whatsapp_proof_photo(
  p_collector_id uuid,
  p_organization_id uuid,
  p_inbound_message_sid text,
  p_photo_kind text,
  p_object_path text
)
RETURNS TABLE(result text, task_id uuid, new_state public.whatsapp_conversation_state)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_session public.whatsapp_sessions%ROWTYPE;
  target_task public.tasks%ROWTYPE;
  expected_prefix text;
  next_state public.whatsapp_conversation_state;
  response_code text;
  next_task_status public.task_status;
BEGIN
  IF p_photo_kind NOT IN ('before', 'after') THEN
    RAISE EXCEPTION 'invalid_photo_kind';
  END IF;

  PERFORM 1 FROM public.whatsapp_webhook_events
  WHERE twilio_message_sid = p_inbound_message_sid
    AND processing_status = 'received'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'webhook_event_not_claimed'; END IF;

  SELECT session.* INTO target_session
  FROM public.whatsapp_sessions AS session
  WHERE session.collector_id = p_collector_id
    AND session.organization_id = p_organization_id
  FOR UPDATE;

  IF target_session.id IS NULL
     OR target_session.assignment_status <> 'accepted'
     OR target_session.expires_at IS NULL
     OR target_session.expires_at <= now() THEN
    RAISE EXCEPTION 'proof_session_unavailable';
  END IF;

  SELECT task.* INTO target_task
  FROM public.tasks AS task
  WHERE task.id = target_session.task_id
    AND task.organization_id = p_organization_id
    AND task.collector_id = p_collector_id
  FOR UPDATE;

  IF target_task.id IS NULL
     OR target_task.status NOT IN ('accepted'::public.task_status, 'in_progress'::public.task_status) THEN
    RAISE EXCEPTION 'proof_task_unavailable';
  END IF;

  expected_prefix := 'organizations/' || p_organization_id::text
    || '/tasks/' || target_task.id::text
    || '/submissions/' || target_session.id::text
    || '/' || p_photo_kind || '-';
  IF p_object_path IS NULL
     OR char_length(p_object_path) > 512
     OR position('..' in p_object_path) > 0
     OR p_object_path NOT LIKE expected_prefix || '%' THEN
    RAISE EXCEPTION 'invalid_proof_object_path';
  END IF;

  IF p_photo_kind = 'before' THEN
    IF target_session.conversation_state <> 'awaiting_before_photo'::public.whatsapp_conversation_state
       OR target_session.before_photo_path IS NOT NULL THEN
      RAISE EXCEPTION 'proof_state_mismatch';
    END IF;
    next_state := 'awaiting_after_photo'::public.whatsapp_conversation_state;
    response_code := 'before_photo_received';
    next_task_status := 'in_progress'::public.task_status;

    UPDATE public.whatsapp_sessions
    SET before_photo_path = p_object_path,
        conversation_state = next_state,
        proof_step = NULL,
        last_inbound_message_sid = p_inbound_message_sid,
        last_message_sid = p_inbound_message_sid,
        last_interaction_at = now(),
        updated_at = now()
    WHERE id = target_session.id;

    UPDATE public.tasks
    SET status = next_task_status, updated_at = now()
    WHERE id = target_task.id AND organization_id = p_organization_id;
  ELSE
    IF target_session.conversation_state <> 'awaiting_after_photo'::public.whatsapp_conversation_state
       OR target_session.before_photo_path IS NULL
       OR target_session.after_photo_path IS NOT NULL THEN
      RAISE EXCEPTION 'proof_state_mismatch';
    END IF;
    next_state := 'awaiting_details'::public.whatsapp_conversation_state;
    response_code := 'after_photo_received';
    next_task_status := target_task.status;

    UPDATE public.whatsapp_sessions
    SET after_photo_path = p_object_path,
        conversation_state = next_state,
        proof_step = 'waste_type',
        last_inbound_message_sid = p_inbound_message_sid,
        last_message_sid = p_inbound_message_sid,
        last_interaction_at = now(),
        updated_at = now()
    WHERE id = target_session.id;
  END IF;

  INSERT INTO public.task_events (
    organization_id, task_id, event_type, previous_status, new_status,
    actor_type, actor_id, metadata
  ) VALUES (
    p_organization_id,
    target_task.id,
    p_photo_kind || '_photo_received',
    target_task.status,
    next_task_status,
    'collector'::public.actor_type,
    p_collector_id,
    jsonb_build_object('message', initcap(p_photo_kind) || ' proof photo received via WhatsApp')
  );

  UPDATE public.whatsapp_webhook_events
  SET processing_status = 'recognized', collector_id = p_collector_id,
      organization_id = p_organization_id, response_code = response_code,
      error_code = NULL
  WHERE twilio_message_sid = p_inbound_message_sid;

  RETURN QUERY SELECT response_code, target_task.id, next_state;
END;
$$;

CREATE OR REPLACE FUNCTION public.store_whatsapp_proof_text(
  p_collector_id uuid,
  p_organization_id uuid,
  p_inbound_message_sid text,
  p_field text,
  p_value text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_session public.whatsapp_sessions%ROWTYPE;
  target_task public.tasks%ROWTYPE;
  normalized_value text := btrim(coalesce(p_value, ''));
  response_code text;
BEGIN
  IF p_field NOT IN ('waste_type', 'waste_quantity')
     OR normalized_value = '' OR char_length(normalized_value) > 120
     OR normalized_value ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'invalid_proof_text';
  END IF;

  PERFORM 1 FROM public.whatsapp_webhook_events
  WHERE twilio_message_sid = p_inbound_message_sid AND processing_status = 'received'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'webhook_event_not_claimed'; END IF;

  SELECT session.* INTO target_session
  FROM public.whatsapp_sessions AS session
  WHERE session.collector_id = p_collector_id
    AND session.organization_id = p_organization_id
  FOR UPDATE;

  IF target_session.id IS NULL
     OR target_session.assignment_status <> 'accepted'
     OR target_session.conversation_state <> 'awaiting_details'::public.whatsapp_conversation_state
     OR target_session.proof_step <> p_field
     OR target_session.before_photo_path IS NULL
     OR target_session.after_photo_path IS NULL
     OR target_session.expires_at IS NULL
     OR target_session.expires_at <= now() THEN
    RAISE EXCEPTION 'proof_state_mismatch';
  END IF;

  SELECT task.* INTO target_task
  FROM public.tasks AS task
  WHERE task.id = target_session.task_id
    AND task.organization_id = p_organization_id
    AND task.collector_id = p_collector_id
    AND task.status IN ('accepted'::public.task_status, 'in_progress'::public.task_status)
  FOR UPDATE;
  IF target_task.id IS NULL THEN RAISE EXCEPTION 'proof_task_unavailable'; END IF;

  IF p_field = 'waste_type' THEN
    UPDATE public.whatsapp_sessions
    SET temporary_waste_type = normalized_value,
        proof_step = 'waste_quantity',
        last_inbound_message_sid = p_inbound_message_sid,
        last_message_sid = p_inbound_message_sid,
        last_interaction_at = now(), updated_at = now()
    WHERE id = target_session.id;
    response_code := 'waste_type_received';
  ELSE
    UPDATE public.whatsapp_sessions
    SET temporary_quantity = normalized_value,
        proof_step = 'notes',
        last_inbound_message_sid = p_inbound_message_sid,
        last_message_sid = p_inbound_message_sid,
        last_interaction_at = now(), updated_at = now()
    WHERE id = target_session.id;
    response_code := 'quantity_received';
  END IF;

  UPDATE public.whatsapp_webhook_events
  SET processing_status = 'recognized', collector_id = p_collector_id,
      organization_id = p_organization_id, response_code = response_code,
      error_code = NULL
  WHERE twilio_message_sid = p_inbound_message_sid;
  RETURN response_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_whatsapp_proof(
  p_collector_id uuid,
  p_organization_id uuid,
  p_inbound_message_sid text,
  p_notes text
)
RETURNS TABLE(result text, submission_id uuid, task_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_session public.whatsapp_sessions%ROWTYPE;
  target_task public.tasks%ROWTYPE;
  target_submission public.submissions%ROWTYPE;
  normalized_notes text := nullif(btrim(coalesce(p_notes, '')), '');
BEGIN
  IF normalized_notes IS NOT NULL
     AND (char_length(normalized_notes) > 1000 OR normalized_notes ~ '[[:cntrl:]]') THEN
    RAISE EXCEPTION 'invalid_proof_notes';
  END IF;

  PERFORM 1 FROM public.whatsapp_webhook_events
  WHERE twilio_message_sid = p_inbound_message_sid AND processing_status = 'received'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'webhook_event_not_claimed'; END IF;

  SELECT session.* INTO target_session
  FROM public.whatsapp_sessions AS session
  WHERE session.collector_id = p_collector_id
    AND session.organization_id = p_organization_id
  FOR UPDATE;
  IF target_session.id IS NULL THEN RAISE EXCEPTION 'proof_session_unavailable'; END IF;

  IF target_session.conversation_state = 'submitted'::public.whatsapp_conversation_state THEN
    SELECT submission.* INTO target_submission
    FROM public.submissions AS submission
    WHERE submission.task_id = target_session.task_id
      AND submission.collector_id = p_collector_id
      AND submission.organization_id = p_organization_id;
    IF target_submission.id IS NULL THEN RAISE EXCEPTION 'submitted_session_without_submission'; END IF;
    UPDATE public.whatsapp_webhook_events
    SET processing_status = 'recognized', collector_id = p_collector_id,
        organization_id = p_organization_id, response_code = 'proof_submitted',
        error_code = NULL
    WHERE twilio_message_sid = p_inbound_message_sid;
    RETURN QUERY SELECT 'proof_submitted'::text, target_submission.id, target_session.task_id;
    RETURN;
  END IF;

  IF target_session.assignment_status <> 'accepted'
     OR target_session.conversation_state <> 'awaiting_details'::public.whatsapp_conversation_state
     OR target_session.proof_step <> 'notes'
     OR target_session.before_photo_path IS NULL
     OR target_session.after_photo_path IS NULL
     OR coalesce(btrim(target_session.temporary_waste_type), '') = ''
     OR coalesce(btrim(target_session.temporary_quantity), '') = ''
     OR target_session.expires_at IS NULL
     OR target_session.expires_at <= now() THEN
    RAISE EXCEPTION 'proof_not_ready';
  END IF;

  SELECT task.* INTO target_task
  FROM public.tasks AS task
  WHERE task.id = target_session.task_id
    AND task.organization_id = p_organization_id
    AND task.collector_id = p_collector_id
    AND task.status IN ('accepted'::public.task_status, 'in_progress'::public.task_status)
  FOR UPDATE;
  IF target_task.id IS NULL THEN RAISE EXCEPTION 'proof_task_unavailable'; END IF;

  IF target_session.before_photo_path NOT LIKE
       'organizations/' || p_organization_id::text || '/tasks/' || target_task.id::text
       || '/submissions/' || target_session.id::text || '/before-%'
     OR target_session.after_photo_path NOT LIKE
       'organizations/' || p_organization_id::text || '/tasks/' || target_task.id::text
       || '/submissions/' || target_session.id::text || '/after-%' THEN
    RAISE EXCEPTION 'proof_path_mismatch';
  END IF;

  INSERT INTO public.submissions (
    organization_id, task_id, collector_id, before_photo_path,
    after_photo_path, waste_type, quantity_estimate, collector_notes,
    submitted_at, review_status
  ) VALUES (
    p_organization_id, target_task.id, p_collector_id,
    target_session.before_photo_path, target_session.after_photo_path,
    btrim(target_session.temporary_waste_type),
    btrim(target_session.temporary_quantity), normalized_notes,
    now(), 'pending'::public.review_status
  )
  RETURNING * INTO target_submission;

  UPDATE public.tasks
  SET status = 'submitted'::public.task_status, updated_at = now()
  WHERE id = target_task.id AND organization_id = p_organization_id;

  UPDATE public.whatsapp_sessions
  SET conversation_state = 'submitted'::public.whatsapp_conversation_state,
      proof_step = NULL,
      temporary_notes = normalized_notes,
      expires_at = NULL,
      last_inbound_message_sid = p_inbound_message_sid,
      last_message_sid = p_inbound_message_sid,
      last_interaction_at = now(), updated_at = now()
  WHERE id = target_session.id;

  INSERT INTO public.task_events (
    organization_id, task_id, event_type, previous_status, new_status,
    actor_type, actor_id, metadata
  ) VALUES (
    p_organization_id, target_task.id, 'proof_submitted', target_task.status,
    'submitted'::public.task_status, 'collector'::public.actor_type,
    p_collector_id,
    jsonb_build_object(
      'message', 'Collector submitted proof via WhatsApp',
      'submission_id', target_submission.id
    )
  );

  UPDATE public.whatsapp_webhook_events
  SET processing_status = 'recognized', collector_id = p_collector_id,
      organization_id = p_organization_id, response_code = 'proof_submitted',
      error_code = NULL
  WHERE twilio_message_sid = p_inbound_message_sid;

  RETURN QUERY SELECT 'proof_submitted'::text, target_submission.id, target_task.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_whatsapp_proof_workflow(
  p_collector_id uuid,
  p_organization_id uuid,
  p_inbound_message_sid text
)
RETURNS TABLE(result text, before_photo_path text, after_photo_path text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_session public.whatsapp_sessions%ROWTYPE;
BEGIN
  PERFORM 1 FROM public.whatsapp_webhook_events
  WHERE twilio_message_sid = p_inbound_message_sid AND processing_status = 'received'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'webhook_event_not_claimed'; END IF;

  SELECT session.* INTO target_session
  FROM public.whatsapp_sessions AS session
  WHERE session.collector_id = p_collector_id
    AND session.organization_id = p_organization_id
    AND session.assignment_status = 'accepted'
    AND session.conversation_state IN (
      'awaiting_before_photo'::public.whatsapp_conversation_state,
      'awaiting_after_photo'::public.whatsapp_conversation_state,
      'awaiting_details'::public.whatsapp_conversation_state
    )
  FOR UPDATE;
  IF target_session.id IS NULL THEN RAISE EXCEPTION 'proof_session_unavailable'; END IF;

  UPDATE public.whatsapp_sessions
  SET conversation_state = 'idle'::public.whatsapp_conversation_state,
      proof_step = NULL, assignment_status = 'cancelled', expires_at = NULL,
      last_inbound_message_sid = p_inbound_message_sid,
      last_message_sid = p_inbound_message_sid,
      last_interaction_at = now(), updated_at = now()
  WHERE id = target_session.id;

  INSERT INTO public.task_events (
    organization_id, task_id, event_type, previous_status, new_status,
    actor_type, actor_id, metadata
  )
  SELECT p_organization_id, task.id, 'proof_workflow_cancelled', task.status,
    task.status, 'collector'::public.actor_type, p_collector_id,
    jsonb_build_object('message', 'Collector cancelled the WhatsApp proof workflow')
  FROM public.tasks AS task
  WHERE task.id = target_session.task_id AND task.organization_id = p_organization_id;

  UPDATE public.whatsapp_webhook_events
  SET processing_status = 'recognized', collector_id = p_collector_id,
      organization_id = p_organization_id, response_code = 'proof_cancelled',
      error_code = NULL
  WHERE twilio_message_sid = p_inbound_message_sid;

  RETURN QUERY SELECT 'proof_cancelled'::text,
    target_session.before_photo_path, target_session.after_photo_path;
END;
$$;

REVOKE ALL ON FUNCTION public.start_whatsapp_proof_after_acceptance()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_whatsapp_proof_prompt(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.store_whatsapp_proof_photo(uuid, uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.store_whatsapp_proof_text(uuid, uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_whatsapp_proof(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_whatsapp_proof_workflow(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.record_whatsapp_proof_prompt(uuid, uuid, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.store_whatsapp_proof_photo(uuid, uuid, text, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.store_whatsapp_proof_text(uuid, uuid, text, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.submit_whatsapp_proof(uuid, uuid, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_whatsapp_proof_workflow(uuid, uuid, text)
  TO service_role;

-- The acceptance trigger invokes its function internally; no client role needs EXECUTE.
