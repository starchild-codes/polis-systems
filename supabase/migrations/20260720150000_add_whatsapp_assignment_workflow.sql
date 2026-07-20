-- Stage 2 WhatsApp task assignment state and transactional ACCEPT/DECLINE flow.
-- Message bodies and media URLs are intentionally not stored.

ALTER TABLE public.whatsapp_sessions
  ADD COLUMN IF NOT EXISTS assignment_status text NOT NULL DEFAULT 'idle'
    CHECK (assignment_status IN (
      'idle', 'awaiting_response', 'accepted', 'declined', 'expired', 'cancelled'
    )),
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_inbound_message_sid text,
  ADD COLUMN IF NOT EXISTS last_outbound_message_sid text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'whatsapp_sessions_awaiting_response_fields_check'
      AND conrelid = 'public.whatsapp_sessions'::regclass
  ) THEN
    ALTER TABLE public.whatsapp_sessions
      ADD CONSTRAINT whatsapp_sessions_awaiting_response_fields_check
      CHECK (
        assignment_status <> 'awaiting_response'
        OR (task_id IS NOT NULL AND expires_at IS NOT NULL)
      );
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_sessions_last_inbound_message_sid_key
  ON public.whatsapp_sessions(last_inbound_message_sid)
  WHERE last_inbound_message_sid IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_sessions_last_outbound_message_sid_key
  ON public.whatsapp_sessions(last_outbound_message_sid)
  WHERE last_outbound_message_sid IS NOT NULL;

ALTER TABLE public.whatsapp_webhook_events
  ADD COLUMN IF NOT EXISTS response_code text
    CHECK (response_code IS NULL OR char_length(response_code) <= 32);

CREATE OR REPLACE FUNCTION public.prepare_whatsapp_task_assignment(
  p_task_id uuid,
  p_collector_id uuid,
  p_organization_id uuid,
  p_actor_id uuid,
  p_expires_at timestamptz
)
RETURNS TABLE(result text, session_id uuid, outbound_message_sid text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_task public.tasks%ROWTYPE;
  target_session public.whatsapp_sessions%ROWTYPE;
BEGIN
  IF p_expires_at <= now() OR p_expires_at > now() + interval '7 days' THEN
    RETURN QUERY SELECT 'invalid_expiry'::text, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_members AS membership
    WHERE membership.organization_id = p_organization_id
      AND membership.user_id = p_actor_id
      AND membership.is_active = true
      AND membership.role IN ('admin', 'operator')
  ) THEN
    RETURN QUERY SELECT 'authorization_failed'::text, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  SELECT task.*
  INTO target_task
  FROM public.tasks AS task
  WHERE task.id = p_task_id
    AND task.organization_id = p_organization_id
    AND task.collector_id = p_collector_id
  FOR UPDATE;

  IF target_task.id IS NULL THEN
    RETURN QUERY SELECT 'task_not_found'::text, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  IF target_task.status <> 'assigned'::public.task_status THEN
    RETURN QUERY SELECT 'task_not_assignable'::text, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  SELECT session.*
  INTO target_session
  FROM public.whatsapp_sessions AS session
  WHERE session.collector_id = p_collector_id
  FOR UPDATE;

  IF target_session.id IS NOT NULL
     AND target_session.organization_id <> p_organization_id THEN
    RETURN QUERY SELECT 'organization_mismatch'::text, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  IF target_session.id IS NOT NULL
     AND target_session.task_id = p_task_id
     AND target_session.assignment_status = 'awaiting_response'
     AND target_session.expires_at > now() THEN
    IF target_session.last_outbound_message_sid IS NOT NULL THEN
      RETURN QUERY
        SELECT 'already_sent'::text, target_session.id,
          target_session.last_outbound_message_sid;
    ELSE
      RETURN QUERY SELECT 'in_progress'::text, target_session.id, NULL::text;
    END IF;
    RETURN;
  END IF;

  IF target_session.id IS NULL THEN
    INSERT INTO public.whatsapp_sessions (
      collector_id,
      task_id,
      conversation_state,
      assignment_status,
      expires_at,
      last_inbound_message_sid,
      last_outbound_message_sid,
      last_message_sid,
      last_interaction_at,
      organization_id
    ) VALUES (
      p_collector_id,
      p_task_id,
      'awaiting_acceptance'::public.whatsapp_conversation_state,
      'awaiting_response',
      p_expires_at,
      NULL,
      NULL,
      NULL,
      now(),
      p_organization_id
    )
    RETURNING id INTO target_session.id;
  ELSE
    UPDATE public.whatsapp_sessions
    SET task_id = p_task_id,
        conversation_state = 'awaiting_acceptance'::public.whatsapp_conversation_state,
        assignment_status = 'awaiting_response',
        expires_at = p_expires_at,
        last_inbound_message_sid = NULL,
        last_outbound_message_sid = NULL,
        last_message_sid = NULL,
        last_interaction_at = now(),
        before_photo_path = NULL,
        after_photo_path = NULL,
        temporary_waste_type = NULL,
        temporary_quantity = NULL,
        temporary_notes = NULL,
        updated_at = now()
    WHERE id = target_session.id;
  END IF;

  RETURN QUERY SELECT 'prepared'::text, target_session.id, NULL::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_whatsapp_task_assignment(
  p_session_id uuid,
  p_outbound_message_sid text,
  p_actor_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_session public.whatsapp_sessions%ROWTYPE;
  actor_role public.organization_role;
BEGIN
  SELECT session.*
  INTO target_session
  FROM public.whatsapp_sessions AS session
  WHERE session.id = p_session_id
  FOR UPDATE;

  IF target_session.id IS NULL
     OR target_session.assignment_status <> 'awaiting_response'
     OR target_session.expires_at <= now()
     OR target_session.last_outbound_message_sid IS NOT NULL THEN
    RETURN false;
  END IF;

  SELECT membership.role
  INTO actor_role
  FROM public.organization_members AS membership
  WHERE membership.organization_id = target_session.organization_id
    AND membership.user_id = p_actor_id
    AND membership.is_active = true
    AND membership.role IN ('admin', 'operator');

  IF actor_role IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.whatsapp_sessions
  SET last_outbound_message_sid = p_outbound_message_sid,
      last_interaction_at = now(),
      updated_at = now()
  WHERE id = target_session.id;

  INSERT INTO public.task_events (
    organization_id,
    task_id,
    event_type,
    previous_status,
    new_status,
    actor_type,
    actor_id,
    metadata
  )
  SELECT
    target_session.organization_id,
    target_session.task_id,
    'whatsapp_assignment_sent',
    task.status,
    task.status,
    actor_role::text::public.actor_type,
    p_actor_id,
    jsonb_build_object('message', 'WhatsApp task assignment sent to collector')
  FROM public.tasks AS task
  WHERE task.id = target_session.task_id
    AND task.organization_id = target_session.organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'assignment_task_not_found';
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_whatsapp_task_assignment(
  p_session_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  UPDATE public.whatsapp_sessions
  SET conversation_state = 'idle'::public.whatsapp_conversation_state,
      assignment_status = 'cancelled',
      expires_at = NULL,
      updated_at = now()
  WHERE id = p_session_id
    AND assignment_status = 'awaiting_response'
    AND last_outbound_message_sid IS NULL
  RETURNING true;
$$;

CREATE OR REPLACE FUNCTION public.process_whatsapp_task_response(
  p_collector_id uuid,
  p_organization_id uuid,
  p_inbound_message_sid text,
  p_action text
)
RETURNS TABLE(result text, task_id uuid, previous_status public.task_status, new_status public.task_status)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  normalized_action text := lower(btrim(coalesce(p_action, '')));
  active_count integer := 0;
  target_session public.whatsapp_sessions%ROWTYPE;
  target_task public.tasks%ROWTYPE;
  next_task_status public.task_status;
BEGIN
  PERFORM 1
  FROM public.whatsapp_webhook_events AS webhook_event
  WHERE webhook_event.twilio_message_sid = p_inbound_message_sid
    AND webhook_event.processing_status = 'received'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'webhook_event_not_claimed';
  END IF;

  UPDATE public.whatsapp_sessions
  SET conversation_state = 'idle'::public.whatsapp_conversation_state,
      assignment_status = 'expired',
      updated_at = now()
  WHERE collector_id = p_collector_id
    AND organization_id = p_organization_id
    AND assignment_status = 'awaiting_response'
    AND expires_at <= now();

  FOR target_session IN
    SELECT session.*
    FROM public.whatsapp_sessions AS session
    WHERE session.collector_id = p_collector_id
      AND session.organization_id = p_organization_id
      AND session.assignment_status = 'awaiting_response'
      AND session.expires_at > now()
    FOR UPDATE
  LOOP
    active_count := active_count + 1;
  END LOOP;

  IF active_count = 0 THEN
    UPDATE public.whatsapp_webhook_events
    SET processing_status = 'recognized',
        collector_id = p_collector_id,
        organization_id = p_organization_id,
        response_code = 'no_active_session',
        error_code = NULL
    WHERE twilio_message_sid = p_inbound_message_sid;
    RETURN QUERY SELECT 'no_active_session'::text, NULL::uuid,
      NULL::public.task_status, NULL::public.task_status;
    RETURN;
  END IF;

  IF active_count <> 1 THEN
    UPDATE public.whatsapp_webhook_events
    SET processing_status = 'error',
        collector_id = p_collector_id,
        organization_id = p_organization_id,
        response_code = 'ambiguous_session',
        error_code = 'ambiguous_assignment_session'
    WHERE twilio_message_sid = p_inbound_message_sid;
    RETURN QUERY SELECT 'ambiguous_session'::text, NULL::uuid,
      NULL::public.task_status, NULL::public.task_status;
    RETURN;
  END IF;

  SELECT session.*
  INTO target_session
  FROM public.whatsapp_sessions AS session
  WHERE session.collector_id = p_collector_id
    AND session.organization_id = p_organization_id
    AND session.assignment_status = 'awaiting_response'
    AND session.expires_at > now()
  FOR UPDATE;

  IF normalized_action NOT IN ('accept', 'decline') THEN
    UPDATE public.whatsapp_sessions
    SET last_inbound_message_sid = p_inbound_message_sid,
        last_message_sid = p_inbound_message_sid,
        last_interaction_at = now(),
        updated_at = now()
    WHERE id = target_session.id;

    UPDATE public.whatsapp_webhook_events
    SET processing_status = 'recognized',
        collector_id = p_collector_id,
        organization_id = p_organization_id,
        response_code = 'invalid_command',
        error_code = NULL
    WHERE twilio_message_sid = p_inbound_message_sid;
    RETURN QUERY SELECT 'invalid_command'::text, target_session.task_id,
      NULL::public.task_status, NULL::public.task_status;
    RETURN;
  END IF;

  SELECT task.*
  INTO target_task
  FROM public.tasks AS task
  WHERE task.id = target_session.task_id
    AND task.organization_id = p_organization_id
    AND task.collector_id = p_collector_id
  FOR UPDATE;

  IF target_task.id IS NULL OR target_task.status <> 'assigned'::public.task_status THEN
    UPDATE public.whatsapp_sessions
    SET conversation_state = 'idle'::public.whatsapp_conversation_state,
        assignment_status = 'cancelled',
        updated_at = now()
    WHERE id = target_session.id;

    UPDATE public.whatsapp_webhook_events
    SET processing_status = 'error',
        collector_id = p_collector_id,
        organization_id = p_organization_id,
        response_code = 'no_active_session',
        error_code = 'assignment_task_unavailable'
    WHERE twilio_message_sid = p_inbound_message_sid;
    RETURN QUERY SELECT 'no_active_session'::text, target_session.task_id,
      target_task.status, NULL::public.task_status;
    RETURN;
  END IF;

  next_task_status := CASE normalized_action
    WHEN 'accept' THEN 'accepted'::public.task_status
    ELSE 'declined'::public.task_status
  END;

  UPDATE public.tasks
  SET status = next_task_status,
      updated_at = now()
  WHERE id = target_task.id
    AND organization_id = p_organization_id;

  UPDATE public.whatsapp_sessions
  SET conversation_state = 'idle'::public.whatsapp_conversation_state,
      assignment_status = CASE normalized_action
        WHEN 'accept' THEN 'accepted'
        ELSE 'declined'
      END,
      expires_at = NULL,
      last_inbound_message_sid = p_inbound_message_sid,
      last_message_sid = p_inbound_message_sid,
      last_interaction_at = now(),
      updated_at = now()
  WHERE id = target_session.id;

  INSERT INTO public.task_events (
    organization_id,
    task_id,
    event_type,
    previous_status,
    new_status,
    actor_type,
    actor_id,
    metadata
  ) VALUES (
    p_organization_id,
    target_task.id,
    normalized_action || 'ed',
    target_task.status,
    next_task_status,
    'collector'::public.actor_type,
    p_collector_id,
    jsonb_build_object(
      'message',
      CASE normalized_action
        WHEN 'accept' THEN 'Collector accepted the task via WhatsApp'
        ELSE 'Collector declined the task via WhatsApp'
      END
    )
  );

  UPDATE public.whatsapp_webhook_events
  SET processing_status = 'recognized',
      collector_id = p_collector_id,
      organization_id = p_organization_id,
      response_code = CASE normalized_action
        WHEN 'accept' THEN 'accepted'
        ELSE 'declined'
      END,
      error_code = NULL
  WHERE twilio_message_sid = p_inbound_message_sid;

  RETURN QUERY SELECT
    CASE normalized_action WHEN 'accept' THEN 'accepted' ELSE 'declined' END,
    target_task.id,
    target_task.status,
    next_task_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_stale_whatsapp_assignment_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.collector_id IS DISTINCT FROM NEW.collector_id
     OR (OLD.status = 'assigned'::public.task_status
         AND NEW.status <> 'assigned'::public.task_status) THEN
    UPDATE public.whatsapp_sessions
    SET conversation_state = 'idle'::public.whatsapp_conversation_state,
        assignment_status = 'cancelled',
        expires_at = NULL,
        updated_at = now()
    WHERE task_id = OLD.id
      AND organization_id = OLD.organization_id
      AND assignment_status = 'awaiting_response';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cancel_stale_whatsapp_assignment_session
  ON public.tasks;
CREATE TRIGGER cancel_stale_whatsapp_assignment_session
  AFTER UPDATE OF collector_id, status ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.cancel_stale_whatsapp_assignment_session();

REVOKE ALL ON FUNCTION public.prepare_whatsapp_task_assignment(uuid, uuid, uuid, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_whatsapp_task_assignment(uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_whatsapp_task_assignment(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_whatsapp_task_response(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_stale_whatsapp_assignment_session()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.prepare_whatsapp_task_assignment(uuid, uuid, uuid, uuid, timestamptz)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_whatsapp_task_assignment(uuid, text, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_whatsapp_task_assignment(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.process_whatsapp_task_response(uuid, uuid, text, text)
  TO service_role;

-- The trigger invokes this function internally. No client role needs EXECUTE.
