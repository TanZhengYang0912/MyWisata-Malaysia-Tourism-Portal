-- Wallet and withdrawal governance foundation.
-- Additive only: existing wallet amounts and historical requests are preserved.

ALTER TABLE public.wallets
  ADD COLUMN IF NOT EXISTS reserved_earnings_sen BIGINT NOT NULL DEFAULT 0
    CHECK (reserved_earnings_sen >= 0),
  ADD COLUMN IF NOT EXISTS withdrawn_earnings_sen BIGINT NOT NULL DEFAULT 0
    CHECK (withdrawn_earnings_sen >= 0);

-- Historical requests already deducted earnings when submitted. Backfill only the
-- reserved projection, never deduct earnings a second time.
UPDATE public.wallets w
SET reserved_earnings_sen = active.total_sen
FROM (
  SELECT wallet_id, SUM(ROUND(amount * 100))::BIGINT AS total_sen
  FROM public.withdrawal_requests
  WHERE status IN ('pending', 'approved', 'processing')
  GROUP BY wallet_id
) active
WHERE active.wallet_id = w.id
  AND w.reserved_earnings_sen = 0;

ALTER TABLE public.withdrawal_requests
  ADD COLUMN IF NOT EXISTS overdue_from_status TEXT,
  ADD COLUMN IF NOT EXISTS customer_reason TEXT,
  ADD COLUMN IF NOT EXISTS customer_visible_at TIMESTAMPTZ;

ALTER TABLE public.withdrawal_requests
  DROP CONSTRAINT IF EXISTS withdrawal_requests_status_check;

ALTER TABLE public.withdrawal_requests
  ADD CONSTRAINT withdrawal_requests_status_check
  CHECK (status IN (
    'pending', 'pending_second_approval', 'approved', 'processing',
    'hold', 'overdue', 'rejected', 'paid', 'completed', 'failed'
  ));

-- A user may have one request that still holds funds or awaits review.
CREATE UNIQUE INDEX IF NOT EXISTS withdrawal_requests_one_active_per_user
  ON public.withdrawal_requests (user_id)
  WHERE status IN ('pending', 'pending_second_approval', 'approved', 'processing', 'hold', 'overdue');

ALTER TABLE public.wallet_transactions
  ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS wallet_transactions_user_idempotency_key
  ON public.wallet_transactions (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.wallet_transactions
  DROP CONSTRAINT IF EXISTS wallet_transactions_type_check,
  DROP CONSTRAINT IF EXISTS wallet_transactions_bucket_check,
  DROP CONSTRAINT IF EXISTS wt_bucket_type_consistent;

ALTER TABLE public.wallet_transactions
  ADD CONSTRAINT wallet_transactions_type_check
  CHECK (type IN (
    'topup', 'spend', 'earnings',
    'withdrawal_reserve', 'withdrawal_complete', 'withdrawal_cancel',
    'earnings_pending', 'earnings_confirm', 'earnings_reverse',
    'refund', 'adjustment_credit', 'adjustment_debit'
  )),
  ADD CONSTRAINT wallet_transactions_bucket_check
  CHECK (bucket IN ('topup', 'earnings', 'pending_earnings')),
  ADD CONSTRAINT wt_bucket_type_consistent
  CHECK (
    (type = 'topup'               AND bucket = 'topup') OR
    (type = 'spend'               AND bucket IN ('topup', 'earnings')) OR
    (type = 'earnings'            AND bucket = 'earnings') OR
    (type = 'withdrawal_reserve'  AND bucket = 'earnings') OR
    (type = 'withdrawal_complete' AND bucket = 'earnings') OR
    (type = 'withdrawal_cancel'   AND bucket = 'earnings') OR
    (type = 'earnings_pending'    AND bucket = 'pending_earnings') OR
    (type = 'earnings_confirm'    AND bucket IN ('earnings', 'pending_earnings')) OR
    (type = 'earnings_reverse'    AND bucket = 'pending_earnings') OR
    (type = 'refund'              AND bucket IN ('topup', 'earnings')) OR
    (type = 'adjustment_credit'   AND bucket IN ('topup', 'earnings')) OR
    (type = 'adjustment_debit'    AND bucket IN ('topup', 'earnings'))
  );

INSERT INTO public.platform_settings (key, value, description)
VALUES
  ('wallet.clearance_days', '7', 'Reward clearance window in days for new rewards'),
  ('withdrawal.min_amount_sen', '5000', 'Minimum withdrawal in sen'),
  ('withdrawal.dual_approval_threshold_sen', '50000', 'Withdrawal amount requiring two approvers in sen'),
  ('withdrawal.escalation_hours', '48', 'Hours before a pending withdrawal becomes overdue'),
  ('withdrawal.hold_escalation_hours', '168', 'Hours before a held withdrawal becomes overdue')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.wallet_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id),
  wallet_transaction_id UUID NOT NULL REFERENCES public.wallet_transactions(id),
  actor_id UUID NOT NULL REFERENCES public.users(id),
  reason TEXT NOT NULL CHECK (char_length(BTRIM(reason)) >= 10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.withdrawal_risk_assessments (
  withdrawal_id UUID PRIMARY KEY REFERENCES public.withdrawal_requests(id) ON DELETE CASCADE,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'review', 'high')),
  snapshot JSONB NOT NULL,
  overridden_by UUID REFERENCES public.users(id),
  override_reason TEXT CHECK (override_reason IS NULL OR char_length(BTRIM(override_reason)) >= 10),
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  overridden_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.monthly_payout_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start DATE NOT NULL UNIQUE,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kuala_Lumpur',
  summary JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  generated_by TEXT NOT NULL CHECK (generated_by IN ('scheduler', 'super_admin'))
);

ALTER TABLE public.wallet_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawal_risk_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_payout_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wallet_adjustments_admin_read ON public.wallet_adjustments;
CREATE POLICY wallet_adjustments_admin_read ON public.wallet_adjustments
  FOR SELECT USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS withdrawal_risk_assessments_approver_read ON public.withdrawal_risk_assessments;
CREATE POLICY withdrawal_risk_assessments_approver_read ON public.withdrawal_risk_assessments
  FOR SELECT USING (public.is_approver(auth.uid()));

DROP POLICY IF EXISTS monthly_payout_reports_super_admin_read ON public.monthly_payout_reports;
CREATE POLICY monthly_payout_reports_super_admin_read ON public.monthly_payout_reports
  FOR SELECT USING (public.is_super_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS withdrawal_risk_assessments_level_idx
  ON public.withdrawal_risk_assessments (risk_level, assessed_at DESC);
CREATE INDEX IF NOT EXISTS monthly_payout_reports_period_idx
  ON public.monthly_payout_reports (period_start DESC);

-- Wallet checkout settlement. The session, Wallet row, stock/booking reservation,
-- payment and ledger rows are all locked and changed in this one transaction.
-- A client can choose the method, but cannot supply the amount or wallet buckets.
CREATE OR REPLACE FUNCTION public.finalize_checkout(
  p_checkout_session_id UUID,
  p_outcome TEXT,
  p_provider_payment_id TEXT DEFAULT NULL,
  p_provider_event_id TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user UUID := auth.uid();
  v_session checkout_sessions%ROWTYPE;
  v_reservation RECORD;
  v_hold voucher_holds%ROWTYPE;
  v_payment_id UUID;
  v_wallet wallets%ROWTYPE;
  v_total_sen BIGINT;
  v_topup_sen BIGINT;
  v_earnings_sen BIGINT;
BEGIN
  IF v_user IS NULL AND COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'checkout_auth_required';
  END IF;

  SELECT * INTO v_session
    FROM public.checkout_sessions
   WHERE id = p_checkout_session_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'checkout_session_not_found'; END IF;
  IF v_user IS NOT NULL AND v_user <> v_session.user_id AND NOT is_admin(v_user) THEN
    RAISE EXCEPTION 'checkout_not_owned';
  END IF;
  IF v_session.status = 'paid' THEN
    RETURN jsonb_build_object('checkout_session_id', v_session.id, 'order_id', v_session.order_id, 'status', 'paid');
  END IF;
  IF v_session.status IN ('failed', 'expired', 'cancelled') THEN
    RETURN jsonb_build_object('checkout_session_id', v_session.id, 'order_id', v_session.order_id, 'status', v_session.status);
  END IF;

  SELECT id INTO v_payment_id
    FROM public.payments
   WHERE order_id = v_session.order_id
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF lower(p_outcome) IN ('failed', 'cancelled', 'expired') THEN
    FOR v_reservation IN
      SELECT * FROM public.checkout_reservations
       WHERE checkout_session_id = v_session.id AND status = 'held'
    LOOP
      IF v_reservation.kind = 'inventory' THEN
        UPDATE public.inventory
           SET reserved = GREATEST(0, reserved - v_reservation.quantity), updated_at = NOW()
         WHERE variant_id = v_reservation.variant_id;
      ELSE
        UPDATE public.booking_slots
           SET booked = GREATEST(0, booked - v_reservation.quantity),
               status = CASE
                 WHEN status = 'full' AND booked - v_reservation.quantity < capacity THEN 'available'
                 ELSE status
               END
         WHERE id = v_reservation.slot_id;
        UPDATE public.bookings
           SET status = 'cancelled', cancelled_at = NOW()
         WHERE order_item_id IN (
           SELECT id FROM public.order_items
            WHERE order_id = v_session.order_id AND slot_id = v_reservation.slot_id
         );
      END IF;
      UPDATE public.checkout_reservations SET status = 'released' WHERE id = v_reservation.id;
    END LOOP;
    SELECT * INTO v_hold
      FROM public.voucher_holds
     WHERE checkout_session_id = v_session.id AND status = 'held'
     FOR UPDATE;
    IF v_hold.id IS NOT NULL THEN
      UPDATE public.vouchers
         SET reserved_uses = GREATEST(0, reserved_uses - 1)
       WHERE id = v_hold.voucher_id;
      UPDATE public.voucher_holds SET status = 'released' WHERE id = v_hold.id;
    END IF;
    UPDATE public.payments
       SET status = CASE WHEN lower(p_outcome) = 'expired' THEN 'cancelled' ELSE 'failed' END,
           failure_reason = p_outcome,
           updated_at = NOW()
     WHERE id = v_payment_id;
    UPDATE public.orders
       SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
     WHERE id = v_session.order_id;
    UPDATE public.checkout_sessions
       SET status = CASE WHEN lower(p_outcome) = 'expired' THEN 'expired' ELSE 'failed' END,
           updated_at = NOW()
     WHERE id = v_session.id;
    RETURN jsonb_build_object('checkout_session_id', v_session.id, 'order_id', v_session.order_id, 'status', 'failed');
  END IF;

  IF lower(p_outcome) <> 'succeeded' THEN RAISE EXCEPTION 'invalid_checkout_outcome'; END IF;

  IF v_session.payment_method = 'wallet' THEN
    SELECT * INTO v_wallet
      FROM public.wallets
     WHERE user_id = v_session.user_id
     FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'wallet_not_found'; END IF;

    v_total_sen := ROUND(v_session.total_amount * 100)::BIGINT;
    IF v_total_sen <= 0 THEN RAISE EXCEPTION 'invalid_wallet_total'; END IF;
    IF v_wallet.topup_sen + v_wallet.earnings_sen < v_total_sen THEN
      RAISE EXCEPTION 'wallet_insufficient';
    END IF;

    v_topup_sen := LEAST(v_wallet.topup_sen, v_total_sen);
    v_earnings_sen := v_total_sen - v_topup_sen;
    UPDATE public.wallets
       SET topup_sen = topup_sen - v_topup_sen,
           earnings_sen = earnings_sen - v_earnings_sen,
           updated_at = NOW()
     WHERE id = v_wallet.id;

    IF v_topup_sen > 0 THEN
      INSERT INTO public.wallet_transactions
        (user_id, wallet_id, order_id, idempotency_key, type, amount_sen, bucket, direction, note)
      VALUES
        (v_session.user_id, v_wallet.id, v_session.order_id,
         'wallet-spend:' || v_session.id::text || ':topup',
         'spend', v_topup_sen, 'topup', 'debit', 'Wallet checkout payment')
      ON CONFLICT (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;
    END IF;
    IF v_earnings_sen > 0 THEN
      INSERT INTO public.wallet_transactions
        (user_id, wallet_id, order_id, idempotency_key, type, amount_sen, bucket, direction, note)
      VALUES
        (v_session.user_id, v_wallet.id, v_session.order_id,
         'wallet-spend:' || v_session.id::text || ':earnings',
         'spend', v_earnings_sen, 'earnings', 'debit', 'Wallet checkout payment')
      ON CONFLICT (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;
    END IF;
  END IF;

  FOR v_reservation IN
    SELECT * FROM public.checkout_reservations
     WHERE checkout_session_id = v_session.id AND status = 'held'
  LOOP
    IF v_reservation.kind = 'inventory' THEN
      UPDATE public.inventory
         SET quantity = quantity - v_reservation.quantity,
             reserved = GREATEST(0, reserved - v_reservation.quantity),
             updated_at = NOW()
       WHERE variant_id = v_reservation.variant_id
         AND quantity >= v_reservation.quantity
         AND reserved >= v_reservation.quantity;
      IF NOT FOUND THEN RAISE EXCEPTION 'inventory_commit_failed'; END IF;
    END IF;
    UPDATE public.checkout_reservations SET status = 'committed' WHERE id = v_reservation.id;
  END LOOP;

  SELECT * INTO v_hold
    FROM public.voucher_holds
   WHERE checkout_session_id = v_session.id AND status = 'held'
   FOR UPDATE;
  IF v_hold.id IS NOT NULL THEN
    UPDATE public.vouchers
       SET reserved_uses = GREATEST(0, reserved_uses - 1), uses_count = uses_count + 1
     WHERE id = v_hold.voucher_id;
    INSERT INTO public.voucher_redemptions(voucher_id, order_id, user_id, discount)
      SELECT v_hold.voucher_id, v_session.order_id, v_hold.user_id, discount_amount
        FROM public.orders WHERE id = v_session.order_id
      ON CONFLICT (voucher_id, order_id) DO NOTHING;
    UPDATE public.voucher_holds SET status = 'committed' WHERE id = v_hold.id;
  END IF;

  UPDATE public.payments
     SET status = 'succeeded',
         provider_payment_id = COALESCE(p_provider_payment_id, provider_payment_id),
         processed_at = NOW(), updated_at = NOW()
   WHERE id = v_payment_id;
  UPDATE public.orders
     SET status = 'paid', paid_at = NOW(), updated_at = NOW()
   WHERE id = v_session.order_id;
  UPDATE public.checkout_sessions
     SET status = 'paid', updated_at = NOW()
   WHERE id = v_session.id;
  DELETE FROM public.cart_items ci
   WHERE ci.cart_id = v_session.cart_id
     AND ci.id IN (
       SELECT ci2.id
         FROM public.cart_items ci2
        WHERE ci2.cart_id = v_session.cart_id
          AND EXISTS (
            SELECT 1 FROM public.order_items oi
             WHERE oi.order_id = v_session.order_id
               AND oi.variant_id = ci2.variant_id
               AND oi.slot_id IS NOT DISTINCT FROM ci2.slot_id
          )
     );
  IF p_provider_event_id IS NOT NULL THEN
    INSERT INTO public.payment_events(provider, provider_event_id, checkout_session_id, order_id, event_type)
    VALUES ('stripe', p_provider_event_id, v_session.id, v_session.order_id, 'checkout.finalized')
    ON CONFLICT (provider, provider_event_id) DO NOTHING;
  END IF;
  RETURN jsonb_build_object('checkout_session_id', v_session.id, 'order_id', v_session.order_id, 'status', 'paid');
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_checkout(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_checkout(UUID, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- Super Admin adjustments are the only manual Wallet mutation. They retain a
-- ledger entry, a separate rationale record, audit history and a customer
-- notification in the same transaction.
CREATE OR REPLACE FUNCTION public.apply_wallet_adjustment(
  p_user_id UUID,
  p_bucket TEXT,
  p_direction TEXT,
  p_amount_sen BIGINT,
  p_reason TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_wallet wallets%ROWTYPE;
  v_transaction_id UUID;
  v_before JSONB;
  v_after JSONB;
  v_type TEXT;
BEGIN
  IF v_actor IS NULL OR NOT public.is_super_admin(v_actor) THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;
  IF p_bucket NOT IN ('topup', 'earnings') OR p_direction NOT IN ('credit', 'debit') THEN
    RAISE EXCEPTION 'invalid_wallet_adjustment';
  END IF;
  IF p_amount_sen IS NULL OR p_amount_sen <= 0 THEN
    RAISE EXCEPTION 'invalid_wallet_adjustment_amount';
  END IF;
  IF char_length(BTRIM(COALESCE(p_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'wallet_adjustment_reason_too_short';
  END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_not_found'; END IF;
  v_before := jsonb_build_object('topup_sen', v_wallet.topup_sen, 'earnings_sen', v_wallet.earnings_sen);

  IF p_bucket = 'topup' THEN
    IF p_direction = 'debit' AND v_wallet.topup_sen < p_amount_sen THEN
      RAISE EXCEPTION 'insufficient_wallet_balance';
    END IF;
    UPDATE public.wallets
       SET topup_sen = topup_sen + CASE WHEN p_direction = 'credit' THEN p_amount_sen ELSE -p_amount_sen END,
           updated_at = NOW()
     WHERE id = v_wallet.id;
  ELSE
    IF p_direction = 'debit' AND v_wallet.earnings_sen < p_amount_sen THEN
      RAISE EXCEPTION 'insufficient_wallet_balance';
    END IF;
    UPDATE public.wallets
       SET earnings_sen = earnings_sen + CASE WHEN p_direction = 'credit' THEN p_amount_sen ELSE -p_amount_sen END,
           updated_at = NOW()
     WHERE id = v_wallet.id;
  END IF;

  v_type := CASE WHEN p_direction = 'credit' THEN 'adjustment_credit' ELSE 'adjustment_debit' END;
  INSERT INTO public.wallet_transactions
    (user_id, wallet_id, type, amount_sen, bucket, direction, note)
  VALUES
    (p_user_id, v_wallet.id, v_type, p_amount_sen, p_bucket, p_direction, p_reason)
  RETURNING id INTO v_transaction_id;

  INSERT INTO public.wallet_adjustments(user_id, wallet_transaction_id, actor_id, reason)
  VALUES (p_user_id, v_transaction_id, v_actor, p_reason);

  SELECT jsonb_build_object('topup_sen', topup_sen, 'earnings_sen', earnings_sen)
    INTO v_after FROM public.wallets WHERE id = v_wallet.id;
  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, before_data, after_data, note)
  VALUES (v_actor, 'wallet.adjusted', 'wallet_transaction', v_transaction_id, v_before, v_after, p_reason);
  INSERT INTO public.notifications(user_id, type, title, body, link)
  VALUES (
    p_user_id,
    'wallet_adjustment',
    'Wallet balance adjusted',
    'An administrator made a Wallet adjustment. Open your Wallet for the updated balance.',
    '/customer/wallet'
  );

  RETURN jsonb_build_object(
    'transaction_id', v_transaction_id,
    'topup_sen', v_after ->> 'topup_sen',
    'earnings_sen', v_after ->> 'earnings_sen'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_wallet_adjustment(UUID, TEXT, TEXT, BIGINT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_wallet_adjustment(UUID, TEXT, TEXT, BIGINT, TEXT) TO authenticated;

-- Wallet orders are refunded in full to the same buckets that funded them.
-- This procedure refuses legacy/no-ledger rows rather than guessing a bucket.
CREATE OR REPLACE FUNCTION public.process_wallet_refund(
  p_refund_id UUID,
  p_note TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_refund refunds%ROWTYPE;
  v_payment payments%ROWTYPE;
  v_order orders%ROWTYPE;
  v_wallet wallets%ROWTYPE;
  v_topup_sen BIGINT := 0;
  v_earnings_sen BIGINT := 0;
  v_total_sen BIGINT;
BEGIN
  IF v_actor IS NULL OR NOT public.is_super_admin(v_actor) THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;

  SELECT * INTO v_refund FROM public.refunds WHERE id = p_refund_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'refund_not_found'; END IF;
  IF v_refund.status = 'processed' THEN
    RETURN jsonb_build_object('refund_id', v_refund.id, 'status', 'processed');
  END IF;
  IF v_refund.status <> 'pending' THEN RAISE EXCEPTION 'refund_not_pending'; END IF;

  SELECT * INTO v_payment FROM public.payments WHERE id = v_refund.payment_id FOR UPDATE;
  SELECT * INTO v_order FROM public.orders WHERE id = v_refund.order_id FOR UPDATE;
  IF v_payment.method <> 'wallet' OR v_payment.status <> 'succeeded' THEN
    RAISE EXCEPTION 'wallet_refund_requires_successful_wallet_payment';
  END IF;
  IF ROUND(v_refund.amount * 100)::BIGINT <> ROUND(v_order.total_amount * 100)::BIGINT THEN
    RAISE EXCEPTION 'wallet_refund_must_be_full';
  END IF;
  v_total_sen := ROUND(v_refund.amount * 100)::BIGINT;

  SELECT
    COALESCE(SUM(amount_sen) FILTER (WHERE bucket = 'topup'), 0),
    COALESCE(SUM(amount_sen) FILTER (WHERE bucket = 'earnings'), 0)
  INTO v_topup_sen, v_earnings_sen
  FROM public.wallet_transactions
  WHERE order_id = v_refund.order_id AND type = 'spend' AND direction = 'debit';
  IF v_topup_sen + v_earnings_sen <> v_total_sen THEN
    RAISE EXCEPTION 'wallet_payment_ledger_missing';
  END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_order.user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_not_found'; END IF;
  UPDATE public.wallets
     SET topup_sen = topup_sen + v_topup_sen,
         earnings_sen = earnings_sen + v_earnings_sen,
         updated_at = NOW()
   WHERE id = v_wallet.id;
  IF v_topup_sen > 0 THEN
    INSERT INTO public.wallet_transactions
      (user_id, wallet_id, order_id, idempotency_key, type, amount_sen, bucket, direction, note)
    VALUES
      (v_order.user_id, v_wallet.id, v_order.id,
       'wallet-refund:' || v_refund.id::text || ':topup',
       'refund', v_topup_sen, 'topup', 'credit', COALESCE(p_note, 'Full Wallet order refund'));
  END IF;
  IF v_earnings_sen > 0 THEN
    INSERT INTO public.wallet_transactions
      (user_id, wallet_id, order_id, idempotency_key, type, amount_sen, bucket, direction, note)
    VALUES
      (v_order.user_id, v_wallet.id, v_order.id,
       'wallet-refund:' || v_refund.id::text || ':earnings',
       'refund', v_earnings_sen, 'earnings', 'credit', COALESCE(p_note, 'Full Wallet order refund'));
  END IF;
  UPDATE public.refunds
     SET status = 'processed', processed_by = v_actor, processed_at = NOW(),
         reason = COALESCE(p_note, reason)
   WHERE id = v_refund.id;
  UPDATE public.payments SET status = 'refunded', updated_at = NOW() WHERE id = v_payment.id;
  UPDATE public.orders SET status = 'refunded', updated_at = NOW() WHERE id = v_order.id;
  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, before_data, after_data, note)
  VALUES (
    v_actor, 'wallet.refunded', 'refund', v_refund.id,
    jsonb_build_object('status', 'pending', 'amount_sen', v_total_sen),
    jsonb_build_object('status', 'processed', 'topup_sen', v_topup_sen, 'earnings_sen', v_earnings_sen),
    p_note
  );
  INSERT INTO public.notifications(user_id, type, title, body, link)
  VALUES (
    v_order.user_id,
    'wallet_refund',
    'Wallet refund processed',
    'Your full refund has been returned to the Wallet balance buckets used for the original payment.',
    '/customer/wallet'
  );
  RETURN jsonb_build_object('refund_id', v_refund.id, 'status', 'processed');
END;
$$;

REVOKE ALL ON FUNCTION public.process_wallet_refund(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_wallet_refund(UUID, TEXT) TO authenticated;

-- Customer withdrawal submission has no caller-supplied user id, destination or
-- balance. The user record and Wallet row are locked before the single active
-- request and earnings reserve are created.
CREATE OR REPLACE FUNCTION public.submit_wallet_withdrawal(
  p_amount_sen BIGINT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_user RECORD;
  v_wallet wallets%ROWTYPE;
  v_min_amount_sen BIGINT;
  v_dual_threshold_sen BIGINT;
  v_request_id UUID;
  v_dual BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF p_amount_sen IS NULL OR p_amount_sen <= 0 THEN RAISE EXCEPTION 'amount_must_be_positive'; END IF;

  SELECT tier, kyc_status, stripe_connect_account_id, stripe_payouts_enabled
    INTO v_user
    FROM public.users
   WHERE id = v_user_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'user_not_found'; END IF;
  IF v_user.tier <> 'kyc_verified' OR v_user.kyc_status <> 'approved' THEN
    RAISE EXCEPTION 'kyc_required';
  END IF;
  IF v_user.stripe_connect_account_id IS NULL OR NOT COALESCE(v_user.stripe_payouts_enabled, false) THEN
    RAISE EXCEPTION 'payout_account_required';
  END IF;

  SELECT COALESCE(value::BIGINT, 5000)
    INTO v_min_amount_sen
    FROM public.platform_settings WHERE key = 'withdrawal.min_amount_sen';
  IF p_amount_sen < COALESCE(v_min_amount_sen, 5000) THEN
    RAISE EXCEPTION 'below_min_withdrawal';
  END IF;
  SELECT COALESCE(value::BIGINT, 50000)
    INTO v_dual_threshold_sen
    FROM public.platform_settings WHERE key = 'withdrawal.dual_approval_threshold_sen';
  v_dual := p_amount_sen >= COALESCE(v_dual_threshold_sen, 50000);

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_not_found'; END IF;
  IF v_wallet.earnings_sen < p_amount_sen THEN RAISE EXCEPTION 'insufficient_earnings'; END IF;

  BEGIN
    INSERT INTO public.withdrawal_requests
      (user_id, wallet_id, amount, destination_label, status, requires_dual_approval)
    VALUES
      (v_user_id, v_wallet.id, p_amount_sen::NUMERIC / 100, 'Stripe bank on file', 'pending', v_dual)
    RETURNING id INTO v_request_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'active_withdrawal_exists';
  END;

  UPDATE public.wallets
     SET earnings_sen = earnings_sen - p_amount_sen,
         reserved_earnings_sen = reserved_earnings_sen + p_amount_sen,
         updated_at = NOW()
   WHERE id = v_wallet.id;
  INSERT INTO public.wallet_transactions
    (user_id, wallet_id, type, amount_sen, bucket, direction, withdrawal_id, note)
  VALUES
    (v_user_id, v_wallet.id, 'withdrawal_reserve', p_amount_sen, 'earnings', 'debit',
     v_request_id, 'Withdrawal reserved — pending review');
  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, before_data, after_data, note)
  VALUES (
    v_user_id, 'withdrawal.submitted', 'withdrawal', v_request_id,
    jsonb_build_object('earnings_sen', v_wallet.earnings_sen, 'reserved_earnings_sen', v_wallet.reserved_earnings_sen),
    jsonb_build_object('earnings_sen', v_wallet.earnings_sen - p_amount_sen, 'reserved_earnings_sen', v_wallet.reserved_earnings_sen + p_amount_sen),
    'Customer submitted withdrawal request'
  );
  INSERT INTO public.notifications(user_id, type, title, body, link)
  VALUES (
    v_user_id, 'withdrawal_submitted', 'Withdrawal request submitted',
    'Your withdrawal is pending review. You will receive an update when its status changes.',
    '/customer/wallet'
  );
  RETURN jsonb_build_object('request_id', v_request_id, 'requires_dual_approval', v_dual, 'status', 'pending');
END;
$$;

REVOKE ALL ON FUNCTION public.submit_wallet_withdrawal(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_wallet_withdrawal(BIGINT) TO authenticated;

-- Preserve the old RPC signature for existing Vendor UI, but make it delegate
-- to the secured user-derived procedure rather than retaining a second path.
CREATE OR REPLACE FUNCTION public.debit_withdrawal(
  p_user_id UUID,
  p_amount_rm NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF p_amount_rm IS NULL OR p_amount_rm <= 0 OR p_amount_rm <> TRUNC(p_amount_rm, 2) THEN
    RAISE EXCEPTION 'invalid_withdrawal_amount';
  END IF;
  RETURN public.submit_wallet_withdrawal(public.round_sen(p_amount_rm));
END;
$$;

REVOKE ALL ON FUNCTION public.debit_withdrawal(UUID, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.debit_withdrawal(UUID, NUMERIC) TO authenticated;

-- Rejection releases the exact reserved earnings once, records the reviewer
-- rationale and exposes only that customer-visible rationale to the customer.
CREATE OR REPLACE FUNCTION public.reject_wallet_withdrawal(
  p_id UUID,
  p_reason TEXT,
  p_ip INET DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_request withdrawal_requests%ROWTYPE;
  v_wallet wallets%ROWTYPE;
  v_amount_sen BIGINT;
BEGIN
  IF v_actor IS NULL OR NOT public.is_approver(v_actor) THEN RAISE EXCEPTION 'approver_required'; END IF;
  IF char_length(BTRIM(COALESCE(p_reason, ''))) < 10 THEN RAISE EXCEPTION 'withdrawal_reason_too_short'; END IF;
  SELECT * INTO v_request FROM public.withdrawal_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal_not_found'; END IF;
  IF v_request.user_id = v_actor THEN RAISE EXCEPTION 'self_dealing'; END IF;
  IF v_request.status NOT IN ('pending', 'pending_second_approval', 'approved', 'hold', 'overdue') THEN
    RAISE EXCEPTION 'withdrawal_not_rejectable';
  END IF;
  v_amount_sen := ROUND(v_request.amount * 100)::BIGINT;
  SELECT * INTO v_wallet FROM public.wallets WHERE id = v_request.wallet_id FOR UPDATE;
  IF NOT FOUND OR v_wallet.reserved_earnings_sen < v_amount_sen THEN RAISE EXCEPTION 'withdrawal_reserve_missing'; END IF;

  INSERT INTO public.withdrawal_approvals(request_id, approver_id, action, note)
  VALUES (p_id, v_actor, 'reject', p_reason);
  UPDATE public.wallets
     SET earnings_sen = earnings_sen + v_amount_sen,
         reserved_earnings_sen = reserved_earnings_sen - v_amount_sen,
         updated_at = NOW()
   WHERE id = v_wallet.id;
  INSERT INTO public.wallet_transactions
    (user_id, wallet_id, type, amount_sen, bucket, direction, withdrawal_id, note)
  VALUES
    (v_request.user_id, v_wallet.id, 'withdrawal_cancel', v_amount_sen, 'earnings', 'credit', p_id, p_reason);
  UPDATE public.withdrawal_requests
     SET status = 'rejected', customer_reason = p_reason, customer_visible_at = NOW(), updated_at = NOW()
   WHERE id = p_id;
  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, before_data, after_data, ip_address, note)
  VALUES (
    v_actor, 'withdrawal.rejected', 'withdrawal', p_id,
    jsonb_build_object('status', v_request.status, 'reserved_earnings_sen', v_wallet.reserved_earnings_sen),
    jsonb_build_object('status', 'rejected', 'reserved_earnings_sen', v_wallet.reserved_earnings_sen - v_amount_sen),
    p_ip, p_reason
  );
  INSERT INTO public.notifications(user_id, type, title, body, link)
  VALUES (v_request.user_id, 'withdrawal_rejected', 'Withdrawal request rejected', p_reason, '/customer/wallet');
  RETURN jsonb_build_object('user_id', v_request.user_id, 'amount_rm', v_request.amount, 'status', 'rejected');
END;
$$;

REVOKE ALL ON FUNCTION public.reject_wallet_withdrawal(UUID, TEXT, INET) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_wallet_withdrawal(UUID, TEXT, INET) TO authenticated;

-- A hold preserves the reserve and stops payout processing while the Customer
-- supplies more information through Support. No balance is released here.
CREATE OR REPLACE FUNCTION public.hold_wallet_withdrawal(
  p_id UUID,
  p_reason TEXT,
  p_ip INET DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_request withdrawal_requests%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR NOT public.is_approver(v_actor) THEN RAISE EXCEPTION 'approver_required'; END IF;
  IF char_length(BTRIM(COALESCE(p_reason, ''))) < 10 THEN RAISE EXCEPTION 'withdrawal_reason_too_short'; END IF;
  SELECT * INTO v_request FROM public.withdrawal_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal_not_found'; END IF;
  IF v_request.user_id = v_actor THEN RAISE EXCEPTION 'self_dealing'; END IF;
  IF v_request.status NOT IN ('pending', 'pending_second_approval', 'approved', 'overdue') THEN
    RAISE EXCEPTION 'withdrawal_not_holdable';
  END IF;
  INSERT INTO public.withdrawal_approvals(request_id, approver_id, action, note)
  VALUES (p_id, v_actor, 'hold', p_reason);
  UPDATE public.withdrawal_requests
     SET status = 'hold', customer_reason = p_reason, customer_visible_at = NOW(), updated_at = NOW()
   WHERE id = p_id;
  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, before_data, after_data, ip_address, note)
  VALUES (
    v_actor, 'withdrawal.held', 'withdrawal', p_id,
    jsonb_build_object('status', v_request.status), jsonb_build_object('status', 'hold'), p_ip, p_reason
  );
  INSERT INTO public.notifications(user_id, type, title, body, link)
  VALUES (v_request.user_id, 'withdrawal_hold', 'Withdrawal needs additional review', p_reason, '/customer/wallet');
  RETURN jsonb_build_object('user_id', v_request.user_id, 'amount_rm', v_request.amount, 'status', 'hold');
END;
$$;

REVOKE ALL ON FUNCTION public.hold_wallet_withdrawal(UUID, TEXT, INET) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hold_wallet_withdrawal(UUID, TEXT, INET) TO authenticated;
