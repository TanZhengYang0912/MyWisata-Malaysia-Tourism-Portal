-- ============================================================
-- 019_pr_industrial_atomicity.sql — PR 019: onOrderPaid contract,
-- idempotency, state machine hardening, rate-limit atomicity
--
-- 1. orders.affiliate_click_id          — decouple onOrderPaid() from cookies
-- 2. vendor_recommendations.state       — missing column (route already uses it)
-- 3. recommendation_conversions.first_sale_order_id — audit FK
-- 4. recommendation_commissions unique indexes (Level 1 idempotency)
-- 5. CHECK: ongoing commission requires order_id
-- 6. credit_pending_recommendation RPC  — ON CONFLICT DO NOTHING + sync first_sale
-- 7. admin_review_kyc RPC               — WHERE status='pending' state guard
-- 8. submit_kyc RPC                     — add advisory lock
-- 9. NEW submit_recommendation RPC      — advisory lock + count + duplicate + insert
-- ============================================================


-- ── 1. orders.affiliate_click_id ─────────────────────────────────────────────
-- Decouples onOrderPaid() from browser cookies. Whoever creates the order
-- (checkout flow) writes the mw_ref click ID here from the browser session.
-- onOrderPaid(orderId) reads this column — callable from any context.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS affiliate_click_id UUID
    REFERENCES affiliate_clicks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_affiliate_click_id
  ON orders (affiliate_click_id)
  WHERE affiliate_click_id IS NOT NULL;


-- ── 2. vendor_recommendations.state ──────────────────────────────────────────
-- Malaysian state the recommended vendor is located in.
-- The API route already accepts this field; column was missing from 001.
ALTER TABLE vendor_recommendations
  ADD COLUMN IF NOT EXISTS state VARCHAR(100);


-- ── 3. recommendation_conversions.first_sale_order_id ────────────────────────
ALTER TABLE recommendation_conversions
  ADD COLUMN IF NOT EXISTS first_sale_order_id UUID;


-- ── 4. Idempotency pre-check: fail fast if duplicates already exist ───────────
-- Duplicate bonus or ongoing rows would block UNIQUE INDEX creation.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM recommendation_commissions
    WHERE commission_type = 'bonus'
    GROUP BY conversion_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Migration 019 aborted: duplicate bonus commissions found — '
      'clean recommendation_commissions before re-running';
  END IF;

  IF EXISTS (
    SELECT 1 FROM recommendation_commissions
    WHERE commission_type = 'ongoing'
      AND order_id IS NOT NULL
    GROUP BY conversion_id, order_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Migration 019 aborted: duplicate ongoing commissions found — '
      'clean recommendation_commissions before re-running';
  END IF;
END $$;


-- ── 5. Partial unique indexes on recommendation_commissions ───────────────────
-- Bonus:   max one RM 50 bonus per conversion, ever.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_rec_comm_bonus
  ON recommendation_commissions (conversion_id)
  WHERE commission_type = 'bonus';

-- Ongoing: max one 3% entry per (conversion, order) pair.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_rec_comm_ongoing
  ON recommendation_commissions (conversion_id, order_id)
  WHERE commission_type = 'ongoing' AND order_id IS NOT NULL;

-- CHECK: prevent callers from omitting order_id on ongoing commissions,
-- which would silently bypass the idempotency index.
ALTER TABLE recommendation_commissions
  DROP CONSTRAINT IF EXISTS ongoing_requires_order_id;

ALTER TABLE recommendation_commissions
  ADD CONSTRAINT ongoing_requires_order_id
  CHECK (commission_type <> 'ongoing' OR order_id IS NOT NULL);


-- ── 6. credit_pending_recommendation (idempotent rewrite) ────────────────────
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
  -- Fetch hold-days setting
  SELECT COALESCE(value::INT, 7) INTO v_hold_days
    FROM platform_settings WHERE key = 'earnings.hold_days';

  -- Lock wallet row before any read-modify-write
  SELECT id INTO v_wallet_id
    FROM wallets WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'wallet_not_found for user %', p_user_id;
  END IF;

  -- ── Idempotent insert ─────────────────────────────────────────────────────
  -- Each commission type uses a separate partial unique index so ON CONFLICT
  -- must be written separately. RETURNING id → NULL means row already exists.
  IF p_commission_type = 'bonus' THEN
    INSERT INTO recommendation_commissions
      (recommender_id, conversion_id, commission_type, amount,
       status, hold_until, order_id, commission_rate)
    VALUES
      (p_user_id, p_conversion_id, 'bonus', p_amount_sen / 100.0,
       'pending', now() + (v_hold_days || ' days')::INTERVAL,
       p_order_id, p_commission_rate)
    ON CONFLICT (conversion_id) WHERE commission_type = 'bonus'
    DO NOTHING
    RETURNING id INTO v_commission_id;
  ELSE
    INSERT INTO recommendation_commissions
      (recommender_id, conversion_id, commission_type, amount,
       status, hold_until, order_id, commission_rate)
    VALUES
      (p_user_id, p_conversion_id, p_commission_type, p_amount_sen / 100.0,
       'pending', now() + (v_hold_days || ' days')::INTERVAL,
       p_order_id, p_commission_rate)
    ON CONFLICT (conversion_id, order_id)
      WHERE commission_type = 'ongoing' AND order_id IS NOT NULL
    DO NOTHING
    RETURNING id INTO v_commission_id;
  END IF;

  -- If nothing was inserted (duplicate), skip all wallet ops.
  IF v_commission_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- ── Wallet and ledger writes (only on first credit) ───────────────────────
  UPDATE wallets
     SET pending_earnings_sen = pending_earnings_sen + p_amount_sen,
         updated_at           = now()
   WHERE id = v_wallet_id;

  INSERT INTO wallet_transactions
    (user_id, wallet_id, type, amount_sen, bucket, direction, note)
  VALUES
    (p_user_id, v_wallet_id, 'earnings_pending', p_amount_sen,
     'pending_earnings', 'credit',
     COALESCE(p_note, 'Recommendation commission'));

  -- Sync observable flag for first-sale bonus
  IF p_commission_type = 'bonus' THEN
    UPDATE recommendation_conversions
       SET first_sale_awarded_at = now(),
           first_sale_order_id   = p_order_id
     WHERE id = p_conversion_id;
  END IF;

  RETURN v_commission_id;
END;
$$;

-- Keep service_role-only grant (anon/authenticated must never call this directly)
REVOKE EXECUTE ON FUNCTION credit_pending_recommendation(UUID, BIGINT, TEXT, UUID, UUID, NUMERIC, TEXT)
  FROM PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION credit_pending_recommendation(UUID, BIGINT, TEXT, UUID, UUID, NUMERIC, TEXT)
  TO service_role;


-- ── 7. admin_review_kyc — state machine guard ─────────────────────────────
-- Only allows approve/reject from kyc_submitted state. Prevents downgrading
-- an already-verified user or double-approving. If admin made a mistake,
-- the correct path is to ask the user to re-submit (submit_kyc resets to pending).
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

  -- State guard: only transition from 'pending' (kyc_submitted)
  UPDATE kyc_submissions
     SET status      = CASE WHEN p_action = 'approve' THEN 'approved' ELSE 'rejected' END,
         reviewed_at = now(),
         reviewer_id = auth.uid()
   WHERE user_id = p_user_id
     AND status  = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'kyc_not_pending_or_not_found: %', p_user_id;
  END IF;

  -- State guard on users row: only advance from kyc_submitted
  UPDATE users
     SET kyc_status = v_new_tier
   WHERE id         = p_user_id
     AND kyc_status = 'kyc_submitted';

  IF p_action = 'approve' THEN
    PERFORM gen_affiliate_code(p_user_id);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_review_kyc(UUID, TEXT, TEXT) TO authenticated;


-- ── 8. submit_kyc — advisory lock ─────────────────────────────────────────
-- Adds a per-user transaction-scoped advisory lock to prevent concurrent
-- parallel submissions from the same user racing through the upsert.
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

  -- Serialize concurrent submissions from the same user
  PERFORM pg_advisory_xact_lock(hashtext('kyc_submit:' || p_user_id::text));

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

  UPDATE users
     SET kyc_status = 'kyc_submitted'
   WHERE id         = p_user_id
     AND kyc_status IN ('profile_complete', 'kyc_submitted');
END;
$$;

GRANT EXECUTE ON FUNCTION submit_kyc(UUID, TEXT, TEXT, TEXT) TO authenticated;


-- ── 9. submit_recommendation — atomic check-and-insert ───────────────────
-- Single RPC replaces the 3-step Node.js flow (checkDailyLimit + ilike +
-- insert). Advisory lock serializes concurrent requests from the same user,
-- making both the count check and the duplicate check atomic.
CREATE OR REPLACE FUNCTION submit_recommendation(
  p_vendor_name    TEXT,
  p_description    TEXT,
  p_state          TEXT DEFAULT NULL,
  p_category_id    UUID DEFAULT NULL,
  p_vendor_address TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_count   INT;
  v_rec_id  UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
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

  -- Duplicate detection: same vendor name (case-insensitive) from same user
  IF EXISTS (
    SELECT 1 FROM vendor_recommendations
     WHERE recommender_id = v_user_id
       AND lower(vendor_name) = lower(p_vendor_name)
  ) THEN
    RAISE EXCEPTION 'duplicate: already recommended a vendor with this name';
  END IF;

  INSERT INTO vendor_recommendations
    (recommender_id, vendor_name, description, state, category_id, vendor_address, status)
  VALUES
    (v_user_id, p_vendor_name, p_description, p_state, p_category_id, p_vendor_address, 'pending')
  RETURNING id INTO v_rec_id;

  RETURN v_rec_id;
END;
$$;

GRANT EXECUTE ON FUNCTION submit_recommendation(TEXT, TEXT, TEXT, UUID, TEXT) TO authenticated;
