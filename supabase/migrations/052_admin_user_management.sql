-- Super-admin-only user management. This deliberately does not change the
-- existing approver permissions used by withdrawals and other admin modules.

CREATE OR REPLACE FUNCTION public.admin_list_users(
  p_search TEXT DEFAULT NULL,
  p_role TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_kyc_status TEXT DEFAULT NULL,
  p_bio_locked BOOLEAN DEFAULT NULL,
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 15
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_page INTEGER := GREATEST(COALESCE(p_page, 1), 1);
  v_page_size INTEGER := CASE WHEN p_page_size IN (15, 25, 50, 100) THEN p_page_size ELSE 15 END;
  v_items JSONB;
  v_total BIGINT;
BEGIN
  IF NOT is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'super_admin_required'; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', q.id,
    'email', q.email,
    'fullName', q.full_name,
    'displayName', q.display_name,
    'avatarUrl', q.avatar_url,
    'role', q.primary_role,
    'roles', q.roles,
    'status', q.status,
    'emailVerified', q.email_verified_at IS NOT NULL,
    'phoneVerified', q.phone_verified_at IS NOT NULL,
    'profileComplete', q.profile_completed_at IS NOT NULL,
    'kycStatus', q.kyc_status,
    'bioViolationCount', q.bio_violation_count,
    'bioCooldownUntil', q.bio_cooldown_until,
    'createdAt', q.created_at
  ) ORDER BY q.created_at DESC), '[]'::JSONB), COALESCE(MAX(q.total_count), 0)
  INTO v_items, v_total
  FROM (
    SELECT
      u.id, u.email, u.full_name, u.display_name, u.avatar_url, u.status,
      u.kyc_status, u.email_verified_at, u.phone_verified_at,
      u.profile_completed_at, u.bio_violation_count, u.bio_cooldown_until,
      u.created_at,
      COALESCE((
        SELECT array_agg(r.name ORDER BY r.name)
        FROM user_roles ur JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = u.id
      ), ARRAY[]::TEXT[]) AS roles,
      COALESCE((
        SELECT MIN(r.name)
        FROM user_roles ur JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = u.id
          AND r.name IN ('customer', 'vendor_owner', 'outlet_manager')
      ), 'customer') AS primary_role,
      COUNT(*) OVER () AS total_count
    FROM users u
    WHERE NOT EXISTS (
      SELECT 1 FROM user_roles pur JOIN roles pr ON pr.id = pur.role_id
      WHERE pur.user_id = u.id AND pr.name IN ('super_admin', 'approver', 'admin')
    )
      AND (NULLIF(BTRIM(p_search), '') IS NULL OR (
        u.email ILIKE '%' || BTRIM(p_search) || '%'
        OR COALESCE(u.full_name, '') ILIKE '%' || BTRIM(p_search) || '%'
        OR COALESCE(u.display_name, '') ILIKE '%' || BTRIM(p_search) || '%'
        OR u.id::TEXT ILIKE '%' || BTRIM(p_search) || '%'
      ))
      AND (p_role IS NULL OR EXISTS (
        SELECT 1 FROM user_roles rur JOIN roles rr ON rr.id = rur.role_id
        WHERE rur.user_id = u.id AND rr.name = p_role
      ))
      AND (p_status IS NULL OR u.status = p_status)
      AND (p_kyc_status IS NULL OR u.kyc_status = p_kyc_status)
      AND (p_bio_locked IS NULL OR (
        (u.bio_cooldown_until > NOW() OR u.bio_violation_count >= 5) = p_bio_locked
      ))
    ORDER BY u.created_at DESC
    LIMIT v_page_size OFFSET (v_page - 1) * v_page_size
  ) q;

  RETURN jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'page', v_page,
    'pageSize', v_page_size,
    'totalPages', CASE WHEN v_total = 0 THEN 0 ELSE CEIL(v_total::NUMERIC / v_page_size)::INTEGER END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_user(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'super_admin_required'; END IF;
  IF EXISTS (
    SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = p_user_id AND r.name IN ('super_admin', 'approver', 'admin')
  ) THEN RAISE EXCEPTION 'privileged_target'; END IF;

  SELECT jsonb_build_object(
    'id', u.id,
    'email', u.email,
    'fullName', u.full_name,
    'displayName', u.display_name,
    'avatarUrl', u.avatar_url,
    'phone', u.phone,
    'city', u.city,
    'country', u.country,
    'bio', u.bio,
    'role', COALESCE((SELECT MIN(r.name) FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id AND r.name IN ('customer', 'vendor_owner', 'outlet_manager')), 'customer'),
    'roles', COALESCE((SELECT jsonb_agg(r.name ORDER BY r.name) FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id), '[]'::JSONB),
    'status', u.status,
    'emailVerified', u.email_verified_at IS NOT NULL,
    'phoneVerified', u.phone_verified_at IS NOT NULL,
    'profileComplete', u.profile_completed_at IS NOT NULL,
    'kycStatus', u.kyc_status,
    'bioViolationCount', u.bio_violation_count,
    'bioCooldownUntil', u.bio_cooldown_until,
    'createdAt', u.created_at,
    'pendingWithdrawalCount', (SELECT COUNT(*) FROM withdrawal_requests w WHERE w.user_id = u.id AND w.status IN ('pending', 'processing')),
    'auditHistory', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'action', h.action,
        'note', h.note,
        'createdAt', h.created_at,
        'actorId', h.actor_id
      ) ORDER BY h.created_at DESC)
      FROM (
        SELECT action, note, created_at, actor_id
        FROM audit_logs
        WHERE entity_type = 'user' AND entity_id = u.id AND action LIKE 'user_management.%'
        ORDER BY created_at DESC
        LIMIT 10
      ) h
    ), '[]'::JSONB)
  ) INTO v_result
  FROM users u
  WHERE u.id = p_user_id;

  IF v_result IS NULL THEN RAISE EXCEPTION 'user_not_found'; END IF;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_manage_user(
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
  v_new_status TEXT;
  v_new_tier TEXT;
  v_title TEXT;
  v_body TEXT;
  v_audit_action TEXT := 'user_management.' || COALESCE(p_action, 'unknown');
BEGIN
  IF NOT is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'super_admin_required'; END IF;
  IF p_user_id IS NULL OR p_user_id = auth.uid() THEN RAISE EXCEPTION 'self_target_forbidden'; END IF;
  IF p_action NOT IN ('clear_bio_restriction', 'suspend', 'unsuspend', 'soft_delete', 'restore') THEN
    RAISE EXCEPTION 'invalid_user_management_action';
  END IF;
  IF char_length(BTRIM(COALESCE(p_reason, ''))) < 10 THEN RAISE EXCEPTION 'reason_too_short'; END IF;

  SELECT * INTO v_user FROM users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'user_not_found'; END IF;
  IF EXISTS (
    SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = p_user_id AND r.name IN ('super_admin', 'approver', 'admin')
  ) THEN RAISE EXCEPTION 'privileged_target'; END IF;

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
    UPDATE users SET status = 'suspended', updated_at = NOW() WHERE id = p_user_id;
    v_title := 'Account suspended';
    v_body := 'Your account has been suspended. Reason: ' || BTRIM(p_reason);
  ELSIF p_action = 'unsuspend' THEN
    IF v_user.status <> 'suspended' THEN RAISE EXCEPTION 'user_must_be_suspended'; END IF;
    UPDATE users SET status = 'active', updated_at = NOW() WHERE id = p_user_id;
    v_title := 'Account reinstated';
    v_body := 'Your account has been reinstated. Reason: ' || BTRIM(p_reason);
  ELSIF p_action = 'soft_delete' THEN
    IF v_user.status <> 'active' THEN RAISE EXCEPTION 'user_must_be_active'; END IF;
    IF EXISTS (SELECT 1 FROM withdrawal_requests WHERE user_id = p_user_id AND status IN ('pending', 'processing')) THEN
      RAISE EXCEPTION 'pending_withdrawal_blocks_delete';
    END IF;
    UPDATE users SET status = 'deleted', closed_at = NOW(), updated_at = NOW() WHERE id = p_user_id;
    v_title := 'Account closed';
    v_body := 'Your account was closed by an administrator. You can restore it when you sign in. Reason: ' || BTRIM(p_reason);
  ELSE
    IF v_user.status <> 'deleted' THEN RAISE EXCEPTION 'user_must_be_deleted'; END IF;
    v_new_tier := CASE WHEN v_user.email_verified_at IS NOT NULL THEN 'email_verified' ELSE 'email_unverified' END;
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
  VALUES (auth.uid(), v_audit_action, 'user', p_user_id, v_before, v_after, BTRIM(p_reason));

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

REVOKE ALL ON FUNCTION public.admin_list_users(TEXT, TEXT, TEXT, TEXT, BOOLEAN, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_get_user(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_manage_user(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_users(TEXT, TEXT, TEXT, TEXT, BOOLEAN, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_user(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_manage_user(UUID, TEXT, TEXT) TO authenticated;
