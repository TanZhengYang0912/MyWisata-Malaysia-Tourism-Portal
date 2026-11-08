-- Allow authenticated users with verified profile phones to apply as event vendors.
-- Event applications have no outlet and receive their event_vendor role only
-- through the existing KYC-gated admin approval flow.

CREATE OR REPLACE FUNCTION app_private.register_event_vendor_application(
  p_name text,
  p_slug text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_business_type text DEFAULT NULL,
  p_legal_business_name text DEFAULT NULL,
  p_registration_number text DEFAULT NULL,
  p_contact_name text DEFAULT NULL,
  p_contact_email text DEFAULT NULL,
  p_contact_phone text DEFAULT NULL,
  p_business_address text DEFAULT NULL,
  p_logo_url text DEFAULT NULL,
  p_cover_url text DEFAULT NULL,
  p_gallery jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_user_email text;
  v_phone_verified_at timestamptz;
  v_name text := btrim(COALESCE(p_name, ''));
  v_base_slug text;
  v_slug text;
  v_suffix integer := 1;
  v_vendor_id uuid;
  v_item jsonb;
  v_image_url text;
  v_storage_path text;
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

  PERFORM pg_advisory_xact_lock(hashtext('register_vendor'), hashtext(v_user::text));

  SELECT u.email, u.phone_verified_at
    INTO v_user_email, v_phone_verified_at
    FROM public.users u
   WHERE u.id = v_user;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '28000';
  END IF;
  IF v_phone_verified_at IS NULL THEN
    RAISE EXCEPTION 'phone_verification_required' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.vendors
     WHERE owner_id = v_user AND status IN ('pending', 'approved')
  ) THEN
    RAISE EXCEPTION 'vendor_exists' USING ERRCODE = '23505';
  END IF;

  IF char_length(v_name) NOT BETWEEN 2 AND 255 THEN
    RAISE EXCEPTION 'invalid_name' USING ERRCODE = '22023';
  END IF;
  IF char_length(COALESCE(p_description, '')) > 2000
     OR char_length(COALESCE(p_legal_business_name, '')) > 255
     OR char_length(COALESCE(p_registration_number, '')) > 120
     OR char_length(COALESCE(p_contact_name, '')) > 255
     OR char_length(COALESCE(p_contact_email, '')) > 255
     OR char_length(COALESCE(p_contact_phone, '')) > 50
     OR char_length(COALESCE(p_business_address, '')) > 500 THEN
    RAISE EXCEPTION 'registration_details_invalid' USING ERRCODE = '22023';
  END IF;

  v_base_slug := COALESCE(
    NULLIF(trim(p_slug), ''),
    NULLIF(trim(BOTH '-' FROM regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g')), '')
  );
  IF v_base_slug IS NULL
     OR char_length(v_base_slug) > 100
     OR v_base_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
    RAISE EXCEPTION 'invalid_name' USING ERRCODE = '22023';
  END IF;

  v_slug := v_base_slug;
  WHILE EXISTS (SELECT 1 FROM public.vendors WHERE slug = v_slug) LOOP
    v_suffix := v_suffix + 1;
    v_slug := left(v_base_slug, 100 - char_length(v_suffix::text) - 1) || '-' || v_suffix;
  END LOOP;

  INSERT INTO public.vendors (
    owner_id, name, slug, description, business_type, logo_url, cover_url, kind, status
  )
  VALUES (
    v_user, v_name, v_slug,
    NULLIF(btrim(p_description), ''), NULLIF(btrim(p_business_type), ''),
    NULLIF(btrim(p_logo_url), ''), NULLIF(btrim(p_cover_url), ''),
    'event', 'pending'
  )
  RETURNING id INTO v_vendor_id;

  INSERT INTO public.vendor_onboarding_profiles (
    vendor_id, legal_business_name, registration_number,
    contact_name, contact_email, contact_phone, business_address, status
  )
  VALUES (
    v_vendor_id,
    COALESCE(NULLIF(btrim(p_legal_business_name), ''), v_name),
    NULLIF(btrim(p_registration_number), ''),
    NULLIF(btrim(p_contact_name), ''),
    COALESCE(NULLIF(lower(btrim(p_contact_email)), ''), v_user_email),
    NULLIF(btrim(p_contact_phone), ''),
    NULLIF(btrim(p_business_address), ''),
    'submitted'
  );

  INSERT INTO public.media_assets (vendor_id, outlet_id, product_id, url, alt_text, media_type, sort_order)
  SELECT
    v_vendor_id,
    NULL,
    NULL,
    item.value #>> '{}',
    v_name || ' gallery image ' || item.ordinality,
    'image',
    (item.ordinality - 1)::integer
  FROM jsonb_array_elements(p_gallery) WITH ORDINALITY AS item(value, ordinality);

  RETURN jsonb_build_object(
    'vendor_id', v_vendor_id,
    'slug', v_slug,
    'kind', 'event',
    'status', 'pending',
    'outlet_id', NULL
  );
END;
$function$;

REVOKE ALL ON FUNCTION app_private.register_event_vendor_application(
  text, text, text, text, text, text, text, text, text, text, text, text, jsonb
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION app_private.register_event_vendor_application(
  text, text, text, text, text, text, text, text, text, text, text, text, jsonb
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.register_event_vendor_application(
  p_name text,
  p_slug text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_business_type text DEFAULT NULL,
  p_legal_business_name text DEFAULT NULL,
  p_registration_number text DEFAULT NULL,
  p_contact_name text DEFAULT NULL,
  p_contact_email text DEFAULT NULL,
  p_contact_phone text DEFAULT NULL,
  p_business_address text DEFAULT NULL,
  p_logo_url text DEFAULT NULL,
  p_cover_url text DEFAULT NULL,
  p_gallery jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT app_private.register_event_vendor_application(
    p_name,
    p_slug,
    p_description,
    p_business_type,
    p_legal_business_name,
    p_registration_number,
    p_contact_name,
    p_contact_email,
    p_contact_phone,
    p_business_address,
    p_logo_url,
    p_cover_url,
    p_gallery
  );
$function$;

REVOKE ALL ON FUNCTION public.register_event_vendor_application(
  text, text, text, text, text, text, text, text, text, text, text, text, jsonb
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.register_event_vendor_application(
  text, text, text, text, text, text, text, text, text, text, text, text, jsonb
) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
