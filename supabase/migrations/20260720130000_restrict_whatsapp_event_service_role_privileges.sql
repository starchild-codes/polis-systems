REVOKE ALL PRIVILEGES
ON TABLE public.whatsapp_webhook_events
FROM service_role;

GRANT SELECT, INSERT, UPDATE
ON TABLE public.whatsapp_webhook_events
TO service_role;
