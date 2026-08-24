-- Amend the KYC model: kyc_submissions is the mutable current snapshot while
-- kyc_review_events and the captured legal identity are immutable evidence.

ALTER TABLE public.kyc_submissions
  ADD COLUMN IF NOT EXISTS legal_name_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS email_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS phone_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS identity_snapshot_captured_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

UPDATE public.kyc_submissions submission
   SET legal_name_snapshot = COALESCE(submission.legal_name_snapshot, profile.full_name),
       email_snapshot = COALESCE(submission.email_snapshot, profile.email),
       phone_snapshot = COALESCE(submission.phone_snapshot, profile.phone),
       identity_snapshot_captured_at = COALESCE(submission.identity_snapshot_captured_at, submission.created_at)
  FROM public.users profile
 WHERE profile.id = submission.user_id
   AND submission.identity_snapshot_captured_at IS NULL;

CREATE OR REPLACE FUNCTION public.protect_kyc_identity_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.legal_name_snapshot IS DISTINCT FROM OLD.legal_name_snapshot
     OR NEW.email_snapshot IS DISTINCT FROM OLD.email_snapshot
     OR NEW.phone_snapshot IS DISTINCT FROM OLD.phone_snapshot
     OR NEW.identity_snapshot_captured_at IS DISTINCT FROM OLD.identity_snapshot_captured_at THEN
    RAISE EXCEPTION 'kyc_identity_snapshot_immutable';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_kyc_identity_snapshot() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS protect_kyc_identity_snapshot ON public.kyc_submissions;
CREATE TRIGGER protect_kyc_identity_snapshot
  BEFORE UPDATE ON public.kyc_submissions
  FOR EACH ROW EXECUTE FUNCTION public.protect_kyc_identity_snapshot();

CREATE TABLE public.kyc_review_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.kyc_submissions(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('approve', 'reject', 'request_info')),
  actor_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  actor_role TEXT NOT NULL,
  reason_category TEXT,
  internal_note TEXT,
  customer_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX kyc_review_events_submission_created_idx
  ON public.kyc_review_events(submission_id, created_at, id);

ALTER TABLE public.kyc_review_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.kyc_review_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.kyc_review_events TO service_role;

CREATE OR REPLACE FUNCTION public.kyc_review_events_are_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'kyc_review_events_append_only';
END;
$$;

REVOKE ALL ON FUNCTION public.kyc_review_events_are_append_only() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER kyc_review_events_append_only
  BEFORE UPDATE OR DELETE ON public.kyc_review_events
  FOR EACH ROW EXECUTE FUNCTION public.kyc_review_events_are_append_only();

-- Historical rows only provide a best-effort snapshot. New decisions below
-- always record the actual actor role and customer message atomically.
INSERT INTO public.kyc_review_events(
  submission_id, user_id, from_status, to_status, action, actor_id, actor_role,
  reason_category, internal_note, customer_message, created_at
)
SELECT
  submission.id,
  submission.user_id,
  'pending',
  submission.status,
  CASE submission.status WHEN 'approved' THEN 'approve' WHEN 'rejected' THEN 'reject' ELSE 'request_info' END,
  submission.reviewer_id,
  'legacy_snapshot',
  submission.review_reason_code,
  submission.review_reason_detail,
  CASE submission.status
    WHEN 'approved' THEN 'Your identity verification is complete.'
    WHEN 'rejected' THEN 'Your KYC submission was rejected. Review the reason and submit new evidence if needed.'
    ELSE 'Additional KYC information is required. Review the request and submit new evidence.'
  END,
  COALESCE(submission.reviewed_at, submission.created_at)
FROM public.kyc_submissions submission
WHERE submission.status IN ('approved', 'rejected', 'info_requested')
  AND NOT EXISTS (
    SELECT 1 FROM public.kyc_review_events event WHERE event.submission_id = submission.id
  );

DROP FUNCTION IF EXISTS public.begin_kyc_submission(UUID, TEXT, TEXT, TEXT);
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
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
  IF NOT COALESCE(p_ocr_consent, FALSE) THEN RAISE EXCEPTION 'ocr_consent_required'; END IF;
  IF p_ic_hash_version <> 'hmac_sha256_v1' OR p_ic_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_ic_fingerprint';
  END IF;
  IF p_doc_type NOT IN ('national_id', 'passport', 'driving_license') THEN
    RAISE EXCEPTION 'invalid_document_type';
  END IF;

  SELECT * INTO v_user FROM public.users WHERE id = p_user_id FOR SHARE;
  IF NOT FOUND OR public.tier_rank(v_user.tier) < public.tier_rank('profile_complete') THEN
    RAISE EXCEPTION 'tier_insufficient';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('kyc_submit:' || p_user_id::text));
  UPDATE public.kyc_submissions
     SET status = 'superseded', evidence_retention_started_at = now()
   WHERE user_id = p_user_id AND status = 'info_requested';
  IF EXISTS (
    SELECT 1 FROM public.kyc_submissions
     WHERE user_id = p_user_id AND status IN ('draft', 'pending')
  ) THEN
    RAISE EXCEPTION 'active_submission_exists';
  END IF;

  INSERT INTO public.kyc_submissions(
    user_id, ic_hash, ic_hash_version, document_type, status, ocr_consent_at,
    legal_name_snapshot, email_snapshot, phone_snapshot, identity_snapshot_captured_at
  ) VALUES (
    p_user_id, p_ic_hash, p_ic_hash_version, p_doc_type, 'draft', now(),
    v_user.full_name, v_user.email, v_user.phone, now()
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_kyc_submission(UUID, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_kyc_submission(UUID, TEXT, TEXT, TEXT, BOOLEAN) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_kyc_submission(
  p_submission_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_submission public.kyc_submissions%ROWTYPE;
  v_can_decide BOOLEAN;
BEGIN
  IF v_actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF NOT public.can_review_kyc(v_actor_id) THEN RAISE EXCEPTION 'kyc_reviewer_required'; END IF;

  SELECT * INTO v_submission
    FROM public.kyc_submissions
   WHERE id = p_submission_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'kyc_not_found'; END IF;

  IF v_submission.status = 'pending' THEN
    UPDATE public.kyc_submissions
       SET assigned_to = auth.uid(), claimed_at = now()
     WHERE id = p_submission_id
       AND assigned_to IS NULL;
    SELECT * INTO v_submission FROM public.kyc_submissions WHERE id = p_submission_id;
  END IF;

  v_can_decide := v_submission.status = 'pending'
    AND (v_submission.assigned_to = v_actor_id OR public.is_super_admin(v_actor_id));

  RETURN jsonb_build_object(
    'assignedTo', v_submission.assigned_to,
    'claimedAt', v_submission.claimed_at,
    'isAssignedToActor', v_submission.assigned_to = v_actor_id,
    'canDecide', v_can_decide
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_kyc_submission(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_kyc_submission(UUID) TO authenticated;

DROP FUNCTION IF EXISTS public.admin_review_kyc(UUID, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.admin_review_kyc(UUID, TEXT, TEXT);
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
BEGIN
  IF p_action IS NULL OR p_action NOT IN ('approve', 'reject', 'request_info') THEN RAISE EXCEPTION 'invalid_action'; END IF;
  IF NOT public.can_review_kyc(auth.uid()) THEN RAISE EXCEPTION 'admin_required'; END IF;
  IF auth.uid() = p_user_id THEN RAISE EXCEPTION 'self_dealing'; END IF;
  IF p_action = 'approve' AND (p_reason_code IS NOT NULL OR p_reason_detail IS NOT NULL) THEN RAISE EXCEPTION 'reason_not_allowed'; END IF;
  IF p_action <> 'approve' AND (
    p_reason_code IS NULL OR p_reason_code NOT IN (
      'document_unreadable', 'document_incomplete', 'document_mismatch',
      'document_expired', 'document_suspected_tampering', 'other'
    )
  ) THEN RAISE EXCEPTION 'invalid_reason_code'; END IF;
  IF p_action = 'request_info' AND p_reason_code = 'document_suspected_tampering' THEN RAISE EXCEPTION 'reason_code_not_allowed'; END IF;
  IF p_reason_code <> 'other' AND p_reason_detail IS NOT NULL THEN RAISE EXCEPTION 'reason_detail_not_allowed'; END IF;
  IF p_reason_code = 'other' AND length(btrim(COALESCE(p_reason_detail, ''))) < 10 THEN RAISE EXCEPTION 'reason_detail_too_short'; END IF;

  SELECT * INTO v_submission
    FROM public.kyc_submissions
   WHERE id = p_submission_id
     AND user_id = p_user_id
     AND status = 'pending'
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'kyc_not_active_or_not_found'; END IF;
  IF NOT public.is_super_admin(auth.uid()) AND v_submission.assigned_to IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'kyc_not_assigned';
  END IF;

  SELECT role.name INTO v_actor_role
    FROM public.user_roles assignment
    JOIN public.roles role ON role.id = assignment.role_id
   WHERE assignment.user_id = auth.uid()
     AND role.name IN ('admin', 'super_admin')
   ORDER BY CASE role.name WHEN 'super_admin' THEN 0 ELSE 1 END
   LIMIT 1;
  IF v_actor_role IS NULL THEN RAISE EXCEPTION 'admin_required'; END IF;

  v_status := CASE p_action WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' ELSE 'info_requested' END;
  v_customer_message := CASE p_action
    WHEN 'approve' THEN 'Your identity verification is complete.'
    WHEN 'reject' THEN 'Your KYC submission was rejected. Review the reason and submit new evidence if needed.'
    ELSE 'Additional KYC information is required. Review the request and submit new evidence.'
  END;

  UPDATE public.kyc_submissions
     SET status = v_status,
         reviewed_at = now(),
         reviewer_id = auth.uid(),
         evidence_retention_started_at = CASE WHEN p_action = 'reject' THEN now() ELSE evidence_retention_started_at END,
         review_reason_code = CASE WHEN p_action = 'approve' THEN NULL ELSE p_reason_code END,
         review_reason_detail = CASE WHEN p_action = 'approve' THEN NULL ELSE NULLIF(btrim(p_reason_detail), '') END
   WHERE id = p_submission_id;

  IF p_action = 'approve' THEN
    PERFORM public.promote_to_kyc_verified(p_user_id);
    PERFORM public.gen_affiliate_code(p_user_id);
  ELSIF p_action = 'reject' THEN
    UPDATE public.users SET kyc_status = 'rejected', updated_at = now() WHERE id = p_user_id;
  ELSE
    UPDATE public.users SET kyc_status = 'pending', updated_at = now() WHERE id = p_user_id;
  END IF;

  INSERT INTO public.kyc_review_events(
    submission_id, user_id, from_status, to_status, action, actor_id, actor_role,
    reason_category, internal_note, customer_message
  ) VALUES (
    p_submission_id, p_user_id, v_submission.status, v_status, p_action, auth.uid(), v_actor_role,
    CASE WHEN p_action = 'approve' THEN NULL ELSE p_reason_code END,
    CASE WHEN p_action = 'approve' THEN NULL ELSE NULLIF(btrim(p_reason_detail), '') END,
    v_customer_message
  );

  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, after_data, note)
  VALUES (
    auth.uid(), 'kyc.' || p_action, 'kyc_submission', p_submission_id,
    jsonb_build_object('submission_id', p_submission_id, 'reason_code', CASE WHEN p_action = 'approve' THEN NULL ELSE p_reason_code END),
    CASE WHEN p_reason_code = 'other' THEN NULLIF(btrim(p_reason_detail), '') ELSE NULL END
  );

  INSERT INTO public.notifications(user_id, type, title, body, link)
  VALUES (
    p_user_id,
    'kyc_' || p_action,
    CASE p_action WHEN 'approve' THEN 'KYC verification approved' WHEN 'reject' THEN 'KYC submission rejected' ELSE 'Additional KYC information needed' END,
    v_customer_message,
    '/customer/kyc'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_review_kyc(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_kyc(UUID, UUID, TEXT, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
