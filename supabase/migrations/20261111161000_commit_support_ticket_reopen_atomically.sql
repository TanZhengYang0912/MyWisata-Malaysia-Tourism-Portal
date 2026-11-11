-- Reopening and notifying the support team are one state transition. A retry
-- after a lost response sees the new status and does not send another notice.
CREATE OR REPLACE FUNCTION public.reopen_support_ticket(
  p_ticket_id uuid,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_ticket public.support_tickets%ROWTYPE;
  v_recipient record;
  v_reopened_at timestamptz;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'support_ticket_service_role_required';
  END IF;

  IF p_ticket_id IS NULL OR p_actor_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'support_ticket_invalid_reopen';
  END IF;

  SELECT * INTO v_ticket
    FROM public.support_tickets
   WHERE id = p_ticket_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING MESSAGE = 'support_ticket_not_found';
  END IF;
  IF v_ticket.user_id IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION USING MESSAGE = 'support_ticket_forbidden';
  END IF;

  IF v_ticket.status NOT IN ('resolved', 'closed') THEN
    RETURN jsonb_build_object('id', v_ticket.id, 'status', v_ticket.status, 'changed', false);
  END IF;

  v_reopened_at := clock_timestamp();
  UPDATE public.support_tickets
     SET status = 'in_progress',
         reopened_at = v_reopened_at,
         resolved_at = NULL
   WHERE id = p_ticket_id
   RETURNING * INTO v_ticket;

  FOR v_recipient IN
    SELECT DISTINCT assignment.user_id
      FROM public.user_roles AS assignment
      JOIN public.roles AS role_row ON role_row.id = assignment.role_id
     WHERE role_row.name = 'super_admin'
       AND (
         NOT coalesce(app_private.is_super_admin(v_ticket.assigned_to), false)
         OR assignment.user_id = v_ticket.assigned_to
       )
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, link, event_key)
    VALUES (
      v_recipient.user_id,
      'support_ticket_reopened',
      'Ticket reopened: ' || v_ticket.subject,
      'The customer reopened this ticket.',
      '/admin/support?ticket=' || p_ticket_id::text,
      'support_reopened:' || p_ticket_id::text || ':'
        || to_char(v_reopened_at AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISS.US')
        || ':' || v_recipient.user_id::text
    )
    ON CONFLICT (event_key) WHERE event_key IS NOT NULL DO NOTHING;
  END LOOP;

  RETURN jsonb_build_object('id', v_ticket.id, 'status', v_ticket.status, 'changed', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.reopen_support_ticket(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_support_ticket(uuid, uuid)
  TO service_role;

NOTIFY pgrst, 'reload schema';
