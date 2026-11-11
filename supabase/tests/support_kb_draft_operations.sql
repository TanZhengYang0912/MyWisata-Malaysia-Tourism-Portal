-- Run only against a disposable local Supabase/Postgres fixture after support_operations.sql.
BEGIN;
SET LOCAL statement_timeout = '20s';

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.reserve_support_kb_draft(uuid,uuid,text,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.complete_support_kb_draft(uuid,uuid,uuid,text,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'public roles can call KB draft operation RPCs';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.complete_support_kb_draft(uuid,uuid,uuid,text,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service role cannot complete KB draft operations';
  END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT set_config('support_kb_draft.owner_id', gen_random_uuid()::text, true);
INSERT INTO auth.users (id) VALUES (current_setting('support_kb_draft.owner_id')::uuid);
SET LOCAL ROLE service_role;
DO $$
DECLARE
  v_owner uuid := current_setting('support_kb_draft.owner_id')::uuid;
  v_id uuid := gen_random_uuid();
  v_hash text := repeat('c', 64);
  v_reservation jsonb;
  v_result jsonb := jsonb_build_object(
    'title', 'Refund status',
    'body', '[ADMIN: confirm refund policy].',
    'keywords', jsonb_build_array('refund'),
    'category', 'payment'
  );
  v_saved jsonb;
  v_cleaned integer;
  v_invalid_rejected boolean := false;
BEGIN
  v_reservation := public.reserve_support_kb_draft(v_id, v_owner, v_hash, 15);
  IF v_reservation->>'state' <> 'running' OR v_reservation->>'shouldExecute' <> 'true' THEN
    RAISE EXCEPTION 'first KB draft operation did not acquire a lease';
  END IF;
  BEGIN
    PERFORM public.complete_support_kb_draft(
      v_id, v_owner, (v_reservation->>'leaseToken')::uuid, v_hash,
      '{"title":"Missing category","body":"This malformed result must be rejected.","keywords":[]}'::jsonb
    );
  EXCEPTION WHEN invalid_parameter_value THEN
    v_invalid_rejected := true;
  END;
  IF NOT v_invalid_rejected THEN
    RAISE EXCEPTION 'database accepted a KB draft result with a missing required field';
  END IF;
  v_saved := public.complete_support_kb_draft(v_id, v_owner, (v_reservation->>'leaseToken')::uuid, v_hash, v_result);
  IF v_saved <> v_result OR NOT EXISTS (
    SELECT 1 FROM public.support_operations
     WHERE id = v_id AND state = 'completed' AND result_json = v_result
       AND result_expires_at > now()
  ) THEN
    RAISE EXCEPTION 'completed KB draft result was not persisted with an expiry';
  END IF;
  UPDATE public.support_operations SET result_expires_at = now() - interval '1 second' WHERE id = v_id;
  v_cleaned := public.cleanup_support_kb_draft_results(50);
  IF v_cleaned <> 1 OR NOT EXISTS (
    SELECT 1 FROM public.support_operations WHERE id = v_id AND state = 'completed' AND result_json IS NULL
  ) THEN
    RAISE EXCEPTION 'expiry cleanup deleted the operation or retained the model result';
  END IF;
  v_reservation := public.reserve_support_kb_draft(v_id, v_owner, v_hash, 15);
  IF v_reservation->>'state' <> 'completed' OR v_reservation->>'shouldExecute' <> 'false' THEN
    RAISE EXCEPTION 'expired draft operation became executable again';
  END IF;
END;
$$;

ROLLBACK;
