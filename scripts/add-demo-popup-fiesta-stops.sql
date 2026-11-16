-- One-off: add the Ipoh and Johor Bahru stops (and their stalls) to an already-seeded
-- Pop-up Fiesta, so it has five stops like a fresh scripts/seed-demo-popup-events.sql run.
-- Plan: docs/plans/2026-11-17-0048-customer-consistency-and-events-list.md (Phase 2).
-- Remove with scripts/remove-demo-popup-events.sql (it deletes by campaign cascade).
--
-- Same as the seed: event guards only let a passkey-verified admin approve stalls, so this
-- skips triggers (and FK checks) for its own transaction and looks every reference up first.

BEGIN;
SET LOCAL session_replication_role = replica;

DO $$
DECLARE
  admin_id CONSTANT uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  events_base CONSTANT text := 'https://ncdlaehknicabzjqskvk.supabase.co/storage/v1/object/public/event-posters/demo-events/';
  fiesta uuid;
  locs jsonb := '{}';
  stall record; item record;
  v_loc uuid; v_vendor uuid; v_owner uuid; v_reg uuid; v_product uuid; v_price numeric;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = admin_id) THEN RAISE EXCEPTION 'demo admin missing'; END IF;
  SELECT id INTO fiesta FROM public.promotion_campaigns WHERE slug = 'demo-popup-fiesta';
  IF fiesta IS NULL THEN RAISE EXCEPTION 'demo-popup-fiesta not found; run scripts/seed-demo-popup-events.sql instead'; END IF;
  IF EXISTS (SELECT 1 FROM public.promotion_campaign_locations WHERE campaign_id = fiesta AND name = 'Ipoh Old Town') THEN
    RAISE EXCEPTION 'Pop-up Fiesta already has the Ipoh stop';
  END IF;

  UPDATE public.promotion_campaigns SET
    summary = 'A travelling market of Malaysian bakers, tea growers and craft makers — five stops from KL to Johor Bahru.',
    description = 'Pop-up Fiesta starts with a night market in Bangsar, settles in at Central Market Annexe for the season, then heads north for a weekend on the Penang Esplanade, stops in Ipoh Old Town and ends in Johor Bahru. Each stop has its own line-up.'
  WHERE id = fiesta;

    INSERT INTO public.promotion_campaign_locations (campaign_id, name, address, lat, lng, starts_on, ends_on, opens_at, closes_at, max_stalls)
    VALUES (fiesta, 'Ipoh Old Town', 'Jalan Panglima, 30000 Ipoh, Perak', 4.5975, 101.0790, '2026-11-28', '2026-11-30', '10:00', '22:00', 12)
    RETURNING id INTO v_loc;
  locs := locs || jsonb_build_object('E', v_loc);
    INSERT INTO public.promotion_campaign_locations (campaign_id, name, address, lat, lng, starts_on, ends_on, opens_at, closes_at, max_stalls)
    VALUES (fiesta, 'Johor Bahru Tebrau', 'Jalan Harmonium, Taman Desa Tebrau, 81100 Johor Bahru', 1.5480, 103.7956, '2026-12-12', '2026-12-14', '10:00', '22:00', 12)
    RETURNING id INTO v_loc;
  locs := locs || jsonb_build_object('F', v_loc);

  FOR stall IN SELECT * FROM (VALUES
    -- owner email, location, stall number, description, stall photo (same rows as the seed)
    ('owner.cameron-valley-tea-shop@demo.local', 'E', 'E01', 'Cameron Valley highland teas and strawberry preserves, down the hill for the Ipoh weekend.', 'event-05-cameron-valley-tea-stall.jpg'),
    ('owner.desa-murni-batik@demo.local',        'E', 'E02', 'Batik painting and stamping sessions with Desa Murni artisans in Ipoh Old Town.', 'event-06-desa-murni-batik-stall.jpg'),
    ('owner.hiap-joo-bakery@demo.local',         'F', 'F01', 'Hiap Joo''s charcoal-baked banana cake, back home in Johor Bahru for the final stop.', 'event-04-hiap-joo-stall.jpg')
  ) AS s(email, loc, stall_no, description, poster)
  LOOP
    SELECT ve.id, u.id INTO v_vendor, v_owner
      FROM public.users u
      JOIN public.user_roles ur ON ur.user_id = u.id
      JOIN public.roles ro ON ro.id = ur.role_id AND ro.name = 'vendor_owner'
      JOIN public.vendors ve ON ve.id = ur.vendor_id
     WHERE u.email = stall.email
     LIMIT 1;
    IF v_vendor IS NULL THEN RAISE EXCEPTION 'demo vendor owner % not found', stall.email; END IF;

    INSERT INTO public.promotion_campaign_vendors (campaign_id, event_location_id, vendor_id, submitted_by, stall_number, stall_description, stall_poster_url, status, reviewer_id, reviewed_at)
    VALUES (fiesta, (locs ->> stall.loc)::uuid, v_vendor, v_owner, stall.stall_no, stall.description, events_base || stall.poster, 'approved', admin_id, now())
    RETURNING id INTO v_reg;

    FOR item IN SELECT * FROM (VALUES
      -- owner email, position, kind, catalogue product, event-only name, price, daily qty, event-only photo (the seed's '*' rows)
      ('owner.hiap-joo-bakery@demo.local',         0, 'product', 'Original Banana Cake',           NULL, NULL::numeric, 30, NULL::text),
      ('owner.hiap-joo-bakery@demo.local',         1, 'product', 'Chocolate Marble Cake',          NULL, NULL, 20, NULL),
      ('owner.cameron-valley-tea-shop@demo.local', 0, 'product', 'Cameron Highlands Tea Gift Set', NULL, NULL, 15, NULL),
      ('owner.cameron-valley-tea-shop@demo.local', 1, 'product', 'Strawberry Preserve Jar',        NULL, NULL, 25, NULL),
      ('owner.desa-murni-batik@demo.local',        0, 'service', NULL, 'Batik painting workshop (1 hour)', 45.00, 8, 'event-10-batik-painting-workshop.jpg'),
      ('owner.desa-murni-batik@demo.local',        1, 'service', NULL, 'Batik stamping demo for kids (20 min)', 15.00, 20, 'event-11-batik-stamping-demo.jpg')
    ) AS i(email, pos, kind, catalogue_name, new_name, price, qty, image)
    WHERE i.email = stall.email
    LOOP
      v_product := NULL; v_price := item.price;
      IF item.catalogue_name IS NOT NULL THEN
        SELECT p.id, p.base_price INTO v_product, v_price
          FROM public.products p JOIN public.outlets o ON o.id = p.outlet_id
         WHERE o.vendor_id = v_vendor AND p.name = item.catalogue_name LIMIT 1;
        IF v_product IS NULL THEN RAISE EXCEPTION 'catalogue product % for % not found', item.catalogue_name, stall.email; END IF;
      END IF;
      INSERT INTO public.promotion_campaign_vendor_products (registration_id, product_id, name, price, image_url, position, item_kind, daily_quantity)
      VALUES (v_reg, v_product, CASE WHEN v_product IS NULL THEN item.new_name END, coalesce(v_price, 0), events_base || item.image, item.pos, item.kind, item.qty);
    END LOOP;

    INSERT INTO public.promotion_campaign_pickup_slots (registration_id, slot_date, starts_at, ends_at, capacity)
    VALUES (v_reg, NULL, '11:00', '13:00', 20), (v_reg, NULL, '17:00', '19:00', 20);
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

COMMIT;
