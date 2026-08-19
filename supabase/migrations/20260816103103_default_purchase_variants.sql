-- Ensure every active, non-booking product has a concrete purchase record.
-- The cart and checkout contracts intentionally require a product variant for
-- instant purchases; a base price alone is not enough to create an order line.

BEGIN;

INSERT INTO public.product_variants (
  product_id,
  name,
  price_offset,
  is_default,
  is_active,
  sort_order
)
SELECT
  p.id,
  'Standard',
  0,
  TRUE,
  TRUE,
  0
FROM public.products p
WHERE p.status = 'active'
  AND p.review_status = 'approved'
  AND p.requires_booking = FALSE
  AND NOT EXISTS (
    SELECT 1
    FROM public.product_variants v
    WHERE v.product_id = p.id
      AND v.is_active = TRUE
  );

-- Inventory is outlet-scoped. Seed only missing rows, so existing quantities
-- and reservations remain untouched while newly normalised products can pass
-- the same checkout inventory contract as every other instant purchase.
WITH product_outlets AS (
  SELECT p.id AS product_id, p.outlet_id
  FROM public.products p
  WHERE p.outlet_id IS NOT NULL

  UNION

  SELECT oo.product_id, oo.outlet_id
  FROM public.outlet_offers oo
  WHERE oo.status = 'active'
),
eligible_variants AS (
  SELECT DISTINCT v.id AS variant_id, po.outlet_id
  FROM public.product_variants v
  JOIN public.products p ON p.id = v.product_id
  JOIN product_outlets po ON po.product_id = p.id
  WHERE p.status = 'active'
    AND p.review_status = 'approved'
    AND p.requires_booking = FALSE
    AND v.is_active = TRUE
)
INSERT INTO public.inventory (variant_id, outlet_id, quantity, reserved, low_stock_threshold)
SELECT ev.variant_id, ev.outlet_id, 50, 0, 5
FROM eligible_variants ev
WHERE NOT EXISTS (
  SELECT 1
  FROM public.inventory i
  WHERE i.variant_id = ev.variant_id
    AND i.outlet_id = ev.outlet_id
)
ON CONFLICT (variant_id, outlet_id) DO NOTHING;

COMMIT;
