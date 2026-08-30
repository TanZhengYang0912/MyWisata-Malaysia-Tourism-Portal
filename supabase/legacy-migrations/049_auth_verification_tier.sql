-- Auth verification state and trusted synchronization.
-- New password users remain unverified until Supabase Auth confirms the email.

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_tier_check;

ALTER TABLE public.users
  ALTER COLUMN tier SET DEFAULT 'email_unverified';

ALTER TABLE public.users
  ADD CONSTRAINT users_tier_check
  CHECK (tier IN ('email_unverified','email_verified','phone_verified','profile_complete','kyc_verified'));

-- Keep direct demo/seed inserts compatible with the ladder. Auth-created rows
-- pass an explicit tier and are not upgraded by this convenience trigger.
CREATE OR REPLACE FUNCTION public.derive_initial_user_tier()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tier = 'email_unverified' AND NEW.email_verified_at IS NOT NULL THEN
    IF NEW.profile_completed_at IS NOT NULL AND NEW.phone_verified_at IS NOT NULL THEN
      NEW.tier := 'profile_complete';
    ELSIF NEW.phone_verified_at IS NOT NULL THEN
      NEW.tier := 'phone_verified';
    ELSE
      NEW.tier := 'email_verified';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS derive_initial_user_tier ON public.users;
CREATE TRIGGER derive_initial_user_tier
  BEFORE INSERT ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.derive_initial_user_tier();

CREATE OR REPLACE FUNCTION public.tier_rank(p_tier TEXT) RETURNS INT
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE p_tier
    WHEN 'email_unverified'  THEN 0
    WHEN 'email_verified'    THEN 1
    WHEN 'phone_verified'    THEN 2
    WHEN 'profile_complete'  THEN 3
    WHEN 'kyc_verified'      THEN 4
    ELSE -1
  END;
$$;

-- Existing rows are trusted legacy/demo rows. Preserve their current tier and
-- record Auth confirmation where it is available; never demote a higher tier.
UPDATE public.users u
   SET email = COALESCE(a.email, u.email),
       email_verified_at = COALESCE(u.email_verified_at, a.email_confirmed_at, u.created_at),
       tier = CASE
         WHEN public.tier_rank(u.tier) >= 1 THEN u.tier
         ELSE 'email_verified'
       END,
       updated_at = now()
  FROM auth.users a
 WHERE a.id = u.id;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM set_config('app.allow_verification_write', 'on', true);

  INSERT INTO public.users (id, email, email_verified_at, tier, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.email_confirmed_at,
    CASE WHEN NEW.email_confirmed_at IS NULL THEN 'email_unverified' ELSE 'email_verified' END,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    email_verified_at = COALESCE(public.users.email_verified_at, EXCLUDED.email_verified_at),
    tier = CASE
      WHEN public.tier_rank(public.users.tier) >= 1 THEN public.users.tier
      WHEN EXCLUDED.email_verified_at IS NOT NULL THEN 'email_verified'
      ELSE 'email_unverified'
    END,
    updated_at = now();

  INSERT INTO public.wallets (user_id) VALUES (NEW.id)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.user_roles (user_id, role_id)
  SELECT NEW.id, r.id FROM public.roles r WHERE r.name = 'customer'
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_auth_user_verification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL THEN
    PERFORM set_config('app.allow_verification_write', 'on', true);
    UPDATE public.users
       SET email = NEW.email,
           email_verified_at = COALESCE(email_verified_at, NEW.email_confirmed_at),
           tier = CASE WHEN public.tier_rank(tier) < 1 THEN 'email_verified' ELSE tier END,
           updated_at = now()
     WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

DROP TRIGGER IF EXISTS on_auth_user_verification_changed ON auth.users;
CREATE TRIGGER on_auth_user_verification_changed
  AFTER UPDATE OF email, email_confirmed_at ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_auth_user_verification();

-- Browser users may update profile fields, but cannot forge verification state.
CREATE OR REPLACE FUNCTION public.protect_verification_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  IF current_setting('app.allow_verification_write', true) = 'on'
     OR is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NEW.email IS DISTINCT FROM OLD.email
     OR NEW.tier IS DISTINCT FROM OLD.tier
     OR NEW.email_verified_at IS DISTINCT FROM OLD.email_verified_at
     OR NEW.kyc_status IS DISTINCT FROM OLD.kyc_status
     OR NEW.phone_verified_at IS DISTINCT FROM OLD.phone_verified_at THEN
    RAISE EXCEPTION 'verification_fields_are_server_managed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_user_verification_fields ON public.users;
CREATE TRIGGER protect_user_verification_fields
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.protect_verification_fields();

-- Phone verification cannot be used to skip email verification.
CREATE OR REPLACE FUNCTION public.promote_to_phone_verified(
  p_user_id UUID,
  p_phone TEXT
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE v_tier TEXT;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id AND NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT tier INTO v_tier FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'user_not_found: %', p_user_id; END IF;
  IF public.tier_rank(v_tier) < public.tier_rank('email_verified') THEN
    RAISE EXCEPTION 'tier_insufficient: email_verified required';
  END IF;

  PERFORM set_config('app.allow_verification_write', 'on', true);
  UPDATE public.users
     SET tier = CASE WHEN public.tier_rank(tier) < public.tier_rank('phone_verified') THEN 'phone_verified' ELSE tier END,
         phone = p_phone,
         phone_verified_at = now(),
         updated_at = now()
   WHERE id = p_user_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.promote_to_phone_verified(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.clear_phone_verification(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id AND NOT is_admin(auth.uid()) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  PERFORM set_config('app.allow_verification_write', 'on', true);
  UPDATE public.users SET phone_verified_at = NULL, updated_at = now() WHERE id = p_user_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.clear_phone_verification(UUID) TO authenticated;

-- Country is part of the authoritative profile-complete requirement.
CREATE OR REPLACE FUNCTION public.promote_to_profile_complete(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE v_row RECORD;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id AND NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  SELECT tier, full_name, city, country, avatar_url, bio INTO v_row
    FROM public.users WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'user_not_found: %', p_user_id; END IF;
  IF public.tier_rank(v_row.tier) < public.tier_rank('phone_verified') THEN
    RAISE EXCEPTION 'tier_insufficient: phone_verified required';
  END IF;
  IF public.tier_rank(v_row.tier) >= public.tier_rank('profile_complete') THEN RETURN; END IF;
  IF v_row.full_name IS NULL OR trim(v_row.full_name) = '' THEN RAISE EXCEPTION 'profile_incomplete: full_name required'; END IF;
  IF v_row.city IS NULL OR trim(v_row.city) = '' THEN RAISE EXCEPTION 'profile_incomplete: city required'; END IF;
  IF v_row.country IS NULL OR trim(v_row.country) = '' THEN RAISE EXCEPTION 'profile_incomplete: country required'; END IF;
  IF v_row.avatar_url IS NULL OR trim(v_row.avatar_url) = '' THEN RAISE EXCEPTION 'profile_incomplete: avatar_url required'; END IF;
  IF v_row.bio IS NULL OR trim(v_row.bio) = '' THEN RAISE EXCEPTION 'profile_incomplete: bio required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.preference_survey_responses WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'profile_incomplete: preference survey required';
  END IF;
  PERFORM set_config('app.allow_verification_write', 'on', true);
  UPDATE public.users SET tier = 'profile_complete', profile_completed_at = COALESCE(profile_completed_at, now()), updated_at = now()
   WHERE id = p_user_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.promote_to_profile_complete(UUID) TO authenticated;

-- Checkout and booking writes are allowed only after Twilio phone verification.
-- This closes the gap for the current demo checkout, which writes through the
-- browser commerce client instead of the Stripe API route.
DROP POLICY IF EXISTS orders_insert_own ON public.orders;
CREATE POLICY orders_insert_own ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.users u
       WHERE u.id = auth.uid() AND u.phone_verified_at IS NOT NULL
    )
  );

DROP POLICY IF EXISTS bookings_insert_own ON public.bookings;
CREATE POLICY bookings_insert_own ON public.bookings
  FOR INSERT TO authenticated
  WITH CHECK (
    customer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.users u
       WHERE u.id = auth.uid() AND u.phone_verified_at IS NOT NULL
    )
  );

-- KYC requires two image files (front and back) for every document type,
-- including passports. Keep the database boundary aligned with the route.
UPDATE storage.buckets
   SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
 WHERE id = 'kyc-documents';

-- Keep the historical table constraint compatible with already-approved PDF
-- evidence. The replacement finalize RPC below rejects PDF for every new
-- submission, so old records remain readable without blocking deployment.

CREATE OR REPLACE FUNCTION public.finalize_kyc_submission(
  p_submission_id UUID,
  p_front_path TEXT,
  p_back_path TEXT
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_pos INT;
  v_prefix TEXT;
  v_front_mime TEXT;
  v_back_mime TEXT;
  v_front_token TEXT;
  v_back_token TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  PERFORM 1 FROM public.kyc_submissions
   WHERE id = p_submission_id AND user_id = auth.uid() AND status = 'draft' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'draft_not_found'; END IF;

  v_prefix := auth.uid()::text || '/' || p_submission_id::text || '/';
  SELECT (regexp_match(p_front_path, '^' || v_prefix || '([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/front\.(jpg|jpeg|png|webp)$'))[1] INTO v_front_token;
  SELECT (regexp_match(p_back_path, '^' || v_prefix || '([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/back\.(jpg|jpeg|png|webp)$'))[1] INTO v_back_token;
  IF p_front_path = p_back_path OR v_front_token IS NULL OR v_back_token IS NULL OR v_front_token <> v_back_token THEN
    RAISE EXCEPTION 'invalid_document_path';
  END IF;

  SELECT COALESCE(metadata->>'mimetype', CASE WHEN name ~* '\.webp$' THEN 'image/webp' WHEN name ~* '\.png$' THEN 'image/png' ELSE 'image/jpeg' END)
    INTO v_front_mime FROM storage.objects WHERE bucket_id = 'kyc-documents' AND name = p_front_path;
  SELECT COALESCE(metadata->>'mimetype', CASE WHEN name ~* '\.webp$' THEN 'image/webp' WHEN name ~* '\.png$' THEN 'image/png' ELSE 'image/jpeg' END)
    INTO v_back_mime FROM storage.objects WHERE bucket_id = 'kyc-documents' AND name = p_back_path;
  IF v_front_mime IS NULL OR v_back_mime IS NULL THEN RAISE EXCEPTION 'documents_missing'; END IF;
  IF v_front_mime NOT IN ('image/jpeg', 'image/png', 'image/webp') OR v_back_mime NOT IN ('image/jpeg', 'image/png', 'image/webp') THEN
    RAISE EXCEPTION 'invalid_document_mime';
  END IF;

  INSERT INTO public.kyc_submission_documents (submission_id, side, storage_path, mime_type)
  VALUES (p_submission_id, 'front', p_front_path, v_front_mime), (p_submission_id, 'back', p_back_path, v_back_mime);
  SELECT COALESCE(MAX(queue_position), 0) + 1 INTO v_pos FROM public.kyc_submissions WHERE status = 'pending';
  UPDATE public.kyc_submissions SET status = 'pending', queue_position = v_pos WHERE id = p_submission_id;
  UPDATE public.users SET kyc_status = 'pending', updated_at = now() WHERE id = auth.uid();
  RETURN p_submission_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.finalize_kyc_submission(UUID, TEXT, TEXT) TO authenticated;
