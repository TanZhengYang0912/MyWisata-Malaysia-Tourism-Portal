-- Assign the downloaded, licensed WebP assets to the 30 federal-territory POIs.
-- Keep this conditional so a curated image is never overwritten by the seed.

UPDATE places SET image_url = 'federal-territories/kuala-lumpur/petronas-twin-towers.webp'
WHERE slug = 'petronas-twin-towers' AND image_url IS NULL;
UPDATE places SET image_url = 'federal-territories/kuala-lumpur/dataran-merdeka.webp'
WHERE slug = 'dataran-merdeka' AND image_url IS NULL;
UPDATE places SET image_url = 'federal-territories/kuala-lumpur/central-market-kuala-lumpur.webp'
WHERE slug = 'central-market-kuala-lumpur' AND image_url IS NULL;
UPDATE places SET image_url = 'federal-territories/kuala-lumpur/kl-tower.webp'
WHERE slug = 'kl-tower' AND image_url IS NULL;
UPDATE places SET image_url = 'federal-territories/kuala-lumpur/bukit-nanas-forest-reserve.webp'
WHERE slug = 'bukit-nanas-forest-reserve' AND image_url IS NULL;
UPDATE places SET image_url = 'federal-territories/kuala-lumpur/jalan-alor.webp'
WHERE slug = 'jalan-alor' AND image_url IS NULL;
UPDATE places SET image_url = 'federal-territories/kuala-lumpur/national-mosque-kuala-lumpur.webp'
WHERE slug = 'national-mosque-kuala-lumpur' AND image_url IS NULL;
UPDATE places SET image_url = 'federal-territories/kuala-lumpur/islamic-arts-museum-malaysia.webp'
WHERE slug = 'islamic-arts-museum-malaysia' AND image_url IS NULL;
UPDATE places SET image_url = 'federal-territories/kuala-lumpur/perdana-botanical-gardens.webp'
WHERE slug = 'perdana-botanical-gardens' AND image_url IS NULL;
UPDATE places SET image_url = 'federal-territories/kuala-lumpur/thean-hou-temple.webp'
WHERE slug = 'thean-hou-temple' AND image_url IS NULL;

UPDATE places SET image_url = 'federal-territories/putrajaya/putra-mosque.webp'
WHERE slug = 'putra-mosque' AND image_url IS NULL;
UPDATE places SET image_url = 'federal-territories/putrajaya/perdana-putra.webp'
WHERE slug = 'perdana-putra' AND image_url IS NULL;
UPDATE places SET image_url = 'federal-territories/putrajaya/putrajaya-lake.webp'
WHERE slug = 'putrajaya-lake' AND image_url IS NULL;
UPDATE places SET image_url = 'federal-territories/putrajaya/seri-wawasan-bridge.webp'
WHERE slug = 'seri-wawasan-bridge' AND image_url IS NULL;
UPDATE places SET image_url = 'federal-territories/putrajaya/putrajaya-botanical-garden.webp'
WHERE slug = 'putrajaya-botanical-garden' AND image_url IS NULL;
UPDATE places SET image_url = 'federal-territories/putrajaya/putrajaya-wetlands-park.webp'
WHERE slug = 'putrajaya-wetlands-park' AND image_url IS NULL;
UPDATE places SET image_url = 'federal-territories/putrajaya/moroccan-pavilion-putrajaya.webp'
WHERE slug = 'moroccan-pavilion-putrajaya' AND image_url IS NULL;
UPDATE places SET image_url = 'federal-territories/putrajaya/millennium-monument-putrajaya.webp'
WHERE slug = 'millennium-monument-putrajaya' AND image_url IS NULL;
UPDATE places SET image_url = 'federal-territories/putrajaya/taman-warisan-pertanian.webp'
WHERE slug = 'taman-warisan-pertanian' AND image_url IS NULL;
UPDATE places SET image_url = 'federal-territories/putrajaya/tuanku-mizan-mosque.webp'
WHERE slug = 'tuanku-mizan-mosque' AND image_url IS NULL;

UPDATE places SET image_url = 'federal-territories/labuan/labuan-museum.webp'
WHERE slug = 'labuan-museum' AND image_url IS NULL;
UPDATE places SET image_url = 'federal-territories/labuan/labuan-marine-museum.webp'
WHERE slug = 'labuan-marine-museum' AND image_url IS NULL;
UPDATE places SET image_url = 'federal-territories/labuan/labuan-war-cemetery.webp'
WHERE slug = 'labuan-war-cemetery' AND image_url IS NULL;
UPDATE places SET image_url = 'federal-territories/labuan/financial-park-labuan.webp'
WHERE slug = 'financial-park-labuan' AND image_url IS NULL;
UPDATE places SET image_url = 'federal-territories/labuan/labuan-peace-park.webp'
WHERE slug = 'labuan-peace-park' AND image_url IS NULL;
UPDATE places SET image_url = 'federal-territories/labuan/surrender-point-labuan.webp'
WHERE slug = 'surrender-point-labuan' AND image_url IS NULL;
UPDATE places SET image_url = 'federal-territories/labuan/chimney-museum-labuan.webp'
WHERE slug = 'chimney-museum-labuan' AND image_url IS NULL;
UPDATE places SET image_url = 'federal-territories/labuan/batu-manikar-beach.webp'
WHERE slug = 'batu-manikar-beach' AND image_url IS NULL;
UPDATE places SET image_url = 'federal-territories/labuan/layang-layang-beach-labuan.webp'
WHERE slug = 'layang-layang-beach-labuan' AND image_url IS NULL;
UPDATE places SET image_url = 'federal-territories/labuan/papan-island.webp'
WHERE slug = 'papan-island' AND image_url IS NULL;

DO $$
DECLARE
  image_count INTEGER;
  unique_image_count INTEGER;
BEGIN
  SELECT COUNT(*), COUNT(DISTINCT image_url)
  INTO image_count, unique_image_count
  FROM places
  WHERE level = 'poi'
    AND state IN ('Kuala Lumpur', 'Putrajaya', 'Labuan')
    AND image_url LIKE 'federal-territories/%';

  IF image_count <> 30 OR unique_image_count <> 30 THEN
    RAISE EXCEPTION 'expected 30 federal territory POIs with images, found % rows and % unique paths', image_count, unique_image_count;
  END IF;
END $$;
;
