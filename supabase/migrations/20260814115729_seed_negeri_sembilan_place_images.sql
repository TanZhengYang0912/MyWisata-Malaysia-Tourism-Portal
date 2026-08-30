-- Negeri Sembilan place imagery — see
-- docs/plans/2026-08-14-2100-negeri-sembilan-real-business-seed.md Phase 2.
--
-- Photos are Wikimedia Commons, CC0/CC BY/CC BY-SA — an initial real-photo
-- set, to be replaced with approved production assets once licensing is
-- confirmed. Separate from the ODbL attribution covering the business data
-- in 20260814160000_seed_negeri_sembilan.sql.
--
-- Corrective substitution: '0km Port Dickson' had zero Commons coverage
-- under every search term tried. It is renamed here to 'Saujana Beach' —
-- a real, well-documented Port Dickson beach. It has no product_places
-- dependency, so the rename is a clean swap, not a data-integrity risk —
-- same pattern as Sarawak's Kuching Sign -> Kuching Cat Statue, Terengganu's
-- Kampung Cina Bridge -> Kuala Terengganu Drawbridge, Perak's Kong Heng
-- Square -> Concubine Lane.
--
-- 2 of 13 candidate slugs got no usable photo — Negeri Sembilan Chinese
-- Assembly Hall and Muzium Kota Lukut returned zero on-subject results
-- under every search term tried. Both keep image_url NULL and fall back to
-- the initial-letter colour block. No further substitution needed: 11/13
-- candidates found clears the 75% coverage threshold comfortably.
--
-- 'balairong-seri' and 'istana-lama-seri-menanti' both show the Sri
-- Menanti royal complex but are genuinely distinct photographs — a ground-
-- level entrance shot with heritage plaque, versus an aerial view from the
-- lookout tower — same precedent as Sabah's tanjung-aru pair, not a
-- near-duplicate.
--
-- Attribution per file:
--
--   seremban.webp                    Seremban Square, Seremban City, Seremban.jpg — CC BY-SA 4.0
--   port-dickson.webp                Port-dickson-beach-1.jpg — CC BY-SA 4.0
--   sri-menanti.webp                 Seri Menanti palace.jpg — Public domain
--   seremban-lake-garden.webp        Seremban Lake Gardens, Seremban.jpg — CC BY-SA 4.0
--   pasar-besar-seremban.webp        Pasar Besar Seremban (220709).jpg — CC BY-SA 4.0
--   tanjung-tuan.webp                Tanjung Tuan Lighthouse.JPG — CC BY-SA 4.0
--   pd-army-museum.webp              Muzium Tentera Darat PD 2.jpg — CC BY-SA 3.0
--   saujana-beach.webp               Saujana Beach, Port Dickson (3).jpg — CC BY-SA 4.0
--   istana-lama-seri-menanti.webp    Istana Seri Menanti (30042023) 32.jpg — CC BY 4.0
--   balairong-seri.webp              Istana Seri Menanti (30042023) 24.jpg — CC BY 4.0
--   makam-diraja-seri-menanti.webp   Seri Menanti Royal Mausoleum.jpg — CC BY-SA 3.0

BEGIN;

UPDATE places
SET name = 'Saujana Beach', slug = 'saujana-beach'
WHERE state = 'Negeri Sembilan' AND slug = '0km-port-dickson';

UPDATE places SET image_url = '/assets/customer/negeri-sembilan/seremban.webp' WHERE slug = 'negeri-sembilan';
UPDATE places SET image_url = '/assets/customer/negeri-sembilan/seremban.webp' WHERE slug = 'seremban';
UPDATE places SET image_url = '/assets/customer/negeri-sembilan/port-dickson.webp' WHERE slug = 'port-dickson';
UPDATE places SET image_url = '/assets/customer/negeri-sembilan/sri-menanti.webp' WHERE slug = 'sri-menanti';

UPDATE places SET image_url = '/assets/customer/negeri-sembilan/seremban-lake-garden.webp' WHERE slug = 'seremban-lake-garden';
UPDATE places SET image_url = '/assets/customer/negeri-sembilan/pasar-besar-seremban.webp' WHERE slug = 'pasar-besar-seremban';
UPDATE places SET image_url = '/assets/customer/negeri-sembilan/tanjung-tuan.webp' WHERE slug = 'tanjung-tuan';
UPDATE places SET image_url = '/assets/customer/negeri-sembilan/pd-army-museum.webp' WHERE slug = 'pd-army-museum';
UPDATE places SET image_url = '/assets/customer/negeri-sembilan/saujana-beach.webp' WHERE slug = 'saujana-beach';
UPDATE places SET image_url = '/assets/customer/negeri-sembilan/istana-lama-seri-menanti.webp' WHERE slug = 'istana-lama-seri-menanti';
UPDATE places SET image_url = '/assets/customer/negeri-sembilan/balairong-seri.webp' WHERE slug = 'balairong-seri';
UPDATE places SET image_url = '/assets/customer/negeri-sembilan/makam-diraja-seri-menanti.webp' WHERE slug = 'makam-diraja-seri-menanti';

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM places WHERE state = 'Negeri Sembilan' AND image_url IS NOT NULL;
  IF n <> 12 THEN RAISE EXCEPTION 'expected 12 Negeri Sembilan places with an image, found %', n; END IF;
END $$;

COMMIT;
;
