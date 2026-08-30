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
END $$;;
