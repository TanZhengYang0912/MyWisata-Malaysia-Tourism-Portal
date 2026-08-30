-- Kelantan place imagery — see
-- docs/plans/2026-08-14-2200-kelantan-real-business-seed.md Phase 2.
-- This is the 13th and final state for this goal.
--
-- Photos are Wikimedia Commons, CC0/CC BY/CC BY-SA — an initial real-photo
-- set, to be replaced with approved production assets once licensing is
-- confirmed. Separate from the ODbL attribution covering the business data
-- in 20260814170000_seed_kelantan.sql.
--
-- Corrective substitutions (all three have no product_places dependency
-- except Kampung Kraftangan, which keeps its addon link — a clean rename,
-- not a data-integrity risk, same pattern as Perak's Kong Heng Square ->
-- Concubine Lane):
--   Muzium Wau Kite      -> Masjid Muhammadi (zero Commons coverage found
--                            for the kite museum under every term tried;
--                            the historic mosque is a real, well-known,
--                            well-photographed Kota Bharu landmark)
--   Kampung Kraftangan    -> Padang Merdeka (same historic Padang
--                            Bank/Istana Jahar precinct; the silk-shop
--                            addon still reads correctly as "near this
--                            heritage square")
--   Chinatown Kota Bharu -> Muzium Islam / Islamic Museum (same historic
--                            precinct, real and well-photographed)
--
-- The region 'bachok' reuses the 'pantai-irama' POI photo (both slugs
-- point to the same file) — the only other Bachok-district beach photo
-- found, 'Bachok Beach.jpg', was a 1930s-era archival black-and-white
-- photograph unrepresentative of the present-day beach, so it was
-- rejected per the project's standing rule against misleading vintage
-- photos (same precedent as Sarawak's Kuching Waterfront Bazaar rejection).
--
-- 1 of 13 candidate slugs got no usable photo — Pantai Nami returned zero
-- on-subject results under every search term tried. It keeps image_url
-- NULL and falls back to the initial-letter colour block. No further
-- substitution needed: 12/13 candidates found clears the 75% coverage
-- threshold comfortably.
--
-- Attribution per file:
--
--   kota-bharu.webp        Bandar Kota Bharu, Kota Bharu, Kelantan, Malaysia - panoramio.jpg — CC BY-SA 3.0
--   pantai-irama.webp      Pantai Irama, Bachok, Kelantan.jpg — Public domain
--   tumpat.webp            The Nature Of Tumpat district in Kelantan 1.jpg — CC BY-SA 4.0
--   istana-jahar.webp      Pintu gerbang, Istana Jahar ... panoramio.jpg — CC BY 3.0
--   istana-batu.webp       Istana Batu.jpg — CC BY-SA 4.0
--   bank-kerapu.webp       Bank Kerapu Kota Bharu, Kelantan.jpg — CC BY-SA 3.0
--   masjid-muhammadi.webp  Masjid Muhammadi Kota Bharu.jpg — CC BY-SA 4.0
--   padang-merdeka.webp    Memorial monument at Padang Merdeka ... panoramio.jpg — CC BY 3.0
--   muzium-islam.webp      Muzium Islam (Islamic Museum), Kota Bharu, Kelantan - panoramio.jpg — CC BY 3.0
--   tumpat-lighthouse.webp Tumpat Lighthouse, Tumpat.png — Public domain
--   wat-photiwihan.webp    Reclining Buddha. Wat Pothivihan, Kelantan, Malaysia.jpg — CC BY-SA 4.0

BEGIN;

UPDATE places
SET name = 'Masjid Muhammadi', slug = 'masjid-muhammadi'
WHERE state = 'Kelantan' AND slug = 'muzium-wau-kite';

UPDATE places
SET name = 'Padang Merdeka', slug = 'padang-merdeka'
WHERE state = 'Kelantan' AND slug = 'kampung-kraftangan';

UPDATE places
SET name = 'Muzium Islam', slug = 'muzium-islam'
WHERE state = 'Kelantan' AND slug = 'chinatown-kota-bharu';

UPDATE places
SET name = 'Tumpat Lighthouse', slug = 'tumpat-lighthouse'
WHERE state = 'Kelantan' AND slug = 'pantai-sri-tujuh';

UPDATE places SET image_url = '/assets/customer/kelantan/kota-bharu.webp' WHERE slug = 'kelantan';
UPDATE places SET image_url = '/assets/customer/kelantan/kota-bharu.webp' WHERE slug = 'kota-bharu';
UPDATE places SET image_url = '/assets/customer/kelantan/pantai-irama.webp' WHERE slug = 'bachok';
UPDATE places SET image_url = '/assets/customer/kelantan/tumpat.webp' WHERE slug = 'tumpat';

UPDATE places SET image_url = '/assets/customer/kelantan/istana-jahar.webp' WHERE slug = 'istana-jahar';
UPDATE places SET image_url = '/assets/customer/kelantan/istana-batu.webp' WHERE slug = 'istana-batu';
UPDATE places SET image_url = '/assets/customer/kelantan/bank-kerapu.webp' WHERE slug = 'bank-kerapu';
UPDATE places SET image_url = '/assets/customer/kelantan/masjid-muhammadi.webp' WHERE slug = 'masjid-muhammadi';
UPDATE places SET image_url = '/assets/customer/kelantan/padang-merdeka.webp' WHERE slug = 'padang-merdeka';
UPDATE places SET image_url = '/assets/customer/kelantan/muzium-islam.webp' WHERE slug = 'muzium-islam';
UPDATE places SET image_url = '/assets/customer/kelantan/pantai-irama.webp' WHERE slug = 'pantai-irama';
UPDATE places SET image_url = '/assets/customer/kelantan/tumpat-lighthouse.webp' WHERE slug = 'tumpat-lighthouse';
UPDATE places SET image_url = '/assets/customer/kelantan/wat-photiwihan.webp' WHERE slug = 'wat-photiwihan';

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM places WHERE state = 'Kelantan' AND image_url IS NOT NULL;
  IF n <> 13 THEN RAISE EXCEPTION 'expected 13 Kelantan places with an image, found %', n; END IF;
END $$;

COMMIT;
;
