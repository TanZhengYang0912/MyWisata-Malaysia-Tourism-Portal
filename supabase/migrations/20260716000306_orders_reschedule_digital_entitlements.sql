-- Mature order controls. No existing orders/bookings/assets are deleted.

CREATE TABLE IF NOT EXISTS public.digital_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_item_id UUID NOT NULL UNIQUE REFERENCES public.order_items(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  download_count INTEGER NOT NULL DEFAULT 0 CHECK (download_count >= 0),
  last_downloaded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.digital_entitlements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS digital_entitlements_owner_select ON public.digital_entitlements;
CREATE POLICY digital_entitlements_owner_select ON public.digital_entitlements
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()) OR is_admin((SELECT auth.uid())));
CREATE INDEX IF NOT EXISTS idx_digital_entitlements_user ON public.digital_entitlements(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.reschedule_booking(p_booking_id UUID, p_new_slot_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user UUID := auth.uid();
  v_booking RECORD;
  v_new booking_slots%ROWTYPE;
  v_old booking_slots%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  SELECT b.*, oi.order_id, oi.quantity, o.user_id
    INTO v_booking
    FROM public.bookings b
    JOIN public.order_items oi ON oi.id = b.order_item_id
    JOIN public.orders o ON o.id = oi.order_id
   WHERE b.id = p_booking_id FOR UPDATE;
  IF NOT FOUND OR v_booking.user_id <> v_user THEN RAISE EXCEPTION 'booking_not_owned'; END IF;
  IF v_booking.status NOT IN ('confirmed') THEN RAISE EXCEPTION 'booking_not_reschedulable'; END IF;
  SELECT * INTO v_old FROM public.booking_slots WHERE id = v_booking.slot_id FOR UPDATE;
  SELECT * INTO v_new FROM public.booking_slots WHERE id = p_new_slot_id FOR UPDATE;
  IF NOT FOUND OR v_new.product_id <> v_old.product_id OR v_new.outlet_id <> v_old.outlet_id OR v_new.status <> 'available' OR v_new.booked + v_booking.quantity > v_new.capacity THEN
    RAISE EXCEPTION 'new_slot_unavailable';
  END IF;
  UPDATE public.booking_slots SET booked = GREATEST(0, booked - v_booking.quantity), status = CASE WHEN booked - v_booking.quantity < capacity THEN 'available' ELSE status END WHERE id = v_old.id;
  UPDATE public.booking_slots SET booked = booked + v_booking.quantity, status = CASE WHEN booked + v_booking.quantity >= capacity THEN 'full' ELSE status END WHERE id = v_new.id;
  UPDATE public.bookings SET slot_id = v_new.id WHERE id = p_booking_id;
  UPDATE public.order_items SET slot_id = v_new.id, slot_starts_at = v_new.starts_at WHERE id = v_booking.order_item_id;
  RETURN jsonb_build_object('booking_id', p_booking_id, 'slot_id', v_new.id, 'starts_at', v_new.starts_at);
END;
$$;

REVOKE ALL ON FUNCTION public.reschedule_booking(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reschedule_booking(UUID, UUID) TO authenticated;
