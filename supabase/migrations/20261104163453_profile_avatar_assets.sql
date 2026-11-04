CREATE SCHEMA IF NOT EXISTS app_private;
GRANT USAGE ON SCHEMA app_private TO service_role;

CREATE TABLE app_private.profile_avatar_assets (
  asset_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Intentionally no users FK: hard deletion must leave a cleanup tombstone,
  -- not cascade away the only record of the Storage object.
  owner_user_id uuid NOT NULL,
  hash_version text NOT NULL CHECK (hash_version = 'avatar_bytes_sha256_v1'),
  digest text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  storage_path text NOT NULL UNIQUE,
  state text NOT NULL CHECK (state IN ('pending', 'active', 'deleting', 'deleted')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_referenced_at timestamptz,
  cleanup_claimed_at timestamptz,
  cleanup_claim_token uuid
);
CREATE UNIQUE INDEX profile_avatar_one_reusable_digest
  ON app_private.profile_avatar_assets(owner_user_id, hash_version, digest)
  WHERE state IN ('pending', 'active', 'deleting');
CREATE INDEX profile_avatar_cleanup_queue
  ON app_private.profile_avatar_assets(created_at, asset_id)
  WHERE state IN ('pending', 'active');
ALTER TABLE app_private.profile_avatar_assets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.profile_avatar_assets FROM PUBLIC, anon, authenticated;
GRANT ALL ON app_private.profile_avatar_assets TO service_role;

CREATE OR REPLACE FUNCTION app_private.find_profile_avatar_asset(p_owner_user_id uuid, p_digest text)
RETURNS TABLE(storage_path text, state text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT a.storage_path,a.state FROM app_private.profile_avatar_assets a
   WHERE a.owner_user_id=p_owner_user_id AND a.hash_version='avatar_bytes_sha256_v1'
     AND a.digest=p_digest AND a.state IN ('pending','active','deleting');
$$;

CREATE OR REPLACE FUNCTION app_private.reserve_profile_avatar_asset(
  p_owner_user_id uuid, p_digest text, p_storage_path text
) RETURNS TABLE(storage_path text, state text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
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

CREATE OR REPLACE FUNCTION app_private.activate_profile_avatar_asset(
  p_owner_user_id uuid, p_digest text, p_storage_path text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_owner_user_id AND u.status = 'active') THEN
    RAISE EXCEPTION 'profile_owner_unavailable';
  END IF;
  UPDATE app_private.profile_avatar_assets a SET state = 'active'
   WHERE a.owner_user_id = p_owner_user_id AND a.digest = p_digest AND a.storage_path = p_storage_path AND a.state = 'pending';
  IF FOUND THEN RETURN true; END IF;
  RETURN EXISTS (SELECT 1 FROM app_private.profile_avatar_assets a WHERE a.owner_user_id = p_owner_user_id
    AND a.digest = p_digest AND a.storage_path = p_storage_path AND a.state = 'active');
END;
$$;

CREATE OR REPLACE FUNCTION app_private.bind_profile_avatar_asset(
  p_owner_user_id uuid, p_digest text, p_storage_path text, p_expected_avatar_url text, p_public_url text
) RETURNS TABLE(changed boolean, avatar_url text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_current_url text;
BEGIN
  SELECT u.avatar_url INTO v_current_url FROM public.users u
    WHERE u.id = p_owner_user_id AND u.status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile_owner_unavailable'; END IF;
  IF v_current_url IS DISTINCT FROM p_expected_avatar_url THEN RAISE EXCEPTION 'avatar_profile_changed'; END IF;
  PERFORM 1 FROM app_private.profile_avatar_assets a WHERE a.owner_user_id = p_owner_user_id
    AND a.digest = p_digest AND a.storage_path = p_storage_path AND a.state = 'active' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'avatar_asset_unavailable';
  END IF;
  IF v_current_url IS NOT DISTINCT FROM p_public_url THEN
    UPDATE app_private.profile_avatar_assets SET last_referenced_at = clock_timestamp()
      WHERE owner_user_id = p_owner_user_id AND storage_path = p_storage_path;
    RETURN QUERY SELECT false, p_public_url;
    RETURN;
  END IF;
  UPDATE public.users SET avatar_url = p_public_url, updated_at = clock_timestamp() WHERE id = p_owner_user_id;
  UPDATE app_private.profile_avatar_assets SET last_referenced_at = clock_timestamp()
    WHERE owner_user_id = p_owner_user_id AND storage_path = p_storage_path;
  RETURN QUERY SELECT true, p_public_url;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.claim_profile_avatar_cleanup(p_limit integer)
RETURNS TABLE(asset_id uuid, storage_path text, claim_token uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_limit < 1 OR p_limit > 100 THEN RAISE EXCEPTION 'invalid_batch_size'; END IF;
  RETURN QUERY
  WITH candidates AS (
    SELECT a.asset_id FROM app_private.profile_avatar_assets a
     WHERE (
         (a.state IN ('pending', 'active')
          AND a.created_at < clock_timestamp() - CASE WHEN a.state = 'pending' THEN interval '2 hours' ELSE interval '7 days' END)
         OR (a.state = 'deleting' AND a.cleanup_claimed_at < clock_timestamp() - interval '15 minutes')
       )
       AND (a.cleanup_claimed_at IS NULL OR a.cleanup_claimed_at < clock_timestamp() - interval '15 minutes')
       AND NOT EXISTS (SELECT 1 FROM public.users u
         WHERE right(coalesce(u.avatar_url, ''), char_length(a.storage_path)) = a.storage_path)
     ORDER BY a.created_at, a.asset_id LIMIT p_limit FOR UPDATE SKIP LOCKED
  )
  UPDATE app_private.profile_avatar_assets a SET state = 'deleting', cleanup_claimed_at = clock_timestamp(),
    cleanup_claim_token = gen_random_uuid()
   FROM candidates c WHERE a.asset_id = c.asset_id RETURNING a.asset_id, a.storage_path, a.cleanup_claim_token;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.finish_profile_avatar_cleanup(p_asset_id uuid, p_claim_token uuid, p_succeeded boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_succeeded THEN
    DELETE FROM app_private.profile_avatar_assets a
     WHERE a.asset_id = p_asset_id AND a.state = 'deleting' AND a.cleanup_claim_token = p_claim_token
       AND NOT EXISTS (SELECT 1 FROM public.users u
         WHERE right(coalesce(u.avatar_url, ''), char_length(a.storage_path)) = a.storage_path);
    RETURN FOUND;
  END IF;
  -- Keep the asset unavailable for rebinding. A failed or late Storage remove
  -- is retried after the lease; restoring active could point at a deleted file.
  RETURN EXISTS (SELECT 1 FROM app_private.profile_avatar_assets a
    WHERE a.asset_id = p_asset_id AND a.state = 'deleting' AND a.cleanup_claim_token = p_claim_token);
END;
$$;

-- PostgREST exposes public, not app_private. These fixed-signature wrappers are
-- callable by service_role only; the manifest itself remains unexposed.
CREATE OR REPLACE FUNCTION public.reserve_profile_avatar_asset(p_owner_user_id uuid, p_digest text, p_storage_path text)
RETURNS TABLE(storage_path text, state text) LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT * FROM app_private.reserve_profile_avatar_asset(p_owner_user_id, p_digest, p_storage_path);
$$;
CREATE OR REPLACE FUNCTION public.find_profile_avatar_asset(p_owner_user_id uuid,p_digest text)
RETURNS TABLE(storage_path text,state text) LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT * FROM app_private.find_profile_avatar_asset(p_owner_user_id,p_digest);
$$;
CREATE OR REPLACE FUNCTION public.activate_profile_avatar_asset(p_owner_user_id uuid, p_digest text, p_storage_path text)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT app_private.activate_profile_avatar_asset(p_owner_user_id, p_digest, p_storage_path);
$$;
CREATE OR REPLACE FUNCTION public.bind_profile_avatar_asset(p_owner_user_id uuid, p_digest text, p_storage_path text, p_expected_avatar_url text, p_public_url text)
RETURNS TABLE(changed boolean, avatar_url text) LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT * FROM app_private.bind_profile_avatar_asset(p_owner_user_id, p_digest, p_storage_path, p_expected_avatar_url, p_public_url);
$$;
CREATE OR REPLACE FUNCTION public.claim_profile_avatar_cleanup(p_limit integer)
RETURNS TABLE(asset_id uuid, storage_path text, claim_token uuid) LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT * FROM app_private.claim_profile_avatar_cleanup(p_limit);
$$;
CREATE OR REPLACE FUNCTION public.finish_profile_avatar_cleanup(p_asset_id uuid, p_claim_token uuid, p_succeeded boolean)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT app_private.finish_profile_avatar_cleanup(p_asset_id, p_claim_token, p_succeeded);
$$;

REVOKE ALL ON FUNCTION app_private.reserve_profile_avatar_asset(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.find_profile_avatar_asset(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.activate_profile_avatar_asset(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.bind_profile_avatar_asset(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.claim_profile_avatar_cleanup(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.finish_profile_avatar_cleanup(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app_private.reserve_profile_avatar_asset(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION app_private.find_profile_avatar_asset(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION app_private.activate_profile_avatar_asset(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION app_private.bind_profile_avatar_asset(uuid, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION app_private.claim_profile_avatar_cleanup(integer) TO service_role;
GRANT EXECUTE ON FUNCTION app_private.finish_profile_avatar_cleanup(uuid, uuid, boolean) TO service_role;
REVOKE ALL ON FUNCTION public.reserve_profile_avatar_asset(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.find_profile_avatar_asset(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activate_profile_avatar_asset(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bind_profile_avatar_asset(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_profile_avatar_cleanup(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_profile_avatar_cleanup(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_profile_avatar_asset(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.find_profile_avatar_asset(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.activate_profile_avatar_asset(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.bind_profile_avatar_asset(uuid, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_profile_avatar_cleanup(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_profile_avatar_cleanup(uuid, uuid, boolean) TO service_role;

NOTIFY pgrst, 'reload schema';
