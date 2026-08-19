-- Restore the booking data contract after the catalogue reseed.
--
-- The regional reseeds intentionally keep historical booking slots attached to
-- completed demo orders. Those rows are useful history, but they are not future
-- availability. This migration keeps them and adds a small rolling window for
-- every customer-visible booking product.

BEGIN;

-- Place-bound guide products still have a real vendor and one active operating
-- outlet, but their product row was left outlet-less for editorial place links.
-- Bind only this unambiguous vendor-backed booking case so booking_slots and
-- checkout can retain the required outlet scope. Public place-only products are
-- not changed because they do not have a vendor booking relationship.
UPDATE public.products p
SET outlet_id = provider.outlet_id
FROM LATERAL (
  SELECT o.id AS outlet_id
  FROM public.outlets o
  WHERE o.vendor_id = p.vendor_id
    AND o.status = 'active'
  ORDER BY o.id
  LIMIT 1
) provider
WHERE p.requires_booking = TRUE
  AND p.outlet_id IS NULL;

-- Checkout requires a variant even when the customer only needs one standard
-- ticket. Add the missing standard purchase record for booking products.
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
  AND p.requires_booking = TRUE
  AND NOT EXISTS (
    SELECT 1
    FROM public.product_variants v
    WHERE v.product_id = p.id
      AND v.is_active = TRUE
  );

-- Keep two canonical future, available times per visible booking product. The
-- exact-slot guard makes the migration safe to replay and preserves historical
-- slots, bookings, and their foreign-key references.
WITH eligible_products AS (
  SELECT
    p.id AS product_id,
    p.outlet_id
  FROM public.products p
  WHERE p.status = 'active'
    AND p.review_status = 'approved'
    AND p.requires_booking = TRUE
    AND p.outlet_id IS NOT NULL
), slot_plan AS (
  SELECT
    e.product_id,
    e.outlet_id,
    slot_number,
    date_trunc('day', CURRENT_TIMESTAMP)
      + ((slot_number * 7) + 1) * INTERVAL '1 day'
      + INTERVAL '10 hours' AS starts_at
  FROM eligible_products e
  CROSS JOIN generate_series(1, 2) AS slot_number
)
INSERT INTO public.booking_slots (
  product_id,
  outlet_id,
  starts_at,
  ends_at,
  capacity,
  booked,
  status
)
SELECT
  s.product_id,
  s.outlet_id,
  s.starts_at,
  s.starts_at + INTERVAL '2 hours',
  20,
  0,
  'available'
FROM slot_plan s
WHERE NOT EXISTS (
  SELECT 1
  FROM public.booking_slots existing
  WHERE existing.product_id = s.product_id
    AND existing.outlet_id = s.outlet_id
    AND existing.starts_at = s.starts_at
);

DO $$
DECLARE
  missing_outlets INTEGER;
  missing_variants INTEGER;
  missing_slots INTEGER;
BEGIN
  SELECT COUNT(*) INTO missing_outlets
  FROM public.products p
  WHERE p.status = 'active'
    AND p.review_status = 'approved'
    AND p.requires_booking = TRUE
    AND p.outlet_id IS NULL;

  SELECT COUNT(*) INTO missing_variants
  FROM public.products p
  WHERE p.status = 'active'
    AND p.review_status = 'approved'
    AND p.requires_booking = TRUE
    AND NOT EXISTS (
      SELECT 1
      FROM public.product_variants v
      WHERE v.product_id = p.id
        AND v.is_active = TRUE
    );

  SELECT COUNT(*) INTO missing_slots
  FROM public.products p
  WHERE p.status = 'active'
    AND p.review_status = 'approved'
    AND p.requires_booking = TRUE
    AND NOT EXISTS (
      SELECT 1
      FROM public.booking_slots b
      WHERE b.product_id = p.id
        AND b.starts_at > CURRENT_TIMESTAMP
        AND b.status = 'available'
        AND b.booked < b.capacity
    );

  IF missing_outlets > 0 OR missing_variants > 0 OR missing_slots > 0 THEN
    RAISE EXCEPTION
      'booking catalogue repair incomplete: % products without outlet, % without variant, % without future slot',
      missing_outlets, missing_variants, missing_slots;
  END IF;
END $$;

COMMIT;
