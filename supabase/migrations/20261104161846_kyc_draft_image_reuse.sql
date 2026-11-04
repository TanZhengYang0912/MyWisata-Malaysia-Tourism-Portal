ALTER TABLE app_private.kyc_drafts
  ADD COLUMN front_input_sha256 text,
  ADD COLUMN back_input_sha256 text,
  ADD COLUMN front_evidence_sha256 text,
  ADD COLUMN back_evidence_sha256 text,
  ADD COLUMN hash_version text;

ALTER TABLE app_private.kyc_drafts
  ADD CONSTRAINT kyc_drafts_hash_shape CHECK (
    (front_input_sha256 IS NULL OR front_input_sha256 ~ '^[a-f0-9]{64}$') AND
    (back_input_sha256 IS NULL OR back_input_sha256 ~ '^[a-f0-9]{64}$') AND
    (front_evidence_sha256 IS NULL OR front_evidence_sha256 ~ '^[a-f0-9]{64}$') AND
    (back_evidence_sha256 IS NULL OR back_evidence_sha256 ~ '^[a-f0-9]{64}$') AND
    (hash_version IS NULL OR hash_version = 'sha256_v1')
  );

CREATE FUNCTION app_private.save_kyc_draft_v2(
  p_owner_user_id uuid,
  p_draft_id uuid,
  p_expected_version bigint,
  p_document_type text,
  p_holder_name text,
  p_front_storage_path text,
  p_back_storage_path text,
  p_front_input_sha256 text,
  p_back_input_sha256 text,
  p_front_evidence_sha256 text,
  p_back_evidence_sha256 text,
  p_evidence_revision text,
  p_idle_ttl_seconds integer,
  p_absolute_ttl_seconds integer
) RETURNS TABLE(draft_id uuid, version bigint, expires_at timestamptz, changed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,app_private,pg_temp AS $$
DECLARE
  v_draft app_private.kyc_drafts%ROWTYPE;
  v_holder_name text := nullif(btrim(p_holder_name),'');
  v_now timestamptz := clock_timestamp();
  v_retired text[];
BEGIN
  IF auth.role()<>'service_role' OR p_owner_user_id IS NULL OR p_draft_id IS NULL
     OR NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=p_owner_user_id AND u.status='active')
     OR p_document_type NOT IN ('national_id','passport','driving_license')
     OR p_idle_ttl_seconds IS NULL OR p_idle_ttl_seconds<=0
     OR p_absolute_ttl_seconds IS NULL OR p_absolute_ttl_seconds<p_idle_ttl_seconds
     OR p_evidence_revision IS NULL OR p_evidence_revision !~ '^[a-f0-9]{64}$'
     OR p_front_storage_path IS NULL OR p_back_storage_path IS NULL
     OR p_front_storage_path NOT LIKE p_owner_user_id::text||'/drafts/'||p_draft_id::text||'/%'
     OR p_back_storage_path NOT LIKE p_owner_user_id::text||'/drafts/'||p_draft_id::text||'/%'
     OR p_front_input_sha256 IS NOT NULL AND p_front_input_sha256 !~ '^[a-f0-9]{64}$'
     OR p_back_input_sha256 IS NOT NULL AND p_back_input_sha256 !~ '^[a-f0-9]{64}$'
     OR p_front_evidence_sha256 IS NULL OR p_front_evidence_sha256 !~ '^[a-f0-9]{64}$'
     OR p_back_evidence_sha256 IS NULL OR p_back_evidence_sha256 !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'invalid_kyc_draft';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('kyc-draft:'||p_owner_user_id::text,0));

  SELECT * INTO v_draft FROM app_private.kyc_drafts d
   WHERE d.owner_user_id=p_owner_user_id AND d.state='editing' FOR UPDATE;
  IF FOUND THEN
    IF v_draft.id<>p_draft_id OR v_draft.version<>p_expected_version
       OR v_draft.expires_at<=v_now OR v_draft.absolute_expires_at<=v_now THEN
      RAISE EXCEPTION 'kyc_draft_conflict';
    END IF;
    IF v_draft.document_type=p_document_type
       AND v_draft.holder_name IS NOT DISTINCT FROM v_holder_name
       AND v_draft.front_storage_path=p_front_storage_path
       AND v_draft.back_storage_path=p_back_storage_path
       AND v_draft.front_input_sha256 IS NOT DISTINCT FROM p_front_input_sha256
       AND v_draft.back_input_sha256 IS NOT DISTINCT FROM p_back_input_sha256
       AND v_draft.front_evidence_sha256 IS NOT DISTINCT FROM p_front_evidence_sha256
       AND v_draft.back_evidence_sha256 IS NOT DISTINCT FROM p_back_evidence_sha256
       AND v_draft.evidence_revision=p_evidence_revision THEN
      RETURN QUERY SELECT v_draft.id,v_draft.version,v_draft.expires_at,false;
      RETURN;
    END IF;
    v_retired := ARRAY(
      SELECT DISTINCT path FROM unnest(
        v_draft.retired_storage_paths ||
        array_remove(ARRAY[
          CASE WHEN v_draft.front_storage_path IS DISTINCT FROM p_front_storage_path THEN v_draft.front_storage_path END,
          CASE WHEN v_draft.back_storage_path IS DISTINCT FROM p_back_storage_path THEN v_draft.back_storage_path END
        ],NULL)
      ) AS retired(path) WHERE path IS NOT NULL
    );
    UPDATE app_private.kyc_drafts d SET
      document_type=p_document_type, holder_name=v_holder_name,
      front_storage_path=p_front_storage_path,back_storage_path=p_back_storage_path,
      front_input_sha256=p_front_input_sha256,back_input_sha256=p_back_input_sha256,
      front_evidence_sha256=p_front_evidence_sha256,back_evidence_sha256=p_back_evidence_sha256,
      hash_version='sha256_v1',evidence_revision=p_evidence_revision,
      ocr_observation_id=CASE WHEN d.evidence_revision=p_evidence_revision THEN d.ocr_observation_id ELSE NULL END,
      retired_storage_paths=v_retired,version=d.version+1,updated_at=v_now,
      expires_at=least(v_now+make_interval(secs=>p_idle_ttl_seconds),d.absolute_expires_at)
    WHERE d.id=v_draft.id RETURNING d.* INTO v_draft;
  ELSE
    IF p_expected_version IS NOT NULL OR EXISTS(
      SELECT 1 FROM app_private.kyc_drafts d WHERE d.owner_user_id=p_owner_user_id AND d.state='editing'
    ) THEN RAISE EXCEPTION 'kyc_draft_conflict'; END IF;
    INSERT INTO app_private.kyc_drafts(
      id,owner_user_id,state,document_type,holder_name,front_storage_path,back_storage_path,
      front_input_sha256,back_input_sha256,front_evidence_sha256,back_evidence_sha256,hash_version,
      evidence_revision,expires_at,absolute_expires_at
    ) VALUES(
      p_draft_id,p_owner_user_id,'editing',p_document_type,v_holder_name,p_front_storage_path,p_back_storage_path,
      p_front_input_sha256,p_back_input_sha256,p_front_evidence_sha256,p_back_evidence_sha256,'sha256_v1',
      p_evidence_revision,least(v_now+make_interval(secs=>p_idle_ttl_seconds),v_now+make_interval(secs=>p_absolute_ttl_seconds)),
      v_now+make_interval(secs=>p_absolute_ttl_seconds)
    ) RETURNING * INTO v_draft;
  END IF;
  INSERT INTO app_private.kyc_draft_events(draft_id,owner_user_id,event_type,actor_id)
    VALUES(v_draft.id,v_draft.owner_user_id,'saved',p_owner_user_id);
  RETURN QUERY SELECT v_draft.id,v_draft.version,v_draft.expires_at,true;
END;
$$;
REVOKE ALL ON FUNCTION app_private.save_kyc_draft_v2(uuid,uuid,bigint,text,text,text,text,text,text,text,text,text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app_private.save_kyc_draft_v2(uuid,uuid,bigint,text,text,text,text,text,text,text,text,text,integer,integer) TO service_role;

CREATE FUNCTION public.save_kyc_draft_v2(
  p_owner_user_id uuid,p_draft_id uuid,p_expected_version bigint,p_document_type text,p_holder_name text,
  p_front_storage_path text,p_back_storage_path text,p_front_input_sha256 text,p_back_input_sha256 text,
  p_front_evidence_sha256 text,p_back_evidence_sha256 text,p_evidence_revision text,
  p_idle_ttl_seconds integer,p_absolute_ttl_seconds integer
) RETURNS TABLE(draft_id uuid,version bigint,expires_at timestamptz,changed boolean)
LANGUAGE sql SECURITY INVOKER SET search_path=public,app_private,pg_temp AS $$
  SELECT * FROM app_private.save_kyc_draft_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14);
$$;
REVOKE ALL ON FUNCTION public.save_kyc_draft_v2(uuid,uuid,bigint,text,text,text,text,text,text,text,text,text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_kyc_draft_v2(uuid,uuid,bigint,text,text,text,text,text,text,text,text,text,integer,integer) TO service_role;

CREATE FUNCTION app_private.progress_kyc_draft_purge(p_draft_id uuid,p_processed_paths text[])
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,app_private,pg_temp AS $$
DECLARE d app_private.kyc_drafts%ROWTYPE; v_remaining integer;
BEGIN
  IF auth.role()<>'service_role' OR coalesce(cardinality(p_processed_paths),0)>100 THEN RAISE EXCEPTION 'service_role_required'; END IF;
  SELECT * INTO d FROM app_private.kyc_drafts
   WHERE id=p_draft_id AND purge_claimed_until>clock_timestamp() FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF EXISTS(
    SELECT 1 FROM unnest(coalesce(p_processed_paths,'{}'::text[])) processed(path)
    WHERE path IS NOT NULL AND path NOT IN (
      SELECT unnest(array_remove(ARRAY[d.front_storage_path,d.back_storage_path],NULL))
      UNION SELECT unnest(d.retired_storage_paths)
    )
  ) THEN RAISE EXCEPTION 'kyc_draft_purge_path_mismatch'; END IF;
  UPDATE app_private.kyc_drafts SET
    front_storage_path=CASE WHEN front_storage_path=ANY(coalesce(p_processed_paths,'{}'::text[])) THEN NULL ELSE front_storage_path END,
    back_storage_path=CASE WHEN back_storage_path=ANY(coalesce(p_processed_paths,'{}'::text[])) THEN NULL ELSE back_storage_path END,
    retired_storage_paths=ARRAY(SELECT retired.path FROM unnest(retired_storage_paths) AS retired(path)
      WHERE retired.path IS NOT NULL AND NOT(retired.path=ANY(coalesce(p_processed_paths,'{}'::text[])))),
    updated_at=clock_timestamp()
   WHERE id=p_draft_id;
  SELECT cardinality(array_remove(ARRAY[front_storage_path,back_storage_path],NULL))+cardinality(retired_storage_paths)
    INTO v_remaining FROM app_private.kyc_drafts WHERE id=p_draft_id;
  IF coalesce(v_remaining,0)=0 THEN
    DELETE FROM app_private.kyc_ocr_observations WHERE context_kind='draft' AND context_id=p_draft_id;
    DELETE FROM app_private.kyc_drafts WHERE id=p_draft_id;
    RETURN true;
  END IF;
  UPDATE app_private.kyc_drafts SET purge_claimed_until=NULL WHERE id=p_draft_id;
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION app_private.progress_kyc_draft_purge(uuid,text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app_private.progress_kyc_draft_purge(uuid,text[]) TO service_role;
CREATE FUNCTION public.progress_kyc_draft_purge(p_draft_id uuid,p_processed_paths text[])
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path=public,app_private,pg_temp AS $$
  SELECT app_private.progress_kyc_draft_purge($1,$2);
$$;
REVOKE ALL ON FUNCTION public.progress_kyc_draft_purge(uuid,text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.progress_kyc_draft_purge(uuid,text[]) TO service_role;

-- Do not lease an orphan while its exact path is still attached to a live draft.
CREATE OR REPLACE FUNCTION app_private.claim_kyc_draft_cleanup_orphans(p_limit integer,p_lease_seconds integer)
RETURNS TABLE(orphan_id uuid,storage_path text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,app_private,pg_temp AS $$
BEGIN
  IF auth.role()<>'service_role' OR p_limit NOT BETWEEN 1 AND 100 OR p_lease_seconds NOT BETWEEN 1 AND 3600 THEN
    RAISE EXCEPTION 'invalid_draft_purge_budget';
  END IF;
  RETURN QUERY WITH candidates AS (
    SELECT o.id FROM app_private.kyc_draft_cleanup_orphans o
     WHERE o.available_at<=clock_timestamp() AND (o.lease_until IS NULL OR o.lease_until<=clock_timestamp())
       AND NOT EXISTS (
         SELECT 1 FROM app_private.kyc_drafts d
          WHERE d.state='editing' AND o.storage_path IN (d.front_storage_path,d.back_storage_path)
       )
     ORDER BY o.created_at,o.id LIMIT p_limit FOR UPDATE SKIP LOCKED
  )
  UPDATE app_private.kyc_draft_cleanup_orphans o SET attempts=o.attempts+1,
    lease_until=clock_timestamp()+make_interval(secs=>p_lease_seconds)
   FROM candidates c WHERE o.id=c.id RETURNING o.id,o.storage_path;
END; $$;
REVOKE ALL ON FUNCTION app_private.claim_kyc_draft_cleanup_orphans(integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app_private.claim_kyc_draft_cleanup_orphans(integer,integer) TO service_role;
CREATE OR REPLACE FUNCTION public.claim_kyc_draft_cleanup_orphans(p_limit integer,p_lease_seconds integer)
RETURNS TABLE(orphan_id uuid,storage_path text) LANGUAGE sql SECURITY INVOKER SET search_path=public,app_private,pg_temp AS $$
  SELECT * FROM app_private.claim_kyc_draft_cleanup_orphans($1,$2);
$$;
REVOKE ALL ON FUNCTION public.claim_kyc_draft_cleanup_orphans(integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_kyc_draft_cleanup_orphans(integer,integer) TO service_role;
NOTIFY pgrst, 'reload schema';
