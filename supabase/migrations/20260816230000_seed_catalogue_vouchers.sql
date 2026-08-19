-- Create one customer-facing launch voucher for each real outlet in the
-- approved catalogue. Active outlet_offers remain the source of truth for
-- which products the voucher covers; product_id is intentionally null.
-- Re-running it is safe because generated outlet codes are deterministic.

WITH eligible_outlets AS (
  SELECT
    p.vendor_id,
    v.slug AS vendor_slug,
    v.name AS vendor_name,
    oo.outlet_id,
    o.name AS outlet_name,
    o.city,
    o.state,
    MIN(GREATEST(COALESCE(oo.price, 0), COALESCE(p.base_price, 0)))::NUMERIC(12, 2) AS offer_price,
    COUNT(DISTINCT p.id)::INTEGER AS active_product_count,
    BOOL_AND(p.requires_booking) AS all_products_require_booking
  FROM public.products p
  JOIN public.vendors v
    ON v.id = p.vendor_id
  JOIN public.outlet_offers oo
    ON oo.product_id = p.id
  JOIN public.outlets o
    ON o.id = oo.outlet_id
   AND o.vendor_id = p.vendor_id
  WHERE p.status = 'active'
    AND p.review_status = 'approved'
    AND v.status = 'approved'
    AND o.status = 'active'
    AND o.review_status = 'approved'
    AND oo.status = 'active'
    AND GREATEST(COALESCE(oo.price, 0), COALESCE(p.base_price, 0)) > 0
  GROUP BY p.vendor_id, v.slug, v.name, oo.outlet_id, o.name, o.city, o.state
), prepared_vouchers AS (
  SELECT
    vendor_id,
    outlet_id,
    outlet_name,
    vendor_name,
    offer_price,
    active_product_count,
    all_products_require_booking,
    'MYW-OUTLET-'
      || upper(substr(regexp_replace(COALESCE(vendor_slug, vendor_name), '[^a-zA-Z0-9]+', '', 'g'), 1, 10))
      || '-'
      || upper(substr(replace(outlet_id::TEXT, '-', ''), 1, 8)) AS code
  FROM eligible_outlets
)
INSERT INTO public.vouchers (
  vendor_id,
  outlet_id,
  product_id,
  code,
  name,
  voucher_type,
  discount_value,
  min_spend,
  max_uses,
  uses_count,
  valid_from,
  valid_until,
  is_active,
  review_status,
  review_note,
  reviewed_at,
  buy_quantity,
  free_quantity,
  per_customer_limit,
  reserved_uses,
  is_claimable,
  claim_from,
  claim_until,
  redemption_mode
)
SELECT
  vendor_id,
  outlet_id,
  NULL::UUID,
  code,
  left(outlet_name || ' — 10% off all eligible products', 255),
  'percent',
  10::NUMERIC,
  offer_price,
  100,
  0,
  now(),
  now() + interval '90 days',
  true,
  'approved',
  left('Catalogue-derived outlet voucher from ' || active_product_count || ' active product(s) at minimum MYR ' || offer_price, 500),
  now(),
  NULL,
  NULL,
  1,
  0,
  true,
  now(),
  now() + interval '90 days',
  CASE WHEN all_products_require_booking THEN 'online' ELSE 'both' END
FROM prepared_vouchers
ON CONFLICT (code) DO NOTHING;

-- Keep generated names aligned if the seed is re-run after copy changes.
UPDATE public.vouchers
SET name = left(outlets.name || ' — 10% off all eligible products', 255)
FROM public.outlets AS outlets
WHERE public.vouchers.outlet_id = outlets.id
  AND public.vouchers.code LIKE 'MYW-OUTLET-%';
