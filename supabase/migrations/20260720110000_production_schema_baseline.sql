-- Polis Systems production schema baseline.
--
-- This migration is a schema-only representation of project
-- uykylkdnzeyfmiefxcfk as reviewed on 2026-07-20. It deliberately contains no
-- production organizations, users, zones, collectors, tasks, submissions, or
-- task events. Supabase's built-in auth schema and database roles must already
-- exist before this migration is applied.

BEGIN;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

CREATE TYPE public.user_role AS ENUM ('admin', 'operator', 'pending');
CREATE TYPE public.organization_role AS ENUM ('admin', 'operator');
CREATE TYPE public.collector_status AS ENUM (
  'active', 'inactive', 'pending_registration', 'suspended'
);
CREATE TYPE public.task_status AS ENUM (
  'draft', 'assigned', 'accepted', 'in_progress', 'submitted', 'approved',
  'declined', 'rejected', 'canceled'
);
CREATE TYPE public.task_priority AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE public.review_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE public.actor_type AS ENUM ('admin', 'operator', 'collector', 'system');
CREATE TYPE public.whatsapp_conversation_state AS ENUM (
  'idle', 'awaiting_acceptance', 'awaiting_before_photo',
  'awaiting_after_photo', 'awaiting_details', 'submitted'
);

-- ---------------------------------------------------------------------------
-- Identity and organization tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  email text UNIQUE,
  avatar_url text,
  role public.user_role NOT NULL DEFAULT 'pending'::public.user_role,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  active_organization_id uuid
);

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.organization_members (
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL
    REFERENCES public.profiles(id) ON DELETE CASCADE,
  role public.organization_role NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_active_organization_membership_fkey
  FOREIGN KEY (active_organization_id, id)
  REFERENCES public.organization_members(organization_id, user_id);

CREATE INDEX idx_organization_members_user_active
  ON public.organization_members(user_id, is_active);

-- ---------------------------------------------------------------------------
-- Organization authorization helpers
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.is_org_member(_user_id uuid, _organization_id uuid)
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

CREATE FUNCTION public.has_org_role(
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

CREATE FUNCTION public.current_user_organization_id()
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

CREATE FUNCTION public.shares_active_organization(
  _left_user_id uuid,
  _right_user_id uuid
)
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

CREATE FUNCTION public.is_dashboard_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.is_org_member(auth.uid(), public.current_user_organization_id());
$$;

CREATE FUNCTION public.has_role(_user_id uuid, _role public.user_role)
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

-- ---------------------------------------------------------------------------
-- Operational tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  organization_id uuid NOT NULL DEFAULT public.current_user_organization_id(),
  CONSTRAINT zones_organization_name_key UNIQUE (organization_id, name),
  CONSTRAINT zones_id_organization_key UNIQUE (id, organization_id)
);

CREATE TABLE public.collectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone_e164 text NOT NULL,
  zone_id uuid,
  status public.collector_status NOT NULL DEFAULT 'pending_registration'::public.collector_status,
  collector_type text,
  organization_affiliation text,
  preferred_language text,
  notes text,
  registered_at timestamptz NOT NULL DEFAULT now(),
  last_active_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  organization_id uuid NOT NULL DEFAULT public.current_user_organization_id(),
  CONSTRAINT collectors_phone_e164_format
    CHECK (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'::text),
  CONSTRAINT collectors_id_organization_key UNIQUE (id, organization_id),
  CONSTRAINT collectors_organization_phone_e164_key
    UNIQUE (organization_id, phone_e164),
  CONSTRAINT collectors_zone_organization_fkey
    FOREIGN KEY (zone_id, organization_id)
    REFERENCES public.zones(id, organization_id)
);

CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  hotspot_type text NOT NULL,
  priority public.task_priority NOT NULL,
  status public.task_status NOT NULL DEFAULT 'draft'::public.task_status,
  collector_id uuid,
  zone_id uuid,
  due_at timestamptz,
  address text,
  latitude double precision,
  longitude double precision,
  estimated_quantity text,
  instructions text,
  reference_photo_path text,
  internal_notes text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  organization_id uuid NOT NULL DEFAULT public.current_user_organization_id(),
  CONSTRAINT tasks_latitude_range
    CHECK (latitude IS NULL OR latitude >= '-90'::integer::double precision AND latitude <= '90'::integer::double precision),
  CONSTRAINT tasks_longitude_range
    CHECK (longitude IS NULL OR longitude >= '-180'::integer::double precision AND longitude <= '180'::integer::double precision),
  CONSTRAINT tasks_id_organization_key UNIQUE (id, organization_id),
  CONSTRAINT tasks_collector_organization_fkey
    FOREIGN KEY (collector_id, organization_id)
    REFERENCES public.collectors(id, organization_id),
  CONSTRAINT tasks_zone_organization_fkey
    FOREIGN KEY (zone_id, organization_id)
    REFERENCES public.zones(id, organization_id),
  CONSTRAINT tasks_creator_organization_fkey
    FOREIGN KEY (organization_id, created_by)
    REFERENCES public.organization_members(organization_id, user_id)
);

CREATE TABLE public.submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL UNIQUE,
  collector_id uuid NOT NULL,
  before_photo_path text,
  after_photo_path text,
  waste_type text,
  quantity_estimate text,
  collector_notes text,
  submitted_latitude double precision,
  submitted_longitude double precision,
  submitted_at timestamptz,
  review_status public.review_status NOT NULL DEFAULT 'pending'::public.review_status,
  reviewed_by uuid,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  organization_id uuid NOT NULL DEFAULT public.current_user_organization_id(),
  CONSTRAINT submissions_latitude_range
    CHECK (submitted_latitude IS NULL OR submitted_latitude >= '-90'::integer::double precision AND submitted_latitude <= '90'::integer::double precision),
  CONSTRAINT submissions_longitude_range
    CHECK (submitted_longitude IS NULL OR submitted_longitude >= '-180'::integer::double precision AND submitted_longitude <= '180'::integer::double precision),
  CONSTRAINT submissions_task_organization_fkey
    FOREIGN KEY (task_id, organization_id)
    REFERENCES public.tasks(id, organization_id) ON DELETE CASCADE,
  CONSTRAINT submissions_collector_organization_fkey
    FOREIGN KEY (collector_id, organization_id)
    REFERENCES public.collectors(id, organization_id),
  CONSTRAINT submissions_reviewer_organization_fkey
    FOREIGN KEY (organization_id, reviewed_by)
    REFERENCES public.organization_members(organization_id, user_id)
);

CREATE TABLE public.task_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL,
  event_type text NOT NULL,
  previous_status public.task_status,
  new_status public.task_status,
  actor_type public.actor_type NOT NULL,
  actor_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  organization_id uuid NOT NULL DEFAULT public.current_user_organization_id(),
  CONSTRAINT task_events_task_organization_fkey
    FOREIGN KEY (task_id, organization_id)
    REFERENCES public.tasks(id, organization_id) ON DELETE CASCADE
);

CREATE TABLE public.whatsapp_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collector_id uuid NOT NULL,
  task_id uuid,
  conversation_state public.whatsapp_conversation_state NOT NULL
    DEFAULT 'idle'::public.whatsapp_conversation_state,
  before_photo_path text,
  after_photo_path text,
  temporary_waste_type text,
  temporary_quantity text,
  temporary_notes text,
  last_message_sid text UNIQUE,
  last_interaction_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  organization_id uuid NOT NULL DEFAULT public.current_user_organization_id(),
  CONSTRAINT whatsapp_sessions_collector_id_unique UNIQUE (collector_id),
  CONSTRAINT whatsapp_sessions_collector_organization_fkey
    FOREIGN KEY (collector_id, organization_id)
    REFERENCES public.collectors(id, organization_id) ON DELETE CASCADE,
  CONSTRAINT whatsapp_sessions_task_organization_fkey
    FOREIGN KEY (task_id, organization_id)
    REFERENCES public.tasks(id, organization_id) ON DELETE CASCADE
);

CREATE INDEX idx_zones_organization_id ON public.zones(organization_id);
CREATE INDEX idx_collectors_status ON public.collectors(status);
CREATE INDEX idx_collectors_zone_id ON public.collectors(zone_id);
CREATE INDEX idx_collectors_organization_id ON public.collectors(organization_id);
CREATE INDEX idx_tasks_status ON public.tasks(status);
CREATE INDEX idx_tasks_priority ON public.tasks(priority);
CREATE INDEX idx_tasks_collector_id ON public.tasks(collector_id);
CREATE INDEX idx_tasks_zone_id ON public.tasks(zone_id);
CREATE INDEX idx_tasks_due_at ON public.tasks(due_at);
CREATE INDEX idx_tasks_organization_id ON public.tasks(organization_id);
CREATE INDEX idx_submissions_review_status ON public.submissions(review_status);
CREATE INDEX idx_submissions_collector_id ON public.submissions(collector_id);
CREATE INDEX idx_submissions_organization_id ON public.submissions(organization_id);
CREATE INDEX idx_task_events_task_id_created_at
  ON public.task_events(task_id, created_at);
CREATE INDEX idx_task_events_organization_id ON public.task_events(organization_id);
CREATE INDEX idx_whatsapp_sessions_task_id ON public.whatsapp_sessions(task_id);
CREATE INDEX idx_whatsapp_sessions_organization_id
  ON public.whatsapp_sessions(organization_id);

-- ---------------------------------------------------------------------------
-- Trigger and workflow functions
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
-- The E string preserves the CRLF function source stored in production.
AS E'\r\nBEGIN\r\n  NEW.updated_at = now();\r\n  RETURN NEW;\r\nEND;\r\n';

CREATE FUNCTION public.set_current_tenant_fields()
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

CREATE FUNCTION public.set_current_task_event_actor()
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

CREATE FUNCTION public.handle_new_user()
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

CREATE FUNCTION public.seed_standard_organization_zones()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.zones (organization_id, name)
  VALUES
    (NEW.id, 'North'),
    (NEW.id, 'South'),
    (NEW.id, 'East'),
    (NEW.id, 'West'),
    (NEW.id, 'Central')
  ON CONFLICT (organization_id, name) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.manage_organization_member(
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

CREATE FUNCTION public.delete_task_safely(p_task_id uuid)
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

CREATE FUNCTION public.delete_collector_safely(p_collector_id uuid)
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

CREATE FUNCTION public.review_submission_safely(
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

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_organization_members_updated_at
  BEFORE UPDATE ON public.organization_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_zones_updated_at
  BEFORE UPDATE ON public.zones
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_collectors_updated_at
  BEFORE UPDATE ON public.collectors
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_submissions_updated_at
  BEFORE UPDATE ON public.submissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_whatsapp_sessions_updated_at
  BEFORE UPDATE ON public.whatsapp_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER tasks_set_current_tenant
  BEFORE INSERT ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_current_tenant_fields();
CREATE TRIGGER task_events_set_current_actor
  BEFORE INSERT ON public.task_events
  FOR EACH ROW EXECUTE FUNCTION public.set_current_task_event_actor();
CREATE TRIGGER on_organization_created_seed_zones
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.seed_standard_organization_zones();
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row-level security policies
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- Table and function access control
-- ---------------------------------------------------------------------------

REVOKE ALL ON TABLE public.organizations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.organization_members FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.zones FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.collectors FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.tasks FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.submissions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.task_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.whatsapp_sessions FROM PUBLIC, anon, authenticated;

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

GRANT ALL ON TABLE public.organizations TO service_role;
GRANT ALL ON TABLE public.organization_members TO service_role;
GRANT ALL ON TABLE public.profiles TO service_role;
GRANT ALL ON TABLE public.zones TO service_role;
GRANT ALL ON TABLE public.collectors TO service_role;
GRANT ALL ON TABLE public.tasks TO service_role;
GRANT ALL ON TABLE public.submissions TO service_role;
GRANT ALL ON TABLE public.task_events TO service_role;
GRANT ALL ON TABLE public.whatsapp_sessions TO service_role;

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

GRANT EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_org_role(uuid, uuid, public.organization_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_organization_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.shares_active_organization(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_dashboard_user() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.user_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.manage_organization_member(uuid, uuid, public.organization_role, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_task_safely(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_collector_safely(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.review_submission_safely(uuid, uuid, public.review_status, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_standard_organization_zones() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_current_tenant_fields() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_current_task_event_actor() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.seed_standard_organization_zones() TO service_role;
GRANT EXECUTE ON FUNCTION public.set_current_tenant_fields() TO service_role;
GRANT EXECUTE ON FUNCTION public.set_current_task_event_actor() TO service_role;

-- Production currently leaves set_updated_at() executable by PUBLIC, anon, and
-- authenticated, and does not pin its search_path. This baseline preserves that
-- catalog state exactly; hardening belongs in a separately reviewed migration.
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO PUBLIC, anon, authenticated, service_role;

COMMIT;
