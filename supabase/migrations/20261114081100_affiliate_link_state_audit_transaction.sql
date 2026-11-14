-- Keep affiliate link state and its audit event in one transaction.
CREATE OR REPLACE FUNCTION public.admin_set_affiliate_link_state(
  p_link_id uuid,
  p_actor_id uuid,
  p_is_active boolean,
  p_note text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_link public.affiliate_links%ROWTYPE;
BEGIN
  SELECT * INTO v_link
  FROM public.affiliate_links
  WHERE affiliate_links.id = p_link_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'affiliate_link_missing'; END IF;
  IF v_link.is_active IS NOT DISTINCT FROM p_is_active THEN RETURN; END IF;

  UPDATE public.affiliate_links
  SET is_active = p_is_active
  WHERE affiliate_links.id = p_link_id;

  INSERT INTO public.audit_logs (
    actor_id, action, entity_type, entity_id, before_data, after_data, note
  ) VALUES (
    p_actor_id,
    CASE WHEN p_is_active THEN 'affiliate.link.reenabled' ELSE 'affiliate.link.disabled' END,
    'affiliate_links', p_link_id,
    jsonb_build_object('is_active', v_link.is_active),
    jsonb_build_object('is_active', p_is_active),
    COALESCE(p_note, CASE WHEN p_is_active THEN 'admin re-enabled link ' ELSE 'auto-disabled link ' END || p_link_id::text)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_affiliate_link_state(uuid, uuid, boolean, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_affiliate_link_state(uuid, uuid, boolean, text)
  TO service_role;
