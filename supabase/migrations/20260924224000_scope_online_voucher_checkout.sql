-- Keep checkout-side voucher validation aligned with the server validator.
-- Voucher scope and redemption mode are enforced from authoritative order lines.
DO $migration$
DECLARE
  v_definition TEXT := pg_get_functiondef(
    'public.prepare_checkout(uuid,uuid[],text,text,text,numeric,numeric,numeric,text,jsonb)'::regprocedure
  );
  v_expected_discount_block TEXT := $old$
    IF v_voucher.voucher_type = 'bogo' THEN
      SELECT COALESCE(LEAST(p_subtotal, FLOOR(x.quantity::NUMERIC / NULLIF(v_voucher.buy_quantity, 0)) * v_voucher.free_quantity * x.unit_price), 0)
        INTO v_expected_discount
        FROM jsonb_to_recordset(p_lines) AS x(product_id UUID, quantity INTEGER, unit_price NUMERIC)
       WHERE x.product_id = v_voucher.product_id
       LIMIT 1;
    ELSIF v_voucher.voucher_type = 'percent' THEN
      v_expected_discount := LEAST(p_subtotal, p_subtotal * v_voucher.discount_value / 100);
    ELSE
      v_expected_discount := LEAST(p_subtotal, v_voucher.discount_value);
    END IF;
  $old$;
  v_scoped_discount_block TEXT := $new$
    IF v_voucher.voucher_type = 'bogo' THEN
      SELECT COALESCE(LEAST(v_eligible_subtotal, SUM(FLOOR(x.quantity::NUMERIC / NULLIF(v_voucher.buy_quantity, 0)) * v_voucher.free_quantity * x.unit_price)), 0)
        INTO v_expected_discount
        FROM jsonb_to_recordset(p_lines) AS x(product_id UUID, vendor_id UUID, outlet_id UUID, quantity INTEGER, unit_price NUMERIC, line_total NUMERIC)
       WHERE x.vendor_id = v_voucher.vendor_id
         AND (v_voucher.outlet_id IS NULL OR x.outlet_id = v_voucher.outlet_id)
         AND (v_voucher.product_id IS NULL OR x.product_id = v_voucher.product_id);
    ELSIF v_voucher.voucher_type = 'percent' THEN
      v_expected_discount := LEAST(v_eligible_subtotal, v_eligible_subtotal * v_voucher.discount_value / 100);
    ELSE
      v_expected_discount := LEAST(v_eligible_subtotal, v_voucher.discount_value);
    END IF;
  $new$;
  v_old_scope_checks TEXT := $old$
    IF p_subtotal < COALESCE(v_voucher.min_spend, 0) THEN RAISE EXCEPTION 'voucher_minimum_spend'; END IF;
    IF v_voucher.outlet_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM jsonb_to_recordset(p_lines) AS x(outlet_id UUID) WHERE x.outlet_id = v_voucher.outlet_id
    ) THEN RAISE EXCEPTION 'voucher_outlet_not_applicable'; END IF;
    IF v_voucher.product_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM jsonb_to_recordset(p_lines) AS x(product_id UUID) WHERE x.product_id = v_voucher.product_id
    ) THEN RAISE EXCEPTION 'voucher_product_not_applicable'; END IF;
  $old$;
  v_scoped_checks TEXT := $new$
    IF v_voucher.redemption_mode NOT IN ('online', 'both') THEN RAISE EXCEPTION 'voucher_not_available_online'; END IF;
    SELECT COALESCE(SUM(x.line_total), 0)
      INTO v_eligible_subtotal
      FROM jsonb_to_recordset(p_lines) AS x(product_id UUID, vendor_id UUID, outlet_id UUID, line_total NUMERIC)
     WHERE x.vendor_id = v_voucher.vendor_id
       AND (v_voucher.outlet_id IS NULL OR x.outlet_id = v_voucher.outlet_id)
       AND (v_voucher.product_id IS NULL OR x.product_id = v_voucher.product_id);
    IF NOT EXISTS (
      SELECT 1 FROM jsonb_to_recordset(p_lines) AS x(product_id UUID, vendor_id UUID, outlet_id UUID)
       WHERE x.vendor_id = v_voucher.vendor_id
         AND (v_voucher.outlet_id IS NULL OR x.outlet_id = v_voucher.outlet_id)
         AND (v_voucher.product_id IS NULL OR x.product_id = v_voucher.product_id)
    ) THEN RAISE EXCEPTION 'voucher_not_applicable'; END IF;
    IF v_eligible_subtotal < COALESCE(v_voucher.min_spend, 0) THEN RAISE EXCEPTION 'voucher_minimum_spend'; END IF;
  $new$;
BEGIN
  IF position('v_expected_discount NUMERIC := 0;' IN v_definition) = 0
     OR position(v_old_scope_checks IN v_definition) = 0
     OR position(v_expected_discount_block IN v_definition) = 0 THEN
    RAISE EXCEPTION 'prepare_checkout voucher definition changed; inspect migration before applying';
  END IF;

  v_definition := replace(v_definition, 'v_expected_discount NUMERIC := 0;', 'v_expected_discount NUMERIC := 0;' || E'\n  v_eligible_subtotal NUMERIC := 0;');
  v_definition := replace(v_definition, v_old_scope_checks, v_scoped_checks);
  v_definition := replace(v_definition, v_expected_discount_block, v_scoped_discount_block);
  EXECUTE v_definition;
END;
$migration$;
