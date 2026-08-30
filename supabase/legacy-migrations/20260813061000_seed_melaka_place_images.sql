-- Melaka place imagery — see
-- docs/plans/2026-08-13-0048-melaka-place-seed-and-imagery.md Phase 2.
--
-- Photos are Wikimedia Commons, CC0/CC BY/CC BY-SA — an initial real-photo
-- set, to be replaced with approved production assets once licensing is
-- confirmed. This is separate from the ODbL attribution covering the
-- business data in 20260813060000_seed_melaka.sql.
--
-- All 16 places got a usable photo — better than the plan's §4.4 estimate of
-- 13-14 of 16. No gaps to report.
--
-- Two picks diverged from the plan's search-term expectation after the first
-- downloaded candidate turned out to be the wrong subject: "St Paul's Church,
-- Melaka.jpg" was a Dutch gravestone photographed inside the ruins, not the
-- church itself, so st-pauls-church uses "Melaka Malaysia St-Paul's-Church-01"
-- instead (the ruin exterior with the St. Francis Xavier statue). Similarly
-- "Bandar Hilir, Melaka, Malaysia - panoramio.jpg" turned out to be a replica
-- Portuguese ship museum, not a district view, so bandar-hilir uses
-- "panoramio (1)" instead — the illuminated Kincir Air (Melaka Sultanate
-- watermill replica), a real Bandar Hilir landmark distinct from every other
-- photo in this set.
--
-- melaka-river and melaka-river-cruise were deliberately checked against each
-- other per §4.2's near-duplicate warning: the cruise photo shows the boats
-- and jetty with the monorail overhead, the river photo shows a different,
-- colourful heritage stretch with a single boat — visually distinct, both kept.
--
-- Attribution per file:
--
--   a-famosa.webp               2016 Malakka, A Famosa (01).jpg — CC BY-SA 4.0
--   ayer-keroh.webp              Ayer Keroh MADANI Square.jpg — CC BY-SA 4.0
--   baba-nyonya-museum.webp      Baba and Nyonya House Museum Exterior.jpg — CC BY-SA 4.0
--   bandar-hilir.webp            Bandar Hilir, Melaka, Malaysia - panoramio (1).jpg — CC BY-SA 3.0
--   christ-church-melaka.webp    Melaka-Dutch-Square-2163.jpg — CC BY-SA 3.0
--   jonker-street.webp           Jonker Street Night Market in Melaka, Malaysia.jpg — CC BY-SA 2.0
--   kampung-morten.webp          Morten Village.JPG — CC BY-SA 4.0
--   klebang.webp                 Submarine Museum.JPG — CC BY-SA 4.0 (Klebang's submarine museum)
--   klebang-beach.webp           Klebang Beach.JPG — CC BY-SA 4.0
--   melaka-river.webp            Melaka (Malacca) River.jpg — CC0
--   melaka-river-cruise.webp     Malacca Monorail station and river cruise boats.jpg — CC BY-SA 2.0
--   melaka-straits-mosque.webp   Malacca Malaysia Malacca-Straits-Mosque-01.jpg — CC BY-SA 3.0
--   melaka-zoo.webp              Melaka Zoo and Night Safari.jpg — CC BY-SA 4.0
--   menara-taming-sari.webp      2016 Malakka, Wieża Taming Sari (01).jpg — CC BY-SA 4.0
--   st-pauls-church.webp         Melaka Malaysia St-Paul's-Church-01.jpg — CC BY-SA 3.0
--   the-stadthuys.webp           Stadthuys Melaka.jpg — CC BY 4.0

BEGIN;

UPDATE places SET image_url = '/assets/customer/melaka/bandar-hilir.webp' WHERE slug = 'bandar-hilir';
UPDATE places SET image_url = '/assets/customer/melaka/melaka-river.webp' WHERE slug = 'melaka-river';
UPDATE places SET image_url = '/assets/customer/melaka/klebang.webp' WHERE slug = 'klebang';
UPDATE places SET image_url = '/assets/customer/melaka/ayer-keroh.webp' WHERE slug = 'ayer-keroh';

UPDATE places SET image_url = '/assets/customer/melaka/a-famosa.webp' WHERE slug = 'a-famosa';
UPDATE places SET image_url = '/assets/customer/melaka/st-pauls-church.webp' WHERE slug = 'st-pauls-church';
UPDATE places SET image_url = '/assets/customer/melaka/christ-church-melaka.webp' WHERE slug = 'christ-church-melaka';
UPDATE places SET image_url = '/assets/customer/melaka/the-stadthuys.webp' WHERE slug = 'the-stadthuys';
UPDATE places SET image_url = '/assets/customer/melaka/jonker-street.webp' WHERE slug = 'jonker-street';
UPDATE places SET image_url = '/assets/customer/melaka/menara-taming-sari.webp' WHERE slug = 'menara-taming-sari';
UPDATE places SET image_url = '/assets/customer/melaka/melaka-river-cruise.webp' WHERE slug = 'melaka-river-cruise';
UPDATE places SET image_url = '/assets/customer/melaka/kampung-morten.webp' WHERE slug = 'kampung-morten';
UPDATE places SET image_url = '/assets/customer/melaka/baba-nyonya-museum.webp' WHERE slug = 'baba-nyonya-museum';
UPDATE places SET image_url = '/assets/customer/melaka/melaka-straits-mosque.webp' WHERE slug = 'melaka-straits-mosque';
UPDATE places SET image_url = '/assets/customer/melaka/klebang-beach.webp' WHERE slug = 'klebang-beach';
UPDATE places SET image_url = '/assets/customer/melaka/melaka-zoo.webp' WHERE slug = 'melaka-zoo';

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM places WHERE state = 'Melaka' AND image_url IS NULL;
  IF n > 0 THEN RAISE EXCEPTION '% Melaka places still have no image_url', n; END IF;
END $$;

COMMIT;
