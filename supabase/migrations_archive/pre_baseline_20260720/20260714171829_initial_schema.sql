/*
# Polis Systems V1 - Initial Schema

## Purpose
Creates the minimal V1 database schema for the Polis Systems pilot - a
municipal waste-cleanup operations platform that manages tasks, collectors,
field submissions, WhatsApp-based proof-of-work collection, and review workflows.

## Enums
- user_role - admin, operator
- collector_status - active, inactive, pending_registration, suspended
- task_status - draft, assigned, accepted, in_progress, submitted, approved, declined, rejected, canceled
- task_priority - low, medium, high, urgent
- review_status - pending, approved, rejected
- actor_type - admin, operator, collector, system
- whatsapp_conversation_state - idle, awaiting_acceptance, awaiting_before_photo, awaiting_after_photo, awaiting_details, submitted

## Tables
1. profiles - Operator/admin profiles linked to auth users.
2. zones - Geographic zones for task assignment.
3. collectors - Field workers who execute cleanup tasks.
4. tasks - Cleanup tasks assigned to collectors.
5. submissions - Proof-of-work submitted by collectors, one per task.
6. task_events - Append-only audit log of task lifecycle transitions.
7. whatsapp_sessions - WhatsApp conversation state, one active session per collector.

## Security
- No Row Level Security policies in this migration.
- No data seeded.

## Notes
1. All PKs are UUIDs (gen_random_uuid()), except profiles.id which references auth.users(id).
2. task_events is append-only by application convention.
3. whatsapp_sessions.collector_id has a UNIQUE constraint for one active session per collector in V1.
*/

-- =============================================================================
-- Enums
-- =============================================================================

CREATE TYPE user_role AS ENUM ('admin', 'operator');

CREATE TYPE collector_status AS ENUM (
  'active',
  'inactive',
  'pending_registration',
  'suspended'
);

CREATE TYPE task_status AS ENUM (
  'draft',
  'assigned',
  'accepted',
  'in_progress',
  'submitted',
  'approved',
  'declined',
  'rejected',
  'canceled'
);

CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high', 'urgent');

CREATE TYPE review_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TYPE actor_type AS ENUM ('admin', 'operator', 'collector', 'system');

CREATE TYPE whatsapp_conversation_state AS ENUM (
  'idle',
  'awaiting_acceptance',
  'awaiting_before_photo',
  'awaiting_after_photo',
  'awaiting_details',
  'submitted'
);

-- =============================================================================
-- Tables
-- =============================================================================

CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  email text UNIQUE,
  avatar_url text,
  role user_role NOT NULL DEFAULT 'operator',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE collectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone_e164 text NOT NULL UNIQUE,
  zone_id uuid REFERENCES zones(id),
  status collector_status NOT NULL DEFAULT 'pending_registration',
  collector_type text,
  organization_affiliation text,
  preferred_language text,
  notes text,
  registered_at timestamptz NOT NULL DEFAULT now(),
  last_active_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT collectors_phone_e164_format CHECK (phone_e164 ~ '^\+[1-9][0-9]{7,14}$')
);

CREATE TABLE tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  hotspot_type text NOT NULL,
  priority task_priority NOT NULL,
  status task_status NOT NULL DEFAULT 'draft',
  collector_id uuid REFERENCES collectors(id),
  zone_id uuid REFERENCES zones(id),
  due_at timestamptz,
  address text,
  latitude double precision,
  longitude double precision,
  estimated_quantity text,
  instructions text,
  reference_photo_path text,
  internal_notes text,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tasks_latitude_range CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
  CONSTRAINT tasks_longitude_range CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180))
);

CREATE TABLE submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL UNIQUE REFERENCES tasks(id) ON DELETE CASCADE,
  collector_id uuid NOT NULL REFERENCES collectors(id),
  before_photo_path text,
  after_photo_path text,
  waste_type text,
  quantity_estimate text,
  collector_notes text,
  submitted_latitude double precision,
  submitted_longitude double precision,
  submitted_at timestamptz,
  review_status review_status NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES profiles(id),
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT submissions_latitude_range CHECK (submitted_latitude IS NULL OR (submitted_latitude >= -90 AND submitted_latitude <= 90)),
  CONSTRAINT submissions_longitude_range CHECK (submitted_longitude IS NULL OR (submitted_longitude >= -180 AND submitted_longitude <= 180))
);

CREATE TABLE task_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  previous_status task_status,
  new_status task_status,
  actor_type actor_type NOT NULL,
  actor_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE whatsapp_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collector_id uuid NOT NULL REFERENCES collectors(id) ON DELETE CASCADE,
  task_id uuid REFERENCES tasks(id) ON DELETE CASCADE,
  conversation_state whatsapp_conversation_state NOT NULL DEFAULT 'idle',
  before_photo_path text,
  after_photo_path text,
  temporary_waste_type text,
  temporary_quantity text,
  temporary_notes text,
  last_message_sid text UNIQUE,
  last_interaction_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_sessions_collector_id_unique UNIQUE (collector_id)
);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX idx_collectors_status ON collectors(status);
CREATE INDEX idx_collectors_zone_id ON collectors(zone_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_priority ON tasks(priority);
CREATE INDEX idx_tasks_collector_id ON tasks(collector_id);
CREATE INDEX idx_tasks_zone_id ON tasks(zone_id);
CREATE INDEX idx_tasks_due_at ON tasks(due_at);
CREATE INDEX idx_submissions_review_status ON submissions(review_status);
CREATE INDEX idx_submissions_collector_id ON submissions(collector_id);
CREATE INDEX idx_task_events_task_id_created_at ON task_events(task_id, created_at);
CREATE INDEX idx_whatsapp_sessions_task_id ON whatsapp_sessions(task_id);

-- =============================================================================
-- updated_at trigger function
-- =============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_zones_updated_at
  BEFORE UPDATE ON zones
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_collectors_updated_at
  BEFORE UPDATE ON collectors
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_submissions_updated_at
  BEFORE UPDATE ON submissions
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_whatsapp_sessions_updated_at
  BEFORE UPDATE ON whatsapp_sessions
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
