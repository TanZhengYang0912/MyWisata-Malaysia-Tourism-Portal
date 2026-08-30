CREATE OR REPLACE FUNCTION public.register_vendor_with_outlet(
  p_name                  TEXT,
  p_slug                  TEXT DEFAULT NULL,
  p_description           TEXT DEFAULT NULL,
  p_business_type         TEXT DEFAULT NULL,
  p_legal_business_name   TEXT DEFAULT NULL,
  p_registration_number   TEXT DEFAULT NULL,
  p_contact_name          TEXT DEFAULT NULL,
  p_contact_email         TEXT DEFAULT NULL,
  p_contact_phone         TEXT DEFAULT NULL,
  p_business_address      TEXT DEFAULT NULL,
  p_logo_url              TEXT DEFAULT NULL,
  p_cover_url             TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user        UUID := auth.uid();
  v_user_email  TEXT;
  v_base_slug   TEXT;
  v_slug        TEXT;
  v_suffix      INT := 1;
  v_vendor_id   UUID;
  v_outlet_id   UUID;
  v_outlet_slug TEXT;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '28000';
  END IF;

  -- Two-argument form takes (int, int); hashtext() already returns int.
  PERFORM pg_advisory_xact_lock(hashtext('register_vendor'), hashtext(v_user::TEXT));

  IF EXISTS (
    SELECT 1 FROM public.vendors
     WHERE owner_id = v_user AND status IN ('pending', 'approved')
  ) THEN
    RAISE EXCEPTION 'vendor_exists' USING ERRCODE = '23505';
  END IF;

  v_base_slug := COALESCE(
    NULLIF(trim(p_slug), ''),
    NULLIF(trim(BOTH '-' FROM regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g')), '')
  );
  IF v_base_slug IS NULL THEN
    RAISE EXCEPTION 'invalid_name' USING ERRCODE = '22023';
  END IF;

  v_slug := v_base_slug;
  WHILE EXISTS (SELECT 1 FROM public.vendors WHERE slug = v_slug) LOOP
    v_suffix := v_suffix + 1;
    v_slug := v_base_slug || '-' || v_suffix;
  END LOOP;

  INSERT INTO public.vendors (owner_id, name, slug, description, business_type, logo_url, cover_url, status)
  VALUES (
    v_user, p_name, v_slug,
    NULLIF(p_description, ''), NULLIF(p_business_type, ''),
    NULLIF(p_logo_url, ''), NULLIF(p_cover_url, ''),
    'pending'
  )
  RETURNING id INTO v_vendor_id;

  SELECT email INTO v_user_email FROM public.users WHERE id = v_user;

  INSERT INTO public.vendor_onboarding_profiles (
    vendor_id, legal_business_name, registration_number,
    contact_name, contact_email, contact_phone, business_address, status
  )
  VALUES (
    v_vendor_id,
    COALESCE(NULLIF(p_legal_business_name, ''), p_name),
    NULLIF(p_registration_number, ''),
    NULLIF(p_contact_name, ''),
    COALESCE(NULLIF(p_contact_email, ''), v_user_email),
    NULLIF(p_contact_phone, ''),
    NULLIF(p_business_address, ''),
    'submitted'
  );

  v_outlet_slug := v_slug || '-main';
  v_suffix := 1;
  WHILE EXISTS (SELECT 1 FROM public.outlets WHERE slug = v_outlet_slug) LOOP
    v_suffix := v_suffix + 1;
    v_outlet_slug := v_slug || '-main-' || v_suffix;
  END LOOP;

  INSERT INTO public.outlets (vendor_id, name, slug, address, phone, status, review_status)
  VALUES (
    v_vendor_id, p_name, v_outlet_slug,
    NULLIF(p_business_address, ''), NULLIF(p_contact_phone, ''),
    'inactive', 'pending_review'
  )
  RETURNING id INTO v_outlet_id;

  RETURN jsonb_build_object('vendor_id', v_vendor_id, 'slug', v_slug, 'outlet_id', v_outlet_id);
END;
$$;;
