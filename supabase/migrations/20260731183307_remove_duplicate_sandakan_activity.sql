UPDATE booking_slots b
   SET product_id = '0a3b3258-42b6-4ab4-a70d-b88339123e5f',
       outlet_id  = s.outlet_id
  FROM products s
 WHERE s.id = '0a3b3258-42b6-4ab4-a70d-b88339123e5f'
   AND b.product_id = '685b8ce1-b0b6-416d-aeaf-eb4c42cf2dba';

UPDATE order_items oi
   SET product_id   = s.id,
       variant_id   = v.id,
       outlet_id    = s.outlet_id,
       product_name = s.name,
       variant_name = v.name,
       image_url    = s.cover_url
  FROM products s
  JOIN LATERAL (SELECT pv.id, pv.name FROM product_variants pv WHERE pv.product_id = s.id
                 ORDER BY pv.is_default DESC, pv.sort_order, pv.created_at LIMIT 1) v ON TRUE
 WHERE s.id = '0a3b3258-42b6-4ab4-a70d-b88339123e5f'
   AND oi.product_id = '685b8ce1-b0b6-416d-aeaf-eb4c42cf2dba';

UPDATE reviews rv
   SET product_id = s.id, outlet_id = s.outlet_id
  FROM products s
 WHERE s.id = '0a3b3258-42b6-4ab4-a70d-b88339123e5f'
   AND rv.product_id = '685b8ce1-b0b6-416d-aeaf-eb4c42cf2dba';

DELETE FROM customer_wishlists WHERE product_id = '685b8ce1-b0b6-416d-aeaf-eb4c42cf2dba';

UPDATE cart_items ci
   SET variant_id = v.id, outlet_id = s.outlet_id
  FROM products s
  JOIN LATERAL (SELECT pv.id FROM product_variants pv WHERE pv.product_id = s.id
                 ORDER BY pv.is_default DESC, pv.sort_order, pv.created_at LIMIT 1) v ON TRUE
 WHERE s.id = '0a3b3258-42b6-4ab4-a70d-b88339123e5f'
   AND ci.variant_id IN (SELECT id FROM product_variants WHERE product_id = '685b8ce1-b0b6-416d-aeaf-eb4c42cf2dba');

UPDATE checkout_reservations cr
   SET variant_id = v.id, outlet_id = s.outlet_id
  FROM products s
  JOIN LATERAL (SELECT pv.id FROM product_variants pv WHERE pv.product_id = s.id
                 ORDER BY pv.is_default DESC, pv.sort_order, pv.created_at LIMIT 1) v ON TRUE
 WHERE s.id = '0a3b3258-42b6-4ab4-a70d-b88339123e5f'
   AND cr.variant_id IN (SELECT id FROM product_variants WHERE product_id = '685b8ce1-b0b6-416d-aeaf-eb4c42cf2dba');

DO $$
DECLARE leftover INT;
BEGIN
  SELECT (SELECT COUNT(*) FROM order_items   WHERE product_id = '685b8ce1-b0b6-416d-aeaf-eb4c42cf2dba')
       + (SELECT COUNT(*) FROM reviews       WHERE product_id = '685b8ce1-b0b6-416d-aeaf-eb4c42cf2dba')
       + (SELECT COUNT(*) FROM booking_slots WHERE product_id = '685b8ce1-b0b6-416d-aeaf-eb4c42cf2dba')
       + (SELECT COUNT(*) FROM cart_items ci JOIN product_variants pv ON pv.id = ci.variant_id
           WHERE pv.product_id = '685b8ce1-b0b6-416d-aeaf-eb4c42cf2dba')
       + (SELECT COUNT(*) FROM checkout_reservations cr JOIN product_variants pv ON pv.id = cr.variant_id
           WHERE pv.product_id = '685b8ce1-b0b6-416d-aeaf-eb4c42cf2dba')
    INTO leftover;
  IF leftover > 0 THEN RAISE EXCEPTION 'refusing to delete: % dependent row(s) remain', leftover; END IF;
END $$;

DELETE FROM products WHERE id = '685b8ce1-b0b6-416d-aeaf-eb4c42cf2dba';

UPDATE outlets o SET status = 'inactive'
 WHERE o.status = 'active'
   AND NOT EXISTS (SELECT 1 FROM products p WHERE p.outlet_id = o.id)
   AND NOT EXISTS (SELECT 1 FROM outlet_offers oo WHERE oo.outlet_id = o.id AND oo.status = 'active');

DO $$
DECLARE dupes INT;
BEGIN
  SELECT COUNT(*) INTO dupes FROM (
    SELECT p.name
      FROM products p
      JOIN categories c ON c.id = p.category_id
      JOIN outlets    o ON o.id = p.outlet_id
     WHERE c.slug = 'activity' AND p.status = 'active' AND p.review_status = 'approved'
     GROUP BY p.name HAVING COUNT(DISTINCT o.city) > 1
  ) d;
  IF dupes > 0 THEN RAISE EXCEPTION '% activity name(s) still span cities', dupes; END IF;
END $$;;
