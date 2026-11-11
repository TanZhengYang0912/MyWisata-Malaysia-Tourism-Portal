-- Reconcile stale uploads against their registered private object before any
-- cleanup or path rotation. A missing or mismatched object stays recoverable.
ALTER TABLE public.support_attachment_uploads
  ADD COLUMN IF NOT EXISTS reconciliation_attempts integer NOT NULL DEFAULT 0;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
     WHERE conname = 'support_attachment_reconciliation_attempts_nonnegative'
       AND conrelid = 'public.support_attachment_uploads'::regclass
  ) THEN
    ALTER TABLE public.support_attachment_uploads
      ADD CONSTRAINT support_attachment_reconciliation_attempts_nonnegative
      CHECK (reconciliation_attempts >= 0);
  END IF;
END;
$migration$;

CREATE INDEX support_attachment_reconciliation_due_idx
  ON public.support_attachment_uploads (next_attempt_at, external_started_at, id)
  WHERE state = 'uploading' AND external_started_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.claim_support_attachment_reconciliation()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_token uuid := gen_random_uuid();
  v_item record;
  v_items jsonb := '[]'::jsonb;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'support_ticket_service_role_required';
  END IF;

  FOR v_item IN
    SELECT upload.id, upload.operation_id,
           upload.storage_path, upload.server_sha256, upload.size_bytes
      FROM public.support_attachment_uploads AS upload
     WHERE upload.state = 'uploading'
       AND upload.external_started_at IS NOT NULL
       AND (upload.lease_expires_at IS NULL OR upload.lease_expires_at <= now())
       AND upload.external_started_at < now() - interval '24 hours'
       AND coalesce(upload.next_attempt_at, '-infinity'::timestamptz) <= now()
     ORDER BY upload.updated_at, upload.id
     FOR UPDATE SKIP LOCKED
     LIMIT 50
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.support_ticket_replies AS reply
       WHERE reply.attachment_url = v_item.storage_path
    ) THEN
      UPDATE public.support_attachment_uploads
         SET state = 'bound',
             reply_id = (SELECT reply.id FROM public.support_ticket_replies AS reply WHERE reply.attachment_url = v_item.storage_path LIMIT 1),
             lease_token = NULL, lease_expires_at = NULL, updated_at = now()
       WHERE id = v_item.id;
      CONTINUE;
    END IF;

    UPDATE public.support_attachment_uploads
       SET lease_token = v_token,
           lease_expires_at = now() + interval '15 minutes',
           reconciliation_attempts = reconciliation_attempts + 1,
           next_attempt_at = now() + interval '15 minutes',
           updated_at = now()
     WHERE id = v_item.id;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'id', v_item.id,
      'operation_id', v_item.operation_id,
      'storage_path', v_item.storage_path,
      'server_sha256', v_item.server_sha256,
      'size_bytes', v_item.size_bytes
    ));
  END LOOP;

  RETURN jsonb_build_object('token', v_token, 'items', v_items);
END;
$function$;

CREATE OR REPLACE FUNCTION public.finish_support_attachment_reconciliation(
  p_operation_id uuid,
  p_token uuid,
  p_object_verified boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_upload public.support_attachment_uploads%ROWTYPE;
  v_reply_id uuid;
  v_backoff_hours integer;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'support_ticket_service_role_required';
  END IF;
  IF p_operation_id IS NULL OR p_token IS NULL OR p_object_verified IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'support_attachment_reconciliation_invalid';
  END IF;

  SELECT * INTO v_upload
    FROM public.support_attachment_uploads
   WHERE operation_id = p_operation_id
   FOR UPDATE;
  IF NOT FOUND OR v_upload.state <> 'uploading'
     OR v_upload.lease_token IS DISTINCT FROM p_token
     OR v_upload.lease_expires_at <= now() THEN
    RAISE EXCEPTION USING MESSAGE = 'support_attachment_reconciliation_lease_lost';
  END IF;

  SELECT reply.id INTO v_reply_id
    FROM public.support_ticket_replies AS reply
   WHERE reply.attachment_url = v_upload.storage_path
   LIMIT 1;
  IF v_reply_id IS NOT NULL THEN
    UPDATE public.support_attachment_uploads
       SET state = 'bound', reply_id = v_reply_id,
           lease_token = NULL, lease_expires_at = NULL,
           next_attempt_at = NULL, updated_at = now()
     WHERE id = v_upload.id;
    RETURN jsonb_build_object('state', 'bound');
  END IF;

  IF p_object_verified THEN
    UPDATE public.support_attachment_uploads
       SET state = 'uploaded', lease_token = NULL, lease_expires_at = now(),
           next_attempt_at = NULL, updated_at = now()
     WHERE id = v_upload.id;
    RETURN jsonb_build_object('state', 'uploaded');
  END IF;

  v_backoff_hours := least(24, 1 << least(v_upload.reconciliation_attempts, 4));
  UPDATE public.support_attachment_uploads
     SET lease_token = NULL, lease_expires_at = NULL,
         next_attempt_at = now() + make_interval(hours => v_backoff_hours),
         updated_at = now()
   WHERE id = v_upload.id;
  RETURN jsonb_build_object('state', 'unknown');
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_support_attachment_reconciliation()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_support_attachment_reconciliation(uuid, uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_support_attachment_reconciliation()
  TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_support_attachment_reconciliation(uuid, uuid, boolean)
  TO service_role;

NOTIFY pgrst, 'reload schema';
