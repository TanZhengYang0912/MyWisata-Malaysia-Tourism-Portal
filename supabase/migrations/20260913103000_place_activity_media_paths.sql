-- Every non-vendor place activity owns its own curated activity-media object.
-- Keep the Storage path separate from image_source_url: the latter is audit
-- provenance, never a customer-facing external link.

ALTER TABLE public.place_accesses
  ADD COLUMN image_path TEXT;

ALTER TABLE public.place_informational_activities
  ADD COLUMN image_path TEXT;

ALTER TABLE public.place_accesses
  ADD CONSTRAINT place_accesses_image_path_shape
  CHECK (image_path IS NULL OR image_path ~ '^activity-media/[a-z0-9-]+\.webp$');

ALTER TABLE public.place_informational_activities
  ADD CONSTRAINT place_informational_activities_image_path_shape
  CHECK (image_path IS NULL OR image_path ~ '^activity-media/[a-z0-9-]+\.webp$');
