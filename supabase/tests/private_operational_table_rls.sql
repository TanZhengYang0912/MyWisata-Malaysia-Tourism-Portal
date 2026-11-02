-- Read-only assertions: no customer fixtures or business operations.
DO $$
DECLARE
  target text;
  client_role text;
  operation text;
  denied integer := 0;
  rpc_count integer := 0;
  entry record;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'app_private.affiliate_job_progress',
    'app_private.guest_contact_corrections'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class
      WHERE oid = target::regclass AND relrowsecurity
        AND NOT relforcerowsecurity AND relowner = 'postgres'::regrole
    ) THEN
      RAISE EXCEPTION 'Private RLS/owner invariant failed: %', target;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = target::regclass) THEN
      RAISE EXCEPTION 'Unexpected direct-access policy: %', target;
    END IF;
    FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      FOREACH operation IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
        IF has_table_privilege(client_role, target, operation) THEN
          RAISE EXCEPTION 'Unexpected direct privilege: %, %, %', target, client_role, operation;
        END IF;
      END LOOP;
      BEGIN
        EXECUTE format('SET LOCAL ROLE %I', client_role);
        EXECUTE format('SELECT 1 FROM %s LIMIT 1', target);
        RAISE EXCEPTION 'Direct read unexpectedly allowed: %, %', target, client_role;
      EXCEPTION WHEN insufficient_privilege THEN
        -- This subtransaction also restores the original role.
        denied := denied + 1;
      END;
    END LOOP;
  END LOOP;
  IF denied <> 6 THEN
    RAISE EXCEPTION 'Expected six denied direct reads, got %', denied;
  END IF;

  FOR entry IN
    SELECT p.oid, p.proname, p.prosecdef, p.proowner
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN (
      'claim_affiliate_job', 'get_affiliate_pending_clear_batch',
      'get_affiliate_fraud_sweep_batch', 'advance_affiliate_job',
      'correct_guest_order_contact'
    )
  LOOP
    rpc_count := rpc_count + 1;
    IF NOT entry.prosecdef OR entry.proowner <> 'postgres'::regrole
      OR has_function_privilege('anon', entry.oid, 'EXECUTE')
      OR has_function_privilege('authenticated', entry.oid, 'EXECUTE')
        IS DISTINCT FROM (entry.proname = 'correct_guest_order_contact')
      OR has_function_privilege('service_role', entry.oid, 'EXECUTE')
        IS DISTINCT FROM (entry.proname <> 'correct_guest_order_contact') THEN
      RAISE EXCEPTION 'Controlled RPC invariant failed: %', entry.proname;
    END IF;
  END LOOP;
  IF rpc_count <> 5 THEN
    RAISE EXCEPTION 'Expected five controlled RPCs, got %', rpc_count;
  END IF;
END;
$$;
