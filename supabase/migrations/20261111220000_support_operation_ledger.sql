-- Persistent coordination for Support operations that cross request boundaries.
-- Existing ticket/reply/upload RPCs remain authoritative for their own writes.
CREATE TABLE public.support_operations (
  id uuid PRIMARY KEY,
  actor_key text NOT NULL,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.chatbot_sessions(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('ask', 'create_ticket', 'reply', 'upload', 'reopen', 'kb_draft', 'kb_publish')),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  state text NOT NULL CHECK (state IN ('reserved', 'running', 'completed', 'failed', 'unknown')),
  lease_token uuid,
  lease_expires_at timestamptz,
  external_started_at timestamptz,
  result_id uuid,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_operations_actor_key_length CHECK (length(actor_key) BETWEEN 3 AND 128),
  CONSTRAINT support_operations_lease_complete CHECK (
    (lease_token IS NULL AND lease_expires_at IS NULL)
    OR (lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
  )
);

ALTER TABLE public.support_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.support_operations FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.support_operations TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_support_operation(
  p_operation_id uuid,
  p_actor_key text,
  p_owner_user_id uuid,
  p_session_id uuid,
  p_kind text,
  p_payload_hash text,
  p_lease_seconds integer DEFAULT 120
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_operation public.support_operations%ROWTYPE;
  v_lease_token uuid;
  v_inserted integer;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'support_operation_service_role_required';
  END IF;
  IF p_operation_id IS NULL OR p_actor_key IS NULL OR length(p_actor_key) NOT BETWEEN 3 AND 128
     OR p_kind IS NULL OR p_kind NOT IN ('ask', 'create_ticket', 'reply', 'upload', 'reopen', 'kb_draft', 'kb_publish')
     OR p_payload_hash IS NULL OR p_payload_hash !~ '^[0-9a-f]{64}$'
     OR p_lease_seconds NOT BETWEEN 15 AND 600 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'support_operation_invalid';
  END IF;
  IF p_kind = 'ask' AND (
    p_session_id IS NULL
    OR (p_owner_user_id IS NOT NULL AND (
      p_actor_key <> 'user:' || p_owner_user_id::text
      OR NOT EXISTS (SELECT 1 FROM public.chatbot_sessions WHERE id = p_session_id AND user_id = p_owner_user_id)
    ))
    OR (p_owner_user_id IS NULL AND (
      p_actor_key !~ '^guest:[0-9a-f]{64}$'
      OR NOT EXISTS (
        SELECT 1 FROM public.chatbot_sessions
         WHERE id = p_session_id AND user_id IS NULL
           AND guest_token_hash = substring(p_actor_key FROM 7)
      )
    ))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'support_operation_actor_invalid';
  END IF;

  v_lease_token := gen_random_uuid();
  INSERT INTO public.support_operations (
    id, actor_key, owner_user_id, session_id, kind, payload_hash, state,
    lease_token, lease_expires_at
  ) VALUES (
    p_operation_id, p_actor_key, p_owner_user_id, p_session_id, p_kind, p_payload_hash, 'running',
    v_lease_token, now() + make_interval(secs => p_lease_seconds)
  ) ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 1 THEN
    RETURN jsonb_build_object('state', 'running', 'leaseToken', v_lease_token, 'resultId', NULL, 'errorCode', NULL, 'shouldExecute', true, 'created', true);
  END IF;

  SELECT * INTO v_operation
    FROM public.support_operations
   WHERE id = p_operation_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING MESSAGE = 'support_operation_unavailable';
  END IF;
  IF v_operation.actor_key <> p_actor_key
     OR v_operation.owner_user_id IS DISTINCT FROM p_owner_user_id
     OR v_operation.session_id IS DISTINCT FROM p_session_id
     OR v_operation.kind <> p_kind
     OR v_operation.payload_hash <> p_payload_hash THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'support_operation_conflict';
  END IF;

  IF v_operation.state IN ('completed', 'failed', 'unknown') THEN
    RETURN jsonb_build_object('state', v_operation.state, 'resultId', v_operation.result_id, 'errorCode', v_operation.error_code, 'shouldExecute', false, 'created', false);
  END IF;
  IF v_operation.lease_expires_at > now() THEN
    RETURN jsonb_build_object('state', 'running', 'resultId', NULL, 'errorCode', NULL, 'shouldExecute', false, 'created', false);
  END IF;
  IF v_operation.external_started_at IS NOT NULL THEN
    UPDATE public.support_operations
       SET state = 'unknown', error_code = 'OPERATION_UNKNOWN', updated_at = now()
     WHERE id = p_operation_id;
    RETURN jsonb_build_object('state', 'unknown', 'resultId', v_operation.result_id, 'errorCode', 'OPERATION_UNKNOWN', 'shouldExecute', false, 'created', false);
  END IF;

  UPDATE public.support_operations
     SET state = 'running', lease_token = v_lease_token,
         lease_expires_at = now() + make_interval(secs => p_lease_seconds), updated_at = now()
   WHERE id = p_operation_id;
  RETURN jsonb_build_object('state', 'running', 'leaseToken', v_lease_token, 'resultId', NULL, 'errorCode', NULL, 'shouldExecute', true, 'created', false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_support_operation_unknown(
  p_operation_id uuid,
  p_actor_key text,
  p_lease_token uuid,
  p_safe_code text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_updated integer;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'support_operation_service_role_required';
  END IF;
  IF p_safe_code NOT IN ('OPERATION_UNKNOWN', 'LEGACY_OPERATION_UNCERTAIN') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'support_operation_invalid';
  END IF;
  UPDATE public.support_operations
     SET state = 'unknown', error_code = p_safe_code, updated_at = now()
   WHERE id = p_operation_id AND actor_key = p_actor_key
     AND state = 'running' AND lease_token = p_lease_token;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_support_operation_external_started(
  p_operation_id uuid,
  p_actor_key text,
  p_lease_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_updated integer;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'support_operation_service_role_required';
  END IF;
  UPDATE public.support_operations
     SET external_started_at = coalesce(external_started_at, now()), updated_at = now()
   WHERE id = p_operation_id AND actor_key = p_actor_key
     AND state = 'running' AND lease_token = p_lease_token
     AND lease_expires_at > now() AND external_started_at IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_chatbot_ask_operation(
  p_operation_id uuid,
  p_actor_key text,
  p_lease_token uuid,
  p_session_id uuid,
  p_user_message_id uuid,
  p_answer text,
  p_kb_matched boolean,
  p_answer_language text,
  p_privacy_blocked boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_operation public.support_operations%ROWTYPE;
  v_bot_message_id uuid;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'support_operation_service_role_required';
  END IF;
  SELECT * INTO v_operation FROM public.support_operations
   WHERE id = p_operation_id AND actor_key = p_actor_key FOR UPDATE;
  IF NOT FOUND OR v_operation.kind <> 'ask' OR v_operation.session_id <> p_session_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'support_operation_forbidden';
  END IF;
  IF v_operation.state = 'completed' AND v_operation.result_id IS NOT NULL THEN
    RETURN v_operation.result_id;
  END IF;
  IF v_operation.state NOT IN ('running', 'unknown') OR v_operation.lease_token <> p_lease_token THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'support_operation_lease_lost';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.chatbot_messages
     WHERE id = p_user_message_id AND session_id = p_session_id AND role = 'user'
       AND operation_id = p_operation_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'support_operation_turn_missing';
  END IF;

  INSERT INTO public.chatbot_messages (
    session_id, role, body, kb_matched, reply_to_message_id, answer_language, privacy_blocked
  ) VALUES (
    p_session_id, 'bot', p_answer, p_kb_matched, p_user_message_id, p_answer_language, p_privacy_blocked
  ) RETURNING id INTO v_bot_message_id;

  UPDATE public.support_operations
     SET state = 'completed', result_id = v_bot_message_id, error_code = NULL,
         lease_token = NULL, lease_expires_at = NULL, updated_at = now()
   WHERE id = p_operation_id;
  RETURN v_bot_message_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reconcile_chatbot_ask_operation(
  p_operation_id uuid,
  p_actor_key text,
  p_session_id uuid,
  p_user_message_id uuid,
  p_bot_message_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_operation public.support_operations%ROWTYPE;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'support_operation_service_role_required';
  END IF;
  SELECT * INTO v_operation FROM public.support_operations
   WHERE id = p_operation_id AND actor_key = p_actor_key FOR UPDATE;
  IF NOT FOUND OR v_operation.kind <> 'ask' OR v_operation.session_id <> p_session_id THEN
    RETURN false;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.chatbot_messages AS user_message
    JOIN public.chatbot_messages AS bot_message
      ON bot_message.reply_to_message_id = user_message.id
     AND bot_message.session_id = user_message.session_id
     AND bot_message.role = 'bot'
     WHERE user_message.id = p_user_message_id
       AND user_message.session_id = p_session_id
       AND user_message.role = 'user'
       AND user_message.operation_id = p_operation_id
       AND bot_message.id = p_bot_message_id
  ) THEN
    RETURN false;
  END IF;
  UPDATE public.support_operations
     SET state = 'completed', result_id = p_bot_message_id, error_code = NULL,
         lease_token = NULL, lease_expires_at = NULL, updated_at = now()
   WHERE id = p_operation_id;
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.reserve_support_operation(uuid, text, uuid, uuid, text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_support_operation_external_started(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_support_operation_unknown(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_chatbot_ask_operation(uuid, text, uuid, uuid, uuid, text, boolean, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reconcile_chatbot_ask_operation(uuid, text, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_support_operation(uuid, text, uuid, uuid, text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_support_operation_external_started(uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_support_operation_unknown(uuid, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_chatbot_ask_operation(uuid, text, uuid, uuid, uuid, text, boolean, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_chatbot_ask_operation(uuid, text, uuid, uuid, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
