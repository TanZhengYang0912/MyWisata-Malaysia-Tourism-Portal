-- External Booking Synchronization & Outbox (P0)
-- Establishes the database as the sole capacity authority across internal and external channels.

CREATE TABLE IF NOT EXISTS public.external_booking_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  outlet_id UUID NOT NULL REFERENCES public.outlets(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('generic_webhook', 'ical', 'klook', 'agoda', 'airbnb', 'booking_com')),
  external_source_identifier TEXT NOT NULL,
  webhook_secret TEXT NOT NULL,
  sync_enabled BOOLEAN NOT NULL DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_vendor_provider_source UNIQUE (vendor_id, provider, external_source_identifier)
);

CREATE TABLE IF NOT EXISTS public.external_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES public.external_booking_sources(id) ON DELETE CASCADE,
  slot_id UUID NOT NULL REFERENCES public.booking_slots(id) ON DELETE CASCADE,
  external_booking_id TEXT NOT NULL,
  external_status TEXT NOT NULL DEFAULT 'confirmed' CHECK (external_status IN ('confirmed', 'cancelled', 'modified')),
  quantity INT NOT NULL CHECK (quantity > 0),
  guest_name TEXT,
  guest_email TEXT,
  conflict_status TEXT NOT NULL DEFAULT 'none' CHECK (conflict_status IN ('none', 'overbooked')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_source_external_booking UNIQUE (source_id, external_booking_id)
);

CREATE TABLE IF NOT EXISTS public.sync_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type TEXT NOT NULL CHECK (aggregate_type IN ('slot_capacity', 'booking_status')),
  aggregate_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('slot.updated', 'slot.booked', 'slot.cancelled', 'booking.rescheduled')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'delivered', 'failed')),
  retry_count INT NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  next_retry_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_outbox_pending
  ON public.sync_outbox(status, next_retry_at)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_external_reservations_slot
  ON public.external_reservations(slot_id, external_status);

ALTER TABLE public.external_booking_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY external_booking_sources_vendor_select ON public.external_booking_sources
  FOR SELECT TO authenticated
  USING (
    is_admin((SELECT auth.uid()))
    OR vendor_id IN (SELECT id FROM public.vendors WHERE owner_id = (SELECT auth.uid()))
  );

CREATE POLICY external_reservations_vendor_select ON public.external_reservations
  FOR SELECT TO authenticated
  USING (
    is_admin((SELECT auth.uid()))
    OR source_id IN (
      SELECT id FROM public.external_booking_sources
      WHERE vendor_id IN (SELECT id FROM public.vendors WHERE owner_id = (SELECT auth.uid()))
    )
  );

-- Database capacity authority RPC
CREATE OR REPLACE FUNCTION public.apply_external_reservation(
  p_source_id UUID,
  p_external_booking_id TEXT,
  p_slot_id UUID,
  p_quantity INT,
  p_action TEXT,
  p_guest_name TEXT DEFAULT NULL,
  p_guest_email TEXT DEFAULT NULL,
  p_payload JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source public.external_booking_sources%ROWTYPE;
  v_existing public.external_reservations%ROWTYPE;
  v_slot public.booking_slots%ROWTYPE;
  v_res_id UUID;
BEGIN
  SELECT * INTO v_source FROM public.external_booking_sources WHERE id = p_source_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'source_not_found';
  END IF;

  SELECT * INTO v_existing
    FROM public.external_reservations
   WHERE source_id = p_source_id AND external_booking_id = p_external_booking_id
   FOR UPDATE;

  IF p_action = 'cancel' THEN
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', true, 'action', 'noop_not_found');
    END IF;

    IF v_existing.external_status = 'cancelled' THEN
      RETURN jsonb_build_object('success', true, 'action', 'already_cancelled');
    END IF;

    IF v_existing.conflict_status = 'none' THEN
      SELECT * INTO v_slot FROM public.booking_slots WHERE id = v_existing.slot_id FOR UPDATE;
      IF FOUND THEN
        UPDATE public.booking_slots
           SET booked = GREATEST(0, booked - v_existing.quantity),
               status = CASE WHEN booked - v_existing.quantity < capacity THEN 'available' ELSE status END
         WHERE id = v_existing.slot_id;

        INSERT INTO public.sync_outbox(aggregate_type, aggregate_id, event_type, payload)
        VALUES ('slot_capacity', v_existing.slot_id, 'slot.cancelled', jsonb_build_object(
          'slot_id', v_existing.slot_id,
          'freed_quantity', v_existing.quantity,
          'external_booking_id', p_external_booking_id
        ));
      END IF;
    END IF;

    UPDATE public.external_reservations
       SET external_status = 'cancelled',
           updated_at = now()
     WHERE id = v_existing.id;

    RETURN jsonb_build_object('success', true, 'action', 'cancelled', 'reservation_id', v_existing.id);
  END IF;

  -- Default action: 'book' / 'create'
  IF FOUND THEN
    IF v_existing.external_status = 'confirmed' THEN
      RETURN jsonb_build_object('success', true, 'action', 'already_confirmed', 'reservation_id', v_existing.id);
    END IF;
  END IF;

  -- Lock target slot
  SELECT * INTO v_slot FROM public.booking_slots WHERE id = p_slot_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'slot_not_found';
  END IF;

  IF v_slot.status = 'cancelled' THEN
    RAISE EXCEPTION 'slot_cancelled';
  END IF;

  -- CAPACITY AUTHORITY: Never allow external system to exceed slot capacity.
  IF v_slot.booked + p_quantity > v_slot.capacity THEN
    INSERT INTO public.external_reservations (
      source_id, slot_id, external_booking_id, external_status,
      quantity, guest_name, guest_email, conflict_status, payload
    ) VALUES (
      p_source_id, p_slot_id, p_external_booking_id, 'confirmed',
      p_quantity, p_guest_name, p_guest_email, 'overbooked', p_payload
    )
    ON CONFLICT (source_id, external_booking_id) DO UPDATE
      SET external_status = 'confirmed', conflict_status = 'overbooked', updated_at = now()
    RETURNING id INTO v_res_id;

    RETURN jsonb_build_object(
      'success', false,
      'conflict', 'overbooked',
      'reservation_id', v_res_id,
      'capacity', v_slot.capacity,
      'booked', v_slot.booked,
      'requested', p_quantity
    );
  END IF;

  -- Normal path: capacity available
  UPDATE public.booking_slots
     SET booked = booked + p_quantity,
         status = CASE WHEN booked + p_quantity >= capacity THEN 'full' ELSE status END
   WHERE id = p_slot_id;

  INSERT INTO public.external_reservations (
    source_id, slot_id, external_booking_id, external_status,
    quantity, guest_name, guest_email, conflict_status, payload
  ) VALUES (
    p_source_id, p_slot_id, p_external_booking_id, 'confirmed',
    p_quantity, p_guest_name, p_guest_email, 'none', p_payload
  )
  ON CONFLICT (source_id, external_booking_id) DO UPDATE
    SET external_status = 'confirmed', conflict_status = 'none', updated_at = now()
  RETURNING id INTO v_res_id;

  INSERT INTO public.sync_outbox(aggregate_type, aggregate_id, event_type, payload)
  VALUES ('slot_capacity', p_slot_id, 'slot.booked', jsonb_build_object(
    'slot_id', p_slot_id,
    'booked', v_slot.booked + p_quantity,
    'capacity', v_slot.capacity,
    'external_booking_id', p_external_booking_id
  ));

  RETURN jsonb_build_object(
    'success', true,
    'action', 'confirmed',
    'reservation_id', v_res_id,
    'slot_id', p_slot_id,
    'booked', v_slot.booked + p_quantity,
    'capacity', v_slot.capacity
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_external_reservation(UUID, TEXT, UUID, INT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_external_reservation(UUID, TEXT, UUID, INT, TEXT, TEXT, TEXT, JSONB) TO authenticated, service_role;

-- Outbound Sync Trigger on Internal Booking Rescheduling/Creation
CREATE OR REPLACE FUNCTION public.trg_enqueue_slot_outbox()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND (OLD.booked IS DISTINCT FROM NEW.booked OR OLD.status IS DISTINCT FROM NEW.status)) THEN
    INSERT INTO public.sync_outbox(aggregate_type, aggregate_id, event_type, payload)
    VALUES ('slot_capacity', NEW.id, 'slot.updated', jsonb_build_object(
      'slot_id', NEW.id,
      'product_id', NEW.product_id,
      'outlet_id', NEW.outlet_id,
      'starts_at', NEW.starts_at,
      'ends_at', NEW.ends_at,
      'capacity', NEW.capacity,
      'booked', NEW.booked,
      'status', NEW.status
    ));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS slot_outbox_enqueue ON public.booking_slots;
CREATE TRIGGER slot_outbox_enqueue
  AFTER UPDATE OF booked, status ON public.booking_slots
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_enqueue_slot_outbox();
