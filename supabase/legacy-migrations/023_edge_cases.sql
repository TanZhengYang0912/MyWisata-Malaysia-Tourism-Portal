-- ============================================================
-- 023_edge_cases.sql — PR 023: P3 Edge Cases
--
-- a. round_sen() — banker's half-even rounding for RM → sen
--    Applied to debit_withdrawal RPC.
--
-- b. normalize_vendor_name() — NFKC + zero-width strip + whitespace
--    collapse + lowercase. Stored as vendor_name_normalized column.
--    submit_recommendation updated to use normalized key for dedup.
--
-- d. (code-layer) Stripe idempotency expiry detection in approve route
--    — see app/api/admin/withdrawals/[id]/approve/route.ts
--
-- f. (code-layer) Stripe payouts_enabled pre-check before payout creation
--    — see app/api/admin/withdrawals/[id]/approve/route.ts
-- ============================================================


-- ── 1. round_sen — banker's half-even rounding ────────────────────────────────
-- Converts an RM amount (NUMERIC) to integer sen using half-even (banker's)
-- rounding. Unbiased over large transaction volumes; avoids the systematic
-- upward drift of half-up rounding.
--
-- Half-even rule: at exactly 0.5 sen, round to the nearest even integer.
--   round_sen(0.005) → 0  (0 is even)
--   round_sen(0.015) → 2  (2 is even)
--   round_sen(0.025) → 2  (2 is even)
--   round_sen(0.035) → 4  (4 is even)
CREATE OR REPLACE FUNCTION round_sen(p_amount_rm NUMERIC)
RETURNS BIGINT
LANGUAGE plpgsql IMMUTABLE STRICT
AS $$
DECLARE
  v_scaled    NUMERIC;
  v_truncated BIGINT;
  v_fraction  NUMERIC;
BEGIN
  v_scaled    := p_amount_rm * 100;
  v_truncated := TRUNC(v_scaled)::BIGINT;
  v_fraction  := v_scaled - v_truncated;

  IF v_fraction > 0.5 THEN
    RETURN v_truncated + 1;
  ELSIF v_fraction < 0.5 THEN
    RETURN v_truncated;
  ELSE
    -- Exactly at midpoint: round to nearest even
    IF v_truncated % 2 = 0 THEN
      RETURN v_truncated;
    ELSE
      RETURN v_truncated + 1;
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION round_sen(NUMERIC) TO authenticated, service_role;


-- ── 2. debit_withdrawal — use round_sen() instead of ROUND() ─────────────────
CREATE OR REPLACE FUNCTION debit_withdrawal(
  p_user_id   UUID,
  p_amount_rm NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_wallet_id      UUID;
  v_earnings       BIGINT;
  v_amount_sen     BIGINT;
  v_min_amount_sen BIGINT;
  v_request_id     UUID;
  v_dual           BOOLEAN;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'unauthorized'; END IF;

  v_amount_sen := round_sen(p_amount_rm);
  IF v_amount_sen <= 0 THEN RAISE EXCEPTION 'amount_must_be_positive'; END IF;

  SELECT COALESCE(value::BIGINT, 1000) INTO v_min_amount_sen
    FROM platform_settings WHERE key = 'withdrawal.min_amount_sen';
  v_min_amount_sen := COALESCE(v_min_amount_sen, 1000);

  IF v_amount_sen < v_min_amount_sen THEN
    RAISE EXCEPTION 'below_min_withdrawal: minimum is % sen, requested % sen',
      v_min_amount_sen, v_amount_sen;
  END IF;

  SELECT id, earnings_sen INTO v_wallet_id, v_earnings
    FROM wallets WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_not_found'; END IF;

  IF v_earnings < v_amount_sen THEN
    RAISE EXCEPTION 'insufficient_earnings: have % sen, need % sen', v_earnings, v_amount_sen;
  END IF;

  v_dual := v_amount_sen >= 50000;

  BEGIN
    INSERT INTO withdrawal_requests
      (user_id, wallet_id, amount, destination_label, status, requires_dual_approval)
    VALUES
      (p_user_id, v_wallet_id, p_amount_rm, 'Stripe bank on file', 'pending', v_dual)
    RETURNING id INTO v_request_id;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'pending_withdrawal_exists';
  END;

  UPDATE wallets
     SET earnings_sen = earnings_sen - v_amount_sen, updated_at = now()
   WHERE id = v_wallet_id;

  INSERT INTO wallet_transactions
    (user_id, wallet_id, type, amount_sen, bucket, direction, withdrawal_id, note)
  VALUES
    (p_user_id, v_wallet_id, 'withdrawal_reserve', v_amount_sen, 'earnings', 'debit',
     v_request_id, 'Withdrawal debited — pending admin approval');

  RETURN jsonb_build_object('request_id', v_request_id, 'requires_dual_approval', v_dual);
END;
$$;

GRANT EXECUTE ON FUNCTION debit_withdrawal(UUID, NUMERIC) TO authenticated;


-- ── 3. normalize_vendor_name — NFKC + zero-width strip + collapse ─────────────
-- Produces a canonical comparison key for vendor name deduplication.
-- Strips: U+200B (ZWSP), U+200C (ZWNJ), U+200D (ZWJ), U+FEFF (BOM),
--         U+00AD (soft hyphen), U+2060 (word joiner).
-- Then: NFKC normalize → btrim → collapse whitespace → lowercase.
CREATE OR REPLACE FUNCTION normalize_vendor_name(p_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE STRICT
AS $$
DECLARE
  v_result TEXT;
BEGIN
  -- NFKC: decomposes ligatures (ﬁ → fi), full-width (Ａ → A), etc.
  v_result := normalize(p_name, NFKC);

  -- Strip zero-width and invisible characters via translate (character-by-character)
  v_result := translate(
    v_result,
    U&'\200B\200C\200D\FEFF\00AD\2060',
    ''
  );

  -- Trim surrounding whitespace then collapse internal runs to single space
  v_result := regexp_replace(btrim(v_result), '\s+', ' ', 'g');

  RETURN lower(v_result);
END;
$$;

GRANT EXECUTE ON FUNCTION normalize_vendor_name(TEXT) TO authenticated, service_role;


-- ── 4. vendor_recommendations.vendor_name_normalized column ──────────────────
ALTER TABLE vendor_recommendations
  ADD COLUMN IF NOT EXISTS vendor_name_normalized TEXT;

-- Backfill existing rows
UPDATE vendor_recommendations
   SET vendor_name_normalized = normalize_vendor_name(vendor_name)
 WHERE vendor_name_normalized IS NULL;

-- Index supports the per-user duplicate check in submit_recommendation
CREATE INDEX IF NOT EXISTS idx_rec_name_normalized
  ON vendor_recommendations (recommender_id, vendor_name_normalized)
  WHERE status NOT IN ('rejected');


-- ── 5. submit_recommendation — use normalized key for dedup ──────────────────
-- Replaces the previous lower(vendor_name) = lower(p_vendor_name) check with
-- normalize_vendor_name(), which additionally handles NFKC equivalents and
-- zero-width injection. Stores the normalized key for future index lookups.
CREATE OR REPLACE FUNCTION submit_recommendation(
  p_vendor_name    TEXT,
  p_description    TEXT,
  p_state          TEXT DEFAULT NULL,
  p_category_id    UUID DEFAULT NULL,
  p_vendor_address TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id   UUID := auth.uid();
  v_count     INT;
  v_rec_id    UUID;
  v_norm_name TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  -- Normalize once and reuse for both checks and insert
  v_norm_name := normalize_vendor_name(p_vendor_name);

  IF length(v_norm_name) = 0 THEN
    RAISE EXCEPTION 'vendor_name_blank: name is empty after normalization';
  END IF;

  -- Serialize concurrent submissions from the same user
  PERFORM pg_advisory_xact_lock(hashtext('rec_submit:' || v_user_id::text));

  -- Daily rate limit: max 5 per 24 hours
  SELECT count(*) INTO v_count
    FROM vendor_recommendations
   WHERE recommender_id = v_user_id
     AND created_at > now() - interval '24 hours';

  IF v_count >= 5 THEN
    RAISE EXCEPTION 'rate_limited: daily recommendation limit reached';
  END IF;

  -- Duplicate detection using normalized key (catches NFKC variants and zero-width tricks)
  IF EXISTS (
    SELECT 1 FROM vendor_recommendations
     WHERE recommender_id        = v_user_id
       AND vendor_name_normalized = v_norm_name
       AND status NOT IN ('rejected')
  ) THEN
    RAISE EXCEPTION 'duplicate: already recommended a vendor with this name';
  END IF;

  INSERT INTO vendor_recommendations
    (recommender_id, vendor_name, vendor_name_normalized,
     description, state, category_id, vendor_address, status)
  VALUES
    (v_user_id, p_vendor_name, v_norm_name,
     p_description, p_state, p_category_id, p_vendor_address, 'pending')
  RETURNING id INTO v_rec_id;

  RETURN v_rec_id;
END;
$$;

GRANT EXECUTE ON FUNCTION submit_recommendation(TEXT, TEXT, TEXT, UUID, TEXT) TO authenticated;
