-- Domain-specific review capabilities. The legacy is_admin() helper remains
-- for unrelated modules; KYC and recommendation authorization no longer use it.

CREATE OR REPLACE FUNCTION public.can_review_kyc(uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT uid IS NOT NULL
    AND (auth.role() = 'service_role' OR uid = auth.uid())
    AND EXISTS (
      SELECT 1
        FROM public.user_roles ur
        JOIN public.roles r ON r.id = ur.role_id
       WHERE ur.user_id = uid
         AND r.name IN ('admin', 'super_admin')
    );
$$;

CREATE OR REPLACE FUNCTION public.can_review_recommendation(uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT uid IS NOT NULL
    AND (auth.role() = 'service_role' OR uid = auth.uid())
    AND EXISTS (
      SELECT 1
        FROM public.user_roles ur
        JOIN public.roles r ON r.id = ur.role_id
       WHERE ur.user_id = uid
         AND r.name IN ('admin', 'super_admin')
    );
$$;

REVOKE ALL ON FUNCTION public.can_review_kyc(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_review_recommendation(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_review_kyc(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_review_recommendation(UUID) TO authenticated, service_role;

-- Preserve customer self-read while replacing the stale global admin clause.
DROP POLICY IF EXISTS kyc_select_own ON public.kyc_submissions;
CREATE POLICY kyc_select_own ON public.kyc_submissions
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.can_review_kyc(auth.uid())
  );

-- Keep recommendation table/image visibility aligned with the moderation role.
DROP POLICY IF EXISTS vendor_rec_read ON public.vendor_recommendations;
CREATE POLICY vendor_rec_read ON public.vendor_recommendations
  FOR SELECT USING (
    auth.uid() = recommender_id
    OR status IN ('approved', 'converted')
    OR public.can_review_recommendation(auth.uid())
  );

DROP POLICY IF EXISTS recommendation_images_admin_read ON public.recommendation_images;
CREATE POLICY recommendation_images_admin_read ON public.recommendation_images
  FOR SELECT USING (public.can_review_recommendation(auth.uid()));

DROP POLICY IF EXISTS rec_conv_read ON public.recommendation_conversions;
CREATE POLICY rec_conv_read ON public.recommendation_conversions
  FOR SELECT USING (
    EXISTS (
      SELECT 1
        FROM public.vendor_recommendations vr
       WHERE vr.id = recommendation_conversions.recommendation_id
         AND (
           vr.recommender_id = auth.uid()
           OR public.can_review_recommendation(auth.uid())
         )
    )
  );

DROP POLICY IF EXISTS rec_commissions_read_own ON public.recommendation_commissions;
CREATE POLICY rec_commissions_read_own ON public.recommendation_commissions
  FOR SELECT USING (
    auth.uid() = recommender_id
    OR public.can_review_recommendation(auth.uid())
  );

DROP POLICY IF EXISTS vendor_recommendation_claims_owner_read ON public.vendor_recommendation_claims;
CREATE POLICY vendor_recommendation_claims_owner_read
  ON public.vendor_recommendation_claims
  FOR SELECT TO authenticated USING (
    claimed_by = auth.uid()
    OR EXISTS (
      SELECT 1
        FROM public.vendors v
       WHERE v.id = vendor_id
         AND v.owner_id = auth.uid()
    )
    OR public.can_review_recommendation(auth.uid())
  );

-- Replace the current KYC decision boundary without changing its state machine.
CREATE OR REPLACE FUNCTION public.admin_review_kyc(
  p_user_id UUID,
  p_action TEXT,
  p_reason_code TEXT DEFAULT NULL,
  p_reason_detail TEXT DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_submission_id UUID;
  v_status TEXT;
BEGIN
  IF p_action IS NULL OR p_action NOT IN ('approve', 'reject', 'request_info') THEN
    RAISE EXCEPTION 'invalid_action';
  END IF;
  IF NOT public.can_review_kyc(auth.uid()) THEN
    RAISE EXCEPTION 'admin_required';
  END IF;
  IF auth.uid() = p_user_id THEN RAISE EXCEPTION 'self_dealing'; END IF;
  IF p_action = 'approve' AND (p_reason_code IS NOT NULL OR p_reason_detail IS NOT NULL) THEN
    RAISE EXCEPTION 'reason_not_allowed';
  END IF;
  IF p_action <> 'approve' AND (
    p_reason_code IS NULL
    OR p_reason_code NOT IN (
      'document_unreadable', 'document_incomplete', 'document_mismatch',
      'document_expired', 'document_suspected_tampering', 'other'
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
  IF p_reason_code = 'other' AND length(btrim(COALESCE(p_reason_detail, ''))) < 10 THEN
    RAISE EXCEPTION 'reason_detail_too_short';
  END IF;

  SELECT id
    INTO v_submission_id
    FROM public.kyc_submissions
   WHERE user_id = p_user_id
     AND status IN ('pending', 'info_requested')
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'kyc_not_active_or_not_found'; END IF;

  v_status := CASE p_action
    WHEN 'approve' THEN 'approved'
    WHEN 'reject' THEN 'rejected'
    ELSE 'info_requested'
  END;

  UPDATE public.kyc_submissions
     SET status = v_status,
         reviewed_at = now(),
         reviewer_id = auth.uid(),
         evidence_retention_started_at = CASE
           WHEN p_action = 'reject' THEN now()
           ELSE evidence_retention_started_at
         END,
         review_reason_code = CASE WHEN p_action = 'approve' THEN NULL ELSE p_reason_code END,
         review_reason_detail = CASE
           WHEN p_action = 'approve' THEN NULL
           ELSE NULLIF(btrim(p_reason_detail), '')
         END
   WHERE id = v_submission_id;

  IF p_action = 'approve' THEN
    PERFORM public.promote_to_kyc_verified(p_user_id);
    PERFORM public.gen_affiliate_code(p_user_id);
  ELSIF p_action = 'reject' THEN
    UPDATE public.users SET kyc_status = 'rejected', updated_at = now() WHERE id = p_user_id;
  ELSE
    UPDATE public.users SET kyc_status = 'pending', updated_at = now() WHERE id = p_user_id;
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, after_data, note)
  VALUES (
    auth.uid(),
    'kyc.' || p_action,
    'kyc_submission',
    v_submission_id,
    jsonb_build_object(
      'submission_id', v_submission_id,
      'reason_code', CASE WHEN p_action = 'approve' THEN NULL ELSE p_reason_code END
    ),
    CASE WHEN p_reason_code = 'other' THEN NULLIF(btrim(p_reason_detail), '') ELSE NULL END
  );

  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (
    p_user_id,
    'kyc_' || p_action,
    CASE p_action
      WHEN 'approve' THEN 'KYC verification approved'
      WHEN 'reject' THEN 'KYC submission rejected'
      ELSE 'Additional KYC information needed'
    END,
    CASE
      WHEN p_action = 'approve' THEN 'Your identity verification is complete.'
      ELSE 'Review your KYC submission status and submit new evidence if needed.'
    END,
    '/customer/kyc'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_kyc_document_view(
  p_submission_id UUID,
  p_side TEXT,
  p_actor_id UUID
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_path TEXT;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
  IF NOT public.can_review_kyc(p_actor_id) THEN RAISE EXCEPTION 'admin_required'; END IF;
  IF p_side NOT IN ('front', 'back') THEN RAISE EXCEPTION 'invalid_document_side'; END IF;

  SELECT storage_path
    INTO v_path
    FROM public.kyc_submission_documents
   WHERE submission_id = p_submission_id
     AND side = p_side;
  IF NOT FOUND THEN RAISE EXCEPTION 'document_not_found'; END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, after_data)
  VALUES (
    p_actor_id,
    'kyc.document_viewed',
    'kyc_submission',
    p_submission_id,
    jsonb_build_object('submission_id', p_submission_id, 'side', p_side)
  );
  RETURN v_path;
END;
$$;

-- Replace the current recommendation decision boundary without changing its
-- state transition or customer notification contract.
CREATE OR REPLACE FUNCTION public.admin_review_recommendation(
  p_rec_id UUID,
  p_action TEXT,
  p_reason TEXT DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_recommender_id UUID;
BEGIN
  IF NOT public.can_review_recommendation(auth.uid()) THEN
    RAISE EXCEPTION 'admin_required';
  END IF;
  IF p_action NOT IN ('approve', 'reject', 'request_changes') THEN
    RAISE EXCEPTION 'invalid_action';
  END IF;
  IF p_action = 'request_changes' AND char_length(BTRIM(COALESCE(p_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  SELECT recommender_id
    INTO v_recommender_id
    FROM public.vendor_recommendations
   WHERE id = p_rec_id;
  IF NOT FOUND OR v_recommender_id = auth.uid() THEN
    RAISE EXCEPTION 'not_found_or_already_reviewed';
  END IF;

  UPDATE public.vendor_recommendations
     SET status = CASE p_action
           WHEN 'approve' THEN 'approved'
           WHEN 'reject' THEN 'rejected'
           ELSE 'changes_requested'
         END,
         reviewer_id = auth.uid(),
         reviewed_at = now(),
         rejection_reason = CASE WHEN p_action = 'reject' THEN p_reason ELSE NULL END,
         changes_requested_at = CASE WHEN p_action = 'request_changes' THEN now() ELSE NULL END,
         changes_requested_reason = CASE
           WHEN p_action = 'request_changes' THEN BTRIM(p_reason)
           ELSE NULL
         END
   WHERE id = p_rec_id
     AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found_or_already_reviewed'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_link_vendor_recommendation(
  p_vendor_id UUID,
  p_rec_id UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_window_days INT := 90;
  v_conversion_id UUID;
  v_recommender_id UUID;
BEGIN
  IF NOT public.can_review_recommendation(auth.uid()) THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  SELECT recommender_id
    INTO v_recommender_id
    FROM public.vendor_recommendations
   WHERE id = p_rec_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'recommendation_not_approved_or_not_found: %', p_rec_id;
  END IF;
  IF auth.uid() = v_recommender_id THEN RAISE EXCEPTION 'self_dealing'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('vendor_link:' || p_vendor_id::TEXT));
  IF EXISTS (
    SELECT 1
      FROM public.recommendation_conversions
     WHERE converted_vendor_id = p_vendor_id
       AND attribution_ends_at > now()
  ) THEN
    RAISE EXCEPTION 'vendor_already_linked';
  END IF;

  SELECT COALESCE(value::INT, 90)
    INTO v_window_days
    FROM public.platform_settings
   WHERE key = 'recommendation.attribution_window_days';

  UPDATE public.vendor_recommendations
     SET status = 'converted',
         converted_vendor_id = p_vendor_id,
         reviewed_at = now(),
         reviewer_id = auth.uid()
   WHERE id = p_rec_id
     AND status = 'approved';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'recommendation_not_approved_or_not_found: %', p_rec_id;
  END IF;

  INSERT INTO public.recommendation_conversions (
    recommendation_id,
    converted_vendor_id,
    attribution_ends_at
  ) VALUES (
    p_rec_id,
    p_vendor_id,
    now() + (v_window_days || ' days')::INTERVAL
  )
  RETURNING id INTO v_conversion_id;

  RETURN v_conversion_id;
END;
$$;

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
  IF NOT public.can_review_recommendation(auth.uid()) THEN
    RAISE EXCEPTION 'admin_required';
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
