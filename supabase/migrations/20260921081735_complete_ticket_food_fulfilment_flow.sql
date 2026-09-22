-- Outlet food choices are an authoritative checkout setting. Existing outlets
-- support both modes until a vendor narrows this list in outlet settings.
ALTER TABLE public.outlets
  ADD COLUMN IF NOT EXISTS food_service_modes TEXT[] NOT NULL
    DEFAULT ARRAY['dine_in', 'takeaway']::TEXT[];

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS food_fulfilment_mode TEXT,
  ADD COLUMN IF NOT EXISTS food_qr_scanned_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'outlets_food_service_modes_check') THEN
    ALTER TABLE public.outlets
      ADD CONSTRAINT outlets_food_service_modes_check
      CHECK (
        cardinality(food_service_modes) BETWEEN 1 AND 2
        AND food_service_modes <@ ARRAY['dine_in', 'takeaway']::TEXT[]
        AND (cardinality(food_service_modes) = 1 OR food_service_modes[1] <> food_service_modes[2])
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_food_fulfilment_mode_check') THEN
    ALTER TABLE public.order_items
      ADD CONSTRAINT order_items_food_fulfilment_mode_check
      CHECK (food_fulfilment_mode IS NULL OR food_fulfilment_mode IN ('dine_in', 'takeaway'));
  END IF;
END;
$$;

-- Existing policy trigger computes the configured number of visits. This
-- follow-up trigger holds the clock until the order actually becomes paid.
CREATE OR REPLACE FUNCTION public.defer_multi_entry_validity_until_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.policy <> 'multi_entry' THEN RETURN NEW; END IF;

  UPDATE public.ticket_passes tp
     SET valid_from = CASE WHEN o.status IN ('paid', 'completed') THEN COALESCE(o.paid_at, now()) ELSE NULL END,
         valid_until = CASE WHEN o.status IN ('paid', 'completed')
           THEN COALESCE(o.paid_at, now()) + make_interval(days => p.ticket_validity_days)
           ELSE NULL
         END
    FROM public.bookings b
    JOIN public.order_items oi ON oi.id = b.order_item_id
    JOIN public.orders o ON o.id = oi.order_id
    JOIN public.products p ON p.id = oi.product_id
   WHERE b.id = NEW.booking_id
     AND tp.id = NEW.id
     AND p.ticket_entry_policy = 'multi_entry';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ticket_passes_defer_multi_entry_validity ON public.ticket_passes;
CREATE TRIGGER ticket_passes_defer_multi_entry_validity
  AFTER INSERT ON public.ticket_passes
  FOR EACH ROW
  EXECUTE FUNCTION public.defer_multi_entry_validity_until_payment();

CREATE OR REPLACE FUNCTION public.start_multi_entry_validity_on_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status NOT IN ('paid', 'completed') OR OLD.status IN ('paid', 'completed') THEN RETURN NEW; END IF;

  UPDATE public.ticket_passes tp
     SET valid_from = COALESCE(NEW.paid_at, now()),
         valid_until = COALESCE(NEW.paid_at, now()) + make_interval(days => p.ticket_validity_days),
         updated_at = now()
    FROM public.bookings b
    JOIN public.order_items oi ON oi.id = b.order_item_id
    JOIN public.products p ON p.id = oi.product_id
   WHERE oi.order_id = NEW.id
     AND tp.booking_id = b.id
     AND tp.policy = 'multi_entry'
     AND p.ticket_entry_policy = 'multi_entry';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_start_multi_entry_validity ON public.orders;
CREATE TRIGGER orders_start_multi_entry_validity
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.start_multi_entry_validity_on_payment();

-- Compose with the established checkout overloads so reservations, voucher
-- holds, inventory and food mode persistence share one transaction.
CREATE OR REPLACE FUNCTION public.prepare_checkout_with_food_service_modes(
  p_cart_id UUID,
  p_selected_item_ids UUID[],
  p_idempotency_key TEXT,
  p_request_hash TEXT,
  p_payment_method TEXT,
  p_subtotal NUMERIC,
  p_discount NUMERIC,
  p_total NUMERIC,
  p_voucher_code TEXT,
  p_claim_id UUID,
  p_lines JSONB,
  p_food_service_modes JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_result JSONB;
  v_order_id UUID;
  v_food_outlet_count INTEGER;
  v_mode_count INTEGER;
  v_unique_mode_count INTEGER;
  v_expected_item_count INTEGER;
  v_updated_item_count INTEGER;
  v_selection RECORD;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'checkout_auth_required'; END IF;
  IF jsonb_typeof(p_food_service_modes) <> 'array' THEN RAISE EXCEPTION 'food_service_modes_required'; END IF;

  SELECT count(DISTINCT l.outlet_id)
    INTO v_food_outlet_count
    FROM jsonb_to_recordset(p_lines) AS l(product_id UUID, outlet_id UUID)
    JOIN public.products p ON p.id = l.product_id
    JOIN public.categories c ON c.id = p.category_id
   WHERE c.slug = 'food';

  SELECT count(*), count(DISTINCT s.outlet_id)
    INTO v_mode_count, v_unique_mode_count
    FROM jsonb_to_recordset(p_food_service_modes) AS s(outlet_id UUID, mode TEXT);
  IF v_mode_count <> v_unique_mode_count OR v_mode_count <> v_food_outlet_count THEN
    RAISE EXCEPTION 'food_service_mode_selection_mismatch';
  END IF;

  FOR v_selection IN SELECT * FROM jsonb_to_recordset(p_food_service_modes) AS s(outlet_id UUID, mode TEXT)
  LOOP
    IF v_selection.mode NOT IN ('dine_in', 'takeaway') OR NOT EXISTS (
      SELECT 1 FROM public.outlets o
       WHERE o.id = v_selection.outlet_id
         AND v_selection.mode = ANY(o.food_service_modes)
         AND EXISTS (
           SELECT 1
             FROM jsonb_to_recordset(p_lines) AS l(product_id UUID, outlet_id UUID)
             JOIN public.products p ON p.id = l.product_id
             JOIN public.categories c ON c.id = p.category_id
            WHERE l.outlet_id = o.id AND c.slug = 'food'
         )
    ) THEN RAISE EXCEPTION 'food_service_mode_unavailable'; END IF;
  END LOOP;

  IF p_claim_id IS NULL THEN
    v_result := public.prepare_checkout(
      p_cart_id, p_selected_item_ids, p_idempotency_key, p_request_hash,
      p_payment_method, p_subtotal, p_discount, p_total, p_voucher_code, p_lines
    );
  ELSE
    v_result := public.prepare_checkout(
      p_cart_id, p_selected_item_ids, p_idempotency_key, p_request_hash,
      p_payment_method, p_subtotal, p_discount, p_total, p_voucher_code, p_claim_id, p_lines
    );
  END IF;
  v_order_id := (v_result ->> 'order_id')::UUID;

  SELECT count(*) INTO v_expected_item_count
    FROM jsonb_to_recordset(p_lines) AS l(product_id UUID, outlet_id UUID)
    JOIN public.products p ON p.id = l.product_id
    JOIN public.categories c ON c.id = p.category_id
   WHERE c.slug = 'food';

  UPDATE public.order_items oi
     SET food_fulfilment_mode = s.mode
    FROM public.products p
    JOIN public.categories c ON c.id = p.category_id
    CROSS JOIN jsonb_to_recordset(p_food_service_modes) AS s(outlet_id UUID, mode TEXT)
   WHERE oi.order_id = v_order_id
     AND oi.product_id = p.id
     AND c.slug = 'food'
     AND s.outlet_id = oi.outlet_id;
  GET DIAGNOSTICS v_updated_item_count = ROW_COUNT;
  IF v_updated_item_count <> v_expected_item_count THEN RAISE EXCEPTION 'food_service_mode_persistence_failed'; END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_checkout_with_food_service_modes(UUID, UUID[], TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, UUID, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prepare_checkout_with_food_service_modes(UUID, UUID[], TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, UUID, JSONB, JSONB) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fulfil_food_order_group(
  p_order_id UUID,
  p_outlet_id UUID,
  p_vendor_id UUID,
  p_operator_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_expected INTEGER;
  v_updated INTEGER;
  v_mode TEXT;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'food_order_not_found'; END IF;
  IF v_order.status NOT IN ('paid', 'completed') THEN RAISE EXCEPTION 'food_order_not_paid'; END IF;

  SELECT count(*), min(oi.food_fulfilment_mode)
    INTO v_expected, v_mode
    FROM public.order_items oi
    JOIN public.products p ON p.id = oi.product_id
    JOIN public.categories c ON c.id = p.category_id
   WHERE oi.order_id = p_order_id
     AND oi.outlet_id = p_outlet_id
     AND oi.vendor_id = p_vendor_id
     AND c.slug = 'food'
     AND oi.fulfil_status <> 'cancelled';
  IF v_expected = 0 THEN RAISE EXCEPTION 'food_order_already_fulfilled'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.order_items oi
    JOIN public.products p ON p.id = oi.product_id
    JOIN public.categories c ON c.id = p.category_id
    WHERE oi.order_id = p_order_id AND oi.outlet_id = p_outlet_id AND oi.vendor_id = p_vendor_id
      AND c.slug = 'food' AND oi.fulfil_status <> 'cancelled'
      AND (oi.fulfil_status NOT IN ('pending', 'ready') OR oi.food_qr_scanned_at IS NOT NULL)
  ) THEN RAISE EXCEPTION 'food_order_already_fulfilled'; END IF;
  IF v_mode IS NULL OR v_mode NOT IN ('dine_in', 'takeaway') OR EXISTS (
    SELECT 1 FROM public.order_items oi
    JOIN public.products p ON p.id = oi.product_id
    JOIN public.categories c ON c.id = p.category_id
    WHERE oi.order_id = p_order_id AND oi.outlet_id = p_outlet_id AND oi.vendor_id = p_vendor_id
      AND c.slug = 'food' AND oi.fulfil_status <> 'cancelled'
      AND oi.food_fulfilment_mode IS DISTINCT FROM v_mode
  ) THEN RAISE EXCEPTION 'food_order_mode_inconsistent'; END IF;

  UPDATE public.order_items oi
     SET food_qr_scanned_at = now(),
         fulfil_status = CASE WHEN v_mode = 'takeaway' THEN 'fulfilled' ELSE oi.fulfil_status END,
         fulfilled_at = CASE WHEN v_mode = 'takeaway' THEN now() ELSE oi.fulfilled_at END
    FROM public.products p
    JOIN public.categories c ON c.id = p.category_id
   WHERE oi.order_id = p_order_id
     AND oi.outlet_id = p_outlet_id
     AND oi.vendor_id = p_vendor_id
     AND oi.product_id = p.id
     AND c.slug = 'food'
     AND oi.fulfil_status <> 'cancelled'
     AND oi.food_qr_scanned_at IS NULL
     AND oi.fulfil_status IN ('pending', 'ready');
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> v_expected THEN RAISE EXCEPTION 'food_order_fulfilment_conflict'; END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'outlet_id', p_outlet_id,
    'mode', v_mode,
    'status', CASE WHEN v_mode = 'takeaway' THEN 'fulfilled' ELSE 'checked_in' END,
    'items_scanned', v_updated,
    'operator_id', p_operator_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fulfil_food_order_group(UUID, UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fulfil_food_order_group(UUID, UUID, UUID, UUID) TO service_role;
