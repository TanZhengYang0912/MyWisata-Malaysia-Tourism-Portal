-- Preserve old orders while giving every non-draft order an auditable payment row.
INSERT INTO public.payments (order_id, method, provider, amount, status, failure_reason, processed_at)
SELECT
  o.id,
  CASE WHEN o.payment_method IN ('mock_card','stripe_card','ewallet','bank_transfer','wallet','mock_fail') THEN o.payment_method ELSE 'mock_card' END,
  'legacy_reconciled',
  o.total_amount,
  CASE o.status
    WHEN 'paid' THEN 'succeeded'
    WHEN 'completed' THEN 'succeeded'
    WHEN 'refunded' THEN 'refunded'
    WHEN 'cancelled' THEN 'cancelled'
    WHEN 'pending_payment' THEN 'pending'
    ELSE 'pending'
  END,
  'Backfilled from legacy order record',
  CASE WHEN o.status IN ('paid','completed','refunded') THEN COALESCE(o.paid_at, o.created_at) ELSE NULL END
FROM public.orders o
WHERE o.status <> 'draft'
  AND NOT EXISTS (SELECT 1 FROM public.payments p WHERE p.order_id = o.id);
