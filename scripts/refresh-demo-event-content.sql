-- Refreshes the public demo events' copy and images.
-- Plan: docs/plans/2026-11-15-1254-demo-event-content-refresh.md (Phase 2).
-- Run after scripts/upload-demo-event-photos.mjs --apply. Safe to rerun: every
-- UPDATE skips rows that already hold the target value, so a rerun changes 0 rows.
-- Everything runs as one DO statement, so it is atomic on its own and works in the
-- SQL editor, psql or MCP alike (temp tables never have to survive between statements).
-- The closing NOTICE lists each changed row's previous values; keep it as the rollback record.
--
-- Campaign text is updated with triggers on, so the public translation jobs are
-- re-queued. Location, stall and item rows are updated with triggers off
-- (session_replication_role = replica), as scripts/seed-demo-popup-events.sql
-- does: an ended location (Bangsar) rejects any edit, the registration guard
-- needs an authenticated admin, and the change-notice triggers would otherwise
-- notify vendors about a cosmetic rename. Only text and URL columns change.

DO $$
DECLARE
  base CONSTANT text := 'https://ncdlaehknicabzjqskvk.supabase.co/storage/v1/object/public/event-posters/demo-events/';
  jonker CONSTANT uuid := '559e8e4d-a8e7-10f3-09f1-45656fd9f0d5';
  missing text;
BEGIN
DROP TABLE IF EXISTS pg_temp.demo_refresh_log, pg_temp.want_campaign, pg_temp.want_location, pg_temp.want_stall, pg_temp.want_item;
CREATE TEMP TABLE demo_refresh_log (step text NOT NULL, old jsonb NOT NULL) ON COMMIT DROP;

CREATE TEMP TABLE want_campaign (slug text PRIMARY KEY, title text, summary text, description text, poster text) ON COMMIT DROP;
INSERT INTO want_campaign VALUES
  ('demo-popup-fiesta', 'Pop-up Fiesta',
   'A travelling market of Malaysian bakers, tea growers and craft makers — five stops from KL to Johor Bahru.',
   'Pop-up Fiesta starts with a night market in Bangsar, settles in at Central Market Annexe for the season, then heads north for a weekend on the Penang Esplanade, stops in Ipoh Old Town and ends in Johor Bahru. Each stop has its own line-up.',
   'event-01-popup-fiesta-poster.jpg'),
  ('demo-coming-soon-market', 'Jonker Walk Craft Market',
   'Three days of batik, heritage desserts and hands-on workshops on Melaka''s Jonker Walk.',
   'Try batik painting with Desa Murni artisans, cool down with Jonker 88''s cendol, and browse Melaka makers along the heritage street.',
   'event-02-coming-soon-craft-market-poster.jpg'),
  ('heritage-walk-kl-current-offers', 'Heritage Walk KL',
   'Food and craft stalls along Kuala Lumpur''s old-town heritage trail.',
   'Walk KL''s old town and stop for nasi kandar from Hameediyah and vintage finds from Abdul Antiques along the way.',
   'event-03-heritage-walk-kl-poster.jpg');

-- Locations keyed by campaign + starts_on (the names are what changes). Heritage's location is not touched.
CREATE TEMP TABLE want_location (slug text, starts_on date, name text, PRIMARY KEY (slug, starts_on)) ON COMMIT DROP;
INSERT INTO want_location VALUES
  ('demo-popup-fiesta', '2026-10-03', 'Bangsar Night Market'),
  ('demo-popup-fiesta', '2026-10-10', 'Central Market Annexe, KL'),
  ('demo-popup-fiesta', '2026-11-14', 'Penang Esplanade'),
  ('demo-coming-soon-market', '2026-11-20', 'Jonker Walk, Melaka');

-- Approved stalls keyed by campaign + stall number; vendor_id is asserted, not used as a key.
-- NULL description = keep the current one. NULL poster = keep the current one (A31).
CREATE TEMP TABLE want_stall (slug text, stall_number text, vendor_id uuid, poster text, description text, PRIMARY KEY (slug, stall_number)) ON COMMIT DROP;
INSERT INTO want_stall VALUES
  ('demo-popup-fiesta', 'A01', '1661f4ea-c8e3-73e5-583d-a05f7e503ec2', 'event-04-hiap-joo-stall.jpg', NULL),
  ('demo-popup-fiesta', 'B01', '1661f4ea-c8e3-73e5-583d-a05f7e503ec2', 'event-04-hiap-joo-stall.jpg', NULL),
  ('demo-popup-fiesta', 'C01', '1661f4ea-c8e3-73e5-583d-a05f7e503ec2', 'event-04-hiap-joo-stall.jpg', NULL),
  ('demo-popup-fiesta', 'B02', '7a17248b-58e9-2e16-9ad5-3d42176a4263', 'event-05-cameron-valley-tea-stall.jpg', 'Highland teas and strawberry preserves from Cameron Valley.'),
  ('demo-popup-fiesta', 'B03', '18e80c10-d1fa-c384-4886-d0fd02f8959b', 'event-06-desa-murni-batik-stall.jpg', 'Hands-on batik sessions with Desa Murni artisans.'),
  ('demo-coming-soon-market', 'D02', '18e80c10-d1fa-c384-4886-d0fd02f8959b', 'event-06-desa-murni-batik-stall.jpg', NULL),
  ('demo-popup-fiesta', 'B04', 'c5ab04dc-2c02-c07f-d741-b9039e0df199', 'event-07-tanoti-weavers-stall.jpg', 'Songket samplers to take home, plus a short try-out at the loom.'),
  ('demo-coming-soon-market', 'D01', '559e8e4d-a8e7-10f3-09f1-45656fd9f0d5', 'event-08-jonker-88-stall.jpg', NULL),
  ('heritage-walk-kl-current-offers', 'A12', '1aa86fbf-d6af-9dfa-08f0-8ab112bcea3f', 'event-09-hameediyah-stall.jpg', NULL),
  ('heritage-walk-kl-current-offers', 'A31', 'c767a45b-79ad-2079-2ca5-d140af71e239', NULL, 'Vintage brass lamps, gift sets and curios, hand-picked for the Heritage Walk.');

-- Event-only items keyed by stall + position. NULL name = keep the current one.
CREATE TEMP TABLE want_item (slug text, stall_number text, position int, image text, name text, PRIMARY KEY (slug, stall_number, position)) ON COMMIT DROP;
INSERT INTO want_item VALUES
  ('demo-popup-fiesta', 'B03', 0, 'event-10-batik-painting-workshop.jpg', NULL),
  ('demo-popup-fiesta', 'B03', 1, 'event-11-batik-stamping-demo.jpg', NULL),
  ('demo-coming-soon-market', 'D02', 0, 'event-10-batik-painting-workshop.jpg', NULL),
  ('demo-coming-soon-market', 'D02', 1, 'event-11-batik-stamping-demo.jpg', NULL),
  ('demo-popup-fiesta', 'B04', 1, 'event-12-songket-weaving-tryout.jpg', NULL),
  ('demo-coming-soon-market', 'D01', 0, 'event-13-baba-nyonya-laksa.jpg', 'Nyonya Laksa');

  -- Every key must resolve to exactly the expected row before anything is written.
  SELECT string_agg(w.slug, ', ') INTO missing FROM want_campaign w
   WHERE NOT EXISTS (SELECT 1 FROM public.promotion_campaigns c WHERE c.slug = w.slug);
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'campaign missing: %', missing; END IF;

  SELECT string_agg(w.slug || '@' || w.starts_on, ', ') INTO missing FROM want_location w
   WHERE (SELECT count(*) FROM public.promotion_campaign_locations l JOIN public.promotion_campaigns c ON c.id = l.campaign_id
           WHERE c.slug = w.slug AND l.starts_on = w.starts_on) <> 1;
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'location missing or ambiguous: %', missing; END IF;

  SELECT string_agg(w.slug || ' ' || w.stall_number, ', ') INTO missing FROM want_stall w
   WHERE (SELECT count(*) FROM public.promotion_campaign_vendors r JOIN public.promotion_campaigns c ON c.id = r.campaign_id
           WHERE c.slug = w.slug AND r.stall_number = w.stall_number AND r.status = 'approved' AND r.vendor_id = w.vendor_id) <> 1;
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'approved stall missing or wrong vendor: %', missing; END IF;

  SELECT string_agg(w.slug || ' ' || w.stall_number || '#' || w.position, ', ') INTO missing FROM want_item w
   WHERE (SELECT count(*) FROM public.promotion_campaign_vendor_products p
           JOIN public.promotion_campaign_vendors r ON r.id = p.registration_id
           JOIN public.promotion_campaigns c ON c.id = r.campaign_id
           WHERE c.slug = w.slug AND r.stall_number = w.stall_number AND r.status = 'approved'
             AND p.position = w.position AND p.product_id IS NULL) <> 1;
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'event-only item missing: %', missing; END IF;

  -- Campaigns: triggers on, so translations are re-queued for the changed text.
  WITH old AS (
    SELECT c.id, jsonb_build_object('slug', c.slug, 'title', c.title, 'summary', c.summary, 'description', c.description, 'poster_url', c.poster_url) AS j
      FROM public.promotion_campaigns c JOIN want_campaign w ON w.slug = c.slug
     WHERE (c.title, c.summary, c.description, c.poster_url) IS DISTINCT FROM (w.title, w.summary, w.description, base || w.poster)
  ), upd AS (
    UPDATE public.promotion_campaigns c
       SET title = w.title, summary = w.summary, description = w.description, poster_url = base || w.poster
      FROM want_campaign w
     WHERE w.slug = c.slug AND c.id IN (SELECT id FROM old)
    RETURNING c.id
  )
  INSERT INTO demo_refresh_log SELECT 'campaign', old.j FROM old JOIN upd USING (id);

  SET LOCAL session_replication_role = replica;

  WITH old AS (
    SELECT l.id, jsonb_build_object('slug', w.slug, 'starts_on', l.starts_on, 'name', l.name) AS j
      FROM public.promotion_campaign_locations l
      JOIN public.promotion_campaigns c ON c.id = l.campaign_id
      JOIN want_location w ON w.slug = c.slug AND w.starts_on = l.starts_on
     WHERE l.name IS DISTINCT FROM w.name
  ), upd AS (
    UPDATE public.promotion_campaign_locations l SET name = w.name
      FROM public.promotion_campaigns c, want_location w
     WHERE c.id = l.campaign_id AND w.slug = c.slug AND w.starts_on = l.starts_on AND l.id IN (SELECT id FROM old)
    RETURNING l.id
  )
  INSERT INTO demo_refresh_log SELECT 'location', old.j FROM old JOIN upd USING (id);

  WITH old AS (
    SELECT r.id, jsonb_build_object('slug', w.slug, 'stall', r.stall_number, 'stall_poster_url', r.stall_poster_url, 'stall_description', r.stall_description) AS j
      FROM public.promotion_campaign_vendors r
      JOIN public.promotion_campaigns c ON c.id = r.campaign_id
      JOIN want_stall w ON w.slug = c.slug AND w.stall_number = r.stall_number
     WHERE r.status = 'approved'
       AND (r.stall_poster_url, r.stall_description) IS DISTINCT FROM
           (coalesce(base || w.poster, r.stall_poster_url), coalesce(w.description, r.stall_description))
  ), upd AS (
    UPDATE public.promotion_campaign_vendors r
       SET stall_poster_url = coalesce(base || w.poster, r.stall_poster_url),
           stall_description = coalesce(w.description, r.stall_description)
      FROM public.promotion_campaigns c, want_stall w
     WHERE c.id = r.campaign_id AND w.slug = c.slug AND w.stall_number = r.stall_number AND r.id IN (SELECT id FROM old)
    RETURNING r.id
  )
  INSERT INTO demo_refresh_log SELECT 'stall', old.j FROM old JOIN upd USING (id);

  WITH old AS (
    SELECT p.id, jsonb_build_object('slug', w.slug, 'stall', w.stall_number, 'position', p.position, 'name', p.name, 'image_url', p.image_url) AS j
      FROM public.promotion_campaign_vendor_products p
      JOIN public.promotion_campaign_vendors r ON r.id = p.registration_id
      JOIN public.promotion_campaigns c ON c.id = r.campaign_id
      JOIN want_item w ON w.slug = c.slug AND w.stall_number = r.stall_number AND w.position = p.position
     WHERE r.status = 'approved' AND p.product_id IS NULL
       AND (p.image_url, p.name) IS DISTINCT FROM (base || w.image, coalesce(w.name, p.name))
  ), upd AS (
    UPDATE public.promotion_campaign_vendor_products p
       SET image_url = base || w.image, name = coalesce(w.name, p.name)
      FROM public.promotion_campaign_vendors r, public.promotion_campaigns c, want_item w
     WHERE r.id = p.registration_id AND c.id = r.campaign_id
       AND w.slug = c.slug AND w.stall_number = r.stall_number AND w.position = p.position
       AND p.id IN (SELECT id FROM old)
    RETURNING p.id
  )
  INSERT INTO demo_refresh_log SELECT 'item', old.j FROM old JOIN upd USING (id);

  -- C9 also renames Jonker 88's laksa on its non-public registrations (e.g. the pending Penang one),
  -- so the seed and the data agree. Name only; their images stay as they are.
  WITH old AS (
    SELECT p.id, jsonb_build_object('registration', r.id, 'status', r.status, 'name', p.name) AS j
      FROM public.promotion_campaign_vendor_products p
      JOIN public.promotion_campaign_vendors r ON r.id = p.registration_id
     WHERE r.vendor_id = jonker AND p.product_id IS NULL AND p.name = 'Baba nyonya laksa'
  ), upd AS (
    UPDATE public.promotion_campaign_vendor_products p SET name = 'Nyonya Laksa'
     WHERE p.id IN (SELECT id FROM old)
    RETURNING p.id
  )
  INSERT INTO demo_refresh_log SELECT 'item-rename', old.j FROM old JOIN upd USING (id);

  SET LOCAL session_replication_role = origin;

  -- Previous values of every changed row; "0 rows changed" on a rerun.
  RAISE NOTICE '% rows changed: %', (SELECT count(*) FROM demo_refresh_log),
    coalesce((SELECT jsonb_pretty(jsonb_agg(jsonb_build_object('step', step, 'old', old) ORDER BY step)) FROM demo_refresh_log), '[]');
END $$;
