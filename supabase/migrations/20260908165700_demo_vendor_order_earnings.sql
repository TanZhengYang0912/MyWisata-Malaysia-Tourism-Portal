-- Guarded lecturer-demo settlement for seeded Vendor Owner accounts.
-- This is intentionally service-role-only and restricted to @demo.local users.

CREATE OR REPLACE FUNCTION public.seed_demo_vendor_order_earning(
  p_vendor_id UUID,
  p_order_id UUID,
  p_note TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_owner_id UUID;
  v_wallet_id UUID;
  v_transaction_id UUID;
  v_amount_sen BIGINT;
  v_idempotency_key TEXT;
  v_event_key TEXT;
  v_note TEXT;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;

  SELECT vendor.owner_id
  INTO v_owner_id
  FROM public.vendors AS vendor
  JOIN public.users AS owner_user ON owner_user.id = vendor.owner_id
  WHERE vendor.id = p_vendor_id
    AND vendor.status = 'approved'
    AND owner_user.email LIKE '%@demo.local';

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'approved_demo_vendor_owner_not_found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.orders AS order_row
    JOIN public.users AS customer_user ON customer_user.id = order_row.user_id
    WHERE order_row.id = p_order_id
      AND order_row.status IN ('paid', 'completed')
      AND order_row.user_id <> v_owner_id
      AND customer_user.email LIKE '%@demo.local'
  ) THEN
    RAISE EXCEPTION 'qualifying_demo_customer_order_not_found';
  END IF;

  SELECT ROUND(SUM(order_item.line_total) * 100)::BIGINT
  INTO v_amount_sen
  FROM public.order_items AS order_item
  JOIN public.outlets AS outlet
    ON outlet.id = order_item.outlet_id
   AND outlet.vendor_id = p_vendor_id
  WHERE order_item.order_id = p_order_id
    AND order_item.vendor_id = p_vendor_id
    AND order_item.line_total > 0;

  IF COALESCE(v_amount_sen, 0) <= 0 THEN
    RAISE EXCEPTION 'demo_order_has_no_positive_vendor_items';
  END IF;

  SELECT wallet.id
  INTO v_wallet_id
  FROM public.wallets AS wallet
  WHERE wallet.user_id = v_owner_id
  FOR UPDATE;

  IF v_wallet_id IS NULL THEN
    RAISE EXCEPTION 'vendor_owner_wallet_not_found';
  END IF;

  v_idempotency_key := 'vendor-account-demo:earning:' || p_vendor_id::TEXT || ':' || p_order_id::TEXT;
  v_event_key := 'vendor-account-demo:notification:wallet:' || p_vendor_id::TEXT || ':' || p_order_id::TEXT;
  v_note := COALESCE(NULLIF(BTRIM(p_note), ''), 'Demo earning from customer order ' || p_order_id::TEXT);

  INSERT INTO public.wallet_transactions (
    user_id, wallet_id, order_id, idempotency_key,
    type, amount_sen, bucket, direction, note
  ) VALUES (
    v_owner_id, v_wallet_id, p_order_id, v_idempotency_key,
    'earnings', v_amount_sen, 'earnings', 'credit', v_note
  )
  ON CONFLICT (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
  RETURNING id INTO v_transaction_id;

  IF v_transaction_id IS NULL THEN
    SELECT transaction.id
    INTO v_transaction_id
    FROM public.wallet_transactions AS transaction
    WHERE transaction.user_id = v_owner_id
      AND transaction.idempotency_key = v_idempotency_key;

    RETURN jsonb_build_object(
      'created', false,
      'transactionId', v_transaction_id,
      'ownerId', v_owner_id,
      'vendorId', p_vendor_id,
      'orderId', p_order_id,
      'amountSen', v_amount_sen
    );
  END IF;

  UPDATE public.wallets
  SET earnings_sen = earnings_sen + v_amount_sen,
      updated_at = now()
  WHERE id = v_wallet_id;

  INSERT INTO public.audit_logs (
    actor_id, action, entity_type, entity_id, after_data, note
  ) VALUES (
    NULL,
    'vendor.demo_order_earning_seeded',
    'wallet_transaction',
    v_transaction_id,
    jsonb_build_object(
      'vendor_id', p_vendor_id,
      'owner_id', v_owner_id,
      'order_id', p_order_id,
      'wallet_id', v_wallet_id,
      'amount_sen', v_amount_sen,
      'idempotency_key', v_idempotency_key
    ),
    v_note
  );

  INSERT INTO public.notifications (
    user_id, type, title, body, link, event_key, category, metadata,
    vendor_id, outlet_id, audience_role
  ) VALUES (
    v_owner_id,
    'vendor_wallet_update',
    'Order earning added',
    'A demo customer-order earning is now available in your Vendor Wallet.',
    '/vendor/wallet',
    v_event_key,
    'vendor_wallet',
    jsonb_build_object(
      'demo', true,
      'source', 'vendor-account-demo',
      'vendor_id', p_vendor_id,
      'order_id', p_order_id,
      'wallet_transaction_id', v_transaction_id,
      'amount_sen', v_amount_sen
    ),
    p_vendor_id,
    NULL,
    'vendor_owner'
  )
  ON CONFLICT (event_key) DO NOTHING;

  RETURN jsonb_build_object(
    'created', true,
    'transactionId', v_transaction_id,
    'ownerId', v_owner_id,
    'vendorId', p_vendor_id,
    'orderId', p_order_id,
    'amountSen', v_amount_sen
  );
END;
$$;

REVOKE ALL ON FUNCTION public.seed_demo_vendor_order_earning(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_demo_vendor_order_earning(UUID, UUID, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';
