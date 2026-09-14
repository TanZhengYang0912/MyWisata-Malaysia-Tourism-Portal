-- Preserve the outlet selected on each cart line when a product is sold by
-- several outlets. Direct-outlet products retain their existing validation;
-- shared products must have an active offer for the exact selected outlet.

DO $migration$
DECLARE
  v_function REGPROCEDURE := to_regprocedure(
    'public.prepare_checkout(uuid,uuid[],text,text,text,numeric,numeric,numeric,text,jsonb)'
  );
  v_definition TEXT;
  v_updated_definition TEXT;
BEGIN
  IF v_function IS NULL THEN
    RAISE EXCEPTION 'prepare_checkout ten-argument function not found';
  END IF;

  SELECT pg_get_functiondef(v_function) INTO v_definition;

  v_updated_definition := regexp_replace(
    v_definition,
    $pattern$SELECT\s+\*\s+INTO\s+v_product\s+FROM\s+public\.products\s+WHERE\s+id\s*=\s*v_line\.product_id\s+AND\s+vendor_id\s*=\s*v_line\.vendor_id\s+AND\s+outlet_id\s*=\s*v_line\.outlet_id\s+AND\s+status\s*=\s*'active'\s+AND\s+review_status\s*=\s*'approved';\s+IF\s+NOT\s+FOUND\s+OR\s+v_product\.requires_booking\s*<>\s*COALESCE\(v_line\.requires_booking,\s*false\)\s+THEN\s+RAISE\s+EXCEPTION\s+'product_not_purchasable';\s+END\s+IF;$pattern$,
    $new$
    SELECT * INTO v_product
      FROM public.products
     WHERE id = v_line.product_id
       AND vendor_id = v_line.vendor_id
       AND status = 'active'
       AND review_status = 'approved';
    IF NOT FOUND
       OR (
         v_product.outlet_id IS DISTINCT FROM v_line.outlet_id
         AND NOT EXISTS (
           SELECT 1
             FROM public.outlet_offers offer
            WHERE offer.product_id = v_product.id
              AND offer.outlet_id = v_line.outlet_id
              AND offer.status = 'active'
         )
       )
       OR v_product.requires_booking <> COALESCE(v_line.requires_booking, false) THEN
      RAISE EXCEPTION 'product_not_purchasable';
    END IF;
$new$
  );

  IF v_updated_definition = v_definition THEN
    RAISE EXCEPTION 'prepare_checkout outlet validation pattern not found';
  END IF;

  EXECUTE v_updated_definition;
END
$migration$;
