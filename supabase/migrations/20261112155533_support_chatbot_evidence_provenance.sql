ALTER TABLE public.chatbot_message_kb_refs
  ADD COLUMN IF NOT EXISTS document_title_snapshot text,
  ADD COLUMN IF NOT EXISTS content_version bigint;

COMMENT ON COLUMN public.chatbot_message_kb_refs.document_title_snapshot IS
  'Title shown for this answer at the time its knowledge source was recorded; does not expose the document body.';
COMMENT ON COLUMN public.chatbot_message_kb_refs.content_version IS
  'Published knowledge content version used for this answer; NULL for legacy references.';

CREATE INDEX IF NOT EXISTS chatbot_message_kb_refs_message_id_idx
  ON public.chatbot_message_kb_refs (message_id);

CREATE OR REPLACE FUNCTION public.match_kb_documents_with_version(
  query_embedding extensions.vector(768),
  match_count integer DEFAULT 3,
  require_reviewed boolean DEFAULT false
)
RETURNS TABLE (
  id uuid,
  title varchar,
  body text,
  category varchar,
  similarity numeric,
  content_version bigint,
  reviewed boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT d.id,
         d.title,
         d.body,
         d.category,
         1 - (d.embedding <=> query_embedding) AS similarity,
         d.content_version,
         jsonb_array_length(d.published_source_refs) > 0 AS reviewed
    FROM public.chatbot_kb_documents AS d
   WHERE d.is_active IS TRUE
     AND d.embedding IS NOT NULL
     AND d.embedding_version = d.content_version
     AND (NOT coalesce(require_reviewed, false) OR jsonb_array_length(d.published_source_refs) > 0)
   ORDER BY d.embedding <=> query_embedding
   LIMIT greatest(1, least(coalesce(match_count, 3), 6));
$function$;

CREATE OR REPLACE FUNCTION public.complete_chatbot_ask_operation_with_evidence(
  p_operation_id uuid,
  p_actor_key text,
  p_lease_token uuid,
  p_session_id uuid,
  p_user_message_id uuid,
  p_answer text,
  p_kb_matched boolean,
  p_answer_language text,
  p_privacy_blocked boolean,
  p_kb_refs jsonb
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
  IF p_kb_refs IS NULL OR jsonb_typeof(p_kb_refs) <> 'array'
     OR jsonb_array_length(p_kb_refs) > 6 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'support_operation_invalid_evidence';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(p_kb_refs) AS evidence(item)
     WHERE jsonb_typeof(evidence.item) <> 'object'
        OR coalesce(evidence.item ->> 'documentId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        OR coalesce(evidence.item ->> 'title', '') = ''
        OR coalesce(evidence.item ->> 'contentVersion', '') !~ '^[1-9][0-9]*$'
        OR (evidence.item ? 'score' AND jsonb_typeof(evidence.item -> 'score') NOT IN ('number', 'null'))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'support_operation_invalid_evidence';
  END IF;

  SELECT * INTO v_operation
    FROM public.support_operations
   WHERE id = p_operation_id AND actor_key = p_actor_key
   FOR UPDATE;
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
    SELECT 1
      FROM public.chatbot_messages
     WHERE id = p_user_message_id
       AND session_id = p_session_id
       AND role = 'user'
       AND operation_id = p_operation_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'support_operation_turn_missing';
  END IF;

  INSERT INTO public.chatbot_messages (
    session_id, role, body, kb_matched, reply_to_message_id, answer_language, privacy_blocked
  ) VALUES (
    p_session_id, 'bot', p_answer, p_kb_matched, p_user_message_id, p_answer_language, p_privacy_blocked
  ) RETURNING id INTO v_bot_message_id;

  INSERT INTO public.chatbot_message_kb_refs (
    message_id, document_id, score, document_title_snapshot, content_version
  )
  SELECT v_bot_message_id,
         (evidence.item ->> 'documentId')::uuid,
         nullif(evidence.item ->> 'score', '')::numeric,
         evidence.item ->> 'title',
         (evidence.item ->> 'contentVersion')::bigint
    FROM jsonb_array_elements(p_kb_refs) AS evidence(item);

  UPDATE public.support_operations
     SET state = 'completed', result_id = v_bot_message_id, error_code = NULL,
         lease_token = NULL, lease_expires_at = NULL, updated_at = now()
   WHERE id = p_operation_id;
  RETURN v_bot_message_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.match_kb_documents_with_version(extensions.vector, integer, boolean)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_kb_documents_with_version(extensions.vector, integer, boolean)
  TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.complete_chatbot_ask_operation_with_evidence(uuid, text, uuid, uuid, uuid, text, boolean, text, boolean, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_chatbot_ask_operation_with_evidence(uuid, text, uuid, uuid, uuid, text, boolean, text, boolean, jsonb)
  TO service_role;

NOTIFY pgrst, 'reload schema';
