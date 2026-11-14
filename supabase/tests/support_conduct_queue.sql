\set ON_ERROR_STOP on

-- This fixture creates only the dependencies required by the conduct queue
-- migration. It runs in a disposable local PostgreSQL database, never FYP.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA app_private;

CREATE TABLE public.users (
  id uuid PRIMARY KEY,
  full_name text,
  email text NOT NULL
);
CREATE TABLE public.admin_conduct_flags (
  id uuid PRIMARY KEY,
  flagged_admin_id uuid NOT NULL REFERENCES public.users(id),
  target_user_id uuid REFERENCES public.users(id),
  source text NOT NULL,
  source_ref_id text NOT NULL,
  original_text text NOT NULL,
  severity text NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES public.users(id)
);
CREATE TABLE public.chat_conduct_reports (
  id uuid PRIMARY KEY,
  reporter_id uuid NOT NULL REFERENCES public.users(id),
  party_a_id uuid NOT NULL REFERENCES public.users(id),
  party_b_id uuid REFERENCES public.users(id),
  chat_type text NOT NULL,
  thread_ref text NOT NULL,
  reason text,
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES public.users(id)
);
CREATE UNIQUE INDEX chat_conduct_reports_one_open_per_reporter
  ON public.chat_conduct_reports (chat_type, thread_ref, reporter_id)
  WHERE status = 'open';
CREATE TABLE app_private.conduct_test_admins (id uuid PRIMARY KEY);
CREATE FUNCTION app_private.is_super_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
  SELECT EXISTS (SELECT 1 FROM app_private.conduct_test_admins WHERE id = p_user_id);
$function$;
GRANT USAGE ON SCHEMA app_private TO service_role;
GRANT EXECUTE ON FUNCTION app_private.is_super_admin(uuid) TO service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON public.users, public.admin_conduct_flags, public.chat_conduct_reports TO service_role;

\ir ../migrations/20261112083348_support_conduct_queue_pagination.sql

INSERT INTO public.users (id, full_name, email) VALUES
  ('00000000-0000-4000-8000-000000000001', 'Ali Admin', 'ali@example.com'),
  ('00000000-0000-4000-8000-000000000002', 'Target User', 'target@example.com'),
  ('00000000-0000-4000-8000-000000000003', 'Reporter', 'reporter@example.com'),
  ('00000000-0000-4000-8000-000000000004', 'Party A', 'party-a@example.com'),
  ('00000000-0000-4000-8000-000000000005', NULL, 'party-b@example.com');
INSERT INTO app_private.conduct_test_admins (id) VALUES ('00000000-0000-4000-8000-000000000001');

INSERT INTO public.admin_conduct_flags (
  id, flagged_admin_id, target_user_id, source, source_ref_id,
  original_text, severity, status, created_at
)
SELECT
  ('10000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  'ticket_reply',
  'ticket-' || i,
  CASE i
    WHEN 1 THEN 'wallet refund deadline'
    WHEN 2 THEN 'bayaran balik'
    WHEN 3 THEN '退款'
    WHEN 4 THEN 'tie-order'
    ELSE 'flag searchable ' || i
  END,
  CASE WHEN i % 2 = 1 THEN 'high' ELSE 'medium' END,
  CASE WHEN i = 31 THEN 'reviewed' ELSE 'open' END,
  '2026-11-12 00:00:00+00'::timestamptz + make_interval(secs => i % 3)
FROM generate_series(1, 31) AS i;

INSERT INTO public.chat_conduct_reports (
  id, reporter_id, party_a_id, party_b_id, chat_type, thread_ref,
  reason, status, created_at
)
SELECT
  ('20000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000004',
  CASE WHEN i % 2 = 0 THEN '00000000-0000-4000-8000-000000000005'::uuid ELSE NULL END,
  'user_admin',
  'thread-' || i,
  CASE i
    WHEN 1 THEN 'refund eligibility'
    WHEN 2 THEN 'bayaran balik'
    WHEN 3 THEN '退款'
    WHEN 4 THEN '50%_off issue'
    ELSE 'report searchable ' || i
  END,
  CASE WHEN i = 30 THEN 'reviewed' ELSE 'open' END,
  '2026-11-12 00:00:00+00'::timestamptz + make_interval(secs => i % 3)
FROM generate_series(1, 30) AS i;

DO $test$
DECLARE
  v jsonb;
  v_items jsonb;
BEGIN
  v := public.get_admin_conduct_queue('00000000-0000-4000-8000-000000000001', 1, 15, '', 'all', 'all');
  IF jsonb_array_length(v->'items') <> 15 OR v->>'total' <> '61' OR v->>'totalPages' <> '5' THEN
    RAISE EXCEPTION '15-row page or total mismatch: %', v;
  END IF;
  IF v->'metrics' <> '{"needsAction":59,"flaggedConduct":30,"reportedChat":29,"highSeverity":15,"reviewed":2}'::jsonb THEN
    RAISE EXCEPTION 'global metrics mismatch: %', v->'metrics';
  END IF;

  BEGIN
    INSERT INTO public.chat_conduct_reports (
      id, reporter_id, party_a_id, chat_type, thread_ref, reason, status, created_at
    ) VALUES (
      '20000000-0000-4000-8000-000000000099',
      '00000000-0000-4000-8000-000000000003',
      '00000000-0000-4000-8000-000000000004',
      'user_admin', 'thread-1', 'duplicate attempt', 'open', now()
    );
    RAISE EXCEPTION 'second open report by same reporter was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  v := public.get_admin_conduct_queue('00000000-0000-4000-8000-000000000001', 1, 25, '', 'all', 'all');
  IF jsonb_array_length(v->'items') <> 25 OR v->>'totalPages' <> '3' THEN RAISE EXCEPTION '25-row page mismatch: %', v; END IF;
  v := public.get_admin_conduct_queue('00000000-0000-4000-8000-000000000001', 1, 50, '', 'all', 'all');
  IF jsonb_array_length(v->'items') <> 50 OR v->>'totalPages' <> '2' THEN RAISE EXCEPTION '50-row page mismatch: %', v; END IF;
  v := public.get_admin_conduct_queue('00000000-0000-4000-8000-000000000001', 1000000, 50, '', 'all', 'all');
  IF v->>'page' <> '2' OR jsonb_array_length(v->'items') <> 11 THEN RAISE EXCEPTION 'out-of-range page clamp mismatch: %', v; END IF;

  v := public.get_admin_conduct_queue('00000000-0000-4000-8000-000000000001', 9, 15, '', 'all', 'reported_chat');
  IF v->>'page' <> '2' OR v->>'total' <> '30' OR jsonb_array_length(v->'items') <> 15 THEN RAISE EXCEPTION 'record type filter mismatch: %', v; END IF;
  v := public.get_admin_conduct_queue('00000000-0000-4000-8000-000000000001', 1, 15, '', 'open', 'flagged_conduct');
  IF v->>'total' <> '30' OR v->'metrics'->>'needsAction' <> '59' THEN RAISE EXCEPTION 'status filter changed total or global metrics: %', v; END IF;

  FOREACH v_items IN ARRAY ARRAY[
    public.get_admin_conduct_queue('00000000-0000-4000-8000-000000000001', 1, 15, 'refund', 'all', 'all')->'items',
    public.get_admin_conduct_queue('00000000-0000-4000-8000-000000000001', 1, 15, 'bayaran balik', 'all', 'all')->'items',
    public.get_admin_conduct_queue('00000000-0000-4000-8000-000000000001', 1, 15, '退款', 'all', 'all')->'items'
  ] LOOP
    IF jsonb_array_length(v_items) <> 2 THEN RAISE EXCEPTION 'localized literal search mismatch: %', v_items; END IF;
  END LOOP;

  v := public.get_admin_conduct_queue('00000000-0000-4000-8000-000000000001', 1, 15, '%_', 'all', 'all');
  IF v->>'total' <> '1' THEN RAISE EXCEPTION 'wildcard characters were not treated literally: %', v; END IF;
  v := public.get_admin_conduct_queue('00000000-0000-4000-8000-000000000001', 99, 15, 'no-match', 'all', 'all');
  IF v->>'page' <> '1' OR v->>'totalPages' <> '1' OR v->>'total' <> '0' OR jsonb_array_length(v->'items') <> 0 THEN RAISE EXCEPTION 'empty result paging mismatch: %', v; END IF;

  v := public.get_admin_conduct_queue('00000000-0000-4000-8000-000000000001', 1, 15, 'tie-order', 'all', 'all');
  IF v->'items'->0->>'kind' <> 'flagged_conduct' OR v->'items'->1->>'kind' <> 'reported_chat' THEN
    RAISE EXCEPTION 'equal timestamp order is unstable: %', v->'items';
  END IF;

  BEGIN
    PERFORM public.get_admin_conduct_queue('00000000-0000-4000-8000-000000000001', 1, 10, '', 'all', 'all');
    RAISE EXCEPTION 'invalid page size was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END;
$test$;

EXPLAIN (ANALYZE, BUFFERS)
SELECT jsonb_array_length(public.get_admin_conduct_queue(
  '00000000-0000-4000-8000-000000000001', 1, 15, '', 'open', 'all'
)->'items') AS rows_returned;

SET ROLE anon;
DO $test$
BEGIN
  BEGIN
    PERFORM public.get_admin_conduct_queue('00000000-0000-4000-8000-000000000001', 1, 15, '', 'all', 'all');
    RAISE EXCEPTION 'anon could execute conduct queue RPC';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$test$;
RESET ROLE;

SET ROLE authenticated;
DO $test$
BEGIN
  BEGIN
    PERFORM public.get_admin_conduct_queue('00000000-0000-4000-8000-000000000001', 1, 15, '', 'all', 'all');
    RAISE EXCEPTION 'authenticated could execute conduct queue RPC';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$test$;
RESET ROLE;

SET ROLE service_role;
DO $test$
DECLARE v jsonb;
BEGIN
  BEGIN
    PERFORM public.get_admin_conduct_queue('00000000-0000-4000-8000-000000000005', 1, 15, '', 'all', 'all');
    RAISE EXCEPTION 'non-super-admin actor was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  v := public.get_admin_conduct_queue('00000000-0000-4000-8000-000000000001', 1, 15, '', 'all', 'all');
  IF jsonb_array_length(v->'items') <> 15 THEN RAISE EXCEPTION 'service_role call failed: %', v; END IF;
END;
$test$;
RESET ROLE;

SELECT 'support conduct queue SQL tests passed' AS result;
