-- Cart cleanup must use the checkout's recorded line IDs. Comparing a nullable
-- variant_id with `=` leaves successfully purchased variant-less bookings in
-- the cart forever.

DO $migration$
DECLARE
  v_function REGPROCEDURE := to_regprocedure(
    'public.finalize_checkout(uuid,text,text,text)'
  );
  v_definition TEXT;
  v_updated_definition TEXT;
BEGIN
  IF v_function IS NULL THEN
    RAISE EXCEPTION 'finalize_checkout function not found';
  END IF;

  SELECT pg_get_functiondef(v_function) INTO v_definition;

  v_updated_definition := regexp_replace(
    v_definition,
    $pattern$DELETE\s+FROM\s+public\.cart_items\s+ci\s+WHERE\s+ci\.cart_id\s*=\s*v_session\.cart_id\s+AND\s+ci\.id\s+IN\s*\(\s*SELECT\s+ci2\.id\s+FROM\s+public\.cart_items\s+ci2\s+WHERE\s+ci2\.cart_id\s*=\s*v_session\.cart_id\s+AND\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+public\.order_items\s+oi\s+WHERE\s+oi\.order_id\s*=\s*v_session\.order_id\s+AND\s+oi\.variant_id\s*=\s*ci2\.variant_id\s+AND\s+oi\.slot_id\s+IS\s+NOT\s+DISTINCT\s+FROM\s+ci2\.slot_id\s*\)\s*\);$pattern$,
    $new$
  DELETE FROM public.cart_items ci
   WHERE ci.cart_id = v_session.cart_id
     AND ci.id IN (
       SELECT reservation.cart_item_id
         FROM public.checkout_reservations reservation
        WHERE reservation.checkout_session_id = v_session.id
          AND reservation.status = 'committed'
          AND reservation.cart_item_id IS NOT NULL
     );
$new$
  );

  IF v_updated_definition = v_definition THEN
    RAISE EXCEPTION 'finalize_checkout cart cleanup pattern not found';
  END IF;

  EXECUTE v_updated_definition;
END
$migration$;
