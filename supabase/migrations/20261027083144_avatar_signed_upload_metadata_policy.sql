-- Storage inserts the new object and returns its metadata while signing an
-- upload URL. Allow that SELECT only for the caller's own avatar path, without
-- granting permission to list objects or read other avatar metadata.
CREATE POLICY avatar_signed_upload_metadata_select
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND storage.allow_any_operation(ARRAY['object.sign_upload_url'])
  );
