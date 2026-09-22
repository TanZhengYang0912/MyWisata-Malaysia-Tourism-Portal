-- Restore missing passes for paid bookings created after the original ticket
-- backfill. This is safe to rerun and does not reopen bookings already used.
INSERT INTO public.ticket_passes (
  booking_id,
  order_item_id,
  customer_id,
  policy,
  entry_limit,
  entries_used,
  status
)
SELECT
  b.id,
  b.order_item_id,
  b.customer_id,
  CASE
    WHEN p.ticket_entry_policy = 'multi_entry' THEN 'multi_entry'
    WHEN p.ticket_entry_policy = 'group_entry' OR GREATEST(1, COALESCE(oi.quantity, 1)) > 1 THEN 'group_entry'
    ELSE 'single_entry'
  END,
  CASE
    WHEN p.ticket_entry_policy IN ('multi_entry', 'group_entry')
      THEN GREATEST(1, p.ticket_entry_limit) * GREATEST(1, COALESCE(oi.quantity, 1))
    ELSE GREATEST(1, COALESCE(oi.quantity, 1))
  END,
  CASE
    WHEN b.status = 'checked_in' THEN
      CASE
        WHEN p.ticket_entry_policy IN ('multi_entry', 'group_entry')
          THEN GREATEST(1, p.ticket_entry_limit) * GREATEST(1, COALESCE(oi.quantity, 1))
        ELSE GREATEST(1, COALESCE(oi.quantity, 1))
      END
    ELSE 0
  END,
  CASE WHEN b.status = 'checked_in' THEN 'fully_redeemed' ELSE 'active' END
FROM public.bookings b
JOIN public.order_items oi ON oi.id = b.order_item_id
JOIN public.orders o ON o.id = oi.order_id
JOIN public.products p ON p.id = oi.product_id
WHERE o.status IN ('paid', 'completed')
  AND oi.slot_id IS NOT NULL
  AND b.status IN ('confirmed', 'checked_in')
  AND NOT EXISTS (
    SELECT 1
    FROM public.ticket_passes existing
    WHERE existing.booking_id = b.id
  )
ON CONFLICT (booking_id) DO NOTHING;
