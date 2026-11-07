-- Keep ticket versions current for every writer and serialize administrative
-- status/category edits with their resolution notifications.
CREATE OR REPLACE FUNCTION app_private.touch_support_ticket_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $function$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_support_tickets_updated_at ON public.support_tickets;
CREATE TRIGGER trg_support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION app_private.touch_support_ticket_updated_at();

CREATE OR REPLACE FUNCTION app_private.admin_update_support_ticket(
  p_ticket_id uuid,
  p_expected_updated_at timestamptz,
  p_status text,
  p_category text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_ticket public.support_tickets%ROWTYPE;
  v_status text;
  v_category text;
  v_previous_status text;
  v_changed boolean;
  v_actor_id uuid := auth.uid();
BEGIN
  IF v_actor_id IS NULL OR NOT app_private.is_super_admin(v_actor_id) THEN
    RAISE EXCEPTION 'support_ticket_permission_required';
  END IF;
  IF p_ticket_id IS NULL OR p_expected_updated_at IS NULL
     OR (p_status IS NULL AND p_category IS NULL)
     OR (p_status IS NOT NULL AND p_status NOT IN ('open', 'in_progress', 'resolved'))
     OR (p_category IS NOT NULL AND p_category NOT IN ('booking', 'payment', 'vendor', 'withdrawal', 'affiliate', 'general')) THEN
    RAISE EXCEPTION 'support_ticket_invalid_update';
  END IF;

  SELECT * INTO v_ticket
    FROM public.support_tickets
   WHERE id = p_ticket_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'support_ticket_not_found'; END IF;
  IF v_ticket.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'support_ticket_stale';
  END IF;

  v_status := COALESCE(p_status, v_ticket.status);
  v_category := COALESCE(p_category, v_ticket.category);
  v_previous_status := v_ticket.status;
  v_changed := v_status IS DISTINCT FROM v_ticket.status
    OR v_category IS DISTINCT FROM v_ticket.category
    OR (p_category IS NOT NULL AND v_ticket.classification_method IS DISTINCT FROM 'manual');

  IF NOT v_changed THEN
    RETURN jsonb_build_object('id', v_ticket.id, 'status', v_ticket.status, 'category', v_ticket.category, 'changed', false);
  END IF;

  UPDATE public.support_tickets
     SET status = v_status,
         resolved_at = CASE
           WHEN v_status = 'resolved' AND v_ticket.status IS DISTINCT FROM 'resolved' THEN now()
           WHEN v_status <> 'resolved' THEN NULL
           ELSE v_ticket.resolved_at
         END,
         category = v_category,
         classification_method = CASE WHEN p_category IS NOT NULL THEN 'manual' ELSE v_ticket.classification_method END,
         updated_at = now()
   WHERE id = p_ticket_id
   RETURNING * INTO v_ticket;

  IF p_status = 'resolved' AND v_previous_status IS DISTINCT FROM 'resolved'
     AND v_ticket.status = 'resolved'
     AND v_ticket.user_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.ticket_mutes AS mute
        WHERE mute.ticket_id = v_ticket.id AND mute.user_id = v_ticket.user_id
     ) THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (
      v_ticket.user_id,
      'support_ticket_resolved',
      'Your support ticket was resolved',
      v_ticket.subject,
      '/customer/support/' || v_ticket.id::text
    );
  END IF;

  RETURN jsonb_build_object('id', v_ticket.id, 'status', v_ticket.status, 'category', v_ticket.category, 'changed', true);
END;
$function$;

REVOKE ALL ON FUNCTION app_private.admin_update_support_ticket(uuid, timestamptz, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.admin_update_support_ticket(uuid, timestamptz, text, text) TO authenticated;

-- PostgREST exposes the public schema. The wrapper is callable by
-- authenticated admins while auth.uid() remains the only actor source.
CREATE OR REPLACE FUNCTION public.admin_update_support_ticket(
  p_ticket_id uuid,
  p_expected_updated_at timestamptz,
  p_status text,
  p_category text
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
  SELECT app_private.admin_update_support_ticket(
    p_ticket_id, p_expected_updated_at, p_status, p_category
  );
$function$;

REVOKE ALL ON FUNCTION public.admin_update_support_ticket(uuid, timestamptz, text, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_support_ticket(uuid, timestamptz, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
