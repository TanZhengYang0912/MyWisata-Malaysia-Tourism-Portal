-- ============================================================
-- 018_atomic_rpcs.sql — SECURITY DEFINER RPCs for atomic admin
-- operations and server-side-only KYC submission
--
-- 1. admin_review_kyc           — atomic KYC approve/reject
-- 2. admin_review_recommendation — atomic recommendation approve/reject
-- 3. admin_link_vendor_recommendation — link approved vendor to recommendation
-- 4. submit_kyc                 — atomic KYC upsert (server-only; stores ic_hash)
-- 5. credit_pending_recommendation — credit recommendation commission to pending bucket
-- ============================================================


-- ── 1. admin_review_kyc ──────────────────────────────────────────────────────
-- Single-call atomic: updates kyc_submissions + users.kyc_status + auto-provisions
-- affiliate link on approval. Called from /api/admin/kyc/review (server route only).
CREATE OR REPLACE FUNCTION admin_review_kyc(
  p_user_id UUID,
  p_action  TEXT,
  p_reason  TEXT DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_new_tier TEXT;
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  v_new_tier := CASE p_action
    WHEN 'approve' THEN 'kyc_verified'
    WHEN 'reject'  THEN 'profile_complete'
    ELSE NULL
  END;
  IF v_new_tier IS NULL THEN
    RAISE EXCEPTION 'invalid_action: %', p_action;
  END IF;

  UPDATE kyc_submissions
     SET status      = CASE WHEN p_action = 'approve' THEN 'approved' ELSE 'rejected' END,
         reviewed_at = now(),
         reviewer_id = auth.uid()
   WHERE user_id = p_user_id;

  UPDATE users
     SET kyc_status = v_new_tier
   WHERE id = p_user_id;

  -- Auto-provision affiliate link on approval (idempotent — gen_affiliate_code
  -- returns existing code if one already exists for this user).
  IF p_action = 'approve' THEN
    PERFORM gen_affiliate_code(p_user_id);
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION admin_review_kyc(UUID, TEXT, TEXT) TO authenticated;


-- ── 2. admin_review_recommendation ───────────────────────────────────────────
-- Atomic recommendation approve/reject with idempotency guard (only transitions
-- from 'pending' — re-calling on an already-reviewed rec raises an exception).
CREATE OR REPLACE FUNCTION admin_review_recommendation(
  p_rec_id  UUID,
  p_action  TEXT,
  p_reason  TEXT DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin_required';
  END IF;
  IF p_action NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'invalid_action: %', p_action;
  END IF;

  UPDATE vendor_recommendations
     SET status           = CASE WHEN p_action = 'approve' THEN 'approved' ELSE 'rejected' END,
         reviewer_id      = auth.uid(),
         reviewed_at      = now(),
         rejection_reason = CASE WHEN p_action = 'reject' THEN p_reason ELSE NULL END
   WHERE id     = p_rec_id
     AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found_or_already_reviewed: %', p_rec_id;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION admin_review_recommendation(UUID, TEXT, TEXT) TO authenticated;


-- ── 3. admin_link_vendor_recommendation ──────────────────────────────────────
-- Links an approved vendor to an approved recommendation, opening the 90-day
-- commission attribution window. Returns the new recommendation_conversions.id.
CREATE OR REPLACE FUNCTION admin_link_vendor_recommendation(
  p_vendor_id UUID,
  p_rec_id    UUID
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_window_days    INT  := 90;
  v_conversion_id  UUID;
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  -- Read configurable attribution window (falls back to 90 days)
  SELECT COALESCE(value::INT, 90) INTO v_window_days
    FROM platform_settings
   WHERE key = 'recommendation.attribution_window_days';

  -- Advance recommendation status → 'converted'
  UPDATE vendor_recommendations
     SET status              = 'converted',
         converted_vendor_id = p_vendor_id,
         reviewed_at         = now(),
         reviewer_id         = auth.uid()
   WHERE id     = p_rec_id
     AND status = 'approved';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'recommendation_not_approved_or_not_found: %', p_rec_id;
  END IF;

  -- Create conversion record with attribution window
  INSERT INTO recommendation_conversions
    (recommendation_id, converted_vendor_id, attribution_ends_at)
  VALUES
    (p_rec_id, p_vendor_id,
     now() + (v_window_days || ' days')::INTERVAL)
  RETURNING id INTO v_conversion_id;

  RETURN v_conversion_id;
END;
$$;
GRANT EXECUTE ON FUNCTION admin_link_vendor_recommendation(UUID, UUID) TO authenticated;


-- ── 4. submit_kyc ────────────────────────────────────────────────────────────
-- Server-only KYC submission: stores ic_hash (not plain IC number),
-- advances kyc_status. Callable only by the user themselves or an admin.
CREATE OR REPLACE FUNCTION submit_kyc(
  p_user_id  UUID,
  p_ic_hash  TEXT,
  p_doc_type TEXT,
  p_doc_url  TEXT
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id AND NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  INSERT INTO kyc_submissions
    (user_id, ic_hash, document_type, document_url, status)
  VALUES
    (p_user_id, p_ic_hash, p_doc_type, p_doc_url, 'pending')
  ON CONFLICT (user_id) DO UPDATE
     SET ic_hash       = EXCLUDED.ic_hash,
         document_type = EXCLUDED.document_type,
         document_url  = EXCLUDED.document_url,
         status        = 'pending',
         created_at    = now();

  -- Only advance from eligible tiers; if already kyc_verified, leave unchanged.
  UPDATE users
     SET kyc_status = 'kyc_submitted'
   WHERE id         = p_user_id
     AND kyc_status IN ('profile_complete', 'kyc_submitted');
END;
$$;
GRANT EXECUTE ON FUNCTION submit_kyc(UUID, TEXT, TEXT, TEXT) TO authenticated;


-- ── 5. credit_pending_recommendation ─────────────────────────────────────────
-- Credits recommendation commission (bonus or ongoing) to pending_earnings_sen.
-- Inserts wallet_transaction + recommendation_commissions row atomically.
-- Hold window matches affiliate earnings.hold_days setting.
-- Called by service_role from attribution.ts (never from client code directly).
CREATE OR REPLACE FUNCTION credit_pending_recommendation(
  p_user_id         UUID,
  p_amount_sen      BIGINT,
  p_commission_type TEXT,
  p_conversion_id   UUID,
  p_order_id        UUID    DEFAULT NULL,
  p_commission_rate NUMERIC(5,4) DEFAULT NULL,
  p_note            TEXT    DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_wallet_id     UUID;
  v_hold_days     INT  := 7;
  v_commission_id UUID;
BEGIN
  SELECT COALESCE(value::INT, 7) INTO v_hold_days
    FROM platform_settings WHERE key = 'earnings.hold_days';

  SELECT id INTO v_wallet_id
    FROM wallets WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'wallet_not_found for user %', p_user_id;
  END IF;

  UPDATE wallets
     SET pending_earnings_sen = pending_earnings_sen + p_amount_sen,
         updated_at           = now()
   WHERE id = v_wallet_id;

  INSERT INTO wallet_transactions
    (user_id, wallet_id, type, amount_sen, bucket, direction, note)
  VALUES
    (p_user_id, v_wallet_id, 'earnings_pending', p_amount_sen,
     'pending_earnings', 'credit',
     COALESCE(p_note, 'Recommendation commission — pending hold period'));

  INSERT INTO recommendation_commissions
    (recommender_id, conversion_id, commission_type, amount,
     status, hold_until, order_id, commission_rate)
  VALUES
    (p_user_id, p_conversion_id, p_commission_type, p_amount_sen / 100.0,
     'pending', now() + (v_hold_days || ' days')::INTERVAL,
     p_order_id, p_commission_rate)
  RETURNING id INTO v_commission_id;

  RETURN v_commission_id;
END;
$$;
GRANT EXECUTE ON FUNCTION credit_pending_recommendation(UUID, BIGINT, TEXT, UUID, UUID, NUMERIC, TEXT) TO service_role;
