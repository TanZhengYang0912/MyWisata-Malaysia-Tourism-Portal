UPDATE outlets o
   SET status = 'active'
 WHERE o.status = 'inactive'
   AND EXISTS (SELECT 1 FROM outlet_offers oo WHERE oo.outlet_id = o.id AND oo.status = 'active');

DO $$
DECLARE stranded INT;
BEGIN
  SELECT COUNT(*) INTO stranded
    FROM outlet_offers oo
    JOIN outlets  o ON o.id = oo.outlet_id
    JOIN products p ON p.id = oo.product_id
   WHERE oo.status = 'active' AND p.status = 'active' AND o.status <> 'active';
  IF stranded > 0 THEN
    RAISE EXCEPTION '% active offer(s) still sit on an inactive outlet', stranded;
  END IF;

  SELECT COUNT(*) INTO stranded
    FROM products p
    JOIN outlets o ON o.id = p.outlet_id
   WHERE p.status = 'active' AND p.review_status = 'approved' AND o.status <> 'active';
  IF stranded > 0 THEN
    RAISE EXCEPTION '% live product(s) sit on an inactive outlet', stranded;
  END IF;
END $$;;
