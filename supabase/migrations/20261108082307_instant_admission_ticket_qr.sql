-- Walk-in admission products use the existing booking/ticket pass lifecycle
-- without claiming a scheduled booking slot.
ALTER TABLE public.bookings
  ALTER COLUMN slot_id DROP NOT NULL;

-- Patch the current checkout transaction after it has reserved the product
-- variant inventory. Abort if the checkout body no longer matches this anchor.
DO $migration$
DECLARE
  v_core TEXT := pg_get_functiondef(
    'public.checkout_transaction_core(uuid,uuid[],text,text,text,numeric,numeric,numeric,text,jsonb,uuid,uuid,jsonb)'::regprocedure
  );
  v_inventory_block_old TEXT := $old$
    ELSE
      UPDATE public.inventory
         SET reserved = reserved + v_line.quantity, updated_at = NOW()
       WHERE variant_id = v_line.variant_id AND outlet_id IS NOT DISTINCT FROM v_line.outlet_id AND quantity - reserved >= v_line.quantity;
      GET DIAGNOSTICS v_updated = ROW_COUNT;
      IF v_updated <> 1 THEN RAISE EXCEPTION 'inventory_unavailable'; END IF;

      INSERT INTO public.checkout_reservations(checkout_session_id, kind, variant_id, outlet_id, quantity, cart_item_id, status)
      VALUES (v_session.id, 'inventory', v_line.variant_id, v_line.outlet_id, v_line.quantity, v_line.cart_item_id, v_res_status);
    END IF;
$old$;
  v_inventory_block_new TEXT := $new$
    ELSE
      UPDATE public.inventory
         SET reserved = reserved + v_line.quantity, updated_at = NOW()
       WHERE variant_id = v_line.variant_id AND outlet_id IS NOT DISTINCT FROM v_line.outlet_id AND quantity - reserved >= v_line.quantity;
      GET DIAGNOSTICS v_updated = ROW_COUNT;
      IF v_updated <> 1 THEN RAISE EXCEPTION 'inventory_unavailable'; END IF;

      INSERT INTO public.checkout_reservations(checkout_session_id, kind, variant_id, outlet_id, quantity, cart_item_id, status)
      VALUES (v_session.id, 'inventory', v_line.variant_id, v_line.outlet_id, v_line.quantity, v_line.cart_item_id, v_res_status);

      IF EXISTS (
        SELECT 1
          FROM public.product_places AS product_place
         WHERE product_place.product_id = v_line.product_id
           AND product_place.relation_type = 'admission'
      ) THEN
        INSERT INTO public.bookings(order_item_id, slot_id, customer_id, guest_subject_id, status)
        VALUES (v_order_item_id, NULL, v_user, p_owner_guest, 'confirmed')
        RETURNING id INTO v_booking_id;

        INSERT INTO public.ticket_passes(booking_id, order_item_id, customer_id, guest_subject_id, policy, entry_limit, entries_used, status)
        VALUES (
          v_booking_id,
          v_order_item_id,
          v_user,
          p_owner_guest,
          CASE WHEN v_line.quantity > 1 THEN 'group_entry' ELSE 'single_entry' END,
          v_line.quantity,
          0,
          'active'
        )
        ON CONFLICT (booking_id) DO NOTHING;
      END IF;
    END IF;
$new$;
  v_anchor_count INTEGER;
BEGIN
  v_anchor_count := (length(v_core) - length(replace(v_core, v_inventory_block_old, ''))) / length(v_inventory_block_old);
  IF v_anchor_count <> 1 THEN
    RAISE EXCEPTION 'checkout_transaction_core inventory branch changed; inspect instant admission ticket migration';
  END IF;

  v_core := replace(v_core, v_inventory_block_old, v_inventory_block_new);
  IF position(v_inventory_block_new IN v_core) = 0 THEN
    RAISE EXCEPTION 'checkout_transaction_core admission patch incomplete';
  END IF;
  EXECUTE v_core;
END;
$migration$;

-- Restore outstanding walk-in admission lines. The transaction-local role
-- claim lets the existing ownership triggers treat this data repair like the
-- trusted checkout service; owner IDs still come from each order, and guest
-- subjects must still be live. Restore the connection's prior claim afterward.
DO $backfill$
DECLARE
  v_previous_role TEXT := current_setting('request.jwt.claim.role', true);
BEGIN
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);

  INSERT INTO public.bookings(order_item_id, slot_id, customer_id, guest_subject_id, status)
  SELECT
    oi.id,
    NULL,
    o.user_id,
    o.guest_subject_id,
    'confirmed'
  FROM public.order_items AS oi
  JOIN public.orders AS o ON o.id = oi.order_id
  JOIN public.products AS p ON p.id = oi.product_id
  WHERE lower(o.status) = 'paid'
    AND oi.fulfil_status = 'pending'
    AND oi.slot_id IS NULL
    AND p.requires_booking IS FALSE
    AND EXISTS (
      SELECT 1
        FROM public.product_places AS product_place
       WHERE product_place.product_id = p.id
         AND product_place.relation_type = 'admission'
    )
    AND (o.guest_subject_id IS NULL OR EXISTS (
      SELECT 1 FROM public.guest_checkout_subjects AS guest_subject
       WHERE guest_subject.id = o.guest_subject_id
         AND guest_subject.revoked_at IS NULL
         AND guest_subject.expires_at > NOW()
    ))
    AND NOT EXISTS (
      SELECT 1 FROM public.bookings AS booking
       WHERE booking.order_item_id = oi.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.refunds AS refund
       WHERE refund.order_id = o.id
         AND refund.status IN ('pending', 'approved', 'processed')
    )
  ON CONFLICT (order_item_id) DO NOTHING;

  INSERT INTO public.ticket_passes(booking_id, order_item_id, customer_id, guest_subject_id, policy, entry_limit, entries_used, status)
  SELECT
    b.id,
    oi.id,
    b.customer_id,
    b.guest_subject_id,
    CASE WHEN oi.quantity > 1 THEN 'group_entry' ELSE 'single_entry' END,
    GREATEST(1, COALESCE(oi.quantity, 1)),
    0,
    'active'
  FROM public.bookings AS b
  JOIN public.order_items AS oi ON oi.id = b.order_item_id
  JOIN public.orders AS o ON o.id = oi.order_id
  JOIN public.products AS p ON p.id = oi.product_id
  WHERE lower(o.status) = 'paid'
    AND oi.fulfil_status = 'pending'
    AND oi.slot_id IS NULL
    AND p.requires_booking IS FALSE
    AND b.slot_id IS NULL
    AND b.status = 'confirmed'
    AND EXISTS (
      SELECT 1
        FROM public.product_places AS product_place
       WHERE product_place.product_id = p.id
         AND product_place.relation_type = 'admission'
    )
    AND (o.guest_subject_id IS NULL OR EXISTS (
      SELECT 1 FROM public.guest_checkout_subjects AS guest_subject
       WHERE guest_subject.id = o.guest_subject_id
         AND guest_subject.revoked_at IS NULL
         AND guest_subject.expires_at > NOW()
    ))
    AND NOT EXISTS (
      SELECT 1 FROM public.refunds AS refund
       WHERE refund.order_id = o.id
         AND refund.status IN ('pending', 'approved', 'processed')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.ticket_passes AS ticket_pass
       WHERE ticket_pass.booking_id = b.id
    )
  ON CONFLICT (booking_id) DO NOTHING;

  PERFORM set_config('request.jwt.claim.role', COALESCE(v_previous_role, ''), true);
END;
$backfill$;

NOTIFY pgrst, 'reload schema';
