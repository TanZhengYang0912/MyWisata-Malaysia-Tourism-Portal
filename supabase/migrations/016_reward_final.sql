-- ============================================================
-- 016_reward_final.sql — Final reward system fixes
--
-- 1. wallets.pending_earnings_sen — missed because 014 rolled back
--    entirely when the ADD CONSTRAINT failed (Supabase SQL Editor
--    runs the whole script as one transaction).
-- 2. Correct affiliate tier commission rates and min_conversions
--    (pre-existing Bronze/Silver/Gold rows have wrong values).
-- ============================================================


-- ── 1. wallets.pending_earnings_sen ──────────────────────────────────────────
ALTER TABLE wallets
  ADD COLUMN IF NOT EXISTS pending_earnings_sen BIGINT NOT NULL DEFAULT 0
    CHECK (pending_earnings_sen >= 0);

-- Also update credit_pending_earnings (may have been created before the
-- column existed and cached a stale plan — CREATE OR REPLACE forces re-parse)
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

-- Also update confirm_pending_earnings to reference the now-existing column
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


-- ── 2. Correct affiliate tier rates ──────────────────────────────────────────
-- Pre-existing Bronze/Silver/Gold rows have wrong rates and min_conversions.
-- Spec: Bronze 0+ → 3%, Silver 4+ → 4%, Gold 8+ → 5%.
UPDATE commission_rules
   SET ongoing_rate = 0.0300, min_conversions = 0
 WHERE rule_type = 'affiliate' AND tier_name = 'bronze';

UPDATE commission_rules
   SET ongoing_rate = 0.0400, min_conversions = 4
 WHERE rule_type = 'affiliate' AND tier_name = 'silver';

UPDATE commission_rules
   SET ongoing_rate = 0.0500, min_conversions = 8
 WHERE rule_type = 'affiliate' AND tier_name = 'gold';
