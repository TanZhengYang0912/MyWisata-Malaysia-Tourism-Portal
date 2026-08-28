-- Serialize Wallet Approver role governance so two concurrent revokes cannot
-- both pass the last-active-approver check.

CREATE OR REPLACE FUNCTION public.manage_wallet_approver(
  p_target_user_id UUID,
  p_action TEXT,
  p_reason_category TEXT,
  p_note TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_approver_role_id INTEGER;
  v_super_admin_role_id INTEGER;
  v_target public.users%ROWTYPE;
  v_existing_id UUID;
  v_active_approver_count INTEGER;
  v_changed BOOLEAN := false;
  v_granted BOOLEAN;
BEGIN
  IF v_actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'super_admin_required'; END IF;
  IF p_target_user_id = v_actor_id THEN RAISE EXCEPTION 'self_role_change'; END IF;
  IF p_action NOT IN ('grant', 'revoke') THEN RAISE EXCEPTION 'invalid_action'; END IF;
  IF p_reason_category NOT IN ('role_granted', 'role_revoked', 'coverage_change', 'other') THEN
    RAISE EXCEPTION 'invalid_reason_category';
  END IF;
  IF length(btrim(COALESCE(p_note, ''))) < 10 OR length(btrim(p_note)) > 500 THEN
    RAISE EXCEPTION 'invalid_reason';
  END IF;

  -- One transaction-wide governance lock covers different target rows too.
  PERFORM pg_advisory_xact_lock(hashtext('wallet_approver_roles'));

  SELECT id INTO v_approver_role_id FROM public.roles WHERE name = 'approver';
  SELECT id INTO v_super_admin_role_id FROM public.roles WHERE name = 'super_admin';
  IF v_approver_role_id IS NULL OR v_super_admin_role_id IS NULL THEN
    RAISE EXCEPTION 'roles_not_configured';
  END IF;

  SELECT * INTO v_target
    FROM public.users
   WHERE id = p_target_user_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'target_not_found'; END IF;
  IF p_action = 'grant' AND v_target.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'target_not_active';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = p_target_user_id
       AND role_id = v_super_admin_role_id
  ) THEN
    RAISE EXCEPTION 'privileged_target';
  END IF;

  SELECT id INTO v_existing_id
    FROM public.user_roles
   WHERE user_id = p_target_user_id
     AND role_id = v_approver_role_id
     AND vendor_id IS NULL
     AND outlet_id IS NULL
   LIMIT 1;

  IF p_action = 'grant' AND v_existing_id IS NULL THEN
    INSERT INTO public.user_roles(user_id, role_id, vendor_id, outlet_id)
    VALUES (p_target_user_id, v_approver_role_id, NULL, NULL);
    v_changed := true;
  ELSIF p_action = 'revoke' AND v_existing_id IS NOT NULL THEN
    SELECT COUNT(DISTINCT ur.user_id)
      INTO v_active_approver_count
      FROM public.user_roles ur
      JOIN public.users u ON u.id = ur.user_id
     WHERE ur.role_id = v_approver_role_id
       AND ur.vendor_id IS NULL
       AND ur.outlet_id IS NULL
       AND u.status = 'active';

    IF v_target.status = 'active' AND v_active_approver_count <= 1 THEN
      RAISE EXCEPTION 'last_approver';
    END IF;

    DELETE FROM public.user_roles
     WHERE user_id = p_target_user_id
       AND role_id = v_approver_role_id
       AND vendor_id IS NULL
       AND outlet_id IS NULL;
    v_changed := true;
  END IF;

  v_granted := p_action = 'grant';
  IF v_changed THEN
    INSERT INTO public.audit_logs(
      actor_id, action, entity_type, entity_id, before_data, after_data, note
    ) VALUES (
      v_actor_id,
      'wallet.approver_' || CASE WHEN v_granted THEN 'granted' ELSE 'revoked' END,
      'user',
      p_target_user_id,
      jsonb_build_object('approver', NOT v_granted),
      jsonb_build_object('approver', v_granted, 'reason_category', p_reason_category),
      btrim(p_note)
    );

    INSERT INTO public.notifications(
      user_id, type, title, body, link, category, metadata
    ) VALUES (
      p_target_user_id,
      CASE WHEN v_granted THEN 'wallet_approver_granted' ELSE 'wallet_approver_revoked' END,
      CASE WHEN v_granted THEN 'Wallet Approver access granted' ELSE 'Wallet Approver access revoked' END,
      CASE WHEN v_granted
        THEN 'You can now review wallet withdrawals.'
        ELSE 'Your Wallet Approver access has been revoked.'
      END,
      '/admin/withdrawals',
      'wallet',
      jsonb_build_object('actor_id', v_actor_id, 'reason_category', p_reason_category)
    );
  END IF;

  RETURN jsonb_build_object(
    'userId', p_target_user_id,
    'approver', v_granted,
    'action', p_action,
    'changed', v_changed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.manage_wallet_approver(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_wallet_approver(UUID, TEXT, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
