-- Commit a manual fraud decision, link state change, and audit record atomically.
CREATE OR REPLACE FUNCTION public.admin_review_affiliate_fraud_flag(
  p_flag_id uuid,
  p_actor_id uuid,
  p_action text
) RETURNS TABLE(id uuid, status character varying)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_flag public.affiliate_fraud_flags%ROWTYPE;
  v_link public.affiliate_links%ROWTYPE;
BEGIN
  IF p_action NOT IN ('dismiss', 'confirm') THEN
    RAISE EXCEPTION 'invalid_fraud_review_action' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_flag
  FROM public.affiliate_fraud_flags
  WHERE affiliate_fraud_flags.id = p_flag_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  IF p_action = 'confirm' AND v_flag.link_id IS NOT NULL THEN
    SELECT * INTO v_link
    FROM public.affiliate_links
    WHERE affiliate_links.id = v_flag.link_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'affiliate_link_missing';
    END IF;
  END IF;

  UPDATE public.affiliate_fraud_flags
  SET status = CASE WHEN p_action = 'dismiss' THEN 'dismissed' ELSE 'reviewed' END,
      reviewed_by = p_actor_id,
      reviewed_at = now()
  WHERE affiliate_fraud_flags.id = p_flag_id
  RETURNING affiliate_fraud_flags.id, affiliate_fraud_flags.status
  INTO id, status;

  IF p_action = 'confirm' AND v_flag.link_id IS NOT NULL AND FOUND AND v_link.is_active THEN
    UPDATE public.affiliate_links
    SET is_active = false
    WHERE affiliate_links.id = v_flag.link_id;

    INSERT INTO public.audit_logs (
      actor_id, action, entity_type, entity_id, before_data, after_data, note
    ) VALUES (
      p_actor_id, 'affiliate.link.disabled', 'affiliate_links', v_flag.link_id,
      '{"is_active":true}'::jsonb, '{"is_active":false}'::jsonb,
      'admin confirmed fraud flag ' || p_flag_id::text
    );
  END IF;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_review_affiliate_fraud_flag(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_affiliate_fraud_flag(uuid, uuid, text)
  TO service_role;
