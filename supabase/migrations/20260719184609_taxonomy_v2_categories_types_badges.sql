-- Phase 1 taxonomy foundation: collapse 9 flat categories into 4
-- (food, activity, accommodation, retail), add a multi-valued `type_slugs`
-- second level, and cross-cutting badge flags (family/couple friendly;
-- is_hidden_gem already existed).

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS type_slugs TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_family_friendly BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_couple_friendly BOOLEAN NOT NULL DEFAULT FALSE;

-- New top-level categories: activity (absorbs nature/cultural/adventure/
-- wellness/nightlife/family) and retail (absorbs shopping).
INSERT INTO categories (id, slug, name, icon, sort_order) VALUES
  ('22222222-0000-0000-0000-000000000001'::uuid, 'activity', 'Activity', 'compass', 2),
  ('22222222-0000-0000-0000-000000000002'::uuid, 'retail', 'Retail', 'shopping-bag', 4)
ON CONFLICT (id) DO NOTHING;

-- Keep the existing food/accommodation rows (same id, same slug) but retitle
-- to plain 4-category names and fix sort order.
UPDATE categories SET name = 'Food', icon = 'utensils', sort_order = 1 WHERE id = '11111111-0000-0000-0000-000000000001'::uuid;
UPDATE categories SET name = 'Accommodation', icon = 'hotel', sort_order = 3 WHERE id = '11111111-0000-0000-0000-000000000008'::uuid;

-- Remap every product: new category_id + type_slugs + badges, derived from
-- its current (soon-to-be-retired) category and, for food/retail/family,
-- from its base product name.
UPDATE products p SET
  category_id = CASE c.slug
    WHEN 'food' THEN '11111111-0000-0000-0000-000000000001'::uuid
    WHEN 'accommodation' THEN '11111111-0000-0000-0000-000000000008'::uuid
    WHEN 'shopping' THEN '22222222-0000-0000-0000-000000000002'::uuid
    ELSE '22222222-0000-0000-0000-000000000001'::uuid  -- nature/cultural/adventure/wellness/nightlife/family -> activity
  END,
  type_slugs = CASE
    WHEN c.slug = 'food' THEN
      CASE
        WHEN p.name LIKE 'Chicken Rice Ball Set%' THEN ARRAY['chinese']
        WHEN p.name LIKE 'Nyonya Kuih Tasting Box%' THEN ARRAY['nyonya']
        WHEN p.name LIKE 'Cendol Gula Melaka%' THEN ARRAY['malay']
        WHEN p.name LIKE 'Nasi Lemak Pandan%' THEN ARRAY['malay']
        WHEN p.name LIKE 'Penang Assam Laksa%' THEN ARRAY['malay']
        ELSE ARRAY['malay']
      END
    WHEN c.slug = 'shopping' THEN
      CASE
        WHEN p.name LIKE 'Local Artisan Gift Set%' THEN ARRAY['handicrafts']
        WHEN p.name LIKE 'Malaysia Postcard Collection%' THEN ARRAY['souvenirs']
        WHEN p.name LIKE 'Malaysia Travel Audio Guide%' THEN ARRAY['souvenirs']
        ELSE ARRAY['souvenirs']
      END
    WHEN c.slug = 'family' THEN
      CASE
        WHEN p.name LIKE 'Family Cultural Quest%' THEN ARRAY['cultural']
        WHEN p.name LIKE 'Sunset Waterfront Picnic%' THEN ARRAY['nature']
        ELSE ARRAY['nature']
      END
    WHEN c.slug = 'nature' THEN ARRAY['nature']
    WHEN c.slug = 'cultural' THEN ARRAY['cultural']
    WHEN c.slug = 'adventure' THEN ARRAY['adventure']
    WHEN c.slug = 'wellness' THEN ARRAY['wellness']
    WHEN c.slug = 'nightlife' THEN ARRAY['nightlife']
    WHEN c.slug = 'accommodation' THEN ARRAY['boutique']
    ELSE '{}'
  END,
  is_family_friendly = (c.slug = 'family')
FROM categories c
WHERE p.category_id = c.id;

-- Same remap for vendor_recommendations (small table, same FK).
UPDATE vendor_recommendations vr SET
  category_id = CASE c.slug
    WHEN 'food' THEN '11111111-0000-0000-0000-000000000001'::uuid
    WHEN 'accommodation' THEN '11111111-0000-0000-0000-000000000008'::uuid
    WHEN 'shopping' THEN '22222222-0000-0000-0000-000000000002'::uuid
    ELSE '22222222-0000-0000-0000-000000000001'::uuid
  END
FROM categories c
WHERE vr.category_id = c.id;

-- Retire the 7 now-unused legacy category rows.
DELETE FROM categories WHERE slug IN ('nature', 'cultural', 'adventure', 'wellness', 'shopping', 'family', 'nightlife');;
