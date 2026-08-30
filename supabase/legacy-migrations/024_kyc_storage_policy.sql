-- ============================================================
-- 024_kyc_storage_policy.sql — RLS policies for kyc-documents bucket
--
-- Storage objects don't inherit RLS from migrations automatically.
-- This migration adds the missing INSERT / UPDATE / SELECT policies
-- so authenticated users can upload their own KYC documents, and
-- admins can read any document for review.
--
-- Bucket is created idempotently in case this runs on a fresh env.
-- ============================================================


-- ── Ensure the bucket exists ─────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'kyc-documents',
  'kyc-documents',
  false,
  5242880,  -- 5 MB
  ARRAY['image/jpeg','image/png','application/pdf']
)
ON CONFLICT (id) DO NOTHING;


-- ── INSERT: authenticated user may upload to their own folder ─────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'storage'
       AND tablename  = 'objects'
       AND policyname = 'kyc_doc_insert_own'
  ) THEN
    CREATE POLICY kyc_doc_insert_own ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'kyc-documents'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;


-- ── UPDATE: needed for upsert=true on re-submission ──────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'storage'
       AND tablename  = 'objects'
       AND policyname = 'kyc_doc_update_own'
  ) THEN
    CREATE POLICY kyc_doc_update_own ON storage.objects
      FOR UPDATE TO authenticated
      USING (
        bucket_id = 'kyc-documents'
        AND (storage.foldername(name))[1] = auth.uid()::text
      )
      WITH CHECK (
        bucket_id = 'kyc-documents'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;


-- ── SELECT: user sees own files; admins see all (for review) ─────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'storage'
       AND tablename  = 'objects'
       AND policyname = 'kyc_doc_select_own_or_admin'
  ) THEN
    CREATE POLICY kyc_doc_select_own_or_admin ON storage.objects
      FOR SELECT TO authenticated
      USING (
        bucket_id = 'kyc-documents'
        AND (
          (storage.foldername(name))[1] = auth.uid()::text
          OR is_admin(auth.uid())
        )
      );
  END IF;
END $$;
