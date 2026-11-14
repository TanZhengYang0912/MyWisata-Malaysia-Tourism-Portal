CREATE TABLE public.support_handoff_tokens (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  owner_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.support_handoff_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.support_handoff_tokens FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.support_handoff_tokens TO service_role;

CREATE INDEX support_handoff_tokens_expiry_idx
  ON public.support_handoff_tokens (expires_at);

CREATE OR REPLACE FUNCTION public.cleanup_support_handoff_tokens()
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_deleted integer;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'support_handoff_cleanup_service_role_required';
  END IF;
  WITH expired AS (
    SELECT token_hash FROM public.support_handoff_tokens
     WHERE expires_at <= now()
     ORDER BY expires_at, token_hash
     FOR UPDATE SKIP LOCKED
     LIMIT 100
  )
  DELETE FROM public.support_handoff_tokens AS token
   USING expired
   WHERE token.token_hash = expired.token_hash;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$function$;

REVOKE ALL ON FUNCTION public.cleanup_support_handoff_tokens() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_support_handoff_tokens() TO service_role;
