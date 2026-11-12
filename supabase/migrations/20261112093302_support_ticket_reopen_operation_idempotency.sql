-- Persist the first result for each explicit customer reopen intent. Ticket
-- state alone is not an idempotency key: the ticket can be resolved again
-- before a client retries a request whose response was lost. NOT VALID keeps
-- rollout independent of historical rows while enforcing new/updated rows.
ALTER TABLE public.support_operations
  ADD COLUMN reopen_result_status text,
  ADD COLUMN reopen_changed boolean,
  ADD CONSTRAINT support_operations_reopen_result_shape CHECK (
    (reopen_result_status IS NULL AND reopen_changed IS NULL)
    OR (
      kind = 'reopen'
      AND reopen_result_status IN ('open', 'in_progress', 'resolved', 'closed')
      AND reopen_changed IS NOT NULL
    )
  ) NOT VALID,
  ADD CONSTRAINT support_operations_reopen_completed_result CHECK (
    kind <> 'reopen'
    OR state <> 'completed'
    OR (result_id IS NOT NULL AND reopen_result_status IS NOT NULL AND reopen_changed IS NOT NULL)
  ) NOT VALID;

DROP FUNCTION public.reopen_support_ticket(uuid, uuid);

CREATE FUNCTION public.reopen_support_ticket(
  p_operation_id uuid,
  p_ticket_id uuid,
  p_actor_id uuid,
  p_operation_payload_hash text,
  p_lease_token uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_operation public.support_operations%ROWTYPE;
  v_ticket public.support_tickets%ROWTYPE;
  v_recipient record;
  v_reopened_at timestamptz;
  v_changed boolean := false;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'support_ticket_service_role_required';
  END IF;

  IF p_operation_id IS NULL OR p_ticket_id IS NULL OR p_actor_id IS NULL
     OR p_operation_payload_hash IS NULL
     OR p_operation_payload_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING MESSAGE = 'support_ticket_invalid_reopen';
  END IF;

  -- Lock the operation before the ticket, matching the shared Support lock
  -- order. A retry after an intervening close returns this saved result.
  SELECT * INTO v_operation
    FROM public.support_operations
   WHERE id = p_operation_id
   FOR UPDATE;
  IF NOT FOUND
     OR v_operation.kind <> 'reopen'
     OR v_operation.actor_key <> 'user:' || p_actor_id::text
     OR v_operation.owner_user_id IS DISTINCT FROM p_actor_id
     OR v_operation.payload_hash <> p_operation_payload_hash THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'support_operation_forbidden';
  END IF;

  IF v_operation.state = 'completed' THEN
    RETURN jsonb_build_object(
      'id', v_operation.result_id,
      'status', v_operation.reopen_result_status,
      'changed', v_operation.reopen_changed,
      'replayed', true
    );
  END IF;
  IF v_operation.state <> 'running'
     OR v_operation.lease_token IS DISTINCT FROM p_lease_token
     OR v_operation.lease_expires_at <= now() THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'support_operation_lease_lost';
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

  IF v_ticket.status IN ('resolved', 'closed') THEN
    v_reopened_at := clock_timestamp();
    UPDATE public.support_tickets
       SET status = 'in_progress',
           reopened_at = v_reopened_at,
           resolved_at = NULL
     WHERE id = p_ticket_id
     RETURNING * INTO v_ticket;
    v_changed := true;

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
        'support_reopened:' || p_operation_id::text || ':' || v_recipient.user_id::text
      )
      ON CONFLICT (event_key) WHERE event_key IS NOT NULL DO NOTHING;
    END LOOP;
  END IF;

  UPDATE public.support_operations
     SET state = 'completed',
         result_id = p_ticket_id,
         reopen_result_status = v_ticket.status,
         reopen_changed = v_changed,
         error_code = NULL,
         lease_token = NULL,
         lease_expires_at = NULL,
         updated_at = now()
   WHERE id = p_operation_id;

  RETURN jsonb_build_object(
    'id', v_ticket.id,
    'status', v_ticket.status,
    'changed', v_changed,
    'replayed', false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.reopen_support_ticket(uuid, uuid, uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_support_ticket(uuid, uuid, uuid, text, uuid)
  TO service_role;

NOTIFY pgrst, 'reload schema';
