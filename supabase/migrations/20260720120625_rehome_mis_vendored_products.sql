-- F12: move the 75 non-food products off the single seed vendor "Rasa Malaysia
-- Kitchen" onto 4 thematically-correct vendors, cloning per-city outlets so map
-- pins don't move, and repointing the denormalized vendor_id/outlet_id on their
-- commerce history (order_items/reviews/booking_slots/vouchers) so nothing still
-- names the wrong vendor.

-- 1. Themed vendors
INSERT INTO vendors (id, owner_id, name, slug, description, business_type, status, approved_by, approved_at) VALUES
  ('33333333-0000-0000-0000-000000000001'::uuid, 'aaaaaaaa-0000-0000-0000-000000000010'::uuid, 'Explore Outdoors Malaysia', 'explore-outdoors-malaysia', 'Nature and adventure experiences across Malaysia.', 'tourism_experience', 'approved', 'aaaaaaaa-0000-0000-0000-000000000001'::uuid, now()),
  ('33333333-0000-0000-0000-000000000002'::uuid, 'aaaaaaaa-0000-0000-0000-000000000009'::uuid, 'Warisan Cultural Journeys', 'warisan-cultural-journeys', 'Heritage walks and cultural workshops across Malaysia.', 'tourism_experience', 'approved', 'aaaaaaaa-0000-0000-0000-000000000001'::uuid, now()),
  ('33333333-0000-0000-0000-000000000003'::uuid, 'aaaaaaaa-0000-0000-0000-000000000009'::uuid, 'Serenity Wellness Retreats', 'serenity-wellness-retreats', 'Spa and wellness escapes across Malaysia.', 'wellness', 'approved', 'aaaaaaaa-0000-0000-0000-000000000001'::uuid, now()),
  ('33333333-0000-0000-0000-000000000004'::uuid, 'aaaaaaaa-0000-0000-0000-000000000010'::uuid, 'Kraftangan Artisan Market', 'kraftangan-artisan-market', 'Local handicrafts and souvenirs across Malaysia.', 'retail', 'approved', 'aaaaaaaa-0000-0000-0000-000000000001'::uuid, now());

-- 2. Mapping: every mis-vendored product -> its new vendor + its current
-- outlet's location (to clone), keyed off type_slugs[1].
CREATE TEMP TABLE product_rehome AS
SELECT p.id AS product_id,
  CASE p.type_slugs[1]
    WHEN 'nature' THEN '33333333-0000-0000-0000-000000000001'::uuid
    WHEN 'adventure' THEN '33333333-0000-0000-0000-000000000001'::uuid
    WHEN 'cultural' THEN '33333333-0000-0000-0000-000000000002'::uuid
    WHEN 'wellness' THEN '33333333-0000-0000-0000-000000000003'::uuid
    WHEN 'handicrafts' THEN '33333333-0000-0000-0000-000000000004'::uuid
    WHEN 'souvenirs' THEN '33333333-0000-0000-0000-000000000004'::uuid
  END AS new_vendor_id,
  o.city, o.state, o.lat, o.lng, o.address, o.country
FROM products p
JOIN outlets o ON o.id = p.outlet_id
JOIN vendors v ON v.id = o.vendor_id
JOIN categories c ON c.id = p.category_id
WHERE v.name = 'Rasa Malaysia Kitchen' AND c.slug <> 'food';

-- 3. One new outlet per (vendor, city) combo — dedupe with DISTINCT ON since a
-- city can have multiple Rasa outlets (e.g. 2 in Kuala Lumpur); pick one
-- deterministically. Cloned coords/address so pins don't move.
CREATE TEMP TABLE new_outlet_specs AS
SELECT DISTINCT ON (new_vendor_id, city) new_vendor_id, city, state, lat, lng, address, country
FROM product_rehome
ORDER BY new_vendor_id, city, product_id;
ALTER TABLE new_outlet_specs ADD COLUMN new_outlet_id uuid DEFAULT gen_random_uuid();
ALTER TABLE new_outlet_specs ADD COLUMN rn serial;

INSERT INTO outlets (id, vendor_id, name, slug, address, city, state, country, lat, lng, phone, operating_hours, status, review_status, display_id)
SELECT nos.new_outlet_id, nos.new_vendor_id, v.name || ' — ' || nos.city,
  lower(regexp_replace(v.slug || '-' || nos.city, '[^a-zA-Z0-9]+', '-', 'g')),
  nos.address, nos.city, nos.state, nos.country, nos.lat, nos.lng,
  '+60 3-5555 0199',
  '{"mon":{"open":"09:00","close":"18:00"},"tue":{"open":"09:00","close":"18:00"},"wed":{"open":"09:00","close":"18:00"},"thu":{"open":"09:00","close":"18:00"},"fri":{"open":"09:00","close":"18:00"},"sat":{"open":"09:00","close":"18:00"},"sun":{"open":"09:00","close":"18:00"}}'::jsonb,
  'active', 'approved',
  'OUT-' || (1140 + nos.rn)
FROM new_outlet_specs nos
JOIN vendors v ON v.id = nos.new_vendor_id;

-- 4. Resolve each product's new outlet
ALTER TABLE product_rehome ADD COLUMN new_outlet_id uuid;
UPDATE product_rehome pr SET new_outlet_id = nos.new_outlet_id
FROM new_outlet_specs nos
WHERE nos.new_vendor_id = pr.new_vendor_id AND nos.city = pr.city;

-- 5. Repoint the 75 products themselves
UPDATE products p SET vendor_id = pr.new_vendor_id, outlet_id = pr.new_outlet_id
FROM product_rehome pr WHERE pr.product_id = p.id;

-- 6. Fix history (denormalized vendor_id/outlet_id snapshots)
UPDATE order_items oi SET vendor_id = pr.new_vendor_id, outlet_id = pr.new_outlet_id
FROM product_rehome pr WHERE pr.product_id = oi.product_id;

UPDATE reviews r SET vendor_id = pr.new_vendor_id, outlet_id = pr.new_outlet_id
FROM product_rehome pr WHERE pr.product_id = r.product_id;

UPDATE booking_slots bs SET outlet_id = pr.new_outlet_id
FROM product_rehome pr WHERE pr.product_id = bs.product_id;

UPDATE vouchers vo SET vendor_id = pr.new_vendor_id, outlet_id = pr.new_outlet_id
FROM product_rehome pr WHERE pr.product_id = vo.product_id;

DROP TABLE product_rehome;
DROP TABLE new_outlet_specs;;
