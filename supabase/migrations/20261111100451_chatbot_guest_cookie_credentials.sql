ALTER TABLE public.chatbot_sessions
  ADD COLUMN guest_token_hash text,
  ADD CONSTRAINT chatbot_sessions_guest_token_hash_check
    CHECK (guest_token_hash IS NULL OR guest_token_hash ~ '^[0-9a-f]{64}$');

CREATE INDEX chatbot_sessions_guest_token_hash_idx
  ON public.chatbot_sessions (guest_token_hash)
  WHERE guest_token_hash IS NOT NULL;

CREATE OR REPLACE FUNCTION public.bind_chatbot_guest_session_token(
  p_session_key text,
  p_guest_token_hash text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session public.chatbot_sessions%ROWTYPE;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'chatbot_guest_bind_service_role_required';
  END IF;
  IF p_session_key IS NULL OR length(p_session_key) < 1 OR length(p_session_key) > 64
     OR p_guest_token_hash IS NULL OR p_guest_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'chatbot_guest_bind_invalid';
  END IF;

  SELECT * INTO v_session
    FROM public.chatbot_sessions
   WHERE session_key = p_session_key AND channel = 'customer'
   FOR UPDATE;
  IF NOT FOUND OR v_session.user_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'chatbot_guest_session_not_found';
  END IF;
  IF v_session.guest_token_hash = p_guest_token_hash THEN
    RETURN jsonb_build_object('bound', true, 'already_bound', true);
  END IF;
  IF v_session.guest_token_hash IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'chatbot_guest_session_conflict';
  END IF;

  UPDATE public.chatbot_sessions
     SET guest_token_hash = p_guest_token_hash
   WHERE id = v_session.id AND user_id IS NULL AND guest_token_hash IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'chatbot_guest_session_conflict';
  END IF;

  RETURN jsonb_build_object('bound', true, 'already_bound', false);
END;
$$;

DROP FUNCTION IF EXISTS public.claim_chatbot_guest_session(text, uuid);
CREATE OR REPLACE FUNCTION public.claim_chatbot_guest_session(
  p_session_key text,
  p_user_id uuid,
  p_guest_token_hash text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session public.chatbot_sessions%ROWTYPE;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'chatbot_guest_claim_service_role_required';
  END IF;
  IF p_session_key IS NULL OR length(p_session_key) < 1 OR length(p_session_key) > 64
     OR p_user_id IS NULL OR p_guest_token_hash IS NULL OR p_guest_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'chatbot_guest_claim_invalid';
  END IF;

  SELECT * INTO v_session
    FROM public.chatbot_sessions
   WHERE session_key = p_session_key
   FOR UPDATE;
  IF NOT FOUND OR v_session.channel <> 'customer' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'chatbot_guest_session_not_found';
  END IF;
  IF v_session.user_id = p_user_id THEN
    RETURN jsonb_build_object('session_key', v_session.session_key, 'already_owned', true);
  END IF;
  IF v_session.user_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'chatbot_guest_session_conflict';
  END IF;
  IF v_session.guest_token_hash IS NULL THEN
    UPDATE public.chatbot_sessions
       SET guest_token_hash = p_guest_token_hash
     WHERE id = v_session.id AND user_id IS NULL AND guest_token_hash IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'chatbot_guest_session_conflict';
    END IF;
  ELSIF v_session.guest_token_hash <> p_guest_token_hash THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'chatbot_guest_session_conflict';
  END IF;

  UPDATE public.chatbot_sessions
     SET user_id = p_user_id, guest_token_hash = NULL
   WHERE id = v_session.id AND user_id IS NULL AND guest_token_hash = p_guest_token_hash;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'chatbot_guest_session_conflict';
  END IF;

  RETURN jsonb_build_object('session_key', v_session.session_key, 'already_owned', false);
END;
$$;

REVOKE ALL ON FUNCTION public.bind_chatbot_guest_session_token(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_chatbot_guest_session(text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bind_chatbot_guest_session_token(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_chatbot_guest_session(text, uuid, text) TO service_role;
