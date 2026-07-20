-- Internal trigger execution does not require a callable service-role RPC.
REVOKE EXECUTE ON FUNCTION public.start_whatsapp_proof_after_acceptance()
  FROM service_role;
