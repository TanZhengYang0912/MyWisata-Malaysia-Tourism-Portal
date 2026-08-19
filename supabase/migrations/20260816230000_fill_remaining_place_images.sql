-- Fill every currently empty non-Penang place image with a distinct real
-- reference photo. Source and licensing notes live in:
--   public/assets/customer/PHOTO-CREDITS.md
-- Keep these updates null-only so an existing curated image is never replaced.

BEGIN;

UPDATE places SET image_url = 'johor/danga-bay-waterfront.webp'
WHERE slug = 'danga-bay-waterfront' AND image_url IS NULL;
UPDATE places SET image_url = 'johor/legoland-waterpark.webp'
WHERE slug = 'legoland-waterpark' AND image_url IS NULL;
UPDATE places SET image_url = 'johor/muar.webp'
WHERE slug = 'muar' AND image_url IS NULL;
UPDATE places SET image_url = 'johor/johor.webp'
WHERE slug = 'johor' AND image_url IS NULL;

UPDATE places SET image_url = 'kedah/jetty-point-kuah.webp'
WHERE slug = 'jetty-point-kuah' AND image_url IS NULL;
UPDATE places SET image_url = 'kedah/tanjung-rhu.webp'
WHERE slug = 'tanjung-rhu' AND image_url IS NULL;
UPDATE places SET image_url = 'kedah/kedah.webp'
WHERE slug = 'kedah' AND image_url IS NULL;

UPDATE places SET image_url = 'kelantan/pantai-nami.webp'
WHERE slug = 'pantai-nami' AND image_url IS NULL;

UPDATE places SET image_url = 'negeri-sembilan/muzium-kota-lukut.webp'
WHERE slug = 'muzium-kota-lukut' AND image_url IS NULL;
UPDATE places SET image_url = 'negeri-sembilan/ns-chinese-assembly-hall.webp'
WHERE slug = 'ns-chinese-assembly-hall' AND image_url IS NULL;

UPDATE places SET image_url = 'pahang/bishops-trail.webp'
WHERE slug = 'bishops-trail' AND image_url IS NULL;
UPDATE places SET image_url = 'pahang/cherating-beach.webp'
WHERE slug = 'cherating-beach' AND image_url IS NULL;
UPDATE places SET image_url = 'pahang/cherating-turtle-sanctuary.webp'
WHERE slug = 'cherating-turtle-sanctuary' AND image_url IS NULL;
UPDATE places SET image_url = 'pahang/juara-beach.webp'
WHERE slug = 'juara-beach' AND image_url IS NULL;
UPDATE places SET image_url = 'pahang/lata-berkoh.webp'
WHERE slug = 'lata-berkoh' AND image_url IS NULL;
UPDATE places SET image_url = 'pahang/sungai-palas-tea-estate.webp'
WHERE slug = 'sungai-palas-tea-estate' AND image_url IS NULL;
UPDATE places SET image_url = 'pahang/tioman-marine-park.webp'
WHERE slug = 'tioman-marine-park' AND image_url IS NULL;

UPDATE places SET image_url = 'perak/taiping-zoo.webp'
WHERE slug = 'taiping-zoo' AND image_url IS NULL;

UPDATE places SET image_url = 'perlis/dataran-keris.webp'
WHERE slug = 'dataran-keris' AND image_url IS NULL;
UPDATE places SET image_url = 'perlis/taman-ular-dan-reptilia.webp'
WHERE slug = 'taman-ular-dan-reptilia' AND image_url IS NULL;

UPDATE places SET image_url = 'sabah/pusat-orkid.webp'
WHERE slug = 'pusat-orkid' AND image_url IS NULL;

UPDATE places SET image_url = 'sarawak/kuching-waterfront-bazaar.webp'
WHERE slug = 'kuching-waterfront-bazaar' AND image_url IS NULL;
UPDATE places SET image_url = 'sarawak/satok-market.webp'
WHERE slug = 'satok-market' AND image_url IS NULL;
UPDATE places SET image_url = 'sarawak/upside-down-house.webp'
WHERE slug = 'upside-down-house' AND image_url IS NULL;

UPDATE places SET image_url = 'selangor/dataran-bunga-raya.webp'
WHERE slug = 'dataran-bunga-raya' AND image_url IS NULL;

UPDATE places SET image_url = 'terengganu/merang-jetty.webp'
WHERE slug = 'merang-jetty' AND image_url IS NULL;
UPDATE places SET image_url = 'terengganu/turtle-alley.webp'
WHERE slug = 'turtle-alley' AND image_url IS NULL;
UPDATE places SET image_url = 'terengganu/merang.webp'
WHERE slug = 'merang' AND image_url IS NULL;

COMMIT;
