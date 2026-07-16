/*
# Create test operator user

1. Purpose
- Creates a test auth user (ops@polissystems.example.in / Operator123!) for development and testing.
- Sets their profile role to 'operator' so they can access the dashboard.

2. Changes
- Inserts a new row into auth.users with a bcrypt-hashed password.
- Updates the corresponding profile (created by the on_auth_user_created trigger) to role = 'operator'.
- Temporarily disables the prevent_role_self_escalation trigger to allow the role assignment.

3. Security
- This is a test/development user only. In production, admin users would assign roles through the UI.
- The trigger is re-enabled after the update.
*/

-- Create the auth user
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
VALUES (
  gen_random_uuid(),
  'ops@polissystems.example.in',
  crypt('Operator123!', gen_salt('bf')),
  now(),
  now(),
  now(),
  '{}'::jsonb,
  '{"full_name": "Test Operator"}'::jsonb
)
ON CONFLICT DO NOTHING;

-- Allow the role update by temporarily disabling the escalation prevention trigger
ALTER TABLE public.profiles DISABLE TRIGGER profiles_block_role_escalation;

UPDATE public.profiles 
SET role = 'operator' 
WHERE email = 'ops@polissystems.example.in';

ALTER TABLE public.profiles ENABLE TRIGGER profiles_block_role_escalation;
