-- Enforce dedicated staff permissions at both the HTTP and database seams.
-- Vendor mutations are available only through the permission-checking RPCs.

DROP POLICY IF EXISTS "demo_allow_all" ON public.vendors;
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

  RETURN jsonb_build_object(
    'vendor_id', p_vendor_id,
    'previous_status', v_vendor.status,
    'status', v_new_status,
    'reason_recorded', NULLIF(BTRIM(p_reason), '') IS NOT NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_approve_claimed_vendor(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_approve_claimed_vendor(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.staff_review_vendor(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_review_vendor(UUID, TEXT, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.staff_set_vendor_suspension(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_set_vendor_suspension(UUID, TEXT, TEXT) TO authenticated, service_role;
