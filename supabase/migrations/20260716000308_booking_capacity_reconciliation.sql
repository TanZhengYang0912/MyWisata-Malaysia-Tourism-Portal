-- Reconcile legacy seed over-capacity counters without deleting bookings.
ALTER TABLE public.booking_slots
  ADD COLUMN IF NOT EXISTS legacy_overbooked_count INTEGER NOT NULL DEFAULT 0;

UPDATE public.booking_slots
   SET legacy_overbooked_count = GREATEST(legacy_overbooked_count, booked - capacity),
       booked = capacity,
       status = 'full'
 WHERE booked > capacity;

COMMENT ON COLUMN public.booking_slots.legacy_overbooked_count IS
  'Historical over-capacity count retained during data reconciliation; never used for availability.';
