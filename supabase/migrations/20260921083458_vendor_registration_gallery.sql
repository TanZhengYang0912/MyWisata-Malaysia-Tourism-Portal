-- Add an optional vendor gallery to the atomic vendor registration flow.
-- Drop the exact old signature so PostgREST has no ambiguous overload.
DROP FUNCTION IF EXISTS public.register_vendor_with_outlet(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
);

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
  p_cover_url             TEXT DEFAULT NULL,
  p_gallery               JSONB DEFAULT '[]'::JSONB
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
  v_item        JSONB;
  v_image_url   TEXT;
  v_storage_path TEXT;
  v_ordinal     BIGINT;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '28000';
  END IF;

  IF jsonb_typeof(p_gallery) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_gallery) NOT IN (0, 3) THEN
    RAISE EXCEPTION 'invalid_gallery_count' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_gallery) AS item(value) LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'invalid_gallery_url' USING ERRCODE = '22023';
    END IF;

    v_image_url := v_item #>> '{}';
    IF v_image_url !~ '^https?://[^/]+/storage/v1/object/public/vendor-products/' THEN
      RAISE EXCEPTION 'invalid_gallery_url' USING ERRCODE = '22023';
    END IF;
    v_storage_path := split_part(v_image_url, '/storage/v1/object/public/vendor-products/', 2);
    IF v_storage_path !~ ('^' || v_user::TEXT || '/registrations/[0-9a-f-]+-gallery-[0-2][.](jpg|png|webp)$') THEN
      RAISE EXCEPTION 'invalid_gallery_url' USING ERRCODE = '22023';
    END IF;
  END LOOP;

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

  INSERT INTO public.media_assets (vendor_id, outlet_id, product_id, url, alt_text, media_type, sort_order)
  SELECT
    v_vendor_id,
    NULL,
    NULL,
    item.value #>> '{}',
    p_name || ' gallery image ' || item.ordinality,
    'image',
    (item.ordinality - 1)::INT
  FROM jsonb_array_elements(p_gallery) WITH ORDINALITY AS item(value, ordinality);

  RETURN jsonb_build_object('vendor_id', v_vendor_id, 'slug', v_slug, 'outlet_id', v_outlet_id);
END;
$$;

REVOKE ALL ON FUNCTION public.register_vendor_with_outlet(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.register_vendor_with_outlet(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB
) TO authenticated, service_role;

-- Replacing or clearing an existing gallery is one database transaction. The
-- API performs vendor-owner authorization before calling this function, and
-- this function repeats that check because SECURITY DEFINER bypasses RLS.
CREATE OR REPLACE FUNCTION public.set_vendor_gallery(
  p_vendor_id UUID,
  p_gallery JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_vendor_name TEXT;
  v_item JSONB;
  v_image_url TEXT;
  v_storage_path TEXT;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '28000';
  END IF;

  SELECT name INTO v_vendor_name
    FROM public.vendors
   WHERE id = p_vendor_id AND owner_id = v_user;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'vendor_owner_required' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(p_gallery) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_gallery) NOT IN (0, 3) THEN
    RAISE EXCEPTION 'invalid_gallery_count' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_gallery) AS item(value) LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'invalid_gallery_url' USING ERRCODE = '22023';
    END IF;

    v_image_url := v_item #>> '{}';
    IF v_image_url !~ '^https?://[^/]+/storage/v1/object/public/vendor-products/' THEN
      RAISE EXCEPTION 'invalid_gallery_url' USING ERRCODE = '22023';
    END IF;
    v_storage_path := split_part(v_image_url, '/storage/v1/object/public/vendor-products/', 2);
    IF v_storage_path !~ ('^' || p_vendor_id::TEXT || '/gallery/[0-9a-f-]+-gallery-[0-2][.](jpg|png|webp)$') THEN
      RAISE EXCEPTION 'invalid_gallery_url' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  DELETE FROM public.media_assets
   WHERE vendor_id = p_vendor_id
     AND outlet_id IS NULL
     AND product_id IS NULL
     AND media_type IN ('image', 'gallery')
     AND sort_order IS DISTINCT FROM -1
     AND position(' logo' IN lower(COALESCE(alt_text, ''))) = 0;

  INSERT INTO public.media_assets (vendor_id, outlet_id, product_id, url, alt_text, media_type, sort_order)
  SELECT
    p_vendor_id,
    NULL,
    NULL,
    item.value #>> '{}',
    v_vendor_name || ' gallery image ' || item.ordinality,
    'image',
    (item.ordinality - 1)::INT
  FROM jsonb_array_elements(p_gallery) WITH ORDINALITY AS item(value, ordinality);
END;
$$;

REVOKE ALL ON FUNCTION public.set_vendor_gallery(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_vendor_gallery(UUID, JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';
