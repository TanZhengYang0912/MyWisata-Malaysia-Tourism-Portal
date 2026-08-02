-- ============================================================
-- 20260801030000_reactivate_offer_only_outlets.sql
--
-- Fixes a bug in 20260801010000_place_bound_activities_cut_to_15.sql.
--
-- That migration deactivated every outlet with no products:
--
--   UPDATE outlets SET status = 'inactive'
--    WHERE status = 'active'
--      AND NOT EXISTS (SELECT 1 FROM products p WHERE p.outlet_id = o.id);
--
-- "No products" was the wrong test. A SHARED product carries
-- products.outlet_id = NULL and reaches its outlets through outlet_offers —
-- that is how every food product in the catalogue is modelled. All 17 outlets
-- of Rasa Malaysia Kitchen, Laksa Warisan Penang and Selera Ipoh Heritage
-- therefore looked empty and were switched off, and the Food category dropped
-- to 0 on the discovery page.
--
-- Reactivates any outlet that sells something through an active offer. The
-- Phase 3 migration (20260801020000) already carries the corrected guard, and
-- the version of step 9 in 20260801010000 has been fixed in place so a fresh
-- `db push` never reproduces this.
-- ============================================================

UPDATE outlets o
   SET status = 'active'
 WHERE o.status = 'inactive'
   AND EXISTS (SELECT 1 FROM outlet_offers oo WHERE oo.outlet_id = o.id AND oo.status = 'active');


DO $$
DECLARE stranded INT;
BEGIN
  -- Nothing sellable may be sitting on an inactive outlet.
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
END $$;
