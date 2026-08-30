-- Canonical customer discovery taxonomy.
-- Hidden Gem remains products.is_hidden_gem and is intentionally not a category.

DO $$
DECLARE
  activity_id UUID;
  retail_id UUID;
  food_id UUID;
  accommodation_id UUID;
BEGIN
  -- Reuse the legacy rows where possible so existing foreign keys remain
  -- stable. Otherwise create the canonical row with a deterministic seed id.
  SELECT id INTO activity_id FROM categories WHERE slug = 'activity' LIMIT 1;
  IF activity_id IS NULL THEN
    SELECT id INTO activity_id FROM categories WHERE slug = 'nature' LIMIT 1;
    IF activity_id IS NOT NULL THEN
      UPDATE categories
      SET name = 'Activity', slug = 'activity', icon = 'compass', sort_order = 2, is_active = TRUE
      WHERE id = activity_id;
    ELSE
      INSERT INTO categories (id, name, slug, icon, sort_order, is_active)
      VALUES ('11111111-0000-0000-0000-000000000009', 'Activity', 'activity', 'compass', 2, TRUE)
      RETURNING id INTO activity_id;
    END IF;
  ELSE
    UPDATE categories
    SET name = 'Activity', icon = 'compass', sort_order = 2, is_active = TRUE
    WHERE id = activity_id;
  END IF;

  SELECT id INTO retail_id FROM categories WHERE slug = 'retail' LIMIT 1;
  IF retail_id IS NULL THEN
    SELECT id INTO retail_id FROM categories WHERE slug = 'shopping' LIMIT 1;
    IF retail_id IS NOT NULL THEN
      UPDATE categories
      SET name = 'Retail', slug = 'retail', icon = 'shopping-bag', sort_order = 4, is_active = TRUE
      WHERE id = retail_id;
    ELSE
      INSERT INTO categories (id, name, slug, icon, sort_order, is_active)
      VALUES ('11111111-0000-0000-0000-000000000010', 'Retail', 'retail', 'shopping-bag', 4, TRUE)
      RETURNING id INTO retail_id;
    END IF;
  ELSE
    UPDATE categories
    SET name = 'Retail', icon = 'shopping-bag', sort_order = 4, is_active = TRUE
    WHERE id = retail_id;
  END IF;

  SELECT id INTO food_id FROM categories WHERE slug = 'food' LIMIT 1;
  IF food_id IS NULL THEN
    INSERT INTO categories (id, name, slug, icon, sort_order, is_active)
    VALUES ('11111111-0000-0000-0000-000000000001', 'Food', 'food', 'utensils', 1, TRUE)
    RETURNING id INTO food_id;
  ELSE
    UPDATE categories
    SET name = 'Food', icon = 'utensils', sort_order = 1, is_active = TRUE
    WHERE id = food_id;
  END IF;

  SELECT id INTO accommodation_id FROM categories WHERE slug = 'accommodation' LIMIT 1;
  IF accommodation_id IS NULL THEN
    INSERT INTO categories (id, name, slug, icon, sort_order, is_active)
    VALUES ('11111111-0000-0000-0000-000000000008', 'Accommodation', 'accommodation', 'bed-double', 3, TRUE)
    RETURNING id INTO accommodation_id;
  ELSE
    UPDATE categories
    SET name = 'Accommodation', icon = 'bed-double', sort_order = 3, is_active = TRUE
    WHERE id = accommodation_id;
  END IF;

  -- Legacy categories that are not independently supported by the product
  -- detail model are now Activity. Do this before deactivating their rows.
  UPDATE products
  SET category_id = activity_id
  WHERE category_id IN (
    SELECT id FROM categories
    WHERE slug IN ('nature', 'cultural', 'adventure', 'nightlife', 'wellness', 'family')
  );

  UPDATE products
  SET category_id = retail_id
  WHERE category_id IN (
    SELECT id FROM categories WHERE slug = 'shopping'
  );

  UPDATE vendor_recommendations
  SET category_id = activity_id
  WHERE category_id IN (
    SELECT id FROM categories
    WHERE slug IN ('nature', 'cultural', 'adventure', 'nightlife', 'wellness', 'family')
  );

  UPDATE vendor_recommendations
  SET category_id = retail_id
  WHERE category_id IN (
    SELECT id FROM categories WHERE slug = 'shopping'
  );

  UPDATE categories
  SET is_active = FALSE
  WHERE slug IN ('nature', 'cultural', 'adventure', 'nightlife', 'wellness', 'family', 'shopping');

  UPDATE categories
  SET is_active = TRUE
  WHERE slug IN ('food', 'activity', 'accommodation', 'retail');
END $$;
