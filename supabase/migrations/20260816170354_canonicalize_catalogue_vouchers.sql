-- Canonicalize the first outlet-scoped launch dataset without deleting history.
-- The real product_outlets/outlet_offers relationships remain authoritative for
-- availability; this migration only removes duplicate customer-facing voucher
-- cards created for the same product and identical commercial terms.

CREATE TEMP TABLE voucher_canonical_map ON COMMIT DROP AS
WITH launch_rows AS (
  SELECT
    id,
    vendor_id,
    product_id,
    voucher_type,
    discount_value,
    min_spend,
    max_uses,
    per_customer_limit,
    redemption_mode,
    valid_from,
    valid_until,
    outlet_id
  FROM public.vouchers
  WHERE code LIKE 'MYW-LAUNCH-%'
    AND product_id IS NOT NULL
), grouped_rows AS (
  SELECT
    vendor_id,
    product_id,
    voucher_type,
    discount_value,
    min_spend,
    max_uses,
    per_customer_limit,
    redemption_mode,
    valid_from,
    valid_until,
    (array_agg(id ORDER BY id))[1] AS canonical_id,
    COUNT(*) AS row_count,
    COUNT(DISTINCT outlet_id) AS outlet_count
  FROM launch_rows
  GROUP BY
    vendor_id,
    product_id,
    voucher_type,
    discount_value,
    min_spend,
    max_uses,
    per_customer_limit,
    redemption_mode,
    valid_from,
    valid_until
  HAVING COUNT(*) > 1 AND COUNT(DISTINCT outlet_id) > 1
)
SELECT
  rows.id AS old_id,
  grouped.canonical_id
FROM launch_rows AS rows
JOIN grouped_rows AS grouped
  ON grouped.vendor_id = rows.vendor_id
 AND grouped.product_id = rows.product_id
 AND grouped.voucher_type = rows.voucher_type
 AND grouped.discount_value = rows.discount_value
 AND grouped.min_spend IS NOT DISTINCT FROM rows.min_spend
 AND grouped.max_uses IS NOT DISTINCT FROM rows.max_uses
 AND grouped.per_customer_limit IS NOT DISTINCT FROM rows.per_customer_limit
 AND grouped.redemption_mode = rows.redemption_mode
 AND grouped.valid_from IS NOT DISTINCT FROM rows.valid_from
 AND grouped.valid_until IS NOT DISTINCT FROM rows.valid_until;

-- Keep one canonical product-level row. The product's active outlet offers
-- remain the real availability boundary used by the catalogue and checkout.
UPDATE public.vouchers AS vouchers
SET
  outlet_id = NULL,
  review_note = left(
    COALESCE(vouchers.review_note, '') || ' Canonical product-level voucher; outlet availability comes from active outlet offers.',
    500
  )
WHERE vouchers.id IN (SELECT DISTINCT canonical_id FROM voucher_canonical_map);

-- Move existing customer entitlements to the canonical voucher before hiding
-- superseded rows. This preserves the customer's claim and checkout deep link.
WITH mapped_claims AS (
  SELECT DISTINCT ON (mapping.canonical_id, claims.user_id)
    mapping.canonical_id,
    claims.user_id,
    claims.status,
    claims.claimed_at,
    claims.redeemed_at,
    claims.expires_at
  FROM public.customer_voucher_claims AS claims
  JOIN voucher_canonical_map AS mapping
    ON mapping.old_id = claims.voucher_id
  ORDER BY
    mapping.canonical_id,
    claims.user_id,
    CASE WHEN claims.status = 'redeemed' THEN 0 ELSE 1 END,
    claims.claimed_at
)
INSERT INTO public.customer_voucher_claims (
  voucher_id,
  user_id,
  status,
  claimed_at,
  redeemed_at,
  expires_at
)
SELECT canonical_id, user_id, status, claimed_at, redeemed_at, expires_at
FROM mapped_claims
WHERE NOT EXISTS (
  SELECT 1
  FROM public.customer_voucher_claims AS existing
  WHERE existing.voucher_id = mapped_claims.canonical_id
    AND existing.user_id = mapped_claims.user_id
)
ON CONFLICT (voucher_id, user_id) DO NOTHING;

-- Preserve superseded rows for audit, but make them impossible to claim or
-- display in either customer tab.
UPDATE public.vouchers AS vouchers
SET
  is_active = FALSE,
  is_claimable = FALSE,
  review_status = 'rejected',
  review_note = left(
    COALESCE(vouchers.review_note, '') || ' Superseded by the canonical product-level voucher.',
    500
  ),
  reviewed_at = NOW()
FROM voucher_canonical_map AS mapping
WHERE vouchers.id = mapping.old_id
  AND mapping.old_id <> mapping.canonical_id;
;
