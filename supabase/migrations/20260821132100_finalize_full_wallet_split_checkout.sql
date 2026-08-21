-- A wallet split with no external remainder is fully funded by the existing
-- reservation. It may settle as a wallet payment; a non-zero remainder must
-- continue through the provider-confirmation path.

CREATE OR REPLACE FUNCTION public.finalize_customer_wallet_checkout(
  p_checkout_session_id UUID,
  p_outcome TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_session public.checkout_sessions%ROWTYPE;
  v_reservation public.checkout_wallet_reservations%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_result JSONB;
  v_total_sen BIGINT;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'checkout_auth_required'; END IF;
  IF LOWER(COALESCE(p_outcome, '')) NOT IN ('succeeded', 'failed', 'cancelled', 'expired') THEN
    RAISE EXCEPTION 'invalid_checkout_outcome';
  END IF;

  SELECT * INTO v_session
    FROM public.checkout_sessions
   WHERE id = p_checkout_session_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'checkout_session_not_found'; END IF;
  IF v_session.user_id <> v_user THEN RAISE EXCEPTION 'checkout_not_owned'; END IF;

  IF v_session.payment_method = 'wallet_split' THEN
    IF LOWER(COALESCE(p_outcome, '')) <> 'succeeded' THEN
      RAISE EXCEPTION 'provider_confirmation_required';
    END IF;

    SELECT * INTO v_reservation
      FROM public.checkout_wallet_reservations
     WHERE checkout_session_id = p_checkout_session_id
     FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'provider_confirmation_required'; END IF;

    v_total_sen := ROUND(v_session.total_amount * 100)::BIGINT;
    IF v_reservation.user_id <> v_session.user_id
       OR v_reservation.status <> 'reserved'
       OR v_reservation.topup_amount_sen + v_reservation.earnings_amount_sen <> v_total_sen THEN
      RAISE EXCEPTION 'provider_confirmation_required';
    END IF;

    SELECT * INTO v_payment
      FROM public.payments
     WHERE order_id = v_session.order_id
     ORDER BY created_at DESC
     LIMIT 1
     FOR UPDATE;
    IF NOT FOUND OR v_payment.amount <> 0 THEN
      RAISE EXCEPTION 'provider_confirmation_required';
    END IF;
  ELSIF v_session.payment_method <> 'wallet' THEN
    RAISE EXCEPTION 'provider_confirmation_required';
  END IF;

  v_result := public.finalize_checkout(p_checkout_session_id, LOWER(p_outcome), NULL, NULL);
  IF LOWER(p_outcome) = 'cancelled' THEN
    UPDATE public.checkout_sessions SET status = 'cancelled', updated_at = NOW()
     WHERE id = p_checkout_session_id AND status = 'failed';
    UPDATE public.payments SET status = 'cancelled', failure_reason = 'cancelled', updated_at = NOW()
     WHERE order_id = v_session.order_id AND status = 'failed';
    v_result := v_result || jsonb_build_object('status', 'cancelled');
  END IF;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_customer_wallet_checkout(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_customer_wallet_checkout(UUID, TEXT) TO authenticated;
