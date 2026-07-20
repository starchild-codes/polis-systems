-- Stage 1 Twilio webhook delivery ledger. Message content and media URLs are
-- intentionally not stored here.
CREATE TABLE IF NOT EXISTS public.whatsapp_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  twilio_message_sid text NOT NULL UNIQUE,
  collector_id uuid,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_type text NOT NULL DEFAULT 'inbound'
    CHECK (event_type = 'inbound'),
  processing_status text NOT NULL DEFAULT 'received'
    CHECK (processing_status IN ('received', 'recognized', 'unrecognized', 'error')),
  has_media boolean NOT NULL DEFAULT false,
  error_code text CHECK (error_code IS NULL OR char_length(error_code) <= 64),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_webhook_events_collector_organization_fkey
    FOREIGN KEY (collector_id, organization_id)
    REFERENCES public.collectors(id, organization_id)
    ON DELETE SET NULL,
  CONSTRAINT whatsapp_webhook_events_collector_scope_check
    CHECK (
      (collector_id IS NULL AND organization_id IS NULL)
      OR (collector_id IS NOT NULL AND organization_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_events_organization_id
  ON public.whatsapp_webhook_events(organization_id);

ALTER TABLE public.whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.whatsapp_webhook_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.whatsapp_webhook_events TO service_role;
