-- Bookable products may intentionally have no product variant. Keep variants
-- mandatory for non-booking inventory while allowing a booking slot to carry
-- the selected product, outlet, and price.

DO $migration$
DECLARE
  v_function REGPROCEDURE := to_regprocedure(
    'public.prepare_checkout(uuid,uuid[],text,text,text,numeric,numeric,numeric,text,jsonb)'
  );
  v_definition TEXT;
  v_variant_updated_definition TEXT;
  v_price_updated_definition TEXT;
BEGIN
  IF v_function IS NULL THEN
    RAISE EXCEPTION 'prepare_checkout ten-argument function not found';
  END IF;

  SELECT pg_get_functiondef(v_function) INTO v_definition;

  v_variant_updated_definition := regexp_replace(
    v_definition,
    $pattern$SELECT\s+\*\s+INTO\s+v_variant\s+FROM\s+public\.product_variants\s+WHERE\s+id\s*=\s*v_line\.variant_id\s+AND\s+product_id\s*=\s*v_line\.product_id\s+AND\s+is_active;\s+IF\s+NOT\s+FOUND\s+THEN\s+RAISE\s+EXCEPTION\s+'variant_not_purchasable';\s+END\s+IF;$pattern$,
    $new$
    v_variant := NULL;
    IF v_line.variant_id IS NOT NULL THEN
      SELECT * INTO v_variant
        FROM public.product_variants
       WHERE id = v_line.variant_id
         AND product_id = v_line.product_id
         AND is_active;
      IF NOT FOUND THEN RAISE EXCEPTION 'variant_not_purchasable'; END IF;
    ELSIF NOT v_product_booking THEN
      RAISE EXCEPTION 'variant_not_purchasable';
    END IF;
$new$
  );

  IF v_variant_updated_definition = v_definition THEN
    RAISE EXCEPTION 'prepare_checkout variant validation pattern not found';
  END IF;

  v_price_updated_definition := regexp_replace(
    v_variant_updated_definition,
    $pattern$v_authoritative_price\s*:=\s*v_product\.base_price\s*\+\s*v_variant\.price_offset;$pattern$,
    $new$v_authoritative_price := v_product.base_price + COALESCE(v_variant.price_offset, 0);$new$
  );

  IF v_price_updated_definition = v_variant_updated_definition THEN
    RAISE EXCEPTION 'prepare_checkout base price pattern not found';
  END IF;

  EXECUTE v_price_updated_definition;
END
$migration$;
