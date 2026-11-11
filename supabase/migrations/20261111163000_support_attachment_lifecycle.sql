-- Private manifest for support objects. Rows are reserved before calling
-- Storage so a process interruption never leaves an untracked path.
CREATE TABLE public.support_attachment_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL UNIQUE,
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL,
  sender_role text NOT NULL CHECK (sender_role IN ('customer', 'admin')),
  storage_path text NOT NULL UNIQUE
    CHECK (split_part(storage_path, '/', 1) = ticket_id::text
      AND split_part(storage_path, '/', 2) ~ '^[0-9a-f-]{36}\.(jpg|png|webp|pdf)$'
      AND split_part(storage_path, '/', 3) = ''),
  operation_payload_hash text NOT NULL CHECK (operation_payload_hash ~ '^[0-9a-f]{64}$'),
  server_sha256 text NOT NULL CHECK (server_sha256 ~ '^[0-9a-f]{64}$'),
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  state text NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved', 'uploading', 'uploaded', 'bound', 'abandoned', 'deleting', 'deleted')),
  lease_token uuid,
  lease_expires_at timestamptz,
  external_started_at timestamptz,
  reply_id uuid UNIQUE REFERENCES public.support_ticket_replies(id) ON DELETE SET NULL,
  cleanup_attempts integer NOT NULL DEFAULT 0 CHECK (cleanup_attempts >= 0),
  next_attempt_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.support_attachment_uploads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.support_attachment_uploads FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.support_attachment_uploads TO service_role;

-- All attachment reads and writes go through ticket owner-checked server
-- routes. Browser roles must not bypass the registry through Storage or read
-- the private object path from the reply row.
DROP POLICY IF EXISTS ticket_attachments_insert ON storage.objects;
DROP POLICY IF EXISTS ticket_attachments_select ON storage.objects;
REVOKE ALL ON TABLE public.support_ticket_replies FROM anon, authenticated;
GRANT SELECT (ticket_id, sender_role, created_at) ON TABLE public.support_ticket_replies TO authenticated;

CREATE INDEX support_attachment_cleanup_due_idx
  ON public.support_attachment_uploads (next_attempt_at, updated_at, id)
  WHERE state IN ('uploaded', 'abandoned');

CREATE OR REPLACE FUNCTION public.reserve_support_attachment(
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
  v_ticket public.support_tickets%ROWTYPE;
  v_upload public.support_attachment_uploads%ROWTYPE;
  v_reply public.support_ticket_replies%ROWTYPE;
  v_upload_id uuid := gen_random_uuid();
  v_token uuid := gen_random_uuid();
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
  SELECT * INTO v_upload
    FROM public.support_attachment_uploads
   WHERE operation_id = p_operation_id
   FOR UPDATE;

  SELECT * INTO v_ticket
    FROM public.support_tickets
   WHERE id = p_ticket_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING MESSAGE = 'support_ticket_not_found';
  END IF;
  IF (p_sender_role = 'customer' AND v_ticket.user_id IS DISTINCT FROM p_actor_id)
     OR (p_sender_role = 'admin' AND NOT coalesce(app_private.is_super_admin(p_actor_id), false)) THEN
    RAISE EXCEPTION USING MESSAGE = 'support_ticket_forbidden';
  END IF;

  v_extension := CASE p_mime_type WHEN 'image/jpeg' THEN 'jpg' WHEN 'image/png' THEN 'png'
    WHEN 'image/webp' THEN 'webp' ELSE 'pdf' END;
  v_path := p_ticket_id::text || '/' || v_upload_id::text || '.' || v_extension;

  IF v_upload.id IS NOT NULL THEN
    IF v_upload.ticket_id IS DISTINCT FROM p_ticket_id
       OR v_upload.owner_user_id IS DISTINCT FROM p_actor_id
       OR v_upload.sender_role IS DISTINCT FROM p_sender_role
       OR v_upload.operation_payload_hash IS DISTINCT FROM p_operation_payload_hash
       OR v_upload.server_sha256 IS DISTINCT FROM p_server_sha256
       OR v_upload.mime_type IS DISTINCT FROM p_mime_type
       OR v_upload.size_bytes IS DISTINCT FROM p_size_bytes THEN
      RAISE EXCEPTION USING MESSAGE = 'support_ticket_operation_conflict';
    END IF;
    IF v_upload.state = 'bound' THEN
      SELECT * INTO v_reply FROM public.support_ticket_replies WHERE id = v_upload.reply_id;
      IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE = 'support_attachment_result_unavailable'; END IF;
      RETURN jsonb_build_object('state', 'bound', 'reply', jsonb_build_object(
        'id', v_reply.id, 'sender_id', v_reply.sender_id, 'sender_role', v_reply.sender_role,
        'body', v_reply.body, 'created_at', v_reply.created_at, 'new_status', v_ticket.status,
        'created', false, 'ticket_user_id', v_ticket.user_id
      ));
    END IF;
    IF v_upload.state IN ('deleting', 'deleted', 'abandoned') THEN
      RAISE EXCEPTION USING MESSAGE = 'support_attachment_result_unavailable';
    END IF;
    IF v_upload.lease_expires_at > now() THEN
      RAISE EXCEPTION USING MESSAGE = 'support_attachment_pending';
    END IF;

    UPDATE public.support_attachment_uploads
       SET lease_token = v_token,
           lease_expires_at = now() + interval '10 minutes',
           updated_at = now()
     WHERE id = v_upload.id
     RETURNING * INTO v_upload;
    RETURN jsonb_build_object(
      'state', CASE WHEN v_upload.state = 'uploaded' THEN 'uploaded'
                    WHEN v_upload.external_started_at IS NOT NULL THEN 'unknown'
                    ELSE 'reserved' END,
      'storage_path', v_upload.storage_path,
      'lease_token', v_upload.lease_token
    );
  END IF;

  IF p_sender_role = 'customer' AND v_ticket.status IN ('resolved', 'closed') THEN
    RAISE EXCEPTION USING MESSAGE = 'support_ticket_locked';
  END IF;

  INSERT INTO public.support_attachment_uploads (
    id, operation_id, ticket_id, owner_user_id, sender_role, storage_path,
    operation_payload_hash, server_sha256, mime_type, size_bytes,
    state, lease_token, lease_expires_at
  ) VALUES (
    v_upload_id, p_operation_id, p_ticket_id, p_actor_id, p_sender_role, v_path,
    p_operation_payload_hash, p_server_sha256, p_mime_type, p_size_bytes,
    'reserved', v_token, now() + interval '10 minutes'
  ) RETURNING * INTO v_upload;

  RETURN jsonb_build_object(
    'state', 'reserved', 'storage_path', v_upload.storage_path, 'lease_token', v_upload.lease_token
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_support_attachment_started(
  p_operation_id uuid, p_actor_id uuid, p_lease_token uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'support_ticket_service_role_required';
  END IF;
  UPDATE public.support_attachment_uploads
     SET state = 'uploading', external_started_at = now(), updated_at = now()
   WHERE operation_id = p_operation_id AND owner_user_id = p_actor_id
     AND lease_token = p_lease_token AND state = 'reserved' AND lease_expires_at > now();
  IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE = 'support_attachment_lease_lost'; END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_support_attachment_uploaded(
  p_operation_id uuid, p_actor_id uuid, p_lease_token uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'support_ticket_service_role_required';
  END IF;
  UPDATE public.support_attachment_uploads
     SET state = 'uploaded', updated_at = now()
   WHERE operation_id = p_operation_id AND owner_user_id = p_actor_id
     AND lease_token = p_lease_token AND state IN ('uploading', 'uploaded') AND lease_expires_at > now();
  IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE = 'support_attachment_lease_lost'; END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.abandon_support_attachment(
  p_operation_id uuid, p_actor_id uuid, p_lease_token uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'support_ticket_service_role_required';
  END IF;
  UPDATE public.support_attachment_uploads
     SET state = 'abandoned', lease_expires_at = NULL, next_attempt_at = now(), updated_at = now()
   WHERE operation_id = p_operation_id AND owner_user_id = p_actor_id
     AND lease_token = p_lease_token AND state IN ('uploading', 'uploaded');
  IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE = 'support_attachment_lease_lost'; END IF;
END;
$function$;

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
       (upload.state = 'uploaded'
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

CREATE OR REPLACE FUNCTION public.finish_support_attachment_cleanup(
  p_token uuid, p_deleted_ids uuid[], p_failed_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_deleted integer;
  v_rescheduled integer;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'support_ticket_service_role_required';
  END IF;
  IF p_token IS NULL OR coalesce(cardinality(p_deleted_ids), 0) + coalesce(cardinality(p_failed_ids), 0) > 50 THEN
    RAISE EXCEPTION USING MESSAGE = 'support_attachment_cleanup_invalid';
  END IF;
  UPDATE public.support_attachment_uploads
     SET state = 'deleted', lease_token = NULL, lease_expires_at = NULL, updated_at = now()
   WHERE id = ANY(coalesce(p_deleted_ids, ARRAY[]::uuid[])) AND state = 'deleting' AND lease_token = p_token;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  UPDATE public.support_attachment_uploads
     SET state = 'abandoned', lease_token = NULL, lease_expires_at = NULL,
         cleanup_attempts = cleanup_attempts + 1,
         next_attempt_at = now() + make_interval(hours => least(24, 1 << least(cleanup_attempts, 4))),
         updated_at = now()
   WHERE id = ANY(coalesce(p_failed_ids, ARRAY[]::uuid[])) AND state = 'deleting' AND lease_token = p_token;
  GET DIAGNOSTICS v_rescheduled = ROW_COUNT;
  RETURN jsonb_build_object('deleted', v_deleted, 'rescheduled', v_rescheduled);
END;
$function$;

REVOKE ALL ON FUNCTION public.reserve_support_attachment(uuid, uuid, uuid, text, text, text, text, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_support_attachment_started(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_support_attachment_uploaded(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.abandon_support_attachment(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_support_attachment_cleanup()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_support_attachment_cleanup(uuid, uuid[], uuid[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_support_attachment(uuid, uuid, uuid, text, text, text, text, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_support_attachment_started(uuid, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_support_attachment_uploaded(uuid, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.abandon_support_attachment(uuid, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_support_attachment_cleanup()
  TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_support_attachment_cleanup(uuid, uuid[], uuid[])
  TO service_role;

NOTIFY pgrst, 'reload schema';
