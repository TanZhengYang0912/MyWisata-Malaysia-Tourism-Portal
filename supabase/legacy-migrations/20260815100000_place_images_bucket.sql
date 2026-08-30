-- Public bucket for place/destination imagery.
--
-- Mirrors the previous public/assets/customer/ directory layout:
--   place-images/penang/chew-jetty.webp
--   place-images/malaysia/penang-george-town.webp
--
-- places.image_url stores the bucket-relative path only (no host, no leading
-- slash). lib/storage/place-image.ts builds the full public URL at render time.
--
-- CONTRACT: never overwrite an existing object. This bucket is public and
-- CDN-cached, so replacing an image at the same path serves stale content.
-- Future admin replacements must write a new path and update places.image_url.
--
-- Writes are limited to admins (public.is_admin) so a future admin upload
-- feature needs no bucket changes. The seed uploader uses the service role,
-- which bypasses RLS.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'place-images',
  'place-images',
  true,
  5242880,
  ARRAY['image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS place_images_public_read ON storage.objects;
CREATE POLICY place_images_public_read ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'place-images');

DROP POLICY IF EXISTS place_images_admin_insert ON storage.objects;
CREATE POLICY place_images_admin_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'place-images' AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS place_images_admin_update ON storage.objects;
CREATE POLICY place_images_admin_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'place-images' AND public.is_admin(auth.uid()))
  WITH CHECK (bucket_id = 'place-images' AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS place_images_admin_delete ON storage.objects;
CREATE POLICY place_images_admin_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'place-images' AND public.is_admin(auth.uid()));
