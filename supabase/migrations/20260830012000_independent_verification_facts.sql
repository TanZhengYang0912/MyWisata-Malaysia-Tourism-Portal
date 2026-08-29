-- Phone, Profile, and KYC are independent verification facts. The legacy tier
-- remains display-only metadata and is recomputed conservatively: it reports
-- only the longest contiguous legacy ladder actually supported by the facts.

CREATE OR REPLACE FUNCTION public.recompute_compatibility_tier(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tier TEXT;
BEGIN
  SELECT CASE
    WHEN user_row.email_verified_at IS NULL THEN 'email_unverified'
    WHEN user_row.phone_verified_at IS NOT NULL
     AND user_row.profile_completed_at IS NOT NULL
     AND user_row.kyc_status = 'approved' THEN 'kyc_verified'
    WHEN user_row.phone_verified_at IS NOT NULL
     AND user_row.profile_completed_at IS NOT NULL THEN 'profile_complete'
    WHEN user_row.phone_verified_at IS NOT NULL THEN 'phone_verified'
    ELSE 'email_verified'
  END
  INTO v_tier
  FROM public.users AS user_row
  WHERE user_row.id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found: %', p_user_id;
  END IF;

  PERFORM set_config('app.allow_verification_write', 'on', true);
  UPDATE public.users
     SET tier = v_tier,
         updated_at = now()
   WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.recompute_compatibility_tier(UUID)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.promote_to_profile_complete(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.users%ROWTYPE;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT *
    INTO v_row
    FROM public.users
   WHERE id = p_user_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found: %', p_user_id;
  END IF;

  IF char_length(btrim(COALESCE(v_row.full_name, ''))) < 2 THEN
    RAISE EXCEPTION 'profile_incomplete: full_name required';
  END IF;
  IF btrim(COALESCE(v_row.city, '')) = '' THEN
    RAISE EXCEPTION 'profile_incomplete: city required';
  END IF;
  IF btrim(COALESCE(v_row.country, '')) = '' THEN
    RAISE EXCEPTION 'profile_incomplete: country required';
  END IF;
  IF btrim(COALESCE(v_row.avatar_url, '')) = '' THEN
    RAISE EXCEPTION 'profile_incomplete: avatar_url required';
  END IF;
  IF char_length(btrim(COALESCE(v_row.bio, ''))) NOT BETWEEN 30 AND 200 THEN
    RAISE EXCEPTION 'profile_incomplete: moderated bio required';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM public.preference_survey_responses AS response
     WHERE response.user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'profile_incomplete: preference survey required';
  END IF;

  PERFORM set_config('app.allow_verification_write', 'on', true);
  UPDATE public.users
     SET profile_completed_at = COALESCE(profile_completed_at, now()),
         updated_at = now()
   WHERE id = p_user_id;

  PERFORM public.recompute_compatibility_tier(p_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.promote_to_profile_complete(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promote_to_profile_complete(UUID) TO authenticated;

-- Historical PDF evidence remains valid, while new submissions retain the
-- route's JPEG/PNG/WebP document contract.
ALTER TABLE public.kyc_submission_documents
  DROP CONSTRAINT IF EXISTS kyc_submission_documents_mime_type_check;
ALTER TABLE public.kyc_submission_documents
  ADD CONSTRAINT kyc_submission_documents_mime_type_check
  CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf'));

DROP FUNCTION IF EXISTS public.begin_kyc_submission(UUID, TEXT, TEXT, TEXT, BOOLEAN);
CREATE OR REPLACE FUNCTION public.begin_kyc_submission(
  p_user_id UUID,
  p_ic_hash TEXT,
  p_ic_hash_version TEXT,
  p_doc_type TEXT,
  p_ocr_consent BOOLEAN
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id UUID;
  v_user public.users%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;
  IF NOT COALESCE(p_ocr_consent, FALSE) THEN
    RAISE EXCEPTION 'ocr_consent_required';
  END IF;
  IF p_ic_hash_version <> 'hmac_sha256_v1' OR p_ic_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_ic_fingerprint';
  END IF;
  IF p_doc_type NOT IN ('national_id', 'passport', 'driving_license') THEN
    RAISE EXCEPTION 'invalid_document_type';
  END IF;

  SELECT *
    INTO v_user
    FROM public.users
   WHERE id = p_user_id
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found: %', p_user_id;
  END IF;
  IF v_user.email_verified_at IS NULL THEN
    RAISE EXCEPTION 'email_verification_required';
  END IF;
  IF v_user.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'account_restricted';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('kyc_submit:' || p_user_id::text));
  UPDATE public.kyc_submissions
     SET status = 'superseded',
         evidence_retention_started_at = now()
   WHERE user_id = p_user_id
     AND status = 'info_requested';

  IF EXISTS (
    SELECT 1
      FROM public.kyc_submissions
     WHERE user_id = p_user_id
       AND status IN ('draft', 'pending')
  ) THEN
    RAISE EXCEPTION 'active_submission_exists';
  END IF;

  INSERT INTO public.kyc_submissions(
    user_id,
    ic_hash,
    ic_hash_version,
    document_type,
    status,
    ocr_consent_at,
    legal_name_snapshot,
    email_snapshot,
    phone_snapshot,
    identity_snapshot_captured_at
  ) VALUES (
    p_user_id,
    p_ic_hash,
    p_ic_hash_version,
    p_doc_type,
    'draft',
    now(),
    v_user.full_name,
    v_user.email,
    v_user.phone,
    now()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_kyc_submission(UUID, TEXT, TEXT, TEXT, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_kyc_submission(UUID, TEXT, TEXT, TEXT, BOOLEAN)
  TO service_role;

CREATE OR REPLACE FUNCTION public.finalize_kyc_submission(
  p_submission_id UUID,
  p_front_path TEXT,
  p_back_path TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pos INT;
  v_prefix TEXT;
  v_front_mime TEXT;
  v_back_mime TEXT;
  v_front_token TEXT;
  v_back_token TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  PERFORM 1
    FROM public.kyc_submissions
   WHERE id = p_submission_id
     AND user_id = auth.uid()
     AND status = 'draft'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'draft_not_found';
  END IF;

  v_prefix := auth.uid()::text || '/' || p_submission_id::text || '/';
  SELECT (regexp_match(
    p_front_path,
    '^' || v_prefix || '([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/front\.(jpg|jpeg|png|webp)$'
  ))[1] INTO v_front_token;
  SELECT (regexp_match(
    p_back_path,
    '^' || v_prefix || '([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/back\.(jpg|jpeg|png|webp)$'
  ))[1] INTO v_back_token;

  IF p_front_path = p_back_path
     OR v_front_token IS NULL
     OR v_back_token IS NULL
     OR v_front_token <> v_back_token THEN
    RAISE EXCEPTION 'invalid_document_path';
  END IF;

  SELECT COALESCE(
    metadata->>'mimetype',
    CASE
      WHEN name ~* '\.webp$' THEN 'image/webp'
      WHEN name ~* '\.png$' THEN 'image/png'
      ELSE 'image/jpeg'
    END
  )
  INTO v_front_mime
  FROM storage.objects
  WHERE bucket_id = 'kyc-documents'
    AND name = p_front_path;

  SELECT COALESCE(
    metadata->>'mimetype',
    CASE
      WHEN name ~* '\.webp$' THEN 'image/webp'
      WHEN name ~* '\.png$' THEN 'image/png'
      ELSE 'image/jpeg'
    END
  )
  INTO v_back_mime
  FROM storage.objects
  WHERE bucket_id = 'kyc-documents'
    AND name = p_back_path;

  IF v_front_mime IS NULL OR v_back_mime IS NULL THEN
    RAISE EXCEPTION 'documents_missing';
  END IF;
  IF v_front_mime NOT IN ('image/jpeg', 'image/png', 'image/webp')
     OR v_back_mime NOT IN ('image/jpeg', 'image/png', 'image/webp') THEN
    RAISE EXCEPTION 'invalid_document_mime';
  END IF;

  INSERT INTO public.kyc_submission_documents(
    submission_id,
    side,
    storage_path,
    mime_type
  ) VALUES
    (p_submission_id, 'front', p_front_path, v_front_mime),
    (p_submission_id, 'back', p_back_path, v_back_mime);

  SELECT COALESCE(MAX(queue_position), 0) + 1
    INTO v_pos
    FROM public.kyc_submissions
   WHERE status = 'pending';

  UPDATE public.kyc_submissions
     SET status = 'pending',
         queue_position = v_pos
   WHERE id = p_submission_id;

  PERFORM set_config('app.allow_verification_write', 'on', true);
  UPDATE public.users
     SET kyc_status = 'pending',
         updated_at = now()
   WHERE id = auth.uid();
  PERFORM public.recompute_compatibility_tier(auth.uid());

  RETURN p_submission_id;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_kyc_submission(UUID, TEXT, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_kyc_submission(UUID, TEXT, TEXT)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.abandon_kyc_submission(p_submission_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  PERFORM 1
    FROM public.kyc_submissions
   WHERE id = p_submission_id
     AND user_id = auth.uid()
     AND status = 'draft'
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  DELETE FROM public.kyc_ocr_results
   WHERE submission_id = p_submission_id;
  DELETE FROM public.kyc_submissions
   WHERE id = p_submission_id
     AND user_id = auth.uid()
     AND status = 'draft';

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.abandon_kyc_submission(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.abandon_kyc_submission(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.promote_to_kyc_verified(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.can_review_kyc(auth.uid()) THEN
    RAISE EXCEPTION 'admin_required';
  END IF;
  IF auth.uid() = p_user_id THEN
    RAISE EXCEPTION 'self_dealing';
  END IF;

  PERFORM 1
    FROM public.users
   WHERE id = p_user_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found: %', p_user_id;
  END IF;

  PERFORM set_config('app.allow_verification_write', 'on', true);
  UPDATE public.users
     SET kyc_status = 'approved',
         updated_at = now()
   WHERE id = p_user_id;
  PERFORM public.recompute_compatibility_tier(p_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.promote_to_kyc_verified(UUID)
  FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.admin_review_kyc(UUID, UUID, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.admin_review_kyc(
  p_submission_id UUID,
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
  v_submission public.kyc_submissions%ROWTYPE;
  v_status TEXT;
  v_actor_role TEXT;
  v_customer_message TEXT;
  v_reviewed_at TIMESTAMPTZ := now();
BEGIN
  IF p_action IS NULL OR p_action NOT IN ('approve', 'reject', 'request_info') THEN
    RAISE EXCEPTION 'invalid_action';
  END IF;
  IF NOT public.can_review_kyc(auth.uid()) THEN
    RAISE EXCEPTION 'admin_required';
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
     AND char_length(btrim(COALESCE(p_reason_detail, ''))) < 10 THEN
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
     AND role_row.name IN ('admin', 'super_admin')
   ORDER BY CASE role_row.name WHEN 'super_admin' THEN 0 ELSE 1 END
   LIMIT 1;
  IF v_actor_role IS NULL THEN
    RAISE EXCEPTION 'admin_required';
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
           ELSE NULLIF(btrim(p_reason_detail), '')
         END
   WHERE id = p_submission_id;

  IF p_action = 'approve' THEN
    PERFORM public.promote_to_kyc_verified(p_user_id);
  ELSE
    PERFORM set_config('app.allow_verification_write', 'on', true);
    UPDATE public.users
       SET kyc_status = CASE WHEN p_action = 'reject' THEN 'rejected' ELSE 'pending' END,
           updated_at = now()
     WHERE id = p_user_id;
    PERFORM public.recompute_compatibility_tier(p_user_id);
  END IF;

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
    CASE WHEN p_action = 'approve' THEN NULL ELSE NULLIF(btrim(p_reason_detail), '') END,
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
    CASE WHEN p_reason_code = 'other' THEN NULLIF(btrim(p_reason_detail), '') ELSE NULL END
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

REVOKE ALL ON FUNCTION public.admin_review_kyc(UUID, UUID, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_kyc(UUID, UUID, TEXT, TEXT, TEXT)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
