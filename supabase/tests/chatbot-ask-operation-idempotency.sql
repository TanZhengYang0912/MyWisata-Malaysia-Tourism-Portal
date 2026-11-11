-- Verify a user turn can reserve one operation id and its payload hash.
BEGIN;
SET LOCAL statement_timeout = '20s';

DO $$
DECLARE
  v_session_id uuid := gen_random_uuid();
  v_operation_id uuid := gen_random_uuid();
  v_rejected boolean := false;
BEGIN
  INSERT INTO public.chatbot_messages (session_id, role, body, operation_id, operation_payload_hash)
  VALUES (v_session_id, 'user', 'Question', v_operation_id, repeat('a', 64));

  BEGIN
    INSERT INTO public.chatbot_messages (session_id, role, body, operation_id, operation_payload_hash)
    VALUES (v_session_id, 'user', 'Question', v_operation_id, repeat('a', 64));
  EXCEPTION WHEN unique_violation THEN
    v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'duplicate chatbot operation was accepted'; END IF;

  v_rejected := false;
  BEGIN
    INSERT INTO public.chatbot_messages (session_id, role, body, operation_id, operation_payload_hash)
    VALUES (v_session_id, 'user', 'Question', gen_random_uuid(), 'not-a-sha256-hash');
  EXCEPTION WHEN check_violation THEN
    v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'invalid chatbot operation payload hash was accepted'; END IF;

  v_rejected := false;
  BEGIN
    INSERT INTO public.chatbot_messages (session_id, role, body, operation_id, operation_payload_hash)
    VALUES (v_session_id, 'user', 'Question', gen_random_uuid(), NULL);
  EXCEPTION WHEN check_violation THEN
    v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'missing chatbot operation payload hash was accepted'; END IF;
END;
$$;

ROLLBACK;
