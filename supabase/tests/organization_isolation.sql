-- Reproducible organization-isolation test for the production schema.
-- All test rows are created inside this transaction and are rolled back.

BEGIN;

CREATE TEMP TABLE tenant_test_results (
  test_name text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text NOT NULL
);
GRANT SELECT, INSERT, UPDATE ON tenant_test_results TO authenticated;

CREATE TEMP TABLE tenant_test_context (
  key text PRIMARY KEY,
  value uuid NOT NULL
);
GRANT SELECT ON tenant_test_context TO authenticated;

INSERT INTO tenant_test_context (key, value)
SELECT 'user_a', id FROM public.profiles WHERE lower(email) = 'anshima1000@gmail.com'
UNION ALL
SELECT 'org_a', active_organization_id FROM public.profiles WHERE lower(email) = 'anshima1000@gmail.com'
UNION ALL
SELECT 'user_b', id FROM public.profiles WHERE lower(email) = 'anshima0003@gmail.com'
UNION ALL
SELECT 'org_b', active_organization_id FROM public.profiles WHERE lower(email) = 'anshima0003@gmail.com'
UNION ALL SELECT 'zone_a', gen_random_uuid()
UNION ALL SELECT 'collector_a', gen_random_uuid()
UNION ALL SELECT 'task_a', gen_random_uuid()
UNION ALL SELECT 'submission_a', gen_random_uuid()
UNION ALL SELECT 'zone_b', gen_random_uuid()
UNION ALL SELECT 'collector_b', gen_random_uuid()
UNION ALL SELECT 'task_b', gen_random_uuid()
UNION ALL SELECT 'pending_user', gen_random_uuid();

CREATE OR REPLACE FUNCTION pg_temp.record_tenant_test(
  p_test_name text,
  p_passed boolean,
  p_detail text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO pg_temp.tenant_test_results (test_name, passed, detail)
  VALUES (p_test_name, p_passed, p_detail)
  ON CONFLICT (test_name)
  DO UPDATE SET passed = EXCLUDED.passed, detail = EXCLUDED.detail;
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.record_tenant_test(text, boolean, text) TO authenticated;

-- User A creates a complete Organization A workflow using database-derived
-- organization defaults rather than browser-supplied organization IDs.
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM tenant_test_context WHERE key = 'user_a'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  org_a uuid := (SELECT value FROM pg_temp.tenant_test_context WHERE key = 'org_a');
  zone_a uuid := (SELECT value FROM pg_temp.tenant_test_context WHERE key = 'zone_a');
  collector_a uuid := (SELECT value FROM pg_temp.tenant_test_context WHERE key = 'collector_a');
  task_a uuid := (SELECT value FROM pg_temp.tenant_test_context WHERE key = 'task_a');
  submission_a uuid := (SELECT value FROM pg_temp.tenant_test_context WHERE key = 'submission_a');
BEGIN
  INSERT INTO public.zones (id, name) VALUES (zone_a, 'RLS Test Zone A');
  INSERT INTO public.collectors (id, name, phone_e164, zone_id, status)
  VALUES (collector_a, 'RLS Collector A', '+19990000001', zone_a, 'active');
  INSERT INTO public.tasks (id, title, hotspot_type, priority, status, collector_id, zone_id)
  VALUES (task_a, 'RLS Task A', 'Test', 'low', 'assigned', collector_a, zone_a);
  INSERT INTO public.submissions (id, task_id, collector_id, review_status)
  VALUES (submission_a, task_a, collector_a, 'pending');
  INSERT INTO public.task_events (task_id, event_type, actor_type, metadata)
  VALUES (task_a, 'rls_test_created', 'operator', '{"test":true}'::jsonb);
  INSERT INTO public.whatsapp_sessions (collector_id, task_id, conversation_state)
  VALUES (collector_a, task_a, 'idle');

  PERFORM pg_temp.record_tenant_test(
    'A creates organization-owned workflow',
    (SELECT organization_id = org_a AND created_by = auth.uid() FROM public.tasks WHERE id = task_a),
    'Task organization and creator are derived by the database'
  );
  PERFORM pg_temp.record_tenant_test(
    'A sees own tasks and collectors',
    (SELECT count(*) = 1 FROM public.tasks WHERE id = task_a)
      AND (SELECT count(*) = 1 FROM public.collectors WHERE id = collector_a),
    'Organization A can read its new task and collector'
  );
  PERFORM pg_temp.record_tenant_test(
    'A Review source is visible',
    (SELECT count(*) = 1 FROM public.submissions WHERE id = submission_a),
    'Organization A can read its pending submission'
  );
  PERFORM pg_temp.record_tenant_test(
    'A audit and WhatsApp rows are scoped',
    (SELECT count(*) = 1 FROM public.task_events WHERE task_id = task_a AND organization_id = org_a)
      AND (SELECT count(*) = 1 FROM public.whatsapp_sessions WHERE task_id = task_a AND organization_id = org_a),
    'Audit and WhatsApp state inherit Organization A'
  );
END
$$;

RESET ROLE;

-- User B starts with an empty organization and cannot see or mutate A.
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM tenant_test_context WHERE key = 'user_b'), true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  org_a uuid := (SELECT value FROM pg_temp.tenant_test_context WHERE key = 'org_a');
  org_b uuid := (SELECT value FROM pg_temp.tenant_test_context WHERE key = 'org_b');
  zone_a uuid := (SELECT value FROM pg_temp.tenant_test_context WHERE key = 'zone_a');
  collector_a uuid := (SELECT value FROM pg_temp.tenant_test_context WHERE key = 'collector_a');
  task_a uuid := (SELECT value FROM pg_temp.tenant_test_context WHERE key = 'task_a');
  submission_a uuid := (SELECT value FROM pg_temp.tenant_test_context WHERE key = 'submission_a');
  zone_b uuid := (SELECT value FROM pg_temp.tenant_test_context WHERE key = 'zone_b');
  collector_b uuid := (SELECT value FROM pg_temp.tenant_test_context WHERE key = 'collector_b');
  task_b uuid := (SELECT value FROM pg_temp.tenant_test_context WHERE key = 'task_b');
  affected_rows integer;
  blocked boolean;
BEGIN
  PERFORM pg_temp.record_tenant_test(
    'B receives zero A operational rows',
    (SELECT count(*) = 0 FROM public.tasks WHERE organization_id = org_a)
      AND (SELECT count(*) = 0 FROM public.collectors WHERE organization_id = org_a)
      AND (SELECT count(*) = 0 FROM public.submissions WHERE organization_id = org_a)
      AND (SELECT count(*) = 0 FROM public.task_events WHERE organization_id = org_a)
      AND (SELECT count(*) = 0 FROM public.whatsapp_sessions WHERE organization_id = org_a),
    'Direct SELECTs cannot expose Organization A to User B'
  );

  UPDATE public.tasks SET title = 'Cross-tenant update attempted' WHERE id = task_a;
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  PERFORM pg_temp.record_tenant_test(
    'B cannot update A task', affected_rows = 0,
    'The cross-organization UPDATE affected zero rows'
  );

  DELETE FROM public.tasks WHERE id = task_a;
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  PERFORM pg_temp.record_tenant_test(
    'B cannot delete A task', affected_rows = 0,
    'The cross-organization DELETE affected zero rows'
  );

  blocked := false;
  BEGIN
    INSERT INTO public.tasks (title, hotspot_type, priority, status, organization_id)
    VALUES ('Forged Organization A task', 'Test', 'low', 'draft', org_a);
  EXCEPTION WHEN insufficient_privilege OR check_violation OR foreign_key_violation OR not_null_violation THEN
    blocked := true;
  END;
  PERFORM pg_temp.record_tenant_test(
    'B cannot forge A organization ID', blocked,
    'RLS WITH CHECK rejects an explicit Organization A insert'
  );

  blocked := false;
  BEGIN
    INSERT INTO public.tasks (title, hotspot_type, priority, status, collector_id)
    VALUES ('Cross-organization collector reference', 'Test', 'low', 'draft', collector_a);
  EXCEPTION WHEN foreign_key_violation OR insufficient_privilege OR check_violation THEN
    blocked := true;
  END;
  PERFORM pg_temp.record_tenant_test(
    'B cannot reference A collector', blocked,
    'Composite foreign key blocks a cross-organization relationship'
  );

  blocked := false;
  BEGIN
    PERFORM public.delete_task_safely(task_a);
  EXCEPTION WHEN OTHERS THEN
    blocked := true;
  END;
  PERFORM pg_temp.record_tenant_test(
    'B safe-delete RPC cannot target A', blocked,
    'Security-definer deletion checks the target organization'
  );

  blocked := false;
  BEGIN
    PERFORM public.review_submission_safely(submission_a, auth.uid(), 'approved', NULL);
  EXCEPTION WHEN OTHERS THEN
    blocked := true;
  END;
  PERFORM pg_temp.record_tenant_test(
    'B Review RPC cannot target A', blocked,
    'Security-definer review checks the submission organization'
  );

  INSERT INTO public.zones (id, name) VALUES (zone_b, 'RLS Test Zone B');
  INSERT INTO public.collectors (id, name, phone_e164, zone_id, status)
  VALUES (collector_b, 'RLS Collector B', '+19990000002', zone_b, 'active');
  INSERT INTO public.tasks (id, title, hotspot_type, priority, status, collector_id, zone_id)
  VALUES (task_b, 'RLS Task B', 'Test', 'low', 'assigned', collector_b, zone_b);

  PERFORM pg_temp.record_tenant_test(
    'B creates and sees only B data',
    (SELECT organization_id = org_b AND created_by = auth.uid() FROM public.tasks WHERE id = task_b)
      AND (SELECT count(*) = 1 FROM public.collectors WHERE id = collector_b)
      AND (SELECT count(*) = 1 FROM public.tasks WHERE id = task_b),
    'Organization B defaults and reads are isolated'
  );
END
$$;

RESET ROLE;

-- User A cannot see User B's newly created rows. These are the same task and
-- collector sources used by Reports and CSV export.
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM tenant_test_context WHERE key = 'user_a'), true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  org_b uuid := (SELECT value FROM pg_temp.tenant_test_context WHERE key = 'org_b');
  task_a uuid := (SELECT value FROM pg_temp.tenant_test_context WHERE key = 'task_a');
  task_b uuid := (SELECT value FROM pg_temp.tenant_test_context WHERE key = 'task_b');
BEGIN
  PERFORM pg_temp.record_tenant_test(
    'A receives zero B report and CSV rows',
    (SELECT count(*) = 0 FROM public.tasks WHERE organization_id = org_b)
      AND (SELECT count(*) = 0 FROM public.collectors WHERE organization_id = org_b)
      AND (SELECT count(*) = 0 FROM public.submissions WHERE organization_id = org_b),
    'Reports and CSV source queries cannot include Organization B'
  );
  PERFORM pg_temp.record_tenant_test(
    'A still sees A after B activity',
    (SELECT count(*) = 1 FROM public.tasks WHERE id = task_a)
      AND (SELECT count(*) = 0 FROM public.tasks WHERE id = task_b),
    'Organization A remains isolated after Organization B writes'
  );
END
$$;

RESET ROLE;

-- A JWT with no organization membership represents a pending/unapproved user.
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM tenant_test_context WHERE key = 'pending_user'), true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  blocked boolean := false;
BEGIN
  PERFORM pg_temp.record_tenant_test(
    'Pending user receives zero operational rows',
    (SELECT count(*) = 0 FROM public.zones)
      AND (SELECT count(*) = 0 FROM public.collectors)
      AND (SELECT count(*) = 0 FROM public.tasks)
      AND (SELECT count(*) = 0 FROM public.submissions)
      AND (SELECT count(*) = 0 FROM public.task_events)
      AND (SELECT count(*) = 0 FROM public.whatsapp_sessions),
    'No-membership JWT cannot read operational data'
  );

  BEGIN
    INSERT INTO public.tasks (title, hotspot_type, priority, status)
    VALUES ('Pending user task', 'Test', 'low', 'draft');
  EXCEPTION WHEN insufficient_privilege OR check_violation OR not_null_violation OR foreign_key_violation THEN
    blocked := true;
  END;
  PERFORM pg_temp.record_tenant_test(
    'Pending user cannot create operational data', blocked,
    'No-membership JWT cannot satisfy organization ownership checks'
  );
END
$$;

RESET ROLE;

SELECT json_build_object(
  'passed', count(*) FILTER (WHERE passed),
  'failed', count(*) FILTER (WHERE NOT passed),
  'results', json_agg(
    json_build_object('test', test_name, 'passed', passed, 'detail', detail)
    ORDER BY test_name
  )
) AS organization_isolation_test
FROM tenant_test_results;

ROLLBACK;
