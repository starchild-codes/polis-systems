-- Pin search_path on set_updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- Lock down execute privileges on all helper functions.
-- Triggers still fire (triggers run as table owner, not caller).
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_role_self_escalation() FROM PUBLIC, anon, authenticated;

-- has_role is called from RLS policies, which run as the caller.
-- Keep it callable by authenticated users only; revoke from anon/public.
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.user_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.user_role) TO authenticated;