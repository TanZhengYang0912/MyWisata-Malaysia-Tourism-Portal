-- Repoint vendors.cover_url and logo_url from the removed public/assets/customer/ tree to
-- bucket-relative paths inside the vendor-images Storage bucket.
--
--   before: /assets/customer/vendor-images/abdul-antiques.jpg
--   after:  vendor-images/abdul-antiques.jpg
--
-- The full public URL is built at render time by lib/storage/vendor-image.ts
-- from NEXT_PUBLIC_SUPABASE_URL, so no host is stored in the database for default images.
-- (Note: vendors uploading their own images still store full URLs to vendor-products).
--
-- Requires 20260819120000_vendor_images_bucket.sql and a completed run of
-- scripts/upload-vendor-images.mjs.

BEGIN;

UPDATE vendors
SET cover_url = regexp_replace(cover_url, '^/assets/customer/', '')
WHERE cover_url LIKE '/assets/customer/%';

UPDATE vendors
SET logo_url = regexp_replace(logo_url, '^/assets/customer/', '')
WHERE logo_url LIKE '/assets/customer/%';

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM vendors WHERE cover_url LIKE '/assets/%' OR logo_url LIKE '/assets/%';
  IF n <> 0 THEN RAISE EXCEPTION '% vendor rows still carry a legacy /assets path', n; END IF;
END $$;

COMMIT;
