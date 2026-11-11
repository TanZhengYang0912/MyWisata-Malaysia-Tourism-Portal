-- Keep the canonical bootstrap schema aligned with the statuses already used
-- by the support API and admin queue.
ALTER TABLE public.support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_status_check;

ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_status_check
  CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')) NOT VALID;

-- The canonical bootstrap migration predates the notification event key used
-- throughout the application. Per-recipient keys keep fan-out idempotent.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS event_key text;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_event_key_unique
  ON public.notifications (event_key)
  WHERE event_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.commit_support_ticket_reply(
  p_ticket_id uuid,
  p_actor_id uuid,
  p_sender_role text,
  p_body text,
  p_operation_id uuid,
  p_operation_payload_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_ticket public.support_tickets%ROWTYPE;
  v_reply public.support_ticket_replies%ROWTYPE;
  v_created boolean := false;
BEGIN
  IF p_ticket_id IS NULL OR p_actor_id IS NULL OR p_operation_id IS NULL
     OR p_sender_role NOT IN ('customer', 'admin')
     OR p_body IS NULL OR length(btrim(p_body)) = 0
     OR p_operation_payload_hash IS NULL
     OR p_operation_payload_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING MESSAGE = 'support_ticket_invalid_reply';
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

  -- Look up a retry before checking the current state. A response may have
  -- been lost after commit, and that original reply remains the result.
  SELECT * INTO v_reply
    FROM public.support_ticket_replies
   WHERE ticket_id = p_ticket_id
     AND sender_id = p_actor_id
     AND operation_id = p_operation_id;
  IF FOUND THEN
    IF v_reply.operation_payload_hash IS DISTINCT FROM p_operation_payload_hash THEN
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
    ticket_id, sender_id, sender_role, body, operation_id, operation_payload_hash
  ) VALUES (
    p_ticket_id, p_actor_id, p_sender_role, p_body, p_operation_id, p_operation_payload_hash
  ) RETURNING * INTO v_reply;

  UPDATE public.support_tickets
     SET last_reply_at = v_reply.created_at,
         status = CASE
           WHEN p_sender_role = 'admin' AND status = 'open' THEN 'in_progress'
           ELSE status
         END,
         assigned_to = CASE
           WHEN p_sender_role = 'admin' AND assigned_to IS NULL THEN p_actor_id
           ELSE assigned_to
         END
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
        left(p_body, 200),
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
      left(p_body, 200),
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
      left(p_body, 200),
      '/admin/support?ticket=' || p_ticket_id::text,
      'support_reply:' || v_reply.id::text || ':' || assignment.user_id::text
    FROM public.user_roles AS assignment
    JOIN public.roles AS role_row ON role_row.id = assignment.role_id
    WHERE role_row.name = 'super_admin'
    ON CONFLICT (event_key) WHERE event_key IS NOT NULL DO NOTHING;
  END IF;

  v_created := true;
  RETURN jsonb_build_object(
    'id', v_reply.id,
    'sender_id', v_reply.sender_id,
    'sender_role', v_reply.sender_role,
    'body', v_reply.body,
    'created_at', v_reply.created_at,
    'new_status', v_ticket.status,
    'created', v_created,
    'ticket_user_id', v_ticket.user_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.commit_support_ticket_reply(uuid, uuid, text, text, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_support_ticket_reply(uuid, uuid, text, text, uuid, text)
  TO service_role;

NOTIFY pgrst, 'reload schema';
