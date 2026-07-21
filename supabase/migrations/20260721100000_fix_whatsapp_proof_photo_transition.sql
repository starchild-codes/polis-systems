-- Fix the proof-photo transition ledger update without changing workflow state.
-- The original RPC used response_code for both a PL/pgSQL variable and a table
-- column, which made the final webhook-event UPDATE ambiguous and rolled back
-- otherwise valid before/after photo transitions.
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
  final_response_code text;
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
    final_response_code := 'before_photo_received';
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
    final_response_code := 'after_photo_received';
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
      organization_id = p_organization_id, response_code = final_response_code,
      error_code = NULL
  WHERE twilio_message_sid = p_inbound_message_sid;

  RETURN QUERY SELECT final_response_code, target_task.id, next_state;
END;
$$;

REVOKE ALL ON FUNCTION public.store_whatsapp_proof_photo(uuid, uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_whatsapp_proof_photo(uuid, uuid, text, text, text)
  TO service_role;
