-- Run only against a disposable local Supabase/Postgres fixture.
BEGIN;
SET LOCAL statement_timeout = '20s';

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.reserve_support_operation(uuid,text,uuid,uuid,text,text,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.reserve_support_operation(uuid,text,uuid,uuid,text,text,integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.complete_chatbot_ask_operation(uuid,text,uuid,uuid,uuid,text,boolean,text,boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.complete_chatbot_ask_operation(uuid,text,uuid,uuid,uuid,text,boolean,text,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'public roles can call service-only support operation RPCs';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.reserve_support_operation(uuid,text,uuid,uuid,text,text,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service role cannot reserve support operations';
  END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT set_config('support_operations.owner_id', gen_random_uuid()::text, true);
SELECT set_config('support_operations.session_id', gen_random_uuid()::text, true);
INSERT INTO auth.users (id) VALUES (current_setting('support_operations.owner_id')::uuid);
INSERT INTO public.chatbot_sessions (id, user_id)
VALUES (current_setting('support_operations.session_id')::uuid, current_setting('support_operations.owner_id')::uuid);
SET LOCAL ROLE service_role;
DO $$
DECLARE
  v_id uuid := gen_random_uuid();
  v_owner uuid := current_setting('support_operations.owner_id')::uuid;
  v_session uuid := current_setting('support_operations.session_id')::uuid;
  v_actor text := 'user:' || current_setting('support_operations.owner_id');
  v_hash text := repeat('a', 64);
  v_first jsonb;
  v_retry jsonb;
  v_unknown jsonb;
  v_conflict boolean := false;
  v_user_message uuid;
  v_bot_message uuid;
  v_completed jsonb;
  v_late_user_message uuid;
  v_late_bot_message uuid;
  v_late_lease uuid;
BEGIN
  v_first := public.reserve_support_operation(v_id, v_actor, v_owner, v_session, 'ask', v_hash, 15);
  IF v_first->>'state' <> 'running' OR v_first->>'shouldExecute' <> 'true' OR v_first->>'leaseToken' IS NULL THEN
    RAISE EXCEPTION 'first reservation did not acquire a lease';
  END IF;

  v_retry := public.reserve_support_operation(v_id, v_actor, v_owner, v_session, 'ask', v_hash, 15);
  IF v_retry->>'state' <> 'running' OR v_retry->>'shouldExecute' <> 'false' THEN
    RAISE EXCEPTION 'concurrent retry was not held behind the active lease';
  END IF;

  BEGIN
    PERFORM public.reserve_support_operation(v_id, v_actor, v_owner, v_session, 'ask', repeat('b', 64), 15);
  EXCEPTION WHEN unique_violation THEN
    v_conflict := true;
  END;
  IF NOT v_conflict THEN RAISE EXCEPTION 'same operation ID with a different payload was accepted'; END IF;

  IF NOT public.mark_support_operation_external_started(v_id, v_actor, (v_first->>'leaseToken')::uuid) THEN
    RAISE EXCEPTION 'active lease could not record external-call start';
  END IF;
  UPDATE public.support_operations SET lease_expires_at = now() - interval '1 second' WHERE id = v_id;
  v_unknown := public.reserve_support_operation(v_id, v_actor, v_owner, v_session, 'ask', v_hash, 15);
  IF v_unknown->>'state' <> 'unknown' OR v_unknown->>'shouldExecute' <> 'false' THEN
    RAISE EXCEPTION 'expired external operation was retried instead of marked unknown';
  END IF;

  v_id := gen_random_uuid();
  v_actor := 'user:' || v_owner::text;
  v_first := public.reserve_support_operation(v_id, v_actor, v_owner, v_session, 'ask', v_hash, 15);
  v_late_lease := (v_first->>'leaseToken')::uuid;
  INSERT INTO public.chatbot_messages (session_id, role, body, operation_id, operation_payload_hash)
  VALUES (v_session, 'user', 'A second sanitized question', v_id, v_hash)
  RETURNING id INTO v_late_user_message;
  PERFORM public.mark_support_operation_external_started(v_id, v_actor, v_late_lease);
  UPDATE public.support_operations SET lease_expires_at = now() - interval '1 second' WHERE id = v_id;
  v_unknown := public.reserve_support_operation(v_id, v_actor, v_owner, v_session, 'ask', v_hash, 15);
  IF v_unknown->>'state' <> 'unknown' THEN RAISE EXCEPTION 'expired operation did not become unknown'; END IF;
  v_late_bot_message := public.complete_chatbot_ask_operation(
    v_id, v_actor, v_late_lease, v_session, v_late_user_message,
    'A late but confirmed answer', true, 'en', false
  );
  IF NOT EXISTS (SELECT 1 FROM public.support_operations WHERE id = v_id AND state = 'completed' AND result_id = v_late_bot_message) THEN
    RAISE EXCEPTION 'late original completion was not reconciled after unknown';
  END IF;

  v_actor := 'user:' || v_owner::text;
  v_id := gen_random_uuid();
  v_first := public.reserve_support_operation(v_id, v_actor, v_owner, v_session, 'ask', v_hash, 15);
  INSERT INTO public.chatbot_messages (session_id, role, body, operation_id, operation_payload_hash)
  VALUES (v_session, 'user', 'A sanitized question', v_id, v_hash)
  RETURNING id INTO v_user_message;
  v_bot_message := public.complete_chatbot_ask_operation(
    v_id, v_actor, (v_first->>'leaseToken')::uuid, v_session, v_user_message,
    'A verified answer', true, 'en', false
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.support_operations
     WHERE id = v_id AND state = 'completed' AND result_id = v_bot_message
  ) OR NOT EXISTS (
    SELECT 1 FROM public.chatbot_messages
     WHERE id = v_bot_message AND reply_to_message_id = v_user_message AND role = 'bot'
  ) THEN
    RAISE EXCEPTION 'answer and operation completion were not committed together';
  END IF;
  IF public.complete_chatbot_ask_operation(
    v_id, v_actor, (v_first->>'leaseToken')::uuid, v_session, v_user_message,
    'A verified answer', true, 'en', false
  ) <> v_bot_message THEN
    RAISE EXCEPTION 'completed operation did not return its original result';
  END IF;
END;
$$;

ROLLBACK;
