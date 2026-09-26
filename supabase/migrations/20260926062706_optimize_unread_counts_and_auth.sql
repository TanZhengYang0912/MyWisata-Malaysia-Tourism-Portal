-- Narrowly reduce repeated application round trips for capability and unread
-- counts. Caller identity is always taken from auth.uid(); these functions do
-- not accept a caller-controlled subject for the chat/support aggregates.

CREATE OR REPLACE FUNCTION public.resolve_user_capabilities(
  p_user_id UUID,
  p_capability_keys TEXT[]
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_key TEXT;
  v_result JSONB := '{}'::JSONB;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;
  IF v_actor IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'resolver_subject_forbidden';
  END IF;

  FOREACH v_key IN ARRAY COALESCE(p_capability_keys, ARRAY[]::TEXT[]) LOOP
    IF v_key IS NOT NULL AND BTRIM(v_key) <> '' THEN
      v_result := v_result || jsonb_build_object(
        v_key,
        public.resolve_user_capability(p_user_id, v_key)
      );
    END IF;
  END LOOP;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_user_capabilities(UUID, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_user_capabilities(UUID, TEXT[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_chat_unread_count()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_is_super_admin BOOLEAN;
  v_count INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.user_roles AS ur
      JOIN public.roles AS r ON r.id = ur.role_id
     WHERE ur.user_id = v_user_id
       AND r.name = 'super_admin'
  ) INTO v_is_super_admin;

  SELECT COUNT(*)::INTEGER
    INTO v_count
    FROM public.chat_messages AS chat_message
    JOIN public.chat_threads AS chat_thread ON chat_thread.id = chat_message.thread_id
   WHERE chat_message.sender_id <> v_user_id
     AND (
       chat_thread.customer_id = v_user_id
       OR v_is_super_admin
       OR EXISTS (
         SELECT 1
           FROM public.outlets AS outlet
           JOIN public.vendors AS vendor ON vendor.id = outlet.vendor_id
          WHERE outlet.id = chat_thread.outlet_id
            AND vendor.owner_id = v_user_id
       )
       OR EXISTS (
         SELECT 1
           FROM public.outlet_managers AS manager
          WHERE manager.outlet_id = chat_thread.outlet_id
            AND manager.user_id = v_user_id
       )
     )
     AND NOT EXISTS (
       SELECT 1
         FROM public.chat_thread_mutes AS mute
        WHERE mute.thread_id = chat_thread.id
          AND mute.user_id = v_user_id
     )
     AND NOT EXISTS (
       SELECT 1
         FROM public.chat_message_reads AS message_read
        WHERE message_read.message_id = chat_message.id
          AND message_read.user_id = v_user_id
     );

  RETURN COALESCE(v_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.get_chat_unread_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_chat_unread_count() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_support_unread_count()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_is_super_admin BOOLEAN;
  v_count INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.user_roles AS ur
      JOIN public.roles AS r ON r.id = ur.role_id
     WHERE ur.user_id = v_user_id
       AND r.name = 'super_admin'
  ) INTO v_is_super_admin;

  IF v_is_super_admin THEN
    SELECT COUNT(*)::INTEGER
      INTO v_count
      FROM public.support_tickets AS ticket
     WHERE ticket.status NOT IN ('resolved', 'closed')
       AND EXISTS (
         SELECT 1
           FROM public.support_ticket_replies AS reply
          WHERE reply.ticket_id = ticket.id
            AND reply.sender_role = 'customer'
            AND reply.created_at > COALESCE(ticket.admin_last_read_at, '-infinity'::TIMESTAMPTZ)
       );
  ELSE
    SELECT COUNT(*)::INTEGER
      INTO v_count
      FROM public.support_tickets AS ticket
     WHERE ticket.user_id = v_user_id
       AND EXISTS (
         SELECT 1
           FROM public.support_ticket_replies AS reply
          WHERE reply.ticket_id = ticket.id
            AND reply.sender_role = 'admin'
            AND reply.created_at > COALESCE(ticket.customer_last_read_at, '-infinity'::TIMESTAMPTZ)
       );
  END IF;

  RETURN COALESCE(v_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.get_support_unread_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_support_unread_count() TO authenticated;

-- This is the only new table index: production scans show frequent owner
-- filtering on support_tickets and the foreign key currently has no index.
CREATE INDEX IF NOT EXISTS support_tickets_user_id_idx
  ON public.support_tickets (user_id);
