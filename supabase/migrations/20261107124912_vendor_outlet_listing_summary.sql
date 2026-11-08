CREATE OR REPLACE FUNCTION public.get_vendor_outlet_listing_summary(
  p_vendor_id uuid,
  p_outlet_ids uuid[],
  p_accommodation_category_id uuid
)
RETURNS TABLE (
  outlet_id uuid,
  products_count bigint,
  is_accommodation_outlet boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH requested_outlets AS MATERIALIZED (
    SELECT outlet.id
    FROM public.outlets AS outlet
    WHERE outlet.vendor_id = p_vendor_id
      AND outlet.id = ANY(COALESCE(p_outlet_ids, ARRAY[]::uuid[]))
  ),
  product_outlet_links AS (
    SELECT product.outlet_id, product.id AS product_id, product.category_id, product.status
    FROM requested_outlets AS outlet
    JOIN public.products AS product ON product.outlet_id = outlet.id
    WHERE product.vendor_id = p_vendor_id

    UNION

    SELECT outlet.id AS outlet_id, product.id AS product_id, product.category_id, product.status
    FROM requested_outlets AS outlet
    JOIN public.outlet_offers AS offer
      ON offer.outlet_id = outlet.id
      AND offer.status = 'active'
    JOIN public.products AS product
      ON product.id = offer.product_id
      AND product.vendor_id = p_vendor_id
  )
  SELECT
    outlet.id AS outlet_id,
    COUNT(DISTINCT product_link.product_id) AS products_count,
    COALESCE(
      BOOL_OR(
        product_link.category_id = p_accommodation_category_id
        AND product_link.status = 'active'
      ),
      false
    ) AS is_accommodation_outlet
  FROM requested_outlets AS outlet
  LEFT JOIN product_outlet_links AS product_link ON product_link.outlet_id = outlet.id
  GROUP BY outlet.id;
$$;

REVOKE ALL ON FUNCTION public.get_vendor_outlet_listing_summary(uuid, uuid[], uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_vendor_outlet_listing_summary(uuid, uuid[], uuid)
  TO service_role;
