-- Enforce dedicated staff permissions at both the HTTP and database seams.
-- Vendor mutations are available only through the permission-checking RPCs.

DROP POLICY IF EXISTS "demo_allow_all" ON public.vendors;
DROP POLICY IF EXISTS vendors_public_read ON public.vendors;
DROP POLICY IF EXISTS vendors_read_only_access ON public.vendors;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.vendors FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.vendors FROM anon;
GRANT SELECT ON TABLE public.vendors TO anon, authenticated;

CREATE POLICY vendors_read_only_access
  ON public.vendors
  FOR SELECT
  TO anon, authenticated
  USING (
    status = 'approved'
    OR owner_id = auth.uid()
    OR public.has_staff_permission(auth.uid(), 'admin.vendor.manage')
  );

CREATE OR REPLACE FUNCTION public.convert_claimed_vendor_recommendation(
  p_vendor_id UUID,
  p_recommendation_id UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_vendor public.vendors%ROWTYPE;
  v_rec public.vendor_recommendations%ROWTYPE;
  v_conversion_id UUID;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_staff_permission(auth.uid(), 'admin.vendor.manage') THEN
    RAISE EXCEPTION 'vendor_permission_required';
  END IF;

  SELECT * INTO v_vendor FROM public.vendors WHERE id = p_vendor_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'vendor_not_found'; END IF;
  IF v_vendor.status <> 'approved' THEN RAISE EXCEPTION 'vendor_not_approved'; END IF;

  SELECT * INTO v_rec
    FROM public.vendor_recommendations
   WHERE id = p_recommendation_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'recommendation_not_found'; END IF;
  IF v_rec.recommender_id = auth.uid() THEN RAISE EXCEPTION 'self_dealing'; END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.vendor_recommendation_claims
     WHERE recommendation_id = p_recommendation_id
       AND vendor_id = p_vendor_id
  ) THEN
    RAISE EXCEPTION 'claim_link_not_found';
  END IF;

  SELECT id
    INTO v_conversion_id
    FROM public.recommendation_conversions
   WHERE recommendation_id = p_recommendation_id
   ORDER BY converted_at DESC
   LIMIT 1;
  IF v_conversion_id IS NOT NULL THEN RETURN v_conversion_id; END IF;

  IF v_rec.status NOT IN ('claimed', 'onboarding', 'vendor_pending_review') THEN
    RAISE EXCEPTION 'recommendation_not_ready_for_conversion';
  END IF;

  INSERT INTO public.recommendation_conversions (
    recommendation_id,
    converted_vendor_id,
    attribution_ends_at
  ) VALUES (
    p_recommendation_id,
    p_vendor_id,
    NOW() + COALESCE((
      SELECT NULLIF(value, '')::INT
        FROM public.platform_settings
       WHERE key = 'recommendation.attribution_window_days'
    ), 90) * INTERVAL '1 day'
  )
  RETURNING id INTO v_conversion_id;

  UPDATE public.vendor_recommendations
     SET status = 'converted',
         converted_vendor_id = p_vendor_id,
         reviewed_at = NOW(),
         reviewer_id = auth.uid()
   WHERE id = p_recommendation_id;

  PERFORM public.credit_pending_recommendation(
    v_rec.recommender_id,
    5000,
    'bonus',
    v_conversion_id,
    NULL,
    NULL,
    'Recommendation vendor conversion reward'
  );

  RETURN v_conversion_id;
END;
$$;

-- Keep the established claimed-recommendation conversion transaction, but
-- replace its coarse role boundary with the self-bound staff permission.
CREATE OR REPLACE FUNCTION public.admin_approve_claimed_vendor(
  p_vendor_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_vendor public.vendors%ROWTYPE;
  v_claim_recommendation_id UUID;
  v_owner_role_id INTEGER;
  v_conversion_id UUID;
BEGIN
  IF v_actor_id IS NULL OR NOT public.has_staff_permission(v_actor_id, 'admin.vendor.manage') THEN
    RAISE EXCEPTION 'vendor_permission_required';
  END IF;

  SELECT *
    INTO v_vendor
    FROM public.vendors
   WHERE id = p_vendor_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'vendor_not_found';
  END IF;
  IF v_vendor.status NOT IN ('pending', 'rejected') THEN
    RAISE EXCEPTION 'vendor_not_approvable';
  END IF;

  SELECT recommendation_id
    INTO v_claim_recommendation_id
    FROM public.vendor_recommendation_claims
   WHERE vendor_id = p_vendor_id
   FOR UPDATE;

  UPDATE public.vendors
     SET status = 'approved',
         approved_by = v_actor_id,
         approved_at = NOW(),
         rejection_reason = NULL
   WHERE id = p_vendor_id;

  INSERT INTO public.vendor_onboarding_profiles (
    vendor_id, status, review_note, reviewed_by, reviewed_at, updated_at
  ) VALUES (
    p_vendor_id, 'approved', NULL, v_actor_id, NOW(), NOW()
  )
  ON CONFLICT (vendor_id) DO UPDATE SET
    status = EXCLUDED.status,
    review_note = NULL,
    reviewed_by = EXCLUDED.reviewed_by,
    reviewed_at = EXCLUDED.reviewed_at,
    updated_at = EXCLUDED.updated_at;

  SELECT id
    INTO v_owner_role_id
    FROM public.roles
   WHERE name = 'vendor_owner';
  IF v_owner_role_id IS NULL THEN
    RAISE EXCEPTION 'vendor_owner_role_missing';
  END IF;

  INSERT INTO public.user_roles (user_id, role_id, vendor_id, outlet_id)
  SELECT v_vendor.owner_id, v_owner_role_id, p_vendor_id, NULL
  WHERE NOT EXISTS (
    SELECT 1
      FROM public.user_roles
     WHERE user_id = v_vendor.owner_id
       AND role_id = v_owner_role_id
       AND vendor_id = p_vendor_id
       AND outlet_id IS NULL
  );

  IF v_claim_recommendation_id IS NOT NULL THEN
    v_conversion_id := public.convert_claimed_vendor_recommendation(
      p_vendor_id,
      v_claim_recommendation_id
    );
  END IF;

  RETURN jsonb_build_object(
    'vendor_id', p_vendor_id,
    'status', 'approved',
    'converted', v_claim_recommendation_id IS NOT NULL,
    'recommendation_id', v_claim_recommendation_id,
    'conversion_id', v_conversion_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_review_vendor(
  p_vendor_id UUID,
  p_action TEXT,
  p_reason TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_vendor public.vendors%ROWTYPE;
  v_approval JSONB;
BEGIN
  IF v_actor_id IS NULL OR NOT public.has_staff_permission(v_actor_id, 'admin.vendor.manage') THEN
    RAISE EXCEPTION 'vendor_permission_required';
  END IF;
  IF p_action NOT IN ('approve', 'reject', 'request_information') THEN
    RAISE EXCEPTION 'vendor_review_action_invalid';
  END IF;

  SELECT *
    INTO v_vendor
    FROM public.vendors
   WHERE id = p_vendor_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'vendor_not_found';
  END IF;
  IF v_vendor.status NOT IN ('pending', 'rejected') AND p_action <> 'request_information' THEN
    RAISE EXCEPTION 'vendor_invalid_state';
  END IF;

  IF p_action = 'approve' THEN
    v_approval := public.admin_approve_claimed_vendor(p_vendor_id);
    INSERT INTO public.audit_logs (
      actor_id, action, entity_type, entity_id, before_data, after_data, note
    ) VALUES (
      v_actor_id,
      'vendor.approved',
      'vendor',
      p_vendor_id,
      jsonb_build_object('status', v_vendor.status),
      jsonb_build_object(
        'status', 'approved',
        'converted', COALESCE((v_approval->>'converted')::BOOLEAN, FALSE),
        'recommendation_id', v_approval->>'recommendation_id',
        'conversion_id', v_approval->>'conversion_id'
      ),
      NULLIF(LEFT(BTRIM(COALESCE(p_reason, '')), 500), '')
    );
    RETURN v_approval;
  END IF;

  IF p_action = 'request_information' THEN
    INSERT INTO public.vendor_onboarding_profiles (
      vendor_id, status, review_note, reviewed_by, reviewed_at, updated_at
    ) VALUES (
      p_vendor_id, 'needs_information', NULLIF(BTRIM(p_reason), ''), v_actor_id, NOW(), NOW()
    )
    ON CONFLICT (vendor_id) DO UPDATE SET
      status = EXCLUDED.status,
      review_note = EXCLUDED.review_note,
      reviewed_by = EXCLUDED.reviewed_by,
      reviewed_at = EXCLUDED.reviewed_at,
      updated_at = EXCLUDED.updated_at;

    INSERT INTO public.audit_logs (
      actor_id, action, entity_type, entity_id, before_data, after_data, note
    ) VALUES (
      v_actor_id,
      'vendor.information_requested',
      'vendor',
      p_vendor_id,
      jsonb_build_object('vendor_status', v_vendor.status),
      jsonb_build_object('onboarding_status', 'needs_information'),
      NULLIF(LEFT(BTRIM(COALESCE(p_reason, '')), 500), '')
    );

    RETURN jsonb_build_object(
      'vendor_id', p_vendor_id,
      'status', v_vendor.status,
      'onboarding_status', 'needs_information'
    );
  END IF;

  UPDATE public.vendors
     SET status = 'rejected',
         rejection_reason = NULLIF(BTRIM(p_reason), '')
   WHERE id = p_vendor_id;

  INSERT INTO public.vendor_onboarding_profiles (
    vendor_id, status, review_note, reviewed_by, reviewed_at, updated_at
  ) VALUES (
    p_vendor_id, 'rejected', NULLIF(BTRIM(p_reason), ''), v_actor_id, NOW(), NOW()
  )
  ON CONFLICT (vendor_id) DO UPDATE SET
    status = EXCLUDED.status,
    review_note = EXCLUDED.review_note,
    reviewed_by = EXCLUDED.reviewed_by,
    reviewed_at = EXCLUDED.reviewed_at,
    updated_at = EXCLUDED.updated_at;

  INSERT INTO public.audit_logs (
    actor_id, action, entity_type, entity_id, before_data, after_data, note
  ) VALUES (
    v_actor_id,
    'vendor.rejected',
    'vendor',
    p_vendor_id,
    jsonb_build_object('status', v_vendor.status),
    jsonb_build_object('status', 'rejected'),
    NULLIF(LEFT(BTRIM(COALESCE(p_reason, '')), 500), '')
  );

  RETURN jsonb_build_object(
    'vendor_id', p_vendor_id,
    'status', 'rejected',
    'converted', FALSE,
    'recommendation_id', NULL,
    'conversion_id', NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_set_vendor_suspension(
  p_vendor_id UUID,
  p_action TEXT,
  p_reason TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_vendor public.vendors%ROWTYPE;
  v_new_status TEXT;
BEGIN
  IF v_actor_id IS NULL OR NOT public.has_staff_permission(v_actor_id, 'admin.vendor.manage') THEN
    RAISE EXCEPTION 'vendor_permission_required';
  END IF;
  IF p_action NOT IN ('suspend', 'unsuspend') THEN
    RAISE EXCEPTION 'vendor_suspension_action_invalid';
  END IF;

  SELECT *
    INTO v_vendor
    FROM public.vendors
   WHERE id = p_vendor_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'vendor_not_found';
  END IF;

  IF (p_action = 'suspend' AND v_vendor.status <> 'approved')
     OR (p_action = 'unsuspend' AND v_vendor.status <> 'suspended') THEN
    RAISE EXCEPTION 'vendor_invalid_state';
  END IF;

  v_new_status := CASE WHEN p_action = 'suspend' THEN 'suspended' ELSE 'approved' END;
  UPDATE public.vendors
     SET status = v_new_status,
         updated_at = NOW()
   WHERE id = p_vendor_id;

  INSERT INTO public.audit_logs (
    actor_id, action, entity_type, entity_id, before_data, after_data, note
  ) VALUES (
    v_actor_id,
    CASE WHEN p_action = 'suspend' THEN 'vendor.suspended' ELSE 'vendor.unsuspended' END,
    'vendor',
    p_vendor_id,
    jsonb_build_object('status', v_vendor.status),
    jsonb_build_object('status', v_new_status),
    NULLIF(LEFT(BTRIM(COALESCE(p_reason, '')), 500), '')
  );

  RETURN jsonb_build_object(
    'vendor_id', p_vendor_id,
    'previous_status', v_vendor.status,
    'status', v_new_status,
    'reason_recorded', NULLIF(BTRIM(p_reason), '') IS NOT NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_review_kyc(
  p_submission_id UUID,
  p_user_id UUID,
  p_action TEXT,
  p_reason_code TEXT DEFAULT NULL,
  p_reason_detail TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_submission public.kyc_submissions%ROWTYPE;
  v_status TEXT;
  v_actor_role TEXT;
  v_customer_message TEXT;
  v_reviewed_at TIMESTAMPTZ := NOW();
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_staff_permission(auth.uid(), 'admin.kyc.review') THEN
    RAISE EXCEPTION 'kyc_permission_required';
  END IF;
  IF p_action IS NULL OR p_action NOT IN ('approve', 'reject', 'request_info') THEN
    RAISE EXCEPTION 'invalid_action';
  END IF;
  IF auth.uid() = p_user_id THEN
    RAISE EXCEPTION 'self_dealing';
  END IF;
  IF p_action = 'approve' AND (p_reason_code IS NOT NULL OR p_reason_detail IS NOT NULL) THEN
    RAISE EXCEPTION 'reason_not_allowed';
  END IF;
  IF p_action <> 'approve' AND (
    p_reason_code IS NULL
    OR p_reason_code NOT IN (
      'document_unreadable',
      'document_incomplete',
      'document_mismatch',
      'document_expired',
      'document_suspected_tampering',
      'other'
    )
  ) THEN
    RAISE EXCEPTION 'invalid_reason_code';
  END IF;
  IF p_action = 'request_info' AND p_reason_code = 'document_suspected_tampering' THEN
    RAISE EXCEPTION 'reason_code_not_allowed';
  END IF;
  IF p_reason_code <> 'other' AND p_reason_detail IS NOT NULL THEN
    RAISE EXCEPTION 'reason_detail_not_allowed';
  END IF;
  IF p_reason_code = 'other'
     AND char_length(BTRIM(COALESCE(p_reason_detail, ''))) < 10 THEN
    RAISE EXCEPTION 'reason_detail_too_short';
  END IF;

  SELECT *
    INTO v_submission
    FROM public.kyc_submissions
   WHERE id = p_submission_id
     AND user_id = p_user_id
     AND status = 'pending'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'kyc_not_active_or_not_found';
  END IF;
  IF NOT public.is_super_admin(auth.uid())
     AND v_submission.assigned_to IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'kyc_not_assigned';
  END IF;

  SELECT role_row.name
    INTO v_actor_role
    FROM public.user_roles AS assignment
    JOIN public.roles AS role_row ON role_row.id = assignment.role_id
   WHERE assignment.user_id = auth.uid()
     AND assignment.vendor_id IS NULL
     AND assignment.outlet_id IS NULL
     AND role_row.name IN ('admin', 'approver', 'super_admin')
   ORDER BY CASE role_row.name
     WHEN 'super_admin' THEN 0
     WHEN 'admin' THEN 1
     ELSE 2
   END
   LIMIT 1;
  IF v_actor_role IS NULL THEN
    RAISE EXCEPTION 'kyc_permission_required';
  END IF;

  v_status := CASE p_action
    WHEN 'approve' THEN 'approved'
    WHEN 'reject' THEN 'rejected'
    ELSE 'info_requested'
  END;
  v_customer_message := CASE p_action
    WHEN 'approve' THEN 'Your identity verification is complete.'
    WHEN 'reject' THEN 'Your KYC submission was rejected. Review the reason and submit new evidence if needed.'
    ELSE 'Additional KYC information is required. Review the request and submit new evidence.'
  END;

  UPDATE public.kyc_submissions
     SET status = v_status,
         reviewed_at = v_reviewed_at,
         reviewer_id = auth.uid(),
         evidence_retention_started_at = CASE
           WHEN p_action = 'reject' THEN v_reviewed_at
           ELSE evidence_retention_started_at
         END,
         review_reason_code = CASE WHEN p_action = 'approve' THEN NULL ELSE p_reason_code END,
         review_reason_detail = CASE
           WHEN p_action = 'approve' THEN NULL
           ELSE NULLIF(BTRIM(p_reason_detail), '')
         END
   WHERE id = p_submission_id;

  PERFORM set_config('app.allow_verification_write', 'on', TRUE);
  UPDATE public.users
     SET kyc_status = CASE
           WHEN p_action = 'approve' THEN 'approved'
           WHEN p_action = 'reject' THEN 'rejected'
           ELSE 'pending'
         END,
         updated_at = NOW()
   WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;
  PERFORM public.recompute_compatibility_tier(p_user_id);

  INSERT INTO public.kyc_review_events(
    submission_id,
    user_id,
    from_status,
    to_status,
    action,
    actor_id,
    actor_role,
    reason_category,
    internal_note,
    customer_message,
    created_at
  ) VALUES (
    p_submission_id,
    p_user_id,
    v_submission.status,
    v_status,
    p_action,
    auth.uid(),
    v_actor_role,
    CASE WHEN p_action = 'approve' THEN NULL ELSE p_reason_code END,
    CASE WHEN p_action = 'approve' THEN NULL ELSE NULLIF(BTRIM(p_reason_detail), '') END,
    v_customer_message,
    v_reviewed_at
  );

  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, after_data, note)
  VALUES (
    auth.uid(),
    'kyc.' || p_action,
    'kyc_submission',
    p_submission_id,
    jsonb_build_object(
      'submission_id', p_submission_id,
      'reason_code', CASE WHEN p_action = 'approve' THEN NULL ELSE p_reason_code END
    ),
    CASE WHEN p_reason_code = 'other' THEN NULLIF(BTRIM(p_reason_detail), '') ELSE NULL END
  );

  INSERT INTO public.notifications(user_id, type, title, body, link)
  VALUES (
    p_user_id,
    'kyc_' || p_action,
    CASE p_action
      WHEN 'approve' THEN 'KYC verification approved'
      WHEN 'reject' THEN 'KYC submission rejected'
      ELSE 'Additional KYC information needed'
    END,
    v_customer_message,
    '/customer/kyc'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_wallet_withdrawal(
  p_withdrawal_id UUID,
  p_note TEXT DEFAULT NULL,
  p_ip INET DEFAULT NULL,
  p_reason_category TEXT DEFAULT 'review_completed'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_request public.withdrawal_requests%ROWTYPE;
  v_user RECORD;
  v_threshold_sen BIGINT;
  v_amount_sen BIGINT;
  v_recent_failed INT;
  v_active_count INT;
  v_account_age_days INT;
  v_risk_level TEXT;
  v_snapshot JSONB;
  v_risk_overridden BOOLEAN;
  v_approve_count INT;
  v_final_status TEXT;
  v_ready BOOLEAN;
  v_required INT;
  v_note TEXT;
BEGIN
  IF v_actor IS NULL OR NOT public.has_staff_permission(v_actor, 'admin.withdrawal.approve') THEN
    RAISE EXCEPTION 'withdrawal_permission_required';
  END IF;
  v_note := NULLIF(BTRIM(p_note), '');
  IF v_note IS NOT NULL AND (char_length(v_note) < 10 OR char_length(v_note) > 500) THEN
    RAISE EXCEPTION 'note_length_invalid';
  END IF;
  IF NULLIF(BTRIM(COALESCE(p_reason_category, '')), '') IS NULL THEN
    RAISE EXCEPTION 'reason_category_required';
  END IF;
  SELECT *
    INTO v_request
    FROM public.withdrawal_requests
   WHERE id = p_withdrawal_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal_not_found'; END IF;
  IF v_request.user_id = v_actor THEN RAISE EXCEPTION 'self_dealing'; END IF;
  IF v_request.status NOT IN ('pending', 'pending_second_approval') THEN
    RAISE EXCEPTION 'withdrawal_not_approvable';
  END IF;

  v_amount_sen := ROUND(v_request.amount * 100)::BIGINT;
  SELECT kyc_status, stripe_payouts_enabled, created_at
    INTO v_user
    FROM public.users
   WHERE id = v_request.user_id;
  SELECT COALESCE(value::BIGINT, 50000)
    INTO v_threshold_sen
    FROM public.platform_settings
   WHERE key = 'withdrawal.dual_approval_threshold_sen';
  SELECT COUNT(*)::INT
    INTO v_recent_failed
    FROM public.withdrawal_requests
   WHERE user_id = v_request.user_id
     AND status IN ('failed', 'rejected')
     AND created_at >= NOW() - INTERVAL '30 days';
  SELECT COUNT(*)::INT
    INTO v_active_count
    FROM public.withdrawal_requests
   WHERE user_id = v_request.user_id
     AND status IN ('pending', 'pending_second_approval', 'approved', 'processing', 'hold', 'overdue');
  v_account_age_days := GREATEST(0, EXTRACT(DAY FROM NOW() - v_user.created_at)::INT);

  IF v_user.kyc_status <> 'approved'
     OR (
       COALESCE(v_request.payout_provider, 'stripe_connect') = 'stripe_connect'
       AND NOT COALESCE(v_user.stripe_payouts_enabled, FALSE)
     )
     OR v_recent_failed >= 3
     OR v_active_count > 1 THEN
    v_risk_level := 'high';
  ELSIF v_amount_sen >= COALESCE(v_threshold_sen, 50000)
        OR v_recent_failed >= 1
        OR v_account_age_days < 30 THEN
    v_risk_level := 'review';
  ELSE
    v_risk_level := 'low';
  END IF;

  v_snapshot := jsonb_build_object(
    'kyc_status', v_user.kyc_status,
    'payout_provider', COALESCE(v_request.payout_provider, 'stripe_connect'),
    'payouts_enabled', CASE
      WHEN COALESCE(v_request.payout_provider, 'stripe_connect') = 'stripe_connect'
        THEN COALESCE(v_user.stripe_payouts_enabled, FALSE)
      ELSE TRUE
    END,
    'amount_sen', v_amount_sen,
    'approval_cycle', v_request.approval_cycle,
    'recent_failed_count', v_recent_failed,
    'active_request_count', v_active_count,
    'account_age_days', v_account_age_days
  );
  SELECT overridden_at IS NOT NULL
    INTO v_risk_overridden
    FROM public.withdrawal_risk_assessments
   WHERE withdrawal_id = p_withdrawal_id;
  INSERT INTO public.withdrawal_risk_assessments(withdrawal_id, risk_level, snapshot, assessed_at)
  VALUES (p_withdrawal_id, v_risk_level, v_snapshot, NOW())
  ON CONFLICT (withdrawal_id) DO UPDATE SET
    risk_level = EXCLUDED.risk_level,
    snapshot = EXCLUDED.snapshot,
    assessed_at = EXCLUDED.assessed_at
  WHERE withdrawal_risk_assessments.overridden_at IS NULL;
  SELECT risk_level, overridden_at IS NOT NULL
    INTO v_risk_level, v_risk_overridden
    FROM public.withdrawal_risk_assessments
   WHERE withdrawal_id = p_withdrawal_id;
  IF v_risk_level = 'high' AND NOT COALESCE(v_risk_overridden, FALSE) THEN
    RAISE EXCEPTION 'high_risk_override_required';
  END IF;

  BEGIN
    INSERT INTO public.withdrawal_approvals(
      request_id, approver_id, action, note, approval_cycle, reason_category
    ) VALUES (
      p_withdrawal_id, v_actor, 'approve', v_note, v_request.approval_cycle, p_reason_category
    );
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'already_approved_by_this_actor';
  END;

  SELECT COUNT(DISTINCT approver_id)::INT
    INTO v_approve_count
    FROM public.withdrawal_approvals
   WHERE request_id = p_withdrawal_id
     AND approval_cycle = v_request.approval_cycle
     AND action = 'approve';
  v_required := CASE WHEN v_request.requires_dual_approval THEN 2 ELSE 1 END;
  v_ready := NOT v_request.requires_dual_approval OR v_approve_count >= v_required;
  v_final_status := CASE WHEN v_ready THEN 'approved' ELSE 'pending_second_approval' END;

  UPDATE public.withdrawal_requests
     SET status = v_final_status,
         updated_at = NOW()
   WHERE id = p_withdrawal_id;
  INSERT INTO public.audit_logs(
    actor_id, action, entity_type, entity_id, before_data, after_data, ip_address, note
  ) VALUES (
    v_actor,
    'withdrawal.approval_recorded',
    'withdrawal',
    p_withdrawal_id,
    jsonb_build_object(
      'status', v_request.status,
      'approval_count', v_approve_count - 1,
      'approval_cycle', v_request.approval_cycle
    ),
    jsonb_build_object(
      'status', v_final_status,
      'approval_count', v_approve_count,
      'approval_cycle', v_request.approval_cycle,
      'ready', v_ready
    ),
    p_ip,
    v_note
  );
  INSERT INTO public.notifications(user_id, type, title, body, link, event_key, category, metadata)
  VALUES (
    v_request.user_id,
    CASE WHEN v_ready THEN 'withdrawal_approved' ELSE 'withdrawal_second_approval_pending' END,
    CASE WHEN v_ready THEN 'Withdrawal approved — payout in progress' ELSE 'Withdrawal partially approved — awaiting second review' END,
    CASE WHEN v_ready THEN 'Your withdrawal has been approved and will be transferred to your selected payout destination shortly.' ELSE 'Your withdrawal has received its first approval and requires one more review.' END,
    '/customer/wallet',
    'withdrawal_approval:' || p_withdrawal_id::TEXT || ':' || v_request.approval_cycle::TEXT || ':' || v_approve_count::TEXT,
    'wallet',
    jsonb_build_object(
      'withdrawal_id', p_withdrawal_id,
      'approval_cycle', v_request.approval_cycle,
      'approval_count', v_approve_count
    )
  );

  RETURN jsonb_build_object(
    'request_id', p_withdrawal_id,
    'status', v_final_status,
    'ready', v_ready,
    'approval_count', v_approve_count,
    'required_approvals', v_required,
    'risk_level', v_risk_level,
    'user_id', v_request.user_id,
    'amount_rm', v_request.amount,
    'approval_cycle', v_request.approval_cycle
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_approve_claimed_vendor(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_approve_claimed_vendor(UUID) FROM authenticated, service_role;

REVOKE ALL ON FUNCTION public.convert_claimed_vendor_recommendation(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.convert_claimed_vendor_recommendation(UUID, UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_review_kyc(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_kyc(UUID, UUID, TEXT, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.approve_wallet_withdrawal(UUID, TEXT, INET, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_wallet_withdrawal(UUID, TEXT, INET, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.staff_review_vendor(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_review_vendor(UUID, TEXT, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.staff_set_vendor_suspension(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_set_vendor_suspension(UUID, TEXT, TEXT) TO authenticated, service_role;
