-- Demo pop-up events covering every event variation.
-- Copy and photos: docs/plans/2026-11-15-1254-demo-event-content-refresh.md
-- (photos uploaded by scripts/upload-demo-event-photos.mjs; scripts/refresh-demo-event-content.sql
-- applies the same values to an already-seeded database).
-- Remove with scripts/remove-demo-popup-events.sql.
--
-- Event guards only let a passkey-verified admin approve stalls and never allow
-- stalls at an already-ended location, so this seed skips triggers for its own
-- transaction (session_replication_role = replica). That also skips FK checks,
-- so every reference below is looked up and the script aborts if one is missing.

BEGIN;
SET LOCAL session_replication_role = replica;

DO $$
DECLARE
  admin_id CONSTANT uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  fiesta uuid; market uuid;
  locs jsonb := '{}';
  stall record; item record;
  v_loc uuid; v_vendor uuid; v_owner uuid; v_poster text; v_reg uuid; v_product uuid; v_price numeric; v_image text;
  fallback_poster text;
  -- Catalogue covers are bucket-relative (see lib/storage/product-image.ts); stall posters are used as-is, so store full URLs.
  storage_base CONSTANT text := 'https://ncdlaehknicabzjqskvk.supabase.co/storage/v1/object/public/product-images/';
  events_base CONSTANT text := 'https://ncdlaehknicabzjqskvk.supabase.co/storage/v1/object/public/event-posters/demo-events/';
  v_cover text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = admin_id) THEN RAISE EXCEPTION 'demo admin missing'; END IF;
  IF EXISTS (SELECT 1 FROM public.promotion_campaigns WHERE slug IN ('demo-popup-fiesta', 'demo-coming-soon-market')) THEN
    RAISE EXCEPTION 'demo pop-up events already exist; run scripts/remove-demo-popup-events.sql first';
  END IF;
  SELECT poster_url INTO fallback_poster FROM public.promotion_campaigns WHERE slug = 'heritage-walk-kl-current-offers';

  INSERT INTO public.promotion_campaigns (slug, title, summary, description, starts_at, ends_at, status, created_by, updated_by, approved_by, approved_at, poster_url, operating_hours)
  VALUES ('demo-popup-fiesta', 'Pop-up Fiesta',
    'A travelling market of Malaysian bakers, tea growers and craft makers — five stops from KL to Johor Bahru.',
    'Pop-up Fiesta starts with a night market in Bangsar, settles in at Central Market Annexe for the season, then heads north for a weekend on the Penang Esplanade, stops in Ipoh Old Town and ends in Johor Bahru. Each stop has its own line-up.',
    '2026-10-03 16:00+08', '2026-12-31 22:00+08', 'approved', admin_id, admin_id, admin_id, now(), events_base || 'event-01-popup-fiesta-poster.jpg', 'Varies by location — see each location''s hours')
  RETURNING id INTO fiesta;

  INSERT INTO public.promotion_campaigns (slug, title, summary, description, starts_at, ends_at, status, created_by, updated_by, approved_by, approved_at, poster_url, operating_hours)
  VALUES ('demo-coming-soon-market', 'Jonker Walk Craft Market',
    'Three days of batik, heritage desserts and hands-on workshops on Melaka''s Jonker Walk.',
    'Try batik painting with Desa Murni artisans, cool down with Jonker 88''s cendol, and browse Melaka makers along the heritage street.',
    '2026-11-20 10:00+08', '2026-11-22 22:00+08', 'approved', admin_id, admin_id, admin_id, now(), events_base || 'event-02-coming-soon-craft-market-poster.jpg', 'Daily, 10:00 AM – 10:00 PM')
  RETURNING id INTO market;

    INSERT INTO public.promotion_campaign_locations (campaign_id, name, address, lat, lng, starts_on, ends_on, opens_at, closes_at, max_stalls)
    VALUES (fiesta, 'Bangsar Night Market', 'Jalan Telawi 3, Bangsar Baru, 59100 Kuala Lumpur', 3.1302, 101.6712, '2026-10-03', '2026-10-08', '16:00', '23:00', 10)
    RETURNING id INTO v_loc;
  locs := locs || jsonb_build_object('A', v_loc);
    INSERT INTO public.promotion_campaign_locations (campaign_id, name, address, lat, lng, starts_on, ends_on, opens_at, closes_at, max_stalls)
    VALUES (fiesta, 'Central Market Annexe, KL', 'Jalan Hang Kasturi, 50050 Kuala Lumpur', 3.1456, 101.6954, '2026-10-10', '2026-12-31', '10:00', '22:00', 20)
    RETURNING id INTO v_loc;
  locs := locs || jsonb_build_object('B', v_loc);
    INSERT INTO public.promotion_campaign_locations (campaign_id, name, address, lat, lng, starts_on, ends_on, opens_at, closes_at, max_stalls,
      applications_open, applications_close_at, approvals_close_at, setup_starts_at)
    VALUES (fiesta, 'Penang Esplanade', 'Jalan Tun Syed Sheh Barakbah, 10200 George Town, Penang', 5.4204, 100.3441, '2026-11-14', '2026-11-16', '10:00', '22:00', 15,
      true, '2026-11-05 23:59+08', '2026-11-10 23:59+08', '2026-11-13 08:00+08')
    RETURNING id INTO v_loc;
  locs := locs || jsonb_build_object('C', v_loc);
    INSERT INTO public.promotion_campaign_locations (campaign_id, name, address, lat, lng, starts_on, ends_on, opens_at, closes_at, max_stalls)
    VALUES (fiesta, 'Ipoh Old Town', 'Jalan Panglima, 30000 Ipoh, Perak', 4.5975, 101.0790, '2026-11-28', '2026-11-30', '10:00', '22:00', 12)
    RETURNING id INTO v_loc;
  locs := locs || jsonb_build_object('E', v_loc);
    INSERT INTO public.promotion_campaign_locations (campaign_id, name, address, lat, lng, starts_on, ends_on, opens_at, closes_at, max_stalls)
    VALUES (fiesta, 'Johor Bahru Tebrau', 'Jalan Harmonium, Taman Desa Tebrau, 81100 Johor Bahru', 1.5480, 103.7956, '2026-12-12', '2026-12-14', '10:00', '22:00', 12)
    RETURNING id INTO v_loc;
  locs := locs || jsonb_build_object('F', v_loc);
    INSERT INTO public.promotion_campaign_locations (campaign_id, name, address, lat, lng, starts_on, ends_on, opens_at, closes_at, max_stalls)
    VALUES (market, 'Jonker Walk, Melaka', 'Jalan Hang Jebat, 75200 Melaka', 2.1951, 102.2475, '2026-11-20', '2026-11-22', '10:00', '22:00', 10)
    RETURNING id INTO v_loc;
  locs := locs || jsonb_build_object('D', v_loc);

  FOR stall IN SELECT * FROM (VALUES
    -- owner email, location, status, stall number, description, review note, stall photo (NULL = first catalogue cover)
    ('owner.hiap-joo-bakery@demo.local',            'A', 'approved',          'A01', 'Hiap Joo''s charcoal-baked banana cake, fresh from Johor Bahru, at the Bangsar night market.', NULL, 'event-04-hiap-joo-stall.jpg'),
    ('owner.hiap-joo-bakery@demo.local',            'B', 'approved',          'B01', 'Hiap Joo''s charcoal-baked banana cake and marble cake, baked fresh for the Central Market stop.', NULL, 'event-04-hiap-joo-stall.jpg'),
    ('owner.hiap-joo-bakery@demo.local',            'C', 'approved',          'C01', 'Hiap Joo''s famous banana cake comes to Penang for the Esplanade weekend.', NULL, 'event-04-hiap-joo-stall.jpg'),
    ('owner.cameron-valley-tea-shop@demo.local',    'B', 'approved',          'B02', 'Highland teas and strawberry preserves from Cameron Valley.', NULL, 'event-05-cameron-valley-tea-stall.jpg'),
    ('owner.desa-murni-batik@demo.local',           'B', 'approved',          'B03', 'Hands-on batik sessions with Desa Murni artisans.', NULL, 'event-06-desa-murni-batik-stall.jpg'),
    ('owner.tanoti-weavers-workshop@demo.local',    'B', 'approved',          'B04', 'Songket samplers to take home, plus a short try-out at the loom.', NULL, 'event-07-tanoti-weavers-stall.jpg'),
    ('owner.restoran-nasi-kandar-yasmeen@demo.local','B', 'rejected',         NULL,  'Nasi kandar rice plates with Yasmeen''s signature curries.', 'Hot food stalls at this location are full; please apply for the Penang stop instead.', NULL),
    ('vendor.owner@demo.local',                     'B', 'removed',           'B05', 'Penang Road famous Teochew chendul served over shaved ice.', 'Stall removed after repeated late openings (demo data).', NULL),
    ('owner.jonker-88-heritage@demo.local',         'C', 'pending',           NULL,  'Jonker 88''s baba laksa and cendol, travelling from Melaka for the weekend.', NULL, NULL),
    ('owner.gerakbudaya-bookshop-penang@demo.local','C', 'changes_requested', NULL,  'Local authors and Penang history titles from Gerakbudaya.', 'Please upload a clearer stall poster and add prices for each book bundle.', NULL),
    ('owner.tropical-spice-garden@demo.local',      'C', 'withdrawn',         NULL,  'Spice blends and herb seedlings from Tropical Spice Garden.', 'Vendor withdrew: staff unavailable that weekend (demo data).', NULL),
    ('owner.cameron-valley-tea-shop@demo.local',    'E', 'approved',          'E01', 'Cameron Valley highland teas and strawberry preserves, down the hill for the Ipoh weekend.', NULL, 'event-05-cameron-valley-tea-stall.jpg'),
    ('owner.desa-murni-batik@demo.local',           'E', 'approved',          'E02', 'Batik painting and stamping sessions with Desa Murni artisans in Ipoh Old Town.', NULL, 'event-06-desa-murni-batik-stall.jpg'),
    ('owner.hiap-joo-bakery@demo.local',            'F', 'approved',          'F01', 'Hiap Joo''s charcoal-baked banana cake, back home in Johor Bahru for the final stop.', NULL, 'event-04-hiap-joo-stall.jpg'),
    ('owner.jonker-88-heritage@demo.local',         'D', 'approved',          'D01', 'Jonker 88 heritage desserts at their home street market.', NULL, 'event-08-jonker-88-stall.jpg'),
    ('owner.desa-murni-batik@demo.local',           'D', 'approved',          'D02', 'Batik painting sessions at the Jonker Walk craft market.', NULL, 'event-06-desa-murni-batik-stall.jpg')
  ) AS s(email, loc, status, stall_no, description, note, poster)
  LOOP
    SELECT ve.id, u.id INTO v_vendor, v_owner
      FROM public.users u
      JOIN public.user_roles ur ON ur.user_id = u.id
      JOIN public.roles ro ON ro.id = ur.role_id AND ro.name = 'vendor_owner'
      JOIN public.vendors ve ON ve.id = ur.vendor_id
     WHERE u.email = stall.email
     LIMIT 1;
    IF v_vendor IS NULL THEN RAISE EXCEPTION 'demo vendor owner % not found', stall.email; END IF;
    SELECT regexp_replace(p.cover_url, '^/assets/customer/products/', '') INTO v_cover
      FROM public.products p JOIN public.outlets o ON o.id = p.outlet_id
     WHERE o.vendor_id = v_vendor AND p.cover_url IS NOT NULL ORDER BY p.created_at LIMIT 1;
    v_poster := CASE WHEN stall.poster IS NOT NULL THEN events_base || stall.poster
                     WHEN v_cover IS NULL THEN fallback_poster
                     WHEN v_cover ~ '^https?://' THEN v_cover
                     WHEN v_cover LIKE '%/%' THEN storage_base || ltrim(v_cover, '/')
                     ELSE storage_base || 'products/' || v_cover END;

    INSERT INTO public.promotion_campaign_vendors (campaign_id, event_location_id, vendor_id, submitted_by, stall_number, stall_description, stall_poster_url, status,
      reviewer_id, reviewed_at, rejection_reason, changes_requested_at, changes_requested_reason, closed_at, closed_reason)
    VALUES (CASE WHEN stall.loc = 'D' THEN market ELSE fiesta END, (locs ->> stall.loc)::uuid, v_vendor, v_owner, stall.stall_no, stall.description, v_poster, stall.status,
      CASE WHEN stall.status IN ('approved', 'rejected', 'changes_requested', 'removed') THEN admin_id END,
      CASE WHEN stall.status IN ('approved', 'rejected', 'changes_requested', 'removed') THEN now() END,
      CASE WHEN stall.status = 'rejected' THEN stall.note END,
      CASE WHEN stall.status = 'changes_requested' THEN now() END,
      CASE WHEN stall.status = 'changes_requested' THEN stall.note END,
      CASE WHEN stall.status IN ('withdrawn', 'removed') THEN now() END,
      CASE WHEN stall.status IN ('withdrawn', 'removed') THEN stall.note END)
    RETURNING id INTO v_reg;

    FOR item IN SELECT * FROM (VALUES
      -- owner email, location ('*' = every location of that vendor), position, kind, catalogue product, event-only name, price, daily qty, event-only photo
      ('owner.hiap-joo-bakery@demo.local',            '*', 0, 'product', 'Original Banana Cake',            NULL, NULL::numeric, 30, NULL::text),
      ('owner.hiap-joo-bakery@demo.local',            '*', 1, 'product', 'Chocolate Marble Cake',           NULL, NULL, 20, NULL),
      ('owner.cameron-valley-tea-shop@demo.local',    '*', 0, 'product', 'Cameron Highlands Tea Gift Set',  NULL, NULL, 15, NULL),
      ('owner.cameron-valley-tea-shop@demo.local',    '*', 1, 'product', 'Strawberry Preserve Jar',         NULL, NULL, 25, NULL),
      ('owner.desa-murni-batik@demo.local',           '*', 0, 'service', NULL, 'Batik painting workshop (1 hour)', 45.00, 8, 'event-10-batik-painting-workshop.jpg'),
      ('owner.desa-murni-batik@demo.local',           '*', 1, 'service', NULL, 'Batik stamping demo for kids (20 min)', 15.00, 20, 'event-11-batik-stamping-demo.jpg'),
      ('owner.tanoti-weavers-workshop@demo.local',    '*', 0, 'product', 'Songket Weave Sampler',           NULL, NULL, 10, NULL),
      ('owner.tanoti-weavers-workshop@demo.local',    '*', 1, 'service', NULL, 'Songket weaving try-out at the loom (20 min)', 25.00, 12, 'event-12-songket-weaving-tryout.jpg'),
      ('owner.restoran-nasi-kandar-yasmeen@demo.local','*', 0, 'product', NULL, 'Nasi kandar ayam goreng set', 14.50, 40, NULL),
      ('vendor.owner@demo.local',                     '*', 0, 'product', NULL, 'Teochew chendul (large)', 6.50, 60, NULL),
      ('owner.jonker-88-heritage@demo.local',         'C', 0, 'product', NULL, 'Nyonya Laksa', 12.90, 30, NULL),
      ('owner.jonker-88-heritage@demo.local',         'D', 0, 'product', NULL, 'Nyonya Laksa', 12.90, 30, 'event-13-baba-nyonya-laksa.jpg'),
      ('owner.gerakbudaya-bookshop-penang@demo.local','*', 0, 'product', NULL, 'Penang history book bundle', 55.00, 10, NULL),
      ('owner.tropical-spice-garden@demo.local',      '*', 0, 'product', NULL, 'Curry spice blend trio', 28.00, 20, NULL)
    ) AS i(email, loc, pos, kind, catalogue_name, new_name, price, qty, image)
    WHERE i.email = stall.email AND (i.loc = '*' OR i.loc = stall.loc)
    LOOP
      v_product := NULL; v_price := item.price; v_image := events_base || item.image;
      IF item.catalogue_name IS NOT NULL THEN
        SELECT p.id, p.base_price INTO v_product, v_price
          FROM public.products p JOIN public.outlets o ON o.id = p.outlet_id
         WHERE o.vendor_id = v_vendor AND p.name = item.catalogue_name LIMIT 1;
        IF v_product IS NULL THEN RAISE EXCEPTION 'catalogue product % for % not found', item.catalogue_name, stall.email; END IF;
      END IF;
      INSERT INTO public.promotion_campaign_vendor_products (registration_id, product_id, name, price, image_url, position, item_kind, daily_quantity)
      VALUES (v_reg, v_product, CASE WHEN v_product IS NULL THEN item.new_name END, coalesce(v_price, 0), v_image, item.pos, item.kind, item.qty);
    END LOOP;

    IF stall.status = 'approved' AND stall.loc <> 'A' THEN
      INSERT INTO public.promotion_campaign_pickup_slots (registration_id, slot_date, starts_at, ends_at, capacity)
      VALUES (v_reg, NULL, '11:00', '13:00', 20), (v_reg, NULL, '17:00', '19:00', 20);
    END IF;
  END LOOP;
END $$;

-- Integrity check (FK checks were skipped above): every demo row must point at real rows.
DO $$
DECLARE broken integer;
BEGIN
  SELECT count(*) INTO broken FROM public.promotion_campaign_vendors r
    JOIN public.promotion_campaigns c ON c.id = r.campaign_id AND c.slug LIKE 'demo-%'
   WHERE NOT EXISTS (SELECT 1 FROM public.promotion_campaign_locations l WHERE l.id = r.event_location_id AND l.campaign_id = r.campaign_id)
      OR NOT EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = r.vendor_id)
      OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = r.submitted_by);
  IF broken > 0 THEN RAISE EXCEPTION 'demo seed integrity check failed: % broken stall rows', broken; END IF;
END $$;

SELECT c.slug, l.name AS location, ve.name AS vendor, r.status, r.stall_number,
       (SELECT string_agg(p.item_kind, ',' ORDER BY p.position) FROM public.promotion_campaign_vendor_products p WHERE p.registration_id = r.id) AS items,
       (SELECT count(*) FROM public.promotion_campaign_pickup_slots s WHERE s.registration_id = r.id) AS slots
  FROM public.promotion_campaign_vendors r
  JOIN public.promotion_campaigns c ON c.id = r.campaign_id AND c.slug LIKE 'demo-%'
  JOIN public.promotion_campaign_locations l ON l.id = r.event_location_id
  JOIN public.vendors ve ON ve.id = r.vendor_id
 ORDER BY c.slug, l.starts_on, r.stall_number NULLS LAST, ve.name;

COMMIT;
