-- Public bucket for vendor default imagery.
--
-- Mirrors the previous public/assets/customer/ directory layout:
--   vendor-images/abdul-antiques.jpg
--   penang/cheong-fatt-tze-mansion.webp
--
-- vendors.cover_url stores the bucket-relative path only (no host, no leading
-- slash). lib/storage/vendor-image.ts builds the full public URL at render time.
--
-- Writes are limited to admins (public.is_admin) so a future admin upload
-- feature needs no bucket changes. The seed uploader uses the service role,
-- which bypasses RLS.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'vendor-images',
  'vendor-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS vendor_images_public_read ON storage.objects;
CREATE POLICY vendor_images_public_read ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'vendor-images');

DROP POLICY IF EXISTS vendor_images_admin_insert ON storage.objects;
CREATE POLICY vendor_images_admin_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'vendor-images' AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS vendor_images_admin_update ON storage.objects;
CREATE POLICY vendor_images_admin_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'vendor-images' AND public.is_admin(auth.uid()))
  WITH CHECK (bucket_id = 'vendor-images' AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS vendor_images_admin_delete ON storage.objects;
CREATE POLICY vendor_images_admin_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'vendor-images' AND public.is_admin(auth.uid()));
