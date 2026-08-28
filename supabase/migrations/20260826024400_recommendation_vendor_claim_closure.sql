-- Close the approved recommendation -> vendor claim -> vendor approval flow.

ALTER TABLE public.vendor_recommendations
  DROP CONSTRAINT IF EXISTS vendor_recommendations_status_check;
ALTER TABLE public.vendor_recommendations
  ADD CONSTRAINT vendor_recommendations_status_check
  CHECK (status IN (
    'pending', 'changes_requested', 'approved', 'invited', 'claimed',
    'onboarding', 'vendor_pending_review', 'rejected', 'converted'
  ));

-- Remove the linked project's legacy seven-TEXT overload before deploying the
-- guided claim signature already used by app/api/vendor/claim/route.ts.
DROP FUNCTION IF EXISTS public.claim_vendor_recommendation(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.claim_vendor_recommendation(
  p_token_hash TEXT,
  p_business_name TEXT,
  p_legal_business_name TEXT,
  p_description TEXT,
  p_category_id UUID,
  p_outlet_name TEXT,
  p_contact_email TEXT,
  p_contact_phone TEXT,
  p_business_address TEXT,
  p_latitude DOUBLE PRECISION,
  p_longitude DOUBLE PRECISION
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_user public.users%ROWTYPE;
  v_invite public.vendor_recommendation_invites%ROWTYPE;
  v_recommendation public.vendor_recommendations%ROWTYPE;
  v_category_slug TEXT;
  v_vendor_base_slug TEXT;
  v_vendor_slug TEXT;
  v_outlet_base_slug TEXT;
  v_outlet_slug TEXT;
  v_slug_suffix INTEGER := 1;
  v_vendor_id UUID;
  v_outlet_id UUID;
  v_claim_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('claim_vendor_recommendation'), hashtext(v_user_id::TEXT));

  SELECT u.*
    INTO v_user
    FROM public.users u
   WHERE u.id = v_user_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF v_user.phone_verified_at IS NULL THEN
    RAISE EXCEPTION 'phone_verification_required';
  END IF;

  SELECT i.*
    INTO v_invite
    FROM public.vendor_recommendation_invites i
   WHERE i.token_hash = p_token_hash
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite_not_found';
  END IF;
  IF v_invite.status = 'cancelled' THEN
    RAISE EXCEPTION 'invite_cancelled';
  END IF;
  IF v_invite.status = 'expired' OR v_invite.expires_at <= NOW() THEN
    RAISE EXCEPTION 'invite_expired';
  END IF;
  IF v_invite.status <> 'invited' THEN
    RAISE EXCEPTION 'invite_already_claimed';
  END IF;

  IF NULLIF(lower(BTRIM(v_user.email)), '') IS NULL
     OR NULLIF(lower(BTRIM(v_invite.email)), '') IS NULL
     OR NULLIF(lower(BTRIM(p_contact_email)), '') IS NULL
     OR lower(BTRIM(v_user.email)) <> lower(BTRIM(v_invite.email))
     OR lower(BTRIM(v_user.email)) <> lower(BTRIM(p_contact_email)) THEN
    RAISE EXCEPTION 'email_mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.vendors v
     WHERE v.owner_id = v_user_id
       AND v.status IN ('pending', 'approved')
  ) THEN
    RAISE EXCEPTION 'owner_already_has_vendor';
  END IF;

  SELECT r.*
    INTO v_recommendation
    FROM public.vendor_recommendations r
   WHERE r.id = v_invite.recommendation_id
   FOR UPDATE;
  IF NOT FOUND OR v_recommendation.status NOT IN ('approved', 'invited') THEN
    RAISE EXCEPTION 'recommendation_not_claimable';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.vendor_recommendation_claims claim
     WHERE claim.claimed_by = v_user_id
        OR claim.recommendation_id = v_invite.recommendation_id
  ) THEN
    RAISE EXCEPTION 'invite_already_claimed';
  END IF;

  SELECT c.slug
    INTO v_category_slug
    FROM public.categories c
   WHERE c.id = p_category_id
     AND c.is_active = TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'category_not_active';
  END IF;

  v_vendor_base_slug := LEFT(
    COALESCE(
      NULLIF(trim(BOTH '-' FROM regexp_replace(lower(p_business_name), '[^a-z0-9]+', '-', 'g')), ''),
      'vendor'
    ),
    100
  );
  v_slug_suffix := 1;
  LOOP
    v_vendor_slug := CASE
      WHEN v_slug_suffix = 1 THEN v_vendor_base_slug
      ELSE LEFT(v_vendor_base_slug, 100 - char_length(v_slug_suffix::TEXT) - 1)
        || '-' || v_slug_suffix
    END;
    BEGIN
      INSERT INTO public.vendors (
        owner_id, name, slug, description, business_type, status
      ) VALUES (
        v_user_id,
        BTRIM(p_business_name),
        v_vendor_slug,
        BTRIM(p_description),
        v_category_slug,
        'pending'
      )
      RETURNING id INTO v_vendor_id;
      EXIT;
    EXCEPTION
      WHEN unique_violation THEN
        IF EXISTS (SELECT 1 FROM public.vendors v WHERE v.slug = v_vendor_slug) THEN
          v_slug_suffix := v_slug_suffix + 1;
        ELSE
          RAISE;
        END IF;
    END;
  END LOOP;

  INSERT INTO public.vendor_onboarding_profiles (
    vendor_id, legal_business_name, contact_email, contact_phone,
    business_address, status
  ) VALUES (
    v_vendor_id,
    BTRIM(p_legal_business_name),
    lower(BTRIM(p_contact_email)),
    NULLIF(BTRIM(p_contact_phone), ''),
    BTRIM(p_business_address),
    'submitted'
  );

  v_outlet_base_slug := LEFT(
    COALESCE(
      NULLIF(trim(BOTH '-' FROM regexp_replace(lower(p_outlet_name), '[^a-z0-9]+', '-', 'g')), ''),
      v_vendor_slug || '-main'
    ),
    100
  );
  v_slug_suffix := 1;
  LOOP
    v_outlet_slug := CASE
      WHEN v_slug_suffix = 1 THEN v_outlet_base_slug
      ELSE LEFT(v_outlet_base_slug, 100 - char_length(v_slug_suffix::TEXT) - 1)
        || '-' || v_slug_suffix
    END;
    BEGIN
      INSERT INTO public.outlets (
        vendor_id, name, slug, address, phone, email, lat, lng, status, review_status
      ) VALUES (
        v_vendor_id,
        BTRIM(p_outlet_name),
        v_outlet_slug,
        BTRIM(p_business_address),
        NULLIF(BTRIM(p_contact_phone), ''),
        lower(BTRIM(p_contact_email)),
        p_latitude,
        p_longitude,
        'inactive',
        'pending_review'
      )
      RETURNING id INTO v_outlet_id;
      EXIT;
    EXCEPTION
      WHEN unique_violation THEN
        IF EXISTS (SELECT 1 FROM public.outlets o WHERE o.slug = v_outlet_slug) THEN
          v_slug_suffix := v_slug_suffix + 1;
        ELSE
          RAISE;
        END IF;
    END;
  END LOOP;

  INSERT INTO public.vendor_recommendation_claims (
    recommendation_id, vendor_id, claimed_by
  ) VALUES (
    v_recommendation.id, v_vendor_id, v_user_id
  )
  RETURNING id INTO v_claim_id;

  UPDATE public.vendor_recommendation_invites
     SET status = 'claimed',
         claimed_vendor_id = v_vendor_id,
         claimed_at = NOW()
   WHERE id = v_invite.id;

  UPDATE public.vendor_recommendations
     SET status = 'onboarding'
   WHERE id = v_recommendation.id;

  RETURN jsonb_build_object(
    'vendor_id', v_vendor_id,
    'onboarding_profile_vendor_id', v_vendor_id,
    'outlet_id', v_outlet_id,
    'claim_id', v_claim_id,
    'recommendation_id', v_recommendation.id,
    'status', 'onboarding'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_vendor_recommendation(
  TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.claim_vendor_recommendation(
  TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION
) TO authenticated, service_role;

-- Vendor approval and claimed-recommendation conversion must succeed or roll
-- back together. Ordinary vendor approval keeps the legacy is_admin boundary;
-- claimed vendor approval uses the recommendation-specific capability.
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
  IF v_actor_id IS NULL OR NOT (
    public.is_admin(v_actor_id)
    OR public.can_review_recommendation(v_actor_id)
  ) THEN
    RAISE EXCEPTION 'admin_required';
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

  IF v_claim_recommendation_id IS NULL AND NOT public.is_admin(v_actor_id) THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

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

REVOKE ALL ON FUNCTION public.admin_approve_claimed_vendor(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_approve_claimed_vendor(UUID) TO authenticated, service_role;
