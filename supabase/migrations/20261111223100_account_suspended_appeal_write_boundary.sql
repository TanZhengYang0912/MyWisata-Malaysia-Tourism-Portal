-- Suspension appeals contain free-form evidence. Funnel the new API write
-- through an atomic, service-only RPC before the follow-up client grant lockdown.

CREATE OR REPLACE FUNCTION public.create_account_suspension_appeal(
  p_user_id uuid,
  p_operation_id uuid,
  p_payload_hash text,
  p_body text,
  p_category text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_status text;
  v_existing public.support_tickets%ROWTYPE;
  v_ticket public.support_tickets%ROWTYPE;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'support_ticket_service_role_required';
  END IF;

  IF p_user_id IS NULL OR p_operation_id IS NULL
     OR p_payload_hash IS NULL OR p_payload_hash !~ '^[0-9a-f]{64}$'
     OR p_body IS NULL OR char_length(btrim(p_body)) < 10 OR char_length(btrim(p_body)) > 2000
     OR p_category IS NULL
     OR p_category NOT IN ('booking', 'payment', 'vendor', 'withdrawal', 'kyc', 'technical', 'affiliate', 'general') THEN
    RAISE EXCEPTION USING MESSAGE = 'account_appeal_invalid';
  END IF;

  -- Serialize appeals for one account. This makes the suspension check and
  -- operation-key lookup safe against concurrent retries and status changes.
  SELECT users.status
    INTO v_status
    FROM public.users AS users
   WHERE users.id = p_user_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING MESSAGE = 'account_appeal_user_not_found';
  END IF;
  SELECT *
    INTO v_existing
    FROM public.support_tickets AS tickets
   WHERE tickets.user_id = p_user_id
     AND tickets.operation_id = p_operation_id
   FOR UPDATE;
  IF FOUND THEN
    IF v_existing.operation_payload_hash IS DISTINCT FROM p_payload_hash THEN
      RAISE EXCEPTION USING MESSAGE = 'support_ticket_operation_conflict';
    END IF;
    RETURN jsonb_build_object('id', v_existing.id, 'category', v_existing.category, 'created', false);
  END IF;

  IF v_status IS DISTINCT FROM 'suspended' THEN
    RAISE EXCEPTION USING MESSAGE = 'account_not_suspended';
  END IF;

  INSERT INTO public.support_tickets (
    user_id, session_id, subject, body, category, classification_method,
    status, operation_id, operation_payload_hash
  ) VALUES (
    p_user_id, NULL, 'Account suspension appeal', btrim(p_body), p_category, 'keyword',
    'open', p_operation_id, p_payload_hash
  )
  RETURNING * INTO v_ticket;

  RETURN jsonb_build_object('id', v_ticket.id, 'category', v_ticket.category, 'created', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.create_account_suspension_appeal(uuid, uuid, text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_account_suspension_appeal(uuid, uuid, text, text, text)
  TO service_role;
