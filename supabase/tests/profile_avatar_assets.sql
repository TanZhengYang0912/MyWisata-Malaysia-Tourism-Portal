-- Manifest uniqueness, idempotent binding and reference-aware cleanup.
BEGIN;
SET LOCAL statement_timeout = '20s';
SELECT set_config('profile_avatar.owner', gen_random_uuid()::text, true);
INSERT INTO public.users(id,email,full_name,status)
VALUES(current_setting('profile_avatar.owner')::uuid,
  'profile-avatar-'||current_setting('profile_avatar.owner')||'@example.invalid','Avatar Fixture','active');
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
DO $$
DECLARE
  v_owner uuid := current_setting('profile_avatar.owner')::uuid;
  v_digest text := repeat('a',64);
  v_first record;
  v_second record;
  v_bound record;
  v_cleanup_count integer;
  v_orphan record;
  v_stale_claim_token uuid;
BEGIN
  SELECT * INTO v_first FROM public.reserve_profile_avatar_asset(v_owner,v_digest,v_owner::text||'/assets/immutable.png');
  SELECT * INTO v_second FROM public.reserve_profile_avatar_asset(v_owner,v_digest,v_owner::text||'/assets/other.png');
  IF v_first.storage_path IS DISTINCT FROM v_second.storage_path OR v_first.state <> 'pending' THEN
    RAISE EXCEPTION 'same-account digest reservation did not reuse one pending asset';
  END IF;
  IF NOT public.activate_profile_avatar_asset(v_owner,v_digest,v_first.storage_path) THEN
    RAISE EXCEPTION 'pending avatar asset did not activate';
  END IF;
  SELECT * INTO v_bound FROM public.bind_profile_avatar_asset(v_owner,v_digest,v_first.storage_path,NULL,
    'https://example.invalid/storage/v1/object/public/avatars/'||v_first.storage_path);
  IF NOT v_bound.changed THEN RAISE EXCEPTION 'first avatar bind did not change profile'; END IF;
  SELECT * INTO v_bound FROM public.bind_profile_avatar_asset(v_owner,v_digest,v_first.storage_path,v_bound.avatar_url,v_bound.avatar_url);
  IF v_bound.changed THEN RAISE EXCEPTION 'same avatar bind changed profile'; END IF;
  UPDATE app_private.profile_avatar_assets SET created_at=clock_timestamp()-interval '8 days'
    WHERE owner_user_id=v_owner AND digest=v_digest;
  SELECT count(*) INTO v_cleanup_count FROM public.claim_profile_avatar_cleanup(20);
  IF v_cleanup_count <> 0 THEN RAISE EXCEPTION 'cleanup claimed an avatar still referenced by a profile'; END IF;
  SELECT * INTO v_orphan FROM public.reserve_profile_avatar_asset(v_owner,repeat('b',64),v_owner::text||'/assets/orphan.png');
  IF NOT public.activate_profile_avatar_asset(v_owner,repeat('b',64),v_orphan.storage_path) THEN
    RAISE EXCEPTION 'orphan avatar asset did not activate';
  END IF;
  UPDATE app_private.profile_avatar_assets SET created_at=clock_timestamp()-interval '8 days'
   WHERE owner_user_id=v_owner AND digest=repeat('b',64);
  SELECT * INTO v_orphan FROM public.claim_profile_avatar_cleanup(20);
  IF v_orphan.storage_path IS DISTINCT FROM v_owner::text||'/assets/orphan.png' THEN
    RAISE EXCEPTION 'unreferenced avatar asset was not claimed';
  END IF;
  v_stale_claim_token := v_orphan.claim_token;
  UPDATE app_private.profile_avatar_assets SET cleanup_claimed_at=clock_timestamp()-interval '16 minutes'
   WHERE asset_id=v_orphan.asset_id;
  SELECT * INTO v_orphan FROM public.claim_profile_avatar_cleanup(20);
  IF v_orphan.claim_token IS NOT DISTINCT FROM v_stale_claim_token THEN
    RAISE EXCEPTION 'cleanup reclaim did not rotate its claim token';
  END IF;
  IF public.finish_profile_avatar_cleanup(v_orphan.asset_id,v_stale_claim_token,true) THEN
    RAISE EXCEPTION 'stale cleanup claim unexpectedly completed';
  END IF;
  IF NOT public.finish_profile_avatar_cleanup(v_orphan.asset_id,v_orphan.claim_token,false) THEN
    RAISE EXCEPTION 'current failed cleanup claim was not recognized';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM app_private.profile_avatar_assets WHERE asset_id=v_orphan.asset_id AND state='deleting') THEN
    RAISE EXCEPTION 'failed cleanup made the asset bindable again';
  END IF;
  UPDATE app_private.profile_avatar_assets SET cleanup_claimed_at=clock_timestamp()-interval '16 minutes'
   WHERE asset_id=v_orphan.asset_id;
  SELECT * INTO v_orphan FROM public.claim_profile_avatar_cleanup(20);
  IF NOT public.finish_profile_avatar_cleanup(v_orphan.asset_id,v_orphan.claim_token,true) THEN
    RAISE EXCEPTION 'cleaned avatar manifest was not removed';
  END IF;
  IF EXISTS(SELECT 1 FROM app_private.profile_avatar_assets WHERE owner_user_id=v_owner AND digest=repeat('b',64)) THEN
    RAISE EXCEPTION 'cleaned avatar manifest tombstone remains';
  END IF;
END $$;
RESET ROLE;
ROLLBACK;
