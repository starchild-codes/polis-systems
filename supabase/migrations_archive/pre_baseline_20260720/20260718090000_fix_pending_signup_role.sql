-- New sign-ups are intentionally unapproved until an administrator assigns
-- them an organization membership. The auth-user trigger relies on this enum
-- value, so ensure it exists even on projects where the earlier enum migration
-- was not recorded/applied.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum AS enum_value
    JOIN pg_type AS enum_type ON enum_type.oid = enum_value.enumtypid
    JOIN pg_namespace AS enum_namespace ON enum_namespace.oid = enum_type.typnamespace
    WHERE enum_namespace.nspname = 'public'
      AND enum_type.typname = 'user_role'
      AND enum_value.enumlabel = 'pending'
  ) THEN
    ALTER TYPE public.user_role ADD VALUE 'pending';
  END IF;
END;
$$;

ALTER TABLE public.profiles
  ALTER COLUMN role SET DEFAULT 'pending'::public.user_role;
