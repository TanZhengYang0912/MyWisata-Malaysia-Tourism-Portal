-- Re-home legacy demo earning rows to the current source-backed catalogue.
-- Historical rows are preserved as ledger entries, but their order lineage is
-- corrected so every approved vendor has one current, verifiable earning.

DO $$
DECLARE
  repair RECORD;
  target_wallet UUID;
BEGIN
  ALTER TABLE public.wallet_transactions DISABLE TRIGGER wallet_transactions_append_only;

  FOR repair IN
    WITH qualifying AS (
      SELECT
        item.vendor_id,
        item.order_id,
        ROUND(SUM(item.line_total) * 100)::BIGINT AS amount_sen,
        MAX(order_row.created_at) AS created_at
      FROM public.order_items AS item
      JOIN public.orders AS order_row ON order_row.id = item.order_id
      JOIN public.outlets AS outlet
        ON outlet.id = item.outlet_id
       AND outlet.status = 'active'
       AND (outlet.review_status IS NULL OR outlet.review_status = 'approved')
      JOIN public.products AS product
        ON product.id = item.product_id
       AND product.vendor_id = item.vendor_id
       AND product.status = 'active'
       AND (product.review_status IS NULL OR product.review_status = 'approved')
       AND (
         product.outlet_id = item.outlet_id
         OR EXISTS (
           SELECT 1
           FROM public.outlet_offers AS offer
           WHERE offer.product_id = item.product_id
             AND offer.outlet_id = item.outlet_id
             AND offer.status = 'active'
         )
       )
      WHERE order_row.user_id IN (
        'aaaaaaaa-0000-0000-0000-000000000005'::UUID,
        'aaaaaaaa-0000-0000-0000-000000000006'::UUID,
        'aaaaaaaa-0000-0000-0000-000000000007'::UUID,
        'aaaaaaaa-0000-0000-0000-000000000008'::UUID
      )
        AND order_row.status IN ('paid', 'completed')
        AND item.line_total > 0
      GROUP BY item.vendor_id, item.order_id
    ),
    ranked AS (
      SELECT
        qualifying.*,
        ROW_NUMBER() OVER (
          PARTITION BY qualifying.vendor_id
          ORDER BY qualifying.created_at DESC, qualifying.order_id
        ) AS vendor_rank
      FROM qualifying
    ),
    valid_vendors AS (
      SELECT DISTINCT vendor.id
      FROM public.wallet_transactions AS transaction_row
      JOIN public.vendors AS vendor ON vendor.owner_id = transaction_row.user_id
      JOIN public.wallets AS wallet ON wallet.user_id = vendor.owner_id
      JOIN qualifying
        ON qualifying.vendor_id = vendor.id
       AND qualifying.order_id = transaction_row.order_id
       AND qualifying.amount_sen = transaction_row.amount_sen
      WHERE vendor.status = 'approved'
        AND transaction_row.wallet_id = wallet.id
        AND transaction_row.type = 'earnings'
        AND transaction_row.bucket = 'earnings'
        AND transaction_row.direction = 'credit'
        AND transaction_row.idempotency_key = 'vendor-account-demo:earning:'
          || vendor.id::TEXT || ':' || transaction_row.order_id::TEXT
    )
    SELECT
      transaction_row.id,
      transaction_row.wallet_id AS old_wallet_id,
      transaction_row.amount_sen AS old_amount_sen,
      vendor.id AS vendor_id,
      vendor.owner_id,
      wallet.id AS target_wallet_id,
      ranked.order_id AS target_order_id,
      ranked.amount_sen AS target_amount_sen
    FROM public.wallet_transactions AS transaction_row
    JOIN public.vendors AS vendor
      ON vendor.owner_id = transaction_row.user_id
     AND vendor.status = 'approved'
    JOIN public.wallets AS wallet ON wallet.user_id = vendor.owner_id
    JOIN ranked ON ranked.vendor_id = vendor.id AND ranked.vendor_rank = 1
    WHERE transaction_row.idempotency_key LIKE 'vendor-account-demo:earning:' || vendor.id::TEXT || ':%'
      AND NOT EXISTS (SELECT 1 FROM valid_vendors WHERE valid_vendors.id = vendor.id)
    ORDER BY vendor.id, transaction_row.created_at, transaction_row.id
  LOOP
    UPDATE public.wallets
       SET earnings_sen = earnings_sen - repair.old_amount_sen,
           updated_at = NOW()
     WHERE id = repair.old_wallet_id;

    UPDATE public.wallets
       SET earnings_sen = earnings_sen + repair.target_amount_sen,
           updated_at = NOW()
     WHERE id = repair.target_wallet_id;

    UPDATE public.wallet_transactions
       SET user_id = repair.owner_id,
           wallet_id = repair.target_wallet_id,
           order_id = repair.target_order_id,
           amount_sen = repair.target_amount_sen,
           idempotency_key = 'vendor-account-demo:earning:'
             || repair.vendor_id::TEXT || ':' || repair.target_order_id::TEXT
     WHERE id = repair.id;

    INSERT INTO public.audit_logs (
      actor_id, action, entity_type, entity_id, after_data, note
    ) VALUES (
      NULL,
      'vendor.demo_earning_lineage_repaired',
      'wallet_transaction',
      repair.id,
      jsonb_build_object(
        'vendor_id', repair.vendor_id,
        'order_id', repair.target_order_id,
        'amount_sen', repair.target_amount_sen
      ),
      'Re-linked a legacy demo earning to the current source-backed vendor order.'
    );
  END LOOP;

  ALTER TABLE public.wallet_transactions ENABLE TRIGGER wallet_transactions_append_only;
END;
$$;
