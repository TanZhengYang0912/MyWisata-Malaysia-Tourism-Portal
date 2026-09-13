-- Repair only an explicitly identified demo earning after a verified Product
-- price/source update. The function is deliberately service-role-only and
-- recalculates the amount from the current order items before touching the
-- wallet ledger.

CREATE OR REPLACE FUNCTION public.repair_demo_vendor_order_earning(
  p_transaction_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_transaction public.wallet_transactions%ROWTYPE;
  v_wallet public.wallets%ROWTYPE;
  v_vendor_id UUID;
  v_order_id UUID;
  v_owner_id UUID;
  v_match TEXT[];
  v_amount_sen BIGINT;
  v_delta BIGINT;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;

  SELECT * INTO v_transaction
  FROM public.wallet_transactions
  WHERE id = p_transaction_id
  FOR UPDATE;

  IF v_transaction.id IS NULL
     OR v_transaction.type <> 'earnings'
     OR v_transaction.bucket <> 'earnings'
     OR v_transaction.direction <> 'credit'
     OR v_transaction.idempotency_key IS NULL THEN
    RAISE EXCEPTION 'demo_earning_transaction_invalid';
  END IF;

  v_match := regexp_match(v_transaction.idempotency_key, '^vendor-account-demo:earning:([0-9a-f-]{36}):([0-9a-f-]{36})$');
  IF v_match IS NULL THEN
    RAISE EXCEPTION 'demo_earning_key_invalid';
  END IF;
  v_vendor_id := v_match[1]::UUID;
  v_order_id := v_match[2]::UUID;
  IF v_transaction.order_id <> v_order_id THEN
    RAISE EXCEPTION 'demo_earning_order_mismatch';
  END IF;

  SELECT owner_id INTO v_owner_id
  FROM public.vendors
  WHERE id = v_vendor_id
    AND status = 'approved';
  IF v_owner_id IS NULL OR v_transaction.user_id <> v_owner_id THEN
    RAISE EXCEPTION 'demo_earning_owner_mismatch';
  END IF;

  SELECT ROUND(COALESCE(SUM(order_item.line_total), 0) * 100)::BIGINT
  INTO v_amount_sen
  FROM public.order_items AS order_item
  JOIN public.orders AS order_row ON order_row.id = order_item.order_id
  JOIN public.outlets AS outlet
    ON outlet.id = order_item.outlet_id
   AND outlet.vendor_id = v_vendor_id
   AND outlet.status = 'active'
   AND (outlet.review_status IS NULL OR outlet.review_status = 'approved')
  JOIN public.products AS product
    ON product.id = order_item.product_id
   AND product.vendor_id = v_vendor_id
   AND product.status = 'active'
   AND (product.review_status IS NULL OR product.review_status = 'approved')
   AND (
     product.outlet_id = order_item.outlet_id
     OR EXISTS (
       SELECT 1
       FROM public.outlet_offers AS offer
       WHERE offer.product_id = product.id
         AND offer.outlet_id = order_item.outlet_id
         AND offer.status = 'active'
     )
   )
  WHERE order_item.order_id = v_order_id
    AND order_item.vendor_id = v_vendor_id
    AND order_row.status IN ('paid', 'completed')
    AND order_item.line_total > 0;

  IF v_amount_sen <= 0 THEN
    RAISE EXCEPTION 'demo_order_has_no_positive_vendor_items';
  END IF;

  SELECT * INTO v_wallet
  FROM public.wallets
  WHERE id = v_transaction.wallet_id
    AND user_id = v_owner_id
  FOR UPDATE;
  IF v_wallet.id IS NULL THEN
    RAISE EXCEPTION 'demo_earning_wallet_mismatch';
  END IF;

  v_delta := v_amount_sen - v_transaction.amount_sen;
  IF v_delta = 0 THEN
    RETURN jsonb_build_object('repaired', false, 'transactionId', v_transaction.id, 'amountSen', v_amount_sen);
  END IF;

  -- The ledger is append-only for application roles. This narrowly scoped,
  -- service-role-only repair is the same migration-grade exception used by
  -- existing historical backfills: disable the guard only for the atomic
  -- correction, then restore it before returning.
  ALTER TABLE public.wallet_transactions DISABLE TRIGGER wallet_transactions_append_only;
  UPDATE public.wallet_transactions
  SET amount_sen = v_amount_sen
  WHERE id = v_transaction.id;
  ALTER TABLE public.wallet_transactions ENABLE TRIGGER wallet_transactions_append_only;

  UPDATE public.wallets
  SET earnings_sen = earnings_sen + v_delta,
      updated_at = now()
  WHERE id = v_wallet.id;

  INSERT INTO public.audit_logs (
    actor_id, action, entity_type, entity_id, after_data, note
  ) VALUES (
    NULL,
    'vendor.demo_earning_repaired',
    'wallet_transaction',
    v_transaction.id,
    jsonb_build_object(
      'vendor_id', v_vendor_id,
      'order_id', v_order_id,
      'previous_amount_sen', v_transaction.amount_sen,
      'amount_sen', v_amount_sen,
      'delta_sen', v_delta
    ),
    'Reconciled a demo earning after a verified shared-product price update.'
  );

  RETURN jsonb_build_object(
    'repaired', true,
    'transactionId', v_transaction.id,
    'vendorId', v_vendor_id,
    'orderId', v_order_id,
    'previousAmountSen', v_transaction.amount_sen,
    'amountSen', v_amount_sen
  );
END;
$$;

REVOKE ALL ON FUNCTION public.repair_demo_vendor_order_earning(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.repair_demo_vendor_order_earning(UUID) TO service_role;

NOTIFY pgrst, 'reload schema';
