-- ============================================================
-- 015_reward_fix.sql — Fix for 014 partial apply
--
-- Migration 014 failed at the wallet_transactions type constraint
-- because pg_get_constraintdef stores CHECK (col IN (...)) as
-- CHECK ((col = ANY (ARRAY[...]))) — the LIKE '%type IN%' pattern
-- never matched, so the DROP was skipped and ADD CONSTRAINT
-- hit "already exists".
--
-- This migration uses DROP CONSTRAINT IF EXISTS directly (name is
-- deterministic from Postgres naming convention) and re-runs
-- everything from 014 that didn't execute after the failure.
-- All statements are IF NOT EXISTS / CREATE OR REPLACE — idempotent.
-- ============================================================


-- ── 1. Fix wallet_transactions type CHECK ────────────────────────────────────
ALTER TABLE wallet_transactions
  DROP CONSTRAINT IF EXISTS wallet_transactions_type_check;

ALTER TABLE wallet_transactions
  ADD CONSTRAINT wallet_transactions_type_check
  CHECK (type IN (
    'topup',
    'spend',
    'earnings',
    'withdrawal_reserve',
    'withdrawal_complete',
    'withdrawal_cancel',
    'earnings_pending',
    'earnings_confirm',
    'earnings_reverse'
  ));


-- ── 2. Fix wallet_transactions bucket CHECK ──────────────────────────────────
ALTER TABLE wallet_transactions
  DROP CONSTRAINT IF EXISTS wallet_transactions_bucket_check;

ALTER TABLE wallet_transactions
  ADD CONSTRAINT wallet_transactions_bucket_check
  CHECK (bucket IN ('topup', 'earnings', 'pending_earnings'));


-- ── 3. affiliate_attributions — hold window columns (from 014) ───────────────
ALTER TABLE affiliate_attributions
  ADD COLUMN IF NOT EXISTS hold_until   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversed_at  TIMESTAMPTZ;


-- ── 4. affiliate_links UNIQUE(user_id) (from 014) ────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'affiliate_links'::regclass
       AND contype  = 'u'
       AND conname  = 'affiliate_links_user_id_unique'
  ) THEN
    DELETE FROM affiliate_links al
     WHERE id NOT IN (
       SELECT DISTINCT ON (user_id) id
         FROM affiliate_links
        ORDER BY user_id, created_at ASC
     );
    ALTER TABLE affiliate_links
      ADD CONSTRAINT affiliate_links_user_id_unique UNIQUE (user_id);
  END IF;
END $$;


-- ── 5. credit_pending_earnings (from 014) ────────────────────────────────────
CREATE OR REPLACE FUNCTION credit_pending_earnings(
  p_user_id    UUID,
  p_amount_sen BIGINT,
  p_ref_id     UUID DEFAULT NULL,
  p_note       TEXT DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_wallet_id UUID;
BEGIN
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
     COALESCE(p_note, 'Commission credited — pending hold period'));
END;
$$;

GRANT EXECUTE ON FUNCTION credit_pending_earnings(UUID, BIGINT, UUID, TEXT) TO service_role;


-- ── 6. confirm_pending_earnings (from 014) ───────────────────────────────────
CREATE OR REPLACE FUNCTION confirm_pending_earnings()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_rec        RECORD;
  v_wallet_id  UUID;
  v_amount_sen BIGINT;
  v_confirmed  INT := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  FOR v_rec IN
    SELECT
      aa.id                                         AS attr_id,
      al.user_id                                    AS user_id,
      ROUND(aa.commission_amount * 100)::BIGINT     AS amount_sen
    FROM  affiliate_attributions aa
    JOIN  affiliate_clicks       ac ON ac.id = aa.click_id
    JOIN  affiliate_links        al ON al.id = ac.link_id
    WHERE aa.status    = 'pending'
      AND aa.hold_until IS NOT NULL
      AND aa.hold_until <= now()
    FOR UPDATE OF aa
  LOOP
    SELECT id INTO v_wallet_id
      FROM wallets WHERE user_id = v_rec.user_id FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;

    v_amount_sen := LEAST(v_rec.amount_sen,
      (SELECT pending_earnings_sen FROM wallets WHERE id = v_wallet_id));

    UPDATE wallets
       SET pending_earnings_sen = pending_earnings_sen - v_amount_sen,
           earnings_sen         = earnings_sen + v_amount_sen,
           updated_at           = now()
     WHERE id = v_wallet_id;

    INSERT INTO wallet_transactions
      (user_id, wallet_id, type, amount_sen, bucket, direction, note)
    VALUES
      (v_rec.user_id, v_wallet_id, 'earnings_confirm', v_amount_sen,
       'pending_earnings', 'debit',
       'Commission hold cleared — moving to available');

    INSERT INTO wallet_transactions
      (user_id, wallet_id, type, amount_sen, bucket, direction, note)
    VALUES
      (v_rec.user_id, v_wallet_id, 'earnings_confirm', v_amount_sen,
       'earnings', 'credit',
       'Commission available after hold period');

    UPDATE affiliate_attributions
       SET status       = 'confirmed',
           confirmed_at = now()
     WHERE id = v_rec.attr_id;

    v_confirmed := v_confirmed + 1;
  END LOOP;

  RETURN v_confirmed;
END;
$$;

GRANT EXECUTE ON FUNCTION confirm_pending_earnings() TO authenticated;


-- ── 7. reverse_pending_earnings (from 014) ───────────────────────────────────
CREATE OR REPLACE FUNCTION reverse_pending_earnings(
  p_attribution_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_user_id    UUID;
  v_wallet_id  UUID;
  v_amount_sen BIGINT;
BEGIN
  SELECT
    al.user_id,
    ROUND(aa.commission_amount * 100)::BIGINT
  INTO v_user_id, v_amount_sen
  FROM  affiliate_attributions aa
  JOIN  affiliate_clicks       ac ON ac.id = aa.click_id
  JOIN  affiliate_links        al ON al.id = ac.link_id
  WHERE aa.id     = p_attribution_id
    AND aa.status = 'pending'
  FOR UPDATE OF aa;

  IF NOT FOUND THEN RETURN FALSE; END IF;

  SELECT id INTO v_wallet_id
    FROM wallets WHERE user_id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  UPDATE wallets
     SET pending_earnings_sen = pending_earnings_sen - LEAST(v_amount_sen, pending_earnings_sen),
         updated_at           = now()
   WHERE id = v_wallet_id;

  INSERT INTO wallet_transactions
    (user_id, wallet_id, type, amount_sen, bucket, direction, note)
  VALUES
    (v_user_id, v_wallet_id, 'earnings_reverse', v_amount_sen,
     'pending_earnings', 'debit',
     'Pending commission reversed — order refunded');

  UPDATE affiliate_attributions
     SET status      = 'reversed',
         reversed_at = now()
   WHERE id = p_attribution_id;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION reverse_pending_earnings(UUID) TO service_role;


-- ── 8. gen_affiliate_code (from 014) ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION gen_affiliate_code(
  p_user_id UUID
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_code    TEXT;
  v_attempt INT := 0;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() AND NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT affiliate_code INTO v_code
    FROM affiliate_links
   WHERE user_id = p_user_id AND is_active = TRUE
   LIMIT 1;
  IF FOUND THEN RETURN v_code; END IF;

  LOOP
    v_code := 'AF-' || upper(substring(encode(gen_random_bytes(4), 'hex') FROM 1 FOR 6));
    BEGIN
      INSERT INTO affiliate_links (user_id, affiliate_code)
      VALUES (p_user_id, v_code);
      RETURN v_code;
    EXCEPTION WHEN unique_violation THEN
      v_attempt := v_attempt + 1;
      IF v_attempt >= 5 THEN
        RAISE EXCEPTION 'affiliate_code_collision after 5 attempts';
      END IF;
    END;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION gen_affiliate_code(UUID) TO authenticated;


-- ── 9. Commission tier rules (from 014) ──────────────────────────────────────
UPDATE commission_rules
   SET is_active = FALSE
 WHERE rule_type = 'affiliate' AND tier_name = 'standard';

INSERT INTO commission_rules (name, rule_type, one_time_bonus, ongoing_rate, tier_name, min_conversions)
SELECT 'Affiliate Bronze', 'affiliate', 0, 0.0300, 'bronze', 0
WHERE NOT EXISTS (SELECT 1 FROM commission_rules WHERE rule_type = 'affiliate' AND tier_name = 'bronze');

INSERT INTO commission_rules (name, rule_type, one_time_bonus, ongoing_rate, tier_name, min_conversions)
SELECT 'Affiliate Silver', 'affiliate', 0, 0.0400, 'silver', 4
WHERE NOT EXISTS (SELECT 1 FROM commission_rules WHERE rule_type = 'affiliate' AND tier_name = 'silver');

INSERT INTO commission_rules (name, rule_type, one_time_bonus, ongoing_rate, tier_name, min_conversions)
SELECT 'Affiliate Gold', 'affiliate', 0, 0.0500, 'gold', 8
WHERE NOT EXISTS (SELECT 1 FROM commission_rules WHERE rule_type = 'affiliate' AND tier_name = 'gold');

INSERT INTO commission_rules (name, rule_type, one_time_bonus, ongoing_rate, tier_name, min_conversions)
SELECT 'Recommendation Standard', 'recommendation', 50.00, 0.0300, 'standard', 0
WHERE NOT EXISTS (SELECT 1 FROM commission_rules WHERE rule_type = 'recommendation' AND tier_name = 'standard');


-- ── 10. Platform settings (from 014) ─────────────────────────────────────────
INSERT INTO platform_settings (key, value, description)
SELECT 'earnings.hold_days', '7',
       'Days to hold affiliate commission in pending state before clearing to available'
WHERE NOT EXISTS (SELECT 1 FROM platform_settings WHERE key = 'earnings.hold_days');
