-- Repoint places.image_url from the removed public/assets/customer/ tree to
-- bucket-relative paths inside the place-images Storage bucket.
--
--   before: /assets/customer/penang/chew-jetty.webp
--   after:  penang/chew-jetty.webp
--
-- The full public URL is built at render time by lib/storage/place-image.ts
-- from NEXT_PUBLIC_SUPABASE_URL, so no host is stored in the database and the
-- rows stay portable across Supabase projects.
--
-- Requires 20260815100000_place_images_bucket.sql and a completed run of
-- scripts/upload-place-images.mjs.

BEGIN;

UPDATE places
SET image_url = regexp_replace(image_url, '^/assets/customer/', '')
WHERE image_url LIKE '/assets/customer/%';

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM places WHERE image_url LIKE '/assets/%';
  IF n <> 0 THEN RAISE EXCEPTION '% places rows still carry a legacy /assets path', n; END IF;

  SELECT count(*) INTO n FROM places WHERE image_url LIKE '/%' OR image_url LIKE 'http%';
  IF n <> 0 THEN RAISE EXCEPTION '% places rows have a leading slash or absolute URL', n; END IF;
END $$;

COMMIT;
