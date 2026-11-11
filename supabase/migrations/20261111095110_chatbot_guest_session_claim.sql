-- Explicitly attach one unowned customer conversation to the authenticated actor.
CREATE OR REPLACE FUNCTION public.claim_chatbot_guest_session(
  p_session_key text,
  p_user_id uuid
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
  IF p_session_key IS NULL OR length(p_session_key) < 1 OR length(p_session_key) > 64 OR p_user_id IS NULL THEN
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

  UPDATE public.chatbot_sessions
     SET user_id = p_user_id
   WHERE id = v_session.id AND user_id IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'chatbot_guest_session_conflict';
  END IF;

  RETURN jsonb_build_object('session_key', v_session.session_key, 'already_owned', false);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_chatbot_guest_session(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_chatbot_guest_session(text, uuid) TO service_role;
