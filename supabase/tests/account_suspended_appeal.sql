-- Requires a disposable database with repository migrations applied.
-- All fixture rows are created inside this transaction and rolled back.
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';
SELECT set_config('support_appeal.suspended_user_id', gen_random_uuid()::text, true);
SELECT set_config('support_appeal.active_user_id', gen_random_uuid()::text, true);

INSERT INTO public.users(id,email,full_name,status) VALUES
  (current_setting('support_appeal.suspended_user_id')::uuid,
   'support-appeal-suspended-'||current_setting('support_appeal.suspended_user_id')||'@example.invalid',
   'Suspended Appeal Fixture','suspended'),
  (current_setting('support_appeal.active_user_id')::uuid,
   'support-appeal-active-'||current_setting('support_appeal.active_user_id')||'@example.invalid',
   'Active Appeal Fixture','active');

SET LOCAL ROLE service_role;
DO $$
DECLARE
  v_user_id uuid := current_setting('support_appeal.suspended_user_id')::uuid;
  v_active_user_id uuid := current_setting('support_appeal.active_user_id')::uuid;
  v_operation_id uuid := gen_random_uuid();
  v_first jsonb;
  v_retry jsonb;
BEGIN
  IF has_function_privilege('anon','public.create_account_suspension_appeal(uuid,uuid,text,text,text)','EXECUTE')
     OR has_function_privilege('authenticated','public.create_account_suspension_appeal(uuid,uuid,text,text,text)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.create_account_suspension_appeal(uuid,uuid,text,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'appeal RPC has an unexpected execute grant';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM pg_proc AS procedures
      CROSS JOIN LATERAL aclexplode(COALESCE(procedures.proacl, acldefault('f', procedures.proowner))) AS acl
     WHERE procedures.oid = to_regprocedure('public.create_account_suspension_appeal(uuid,uuid,text,text,text)')
       AND acl.grantee = 0
       AND acl.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'appeal RPC is executable by PUBLIC';
  END IF;
  IF has_table_privilege('authenticated','public.support_tickets','INSERT')
     OR has_table_privilege('authenticated','public.support_tickets','UPDATE')
     OR has_table_privilege('authenticated','public.support_tickets','DELETE')
     OR NOT has_table_privilege('authenticated','public.support_tickets','SELECT')
     OR has_table_privilege('anon','public.support_tickets','SELECT') THEN
    RAISE EXCEPTION 'support ticket table privileges do not match the read-only client boundary';
  END IF;

  PERFORM set_config('request.jwt.claim.role','service_role',true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','service_role','is_anonymous',false)::text,true);
  v_first := public.create_account_suspension_appeal(
    v_user_id, v_operation_id, repeat('a',64), 'Please review my suspended account', 'general'
  );
  v_retry := public.create_account_suspension_appeal(
    v_user_id, v_operation_id, repeat('a',64), 'Please review my suspended account', 'general'
  );
  IF v_first->>'created' <> 'true' OR v_retry->>'created' <> 'false'
     OR v_first->>'id' IS DISTINCT FROM v_retry->>'id' THEN
    RAISE EXCEPTION 'same operation key did not return its original appeal';
  END IF;
  IF (SELECT count(*) FROM public.support_tickets WHERE user_id = v_user_id AND operation_id = v_operation_id) <> 1 THEN
    RAISE EXCEPTION 'same operation key created more than one appeal';
  END IF;

  BEGIN
    PERFORM public.create_account_suspension_appeal(
      v_user_id, v_operation_id, repeat('b',64), 'Please review my suspended account', 'general'
    );
    RAISE EXCEPTION 'changed payload was accepted for an existing operation key';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'support_ticket_operation_conflict' THEN RAISE; END IF;
  END;

  PERFORM set_config('app.allow_account_status_write','on',true);
  UPDATE public.users SET status = 'active' WHERE id = v_user_id;
  v_retry := public.create_account_suspension_appeal(
    v_user_id, v_operation_id, repeat('a',64), 'Please review my suspended account', 'general'
  );
  IF v_retry->>'created' <> 'false' OR v_retry->>'id' IS DISTINCT FROM v_first->>'id' THEN
    RAISE EXCEPTION 'completed appeal replay changed after the account status changed';
  END IF;

  BEGIN
    PERFORM public.create_account_suspension_appeal(
      v_active_user_id, gen_random_uuid(), repeat('c',64), 'Please review my active account', 'general'
    );
    RAISE EXCEPTION 'active account was allowed to create a suspension appeal';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'account_not_suspended' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;

ROLLBACK;
SELECT 'PASS: service-only RPC, read-only client grants, suspended-state gate, and idempotent appeal replay; fixtures rolled back' AS result;
