-- Permit only the hardened admin RPC to update server-managed account lifecycle fields.
-- The service-role client has no auth.uid(), so the trigger requires these
-- transaction-local flags rather than an auth role check.

CREATE OR REPLACE FUNCTION public.admin_manage_user(
  p_actor_id UUID,
  p_user_id UUID,
  p_action TEXT,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user users%ROWTYPE;
  v_before JSONB;
  v_after JSONB;
  v_new_tier TEXT;
  v_title TEXT;
  v_body TEXT;
  v_audit_action TEXT := 'user_management.' || COALESCE(p_action, 'unknown');
BEGIN
  IF p_actor_id IS NULL OR NOT is_super_admin(p_actor_id) THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;
  IF p_user_id IS NULL OR p_user_id = p_actor_id THEN
    RAISE EXCEPTION 'self_target_forbidden';
  END IF;
  IF p_action NOT IN ('clear_bio_restriction', 'suspend', 'unsuspend', 'soft_delete', 'restore') THEN
    RAISE EXCEPTION 'invalid_user_management_action';
  END IF;
  IF char_length(BTRIM(COALESCE(p_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'reason_too_short';
  END IF;

  SELECT * INTO v_user FROM users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'user_not_found'; END IF;
  IF EXISTS (
    SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = p_user_id AND r.name IN ('super_admin', 'approver', 'admin')
  ) THEN
    RAISE EXCEPTION 'privileged_target';
  END IF;

  v_before := jsonb_build_object(
    'status', v_user.status,
    'bioViolationCount', v_user.bio_violation_count,
    'bioCooldownUntil', v_user.bio_cooldown_until,
    'tier', v_user.tier,
    'kycStatus', v_user.kyc_status
  );

  IF p_action = 'clear_bio_restriction' THEN
    UPDATE users SET bio_violation_count = 0, bio_cooldown_until = NULL, updated_at = NOW() WHERE id = p_user_id;
    v_title := 'Bio restriction cleared';
    v_body := 'An administrator cleared your Bio restriction. Reason: ' || BTRIM(p_reason);
  ELSIF p_action = 'suspend' THEN
    IF v_user.status <> 'active' THEN RAISE EXCEPTION 'user_must_be_active'; END IF;
    PERFORM set_config('app.allow_account_status_write', 'on', true);
    UPDATE users SET status = 'suspended', updated_at = NOW() WHERE id = p_user_id;
    v_title := 'Account suspended';
    v_body := 'Your account has been suspended. Reason: ' || BTRIM(p_reason);
  ELSIF p_action = 'unsuspend' THEN
    IF v_user.status <> 'suspended' THEN RAISE EXCEPTION 'user_must_be_suspended'; END IF;
    PERFORM set_config('app.allow_account_status_write', 'on', true);
    UPDATE users SET status = 'active', updated_at = NOW() WHERE id = p_user_id;
    v_title := 'Account reinstated';
    v_body := 'Your account has been reinstated. Reason: ' || BTRIM(p_reason);
  ELSIF p_action = 'soft_delete' THEN
    IF v_user.status <> 'active' THEN RAISE EXCEPTION 'user_must_be_active'; END IF;
    IF EXISTS (SELECT 1 FROM withdrawal_requests WHERE user_id = p_user_id AND status IN ('pending', 'processing')) THEN
      RAISE EXCEPTION 'pending_withdrawal_blocks_delete';
    END IF;
    PERFORM set_config('app.allow_account_status_write', 'on', true);
    UPDATE users SET status = 'deleted', closed_at = NOW(), updated_at = NOW() WHERE id = p_user_id;
    v_title := 'Account closed';
    v_body := 'Your account was closed by an administrator. You can restore it when you sign in. Reason: ' || BTRIM(p_reason);
  ELSE
    IF v_user.status <> 'deleted' THEN RAISE EXCEPTION 'user_must_be_deleted'; END IF;
    v_new_tier := CASE WHEN v_user.email_verified_at IS NOT NULL THEN 'email_verified' ELSE 'email_unverified' END;
    PERFORM set_config('app.allow_account_status_write', 'on', true);
    PERFORM set_config('app.allow_verification_write', 'on', true);
    UPDATE users
       SET status = 'active', closed_at = NULL, tier = v_new_tier,
           kyc_status = 'unverified', phone_verified_at = NULL,
           profile_completed_at = NULL, bio_violation_count = 0,
           bio_cooldown_until = NULL, updated_at = NOW()
     WHERE id = p_user_id;
    v_title := 'Account restored';
    v_body := 'Your account was restored and verification progress must be completed again. Reason: ' || BTRIM(p_reason);
  END IF;

  SELECT * INTO v_user FROM users WHERE id = p_user_id;
  v_after := jsonb_build_object(
    'status', v_user.status,
    'bioViolationCount', v_user.bio_violation_count,
    'bioCooldownUntil', v_user.bio_cooldown_until,
    'tier', v_user.tier,
    'kycStatus', v_user.kyc_status
  );

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, before_data, after_data, note)
  VALUES (p_actor_id, v_audit_action, 'user', p_user_id, v_before, v_after, BTRIM(p_reason));

  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (p_user_id, v_audit_action, v_title, v_body, '/customer/profile');

  RETURN jsonb_build_object(
    'action', p_action,
    'userId', p_user_id,
    'email', v_user.email,
    'name', COALESCE(v_user.full_name, v_user.display_name, v_user.email),
    'status', v_user.status,
    'tier', v_user.tier,
    'kycStatus', v_user.kyc_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_manage_user(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_manage_user(UUID, UUID, TEXT, TEXT) TO service_role;
