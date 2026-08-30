-- Booking-kind reservations hold slot capacity, not inventory, so they have no
-- variant to derive an outlet from. Backfill them from the slot instead.
UPDATE public.checkout_reservations r
   SET outlet_id = s.outlet_id
  FROM public.booking_slots s
 WHERE s.id = r.slot_id AND r.outlet_id IS NULL;;
