-- Verify guest session claiming is idempotent for one user and rejects takeover.
BEGIN;
SET LOCAL statement_timeout = '20s';

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.claim_chatbot_guest_session(text,uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.claim_chatbot_guest_session(text,uuid,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.bind_chatbot_guest_session_token(text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.bind_chatbot_guest_session_token(text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'public roles can call a guest chat credential RPC directly';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.claim_chatbot_guest_session(text,uuid,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.bind_chatbot_guest_session_token(text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service role cannot call a guest chat credential RPC';
  END IF;
END;
$$;

SELECT set_config('chatbot_claim.user_a', gen_random_uuid()::text, true);
SELECT set_config('chatbot_claim.user_b', gen_random_uuid()::text, true);
SELECT set_config('chatbot_claim.session_id', gen_random_uuid()::text, true);
SELECT set_config('chatbot_claim.session_key', gen_random_uuid()::text, true);
SELECT set_config('chatbot_claim.token_hash', repeat('a', 64), true);

INSERT INTO public.users (id, email)
VALUES
  (current_setting('chatbot_claim.user_a')::uuid, current_setting('chatbot_claim.user_a') || '@example.invalid'),
  (current_setting('chatbot_claim.user_b')::uuid, current_setting('chatbot_claim.user_b') || '@example.invalid');
INSERT INTO public.chatbot_sessions (id, user_id, session_key, channel)
VALUES (current_setting('chatbot_claim.session_id')::uuid, NULL, current_setting('chatbot_claim.session_key'), 'customer');

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET LOCAL ROLE service_role;
DO $$
DECLARE
  v_session_key text := current_setting('chatbot_claim.session_key');
  v_user_a uuid := current_setting('chatbot_claim.user_a')::uuid;
  v_user_b uuid := current_setting('chatbot_claim.user_b')::uuid;
  v_result jsonb;
  v_rejected boolean := false;
BEGIN
  v_result := public.bind_chatbot_guest_session_token(v_session_key, current_setting('chatbot_claim.token_hash'));
  IF v_result->>'bound' <> 'true' THEN RAISE EXCEPTION 'guest credential was not bound'; END IF;

  v_result := public.claim_chatbot_guest_session(v_session_key, v_user_a, current_setting('chatbot_claim.token_hash'));
  IF v_result->>'session_key' <> v_session_key OR v_result->>'already_owned' <> 'false' THEN
    RAISE EXCEPTION 'guest chat claim did not bind the expected session';
  END IF;

  v_result := public.claim_chatbot_guest_session(v_session_key, v_user_a, current_setting('chatbot_claim.token_hash'));
  IF v_result->>'already_owned' <> 'true' THEN RAISE EXCEPTION 'same-owner claim was not idempotent'; END IF;

  BEGIN
    PERFORM public.claim_chatbot_guest_session(v_session_key, v_user_b, current_setting('chatbot_claim.token_hash'));
  EXCEPTION WHEN SQLSTATE '42501' THEN
    v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'another account took over the guest chat'; END IF;
END;
$$;

INSERT INTO public.chatbot_sessions (id, user_id, session_key, channel)
VALUES (gen_random_uuid(), NULL, gen_random_uuid()::text, 'customer');
RESET ROLE;

ROLLBACK;
