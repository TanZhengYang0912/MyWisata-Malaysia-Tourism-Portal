-- Recommendation rewards are created into pending_earnings_sen. This function
-- is the only path that moves them to withdrawable earnings or reverses them
-- after a cancelled/refunded source order. It owns the commission, wallet and
-- ledger writes in one transaction so repeated admin/cron runs are idempotent.

ALTER TABLE public.email_outbox
  DROP CONSTRAINT IF EXISTS email_outbox_event_type_check;

ALTER TABLE public.email_outbox
  ADD CONSTRAINT email_outbox_event_type_check CHECK (event_type IN (
    'checkout_succeeded', 'topup_succeeded',
    'withdrawal_submitted', 'withdrawal_approved', 'withdrawal_paid',
    'withdrawal_failed', 'withdrawal_rejected',
    'account_suspended', 'account_unsuspended', 'account_deleted', 'account_restored',
    'recommendation_reward_pending', 'recommendation_reward_available', 'recommendation_reward_reversed'
  ));

CREATE OR REPLACE FUNCTION public.clear_matured_recommendation_rewards()
RETURNS TABLE (
  commission_id UUID,
  user_id UUID,
  order_id UUID,
  action TEXT,
  amount_sen BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reward RECORD;
  v_wallet_id UUID;
  v_wallet_pending BIGINT;
  v_amount_sen BIGINT;
  v_available_txn_id UUID;
BEGIN
  FOR v_reward IN
    SELECT
      rc.id,
      rc.recommender_id,
      rc.order_id,
      ROUND(rc.amount * 100)::BIGINT AS amount_sen,
      LOWER(COALESCE(o.status, '')) AS order_status,
      u.tier,
      u.kyc_status
    FROM public.recommendation_commissions rc
    JOIN public.users u ON u.id = rc.recommender_id
    LEFT JOIN public.orders o ON o.id = rc.order_id
    WHERE rc.status = 'pending'
      AND rc.hold_until IS NOT NULL
      AND rc.hold_until <= now()
    ORDER BY rc.hold_until, rc.id
    FOR UPDATE OF rc SKIP LOCKED
  LOOP
    commission_id := v_reward.id;
    user_id := v_reward.recommender_id;
    order_id := v_reward.order_id;
    amount_sen := v_reward.amount_sen;

    -- A cancelled/refunded purchase cannot produce a commission, irrespective
    -- of the recommender's current KYC state.
    IF v_reward.order_status IN ('cancelled', 'refunded') THEN
      SELECT id, pending_earnings_sen
        INTO v_wallet_id, v_wallet_pending
        FROM public.wallets
       WHERE user_id = v_reward.recommender_id
       FOR UPDATE;
      IF NOT FOUND THEN
        action := 'skipped_wallet';
        RETURN NEXT;
        CONTINUE;
      END IF;
      IF v_wallet_pending < v_reward.amount_sen THEN
        RAISE EXCEPTION 'pending_wallet_balance_mismatch for recommendation commission %', v_reward.id;
      END IF;

      UPDATE public.wallets
         SET pending_earnings_sen = pending_earnings_sen - v_reward.amount_sen,
             updated_at = now()
       WHERE id = v_wallet_id;

      INSERT INTO public.wallet_transactions
        (user_id, wallet_id, type, amount_sen, bucket, direction, note)
      VALUES
        (v_reward.recommender_id, v_wallet_id, 'earnings_reverse', v_reward.amount_sen,
         'pending_earnings', 'debit', 'Recommendation reward reversed — order cancelled or refunded');

      UPDATE public.recommendation_commissions
         SET status = 'reversed', reversed_at = now()
       WHERE id = v_reward.id AND status = 'pending';

      action := 'reversed';
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- A missing order is not silently rewarded. It remains pending for manual
    -- reconciliation, preserving both the commission and wallet evidence.
    IF v_reward.order_id IS NOT NULL AND v_reward.order_status = '' THEN
      action := 'skipped_missing_order';
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- KYC blocks release, not accrual. Pending rewards become available when
    -- the customer eventually reaches the approved KYC tier.
    IF v_reward.tier <> 'kyc_verified' OR v_reward.kyc_status <> 'approved' THEN
      action := 'skipped_kyc';
      RETURN NEXT;
      CONTINUE;
    END IF;

    SELECT id, pending_earnings_sen
      INTO v_wallet_id, v_wallet_pending
      FROM public.wallets
     WHERE user_id = v_reward.recommender_id
     FOR UPDATE;
    IF NOT FOUND THEN
      action := 'skipped_wallet';
      RETURN NEXT;
      CONTINUE;
    END IF;
    IF v_wallet_pending < v_reward.amount_sen THEN
      RAISE EXCEPTION 'pending_wallet_balance_mismatch for recommendation commission %', v_reward.id;
    END IF;

    UPDATE public.wallets
       SET pending_earnings_sen = pending_earnings_sen - v_reward.amount_sen,
           earnings_sen = earnings_sen + v_reward.amount_sen,
           updated_at = now()
     WHERE id = v_wallet_id;

    INSERT INTO public.wallet_transactions
      (user_id, wallet_id, type, amount_sen, bucket, direction, note)
    VALUES
      (v_reward.recommender_id, v_wallet_id, 'earnings_confirm', v_reward.amount_sen,
       'pending_earnings', 'debit', 'Recommendation reward hold cleared');

    INSERT INTO public.wallet_transactions
      (user_id, wallet_id, type, amount_sen, bucket, direction, note)
    VALUES
      (v_reward.recommender_id, v_wallet_id, 'earnings_confirm', v_reward.amount_sen,
       'earnings', 'credit', 'Recommendation reward available after hold period')
    RETURNING id INTO v_available_txn_id;

    UPDATE public.recommendation_commissions
       SET status = 'confirmed', confirmed_at = now(), wallet_txn_id = v_available_txn_id
     WHERE id = v_reward.id AND status = 'pending';

    action := 'cleared';
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_matured_recommendation_rewards() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_matured_recommendation_rewards() TO service_role;
