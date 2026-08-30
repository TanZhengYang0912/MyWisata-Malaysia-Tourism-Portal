-- Two-layer product model, step 2 of 4: make the checkout chain outlet-aware.
--
-- Inventory identity changed from variant_id to (variant_id, outlet_id) in
-- step 1. Every reserve / commit / release must match on BOTH columns, or it
-- will update the wrong outlet's stock (or several rows at once) once a product
-- is sold at more than one outlet.
--
-- These functions are 8-9 KB each, so rather than retyping them (and risking
-- dropping unrelated logic) we patch the LIVE definition by string replacement
-- and assert that every pattern actually matched.

DO $migration$
DECLARE
  v_def  TEXT;
  v_new  TEXT;
BEGIN
  -- ── prepare_checkout: reserve against (variant, outlet) ──────────────────
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'prepare_checkout';

  v_new := replace(v_def,
    'WHERE variant_id = v_line.variant_id AND quantity - reserved >= v_line.quantity',
    'WHERE variant_id = v_line.variant_id AND outlet_id IS NOT DISTINCT FROM v_line.outlet_id AND quantity - reserved >= v_line.quantity');
  IF v_new = v_def THEN RAISE EXCEPTION 'patch failed: prepare_checkout inventory reserve'; END IF;
  v_def := v_new;

  v_new := replace(v_def,
    'INSERT INTO public.checkout_reservations(checkout_session_id, kind, variant_id, quantity, cart_item_id)',
    'INSERT INTO public.checkout_reservations(checkout_session_id, kind, variant_id, outlet_id, quantity, cart_item_id)');
  IF v_new = v_def THEN RAISE EXCEPTION 'patch failed: prepare_checkout inventory reservation columns'; END IF;
  v_def := v_new;

  v_new := replace(v_def,
    'VALUES (v_session.id, ''inventory'', v_line.variant_id, v_line.quantity, v_line.cart_item_id)',
    'VALUES (v_session.id, ''inventory'', v_line.variant_id, v_line.outlet_id, v_line.quantity, v_line.cart_item_id)');
  IF v_new = v_def THEN RAISE EXCEPTION 'patch failed: prepare_checkout inventory reservation values'; END IF;
  v_def := v_new;

  v_new := replace(v_def,
    'INSERT INTO public.checkout_reservations(checkout_session_id, kind, slot_id, quantity, cart_item_id)',
    'INSERT INTO public.checkout_reservations(checkout_session_id, kind, slot_id, outlet_id, quantity, cart_item_id)');
  IF v_new = v_def THEN RAISE EXCEPTION 'patch failed: prepare_checkout booking reservation columns'; END IF;
  v_def := v_new;

  v_new := replace(v_def,
    'VALUES (v_session.id, ''booking'', v_line.slot_id, v_line.quantity, v_line.cart_item_id)',
    'VALUES (v_session.id, ''booking'', v_line.slot_id, v_line.outlet_id, v_line.quantity, v_line.cart_item_id)');
  IF v_new = v_def THEN RAISE EXCEPTION 'patch failed: prepare_checkout booking reservation values'; END IF;

  EXECUTE v_new;

  -- ── finalize_checkout: commit and release against (variant, outlet) ──────
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'finalize_checkout';

  -- commit path (deducts stock on success)
  v_new := replace(v_def,
    'AND quantity >= v_reservation.quantity',
    'AND outlet_id IS NOT DISTINCT FROM v_reservation.outlet_id AND quantity >= v_reservation.quantity');
  IF v_new = v_def THEN RAISE EXCEPTION 'patch failed: finalize_checkout inventory commit'; END IF;
  v_def := v_new;

  -- release path (returns reserved stock when the session fails/expires)
  v_new := replace(v_def,
    'SET reserved = GREATEST(0, reserved - v_reservation.quantity), updated_at = NOW()',
    'SET reserved = GREATEST(0, reserved - v_reservation.quantity), updated_at = NOW()')
    ;
  v_new := regexp_replace(v_def,
    '(SET reserved = GREATEST\(0, reserved - v_reservation\.quantity\), updated_at = NOW\(\)\s*WHERE variant_id = v_reservation\.variant_id)(;)',
    '\1 AND outlet_id IS NOT DISTINCT FROM v_reservation.outlet_id\2');
  IF v_new = v_def THEN RAISE EXCEPTION 'patch failed: finalize_checkout inventory release'; END IF;

  EXECUTE v_new;
END
$migration$;;
