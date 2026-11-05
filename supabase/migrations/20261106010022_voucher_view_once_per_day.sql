-- One "viewed" event per customer, voucher and Malaysian calendar day.
-- The cart re-validates every candidate voucher whenever its total or
-- selection changes. The validate API checks for today's view first, but two
-- near-simultaneous checks could both pass that check and both insert; this
-- index makes the database refuse the second (the API ignores the error).
--
-- Only rows from 2026-11-07 (Malaysia) are covered. Older views were logged
-- once per check and are left as they are rather than rewritten here.

-- Remove duplicates already inside the covered window so the index can build.
DELETE FROM public.voucher_events AS dup
USING public.voucher_events AS keep
WHERE dup.event_type = 'viewed'
  AND keep.event_type = 'viewed'
  AND dup.voucher_id = keep.voucher_id
  AND dup.user_id = keep.user_id
  AND dup.created_at >= '2026-11-07 00:00:00+08'
  AND keep.created_at >= '2026-11-07 00:00:00+08'
  AND timezone('Asia/Kuala_Lumpur', dup.created_at)::date = timezone('Asia/Kuala_Lumpur', keep.created_at)::date
  AND (keep.created_at, keep.id) < (dup.created_at, dup.id);

CREATE UNIQUE INDEX IF NOT EXISTS voucher_events_one_view_per_day
  ON public.voucher_events (voucher_id, user_id, (timezone('Asia/Kuala_Lumpur', created_at)::date))
  WHERE event_type = 'viewed'
    AND user_id IS NOT NULL
    AND created_at >= '2026-11-07 00:00:00+08';
