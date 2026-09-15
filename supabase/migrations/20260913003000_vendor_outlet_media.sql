-- Entity media integrity for public vendor and outlet galleries.
-- Existing product media remains valid; entity galleries are identified by
-- New installations may use media_type = 'gallery'/'logo'. The repair script
-- also supports legacy deployments whose check constraint only permits
-- media_type = 'image'/'video': entity gallery rows use 'image' with
-- sort_order >= 0, while outlet logo rows use 'image' with sort_order = -1.

ALTER TABLE public.media_assets
  ADD COLUMN IF NOT EXISTS content_hash text;

CREATE INDEX IF NOT EXISTS media_assets_vendor_entity_idx
  ON public.media_assets (vendor_id, media_type, sort_order)
  WHERE product_id IS NULL AND vendor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS media_assets_outlet_entity_idx
  ON public.media_assets (outlet_id, media_type, sort_order)
  WHERE product_id IS NULL AND outlet_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS media_assets_entity_gallery_hash_uidx
  ON public.media_assets (content_hash)
  WHERE media_type IN ('gallery', 'image') AND sort_order >= 0 AND content_hash IS NOT NULL AND product_id IS NULL;

ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read approved entity media" ON public.media_assets;
CREATE POLICY "Public can read approved entity media"
  ON public.media_assets
  FOR SELECT
  TO anon, authenticated
  USING (
    product_id IS NULL
    AND (
      (
        vendor_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.vendors v
          WHERE v.id = media_assets.vendor_id AND v.status = 'approved'
        )
      )
      OR (
        outlet_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.outlets o
          JOIN public.vendors v ON v.id = o.vendor_id
          WHERE o.id = media_assets.outlet_id
            AND o.status = 'active'
            AND o.review_status = 'approved'
            AND v.status = 'approved'
        )
      )
    )
  );
