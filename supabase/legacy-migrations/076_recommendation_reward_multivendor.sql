-- 076 — Multi-vendor recommendation reward settlement
--
-- A checkout can contain items from several vendors. Reward attribution is
-- keyed by (conversion, order) and must use each vendor's own line subtotal,
-- never the full order total. This migration adds the supporting index and an
-- immediate, idempotent reversal path for cancelled/refunded orders.

CREATE INDEX IF NOT EXISTS recommendation_conversions_active_vendor_idx
  ON public.recommendation_conversions (converted_vendor_id, attribution_ends_at, converted_at DESC);

CREATE OR REPLACE FUNCTION public.reverse_recommendation_rewards_for_order(
  p_order_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_commission RECORD;
  v_wallet_id UUID;
  v_pending BIGINT;
  v_amount BIGINT;
  v_reversed INTEGER := 0;
BEGIN
  FOR v_commission IN
    SELECT rc.id, rc.recommender_id, ROUND(rc.amount * 100)::BIGINT AS amount_sen
      FROM public.recommendation_commissions rc
     WHERE rc.order_id = p_order_id
       AND rc.status = 'pending'
     ORDER BY rc.id
     FOR UPDATE OF rc
  LOOP
    SELECT w.id, w.pending_earnings_sen
      INTO v_wallet_id, v_pending
      FROM public.wallets w
     WHERE w.user_id = v_commission.recommender_id
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'wallet_not_found for recommendation commission %', v_commission.id;
    END IF;

    v_amount := v_commission.amount_sen;
    IF v_pending < v_amount THEN
      RAISE EXCEPTION 'pending_wallet_balance_mismatch for recommendation commission %', v_commission.id;
    END IF;

    UPDATE public.wallets
       SET pending_earnings_sen = pending_earnings_sen - v_amount,
           updated_at = now()
     WHERE id = v_wallet_id;

    INSERT INTO public.wallet_transactions
      (user_id, wallet_id, type, amount_sen, bucket, direction, note)
    VALUES
      (v_commission.recommender_id, v_wallet_id, 'earnings_reverse', v_amount,
       'pending_earnings', 'debit',
       'Recommendation reward reversed — order cancelled or refunded');

    UPDATE public.recommendation_commissions
       SET status = 'reversed', reversed_at = now()
     WHERE id = v_commission.id AND status = 'pending';

    INSERT INTO public.notifications (user_id, type, title, body, link)
    SELECT v_commission.recommender_id,
           'recommendation_reward_reversed',
           'Your pending recommendation reward was reversed',
           'RM ' || to_char(v_amount / 100.0, 'FM999999990.00') || ' was reversed because the related order was cancelled or refunded. Reference: ' || v_commission.id::text,
           '/customer/wallet'
     WHERE NOT EXISTS (
       SELECT 1 FROM public.notifications n
        WHERE n.user_id = v_commission.recommender_id
          AND n.type = 'recommendation_reward_reversed'
          AND n.link = '/customer/wallet'
          AND n.created_at >= now() - interval '5 minutes'
          AND n.body LIKE '%' || v_commission.id::text || '%'
     );

    INSERT INTO public.email_outbox
      (event_key, user_id, to_email, event_type, payload)
    SELECT 'recommendation_reward_reversed:' || v_commission.id::text,
           u.id,
           u.email,
           'recommendation_reward_reversed',
           jsonb_build_object(
             'amountRm', v_amount / 100.0,
             'reference', 'Recommendation reward',
             'orderId', p_order_id
           )
      FROM public.users u
     WHERE u.id = v_commission.recommender_id
       AND NULLIF(trim(u.email), '') IS NOT NULL
    ON CONFLICT (event_key) DO NOTHING;

    v_reversed := v_reversed + 1;
  END LOOP;

  RETURN v_reversed;
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_recommendation_rewards_for_order(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_recommendation_rewards_for_order(UUID)
  TO service_role;

CREATE OR REPLACE FUNCTION public.reverse_recommendation_rewards_on_order_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status IN ('cancelled', 'refunded')
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.reverse_recommendation_rewards_for_order(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recommendation_rewards_order_status_reversal ON public.orders;
CREATE TRIGGER recommendation_rewards_order_status_reversal
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.reverse_recommendation_rewards_on_order_status();
