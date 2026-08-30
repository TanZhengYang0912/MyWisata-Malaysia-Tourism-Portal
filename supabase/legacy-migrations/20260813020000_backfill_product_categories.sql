-- Backfill products.category_id — see
-- docs/plans/2026-08-13-0044-place-page-nearby-refinements.md Task 4.
--
-- 20260812222000_seed_penang.sql omitted category_id from its products INSERT,
-- leaving all 36 rows NULL. Outlet.category (backend/domains/catalogue.ts)
-- reads the outlet's first product's category slug, so every outlet resolved to
-- "" and the customer-facing category filters and badges silently rendered
-- nothing. product_type was seeded correctly and maps 1:1 onto the four
-- canonical categories.
--
-- Guarded by `category_id IS NULL` so this is idempotent and can never clobber
-- a category set deliberately later.

UPDATE products SET category_id = (SELECT id FROM categories WHERE slug = 'food')
  WHERE category_id IS NULL AND product_type = 'food';

UPDATE products SET category_id = (SELECT id FROM categories WHERE slug = 'activity')
  WHERE category_id IS NULL AND product_type IN ('activity', 'experience');

UPDATE products SET category_id = (SELECT id FROM categories WHERE slug = 'retail')
  WHERE category_id IS NULL AND product_type = 'product';

UPDATE products SET category_id = (SELECT id FROM categories WHERE slug = 'accommodation')
  WHERE category_id IS NULL AND product_type = 'service';

DO $$
DECLARE
  v_remaining integer;
BEGIN
  SELECT count(*) INTO v_remaining FROM products WHERE category_id IS NULL;
  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'backfill incomplete: % products still have a NULL category_id', v_remaining;
  END IF;
END $$;
