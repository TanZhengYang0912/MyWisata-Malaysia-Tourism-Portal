-- Preserve attachment manifests when tickets are deleted, and safely retry an
-- operation only after cleanup has confirmed its previous object is absent.
ALTER TABLE public.support_attachment_uploads
  DROP CONSTRAINT support_attachment_uploads_ticket_id_fkey,
  ADD CONSTRAINT support_attachment_uploads_ticket_id_fkey
    FOREIGN KEY (ticket_id) REFERENCES public.support_tickets(id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.retry_support_attachment(
  p_operation_id uuid,
  p_ticket_id uuid,
  p_actor_id uuid,
  p_sender_role text,
  p_operation_payload_hash text,
  p_server_sha256 text,
  p_mime_type text,
  p_size_bytes integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_upload public.support_attachment_uploads%ROWTYPE;
  v_ticket public.support_tickets%ROWTYPE;
  v_token uuid := gen_random_uuid();
  v_upload_id uuid := gen_random_uuid();
  v_extension text;
  v_path text;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'support_ticket_service_role_required';
  END IF;
  IF p_operation_id IS NULL OR p_ticket_id IS NULL OR p_actor_id IS NULL
     OR p_sender_role NOT IN ('customer', 'admin')
     OR p_operation_payload_hash IS NULL OR p_operation_payload_hash !~ '^[0-9a-f]{64}$'
     OR p_server_sha256 IS NULL OR p_server_sha256 !~ '^[0-9a-f]{64}$'
     OR p_mime_type NOT IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
     OR p_size_bytes NOT BETWEEN 1 AND 10485760 THEN
    RAISE EXCEPTION USING MESSAGE = 'support_ticket_invalid_attachment';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));
  SELECT * INTO v_upload FROM public.support_attachment_uploads
   WHERE operation_id = p_operation_id FOR UPDATE;
  IF NOT FOUND OR v_upload.ticket_id IS DISTINCT FROM p_ticket_id
     OR v_upload.owner_user_id IS DISTINCT FROM p_actor_id
     OR v_upload.sender_role IS DISTINCT FROM p_sender_role
     OR v_upload.operation_payload_hash IS DISTINCT FROM p_operation_payload_hash
     OR v_upload.server_sha256 IS DISTINCT FROM p_server_sha256
     OR v_upload.mime_type IS DISTINCT FROM p_mime_type
     OR v_upload.size_bytes IS DISTINCT FROM p_size_bytes THEN
    RAISE EXCEPTION USING MESSAGE = 'support_ticket_operation_conflict';
  END IF;
  IF v_upload.state <> 'deleted' THEN
    RAISE EXCEPTION USING MESSAGE = 'support_attachment_retry_pending';
  END IF;

  SELECT * INTO v_ticket FROM public.support_tickets WHERE id = p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE = 'support_ticket_not_found'; END IF;
  IF (p_sender_role = 'customer' AND v_ticket.user_id IS DISTINCT FROM p_actor_id)
     OR (p_sender_role = 'admin' AND NOT coalesce(app_private.is_super_admin(p_actor_id), false)) THEN
    RAISE EXCEPTION USING MESSAGE = 'support_ticket_forbidden';
  END IF;
  IF p_sender_role = 'customer' AND v_ticket.status IN ('resolved', 'closed') THEN
    RAISE EXCEPTION USING MESSAGE = 'support_ticket_locked';
  END IF;

  v_extension := CASE p_mime_type WHEN 'image/jpeg' THEN 'jpg' WHEN 'image/png' THEN 'png'
    WHEN 'image/webp' THEN 'webp' ELSE 'pdf' END;
  v_path := p_ticket_id::text || '/' || v_upload_id::text || '.' || v_extension;
  UPDATE public.support_attachment_uploads
     SET storage_path = v_path,
         state = 'reserved',
         lease_token = v_token,
         lease_expires_at = now() + interval '10 minutes',
         external_started_at = NULL,
         cleanup_attempts = 0,
         next_attempt_at = NULL,
         updated_at = now()
   WHERE id = v_upload.id;

  RETURN jsonb_build_object('state', 'reserved', 'storage_path', v_path, 'lease_token', v_token);
END;
$function$;

REVOKE ALL ON FUNCTION public.retry_support_attachment(uuid, uuid, uuid, text, text, text, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retry_support_attachment(uuid, uuid, uuid, text, text, text, text, integer)
  TO service_role;

NOTIFY pgrst, 'reload schema';

-- Expired reservations are safe to collect because Storage cannot be called
-- until mark_support_attachment_started changes the row while holding it.
CREATE OR REPLACE FUNCTION public.claim_support_attachment_cleanup()
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
    SELECT upload.id, upload.storage_path, upload.reply_id
      FROM public.support_attachment_uploads AS upload
     WHERE (
       (upload.state = 'reserved' AND upload.external_started_at IS NULL
         AND upload.lease_expires_at <= now())
       OR (upload.state = 'uploaded'
         AND coalesce(upload.next_attempt_at, '-infinity'::timestamptz) <= now()
         AND upload.lease_expires_at <= now()
         AND upload.updated_at < now() - interval '24 hours')
       OR (upload.state = 'abandoned'
         AND coalesce(upload.next_attempt_at, '-infinity'::timestamptz) <= now()
         AND upload.lease_expires_at IS NULL)
       OR (upload.state = 'deleting' AND upload.lease_expires_at <= now())
     )
     ORDER BY upload.updated_at, upload.id
     FOR UPDATE SKIP LOCKED
     LIMIT 50
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.support_ticket_replies AS reply
       WHERE reply.attachment_url = v_item.storage_path
    ) THEN
      UPDATE public.support_attachment_uploads
         SET state = 'bound', reply_id = coalesce(v_item.reply_id, (
           SELECT reply.id FROM public.support_ticket_replies AS reply WHERE reply.attachment_url = v_item.storage_path LIMIT 1
         )), lease_token = NULL, lease_expires_at = NULL, updated_at = now()
       WHERE id = v_item.id;
      CONTINUE;
    END IF;
    UPDATE public.support_attachment_uploads
       SET state = 'deleting', lease_token = v_token,
           lease_expires_at = now() + interval '15 minutes', updated_at = now()
     WHERE id = v_item.id;
    v_items := v_items || jsonb_build_array(jsonb_build_object('id', v_item.id, 'storage_path', v_item.storage_path));
  END LOOP;
  RETURN jsonb_build_object('token', v_token, 'items', v_items);
END;
$function$;
