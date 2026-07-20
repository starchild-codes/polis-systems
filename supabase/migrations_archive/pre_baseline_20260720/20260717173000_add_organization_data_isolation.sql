-- Organization-level data isolation for Polis Systems.
-- This migration deliberately bootstraps the two audited production accounts
-- into separate organizations and aborts if production data changed after the
-- ownership audit performed on 2026-07-17.

BEGIN;

DO $$
BEGIN
  CREATE TYPE public.organization_role AS ENUM ('admin', 'operator');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.organization_members (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role public.organization_role NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS active_organization_id uuid;
ALTER TABLE public.zones
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.collectors
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.task_events
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.whatsapp_sessions
  ADD COLUMN IF NOT EXISTS organization_id uuid;

CREATE OR REPLACE FUNCTION public.is_org_member(_user_id uuid, _organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members AS membership
    WHERE membership.user_id = _user_id
      AND membership.organization_id = _organization_id
      AND membership.is_active
  );
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(
  _user_id uuid,
  _organization_id uuid,
  _role public.organization_role
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members AS membership
    WHERE membership.user_id = _user_id
      AND membership.organization_id = _organization_id
      AND membership.role = _role
      AND membership.is_active
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_organization_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT profile.active_organization_id
  FROM public.profiles AS profile
  JOIN public.organization_members AS membership
    ON membership.user_id = profile.id
   AND membership.organization_id = profile.active_organization_id
   AND membership.is_active
  WHERE profile.id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.shares_active_organization(_left_user_id uuid, _right_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members AS left_membership
    JOIN public.organization_members AS right_membership
      ON right_membership.organization_id = left_membership.organization_id
     AND right_membership.is_active
    WHERE left_membership.user_id = _left_user_id
      AND right_membership.user_id = _right_user_id
      AND left_membership.is_active
  );
$$;

-- Preserve compatibility for callers that still ask whether a user is a
-- dashboard user, but require an active organization membership.
CREATE OR REPLACE FUNCTION public.is_dashboard_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.is_org_member(auth.uid(), public.current_user_organization_id());
$$;

-- A legacy profile role never authorizes access by itself. This compatibility
-- helper now also requires the matching role in the user's active organization.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.user_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE _role
    WHEN 'admin'::public.user_role THEN public.has_org_role(
      _user_id,
      (SELECT p.active_organization_id FROM public.profiles AS p WHERE p.id = _user_id),
      'admin'::public.organization_role
    )
    WHEN 'operator'::public.user_role THEN public.has_org_role(
      _user_id,
      (SELECT p.active_organization_id FROM public.profiles AS p WHERE p.id = _user_id),
      'operator'::public.organization_role
    )
    ELSE false
  END;
$$;

LOCK TABLE public.profiles, public.zones, public.collectors, public.tasks,
  public.submissions, public.task_events, public.whatsapp_sessions
  IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  primary_user_id uuid;
  secondary_user_id uuid;
  secondary_created_at timestamptz;
  primary_organization_id uuid;
  secondary_organization_id uuid;
  latest_operational_row timestamptz;
BEGIN
  SELECT id INTO primary_user_id
  FROM public.profiles
  WHERE lower(email) = 'anshima1000@gmail.com' AND role = 'admin'::public.user_role;

  SELECT id, created_at INTO secondary_user_id, secondary_created_at
  FROM public.profiles
  WHERE lower(email) = 'anshima0003@gmail.com' AND role = 'admin'::public.user_role;

  IF primary_user_id IS NULL OR secondary_user_id IS NULL THEN
    RAISE EXCEPTION 'Organization bootstrap accounts do not match the audited production accounts';
  END IF;

  IF (SELECT count(*) FROM public.profiles WHERE role IN ('admin', 'operator')) <> 2 THEN
    RAISE EXCEPTION 'Approved profile count changed after the ownership audit';
  END IF;

  IF (SELECT count(*) FROM public.zones) <> 5
     OR (SELECT count(*) FROM public.collectors) <> 2
     OR (SELECT count(*) FROM public.tasks) <> 2
     OR (SELECT count(*) FROM public.submissions) <> 0
     OR (SELECT count(*) FROM public.task_events) <> 6
     OR (SELECT count(*) FROM public.whatsapp_sessions) <> 0 THEN
    RAISE EXCEPTION 'Operational row counts changed after the ownership audit';
  END IF;

  SELECT max(created_at) INTO latest_operational_row
  FROM (
    SELECT created_at FROM public.zones
    UNION ALL SELECT created_at FROM public.collectors
    UNION ALL SELECT created_at FROM public.tasks
    UNION ALL SELECT created_at FROM public.submissions
    UNION ALL SELECT created_at FROM public.task_events
    UNION ALL SELECT created_at FROM public.whatsapp_sessions
  ) AS operational_rows;

  IF latest_operational_row IS NULL OR latest_operational_row >= secondary_created_at THEN
    RAISE EXCEPTION 'Existing operational ownership is ambiguous; backfill stopped';
  END IF;

  primary_organization_id := md5('polis-organization:' || primary_user_id::text)::uuid;
  secondary_organization_id := md5('polis-organization:' || secondary_user_id::text)::uuid;

  INSERT INTO public.organizations (id, name)
  VALUES
    (primary_organization_id, 'Anshima 1000 Operations'),
    (secondary_organization_id, 'Anshima 0003 Operations')
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

  INSERT INTO public.organization_members (organization_id, user_id, role, is_active)
  VALUES
    (primary_organization_id, primary_user_id, 'admin', true),
    (secondary_organization_id, secondary_user_id, 'admin', true)
  ON CONFLICT (organization_id, user_id)
  DO UPDATE SET role = EXCLUDED.role, is_active = true, updated_at = now();

  UPDATE public.profiles
  SET active_organization_id = CASE id
    WHEN primary_user_id THEN primary_organization_id
    WHEN secondary_user_id THEN secondary_organization_id
  END
  WHERE id IN (primary_user_id, secondary_user_id);

  UPDATE public.zones SET organization_id = primary_organization_id;
  UPDATE public.collectors SET organization_id = primary_organization_id;
  UPDATE public.tasks
  SET organization_id = primary_organization_id,
      created_by = COALESCE(created_by, primary_user_id);
  UPDATE public.submissions SET organization_id = primary_organization_id;
  UPDATE public.task_events
  SET organization_id = primary_organization_id,
      actor_id = CASE
        WHEN actor_type IN ('admin', 'operator') AND actor_id IS NULL THEN primary_user_id
        ELSE actor_id
      END;
  UPDATE public.whatsapp_sessions SET organization_id = primary_organization_id;
END
$$;

ALTER TABLE public.zones ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.collectors ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.tasks ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.submissions ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.task_events ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.whatsapp_sessions ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE public.zones
  ALTER COLUMN organization_id SET DEFAULT public.current_user_organization_id();
ALTER TABLE public.collectors
  ALTER COLUMN organization_id SET DEFAULT public.current_user_organization_id();
ALTER TABLE public.tasks
  ALTER COLUMN organization_id SET DEFAULT public.current_user_organization_id(),
  ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.submissions
  ALTER COLUMN organization_id SET DEFAULT public.current_user_organization_id();
ALTER TABLE public.task_events
  ALTER COLUMN organization_id SET DEFAULT public.current_user_organization_id();
ALTER TABLE public.whatsapp_sessions
  ALTER COLUMN organization_id SET DEFAULT public.current_user_organization_id();

ALTER TABLE public.zones DROP CONSTRAINT IF EXISTS zones_name_key;
ALTER TABLE public.zones
  ADD CONSTRAINT zones_organization_name_key UNIQUE (organization_id, name),
  ADD CONSTRAINT zones_id_organization_key UNIQUE (id, organization_id);
ALTER TABLE public.collectors
  ADD CONSTRAINT collectors_id_organization_key UNIQUE (id, organization_id);
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_id_organization_key UNIQUE (id, organization_id);

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_active_organization_membership_fkey
  FOREIGN KEY (active_organization_id, id)
  REFERENCES public.organization_members(organization_id, user_id);

ALTER TABLE public.collectors DROP CONSTRAINT IF EXISTS collectors_zone_id_fkey;
ALTER TABLE public.collectors
  ADD CONSTRAINT collectors_zone_organization_fkey
  FOREIGN KEY (zone_id, organization_id)
  REFERENCES public.zones(id, organization_id);

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_collector_id_fkey;
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_zone_id_fkey;
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_created_by_fkey;
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_collector_organization_fkey
    FOREIGN KEY (collector_id, organization_id)
    REFERENCES public.collectors(id, organization_id),
  ADD CONSTRAINT tasks_zone_organization_fkey
    FOREIGN KEY (zone_id, organization_id)
    REFERENCES public.zones(id, organization_id),
  ADD CONSTRAINT tasks_creator_organization_fkey
    FOREIGN KEY (organization_id, created_by)
    REFERENCES public.organization_members(organization_id, user_id);

ALTER TABLE public.submissions DROP CONSTRAINT IF EXISTS submissions_task_id_fkey;
ALTER TABLE public.submissions DROP CONSTRAINT IF EXISTS submissions_collector_id_fkey;
ALTER TABLE public.submissions DROP CONSTRAINT IF EXISTS submissions_reviewed_by_fkey;
ALTER TABLE public.submissions
  ADD CONSTRAINT submissions_task_organization_fkey
    FOREIGN KEY (task_id, organization_id)
    REFERENCES public.tasks(id, organization_id) ON DELETE CASCADE,
  ADD CONSTRAINT submissions_collector_organization_fkey
    FOREIGN KEY (collector_id, organization_id)
    REFERENCES public.collectors(id, organization_id),
  ADD CONSTRAINT submissions_reviewer_organization_fkey
    FOREIGN KEY (organization_id, reviewed_by)
    REFERENCES public.organization_members(organization_id, user_id);

ALTER TABLE public.task_events DROP CONSTRAINT IF EXISTS task_events_task_id_fkey;
ALTER TABLE public.task_events
  ADD CONSTRAINT task_events_task_organization_fkey
  FOREIGN KEY (task_id, organization_id)
  REFERENCES public.tasks(id, organization_id) ON DELETE CASCADE;

ALTER TABLE public.whatsapp_sessions DROP CONSTRAINT IF EXISTS whatsapp_sessions_collector_id_fkey;
ALTER TABLE public.whatsapp_sessions DROP CONSTRAINT IF EXISTS whatsapp_sessions_task_id_fkey;
ALTER TABLE public.whatsapp_sessions
  ADD CONSTRAINT whatsapp_sessions_collector_organization_fkey
    FOREIGN KEY (collector_id, organization_id)
    REFERENCES public.collectors(id, organization_id) ON DELETE CASCADE,
  ADD CONSTRAINT whatsapp_sessions_task_organization_fkey
    FOREIGN KEY (task_id, organization_id)
    REFERENCES public.tasks(id, organization_id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_organization_members_user_active
  ON public.organization_members(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_zones_organization_id ON public.zones(organization_id);
CREATE INDEX IF NOT EXISTS idx_collectors_organization_id ON public.collectors(organization_id);
CREATE INDEX IF NOT EXISTS idx_tasks_organization_id ON public.tasks(organization_id);
CREATE INDEX IF NOT EXISTS idx_submissions_organization_id ON public.submissions(organization_id);
CREATE INDEX IF NOT EXISTS idx_task_events_organization_id ON public.task_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_organization_id ON public.whatsapp_sessions(organization_id);

CREATE OR REPLACE FUNCTION public.set_current_tenant_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := public.current_user_organization_id();
  END IF;
  IF TG_TABLE_NAME = 'tasks' AND NEW.created_by IS NULL AND auth.uid() IS NOT NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_current_task_event_actor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.actor_type IN ('admin', 'operator') AND NEW.actor_id IS NULL THEN
    NEW.actor_id := auth.uid();
  END IF;
  IF NEW.actor_type IN ('admin', 'operator')
     AND NOT public.is_org_member(NEW.actor_id, NEW.organization_id) THEN
    RAISE EXCEPTION 'Task event actor is not a member of the task organization';
  END IF;
  IF NEW.actor_type = 'collector'
     AND NOT EXISTS (
       SELECT 1 FROM public.collectors AS collector
       WHERE collector.id = NEW.actor_id
         AND collector.organization_id = NEW.organization_id
     ) THEN
    RAISE EXCEPTION 'Task event collector is not in the task organization';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_set_current_tenant ON public.tasks;
CREATE TRIGGER tasks_set_current_tenant
  BEFORE INSERT ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_current_tenant_fields();

DROP TRIGGER IF EXISTS task_events_set_current_actor ON public.task_events;
CREATE TRIGGER task_events_set_current_actor
  BEFORE INSERT ON public.task_events
  FOR EACH ROW EXECUTE FUNCTION public.set_current_task_event_actor();

DROP TRIGGER IF EXISTS trg_organizations_updated_at ON public.organizations;
CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_organization_members_updated_at ON public.organization_members;
CREATE TRIGGER trg_organization_members_updated_at
  BEFORE UPDATE ON public.organization_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, role, active_organization_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name'),
    NEW.raw_user_meta_data ->> 'avatar_url',
    'pending'::public.user_role,
    NULL
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.manage_organization_member(
  p_organization_id uuid,
  p_user_id uuid,
  p_role public.organization_role,
  p_is_active boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.has_org_role(auth.uid(), p_organization_id, 'admin') THEN
    RAISE EXCEPTION 'Only an organization administrator can manage organization members';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  INSERT INTO public.organization_members (organization_id, user_id, role, is_active)
  VALUES (p_organization_id, p_user_id, p_role, p_is_active)
  ON CONFLICT (organization_id, user_id)
  DO UPDATE SET role = EXCLUDED.role, is_active = EXCLUDED.is_active, updated_at = now();

  IF p_is_active THEN
    UPDATE public.profiles
    SET active_organization_id = p_organization_id,
        role = p_role::text::public.user_role
    WHERE id = p_user_id;
  ELSE
    UPDATE public.profiles
    SET active_organization_id = NULL,
        role = 'pending'::public.user_role
    WHERE id = p_user_id AND active_organization_id = p_organization_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_task_safely(p_task_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_organization_id uuid;
BEGIN
  SELECT organization_id INTO target_organization_id
  FROM public.tasks WHERE id = p_task_id;
  IF target_organization_id IS NULL
     OR NOT public.has_org_role(auth.uid(), target_organization_id, 'admin') THEN
    RAISE EXCEPTION 'Task not found or you do not have permission to delete it';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.submissions
    WHERE task_id = p_task_id AND organization_id = target_organization_id
  ) THEN
    RAISE EXCEPTION 'This task has a proof-of-work submission and cannot be deleted';
  END IF;
  DELETE FROM public.tasks
  WHERE id = p_task_id AND organization_id = target_organization_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_collector_safely(p_collector_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_organization_id uuid;
BEGIN
  SELECT organization_id INTO target_organization_id
  FROM public.collectors WHERE id = p_collector_id;
  IF target_organization_id IS NULL
     OR NOT public.has_org_role(auth.uid(), target_organization_id, 'admin') THEN
    RAISE EXCEPTION 'Collector not found or you do not have permission to delete it';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.tasks
    WHERE collector_id = p_collector_id
      AND organization_id = target_organization_id
      AND status IN ('assigned', 'accepted', 'in_progress', 'submitted')
  ) THEN
    RAISE EXCEPTION 'This collector has active assigned tasks. Reassign or remove those tasks before deleting the collector.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.submissions
    WHERE collector_id = p_collector_id AND organization_id = target_organization_id
  ) THEN
    RAISE EXCEPTION 'This collector has proof-of-work history and cannot be deleted while those submissions are retained.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.whatsapp_sessions
    WHERE collector_id = p_collector_id
      AND organization_id = target_organization_id
      AND conversation_state <> 'idle'
  ) THEN
    RAISE EXCEPTION 'This collector has an active WhatsApp workflow. Finish or reset it before deletion.';
  END IF;
  DELETE FROM public.whatsapp_sessions
  WHERE collector_id = p_collector_id
    AND organization_id = target_organization_id
    AND conversation_state = 'idle';
  DELETE FROM public.collectors
  WHERE id = p_collector_id AND organization_id = target_organization_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_submission_safely(
  p_submission_id uuid,
  p_reviewer_id uuid,
  p_decision public.review_status,
  p_rejection_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_organization_id uuid;
  target_task_id uuid;
  target_task_status public.task_status;
BEGIN
  IF p_reviewer_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Reviewer identity does not match the signed-in user';
  END IF;
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Review decision must be approved or rejected';
  END IF;
  IF p_decision = 'rejected' AND COALESCE(btrim(p_rejection_reason), '') = '' THEN
    RAISE EXCEPTION 'A rejection reason is required';
  END IF;

  SELECT submission.organization_id, submission.task_id, task.status
  INTO target_organization_id, target_task_id, target_task_status
  FROM public.submissions AS submission
  JOIN public.tasks AS task
    ON task.id = submission.task_id
   AND task.organization_id = submission.organization_id
  WHERE submission.id = p_submission_id
    AND submission.review_status = 'pending'
  FOR UPDATE OF submission, task;

  IF target_organization_id IS NULL
     OR NOT (
       public.has_org_role(auth.uid(), target_organization_id, 'admin')
       OR public.has_org_role(auth.uid(), target_organization_id, 'operator')
     ) THEN
    RAISE EXCEPTION 'Submission not found or you do not have permission to review it';
  END IF;

  UPDATE public.submissions
  SET review_status = p_decision,
      reviewed_by = p_reviewer_id,
      reviewed_at = now(),
      rejection_reason = CASE WHEN p_decision = 'rejected' THEN btrim(p_rejection_reason) ELSE NULL END,
      updated_at = now()
  WHERE id = p_submission_id AND organization_id = target_organization_id;

  UPDATE public.tasks
  SET status = CASE
      WHEN p_decision = 'approved' THEN 'approved'::public.task_status
      ELSE 'rejected'::public.task_status
    END,
    updated_at = now()
  WHERE id = target_task_id AND organization_id = target_organization_id;

  INSERT INTO public.task_events (
    organization_id, task_id, event_type, previous_status, new_status,
    actor_type, actor_id, metadata
  )
  VALUES (
    target_organization_id,
    target_task_id,
    CASE WHEN p_decision = 'approved' THEN 'submission_approved' ELSE 'submission_rejected' END,
    target_task_status,
    CASE WHEN p_decision = 'approved' THEN 'approved'::public.task_status ELSE 'rejected'::public.task_status END,
    'operator',
    p_reviewer_id,
    jsonb_build_object(
      'message', CASE
        WHEN p_decision = 'approved' THEN 'Submission approved by operator'
        ELSE 'Submission rejected: ' || btrim(p_rejection_reason)
      END,
      'submission_id', p_submission_id,
      'rejection_reason', CASE WHEN p_decision = 'rejected' THEN btrim(p_rejection_reason) ELSE NULL END
    )
  );
END;
$$;

-- Replace every legacy/global policy on tenant-owned tables.
DO $$
DECLARE
  policy_row record;
BEGIN
  FOR policy_row IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'organizations', 'organization_members', 'profiles', 'zones', 'collectors',
        'tasks', 'submissions', 'task_events', 'whatsapp_sessions'
      )
  LOOP
    EXECUTE format(
      'DROP POLICY %I ON %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
  END LOOP;
END
$$;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read their organizations"
  ON public.organizations FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), id));
CREATE POLICY "Organization admins update their organization"
  ON public.organizations FOR UPDATE TO authenticated
  USING (public.has_org_role(auth.uid(), id, 'admin'))
  WITH CHECK (public.has_org_role(auth.uid(), id, 'admin'));

CREATE POLICY "Members read memberships in their organization"
  ON public.organization_members FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "Users read own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid());
CREATE POLICY "Members read profiles in shared organizations"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.shares_active_organization(auth.uid(), id));
CREATE POLICY "Users update own safe profile fields"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND (
      active_organization_id IS NULL
      OR public.is_org_member(auth.uid(), active_organization_id)
    )
  );

CREATE POLICY "Members read zones"
  ON public.zones FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "Organization admins insert zones"
  ON public.zones FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(auth.uid(), organization_id, 'admin'));
CREATE POLICY "Organization admins update zones"
  ON public.zones FOR UPDATE TO authenticated
  USING (public.has_org_role(auth.uid(), organization_id, 'admin'))
  WITH CHECK (public.has_org_role(auth.uid(), organization_id, 'admin'));
CREATE POLICY "Organization admins delete zones"
  ON public.zones FOR DELETE TO authenticated
  USING (public.has_org_role(auth.uid(), organization_id, 'admin'));

CREATE POLICY "Members read collectors"
  ON public.collectors FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "Organization admins insert collectors"
  ON public.collectors FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(auth.uid(), organization_id, 'admin'));
CREATE POLICY "Organization admins update collectors"
  ON public.collectors FOR UPDATE TO authenticated
  USING (public.has_org_role(auth.uid(), organization_id, 'admin'))
  WITH CHECK (public.has_org_role(auth.uid(), organization_id, 'admin'));
CREATE POLICY "Organization admins delete collectors"
  ON public.collectors FOR DELETE TO authenticated
  USING (public.has_org_role(auth.uid(), organization_id, 'admin'));

CREATE POLICY "Members read tasks"
  ON public.tasks FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "Organization operators insert tasks"
  ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "Organization operators update tasks"
  ON public.tasks FOR UPDATE TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id))
  WITH CHECK (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "Organization admins delete tasks"
  ON public.tasks FOR DELETE TO authenticated
  USING (public.has_org_role(auth.uid(), organization_id, 'admin'));

CREATE POLICY "Members read submissions"
  ON public.submissions FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "Organization operators insert submissions"
  ON public.submissions FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "Organization operators update submissions"
  ON public.submissions FOR UPDATE TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id))
  WITH CHECK (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "Organization admins delete submissions"
  ON public.submissions FOR DELETE TO authenticated
  USING (public.has_org_role(auth.uid(), organization_id, 'admin'));

CREATE POLICY "Members read task events"
  ON public.task_events FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "Organization operators insert task events"
  ON public.task_events FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "Members read WhatsApp sessions"
  ON public.whatsapp_sessions FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "Organization operators insert WhatsApp sessions"
  ON public.whatsapp_sessions FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "Organization operators update WhatsApp sessions"
  ON public.whatsapp_sessions FOR UPDATE TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id))
  WITH CHECK (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "Organization admins delete WhatsApp sessions"
  ON public.whatsapp_sessions FOR DELETE TO authenticated
  USING (public.has_org_role(auth.uid(), organization_id, 'admin'));

REVOKE ALL ON TABLE public.organizations FROM anon, authenticated;
REVOKE ALL ON TABLE public.organization_members FROM anon, authenticated;
REVOKE ALL ON TABLE public.profiles FROM anon, authenticated;
REVOKE ALL ON TABLE public.zones FROM anon, authenticated;
REVOKE ALL ON TABLE public.collectors FROM anon, authenticated;
REVOKE ALL ON TABLE public.tasks FROM anon, authenticated;
REVOKE ALL ON TABLE public.submissions FROM anon, authenticated;
REVOKE ALL ON TABLE public.task_events FROM anon, authenticated;
REVOKE ALL ON TABLE public.whatsapp_sessions FROM anon, authenticated;

GRANT SELECT, UPDATE ON TABLE public.organizations TO authenticated;
GRANT SELECT ON TABLE public.organization_members TO authenticated;
GRANT SELECT ON TABLE public.profiles TO authenticated;
GRANT UPDATE (full_name, avatar_url) ON TABLE public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.zones TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.collectors TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tasks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.submissions TO authenticated;
GRANT SELECT, INSERT ON TABLE public.task_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.whatsapp_sessions TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_org_role(uuid, uuid, public.organization_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_user_organization_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.shares_active_organization(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_dashboard_user() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.user_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.manage_organization_member(uuid, uuid, public.organization_role, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_task_safely(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_collector_safely(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.review_submission_safely(uuid, uuid, public.review_status, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_org_role(uuid, uuid, public.organization_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_organization_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.shares_active_organization(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_dashboard_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.user_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.manage_organization_member(uuid, uuid, public.organization_role, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_task_safely(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_collector_safely(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_submission_safely(uuid, uuid, public.review_status, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_current_tenant_fields() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_current_task_event_actor() FROM PUBLIC, anon, authenticated;

COMMIT;
