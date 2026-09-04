-- Multiple-Entry & Group QR Tickets with Immutable Audit Trail
-- Supports single_entry, multi_entry, and group_entry admission policies with atomic lock checks.

CREATE TABLE IF NOT EXISTS public.ticket_passes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  order_item_id UUID NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  policy TEXT NOT NULL DEFAULT 'single_entry' CHECK (policy IN ('single_entry', 'multi_entry', 'group_entry')),
  entry_limit INT NOT NULL DEFAULT 1 CHECK (entry_limit > 0),
  entries_used INT NOT NULL DEFAULT 0 CHECK (entries_used >= 0 AND entries_used <= entry_limit),
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'fully_redeemed', 'expired', 'voided')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_ticket_pass_booking UNIQUE (booking_id)
);

CREATE TABLE IF NOT EXISTS public.check_in_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_pass_id UUID NOT NULL REFERENCES public.ticket_passes(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  outlet_id UUID NOT NULL REFERENCES public.outlets(id) ON DELETE CASCADE,
  operator_user_id UUID,
  entries_admitted INT NOT NULL CHECK (entries_admitted > 0),
  entries_used_after INT NOT NULL CHECK (entries_used_after >= entries_admitted),
  scan_token_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_passes_booking ON public.ticket_passes(booking_id);
CREATE INDEX IF NOT EXISTS idx_ticket_passes_customer ON public.ticket_passes(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_check_in_events_pass ON public.check_in_events(ticket_pass_id, scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_check_in_events_outlet ON public.check_in_events(outlet_id, scanned_at DESC);

ALTER TABLE public.ticket_passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.check_in_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY ticket_passes_owner_select ON public.ticket_passes
  FOR SELECT TO authenticated
  USING (
    customer_id = (SELECT auth.uid())
    OR is_admin((SELECT auth.uid()))
  );

CREATE POLICY check_in_events_vendor_select ON public.check_in_events
  FOR SELECT TO authenticated
  USING (
    is_admin((SELECT auth.uid()))
    OR vendor_id IN (SELECT id FROM public.vendors WHERE owner_id = (SELECT auth.uid()))
  );

-- Backfill ticket_pass for existing bookings
INSERT INTO public.ticket_passes (booking_id, order_item_id, customer_id, policy, entry_limit, entries_used, status)
SELECT
  b.id AS booking_id,
  b.order_item_id,
  b.customer_id,
  CASE WHEN COALESCE(oi.quantity, 1) > 1 THEN 'group_entry' ELSE 'single_entry' END AS policy,
  GREATEST(1, COALESCE(oi.quantity, 1)) AS entry_limit,
  CASE WHEN b.status = 'checked_in' THEN GREATEST(1, COALESCE(oi.quantity, 1)) ELSE 0 END AS entries_used,
  CASE WHEN b.status = 'checked_in' THEN 'fully_redeemed' ELSE 'active' END AS status
FROM public.bookings b
JOIN public.order_items oi ON oi.id = b.order_item_id
WHERE NOT EXISTS (SELECT 1 FROM public.ticket_passes tp WHERE tp.booking_id = b.id)
ON CONFLICT (booking_id) DO NOTHING;

-- Atomic Admission RPC
CREATE OR REPLACE FUNCTION public.admit_ticket_pass(
  p_pass_id UUID,
  p_vendor_id UUID,
  p_outlet_id UUID,
  p_operator_id UUID,
  p_entries_to_admit INT DEFAULT 1,
  p_scan_token_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pass public.ticket_passes%ROWTYPE;
  v_booking public.bookings%ROWTYPE;
  v_new_used INT;
  v_new_status TEXT;
  v_event_id UUID;
BEGIN
  IF p_entries_to_admit IS NULL OR p_entries_to_admit < 1 THEN
    RAISE EXCEPTION 'invalid_entries_to_admit';
  END IF;

  SELECT * INTO v_pass
    FROM public.ticket_passes
   WHERE id = p_pass_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ticket_pass_not_found';
  END IF;

  IF v_pass.status = 'fully_redeemed' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'PASS_FULLY_REDEEMED',
      'message', 'Ticket pass has already been fully redeemed',
      'entries_used', v_pass.entries_used,
      'entry_limit', v_pass.entry_limit,
      'remaining', 0
    );
  END IF;

  IF v_pass.status <> 'active' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'PASS_INACTIVE',
      'message', 'Ticket pass is ' || v_pass.status,
      'status', v_pass.status
    );
  END IF;

  IF v_pass.valid_from IS NOT NULL AND v_pass.valid_from > now() THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'PASS_NOT_YET_VALID',
      'message', 'Ticket pass validity begins in the future',
      'valid_from', v_pass.valid_from
    );
  END IF;

  IF v_pass.valid_until IS NOT NULL AND v_pass.valid_until < now() THEN
    UPDATE public.ticket_passes SET status = 'expired', updated_at = now() WHERE id = v_pass.id;
    RETURN jsonb_build_object(
      'success', false,
      'code', 'PASS_EXPIRED',
      'message', 'Ticket pass expired',
      'valid_until', v_pass.valid_until
    );
  END IF;

  -- ATOMIC CONCURRENCY CHECK: entries_used + requested <= entry_limit
  IF v_pass.entries_used + p_entries_to_admit > v_pass.entry_limit THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'EXCEEDS_ENTRY_LIMIT',
      'message', 'Requested admission exceeds remaining entries',
      'entries_used', v_pass.entries_used,
      'entry_limit', v_pass.entry_limit,
      'requested', p_entries_to_admit,
      'remaining', v_pass.entry_limit - v_pass.entries_used
    );
  END IF;

  v_new_used := v_pass.entries_used + p_entries_to_admit;
  v_new_status := CASE WHEN v_new_used >= v_pass.entry_limit THEN 'fully_redeemed' ELSE 'active' END;

  UPDATE public.ticket_passes
     SET entries_used = v_new_used,
         status = v_new_status,
         updated_at = now()
   WHERE id = v_pass.id;

  -- Update parent booking
  UPDATE public.bookings
     SET status = CASE WHEN v_new_status = 'fully_redeemed' THEN 'checked_in' ELSE 'in_use' END,
         check_in_at = COALESCE(check_in_at, now()),
         updated_at = now()
   WHERE id = v_pass.booking_id;

  -- If fully redeemed, mark order_item fulfilled
  IF v_new_status = 'fully_redeemed' THEN
    UPDATE public.order_items
       SET fulfil_status = 'fulfilled',
           fulfilled_at = now()
     WHERE id = v_pass.order_item_id;
  END IF;

  -- Log immutable check-in audit event
  INSERT INTO public.check_in_events (
    ticket_pass_id, booking_id, vendor_id, outlet_id, operator_user_id,
    entries_admitted, entries_used_after, scan_token_id, metadata
  ) VALUES (
    v_pass.id, v_pass.booking_id, p_vendor_id, p_outlet_id, p_operator_id,
    p_entries_to_admit, v_new_used, p_scan_token_id, p_metadata
  ) RETURNING id INTO v_event_id;

  RETURN jsonb_build_object(
    'success', true,
    'code', 'CHECKIN_SUCCESS',
    'pass_id', v_pass.id,
    'booking_id', v_pass.booking_id,
    'policy', v_pass.policy,
    'entries_admitted', p_entries_to_admit,
    'entries_used', v_new_used,
    'entry_limit', v_pass.entry_limit,
    'remaining', v_pass.entry_limit - v_new_used,
    'pass_status', v_new_status,
    'event_id', v_event_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admit_ticket_pass(UUID, UUID, UUID, UUID, INT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admit_ticket_pass(UUID, UUID, UUID, UUID, INT, TEXT, JSONB) TO authenticated, service_role;
