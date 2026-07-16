-- Gemini Vision is an advisory KYC aid.  These rows deliberately contain no
-- raw model response or full extracted document number.

ALTER TABLE public.kyc_submissions
  ADD COLUMN IF NOT EXISTS ocr_consent_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.kyc_ocr_results (
  submission_id UUID PRIMARY KEY REFERENCES public.kyc_submissions(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('matched', 'mismatch', 'unreadable', 'unavailable')),
  holder_name TEXT,
  document_number_hmac TEXT CHECK (document_number_hmac IS NULL OR document_number_hmac ~ '^[0-9a-f]{64}$'),
  document_number_last4 TEXT CHECK (document_number_last4 IS NULL OR document_number_last4 ~ '^[0-9A-Za-z]{4}$'),
  expiry_date DATE,
  confidence NUMERIC(4,3) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  mismatch_fields TEXT[] NOT NULL DEFAULT '{}',
  provider_model TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.kyc_ocr_results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.kyc_ocr_results FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.begin_kyc_submission(UUID, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.begin_kyc_submission(
  p_user_id UUID,
  p_ic_hash TEXT,
  p_ic_hash_version TEXT,
  p_doc_type TEXT,
  p_ocr_consent BOOLEAN
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id UUID;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
  IF NOT COALESCE(p_ocr_consent, FALSE) THEN RAISE EXCEPTION 'ocr_consent_required'; END IF;
  IF p_ic_hash_version <> 'hmac_sha256_v1' OR p_ic_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'invalid_ic_fingerprint'; END IF;
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
  INSERT INTO kyc_submissions (user_id, ic_hash, ic_hash_version, document_type, status, ocr_consent_at)
  VALUES (p_user_id, p_ic_hash, p_ic_hash_version, p_doc_type, 'draft', now()) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_kyc_ocr_result(
  p_submission_id UUID,
  p_status TEXT,
  p_holder_name TEXT,
  p_document_number_hmac TEXT,
  p_document_number_last4 TEXT,
  p_expiry_date DATE,
  p_confidence NUMERIC,
  p_mismatch_fields TEXT[],
  p_provider_model TEXT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
  IF p_status NOT IN ('matched', 'mismatch', 'unreadable', 'unavailable') THEN RAISE EXCEPTION 'invalid_ocr_status'; END IF;
  INSERT INTO kyc_ocr_results (submission_id, status, holder_name, document_number_hmac, document_number_last4, expiry_date, confidence, mismatch_fields, provider_model)
  VALUES (p_submission_id, p_status, NULLIF(btrim(p_holder_name), ''), p_document_number_hmac, p_document_number_last4, p_expiry_date, p_confidence, COALESCE(p_mismatch_fields, '{}'), p_provider_model)
  ON CONFLICT (submission_id) DO UPDATE SET
    status = EXCLUDED.status, holder_name = EXCLUDED.holder_name, document_number_hmac = EXCLUDED.document_number_hmac,
    document_number_last4 = EXCLUDED.document_number_last4, expiry_date = EXCLUDED.expiry_date, confidence = EXCLUDED.confidence,
    mismatch_fields = EXCLUDED.mismatch_fields, provider_model = EXCLUDED.provider_model, processed_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.begin_kyc_submission(UUID, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_kyc_submission(UUID, TEXT, TEXT, TEXT, BOOLEAN) TO service_role;
REVOKE ALL ON FUNCTION public.record_kyc_ocr_result(UUID, TEXT, TEXT, TEXT, TEXT, DATE, NUMERIC, TEXT[], TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_kyc_ocr_result(UUID, TEXT, TEXT, TEXT, TEXT, DATE, NUMERIC, TEXT[], TEXT) TO service_role;
