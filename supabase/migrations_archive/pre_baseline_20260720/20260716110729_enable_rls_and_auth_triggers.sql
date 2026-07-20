/*
# Enable RLS, Auth Triggers, and Role-Based Access Control

## Purpose
Applies Row Level Security and auth-triggered profile creation to the external
Supabase project. This migration is idempotent — safe to re-run.

## Changes

1. Sets profiles.role default to 'pending' so new signups start unprivileged
2. Grants authenticated role SELECT/INSERT/UPDATE on profiles
3. Enables RLS on all 7 public tables
4. Creates has_role() security-definer function for RLS policy checks
5. Creates handle_new_user() trigger — auto-creates a profiles row on signup
6. Creates prevent_role_self_escalation() trigger — blocks non-admins from
   changing their own role
7. RLS policies on profiles: users read/update own profile, admins read/update
   all profiles
8. RLS policies on operational tables (zones, collectors, tasks, submissions,
   task_events, whatsapp_sessions): only admin or operator roles can access
9. Revokes execute on helper functions from anon/public
*/

-- Set default role to 'pending' for new signups
ALTER TABLE public.profiles
  ALTER COLUMN role SET DEFAULT 'pending'::public.user_role;

-- =============================================================================
-- Grants
-- =============================================================================
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.zones TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.collectors TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.submissions TO authenticated;
GRANT SELECT, INSERT ON public.task_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_sessions TO authenticated;

-- =============================================================================
-- Enable RLS on all public tables
-- =============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_sessions ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- has_role() — security definer, avoids recursive RLS on profiles
-- =============================================================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.user_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id AND role = _role
  );
$$;

-- =============================================================================
-- handle_new_user() — auto-create profile on signup
-- =============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- prevent_role_self_escalation() — only admins can change roles
-- =============================================================================
CREATE OR REPLACE FUNCTION public.prevent_role_self_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can change a profile role';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_block_role_escalation ON public.profiles;
CREATE TRIGGER profiles_block_role_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_role_self_escalation();

-- =============================================================================
-- RLS Policies — profiles
-- =============================================================================
DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;
CREATE POLICY "Users read own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users insert own profile" ON public.profiles;
CREATE POLICY "Users insert own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Admins read all profiles" ON public.profiles;
CREATE POLICY "Admins read all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins update all profiles" ON public.profiles;
CREATE POLICY "Admins update all profiles"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =============================================================================
-- RLS Policies — zones (admin + operator read, admin write)
-- =============================================================================
DROP POLICY IF EXISTS "Ops read zones" ON public.zones;
CREATE POLICY "Ops read zones"
  ON public.zones FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'operator')
  );

DROP POLICY IF EXISTS "Admins manage zones" ON public.zones;
CREATE POLICY "Admins manage zones"
  ON public.zones FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =============================================================================
-- RLS Policies — collectors (admin + operator read, admin write)
-- =============================================================================
DROP POLICY IF EXISTS "Ops read collectors" ON public.collectors;
CREATE POLICY "Ops read collectors"
  ON public.collectors FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'operator')
  );

DROP POLICY IF EXISTS "Admins insert collectors" ON public.collectors;
CREATE POLICY "Admins insert collectors"
  ON public.collectors FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins update collectors" ON public.collectors;
CREATE POLICY "Admins update collectors"
  ON public.collectors FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins delete collectors" ON public.collectors;
CREATE POLICY "Admins delete collectors"
  ON public.collectors FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- =============================================================================
-- RLS Policies — tasks (admin + operator read, admin + operator write)
-- =============================================================================
DROP POLICY IF EXISTS "Ops read tasks" ON public.tasks;
CREATE POLICY "Ops read tasks"
  ON public.tasks FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'operator')
  );

DROP POLICY IF EXISTS "Ops insert tasks" ON public.tasks;
CREATE POLICY "Ops insert tasks"
  ON public.tasks FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'operator')
  );

DROP POLICY IF EXISTS "Ops update tasks" ON public.tasks;
CREATE POLICY "Ops update tasks"
  ON public.tasks FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'operator')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'operator')
  );

DROP POLICY IF EXISTS "Admins delete tasks" ON public.tasks;
CREATE POLICY "Admins delete tasks"
  ON public.tasks FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- =============================================================================
-- RLS Policies — submissions (admin + operator read, admin + operator write)
-- =============================================================================
DROP POLICY IF EXISTS "Ops read submissions" ON public.submissions;
CREATE POLICY "Ops read submissions"
  ON public.submissions FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'operator')
  );

DROP POLICY IF EXISTS "Ops insert submissions" ON public.submissions;
CREATE POLICY "Ops insert submissions"
  ON public.submissions FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'operator')
  );

DROP POLICY IF EXISTS "Ops update submissions" ON public.submissions;
CREATE POLICY "Ops update submissions"
  ON public.submissions FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'operator')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'operator')
  );

DROP POLICY IF EXISTS "Admins delete submissions" ON public.submissions;
CREATE POLICY "Admins delete submissions"
  ON public.submissions FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- =============================================================================
-- RLS Policies — task_events (admin + operator read, admin + operator insert)
-- =============================================================================
DROP POLICY IF EXISTS "Ops read task_events" ON public.task_events;
CREATE POLICY "Ops read task_events"
  ON public.task_events FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'operator')
  );

DROP POLICY IF EXISTS "Ops insert task_events" ON public.task_events;
CREATE POLICY "Ops insert task_events"
  ON public.task_events FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'operator')
  );

-- =============================================================================
-- RLS Policies — whatsapp_sessions (admin + operator access)
-- =============================================================================
DROP POLICY IF EXISTS "Ops read whatsapp_sessions" ON public.whatsapp_sessions;
CREATE POLICY "Ops read whatsapp_sessions"
  ON public.whatsapp_sessions FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'operator')
  );

DROP POLICY IF EXISTS "Ops insert whatsapp_sessions" ON public.whatsapp_sessions;
CREATE POLICY "Ops insert whatsapp_sessions"
  ON public.whatsapp_sessions FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'operator')
  );

DROP POLICY IF EXISTS "Ops update whatsapp_sessions" ON public.whatsapp_sessions;
CREATE POLICY "Ops update whatsapp_sessions"
  ON public.whatsapp_sessions FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'operator')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'operator')
  );

DROP POLICY IF EXISTS "Admins delete whatsapp_sessions" ON public.whatsapp_sessions;
CREATE POLICY "Admins delete whatsapp_sessions"
  ON public.whatsapp_sessions FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- =============================================================================
-- Lock down execute on helper functions
-- =============================================================================
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_role_self_escalation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.user_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.user_role) TO authenticated;
