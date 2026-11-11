-- Bind an already-validated private object to its reply in the same database
-- transaction as ticket activity, assignment, and notification changes.
CREATE OR REPLACE FUNCTION public.commit_support_ticket_attachment(
  p_ticket_id uuid,
  p_actor_id uuid,
  p_sender_role text,
  p_body text,
  p_attachment_path text,
  p_operation_id uuid,
  p_operation_payload_hash text,
  p_lease_token uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_upload public.support_attachment_uploads%ROWTYPE;
  v_ticket public.support_tickets%ROWTYPE;
  v_reply public.support_ticket_replies%ROWTYPE;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'support_ticket_service_role_required';
  END IF;
  IF p_ticket_id IS NULL OR p_actor_id IS NULL OR p_operation_id IS NULL
     OR p_sender_role NOT IN ('customer', 'admin')
     OR p_body IS NULL OR length(btrim(p_body)) > 2000
     OR p_attachment_path IS NULL
     OR p_operation_payload_hash IS NULL
     OR p_operation_payload_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING MESSAGE = 'support_ticket_invalid_attachment';
  END IF;

  SELECT * INTO v_upload
    FROM public.support_attachment_uploads
   WHERE operation_id = p_operation_id
   FOR UPDATE;
  IF NOT FOUND OR v_upload.ticket_id IS DISTINCT FROM p_ticket_id
     OR v_upload.owner_user_id IS DISTINCT FROM p_actor_id
     OR v_upload.sender_role IS DISTINCT FROM p_sender_role
     OR v_upload.operation_payload_hash IS DISTINCT FROM p_operation_payload_hash
     OR v_upload.storage_path IS DISTINCT FROM p_attachment_path
     OR v_upload.state NOT IN ('uploaded', 'bound') THEN
    RAISE EXCEPTION USING MESSAGE = 'support_attachment_upload_unavailable';
  END IF;

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

  IF v_upload.state = 'bound' THEN
    SELECT * INTO v_reply FROM public.support_ticket_replies WHERE id = v_upload.reply_id;
    IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE = 'support_attachment_result_unavailable'; END IF;
    RETURN jsonb_build_object(
      'id', v_reply.id, 'sender_id', v_reply.sender_id, 'sender_role', v_reply.sender_role,
      'body', v_reply.body, 'created_at', v_reply.created_at, 'new_status', v_ticket.status,
      'created', false, 'ticket_user_id', v_ticket.user_id
    );
  END IF;
  IF p_lease_token IS NULL OR v_upload.lease_token IS DISTINCT FROM p_lease_token
     OR v_upload.lease_expires_at <= now() THEN
    RAISE EXCEPTION USING MESSAGE = 'support_attachment_lease_lost';
  END IF;

  SELECT * INTO v_reply
    FROM public.support_ticket_replies
   WHERE ticket_id = p_ticket_id
     AND sender_id = p_actor_id
     AND operation_id = p_operation_id;
  IF FOUND THEN
    IF v_reply.operation_payload_hash IS DISTINCT FROM p_operation_payload_hash
       OR v_reply.attachment_url IS DISTINCT FROM p_attachment_path THEN
      RAISE EXCEPTION USING MESSAGE = 'support_ticket_operation_conflict';
    END IF;
    RETURN jsonb_build_object(
      'id', v_reply.id,
      'sender_id', v_reply.sender_id,
      'sender_role', v_reply.sender_role,
      'body', v_reply.body,
      'created_at', v_reply.created_at,
      'new_status', v_ticket.status,
      'created', false,
      'ticket_user_id', v_ticket.user_id
    );
  END IF;

  IF p_sender_role = 'customer' AND v_ticket.status IN ('resolved', 'closed') THEN
    RAISE EXCEPTION USING MESSAGE = 'support_ticket_locked';
  END IF;

  INSERT INTO public.support_ticket_replies (
    ticket_id, sender_id, sender_role, body, attachment_url, operation_id, operation_payload_hash
  ) VALUES (
    p_ticket_id, p_actor_id, p_sender_role, p_body, p_attachment_path, p_operation_id, p_operation_payload_hash
  ) RETURNING * INTO v_reply;

  UPDATE public.support_tickets
     SET last_reply_at = v_reply.created_at,
         status = CASE WHEN p_sender_role = 'admin' AND status = 'open' THEN 'in_progress' ELSE status END,
         assigned_to = CASE WHEN p_sender_role = 'admin' AND assigned_to IS NULL THEN p_actor_id ELSE assigned_to END
   WHERE id = p_ticket_id
   RETURNING * INTO v_ticket;

  IF p_sender_role = 'admin' THEN
    IF v_ticket.user_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.ticket_mutes AS mute
       WHERE mute.ticket_id = p_ticket_id AND mute.user_id = v_ticket.user_id
    ) THEN
      INSERT INTO public.notifications (user_id, type, title, body, link, event_key)
      VALUES (
        v_ticket.user_id,
        'support_reply',
        'Support replied to your ticket',
        coalesce(nullif(left(p_body, 200), ''), 'Sent an attachment'),
        '/customer/support/' || p_ticket_id::text,
        'support_reply:' || v_reply.id::text || ':' || v_ticket.user_id::text
      )
      ON CONFLICT (event_key) WHERE event_key IS NOT NULL DO NOTHING;
    END IF;
  ELSIF v_ticket.assigned_to IS NOT NULL
        AND app_private.is_super_admin(v_ticket.assigned_to) THEN
    INSERT INTO public.notifications (user_id, type, title, body, link, event_key)
    VALUES (
      v_ticket.assigned_to,
      'support_reply',
      'New reply on ticket: ' || v_ticket.subject,
      coalesce(nullif(left(p_body, 200), ''), 'Sent an attachment'),
      '/admin/support?ticket=' || p_ticket_id::text,
      'support_reply:' || v_reply.id::text || ':' || v_ticket.assigned_to::text
    )
    ON CONFLICT (event_key) WHERE event_key IS NOT NULL DO NOTHING;
  ELSE
    INSERT INTO public.notifications (user_id, type, title, body, link, event_key)
    SELECT DISTINCT
      assignment.user_id,
      'support_reply',
      'New reply on ticket: ' || v_ticket.subject,
      coalesce(nullif(left(p_body, 200), ''), 'Sent an attachment'),
      '/admin/support?ticket=' || p_ticket_id::text,
      'support_reply:' || v_reply.id::text || ':' || assignment.user_id::text
    FROM public.user_roles AS assignment
    JOIN public.roles AS role_row ON role_row.id = assignment.role_id
    WHERE role_row.name = 'super_admin'
    ON CONFLICT (event_key) WHERE event_key IS NOT NULL DO NOTHING;
  END IF;

  UPDATE public.support_attachment_uploads
     SET state = 'bound', reply_id = v_reply.id,
         lease_token = NULL, lease_expires_at = NULL, updated_at = now()
   WHERE id = v_upload.id AND state = 'uploaded';
  IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE = 'support_attachment_upload_unavailable'; END IF;

  RETURN jsonb_build_object(
    'id', v_reply.id,
    'sender_id', v_reply.sender_id,
    'sender_role', v_reply.sender_role,
    'body', v_reply.body,
    'created_at', v_reply.created_at,
    'new_status', v_ticket.status,
    'created', true,
    'ticket_user_id', v_ticket.user_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.commit_support_ticket_attachment(uuid, uuid, text, text, text, uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_support_ticket_attachment(uuid, uuid, text, text, text, uuid, text, uuid)
  TO service_role;

NOTIFY pgrst, 'reload schema';
