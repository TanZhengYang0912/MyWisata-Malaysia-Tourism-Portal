-- Recommendation claim lifecycle and the atomic external-vendor onboarding boundary.

ALTER TABLE public.vendor_recommendations
  DROP CONSTRAINT IF EXISTS vendor_recommendations_status_check;
ALTER TABLE public.vendor_recommendations
  ADD CONSTRAINT vendor_recommendations_status_check
  CHECK (status IN ('pending','approved','invited','claimed','onboarding','vendor_pending_review','rejected','converted'));

ALTER TABLE public.vendor_onboarding_profiles
  DROP CONSTRAINT IF EXISTS vendor_onboarding_profiles_status_check;
ALTER TABLE public.vendor_onboarding_profiles
  ADD CONSTRAINT vendor_onboarding_profiles_status_check
  CHECK (status IN ('draft','submitted','in_review','pending_review','needs_information','approved','rejected'));

CREATE TABLE IF NOT EXISTS public.vendor_recommendation_claims (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id UUID NOT NULL REFERENCES public.vendor_recommendations(id) ON DELETE CASCADE,
  vendor_id         UUID NOT NULL UNIQUE REFERENCES public.vendors(id) ON DELETE CASCADE,
  claimed_by        UUID NOT NULL REFERENCES public.users(id),
  claimed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (recommendation_id)
);

ALTER TABLE public.vendor_recommendation_claims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vendor_recommendation_claims_owner_read ON public.vendor_recommendation_claims;
CREATE POLICY vendor_recommendation_claims_owner_read ON public.vendor_recommendation_claims
  FOR SELECT TO authenticated USING (
    claimed_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.owner_id = auth.uid())
    OR is_admin(auth.uid())
  );

CREATE INDEX IF NOT EXISTS vendor_recommendation_invites_active_idx
  ON public.vendor_recommendation_invites (token_hash, status, expires_at);

CREATE OR REPLACE FUNCTION public.claim_vendor_recommendation(
  p_token_hash TEXT,
  p_business_name TEXT,
  p_legal_business_name TEXT,
  p_business_type TEXT,
  p_contact_email TEXT,
  p_contact_phone TEXT,
  p_business_address TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_invite public.vendor_recommendation_invites%ROWTYPE;
  v_rec public.vendor_recommendations%ROWTYPE;
  v_vendor_id UUID;
  v_slug TEXT;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users
     WHERE id = v_user_id AND phone_verified_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'phone_verification_required';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.vendors
     WHERE owner_id = v_user_id AND status IN ('pending','approved')
  ) THEN
    RAISE EXCEPTION 'owner_already_has_vendor';
  END IF;

  SELECT i.* INTO v_invite
    FROM public.vendor_recommendation_invites i
   WHERE i.token_hash = p_token_hash
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invite_not_found'; END IF;
  IF v_invite.status = 'cancelled' THEN RAISE EXCEPTION 'invite_cancelled'; END IF;
  IF v_invite.status <> 'invited' THEN RAISE EXCEPTION 'invite_already_claimed'; END IF;
  IF v_invite.expires_at <= NOW() THEN RAISE EXCEPTION 'invite_expired'; END IF;

  IF v_invite.email IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.users u
     WHERE u.id = v_user_id AND lower(u.email) = lower(v_invite.email)
  ) THEN
    RAISE EXCEPTION 'invite_email_mismatch';
  END IF;

  SELECT * INTO v_rec
    FROM public.vendor_recommendations
   WHERE id = v_invite.recommendation_id
   FOR UPDATE;
  IF NOT FOUND OR v_rec.status NOT IN ('approved','invited') THEN
    RAISE EXCEPTION 'recommendation_not_claimable';
  END IF;

  v_slug := trim(both '-' FROM regexp_replace(lower(trim(p_business_name)), '[^a-z0-9]+', '-', 'g'));
  IF v_slug = '' THEN v_slug := 'vendor'; END IF;
  IF EXISTS (SELECT 1 FROM public.vendors WHERE slug = v_slug) THEN
    v_slug := v_slug || '-' || substr(replace(gen_random_uuid()::TEXT, '-', ''), 1, 8);
  END IF;

  INSERT INTO public.vendors (owner_id, name, slug, business_type, status)
  VALUES (v_user_id, trim(p_business_name), v_slug, trim(p_business_type), 'pending')
  RETURNING id INTO v_vendor_id;

  INSERT INTO public.vendor_onboarding_profiles (
    vendor_id, legal_business_name, contact_email, contact_phone, business_address, status
  ) VALUES (
    v_vendor_id, trim(p_legal_business_name), lower(trim(p_contact_email)), trim(p_contact_phone), trim(p_business_address), 'draft'
  );

  INSERT INTO public.vendor_recommendation_claims (recommendation_id, vendor_id, claimed_by)
  VALUES (v_rec.id, v_vendor_id, v_user_id);

  UPDATE public.vendor_recommendation_invites
     SET status = 'claimed', claimed_vendor_id = v_vendor_id, claimed_at = NOW()
   WHERE id = v_invite.id;
  UPDATE public.vendor_recommendations
     SET status = 'onboarding'
   WHERE id = v_rec.id;

  RETURN jsonb_build_object(
    'vendor_id', v_vendor_id,
    'recommendation_id', v_rec.id,
    'status', 'onboarding'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_vendor_recommendation(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_vendor_recommendation(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.convert_claimed_vendor_recommendation(
  p_vendor_id UUID,
  p_recommendation_id UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor public.vendors%ROWTYPE;
  v_rec public.vendor_recommendations%ROWTYPE;
  v_conversion_id UUID;
BEGIN
  IF NOT is_admin(auth.uid()) THEN RAISE EXCEPTION 'admin_required'; END IF;

  SELECT * INTO v_vendor FROM public.vendors WHERE id = p_vendor_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'vendor_not_found'; END IF;
  IF v_vendor.status <> 'approved' THEN RAISE EXCEPTION 'vendor_not_approved'; END IF;

  SELECT * INTO v_rec FROM public.vendor_recommendations WHERE id = p_recommendation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'recommendation_not_found'; END IF;
  IF v_rec.recommender_id = auth.uid() THEN RAISE EXCEPTION 'self_dealing'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.vendor_recommendation_claims
     WHERE recommendation_id = p_recommendation_id AND vendor_id = p_vendor_id
  ) THEN
    RAISE EXCEPTION 'claim_link_not_found';
  END IF;

  SELECT id INTO v_conversion_id
    FROM public.recommendation_conversions
   WHERE recommendation_id = p_recommendation_id
   ORDER BY converted_at DESC
   LIMIT 1;
  IF v_conversion_id IS NOT NULL THEN RETURN v_conversion_id; END IF;

  IF v_rec.status NOT IN ('claimed','onboarding','vendor_pending_review') THEN
    RAISE EXCEPTION 'recommendation_not_ready_for_conversion';
  END IF;

  INSERT INTO public.recommendation_conversions
    (recommendation_id, converted_vendor_id, attribution_ends_at)
  VALUES
    (p_recommendation_id, p_vendor_id,
     NOW() + COALESCE((SELECT NULLIF(value, '')::INT FROM public.platform_settings WHERE key = 'recommendation.attribution_window_days'), 90) * INTERVAL '1 day')
  RETURNING id INTO v_conversion_id;

  UPDATE public.vendor_recommendations
     SET status = 'converted', converted_vendor_id = p_vendor_id, reviewed_at = NOW(), reviewer_id = auth.uid()
   WHERE id = p_recommendation_id;

  PERFORM public.credit_pending_recommendation(
    v_rec.recommender_id, 5000, 'bonus', v_conversion_id, NULL, NULL,
    'Recommendation vendor conversion reward'
  );

  RETURN v_conversion_id;
END;
$$;

REVOKE ALL ON FUNCTION public.convert_claimed_vendor_recommendation(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.convert_claimed_vendor_recommendation(UUID, UUID) TO authenticated;
