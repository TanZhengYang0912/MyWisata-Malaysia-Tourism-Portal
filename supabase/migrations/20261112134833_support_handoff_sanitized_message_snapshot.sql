-- Keep the exact redacted message shown in the preview on the short-lived
-- token, then copy only that value into the ticket during the atomic consume.
-- Existing tickets remain marked false because their stored source text may
-- have been captured before chatbot input was redacted at rest.
ALTER TABLE public.support_handoff_tokens
  ADD COLUMN source_message_snapshot text,
  ADD CONSTRAINT support_handoff_tokens_snapshot_requires_source
    CHECK (source_message_snapshot IS NULL OR source_user_message_id IS NOT NULL);

ALTER TABLE public.support_tickets
  ADD COLUMN handoff_source_message_sanitized boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT support_tickets_sanitized_handoff_requires_snapshot
    CHECK (
      NOT handoff_source_message_sanitized
      OR (handoff_consented_at IS NOT NULL AND handoff_source_message_id IS NOT NULL AND handoff_source_message IS NOT NULL)
    );

-- The browser needs only the bounded columns used by its ticket list and
-- status-card reads. RLS still scopes rows; column grants keep internal and
-- handoff snapshot fields available only through the owner-checked server API.
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS demo_allow_all ON public.support_tickets;
DROP POLICY IF EXISTS support_own_or_admin ON public.support_tickets;
DROP POLICY IF EXISTS support_customer_read ON public.support_tickets;
CREATE POLICY support_customer_read ON public.support_tickets
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

REVOKE SELECT ON TABLE public.support_tickets FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id,
  user_id,
  subject,
  category,
  status,
  withdrawal_id,
  created_at,
  last_reply_at,
  customer_last_read_at
) ON TABLE public.support_tickets TO authenticated;

CREATE OR REPLACE FUNCTION public.create_support_ticket_from_handoff(
  p_owner_id uuid,
  p_operation_id uuid,
  p_operation_payload_hash text,
  p_handoff_token_hash text,
  p_content_hash text,
  p_source_message_id uuid,
  p_subject text,
  p_body text,
  p_category text
)
RETURNS TABLE (ticket_id uuid, category text, created boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_handoff public.support_handoff_tokens%ROWTYPE;
  v_ticket public.support_tickets%ROWTYPE;
  v_source_message_body text;
  v_source_message_snapshot text;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'support_handoff_service_role_required';
  END IF;
  IF p_owner_id IS NULL OR p_operation_id IS NULL
     OR p_operation_payload_hash IS NULL OR p_operation_payload_hash !~ '^[0-9a-f]{64}$'
     OR p_handoff_token_hash IS NULL OR p_handoff_token_hash !~ '^[0-9a-f]{64}$'
     OR p_content_hash IS NULL OR p_content_hash !~ '^[0-9a-f]{64}$'
     OR p_subject IS NULL OR length(p_subject) NOT BETWEEN 1 AND 255
     OR p_body IS NULL OR length(p_body) NOT BETWEEN 1 AND 2000
     OR p_category IS NULL OR p_category NOT IN ('booking', 'payment', 'vendor', 'withdrawal', 'affiliate', 'general') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'support_handoff_invalid';
  END IF;

  SELECT * INTO v_handoff
    FROM public.support_handoff_tokens
   WHERE token_hash = p_handoff_token_hash
   FOR UPDATE;
  IF NOT FOUND OR v_handoff.owner_id <> p_owner_id OR v_handoff.content_hash <> p_content_hash
     OR v_handoff.source_user_message_id IS DISTINCT FROM p_source_message_id THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'support_handoff_invalid';
  END IF;
  IF p_source_message_id IS NOT NULL THEN
    SELECT body INTO v_source_message_body
      FROM public.chatbot_messages
     WHERE id = p_source_message_id
       AND session_id = v_handoff.source_session_id
       AND role = 'user';
    IF NOT FOUND
       OR v_handoff.source_message_hash IS DISTINCT FROM encode(extensions.digest(v_source_message_body, 'sha256'), 'hex')
       OR v_handoff.source_message_snapshot IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'support_handoff_invalid';
    END IF;
    v_source_message_snapshot := v_handoff.source_message_snapshot;
  ELSIF v_handoff.source_message_hash IS NOT NULL OR v_handoff.source_message_snapshot IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'support_handoff_invalid';
  END IF;

  IF v_handoff.consumed_at IS NOT NULL THEN
    SELECT * INTO v_ticket
      FROM public.support_tickets
     WHERE id = v_handoff.ticket_id AND user_id = p_owner_id;
    IF FOUND AND v_ticket.operation_id = p_operation_id
       AND v_ticket.operation_payload_hash = p_operation_payload_hash
       AND v_ticket.subject = p_subject AND v_ticket.body = p_body
       AND v_ticket.handoff_source_message_id IS NOT DISTINCT FROM p_source_message_id
       AND v_ticket.handoff_source_message IS NOT DISTINCT FROM v_source_message_snapshot
       AND v_ticket.handoff_source_message_sanitized = (v_source_message_snapshot IS NOT NULL) THEN
      RETURN QUERY SELECT v_ticket.id, v_ticket.category::text, false;
      RETURN;
    END IF;
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'support_handoff_consumed';
  END IF;
  IF v_handoff.expires_at <= now() THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'support_handoff_expired';
  END IF;

  SELECT * INTO v_ticket
    FROM public.support_tickets
   WHERE user_id = p_owner_id AND operation_id = p_operation_id
   FOR UPDATE;
  IF FOUND THEN
    IF v_ticket.operation_payload_hash <> p_operation_payload_hash
       OR v_ticket.subject <> p_subject OR v_ticket.body <> p_body
       OR v_ticket.handoff_source_message_id IS DISTINCT FROM p_source_message_id
       OR v_ticket.handoff_source_message IS DISTINCT FROM v_source_message_snapshot
       OR v_ticket.handoff_source_message_sanitized IS DISTINCT FROM (v_source_message_snapshot IS NOT NULL) THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'support_ticket_operation_conflict';
    END IF;
    UPDATE public.support_tickets
       SET handoff_consented_at = coalesce(handoff_consented_at, now()),
           handoff_content_hash = coalesce(handoff_content_hash, p_content_hash),
           handoff_source_message_id = coalesce(handoff_source_message_id, p_source_message_id),
           handoff_source_message = coalesce(handoff_source_message, v_source_message_snapshot),
           handoff_source_message_sanitized = (v_source_message_snapshot IS NOT NULL)
     WHERE id = v_ticket.id;
    UPDATE public.support_handoff_tokens
       SET consented_at = now(),
           consented_content_hash = p_content_hash,
           consumed_at = now(),
           ticket_id = v_ticket.id,
           source_message_hash = v_handoff.source_message_hash
     WHERE token_hash = p_handoff_token_hash;
    RETURN QUERY SELECT v_ticket.id, v_ticket.category::text, false;
    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.support_tickets (
      user_id, session_id, withdrawal_id, subject, body, category,
      classification_method, status, operation_id, operation_payload_hash,
      handoff_consented_at, handoff_content_hash, handoff_source_message_id,
      handoff_source_message, handoff_source_message_sanitized
    ) VALUES (
      p_owner_id, NULL, NULL, p_subject, p_body, p_category,
      'keyword', 'open', p_operation_id, p_operation_payload_hash,
      now(), p_content_hash, p_source_message_id,
      v_source_message_snapshot, (v_source_message_snapshot IS NOT NULL)
    ) RETURNING * INTO v_ticket;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_ticket
      FROM public.support_tickets
     WHERE user_id = p_owner_id AND operation_id = p_operation_id
     FOR UPDATE;
    IF NOT FOUND OR v_ticket.operation_payload_hash <> p_operation_payload_hash
       OR v_ticket.subject <> p_subject OR v_ticket.body <> p_body
       OR v_ticket.handoff_source_message_id IS DISTINCT FROM p_source_message_id
       OR v_ticket.handoff_source_message IS DISTINCT FROM v_source_message_snapshot
       OR v_ticket.handoff_source_message_sanitized IS DISTINCT FROM (v_source_message_snapshot IS NOT NULL) THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'support_ticket_operation_conflict';
    END IF;
    UPDATE public.support_tickets
       SET handoff_consented_at = coalesce(handoff_consented_at, now()),
           handoff_content_hash = coalesce(handoff_content_hash, p_content_hash),
           handoff_source_message_id = coalesce(handoff_source_message_id, p_source_message_id),
           handoff_source_message = coalesce(handoff_source_message, v_source_message_snapshot),
           handoff_source_message_sanitized = (v_source_message_snapshot IS NOT NULL)
     WHERE id = v_ticket.id;
    UPDATE public.support_handoff_tokens
       SET consented_at = now(),
           consented_content_hash = p_content_hash,
           consumed_at = now(),
           ticket_id = v_ticket.id,
           source_message_hash = v_handoff.source_message_hash
     WHERE token_hash = p_handoff_token_hash;
    RETURN QUERY SELECT v_ticket.id, v_ticket.category::text, false;
    RETURN;
  END;

  UPDATE public.support_handoff_tokens
     SET consented_at = now(),
         consented_content_hash = p_content_hash,
         consumed_at = now(),
         ticket_id = v_ticket.id,
         source_message_hash = v_handoff.source_message_hash
   WHERE token_hash = p_handoff_token_hash;
  RETURN QUERY SELECT v_ticket.id, v_ticket.category::text, true;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_support_ticket_from_handoff(uuid, uuid, text, text, text, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_support_ticket_from_handoff(uuid, uuid, text, text, text, uuid, text, text, text) TO service_role;
