-- ============================================================
-- 027_profile_completion.sql — Profile completion infrastructure
--
-- 1. bio_violation_count + bio_cooldown_until on users
-- 2. avatars storage bucket (public reads, signed-URL writes)
-- 3. Storage RLS policies for avatars bucket
-- 4. country column ensure (already in 001, safety check)
-- ============================================================


-- ── 1. Bio moderation tracking columns ───────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS bio_violation_count  INT     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bio_cooldown_until   TIMESTAMPTZ;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_bio_violation_count_check;
ALTER TABLE users
  ADD CONSTRAINT users_bio_violation_count_check
    CHECK (bio_violation_count >= 0);


-- ── 2. avatars storage bucket (idempotent) ────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  TRUE,  -- public: avatar URLs displayed to all users
  2097152,  -- 2 MB
  ARRAY['image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public            = TRUE,
      file_size_limit   = 2097152,
      allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp'];


-- ── 3. Storage RLS policies for avatars ──────────────────────────────────────
-- Public read: avatar URLs are shown to all users
DROP POLICY IF EXISTS avatar_select_public ON storage.objects;
CREATE POLICY avatar_select_public
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- Users can only upload into their own folder (path starts with their user ID)
DROP POLICY IF EXISTS avatar_insert_own ON storage.objects;
CREATE POLICY avatar_insert_own
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS avatar_update_own ON storage.objects;
CREATE POLICY avatar_update_own
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS avatar_delete_own ON storage.objects;
CREATE POLICY avatar_delete_own
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
