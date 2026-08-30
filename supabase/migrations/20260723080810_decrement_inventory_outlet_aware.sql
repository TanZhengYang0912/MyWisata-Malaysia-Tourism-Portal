-- Inventory is now keyed by (variant_id, outlet_id). Matching on variant alone
-- would update the wrong outlet's stock once a variant is sold at more than one
-- outlet, so the outlet must be part of the WHERE clause.
--
-- The 2-arg version is dropped rather than kept alongside: leaving both would
-- make a 2-arg call ambiguous. p_outlet_id keeps a NULL fallback so a caller
-- that has not been updated still behaves as before.
--
-- Also fixes a pre-existing bug: the auto-deactivate check summed stock across
-- ALL outlets, so one outlet selling out could deactivate the product for every
-- outlet. It is now scoped to the outlet being decremented.

DROP FUNCTION IF EXISTS public.decrement_inventory(uuid, integer);

CREATE OR REPLACE FUNCTION public.decrement_inventory(
  p_variant_id UUID,
  p_quantity   INTEGER,
  p_outlet_id  UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  updated_rows INTEGER;
  v_product_id UUID;
  v_available  INTEGER;
BEGIN
  IF p_quantity IS NULL OR p_quantity < 1 THEN RETURN FALSE; END IF;

  SELECT product_id INTO v_product_id FROM product_variants WHERE id = p_variant_id;

  UPDATE inventory
     SET quantity = quantity - p_quantity, updated_at = NOW()
   WHERE variant_id = p_variant_id
     AND (p_outlet_id IS NULL OR outlet_id IS NOT DISTINCT FROM p_outlet_id)
     AND quantity - reserved >= p_quantity;
  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  IF updated_rows <> 1 THEN RETURN FALSE; END IF;

  -- Remaining stock for this product AT THIS OUTLET.
  SELECT COALESCE(SUM(i.quantity - i.reserved), 0)::INTEGER
    INTO v_available
    FROM inventory i
    JOIN product_variants pv ON pv.id = i.variant_id
   WHERE pv.product_id = v_product_id
     AND pv.is_active = TRUE
     AND (p_outlet_id IS NULL OR i.outlet_id IS NOT DISTINCT FROM p_outlet_id);

  IF v_available <= 0 THEN
    IF p_outlet_id IS NULL THEN
      -- Legacy single-outlet behaviour.
      UPDATE products SET status = 'inactive', updated_at = NOW()
       WHERE id = v_product_id AND status <> 'archived';
    ELSE
      -- Multi-outlet: only this outlet's offer sells out, never the shared
      -- product. If the product has no offers yet it is still single-outlet,
      -- so fall back to deactivating the product itself.
      UPDATE outlet_offers SET status = 'sold_out', updated_at = NOW()
       WHERE product_id = v_product_id AND outlet_id = p_outlet_id AND status = 'active';
      IF NOT FOUND AND NOT EXISTS (SELECT 1 FROM outlet_offers WHERE product_id = v_product_id) THEN
        UPDATE products SET status = 'inactive', updated_at = NOW()
         WHERE id = v_product_id AND status <> 'archived';
      END IF;
    END IF;
  END IF;

  RETURN TRUE;
END;
$function$;

REVOKE ALL ON FUNCTION public.decrement_inventory(uuid, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decrement_inventory(uuid, integer, uuid) TO authenticated, service_role;;
