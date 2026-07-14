-- Server-side tier gates. API checks remain a usability layer only.

CREATE OR REPLACE FUNCTION debit_withdrawal(
  p_user_id UUID,
  p_amount_rm NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_user RECORD;
  v_wallet_id UUID;
  v_earnings BIGINT;
  v_amount_sen BIGINT;
  v_min_amount_sen BIGINT;
  v_request_id UUID;
  v_dual BOOLEAN;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'unauthorized'; END IF;

  SELECT tier, kyc_status, stripe_connect_account_id, stripe_payouts_enabled
    INTO v_user FROM users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'user_not_found'; END IF;
  IF v_user.tier <> 'kyc_verified' OR v_user.kyc_status <> 'approved' THEN
    RAISE EXCEPTION 'kyc_required';
  END IF;
  IF v_user.stripe_connect_account_id IS NULL OR NOT COALESCE(v_user.stripe_payouts_enabled, false) THEN
    RAISE EXCEPTION 'payout_account_required';
  END IF;

  v_amount_sen := round_sen(p_amount_rm);
  IF v_amount_sen <= 0 THEN RAISE EXCEPTION 'amount_must_be_positive'; END IF;
  SELECT COALESCE(value::BIGINT, 1000) INTO v_min_amount_sen FROM platform_settings WHERE key = 'withdrawal.min_amount_sen';
  v_min_amount_sen := COALESCE(v_min_amount_sen, 1000);
  IF v_amount_sen < v_min_amount_sen THEN RAISE EXCEPTION 'below_min_withdrawal'; END IF;

  SELECT id, earnings_sen INTO v_wallet_id, v_earnings FROM wallets WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_not_found'; END IF;
  IF v_earnings < v_amount_sen THEN RAISE EXCEPTION 'insufficient_earnings'; END IF;
  v_dual := v_amount_sen >= 50000;

  BEGIN
    INSERT INTO withdrawal_requests (user_id, wallet_id, amount, destination_label, status, requires_dual_approval)
    VALUES (p_user_id, v_wallet_id, p_amount_rm, 'Stripe bank on file', 'pending', v_dual)
    RETURNING id INTO v_request_id;
  EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'pending_withdrawal_exists';
  END;

  UPDATE wallets SET earnings_sen = earnings_sen - v_amount_sen, updated_at = now() WHERE id = v_wallet_id;
  INSERT INTO wallet_transactions (user_id, wallet_id, type, amount_sen, bucket, direction, withdrawal_id, note)
  VALUES (p_user_id, v_wallet_id, 'withdrawal_reserve', v_amount_sen, 'earnings', 'debit', v_request_id, 'Withdrawal debited — pending admin approval');
  RETURN jsonb_build_object('request_id', v_request_id, 'requires_dual_approval', v_dual);
END;
$$;

CREATE OR REPLACE FUNCTION submit_recommendation(
  p_vendor_name TEXT,
  p_description TEXT,
  p_state TEXT DEFAULT NULL,
  p_category_id UUID DEFAULT NULL,
  p_vendor_address TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_count INT;
  v_rec_id UUID;
  v_norm_name TEXT;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = v_user_id AND tier_rank(tier) >= tier_rank('profile_complete')) THEN
    RAISE EXCEPTION 'tier_insufficient: profile_complete required';
  END IF;
  v_norm_name := normalize_vendor_name(p_vendor_name);
  IF length(v_norm_name) = 0 THEN RAISE EXCEPTION 'vendor_name_blank'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('rec_submit:' || v_user_id::text));
  SELECT count(*) INTO v_count FROM vendor_recommendations WHERE recommender_id = v_user_id AND created_at > now() - interval '24 hours';
  IF v_count >= 5 THEN RAISE EXCEPTION 'rate_limited'; END IF;
  IF EXISTS (SELECT 1 FROM vendor_recommendations WHERE recommender_id = v_user_id AND vendor_name_normalized = v_norm_name AND status NOT IN ('rejected')) THEN
    RAISE EXCEPTION 'duplicate';
  END IF;
  INSERT INTO vendor_recommendations (recommender_id, vendor_name, vendor_name_normalized, description, state, category_id, vendor_address, status)
  VALUES (v_user_id, p_vendor_name, v_norm_name, p_description, p_state, p_category_id, p_vendor_address, 'pending')
  RETURNING id INTO v_rec_id;
  RETURN v_rec_id;
END;
$$;

GRANT EXECUTE ON FUNCTION debit_withdrawal(UUID, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION submit_recommendation(TEXT, TEXT, TEXT, UUID, TEXT) TO authenticated;

-- Immutable dual-sided KYC evidence.
ALTER TABLE kyc_submissions DROP CONSTRAINT IF EXISTS kyc_submissions_status_check;
ALTER TABLE kyc_submissions ADD CONSTRAINT kyc_submissions_status_check
  CHECK (status IN ('draft', 'pending', 'info_requested', 'approved', 'rejected', 'superseded'));
ALTER TABLE kyc_submissions ADD COLUMN IF NOT EXISTS ic_hash_version TEXT NOT NULL DEFAULT 'legacy_sha256';
ALTER TABLE kyc_submissions ADD COLUMN IF NOT EXISTS legacy_single_document BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE kyc_submissions ADD COLUMN IF NOT EXISTS review_reason_code TEXT;
ALTER TABLE kyc_submissions ADD COLUMN IF NOT EXISTS review_reason_detail TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_kyc_one_active_or_draft_per_user
  ON kyc_submissions(user_id) WHERE status IN ('draft', 'pending', 'info_requested');

CREATE TABLE IF NOT EXISTS kyc_submission_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES kyc_submissions(id) ON DELETE RESTRICT,
  side TEXT NOT NULL CHECK (side IN ('front', 'back')),
  storage_path TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'application/pdf')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (submission_id, side)
);
ALTER TABLE kyc_submission_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kyc_documents_no_client_read ON kyc_submission_documents;
CREATE POLICY kyc_documents_no_client_read ON kyc_submission_documents FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM kyc_submissions s WHERE s.id = submission_id AND (s.user_id = auth.uid() OR is_admin(auth.uid()))));

DROP POLICY IF EXISTS kyc_doc_insert_own ON storage.objects;
DROP POLICY IF EXISTS kyc_doc_update_own ON storage.objects;
DROP POLICY IF EXISTS kyc_doc_select_own_or_admin ON storage.objects;

CREATE OR REPLACE FUNCTION begin_kyc_submission(
  p_ic_hash TEXT, p_ic_hash_version TEXT, p_doc_type TEXT
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND tier_rank(tier) >= tier_rank('profile_complete')) THEN RAISE EXCEPTION 'tier_insufficient'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('kyc_submit:' || auth.uid()::text));
  UPDATE kyc_submissions SET status = 'superseded'
    WHERE user_id = auth.uid() AND status = 'info_requested';
  IF EXISTS (SELECT 1 FROM kyc_submissions WHERE user_id = auth.uid() AND status IN ('draft', 'pending')) THEN RAISE EXCEPTION 'active_submission_exists'; END IF;
  INSERT INTO kyc_submissions (user_id, ic_hash, ic_hash_version, document_type, document_url, status)
  VALUES (auth.uid(), p_ic_hash, p_ic_hash_version, p_doc_type, NULL, 'draft') RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION finalize_kyc_submission(
  p_submission_id UUID, p_front_path TEXT, p_back_path TEXT
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_pos INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM kyc_submissions WHERE id = p_submission_id AND user_id = auth.uid() AND status = 'draft') THEN RAISE EXCEPTION 'draft_not_found'; END IF;
  IF p_front_path !~ ('^' || auth.uid()::text || '/' || p_submission_id::text || '/front\.')
     OR p_back_path !~ ('^' || auth.uid()::text || '/' || p_submission_id::text || '/back\.') THEN RAISE EXCEPTION 'invalid_document_path'; END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'kyc-documents' AND name = p_front_path)
     OR NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'kyc-documents' AND name = p_back_path) THEN RAISE EXCEPTION 'documents_missing'; END IF;
  INSERT INTO kyc_submission_documents (submission_id, side, storage_path, mime_type)
  VALUES (p_submission_id, 'front', p_front_path, CASE WHEN p_front_path ~ '\.pdf$' THEN 'application/pdf' WHEN p_front_path ~ '\.png$' THEN 'image/png' ELSE 'image/jpeg' END),
         (p_submission_id, 'back', p_back_path, CASE WHEN p_back_path ~ '\.pdf$' THEN 'application/pdf' WHEN p_back_path ~ '\.png$' THEN 'image/png' ELSE 'image/jpeg' END);
  SELECT COALESCE(MAX(queue_position), 0) + 1 INTO v_pos FROM kyc_submissions WHERE status = 'pending';
  UPDATE kyc_submissions SET status = 'pending', queue_position = v_pos WHERE id = p_submission_id;
  UPDATE users SET kyc_status = 'pending', updated_at = now() WHERE id = auth.uid();
  RETURN p_submission_id;
END;
$$;
GRANT EXECUTE ON FUNCTION begin_kyc_submission(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION finalize_kyc_submission(UUID, TEXT, TEXT) TO authenticated;
