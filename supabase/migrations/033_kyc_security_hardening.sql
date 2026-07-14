-- Authoritative KYC security boundary.  Storage object bytes are deliberately
-- outside Postgres: service-role routes upload/delete them after the RPCs below.

ALTER TABLE kyc_submissions DROP CONSTRAINT IF EXISTS kyc_submissions_status_check;
ALTER TABLE kyc_submissions ADD CONSTRAINT kyc_submissions_status_check
  CHECK (status IN ('draft', 'pending', 'info_requested', 'approved', 'rejected', 'superseded'));
ALTER TABLE kyc_submissions ADD COLUMN IF NOT EXISTS ic_hash_version TEXT NOT NULL DEFAULT 'legacy_sha256';
ALTER TABLE kyc_submissions ADD COLUMN IF NOT EXISTS legacy_single_document BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE kyc_submissions ADD COLUMN IF NOT EXISTS review_reason_code TEXT;
ALTER TABLE kyc_submissions ADD COLUMN IF NOT EXISTS review_reason_detail TEXT;
ALTER TABLE kyc_submissions ADD COLUMN IF NOT EXISTS evidence_retention_started_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

ALTER TABLE kyc_submissions DROP CONSTRAINT IF EXISTS kyc_submissions_review_reason_code_check;
ALTER TABLE kyc_submissions ADD CONSTRAINT kyc_submissions_review_reason_code_check CHECK (
  review_reason_code IS NULL OR review_reason_code IN (
    'document_unreadable', 'document_incomplete', 'document_mismatch',
    'document_expired', 'document_suspected_tampering', 'other'
  )
);
ALTER TABLE kyc_submissions DROP CONSTRAINT IF EXISTS kyc_submissions_other_reason_detail_check;
ALTER TABLE kyc_submissions ADD CONSTRAINT kyc_submissions_other_reason_detail_check CHECK (
  review_reason_code <> 'other' OR length(btrim(COALESCE(review_reason_detail, ''))) >= 10
);
ALTER TABLE kyc_submissions DROP CONSTRAINT IF EXISTS kyc_submissions_info_reason_check;
ALTER TABLE kyc_submissions ADD CONSTRAINT kyc_submissions_info_reason_check CHECK (
  status <> 'info_requested' OR review_reason_code IS DISTINCT FROM 'document_suspected_tampering'
);

DROP INDEX IF EXISTS idx_kyc_one_active_per_user;
CREATE UNIQUE INDEX IF NOT EXISTS idx_kyc_one_active_or_draft_per_user
  ON kyc_submissions(user_id) WHERE status IN ('draft', 'pending', 'info_requested');

CREATE TABLE IF NOT EXISTS kyc_submission_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES kyc_submissions(id) ON DELETE RESTRICT,
  side TEXT NOT NULL CHECK (side IN ('front', 'back')),
  storage_path TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'application/pdf')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  purge_claimed_at TIMESTAMPTZ,
  UNIQUE (submission_id, side)
);
ALTER TABLE kyc_submission_documents ADD COLUMN IF NOT EXISTS purge_claimed_at TIMESTAMPTZ;
ALTER TABLE kyc_submission_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kyc_documents_no_client_read ON kyc_submission_documents;
REVOKE ALL ON TABLE kyc_submission_documents FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS kyc_insert_own ON kyc_submissions;
DROP POLICY IF EXISTS kyc_read_own_or_admin ON kyc_submissions;
REVOKE INSERT, UPDATE, DELETE ON TABLE kyc_submissions FROM PUBLIC, anon, authenticated;

-- The bucket remains private.  Service-role server routes are the only writers;
-- SQL functions only verify object existence and return paths to service routes.
DROP POLICY IF EXISTS kyc_doc_insert_own ON storage.objects;
DROP POLICY IF EXISTS kyc_doc_update_own ON storage.objects;
DROP POLICY IF EXISTS kyc_doc_select_own_or_admin ON storage.objects;
DROP POLICY IF EXISTS kyc_doc_delete_own ON storage.objects;

-- Legacy object URLs are not promoted to the dual-evidence model.  Every old
-- single-document record is marked legacy; active records require resubmission.
UPDATE kyc_submissions
   SET legacy_single_document = true,
       evidence_retention_started_at = CASE
         WHEN status IN ('approved', 'rejected') THEN COALESCE(evidence_retention_started_at, now())
         ELSE evidence_retention_started_at
       END
 WHERE ic_hash_version = 'legacy_sha256'
   AND NOT EXISTS (SELECT 1 FROM kyc_submission_documents d WHERE d.submission_id = kyc_submissions.id);
UPDATE kyc_submissions
   SET status = 'info_requested',
       review_reason_code = 'document_incomplete',
       review_reason_detail = NULL
 WHERE status IN ('pending', 'info_requested')
   AND legacy_single_document
   AND NOT EXISTS (SELECT 1 FROM kyc_submission_documents d WHERE d.submission_id = kyc_submissions.id);

DROP FUNCTION IF EXISTS begin_kyc_submission(TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION begin_kyc_submission(
  p_user_id UUID, p_ic_hash TEXT, p_ic_hash_version TEXT, p_doc_type TEXT
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id UUID;
BEGIN
  -- Only the server route possesses KYC_IC_HMAC_KEY.  It authenticates the
  -- browser user, calculates the HMAC, then calls this service-role RPC.
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
  IF p_ic_hash_version <> 'hmac_sha256_v1' OR p_ic_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_ic_fingerprint';
  END IF;
  IF p_doc_type NOT IN ('national_id', 'passport', 'driving_license') THEN RAISE EXCEPTION 'invalid_document_type'; END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_user_id AND tier_rank(tier) >= tier_rank('profile_complete')) THEN
    RAISE EXCEPTION 'tier_insufficient';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('kyc_submit:' || p_user_id::text));
  UPDATE kyc_submissions SET status = 'superseded', evidence_retention_started_at = now()
    WHERE user_id = p_user_id AND status = 'info_requested';
  IF EXISTS (SELECT 1 FROM kyc_submissions WHERE user_id = p_user_id AND status IN ('draft', 'pending')) THEN
    RAISE EXCEPTION 'active_submission_exists';
  END IF;
  INSERT INTO kyc_submissions (user_id, ic_hash, ic_hash_version, document_type, status)
  VALUES (p_user_id, p_ic_hash, p_ic_hash_version, p_doc_type, 'draft') RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION finalize_kyc_submission(
  p_submission_id UUID, p_front_path TEXT, p_back_path TEXT
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_pos INT; v_prefix TEXT; v_front_mime TEXT; v_back_mime TEXT; v_front_token TEXT; v_back_token TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  PERFORM 1 FROM kyc_submissions WHERE id = p_submission_id AND user_id = auth.uid() AND status = 'draft' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'draft_not_found'; END IF;
  v_prefix := auth.uid()::text || '/' || p_submission_id::text || '/';
  SELECT (regexp_match(p_front_path, '^' || v_prefix || '([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/front\.(jpg|jpeg|png|pdf)$'))[1] INTO v_front_token;
  SELECT (regexp_match(p_back_path, '^' || v_prefix || '([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/back\.(jpg|jpeg|png|pdf)$'))[1] INTO v_back_token;
  IF p_front_path = p_back_path OR v_front_token IS NULL OR v_back_token IS NULL OR v_front_token <> v_back_token THEN
    RAISE EXCEPTION 'invalid_document_path';
  END IF;
  SELECT COALESCE(metadata->>'mimetype', CASE WHEN name ~* '\.pdf$' THEN 'application/pdf' WHEN name ~* '\.png$' THEN 'image/png' ELSE 'image/jpeg' END)
    INTO v_front_mime FROM storage.objects WHERE bucket_id = 'kyc-documents' AND name = p_front_path;
  SELECT COALESCE(metadata->>'mimetype', CASE WHEN name ~* '\.pdf$' THEN 'application/pdf' WHEN name ~* '\.png$' THEN 'image/png' ELSE 'image/jpeg' END)
    INTO v_back_mime FROM storage.objects WHERE bucket_id = 'kyc-documents' AND name = p_back_path;
  IF v_front_mime IS NULL OR v_back_mime IS NULL THEN RAISE EXCEPTION 'documents_missing'; END IF;
  IF v_front_mime NOT IN ('image/jpeg', 'image/png', 'application/pdf') OR v_back_mime NOT IN ('image/jpeg', 'image/png', 'application/pdf') THEN
    RAISE EXCEPTION 'invalid_document_mime';
  END IF;
  INSERT INTO kyc_submission_documents (submission_id, side, storage_path, mime_type)
  VALUES (p_submission_id, 'front', p_front_path, v_front_mime), (p_submission_id, 'back', p_back_path, v_back_mime);
  SELECT COALESCE(MAX(queue_position), 0) + 1 INTO v_pos FROM kyc_submissions WHERE status = 'pending';
  UPDATE kyc_submissions SET status = 'pending', queue_position = v_pos WHERE id = p_submission_id;
  UPDATE users SET kyc_status = 'pending', updated_at = now() WHERE id = auth.uid();
  RETURN p_submission_id;
END;
$$;

CREATE OR REPLACE FUNCTION abandon_kyc_submission(p_submission_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  DELETE FROM kyc_submissions WHERE id = p_submission_id AND user_id = auth.uid() AND status = 'draft';
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION admin_review_kyc(
  p_user_id UUID, p_action TEXT, p_reason_code TEXT DEFAULT NULL, p_reason_detail TEXT DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_submission_id UUID; v_status TEXT; v_note TEXT;
BEGIN
  IF NOT is_admin(auth.uid()) THEN RAISE EXCEPTION 'admin_required'; END IF;
  IF auth.uid() = p_user_id THEN RAISE EXCEPTION 'self_dealing'; END IF;
  IF p_action NOT IN ('approve', 'reject', 'request_info') THEN RAISE EXCEPTION 'invalid_action'; END IF;
  IF p_action = 'approve' AND (p_reason_code IS NOT NULL OR p_reason_detail IS NOT NULL) THEN RAISE EXCEPTION 'reason_not_allowed'; END IF;
  IF p_action <> 'approve' AND (p_reason_code IS NULL OR p_reason_code NOT IN ('document_unreadable', 'document_incomplete', 'document_mismatch', 'document_expired', 'document_suspected_tampering', 'other')) THEN
    RAISE EXCEPTION 'invalid_reason_code';
  END IF;
  IF p_action = 'request_info' AND p_reason_code = 'document_suspected_tampering' THEN RAISE EXCEPTION 'reason_code_not_allowed'; END IF;
  IF p_reason_code <> 'other' AND p_reason_detail IS NOT NULL THEN RAISE EXCEPTION 'reason_detail_not_allowed'; END IF;
  IF p_reason_code = 'other' AND length(btrim(COALESCE(p_reason_detail, ''))) < 10 THEN RAISE EXCEPTION 'reason_detail_too_short'; END IF;
  SELECT id INTO v_submission_id FROM kyc_submissions WHERE user_id = p_user_id AND status IN ('pending', 'info_requested') ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'kyc_not_active_or_not_found'; END IF;
  v_status := CASE p_action WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' ELSE 'info_requested' END;
  UPDATE kyc_submissions SET status = v_status, reviewed_at = now(), reviewer_id = auth.uid(),
    evidence_retention_started_at = CASE WHEN p_action = 'reject' THEN now() ELSE evidence_retention_started_at END,
    review_reason_code = CASE WHEN p_action = 'approve' THEN NULL ELSE p_reason_code END,
    review_reason_detail = CASE WHEN p_action = 'approve' THEN NULL ELSE NULLIF(btrim(p_reason_detail), '') END
    WHERE id = v_submission_id;
  IF p_action = 'approve' THEN
    PERFORM promote_to_kyc_verified(p_user_id); PERFORM gen_affiliate_code(p_user_id);
  ELSIF p_action = 'reject' THEN
    UPDATE users SET kyc_status = 'rejected', updated_at = now() WHERE id = p_user_id;
  ELSE
    UPDATE users SET kyc_status = 'pending', updated_at = now() WHERE id = p_user_id;
  END IF;
  INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, after_data, note)
  VALUES (auth.uid(), 'kyc.' || p_action, 'kyc_submission', v_submission_id,
    jsonb_build_object('submission_id', v_submission_id, 'reason_code', CASE WHEN p_action = 'approve' THEN NULL ELSE p_reason_code END),
    CASE WHEN p_reason_code = 'other' THEN NULLIF(btrim(p_reason_detail), '') ELSE NULL END);
  INSERT INTO notifications (user_id, type, title, body, link)
  VALUES (p_user_id, 'kyc_' || p_action,
    CASE p_action WHEN 'approve' THEN 'KYC verification approved' WHEN 'reject' THEN 'KYC submission rejected' ELSE 'Additional KYC information needed' END,
    CASE WHEN p_action = 'approve' THEN 'Your identity verification is complete.' ELSE 'Review your KYC submission status and submit new evidence if needed.' END,
    '/customer/kyc');
END;
$$;

-- Backwards-compatible three-argument contract: p_reason is now a reason code.
CREATE OR REPLACE FUNCTION admin_review_kyc(p_user_id UUID, p_action TEXT, p_reason TEXT DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM admin_review_kyc(p_user_id, p_action, p_reason, NULL);
END;
$$;

DROP FUNCTION IF EXISTS get_kyc_document_view(UUID, TEXT);
CREATE OR REPLACE FUNCTION get_kyc_document_view(p_submission_id UUID, p_side TEXT, p_actor_id UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_path TEXT;
BEGIN
  -- A browser never receives a raw object path: the server route authenticates
  -- p_actor_id then calls this function with service-role credentials.
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
  IF NOT is_admin(p_actor_id) THEN RAISE EXCEPTION 'admin_required'; END IF;
  IF p_side NOT IN ('front', 'back') THEN RAISE EXCEPTION 'invalid_document_side'; END IF;
  SELECT storage_path INTO v_path FROM kyc_submission_documents WHERE submission_id = p_submission_id AND side = p_side;
  IF NOT FOUND THEN RAISE EXCEPTION 'document_not_found'; END IF;
  INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, after_data)
  VALUES (p_actor_id, 'kyc.document_viewed', 'kyc_submission', p_submission_id,
    jsonb_build_object('submission_id', p_submission_id, 'side', p_side));
  RETURN v_path;
END;
$$;

CREATE OR REPLACE FUNCTION purge_expired_kyc_evidence()
RETURNS TABLE(submission_id UUID, side TEXT, storage_path TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
  RETURN QUERY
  WITH eligible AS (
    SELECT d.id, d.submission_id, d.side, d.storage_path
      FROM kyc_submission_documents d JOIN kyc_submissions s ON s.id = d.submission_id JOIN users u ON u.id = s.user_id
     WHERE d.storage_path IS NOT NULL
       AND ((s.status IN ('rejected', 'superseded') AND s.evidence_retention_started_at <= now() - interval '90 days')
         OR (s.status = 'approved' AND ((u.status = 'deleted' AND COALESCE(u.closed_at, u.updated_at) <= now() - interval '90 days')
           OR EXISTS (SELECT 1 FROM kyc_submissions replacement WHERE replacement.user_id = s.user_id AND replacement.status = 'approved' AND replacement.reviewed_at > s.reviewed_at AND replacement.reviewed_at <= now() - interval '90 days'))))
       AND (d.purge_claimed_at IS NULL OR d.purge_claimed_at < now() - interval '1 hour')
     ORDER BY d.submission_id, d.side
     FOR UPDATE OF d SKIP LOCKED
  ), claimed AS (
    UPDATE kyc_submission_documents d SET purge_claimed_at = now() FROM eligible e WHERE d.id = e.id RETURNING e.submission_id, e.side, e.storage_path
  ) SELECT * FROM claimed ORDER BY submission_id, side;
END;
$$;

CREATE OR REPLACE FUNCTION confirm_purged_kyc_evidence(p_submission_id UUID, p_side TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
  DELETE FROM kyc_submission_documents WHERE submission_id = p_submission_id AND side = p_side;
  IF FOUND THEN
    INSERT INTO audit_logs (action, entity_type, entity_id, after_data)
    VALUES ('kyc.evidence_purged', 'kyc_submission', p_submission_id, jsonb_build_object('submission_id', p_submission_id, 'side', p_side));
  END IF;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION begin_kyc_submission(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION begin_kyc_submission(UUID, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION finalize_kyc_submission(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION abandon_kyc_submission(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_review_kyc(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_review_kyc(UUID, TEXT, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION get_kyc_document_view(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_kyc_document_view(UUID, TEXT, UUID) TO service_role;
REVOKE ALL ON FUNCTION submit_kyc(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION purge_expired_kyc_evidence() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION confirm_purged_kyc_evidence(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION purge_expired_kyc_evidence() TO service_role;
GRANT EXECUTE ON FUNCTION confirm_purged_kyc_evidence(UUID, TEXT) TO service_role;

-- Preserve direct-RPC gates from the original 033 implementation.
CREATE OR REPLACE FUNCTION debit_withdrawal(p_user_id UUID, p_amount_rm NUMERIC) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_user RECORD; v_wallet_id UUID; v_earnings BIGINT; v_amount_sen BIGINT; v_min_amount_sen BIGINT; v_request_id UUID; v_dual BOOLEAN;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT tier, kyc_status, stripe_connect_account_id, stripe_payouts_enabled INTO v_user FROM users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'user_not_found'; END IF;
  IF v_user.tier <> 'kyc_verified' OR v_user.kyc_status <> 'approved' THEN RAISE EXCEPTION 'kyc_required'; END IF;
  IF v_user.stripe_connect_account_id IS NULL OR NOT COALESCE(v_user.stripe_payouts_enabled, false) THEN RAISE EXCEPTION 'payout_account_required'; END IF;
  v_amount_sen := round_sen(p_amount_rm); IF v_amount_sen <= 0 THEN RAISE EXCEPTION 'amount_must_be_positive'; END IF;
  SELECT COALESCE(value::BIGINT, 1000) INTO v_min_amount_sen FROM platform_settings WHERE key = 'withdrawal.min_amount_sen'; v_min_amount_sen := COALESCE(v_min_amount_sen, 1000);
  IF v_amount_sen < v_min_amount_sen THEN RAISE EXCEPTION 'below_min_withdrawal'; END IF;
  SELECT id, earnings_sen INTO v_wallet_id, v_earnings FROM wallets WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_not_found'; END IF; IF v_earnings < v_amount_sen THEN RAISE EXCEPTION 'insufficient_earnings'; END IF;
  v_dual := v_amount_sen >= 50000;
  BEGIN INSERT INTO withdrawal_requests (user_id, wallet_id, amount, destination_label, status, requires_dual_approval) VALUES (p_user_id, v_wallet_id, p_amount_rm, 'Stripe bank on file', 'pending', v_dual) RETURNING id INTO v_request_id;
  EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'pending_withdrawal_exists'; END;
  UPDATE wallets SET earnings_sen = earnings_sen - v_amount_sen, updated_at = now() WHERE id = v_wallet_id;
  INSERT INTO wallet_transactions (user_id, wallet_id, type, amount_sen, bucket, direction, withdrawal_id, note) VALUES (p_user_id, v_wallet_id, 'withdrawal_reserve', v_amount_sen, 'earnings', 'debit', v_request_id, 'Withdrawal debited — pending admin approval');
  RETURN jsonb_build_object('request_id', v_request_id, 'requires_dual_approval', v_dual);
END;
$$;

CREATE OR REPLACE FUNCTION submit_recommendation(p_vendor_name TEXT, p_description TEXT, p_state TEXT DEFAULT NULL, p_category_id UUID DEFAULT NULL, p_vendor_address TEXT DEFAULT NULL) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_user_id UUID := auth.uid(); v_count INT; v_rec_id UUID; v_norm_name TEXT;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = v_user_id AND tier_rank(tier) >= tier_rank('profile_complete')) THEN RAISE EXCEPTION 'tier_insufficient: profile_complete required'; END IF;
  v_norm_name := normalize_vendor_name(p_vendor_name); IF length(v_norm_name) = 0 THEN RAISE EXCEPTION 'vendor_name_blank'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('rec_submit:' || v_user_id::text)); SELECT count(*) INTO v_count FROM vendor_recommendations WHERE recommender_id = v_user_id AND created_at > now() - interval '24 hours'; IF v_count >= 5 THEN RAISE EXCEPTION 'rate_limited'; END IF;
  IF EXISTS (SELECT 1 FROM vendor_recommendations WHERE recommender_id = v_user_id AND vendor_name_normalized = v_norm_name AND status NOT IN ('rejected')) THEN RAISE EXCEPTION 'duplicate'; END IF;
  INSERT INTO vendor_recommendations (recommender_id, vendor_name, vendor_name_normalized, description, state, category_id, vendor_address, status) VALUES (v_user_id, p_vendor_name, v_norm_name, p_description, p_state, p_category_id, p_vendor_address, 'pending') RETURNING id INTO v_rec_id;
  RETURN v_rec_id;
END;
$$;
GRANT EXECUTE ON FUNCTION debit_withdrawal(UUID, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION submit_recommendation(TEXT, TEXT, TEXT, UUID, TEXT) TO authenticated;
