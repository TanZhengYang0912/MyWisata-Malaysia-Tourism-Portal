-- Disposable-local-only contract checks for the Admin dashboard summary RPC.
BEGIN;

INSERT INTO public.withdrawal_requests (id, status, amount, requires_dual_approval, created_at) VALUES
  ('10000000-0000-4000-8000-000000000001', 'pending', 5.20, true, '2026-11-05T16:00:00Z'),
  ('10000000-0000-4000-8000-000000000002', 'overdue', 10.00, false, '2026-11-05T15:00:00Z'),
  ('10000000-0000-4000-8000-000000000003', 'approved', 99.00, false, '2026-11-05T14:00:00Z');

DO $$
DECLARE
  result jsonb;
BEGIN
  IF has_function_privilege('anon', 'public.get_admin_dashboard_withdrawal_summary(timestamptz,text[])', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.get_admin_dashboard_withdrawal_summary(timestamptz,text[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'dashboard summary RPC is exposed to client roles';
  END IF;

  IF NOT has_function_privilege('service_role', 'public.get_admin_dashboard_withdrawal_summary(timestamptz,text[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role cannot execute the dashboard summary RPC';
  END IF;

  result := public.get_admin_dashboard_withdrawal_summary(
    '1970-01-01T00:00:00Z'::timestamptz,
    ARRAY['pending', 'pending_second_approval', 'hold', 'overdue']::text[]
  );

  IF (result ->> 'count')::integer <> 0
    OR (result ->> 'amount')::numeric <> 0
    OR (result ->> 'overdueCount')::integer <> 0
    OR (result ->> 'dualApprovalCount')::integer <> 0
    OR result -> 'oldestCreatedAt' <> 'null'::jsonb
    OR jsonb_array_length(result -> 'activity') <> 7 THEN
    RAISE EXCEPTION 'empty dashboard summary returned unexpected values: %', result;
  END IF;

  result := public.get_admin_dashboard_withdrawal_summary(
    '2026-11-06T03:00:00+08:00'::timestamptz,
    ARRAY['pending', 'pending_second_approval', 'hold', 'overdue']::text[]
  );

  IF (result ->> 'count')::integer <> 2
    OR (result ->> 'amount')::numeric <> 15.20
    OR (result ->> 'overdueCount')::integer <> 1
    OR (result ->> 'dualApprovalCount')::integer <> 1
    OR result -> 'oldestCreatedAt' = 'null'::jsonb
    OR NOT (result -> 'activity' @> '[{"day":"2026-11-05","count":2},{"day":"2026-11-06","count":1}]'::jsonb) THEN
    RAISE EXCEPTION 'populated dashboard summary returned unexpected values: %', result;
  END IF;
END;
$$;

ROLLBACK;
