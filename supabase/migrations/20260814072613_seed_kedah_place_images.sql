-- Kedah place imagery — see
-- docs/plans/2026-08-14-1520-kedah-real-business-seed.md Phase 2.
--
-- Photos are Wikimedia Commons, CC0/CC BY/CC BY-SA — an initial real-photo
-- set, to be replaced with approved production assets once licensing is
-- confirmed. Separate from the ODbL attribution covering the business data
-- in 20260813090000_seed_kedah.sql.
--
-- 14 of 16 candidate slugs (6 regions + 10 POIs) got a usable photo.
--
-- Two genuine gaps — searched, retried with alternate terms, no usable
-- Commons photo found either way. Both keep image_url NULL and fall back
-- to the initial-letter colour block in PlaceCard:
--   tanjung-rhu (region) — the only candidate under this search term showed
--     people on a boat, not the coastline; alor-setar's region photo uses
--     the MBAS council fountain instead of a similarly-generic candidate.
--   jetty-point-kuah (POI) — three separate search terms returned nothing
--     on-subject (only an unrelated tower and NARA archive photos of a
--     different "South Jetty" in Washington state).
--
-- kilim (region) and kilim-geoforest-park (POI) both show the same karst/
-- mangrove river landscape from different search terms but are distinct
-- photographs (different angle, no shared framing) — not the same
-- near-duplicate case as Johor's danga-bay pair, so both are kept.
--
-- Wikimedia's CDN rate-limited full-resolution originals mid-fetch
-- (429, Retry-After: 600) after the first batch; switched to
-- api.wikimedia.org's REST file endpoint (`preferred` pre-generated
-- thumbnail URLs) for the remaining fetches, which were not subject to
-- the same throttle.
--
-- Attribution per file:
--
--   alor-setar.webp             Alor Setar City Council.jpg — CC BY-SA 4.0
--   eagle-square.webp           Eagle square at Kuah Langkawi.jpg — CC BY-SA 4.0
--   gunung-raya.webp            GUNUNG RAYA PANORAMA.jpg — CC BY 3.0
--   kilim.webp                  Langkawi, Kedah, Malaysia - panoramio (16).jpg — CC BY 3.0
--   kilim-geoforest-park.webp   Kilim Geoforest Park, Langkawi.jpg — CC BY-SA 4.0
--   kuah.webp                   Kuah Langkawi Malaysia Al-Hana-Mosque-03.jpg — CC BY-SA 3.0
--   langkawi-skycab.webp        Langkawi Cable Car SKYCAB.jpg — CC BY-SA 4.0
--   masjid-zahir.webp           Masjid zahir, alor setar.jpg — CC BY 2.0
--   menara-alor-setar.webp      Menara Alor Setar 01.jpg — CC BY 4.0
--   oriental-village.webp       Oriental Village in Langkawi.JPG — CC BY-SA 4.0
--   pantai-cenang.webp          Pantai Cenang, Langkawi 01.jpg — CC BY-SA 4.0
--   pantai-cenang-beach.webp    Pantai Cenang Beach at sunset.jpg — CC BY-SA 4.0
--   pantai-tanjung-rhu.webp     Tanjung Rhu Beach.jpg — CC BY 2.0
--   underwater-world.webp       Entrance to Underwater World, Langkawi.jpg — Public domain

BEGIN;

UPDATE places SET image_url = '/assets/customer/kedah/pantai-cenang.webp' WHERE slug = 'pantai-cenang';
UPDATE places SET image_url = '/assets/customer/kedah/kuah.webp' WHERE slug = 'kuah';
UPDATE places SET image_url = '/assets/customer/kedah/kilim.webp' WHERE slug = 'kilim';
UPDATE places SET image_url = '/assets/customer/kedah/oriental-village.webp' WHERE slug = 'oriental-village';
UPDATE places SET image_url = '/assets/customer/kedah/alor-setar.webp' WHERE slug = 'alor-setar';

UPDATE places SET image_url = '/assets/customer/kedah/langkawi-skycab.webp' WHERE slug = 'langkawi-skycab';
UPDATE places SET image_url = '/assets/customer/kedah/underwater-world.webp' WHERE slug = 'underwater-world';
UPDATE places SET image_url = '/assets/customer/kedah/eagle-square.webp' WHERE slug = 'eagle-square';
UPDATE places SET image_url = '/assets/customer/kedah/kilim-geoforest-park.webp' WHERE slug = 'kilim-geoforest-park';
UPDATE places SET image_url = '/assets/customer/kedah/gunung-raya.webp' WHERE slug = 'gunung-raya';
UPDATE places SET image_url = '/assets/customer/kedah/pantai-tanjung-rhu.webp' WHERE slug = 'pantai-tanjung-rhu';
UPDATE places SET image_url = '/assets/customer/kedah/pantai-cenang-beach.webp' WHERE slug = 'pantai-cenang-beach';
UPDATE places SET image_url = '/assets/customer/kedah/masjid-zahir.webp' WHERE slug = 'masjid-zahir';
UPDATE places SET image_url = '/assets/customer/kedah/menara-alor-setar.webp' WHERE slug = 'menara-alor-setar';

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM places WHERE state = 'Kedah' AND image_url IS NOT NULL;
  IF n <> 14 THEN RAISE EXCEPTION 'expected 14 Kedah places with an image, found %', n; END IF;
END $$;

COMMIT;
;
