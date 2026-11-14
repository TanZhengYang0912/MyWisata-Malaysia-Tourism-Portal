ALTER TABLE public.support_operations
  ADD COLUMN result_json jsonb,
  ADD COLUMN result_expires_at timestamptz,
  ADD CONSTRAINT support_operations_kb_draft_result_only
    CHECK (result_json IS NULL OR kind = 'kb_draft'),
  ADD CONSTRAINT support_operations_kb_draft_result_expiry_complete
    CHECK ((result_json IS NULL) = (result_expires_at IS NULL));

CREATE OR REPLACE FUNCTION public.reserve_support_kb_draft(
  p_operation_id uuid,
  p_owner_user_id uuid,
  p_payload_hash text,
  p_lease_seconds integer DEFAULT 120
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'support_operation_service_role_required';
  END IF;
  IF p_owner_user_id IS NULL OR NOT coalesce(app_private.is_super_admin(p_owner_user_id), false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'chatbot_kb_author_super_admin_required';
  END IF;
  RETURN public.reserve_support_operation(
    p_operation_id, 'user:' || p_owner_user_id::text, p_owner_user_id,
    NULL, 'kb_draft', p_payload_hash, p_lease_seconds
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_support_kb_draft(
  p_operation_id uuid,
  p_owner_user_id uuid,
  p_lease_token uuid,
  p_payload_hash text,
  p_result jsonb
)
RETURNS jsonb
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
  IF p_owner_user_id IS NULL OR NOT coalesce(app_private.is_super_admin(p_owner_user_id), false)
     OR p_result IS NULL OR jsonb_typeof(p_result) <> 'object'
     OR jsonb_typeof(p_result->'title') IS DISTINCT FROM 'string'
     OR length(p_result->>'title') NOT BETWEEN 1 AND 255
     OR jsonb_typeof(p_result->'body') IS DISTINCT FROM 'string'
     OR length(p_result->>'body') NOT BETWEEN 1 AND 2000
     OR jsonb_typeof(p_result->'keywords') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_result->'keywords') > 8
     OR jsonb_typeof(p_result->'category') IS DISTINCT FROM 'string'
     OR p_result->>'category' IS NULL
     OR p_result->>'category' NOT IN ('booking', 'payment', 'vendor', 'withdrawal', 'affiliate', 'general') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'support_kb_draft_result_invalid';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_result->'keywords') AS item(value)
     WHERE jsonb_typeof(value) <> 'string' OR length(value #>> '{}') NOT BETWEEN 1 AND 64
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'support_kb_draft_result_invalid';
  END IF;

  SELECT * INTO v_operation FROM public.support_operations
   WHERE id = p_operation_id AND owner_user_id = p_owner_user_id
     AND actor_key = 'user:' || p_owner_user_id::text
   FOR UPDATE;
  IF NOT FOUND OR v_operation.kind <> 'kb_draft' OR v_operation.payload_hash <> p_payload_hash THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'support_operation_forbidden';
  END IF;
  IF v_operation.state = 'completed' AND v_operation.result_json IS NOT NULL
     AND v_operation.result_expires_at > now() THEN
    RETURN v_operation.result_json;
  END IF;
  IF v_operation.state <> 'running' OR v_operation.lease_token <> p_lease_token THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'support_operation_lease_lost';
  END IF;

  UPDATE public.support_operations
     SET state = 'completed', result_json = p_result,
         result_expires_at = now() + interval '24 hours', error_code = NULL,
         lease_token = NULL, lease_expires_at = NULL, updated_at = now()
   WHERE id = p_operation_id;
  RETURN p_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.finish_support_kb_draft_failure(
  p_operation_id uuid,
  p_owner_user_id uuid,
  p_lease_token uuid,
  p_safe_code text
)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_operation public.support_operations%ROWTYPE;
  v_state text;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'support_operation_service_role_required';
  END IF;
  IF p_owner_user_id IS NULL OR NOT coalesce(app_private.is_super_admin(p_owner_user_id), false)
     OR p_safe_code NOT IN ('RATE_LIMITED', 'DRAFT_UNAVAILABLE') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'support_operation_forbidden';
  END IF;
  SELECT * INTO v_operation FROM public.support_operations
   WHERE id = p_operation_id AND owner_user_id = p_owner_user_id
     AND actor_key = 'user:' || p_owner_user_id::text
   FOR UPDATE;
  IF NOT FOUND OR v_operation.kind <> 'kb_draft' OR v_operation.state <> 'running'
     OR v_operation.lease_token <> p_lease_token THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'support_operation_lease_lost';
  END IF;

  v_state := CASE WHEN v_operation.external_started_at IS NULL THEN 'failed' ELSE 'unknown' END;
  UPDATE public.support_operations
     SET state = v_state,
         error_code = CASE WHEN v_state = 'unknown' THEN 'OPERATION_UNKNOWN' ELSE p_safe_code END,
         lease_token = CASE WHEN v_state = 'unknown' THEN lease_token ELSE NULL END,
         lease_expires_at = CASE WHEN v_state = 'unknown' THEN lease_expires_at ELSE NULL END,
         updated_at = now()
   WHERE id = p_operation_id;
  RETURN v_state;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cleanup_support_kb_draft_results(p_limit integer DEFAULT 50)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_cleaned integer;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'support_operation_service_role_required';
  END IF;
  IF p_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'support_operation_invalid';
  END IF;
  WITH expired AS (
    SELECT id FROM public.support_operations
     WHERE kind = 'kb_draft' AND result_json IS NOT NULL AND result_expires_at <= now()
     ORDER BY result_expires_at, id FOR UPDATE SKIP LOCKED LIMIT p_limit
  )
  UPDATE public.support_operations AS operations
     SET result_json = NULL, result_expires_at = NULL, updated_at = now()
    FROM expired WHERE operations.id = expired.id;
  GET DIAGNOSTICS v_cleaned = ROW_COUNT;
  RETURN v_cleaned;
END;
$function$;

REVOKE ALL ON FUNCTION public.reserve_support_kb_draft(uuid, uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_support_kb_draft(uuid, uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_support_kb_draft_failure(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_support_kb_draft_results(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_support_kb_draft(uuid, uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_support_kb_draft(uuid, uuid, uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_support_kb_draft_failure(uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_support_kb_draft_results(integer) TO service_role;

NOTIFY pgrst, 'reload schema';
