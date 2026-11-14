-- No client subscribes to booking_slots any more: its public rows changed with
-- every booking, so publishing it made Realtime decode and RLS-check each
-- booking for every open customer calendar.
--
-- Apply only after the app version without the calendar's booking_slots
-- subscription is deployed. Older clients still bind to this table, and a
-- binding to an unpublished table can fail their whole calendar channel,
-- including the bookings and orders updates.
--
-- No data changes. Rollback: ALTER PUBLICATION supabase_realtime ADD TABLE public.booking_slots;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'booking_slots'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.booking_slots;
  END IF;
END
$$;
