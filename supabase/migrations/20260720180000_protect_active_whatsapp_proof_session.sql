-- Prevent a new outbound assignment from overwriting an active proof workflow.
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
     AND target_session.assignment_status = 'accepted'
     AND target_session.conversation_state IN (
       'awaiting_before_photo'::public.whatsapp_conversation_state,
       'awaiting_after_photo'::public.whatsapp_conversation_state,
       'awaiting_details'::public.whatsapp_conversation_state
     ) THEN
    RETURN QUERY SELECT 'collector_busy'::text, target_session.id, NULL::text;
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
      proof_step,
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
      NULL,
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
        proof_step = NULL,
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

REVOKE ALL ON FUNCTION public.prepare_whatsapp_task_assignment(uuid, uuid, uuid, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_whatsapp_task_assignment(uuid, uuid, uuid, uuid, timestamptz)
  TO service_role;
