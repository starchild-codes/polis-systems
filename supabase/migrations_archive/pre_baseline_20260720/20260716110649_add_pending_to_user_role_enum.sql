/*
# Add 'pending' to user_role enum

Adds the 'pending' value to the user_role enum type so new signups can start
with an unprivileged role. This must be applied in a separate migration before
any subsequent migration references the 'pending' value, because PostgreSQL
requires new enum values to be committed before use.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'user_role' AND e.enumlabel = 'pending'
  ) THEN
    ALTER TYPE public.user_role ADD VALUE 'pending';
  END IF;
END $$;
