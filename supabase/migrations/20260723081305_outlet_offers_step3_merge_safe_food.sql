-- Two-layer product model, step 3 of 4: merge duplicated FOOD products.
--
-- Only groups whose outlets share an IDENTICAL variant signature are merged.
-- Where outlets disagree on variants (e.g. one has a "Child" portion and another
-- does not) merging would silently change what an outlet sells, so those groups
-- are left untouched for a human decision — as required by the plan.
--
-- Grouping is by (vendor_id, name) but ONLY after the variant/category/booking
-- checks above have passed; it is a verified merge, not a name guess.

CREATE TABLE IF NOT EXISTS public.product_merge_map (
  old_product_id       UUID PRIMARY KEY,
  canonical_product_id UUID NOT NULL,
  merged_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $migrate$
DECLARE
  g RECORD;
  m RECORD;
  v_canonical UUID;
BEGIN
  FOR g IN
    WITH sig AS (
      SELECT p.id, p.vendor_id, p.name, p.outlet_id, p.base_price, p.created_at,
             COALESCE(string_agg(v.name || '@' || v.price_offset, ',' ORDER BY v.name), '(none)') AS variant_sig,
             p.category_id, p.requires_booking, array_to_string(p.type_slugs, ',') AS tslugs
        FROM public.products p
        LEFT JOIN public.product_variants v ON v.product_id = p.id
       WHERE p.product_type = 'food' AND p.outlet_id IS NOT NULL
       GROUP BY p.id
    )
    SELECT vendor_id, name
      FROM sig
     GROUP BY vendor_id, name
    HAVING COUNT(*) > 1
       AND COUNT(DISTINCT variant_sig) = 1
       AND COUNT(DISTINCT COALESCE(category_id::TEXT, '-')) = 1
       AND COUNT(DISTINCT requires_booking::TEXT) = 1
       AND COUNT(DISTINCT tslugs) = 1
  LOOP
    -- Canonical = oldest row, deterministic tiebreak on id.
    SELECT id INTO v_canonical
      FROM public.products
     WHERE vendor_id = g.vendor_id AND name = g.name AND product_type = 'food' AND outlet_id IS NOT NULL
     ORDER BY created_at, id
     LIMIT 1;

    FOR m IN
      SELECT id, outlet_id, base_price
        FROM public.products
       WHERE vendor_id = g.vendor_id AND name = g.name AND product_type = 'food' AND outlet_id IS NOT NULL
    LOOP
      -- Every member (canonical included) becomes an offer at its own outlet.
      INSERT INTO public.outlet_offers (product_id, outlet_id, price, status)
      VALUES (v_canonical, m.outlet_id, m.base_price, 'active')
      ON CONFLICT (product_id, outlet_id) DO NOTHING;

      CONTINUE WHEN m.id = v_canonical;

      INSERT INTO public.product_merge_map (old_product_id, canonical_product_id)
      VALUES (m.id, v_canonical) ON CONFLICT (old_product_id) DO NOTHING;

      -- Repoint variant references onto the canonical variant of the same name.
      -- Inventory keeps its own outlet_id, so stock stays per-outlet.
      UPDATE public.inventory i SET variant_id = cv.id
        FROM public.product_variants ov
        JOIN public.product_variants cv
          ON cv.product_id = v_canonical AND cv.name = ov.name
       WHERE ov.product_id = m.id AND i.variant_id = ov.id;

      UPDATE public.cart_items c SET variant_id = cv.id
        FROM public.product_variants ov
        JOIN public.product_variants cv
          ON cv.product_id = v_canonical AND cv.name = ov.name
       WHERE ov.product_id = m.id AND c.variant_id = ov.id;

      UPDATE public.checkout_reservations r SET variant_id = cv.id
        FROM public.product_variants ov
        JOIN public.product_variants cv
          ON cv.product_id = v_canonical AND cv.name = ov.name
       WHERE ov.product_id = m.id AND r.variant_id = ov.id;

      UPDATE public.order_items o SET variant_id = cv.id
        FROM public.product_variants ov
        JOIN public.product_variants cv
          ON cv.product_id = v_canonical AND cv.name = ov.name
       WHERE ov.product_id = m.id AND o.variant_id = ov.id;

      -- price_rules cascade on product delete; move them to the canonical product.
      UPDATE public.price_rules SET product_id = v_canonical WHERE product_id = m.id;
      UPDATE public.price_rules pr SET variant_id = cv.id
        FROM public.product_variants ov
        JOIN public.product_variants cv
          ON cv.product_id = v_canonical AND cv.name = ov.name
       WHERE ov.product_id = m.id AND pr.variant_id = ov.id;

      -- Repoint product references. History keeps its own product_name/unit_price
      -- snapshot, so order history text and totals are unaffected.
      UPDATE public.order_items      SET product_id = v_canonical WHERE product_id = m.id;
      UPDATE public.reviews          SET product_id = v_canonical WHERE product_id = m.id;
      UPDATE public.vouchers         SET product_id = v_canonical WHERE product_id = m.id;
      UPDATE public.media_assets     SET product_id = v_canonical WHERE product_id = m.id;
      UPDATE public.booking_slots    SET product_id = v_canonical WHERE product_id = m.id;

      -- Wishlist and entitlements are unique per (user, product): drop rows that
      -- would collide, then move the rest.
      DELETE FROM public.customer_wishlists w
       WHERE w.product_id = m.id
         AND EXISTS (SELECT 1 FROM public.customer_wishlists w2
                      WHERE w2.user_id = w.user_id AND w2.product_id = v_canonical);
      UPDATE public.customer_wishlists SET product_id = v_canonical WHERE product_id = m.id;

      UPDATE public.digital_entitlements SET product_id = v_canonical WHERE product_id = m.id;

      DELETE FROM public.products WHERE id = m.id;
    END LOOP;

    -- Shared product belongs to no single outlet: keeps an outlet's ON DELETE
    -- CASCADE from taking the product and every other outlet's offer with it.
    UPDATE public.products SET outlet_id = NULL WHERE id = v_canonical;
  END LOOP;
END
$migrate$;;
