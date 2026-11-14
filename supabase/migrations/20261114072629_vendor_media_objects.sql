-- Vendor media upload registry — Phase 1 of
-- docs/plans/2026-11-14-1610-vendor-media-upload-cleanup.md.
--
-- Every new vendor image upload (product / Studio media, hotel photos, event
-- posters, vendor gallery) is recorded here BEFORE it is written to Storage,
-- so a later, reference-checked sweep (Phase 2) can remove files that were
-- never saved or stopped being used. This migration deletes nothing and does
-- not touch files uploaded before it.
--
-- Apply only after confirming the target is the local test database, then
-- deploy the app build whose upload routes call reserve/mark. Applying it
-- earlier is harmless: no code reads the table yet.
-- Rollback: deploy the previous app build, then
--   DROP FUNCTION public.mark_vendor_media_object_stored(uuid);
--   DROP FUNCTION public.reserve_vendor_media_object(text, text, uuid, uuid, text);
--   DROP FUNCTION app_private.mark_vendor_media_object_stored(uuid);
--   DROP FUNCTION app_private.reserve_vendor_media_object(text, text, uuid, uuid, text);
--   DROP TABLE app_private.vendor_media_objects;

CREATE SCHEMA IF NOT EXISTS app_private;
GRANT USAGE ON SCHEMA app_private TO service_role;

CREATE TABLE IF NOT EXISTS app_private.vendor_media_objects (
  object_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket text NOT NULL CHECK (bucket IN ('vendor-products', 'event-posters')),
  storage_path text NOT NULL CHECK (char_length(storage_path) BETWEEN 3 AND 512 AND storage_path !~ '(^/|\.\.|\\)'),
  -- Intentionally no FK: a deleted vendor or user must leave a cleanup
  -- tombstone, not cascade away the only record of the Storage object.
  vendor_id uuid NOT NULL,
  uploaded_by uuid NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('product_media', 'hotel_photo', 'event_poster', 'vendor_gallery')),
  state text NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved', 'stored', 'deleting', 'deleted')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  stored_at timestamptz,
  -- Phase 2 sweep bookkeeping; unused until then.
  last_referenced_at timestamptz,
  checked_at timestamptz,
  cleanup_claimed_at timestamptz,
  cleanup_claim_token uuid,
  CONSTRAINT vendor_media_objects_bucket_path_unique UNIQUE (bucket, storage_path),
  -- Paths are always written under the owning vendor's folder.
  CONSTRAINT vendor_media_objects_vendor_folder CHECK (left(storage_path, 37) = vendor_id::text || '/')
);

-- Phase 2 cleanup queue: least recently checked live objects first.
CREATE INDEX IF NOT EXISTS vendor_media_objects_cleanup_queue
  ON app_private.vendor_media_objects (checked_at NULLS FIRST, created_at, object_id)
  WHERE state IN ('reserved', 'stored');

ALTER TABLE app_private.vendor_media_objects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.vendor_media_objects FROM PUBLIC, anon, authenticated;
GRANT ALL ON app_private.vendor_media_objects TO service_role;

CREATE OR REPLACE FUNCTION app_private.reserve_vendor_media_object(
  p_bucket text,
  p_storage_path text,
  p_vendor_id uuid,
  p_uploaded_by uuid,
  p_purpose text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_object_id uuid;
BEGIN
  INSERT INTO app_private.vendor_media_objects (bucket, storage_path, vendor_id, uploaded_by, purpose)
  VALUES (p_bucket, p_storage_path, p_vendor_id, p_uploaded_by, p_purpose)
  RETURNING object_id INTO v_object_id;
  RETURN v_object_id;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.mark_vendor_media_object_stored(p_object_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE app_private.vendor_media_objects
     SET state = 'stored', stored_at = clock_timestamp()
   WHERE object_id = p_object_id AND state = 'reserved';
  RETURN FOUND;
END;
$$;

-- PostgREST only exposes public: thin wrappers, service_role only (avatar pattern).
CREATE OR REPLACE FUNCTION public.reserve_vendor_media_object(
  p_bucket text,
  p_storage_path text,
  p_vendor_id uuid,
  p_uploaded_by uuid,
  p_purpose text
)
RETURNS uuid
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT app_private.reserve_vendor_media_object(p_bucket, p_storage_path, p_vendor_id, p_uploaded_by, p_purpose);
$$;

CREATE OR REPLACE FUNCTION public.mark_vendor_media_object_stored(p_object_id uuid)
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT app_private.mark_vendor_media_object_stored(p_object_id);
$$;

REVOKE ALL ON FUNCTION app_private.reserve_vendor_media_object(text, text, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.mark_vendor_media_object_stored(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_vendor_media_object(text, text, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_vendor_media_object_stored(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app_private.reserve_vendor_media_object(text, text, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION app_private.mark_vendor_media_object_stored(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_vendor_media_object(text, text, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_vendor_media_object_stored(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
