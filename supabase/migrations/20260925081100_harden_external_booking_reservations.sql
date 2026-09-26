-- Preserve the established external reservation function while adding
-- database-owned authorization and correcting cancel/rebook identity.
DO $migration$
DECLARE
  v_definition TEXT := pg_get_functiondef(
    'public.apply_external_reservation(uuid,text,uuid,integer,text,text,text,jsonb)'::regprocedure
  );
  v_source_check TEXT := $old$
  IF NOT FOUND THEN
    RAISE EXCEPTION 'source_not_found';
  END IF;
$old$;
  v_source_guard TEXT := $new$
  IF NOT FOUND THEN
    RAISE EXCEPTION 'source_not_found';
  END IF;
  IF p_external_booking_id IS NULL
     OR length(btrim(p_external_booking_id)) = 0
     OR length(btrim(p_external_booking_id)) > 200 THEN
    RAISE EXCEPTION 'invalid_external_booking_id';
  END IF;
  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 1000 THEN
    RAISE EXCEPTION 'invalid_reservation_quantity';
  END IF;
  IF p_action IS NULL OR p_action NOT IN ('book', 'cancel') THEN
    RAISE EXCEPTION 'invalid_reservation_action';
  END IF;
  IF p_action = 'book' AND v_source.sync_enabled IS NOT TRUE THEN
    RAISE EXCEPTION 'source_sync_disabled';
  END IF;
$new$;
  v_slot_read TEXT := $old$
  SELECT * INTO v_slot FROM public.booking_slots WHERE id = p_slot_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'slot_not_found';
  END IF;
$old$;
  v_slot_scope TEXT := $new$
  PERFORM id
    FROM public.booking_slots
   WHERE id IN (p_slot_id, v_existing.slot_id)
   ORDER BY id
   FOR UPDATE;
  IF v_existing.id IS NOT NULL
     AND v_existing.external_status IN ('confirmed', 'modified')
     AND v_existing.conflict_status = 'none' THEN
    UPDATE public.booking_slots
       SET booked = GREATEST(0, booked - v_existing.quantity),
           status = CASE WHEN booked - v_existing.quantity < capacity THEN 'available' ELSE status END
     WHERE id = v_existing.slot_id;
  END IF;
  SELECT * INTO v_slot FROM public.booking_slots WHERE id = p_slot_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'slot_not_found';
  END IF;
  IF v_slot.outlet_id IS DISTINCT FROM v_source.outlet_id
     OR (v_source.product_id IS NOT NULL AND v_slot.product_id IS DISTINCT FROM v_source.product_id) THEN
    RAISE EXCEPTION 'source_slot_mismatch';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.products AS product
     WHERE product.id = v_slot.product_id
       AND product.vendor_id = v_source.vendor_id
       AND product.status = 'active'
       AND product.review_status = 'approved'
       AND product.requires_booking = TRUE
       AND (product.outlet_id IS NULL OR product.outlet_id = v_source.outlet_id)
  ) THEN
    RAISE EXCEPTION 'product_vendor_mismatch';
  END IF;
$new$;
  v_overbook_conflict TEXT := $old$
    ON CONFLICT (source_id, external_booking_id) DO UPDATE
      SET external_status = 'confirmed', conflict_status = 'overbooked', updated_at = now()
$old$;
  v_overbook_update TEXT := $new$
    ON CONFLICT (source_id, external_booking_id) DO UPDATE
      SET slot_id = EXCLUDED.slot_id,
          quantity = EXCLUDED.quantity,
          guest_name = EXCLUDED.guest_name,
          guest_email = EXCLUDED.guest_email,
          payload = EXCLUDED.payload,
          external_status = 'confirmed',
          conflict_status = 'overbooked',
          synced_at = now(),
          updated_at = now()
$new$;
  v_normal_conflict TEXT := $old$
  ON CONFLICT (source_id, external_booking_id) DO UPDATE
    SET external_status = 'confirmed', conflict_status = 'none', updated_at = now()
$old$;
  v_normal_update TEXT := $new$
  ON CONFLICT (source_id, external_booking_id) DO UPDATE
    SET slot_id = EXCLUDED.slot_id,
        quantity = EXCLUDED.quantity,
        guest_name = EXCLUDED.guest_name,
        guest_email = EXCLUDED.guest_email,
        payload = EXCLUDED.payload,
        external_status = 'confirmed',
        conflict_status = 'none',
        synced_at = now(),
        updated_at = now()
$new$;
  v_confirmed_shortcut TEXT := $old$
    IF v_existing.external_status = 'confirmed' THEN
      RETURN jsonb_build_object('success', true, 'action', 'already_confirmed', 'reservation_id', v_existing.id);
    END IF;
$old$;
  v_confirmed_update TEXT := $new$
    IF v_existing.external_status IN ('confirmed', 'modified')
       AND v_existing.conflict_status = 'none'
       AND v_existing.slot_id = p_slot_id
       AND v_existing.quantity = p_quantity
       AND v_existing.guest_name IS NOT DISTINCT FROM p_guest_name
       AND v_existing.guest_email IS NOT DISTINCT FROM p_guest_email
       AND v_existing.payload IS NOT DISTINCT FROM COALESCE(p_payload, '{}'::jsonb) THEN
      RETURN jsonb_build_object('success', true, 'action', 'already_confirmed', 'reservation_id', v_existing.id);
    END IF;
$new$;
BEGIN
  IF position(v_source_check IN v_definition) = 0
     OR position(v_slot_read IN v_definition) = 0
     OR position(v_overbook_conflict IN v_definition) = 0
     OR position(v_normal_conflict IN v_definition) = 0
     OR position(v_confirmed_shortcut IN v_definition) = 0 THEN
    RAISE EXCEPTION 'apply_external_reservation definition changed; inspect migration before applying';
  END IF;

  v_definition := replace(v_definition, v_source_check, v_source_guard);
  v_definition := replace(v_definition, v_slot_read, v_slot_scope);
  v_definition := replace(v_definition, v_overbook_conflict, v_overbook_update);
  v_definition := replace(v_definition, v_normal_conflict, v_normal_update);
  v_definition := replace(v_definition, v_confirmed_shortcut, v_confirmed_update);
  EXECUTE v_definition;
END;
$migration$;

REVOKE ALL ON FUNCTION public.apply_external_reservation(UUID, TEXT, UUID, INT, TEXT, TEXT, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_external_reservation(UUID, TEXT, UUID, INT, TEXT, TEXT, TEXT, JSONB)
  TO service_role;
