-- Vendor product media, draft state, and product-type availability metadata.
-- This migration is additive and intentionally preserves existing catalogue data.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS default_capacity INTEGER,
  ADD COLUMN IF NOT EXISTS digital_asset_url TEXT,
  ADD COLUMN IF NOT EXISTS digital_asset_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS digital_asset_type VARCHAR(120),
  ADD COLUMN IF NOT EXISTS digital_asset_size INTEGER;

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_default_capacity_check,
  DROP CONSTRAINT IF EXISTS products_digital_asset_size_check;

ALTER TABLE products
  ADD CONSTRAINT products_default_capacity_check CHECK (default_capacity IS NULL OR default_capacity > 0),
  ADD CONSTRAINT products_digital_asset_size_check CHECK (digital_asset_size IS NULL OR digital_asset_size >= 0);

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_review_status_check;

ALTER TABLE products
  ADD CONSTRAINT products_review_status_check
  CHECK (review_status IN ('draft','pending_review','approved','change_requested','rejected'));

CREATE INDEX IF NOT EXISTS idx_products_vendor_review_status
  ON products(vendor_id, review_status, status);

COMMENT ON COLUMN products.default_capacity IS 'Default capacity shown when an activity or experience is configured before time slots are created.';
COMMENT ON COLUMN products.digital_asset_url IS 'Supabase Storage URL for the downloadable digital product asset.';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'vendor-products',
  'vendor-products',
  true,
  10485760,
  ARRAY['image/jpeg','image/png','image/webp','application/pdf','application/zip']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS vendor_products_public_read ON storage.objects;
CREATE POLICY vendor_products_public_read ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'vendor-products');

DROP POLICY IF EXISTS vendor_products_insert_authorized ON storage.objects;
CREATE POLICY vendor_products_insert_authorized ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'vendor-products'
    AND (storage.foldername(name))[1] IN (
      SELECT v.id::text
      FROM vendors v
      WHERE v.owner_id = auth.uid()
        AND v.status = 'approved'
    )
    OR EXISTS (
      SELECT 1
      FROM outlet_managers om
      JOIN outlets o ON o.id = om.outlet_id
      WHERE om.user_id = auth.uid()
        AND o.vendor_id::text = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS vendor_products_update_authorized ON storage.objects;
CREATE POLICY vendor_products_update_authorized ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'vendor-products'
    AND (storage.foldername(name))[1] IN (
      SELECT v.id::text
      FROM vendors v
      WHERE v.owner_id = auth.uid()
        AND v.status = 'approved'
    )
    OR EXISTS (
      SELECT 1
      FROM outlet_managers om
      JOIN outlets o ON o.id = om.outlet_id
      WHERE om.user_id = auth.uid()
        AND o.vendor_id::text = (storage.foldername(name))[1]
    )
  )
  WITH CHECK (
    bucket_id = 'vendor-products'
    AND (storage.foldername(name))[1] IN (
      SELECT v.id::text
      FROM vendors v
      WHERE v.owner_id = auth.uid()
        AND v.status = 'approved'
    )
    OR EXISTS (
      SELECT 1
      FROM outlet_managers om
      JOIN outlets o ON o.id = om.outlet_id
      WHERE om.user_id = auth.uid()
        AND o.vendor_id::text = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS vendor_products_delete_authorized ON storage.objects;
CREATE POLICY vendor_products_delete_authorized ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'vendor-products'
    AND (storage.foldername(name))[1] IN (
      SELECT v.id::text
      FROM vendors v
      WHERE v.owner_id = auth.uid()
        AND v.status = 'approved'
    )
    OR EXISTS (
      SELECT 1
      FROM outlet_managers om
      JOIN outlets o ON o.id = om.outlet_id
      WHERE om.user_id = auth.uid()
        AND o.vendor_id::text = (storage.foldername(name))[1]
    )
  );
;
