-- Canonicalize the customer-facing launch dataset to one voucher per real
-- outlet. Product and outlet offer records remain untouched and authoritative.
-- Existing voucher and claim rows are retained for audit; no rows are deleted.

CREATE TEMP TABLE eligible_outlets ON COMMIT DROP AS
SELECT
  p.vendor_id,
  v.slug AS vendor_slug,
  v.name AS vendor_name,
  oo.outlet_id,
  o.name AS outlet_name,
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
GROUP BY p.vendor_id, v.slug, v.name, oo.outlet_id, o.name;

CREATE TEMP TABLE eligible_product_outlets ON COMMIT DROP AS
SELECT DISTINCT p.id AS product_id, oo.outlet_id
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
  AND GREATEST(COALESCE(oo.price, 0), COALESCE(p.base_price, 0)) > 0;

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
  eligible.vendor_id,
  eligible.outlet_id,
  NULL::UUID,
  'MYW-OUTLET-'
    || upper(substr(regexp_replace(COALESCE(eligible.vendor_slug, eligible.vendor_name), '[^a-zA-Z0-9]+', '', 'g'), 1, 10))
    || '-'
    || upper(substr(replace(eligible.outlet_id::TEXT, '-', ''), 1, 8)),
  left(eligible.outlet_name || ' — 10% off all eligible products', 255),
  'percent',
  10::NUMERIC,
  eligible.offer_price,
  100,
  0,
  now(),
  now() + interval '90 days',
  true,
  'approved',
  left('Canonical outlet voucher from ' || eligible.active_product_count || ' active product(s) at minimum MYR ' || eligible.offer_price, 500),
  now(),
  NULL,
  NULL,
  1,
  0,
  true,
  now(),
  now() + interval '90 days',
  CASE WHEN eligible.all_products_require_booking THEN 'online' ELSE 'both' END
FROM eligible_outlets AS eligible
ON CONFLICT (code) DO NOTHING;

CREATE TEMP TABLE outlet_voucher_map ON COMMIT DROP AS
SELECT eligible.outlet_id, vouchers.id AS voucher_id
FROM eligible_outlets AS eligible
JOIN public.vouchers AS vouchers
  ON vouchers.code = 'MYW-OUTLET-'
    || upper(substr(regexp_replace(COALESCE(eligible.vendor_slug, eligible.vendor_name), '[^a-zA-Z0-9]+', '', 'g'), 1, 10))
    || '-'
    || upper(substr(replace(eligible.outlet_id::TEXT, '-', ''), 1, 8));

WITH source_claims AS (
  SELECT
    claims.user_id,
    source.product_id,
    claims.status,
    claims.claimed_at,
    claims.redeemed_at,
    claims.expires_at,
    COALESCE(source.outlet_id, outlet_hint.outlet_id, fallback.outlet_id) AS outlet_id
  FROM public.customer_voucher_claims AS claims
  JOIN public.vouchers AS source
    ON source.id = claims.voucher_id
  LEFT JOIN LATERAL (
    SELECT old_voucher.outlet_id
    FROM public.customer_voucher_claims AS old_claim
    JOIN public.vouchers AS old_voucher
      ON old_voucher.id = old_claim.voucher_id
    JOIN outlet_voucher_map AS old_outlet
      ON old_outlet.outlet_id = old_voucher.outlet_id
    WHERE old_claim.user_id = claims.user_id
      AND old_voucher.product_id = source.product_id
      AND old_voucher.outlet_id IS NOT NULL
    ORDER BY CASE WHEN old_claim.status = 'redeemed' THEN 0 ELSE 1 END, old_claim.claimed_at DESC
    LIMIT 1
  ) AS outlet_hint ON TRUE
  LEFT JOIN LATERAL (
    SELECT eligible_product_outlets.outlet_id
    FROM eligible_product_outlets
    WHERE eligible_product_outlets.product_id = source.product_id
    ORDER BY eligible_product_outlets.outlet_id
    LIMIT 1
  ) AS fallback ON TRUE
  WHERE source.code LIKE 'MYW-LAUNCH-%'
    AND source.product_id IS NOT NULL
    AND (source.outlet_id IS NULL OR EXISTS (
      SELECT 1 FROM outlet_voucher_map WHERE outlet_voucher_map.outlet_id = source.outlet_id
    ))
), canonical_claims AS (
  SELECT DISTINCT ON (source_claims.user_id, source_claims.outlet_id)
    source_claims.user_id,
    source_claims.outlet_id,
    source_claims.status,
    source_claims.claimed_at,
    source_claims.redeemed_at,
    source_claims.expires_at,
    outlet_voucher_map.voucher_id
  FROM source_claims
  JOIN outlet_voucher_map
    ON outlet_voucher_map.outlet_id = source_claims.outlet_id
  WHERE source_claims.outlet_id IS NOT NULL
  ORDER BY
    source_claims.user_id,
    source_claims.outlet_id,
    CASE WHEN source_claims.status = 'redeemed' THEN 0 ELSE 1 END,
    source_claims.claimed_at DESC
)
INSERT INTO public.customer_voucher_claims (
  voucher_id,
  user_id,
  status,
  claimed_at,
  redeemed_at,
  expires_at
)
SELECT
  canonical_claims.voucher_id,
  canonical_claims.user_id,
  canonical_claims.status,
  canonical_claims.claimed_at,
  canonical_claims.redeemed_at,
  COALESCE(canonical_claims.expires_at, vouchers.valid_until)
FROM canonical_claims
JOIN public.vouchers AS vouchers
  ON vouchers.id = canonical_claims.voucher_id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.customer_voucher_claims AS existing
  WHERE existing.voucher_id = canonical_claims.voucher_id
    AND existing.user_id = canonical_claims.user_id
)
ON CONFLICT (voucher_id, user_id) DO NOTHING;

UPDATE public.vouchers AS vouchers
SET
  is_active = FALSE,
  is_claimable = FALSE,
  review_status = 'rejected',
  review_note = left(COALESCE(vouchers.review_note, '') || ' Superseded by the canonical outlet-level voucher.', 500),
  reviewed_at = NOW()
WHERE vouchers.code LIKE 'MYW-LAUNCH-%'
  AND vouchers.product_id IS NOT NULL
  AND vouchers.outlet_id IS NULL
  AND vouchers.is_active = TRUE
  AND vouchers.review_status = 'approved';;
