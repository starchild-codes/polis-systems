-- Fix text-detail webhook finalization without changing the proof workflow.
-- The original RPC used response_code for both a PL/pgSQL variable and the
-- whatsapp_webhook_events column, so its final UPDATE was ambiguous.
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
  final_response_code text;
BEGIN
  IF p_field NOT IN ('waste_type', 'waste_quantity')
     OR normalized_value = '' OR char_length(normalized_value) > 120
     OR normalized_value ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'invalid_proof_text';
  END IF;

  PERFORM 1
  FROM public.whatsapp_webhook_events AS webhook_event
  WHERE webhook_event.twilio_message_sid = p_inbound_message_sid
    AND webhook_event.processing_status = 'received'
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
    UPDATE public.whatsapp_sessions AS session
    SET temporary_waste_type = normalized_value,
        proof_step = 'waste_quantity',
        last_inbound_message_sid = p_inbound_message_sid,
        last_message_sid = p_inbound_message_sid,
        last_interaction_at = now(),
        updated_at = now()
    WHERE session.id = target_session.id;
    final_response_code := 'waste_type_received';
  ELSE
    UPDATE public.whatsapp_sessions AS session
    SET temporary_quantity = normalized_value,
        proof_step = 'notes',
        last_inbound_message_sid = p_inbound_message_sid,
        last_message_sid = p_inbound_message_sid,
        last_interaction_at = now(),
        updated_at = now()
    WHERE session.id = target_session.id;
    final_response_code := 'quantity_received';
  END IF;

  UPDATE public.whatsapp_webhook_events AS webhook_event
  SET processing_status = 'recognized',
      collector_id = p_collector_id,
      organization_id = p_organization_id,
      response_code = final_response_code,
      error_code = NULL
  WHERE webhook_event.twilio_message_sid = p_inbound_message_sid;

  RETURN final_response_code;
END;
$$;

REVOKE ALL ON FUNCTION public.store_whatsapp_proof_text(uuid, uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_whatsapp_proof_text(uuid, uuid, text, text, text)
  TO service_role;
