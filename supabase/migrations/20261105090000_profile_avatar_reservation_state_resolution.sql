-- Disambiguate the asset table's state column from the TABLE return variable.
CREATE OR REPLACE FUNCTION app_private.reserve_profile_avatar_asset(
  p_owner_user_id uuid, p_digest text, p_storage_path text
) RETURNS TABLE(storage_path text, state text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_column
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_owner_user_id AND u.status = 'active') THEN
    RAISE EXCEPTION 'profile_owner_unavailable';
  END IF;
  INSERT INTO app_private.profile_avatar_assets(owner_user_id, hash_version, digest, storage_path, state)
  VALUES (p_owner_user_id, 'avatar_bytes_sha256_v1', p_digest, p_storage_path, 'pending')
  ON CONFLICT (owner_user_id, hash_version, digest) WHERE state IN ('pending', 'active', 'deleting') DO NOTHING;
  RETURN QUERY SELECT a.storage_path, a.state FROM app_private.profile_avatar_assets a
    WHERE a.owner_user_id = p_owner_user_id AND a.hash_version = 'avatar_bytes_sha256_v1' AND a.digest = p_digest
      AND a.state IN ('pending', 'active', 'deleting') FOR UPDATE;
END;
$$;
