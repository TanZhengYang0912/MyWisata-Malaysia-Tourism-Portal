-- Private, short-lived KYC draft metadata and atomic pending withdrawal.
-- The TTL is supplied by trusted server configuration; missing/invalid values fail closed.
CREATE TABLE IF NOT EXISTS app_private.kyc_preview_capacity (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false,
  total_concurrency integer,
  formal_reserve integer,
  preview_concurrency integer,
  measurement_ref text,
  updated_by uuid REFERENCES public.users(id),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (NOT enabled OR (total_concurrency > 0 AND formal_reserve > 0 AND preview_concurrency > 0
    AND formal_reserve + preview_concurrency <= total_concurrency AND length(btrim(coalesce(measurement_ref,''))) >= 8))
);
INSERT INTO app_private.kyc_preview_capacity(singleton,enabled) VALUES(true,false) ON CONFLICT(singleton) DO NOTHING;
ALTER TABLE app_private.kyc_preview_capacity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app_private.kyc_preview_capacity FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE app_private.portal_workload_slots DROP CONSTRAINT IF EXISTS portal_workload_slots_scope_check;
ALTER TABLE app_private.portal_workload_slots ADD CONSTRAINT portal_workload_slots_scope_check
  CHECK (scope IN ('kyc_upload','recommendation_upload','trip_ai','kyc_preview'));

CREATE OR REPLACE FUNCTION public.set_kyc_preview_capacity(
  p_enabled boolean,p_total_concurrency integer,p_formal_reserve integer,p_preview_concurrency integer,p_measurement_ref text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public,app_private,pg_temp AS $$
BEGIN
  IF auth.role()<>'authenticated' OR auth.uid() IS NULL OR NOT app_private.is_kyc_review_super_admin() THEN RAISE EXCEPTION 'kyc_capacity_admin_required'; END IF;
  IF p_enabled AND (p_total_concurrency IS NULL OR p_total_concurrency<1 OR p_formal_reserve IS NULL OR p_formal_reserve<1
      OR p_preview_concurrency IS NULL OR p_preview_concurrency<1 OR p_formal_reserve+p_preview_concurrency>p_total_concurrency
      OR length(btrim(coalesce(p_measurement_ref,'')))<8) THEN RAISE EXCEPTION 'kyc_capacity_measurement_required'; END IF;
  UPDATE app_private.kyc_preview_capacity SET enabled=p_enabled,total_concurrency=p_total_concurrency,
    formal_reserve=p_formal_reserve,preview_concurrency=p_preview_concurrency,measurement_ref=nullif(btrim(p_measurement_ref),''),
    updated_by=auth.uid(),updated_at=clock_timestamp() WHERE singleton;
END;
$$;
REVOKE ALL ON FUNCTION public.set_kyc_preview_capacity(boolean,integer,integer,integer,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.set_kyc_preview_capacity(boolean,integer,integer,integer,text) TO authenticated;

CREATE OR REPLACE FUNCTION app_private.claim_portal_workload(p_scope text,p_token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE maximum integer; cap record; active_formal integer; active_preview integer;
BEGIN
  PERFORM app_private.require_kyc_job_service();
  IF p_token IS NULL OR p_scope NOT IN ('kyc_upload','recommendation_upload','trip_ai','kyc_preview') THEN RAISE EXCEPTION 'invalid_workload'; END IF;
  IF p_scope='kyc_preview' THEN
    SELECT * INTO cap FROM app_private.kyc_preview_capacity WHERE singleton AND enabled FOR SHARE;
    IF NOT FOUND THEN RETURN false; END IF;
    maximum:=cap.preview_concurrency;
    PERFORM pg_advisory_xact_lock(hashtextextended('kyc-ocr-capacity',0));
    SELECT count(*) INTO active_formal FROM public.kyc_prescreening_jobs WHERE status='processing' AND lease_expires_at>clock_timestamp();
    SELECT count(*) INTO active_preview FROM app_private.portal_workload_slots WHERE scope='kyc_preview' AND expires_at>clock_timestamp();
    IF active_preview>=maximum OR active_formal+active_preview>=cap.total_concurrency THEN RETURN false; END IF;
  ELSE
    maximum:=CASE p_scope WHEN 'kyc_upload' THEN 1 WHEN 'recommendation_upload' THEN 2 WHEN 'trip_ai' THEN 2 END;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('portal_workload:'||p_scope,0));
  DELETE FROM app_private.portal_workload_slots WHERE scope=p_scope AND expires_at<=clock_timestamp();
  IF (SELECT count(*) FROM app_private.portal_workload_slots WHERE scope=p_scope)>=maximum THEN RETURN false; END IF;
  INSERT INTO app_private.portal_workload_slots(scope,token,expires_at) VALUES(p_scope,p_token,clock_timestamp()+interval '90 seconds');
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION app_private.claim_portal_workload(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app_private.claim_portal_workload(text,uuid) TO service_role;

CREATE OR REPLACE FUNCTION app_private.claim_kyc_prescreening_jobs(p_limit integer,p_lease_seconds integer,p_max_attempts integer,p_max_running integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,app_private,pg_temp AS $$
DECLARE running integer; rows jsonb; cap record; preview_running integer; effective_running integer;
  capacity_enabled boolean := false; v_formal_reserve integer; v_total_capacity integer;
BEGIN
 PERFORM app_private.require_kyc_job_service();
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 20 OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 1 AND 3600
 OR p_max_attempts IS NULL OR p_max_attempts NOT BETWEEN 1 AND 10 OR p_max_running IS NULL OR p_max_running NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'invalid_worker_budget'; END IF;
 SELECT c.enabled,c.formal_reserve,c.total_concurrency INTO capacity_enabled,v_formal_reserve,v_total_capacity
   FROM app_private.kyc_preview_capacity AS c WHERE singleton;
 IF coalesce(capacity_enabled,false) THEN
   PERFORM pg_advisory_xact_lock(hashtextextended('kyc-ocr-capacity',0));
   IF p_max_running>v_formal_reserve THEN RAISE EXCEPTION 'formal_capacity_exceeds_measured_reserve'; END IF;
 END IF;
 UPDATE public.kyc_prescreening_jobs j SET status='cancelled',outcome='manual_review',last_error_code='case_closed',
  lease_token=NULL,lease_expires_at=NULL,finished_at=now(),updated_at=now()
 WHERE status IN ('queued','processing') AND NOT EXISTS(SELECT 1 FROM public.kyc_submissions s WHERE s.id=j.submission_id AND s.status='pending');
 UPDATE public.kyc_prescreening_jobs SET status='failed',outcome='manual_review',last_error_code='attempts_exhausted',
  lease_token=NULL,lease_expires_at=NULL,finished_at=now(),updated_at=now()
 WHERE status IN ('queued','processing') AND attempts>=p_max_attempts AND (lease_expires_at IS NULL OR lease_expires_at<=now());
 SELECT count(*) INTO running FROM public.kyc_prescreening_jobs WHERE status='processing' AND lease_expires_at>now();
 effective_running:=least(p_max_running,coalesce(v_formal_reserve,p_max_running));
 IF coalesce(capacity_enabled,false) THEN
   SELECT count(*) INTO preview_running FROM app_private.portal_workload_slots WHERE scope='kyc_preview' AND expires_at>clock_timestamp();
   effective_running:=least(effective_running,greatest(0,v_total_capacity-preview_running));
 END IF;
 WITH candidates AS (
  SELECT id FROM public.kyc_prescreening_jobs WHERE attempts<p_max_attempts
   AND ((status='queued' AND available_at<=now()) OR (status='processing' AND lease_expires_at<=now()))
   ORDER BY available_at,created_at,id LIMIT least(p_limit,greatest(0,effective_running-running)) FOR UPDATE SKIP LOCKED
 ), claimed AS (
  UPDATE public.kyc_prescreening_jobs j SET status='processing',attempts=j.attempts+1,attempt_limit=p_max_attempts,
   lease_token=gen_random_uuid(),lease_expires_at=now()+make_interval(secs=>p_lease_seconds),updated_at=now()
   FROM candidates c WHERE j.id=c.id RETURNING j.*
 ) SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'submissionId',c.submission_id,'evidenceRevision',c.evidence_revision,
  'leaseToken',c.lease_token,'documentType',s.document_type,'expectedDocumentNumberHmac',CASE WHEN s.ic_hash_version='hmac_sha256_v1' THEN s.ic_hash END,
  'expectedHolderName',s.legal_name_snapshot,
  'documents',(SELECT coalesce(jsonb_agg(jsonb_build_object('side',side,'path',storage_path,'mimeType',mime_type)),'[]'::jsonb)
    FROM public.kyc_submission_documents d WHERE d.submission_id=c.submission_id AND purge_claimed_at IS NULL))), '[]'::jsonb)
 INTO rows FROM claimed c JOIN public.kyc_submissions s ON s.id=c.submission_id;
 RETURN rows;
END; $$;
REVOKE ALL ON FUNCTION app_private.claim_kyc_prescreening_jobs(integer,integer,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app_private.claim_kyc_prescreening_jobs(integer,integer,integer,integer) TO service_role;

CREATE TABLE IF NOT EXISTS app_private.kyc_draft_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id uuid NOT NULL,
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('saved','read','document_read','deleted','expired','purge_failed','submitted','ocr_preview')),
  actor_id uuid,
  side text CHECK (side IS NULL OR side IN ('front','back')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE app_private.kyc_draft_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app_private.kyc_draft_events FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE app_private.kyc_draft_cleanup_orphans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  storage_path text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  lease_until timestamptz
);
ALTER TABLE app_private.kyc_draft_cleanup_orphans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app_private.kyc_draft_cleanup_orphans FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION app_private.record_kyc_draft_cleanup_orphan(p_owner_user_id uuid,p_storage_path text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,app_private,pg_temp AS $$
BEGIN
  IF auth.role()<>'service_role' OR p_owner_user_id IS NULL OR p_storage_path NOT LIKE p_owner_user_id::text||'/drafts/%' THEN
    RAISE EXCEPTION 'invalid_draft_cleanup_orphan'; END IF;
  INSERT INTO app_private.kyc_draft_cleanup_orphans(owner_user_id,storage_path) VALUES(p_owner_user_id,p_storage_path)
    ON CONFLICT(storage_path) DO NOTHING;
END; $$;
REVOKE ALL ON FUNCTION app_private.record_kyc_draft_cleanup_orphan(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app_private.record_kyc_draft_cleanup_orphan(uuid,text) TO service_role;
CREATE FUNCTION public.record_kyc_draft_cleanup_orphan(p_owner_user_id uuid,p_storage_path text)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path=public,app_private,pg_temp AS $$ SELECT app_private.record_kyc_draft_cleanup_orphan($1,$2); $$;
REVOKE ALL ON FUNCTION public.record_kyc_draft_cleanup_orphan(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_kyc_draft_cleanup_orphan(uuid,text) TO service_role;

CREATE FUNCTION app_private.claim_kyc_draft_cleanup_orphans(p_limit integer,p_lease_seconds integer)
RETURNS TABLE(orphan_id uuid,storage_path text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,app_private,pg_temp AS $$
BEGIN
  IF auth.role()<>'service_role' OR p_limit NOT BETWEEN 1 AND 100 OR p_lease_seconds NOT BETWEEN 1 AND 3600 THEN RAISE EXCEPTION 'invalid_draft_purge_budget'; END IF;
  RETURN QUERY WITH candidates AS (
    SELECT o.id FROM app_private.kyc_draft_cleanup_orphans o WHERE o.available_at<=clock_timestamp()
      AND (o.lease_until IS NULL OR o.lease_until<=clock_timestamp()) ORDER BY o.created_at,o.id LIMIT p_limit FOR UPDATE SKIP LOCKED
  ) UPDATE app_private.kyc_draft_cleanup_orphans o SET attempts=o.attempts+1,lease_until=clock_timestamp()+make_interval(secs=>p_lease_seconds)
    FROM candidates c WHERE o.id=c.id RETURNING o.id,o.storage_path;
END; $$;
REVOKE ALL ON FUNCTION app_private.claim_kyc_draft_cleanup_orphans(integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app_private.claim_kyc_draft_cleanup_orphans(integer,integer) TO service_role;
CREATE FUNCTION public.claim_kyc_draft_cleanup_orphans(p_limit integer,p_lease_seconds integer)
RETURNS TABLE(orphan_id uuid,storage_path text) LANGUAGE sql SECURITY INVOKER SET search_path=public,app_private,pg_temp AS $$ SELECT * FROM app_private.claim_kyc_draft_cleanup_orphans($1,$2); $$;
REVOKE ALL ON FUNCTION public.claim_kyc_draft_cleanup_orphans(integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_kyc_draft_cleanup_orphans(integer,integer) TO service_role;

CREATE FUNCTION app_private.finish_kyc_draft_cleanup_orphan(p_orphan_id uuid,p_succeeded boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,app_private,pg_temp AS $$
DECLARE v_attempts integer;
BEGIN
  IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
  SELECT attempts INTO v_attempts FROM app_private.kyc_draft_cleanup_orphans WHERE id=p_orphan_id AND lease_until>clock_timestamp() FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_succeeded THEN DELETE FROM app_private.kyc_draft_cleanup_orphans WHERE id=p_orphan_id; RETURN true; END IF;
  UPDATE app_private.kyc_draft_cleanup_orphans SET lease_until=NULL,available_at=clock_timestamp()+make_interval(secs=>least(86400,30*(2^least(v_attempts,10))::integer)) WHERE id=p_orphan_id;
  RETURN false;
END; $$;
REVOKE ALL ON FUNCTION app_private.finish_kyc_draft_cleanup_orphan(uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app_private.finish_kyc_draft_cleanup_orphan(uuid,boolean) TO service_role;
CREATE FUNCTION public.finish_kyc_draft_cleanup_orphan(p_orphan_id uuid,p_succeeded boolean)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path=public,app_private,pg_temp AS $$ SELECT app_private.finish_kyc_draft_cleanup_orphan($1,$2); $$;
REVOKE ALL ON FUNCTION public.finish_kyc_draft_cleanup_orphan(uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_kyc_draft_cleanup_orphan(uuid,boolean) TO service_role;

ALTER TABLE public.kyc_review_events DROP CONSTRAINT IF EXISTS kyc_review_events_action_check;
ALTER TABLE public.kyc_review_events ADD CONSTRAINT kyc_review_events_action_check
  CHECK (action IN ('approve', 'reject', 'request_info', 'withdraw'));

CREATE TABLE IF NOT EXISTS app_private.kyc_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  state text NOT NULL CHECK (state IN ('editing', 'submitted', 'expired', 'deleted')),
  document_type text NOT NULL CHECK (document_type IN ('national_id', 'passport', 'driving_license')),
  holder_name text,
  front_storage_path text,
  back_storage_path text,
  retired_storage_paths text[] NOT NULL DEFAULT '{}',
  evidence_revision text NOT NULL,
  ocr_observation_id uuid REFERENCES app_private.kyc_ocr_observations(id) ON DELETE SET NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  deleted_at timestamptz,
  purge_claimed_until timestamptz,
  CHECK (front_storage_path IS NULL OR front_storage_path LIKE owner_user_id::text || '/drafts/' || id::text || '/%'),
  CHECK (back_storage_path IS NULL OR back_storage_path LIKE owner_user_id::text || '/drafts/' || id::text || '/%')
);
CREATE UNIQUE INDEX IF NOT EXISTS kyc_one_editing_draft_per_user
  ON app_private.kyc_drafts(owner_user_id) WHERE state = 'editing';
CREATE INDEX IF NOT EXISTS kyc_drafts_expiry_idx ON app_private.kyc_drafts(expires_at) WHERE state = 'editing';
ALTER TABLE app_private.kyc_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app_private.kyc_drafts FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION app_private.delete_kyc_draft_after_account_close()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,app_private,pg_temp AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM 'deleted' AND NEW.status='deleted' THEN
    UPDATE app_private.kyc_drafts SET state='deleted',deleted_at=clock_timestamp(),updated_at=clock_timestamp()
      WHERE owner_user_id=NEW.id AND state='editing';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION app_private.delete_kyc_draft_after_account_close() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER delete_kyc_draft_after_account_close
AFTER UPDATE OF status ON public.users FOR EACH ROW
EXECUTE FUNCTION app_private.delete_kyc_draft_after_account_close();

CREATE OR REPLACE FUNCTION public.get_kyc_document_view_v2(p_submission_id uuid, p_side text, p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app_private, pg_temp AS $$
DECLARE v_path text; v_audit_id uuid;
BEGIN
  IF auth.role() <> 'service_role' OR NOT public.can_review_kyc(p_actor_id) THEN RAISE EXCEPTION 'admin_required'; END IF;
  IF p_side NOT IN ('front','back') THEN RAISE EXCEPTION 'invalid_document_side'; END IF;
  SELECT storage_path INTO v_path FROM public.kyc_submission_documents
    WHERE submission_id = p_submission_id AND side = p_side AND purge_claimed_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'document_not_found'; END IF;
  INSERT INTO public.audit_logs(actor_id,action,entity_type,entity_id,after_data)
    VALUES(p_actor_id,'kyc.document_viewed','kyc_submission',p_submission_id,
      jsonb_build_object('submission_id',p_submission_id,'side',p_side,
        'evidence_revision',app_private.kyc_evidence_revision(p_submission_id)))
    RETURNING id INTO v_audit_id;
  PERFORM app_private.check_kyc_document_access(p_actor_id);
  RETURN jsonb_build_object('storage_path',v_path,'access_id',v_audit_id);
END;
$$;
REVOKE ALL ON FUNCTION public.get_kyc_document_view_v2(uuid,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_kyc_document_view_v2(uuid,text,uuid) TO service_role;

CREATE OR REPLACE FUNCTION app_private.save_kyc_draft(
  p_owner_user_id uuid, p_draft_id uuid, p_expected_version bigint,
  p_document_type text, p_holder_name text, p_front_storage_path text,
  p_back_storage_path text, p_evidence_revision text, p_idle_ttl_seconds integer,
  p_absolute_ttl_seconds integer, p_ocr_holder_name text, p_ocr_number_hmac text,
  p_ocr_last4 text, p_ocr_status text, p_ocr_engine text
) RETURNS TABLE(draft_id uuid, version bigint, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app_private, pg_temp AS $$
DECLARE v_draft app_private.kyc_drafts%ROWTYPE; v_now timestamptz := clock_timestamp(); v_observation uuid;
BEGIN
  IF auth.role() <> 'service_role' OR p_owner_user_id IS NULL OR p_draft_id IS NULL
     OR p_idle_ttl_seconds IS NULL OR p_idle_ttl_seconds <= 0
     OR p_absolute_ttl_seconds IS NULL OR p_absolute_ttl_seconds < p_idle_ttl_seconds
     OR p_document_type NOT IN ('national_id', 'passport', 'driving_license')
     OR p_evidence_revision IS NULL OR length(p_evidence_revision) > 160
     OR p_front_storage_path IS NOT NULL AND p_front_storage_path NOT LIKE p_owner_user_id::text || '/drafts/' || p_draft_id::text || '/%'
     OR p_back_storage_path IS NOT NULL AND p_back_storage_path NOT LIKE p_owner_user_id::text || '/drafts/' || p_draft_id::text || '/%'
     OR p_ocr_status IS NOT NULL AND p_ocr_status NOT IN ('extracted','matched','mismatch','unreadable','unavailable')
     OR p_ocr_number_hmac IS NOT NULL AND p_ocr_number_hmac !~ '^[a-f0-9]{64}$'
     OR p_ocr_last4 IS NOT NULL AND p_ocr_last4 !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'invalid_kyc_draft';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('kyc-draft:' || p_owner_user_id::text, 0));
  WITH expired AS (
    UPDATE app_private.kyc_drafts AS d SET state='expired',updated_at=v_now
      WHERE d.owner_user_id=p_owner_user_id AND d.state='editing' AND (d.expires_at <= v_now OR d.absolute_expires_at <= v_now)
      RETURNING d.id,d.owner_user_id
  )
  INSERT INTO app_private.kyc_draft_events(draft_id,owner_user_id,event_type,actor_id)
    SELECT id,owner_user_id,'expired',p_owner_user_id FROM expired;
  IF p_ocr_status IS NOT NULL THEN
    INSERT INTO app_private.kyc_ocr_observations(context_kind,context_id,evidence_revision,attempt,engine,holder_name,
      document_number_hmac,hash_version,document_number_last4,status)
    SELECT 'draft',p_draft_id,p_evidence_revision,coalesce(max(attempt),0)+1,coalesce(p_ocr_engine,'unknown'),
      nullif(btrim(p_ocr_holder_name),''),p_ocr_number_hmac,CASE WHEN p_ocr_number_hmac IS NULL THEN NULL ELSE 'hmac_sha256_v1' END,
      p_ocr_last4,p_ocr_status
    FROM app_private.kyc_ocr_observations WHERE context_kind='draft' AND context_id=p_draft_id AND evidence_revision=p_evidence_revision
    RETURNING id INTO v_observation;
  END IF;
  IF p_expected_version IS NULL THEN
    IF EXISTS(SELECT 1 FROM app_private.kyc_drafts WHERE owner_user_id=p_owner_user_id AND state='editing') THEN
      RAISE EXCEPTION 'kyc_draft_conflict';
    END IF;
    INSERT INTO app_private.kyc_drafts(id, owner_user_id, state, document_type, holder_name,
      front_storage_path, back_storage_path, evidence_revision, ocr_observation_id, expires_at, absolute_expires_at)
    VALUES (p_draft_id, p_owner_user_id, 'editing', p_document_type, nullif(btrim(p_holder_name),''),
      p_front_storage_path, p_back_storage_path, p_evidence_revision, v_observation,
      least(v_now + make_interval(secs => p_idle_ttl_seconds),v_now + make_interval(secs => p_absolute_ttl_seconds)),
      v_now + make_interval(secs => p_absolute_ttl_seconds))
    RETURNING * INTO v_draft;
  ELSE
    UPDATE app_private.kyc_drafts AS d SET document_type = p_document_type,
      holder_name = nullif(btrim(p_holder_name),''), front_storage_path = p_front_storage_path,
      back_storage_path = p_back_storage_path, evidence_revision = p_evidence_revision,
      ocr_observation_id = CASE WHEN d.evidence_revision=p_evidence_revision THEN coalesce(v_observation,d.ocr_observation_id) ELSE v_observation END,
      retired_storage_paths = d.retired_storage_paths || array_remove(ARRAY[d.front_storage_path,d.back_storage_path],NULL),
      version = d.version + 1, updated_at = v_now,
      expires_at = least(v_now + make_interval(secs => p_idle_ttl_seconds),d.absolute_expires_at)
    WHERE d.id = p_draft_id AND d.owner_user_id = p_owner_user_id AND d.state = 'editing'
      AND d.version = p_expected_version AND d.expires_at > v_now AND d.absolute_expires_at > v_now
    RETURNING d.* INTO v_draft;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'kyc_draft_conflict'; END IF;
  INSERT INTO app_private.kyc_draft_events(draft_id,owner_user_id,event_type,actor_id)
    VALUES(v_draft.id,v_draft.owner_user_id,'saved',p_owner_user_id);
  RETURN QUERY SELECT v_draft.id, v_draft.version, v_draft.expires_at;
END;
$$;
REVOKE ALL ON FUNCTION app_private.save_kyc_draft(uuid,uuid,bigint,text,text,text,text,text,integer,integer,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app_private.save_kyc_draft(uuid,uuid,bigint,text,text,text,text,text,integer,integer,text,text,text,text,text) TO service_role;

CREATE OR REPLACE FUNCTION app_private.get_kyc_draft(p_owner_user_id uuid)
RETURNS SETOF app_private.kyc_drafts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app_private, pg_temp AS $$
BEGIN
  IF auth.role() <> 'service_role' OR p_owner_user_id IS NULL THEN RAISE EXCEPTION 'service_role_required'; END IF;
  WITH expired AS (
    UPDATE app_private.kyc_drafts SET state='expired',updated_at=clock_timestamp()
      WHERE owner_user_id=p_owner_user_id AND state='editing'
        AND (expires_at <= clock_timestamp() OR absolute_expires_at <= clock_timestamp())
      RETURNING id,owner_user_id
  ) INSERT INTO app_private.kyc_draft_events(draft_id,owner_user_id,event_type,actor_id)
      SELECT id,owner_user_id,'expired',p_owner_user_id FROM expired;
  RETURN QUERY SELECT d.* FROM app_private.kyc_drafts d WHERE d.owner_user_id=p_owner_user_id
    AND d.state='editing' AND d.expires_at > clock_timestamp() AND d.absolute_expires_at > clock_timestamp()
    ORDER BY d.updated_at DESC LIMIT 1;
  INSERT INTO app_private.kyc_draft_events(draft_id,owner_user_id,event_type,actor_id)
    SELECT id,owner_user_id,'read',p_owner_user_id FROM app_private.kyc_drafts
    WHERE owner_user_id=p_owner_user_id AND state='editing' AND expires_at>clock_timestamp();
END;
$$;
REVOKE ALL ON FUNCTION app_private.get_kyc_draft(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app_private.get_kyc_draft(uuid) TO service_role;

CREATE FUNCTION public.save_kyc_draft(
  p_owner_user_id uuid, p_draft_id uuid, p_expected_version bigint,
  p_document_type text, p_holder_name text, p_front_storage_path text, p_back_storage_path text,
  p_evidence_revision text, p_idle_ttl_seconds integer, p_absolute_ttl_seconds integer,
  p_ocr_holder_name text, p_ocr_number_hmac text, p_ocr_last4 text, p_ocr_status text, p_ocr_engine text
) RETURNS TABLE(draft_id uuid, version bigint, expires_at timestamptz)
LANGUAGE sql SECURITY INVOKER SET search_path = public, app_private, pg_temp AS $$
  SELECT * FROM app_private.save_kyc_draft($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15);
$$;
CREATE FUNCTION public.get_kyc_draft(p_owner_user_id uuid) RETURNS SETOF app_private.kyc_drafts
LANGUAGE sql SECURITY INVOKER SET search_path = public, app_private, pg_temp AS $$ SELECT * FROM app_private.get_kyc_draft($1); $$;
REVOKE ALL ON FUNCTION public.save_kyc_draft(uuid,uuid,bigint,text,text,text,text,text,integer,integer,text,text,text,text,text), public.get_kyc_draft(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_kyc_draft(uuid,uuid,bigint,text,text,text,text,text,integer,integer,text,text,text,text,text), public.get_kyc_draft(uuid) TO service_role;

CREATE FUNCTION app_private.record_kyc_draft_ocr_observation(
  p_owner_user_id uuid,p_draft_id uuid,p_evidence_revision text,p_engine text,p_holder_name text,
  p_document_number_hmac text,p_document_number_last4 text,p_status text,p_confidence numeric,p_failure_code text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,app_private,pg_temp AS $$
DECLARE v_attempt integer; v_id uuid;
BEGIN
  IF auth.role()<>'service_role' OR p_owner_user_id IS NULL OR p_draft_id IS NULL
    OR p_evidence_revision IS NULL OR p_status NOT IN ('extracted','unreadable','unavailable')
    OR p_document_number_hmac IS NOT NULL AND p_document_number_hmac !~ '^[a-f0-9]{64}$'
    OR p_document_number_last4 IS NOT NULL AND p_document_number_last4 !~ '^[A-Z0-9]{4}$'
    OR p_confidence IS NOT NULL AND p_confidence NOT BETWEEN 0 AND 1 THEN RAISE EXCEPTION 'invalid_ocr_observation'; END IF;
  PERFORM 1 FROM app_private.kyc_drafts WHERE id=p_draft_id AND owner_user_id=p_owner_user_id
    AND state='editing' AND evidence_revision=p_evidence_revision AND expires_at>clock_timestamp() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'kyc_draft_revision_conflict'; END IF;
  SELECT coalesce(max(attempt),0)+1 INTO v_attempt FROM app_private.kyc_ocr_observations
    WHERE context_kind='draft' AND context_id=p_draft_id AND evidence_revision=p_evidence_revision;
  INSERT INTO app_private.kyc_ocr_observations(context_kind,context_id,evidence_revision,attempt,engine,holder_name,
    document_number_hmac,hash_version,document_number_last4,status,confidence,failure_code)
  VALUES('draft',p_draft_id,p_evidence_revision,v_attempt,left(coalesce(p_engine,'unknown'),100),nullif(btrim(p_holder_name),''),
    p_document_number_hmac,CASE WHEN p_document_number_hmac IS NULL THEN NULL ELSE 'hmac_sha256_v1' END,
    p_document_number_last4,p_status,p_confidence,left(p_failure_code,80)) RETURNING id INTO v_id;
  UPDATE app_private.kyc_drafts SET ocr_observation_id=v_id,updated_at=clock_timestamp() WHERE id=p_draft_id;
  INSERT INTO app_private.kyc_draft_events(draft_id,owner_user_id,event_type,actor_id)
    VALUES(p_draft_id,p_owner_user_id,'ocr_preview',p_owner_user_id);
  RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION app_private.record_kyc_draft_ocr_observation(uuid,uuid,text,text,text,text,text,text,numeric,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app_private.record_kyc_draft_ocr_observation(uuid,uuid,text,text,text,text,text,text,numeric,text) TO service_role;
CREATE FUNCTION public.record_kyc_draft_ocr_observation(
  p_owner_user_id uuid,p_draft_id uuid,p_evidence_revision text,p_engine text,p_holder_name text,
  p_document_number_hmac text,p_document_number_last4 text,p_status text,p_confidence numeric,p_failure_code text
) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path=public,app_private,pg_temp AS $$
  SELECT app_private.record_kyc_draft_ocr_observation($1,$2,$3,$4,$5,$6,$7,$8,$9,$10);
$$;
REVOKE ALL ON FUNCTION public.record_kyc_draft_ocr_observation(uuid,uuid,text,text,text,text,text,text,numeric,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_kyc_draft_ocr_observation(uuid,uuid,text,text,text,text,text,text,numeric,text) TO service_role;

CREATE FUNCTION app_private.link_kyc_ocr_observation(p_owner_user_id uuid,p_draft_id uuid,p_submission_id uuid,p_evidence_revision text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,app_private,pg_temp AS $$
DECLARE v_source app_private.kyc_ocr_observations%ROWTYPE; v_attempt integer; v_id uuid;
BEGIN
  IF auth.role()<>'service_role' OR NOT EXISTS(SELECT 1 FROM public.kyc_submissions WHERE id=p_submission_id AND user_id=p_owner_user_id AND status='pending') THEN
    RAISE EXCEPTION 'invalid_ocr_observation_link'; END IF;
  SELECT * INTO v_source FROM app_private.kyc_ocr_observations WHERE context_kind='draft' AND context_id=p_draft_id
    AND evidence_revision=p_evidence_revision ORDER BY attempt DESC LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT coalesce(max(attempt),0)+1 INTO v_attempt FROM app_private.kyc_ocr_observations
    WHERE context_kind='submission' AND context_id=p_submission_id AND evidence_revision=p_evidence_revision;
  INSERT INTO app_private.kyc_ocr_observations(context_kind,context_id,evidence_revision,attempt,engine,holder_name,
    document_number_hmac,hash_version,document_number_last4,actual_document_type,issuer_country,status,confidence,failure_code)
  VALUES('submission',p_submission_id,p_evidence_revision,v_attempt,v_source.engine,v_source.holder_name,v_source.document_number_hmac,
    v_source.hash_version,v_source.document_number_last4,v_source.actual_document_type,v_source.issuer_country,v_source.status,v_source.confidence,v_source.failure_code)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION app_private.link_kyc_ocr_observation(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app_private.link_kyc_ocr_observation(uuid,uuid,uuid,text) TO service_role;
CREATE FUNCTION public.link_kyc_ocr_observation(p_owner_user_id uuid,p_draft_id uuid,p_submission_id uuid,p_evidence_revision text)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path=public,app_private,pg_temp AS $$
  SELECT app_private.link_kyc_ocr_observation($1,$2,$3,$4);
$$;
REVOKE ALL ON FUNCTION public.link_kyc_ocr_observation(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.link_kyc_ocr_observation(uuid,uuid,uuid,text) TO service_role;

CREATE FUNCTION app_private.get_kyc_draft_document(p_owner_user_id uuid,p_draft_id uuid,p_side text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app_private, pg_temp AS $$
DECLARE v_path text;
BEGIN
  IF auth.role()<>'service_role' OR p_side NOT IN ('front','back') THEN RAISE EXCEPTION 'service_role_required'; END IF;
  SELECT CASE p_side WHEN 'front' THEN front_storage_path ELSE back_storage_path END INTO v_path
    FROM app_private.kyc_drafts WHERE id=p_draft_id AND owner_user_id=p_owner_user_id AND state='editing'
      AND expires_at>clock_timestamp() AND absolute_expires_at>clock_timestamp();
  IF v_path IS NULL THEN RAISE EXCEPTION 'kyc_draft_document_unavailable'; END IF;
  INSERT INTO app_private.kyc_draft_events(draft_id,owner_user_id,event_type,actor_id,side)
    VALUES(p_draft_id,p_owner_user_id,'document_read',p_owner_user_id,p_side);
  RETURN v_path;
END;
$$;
REVOKE ALL ON FUNCTION app_private.get_kyc_draft_document(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app_private.get_kyc_draft_document(uuid,uuid,text) TO service_role;
CREATE FUNCTION public.get_kyc_draft_document(p_owner_user_id uuid,p_draft_id uuid,p_side text)
RETURNS text LANGUAGE sql SECURITY INVOKER SET search_path = public,app_private,pg_temp AS $$ SELECT app_private.get_kyc_draft_document($1,$2,$3); $$;
REVOKE ALL ON FUNCTION public.get_kyc_draft_document(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_kyc_draft_document(uuid,uuid,text) TO service_role;

CREATE FUNCTION app_private.delete_kyc_draft(p_owner_user_id uuid,p_draft_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public,app_private,pg_temp AS $$
DECLARE v_count integer;
BEGIN
  IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
  UPDATE app_private.kyc_drafts SET state='deleted',deleted_at=clock_timestamp(),updated_at=clock_timestamp()
    WHERE id=p_draft_id AND owner_user_id=p_owner_user_id AND state='editing';
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count=1 THEN INSERT INTO app_private.kyc_draft_events(draft_id,owner_user_id,event_type,actor_id)
      VALUES(p_draft_id,p_owner_user_id,'deleted',p_owner_user_id); END IF;
  RETURN v_count=1;
END;
$$;
REVOKE ALL ON FUNCTION app_private.delete_kyc_draft(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app_private.delete_kyc_draft(uuid,uuid) TO service_role;
CREATE FUNCTION public.delete_kyc_draft(p_owner_user_id uuid,p_draft_id uuid)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path = public,app_private,pg_temp AS $$ SELECT app_private.delete_kyc_draft($1,$2); $$;
REVOKE ALL ON FUNCTION public.delete_kyc_draft(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delete_kyc_draft(uuid,uuid) TO service_role;

CREATE FUNCTION app_private.mark_kyc_draft_submitted(p_owner_user_id uuid,p_draft_id uuid,p_submission_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public,app_private,pg_temp AS $$
DECLARE v_count integer;
BEGIN
  IF auth.role()<>'service_role' OR NOT EXISTS(SELECT 1 FROM public.kyc_submissions WHERE id=p_submission_id AND user_id=p_owner_user_id)
    THEN RAISE EXCEPTION 'invalid_kyc_draft_submission'; END IF;
  UPDATE app_private.kyc_drafts SET state='submitted',updated_at=clock_timestamp()
    WHERE id=p_draft_id AND owner_user_id=p_owner_user_id AND state='editing';
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count=1 THEN INSERT INTO app_private.kyc_draft_events(draft_id,owner_user_id,event_type,actor_id)
      VALUES(p_draft_id,p_owner_user_id,'submitted',p_owner_user_id); END IF;
  RETURN v_count=1;
END;
$$;
REVOKE ALL ON FUNCTION app_private.mark_kyc_draft_submitted(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app_private.mark_kyc_draft_submitted(uuid,uuid,uuid) TO service_role;
CREATE FUNCTION public.mark_kyc_draft_submitted(p_owner_user_id uuid,p_draft_id uuid,p_submission_id uuid)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path = public,app_private,pg_temp AS $$ SELECT app_private.mark_kyc_draft_submitted($1,$2,$3); $$;
REVOKE ALL ON FUNCTION public.mark_kyc_draft_submitted(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mark_kyc_draft_submitted(uuid,uuid,uuid) TO service_role;

CREATE FUNCTION app_private.claim_kyc_draft_purge(p_limit integer,p_lease_seconds integer)
RETURNS TABLE(draft_id uuid,owner_user_id uuid,front_storage_path text,back_storage_path text,retired_storage_paths text[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public,app_private,pg_temp AS $$
BEGIN
  IF auth.role()<>'service_role' OR p_limit NOT BETWEEN 1 AND 100 OR p_lease_seconds NOT BETWEEN 1 AND 3600 THEN RAISE EXCEPTION 'invalid_draft_purge_budget'; END IF;
  RETURN QUERY WITH candidates AS (
    SELECT d.id FROM app_private.kyc_drafts d
    WHERE (d.state IN ('deleted','submitted','expired') OR d.state='editing' AND (d.expires_at<=clock_timestamp() OR d.absolute_expires_at<=clock_timestamp()))
      AND (d.purge_claimed_until IS NULL OR d.purge_claimed_until<=clock_timestamp())
    ORDER BY d.updated_at,d.id LIMIT p_limit FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE app_private.kyc_drafts d SET state=CASE WHEN d.state='editing' THEN 'expired' ELSE d.state END,
      purge_claimed_until=clock_timestamp()+make_interval(secs=>p_lease_seconds),updated_at=clock_timestamp()
    FROM candidates c WHERE d.id=c.id RETURNING d.*
  ) SELECT c.id,c.owner_user_id,c.front_storage_path,c.back_storage_path,c.retired_storage_paths FROM claimed c;
END;
$$;
REVOKE ALL ON FUNCTION app_private.claim_kyc_draft_purge(integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app_private.claim_kyc_draft_purge(integer,integer) TO service_role;
CREATE FUNCTION public.claim_kyc_draft_purge(p_limit integer,p_lease_seconds integer)
RETURNS TABLE(draft_id uuid,owner_user_id uuid,front_storage_path text,back_storage_path text,retired_storage_paths text[])
LANGUAGE sql SECURITY INVOKER SET search_path = public,app_private,pg_temp AS $$ SELECT * FROM app_private.claim_kyc_draft_purge($1,$2); $$;
REVOKE ALL ON FUNCTION public.claim_kyc_draft_purge(integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_kyc_draft_purge(integer,integer) TO service_role;

CREATE FUNCTION app_private.finish_kyc_draft_purge(p_draft_id uuid,p_succeeded boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public,app_private,pg_temp AS $$
DECLARE d app_private.kyc_drafts%ROWTYPE;
BEGIN
  IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
  SELECT * INTO d FROM app_private.kyc_drafts WHERE id=p_draft_id AND purge_claimed_until>clock_timestamp() FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_succeeded THEN
    DELETE FROM app_private.kyc_ocr_observations WHERE context_kind='draft' AND context_id=d.id;
    DELETE FROM app_private.kyc_drafts WHERE id=d.id; RETURN true;
  END IF;
  UPDATE app_private.kyc_drafts SET purge_claimed_until=NULL,updated_at=clock_timestamp() WHERE id=d.id;
  INSERT INTO app_private.kyc_draft_events(draft_id,owner_user_id,event_type) VALUES(d.id,d.owner_user_id,'purge_failed');
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION app_private.finish_kyc_draft_purge(uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app_private.finish_kyc_draft_purge(uuid,boolean) TO service_role;
CREATE FUNCTION public.finish_kyc_draft_purge(p_draft_id uuid,p_succeeded boolean)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path = public,app_private,pg_temp AS $$ SELECT app_private.finish_kyc_draft_purge($1,$2); $$;
REVOKE ALL ON FUNCTION public.finish_kyc_draft_purge(uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_kyc_draft_purge(uuid,boolean) TO service_role;

CREATE OR REPLACE FUNCTION app_private.withdraw_kyc_submission(
  p_submission_id uuid, p_expected_version bigint, p_operation_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app_private, auth, pg_temp AS $$
DECLARE v_case public.kyc_submissions%ROWTYPE; v_operation app_private.kyc_operations%ROWTYPE;
  v_user_id uuid := auth.uid(); v_fingerprint text;
BEGIN
  IF auth.role() <> 'authenticated' OR v_user_id IS NULL OR p_operation_id IS NULL
     OR p_submission_id IS NULL OR p_expected_version IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  v_fingerprint := encode(extensions.digest(convert_to(concat_ws(':', p_submission_id, v_user_id, p_expected_version, 'withdraw'), 'UTF8'), 'sha256'), 'hex');
  PERFORM 1 FROM public.users WHERE id = v_user_id FOR UPDATE;
  INSERT INTO app_private.kyc_operations(id, owner_user_id, kind, request_fingerprint, submission_id, expected_version, state)
  VALUES (p_operation_id, v_user_id, 'withdraw', v_fingerprint, p_submission_id, p_expected_version, 'processing')
  ON CONFLICT (id) DO NOTHING;
  SELECT o.* INTO STRICT v_operation FROM app_private.kyc_operations o WHERE o.id = p_operation_id FOR UPDATE;
  IF v_operation.owner_user_id <> v_user_id OR v_operation.request_fingerprint <> v_fingerprint THEN
    RAISE EXCEPTION 'operation_key_conflict';
  END IF;
  IF v_operation.state = 'succeeded' THEN RETURN; END IF;
  IF v_operation.state <> 'processing' THEN RAISE EXCEPTION 'operation_unavailable'; END IF;
  SELECT * INTO v_case FROM public.kyc_submissions WHERE id = p_submission_id AND user_id = v_user_id FOR UPDATE;
  IF NOT FOUND OR v_case.status <> 'pending' OR v_case.review_version <> p_expected_version THEN RAISE EXCEPTION 'kyc_withdrawal_conflict'; END IF;
  UPDATE public.kyc_submissions SET status = 'withdrawn', assigned_to = NULL, claimed_at = NULL
    WHERE id = p_submission_id AND user_id = v_user_id AND status = 'pending' AND review_version = p_expected_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'kyc_withdrawal_conflict'; END IF;
  UPDATE public.users SET
    kyc_status = CASE WHEN verified_kyc_submission_id = p_submission_id THEN 'unverified' ELSE kyc_status END,
    verified_kyc_submission_id = CASE WHEN verified_kyc_submission_id = p_submission_id THEN NULL ELSE verified_kyc_submission_id END
  WHERE id = v_user_id;
  INSERT INTO public.kyc_review_events(submission_id, user_id, from_status, to_status, action, actor_id, actor_role, customer_message)
  VALUES (p_submission_id, v_user_id, 'pending', 'withdrawn', 'withdraw', v_user_id, 'customer', 'KYC application withdrawn by account holder.');
  UPDATE app_private.kyc_operations SET state = 'succeeded', updated_at = clock_timestamp() WHERE id = p_operation_id;
  UPDATE app_private.kyc_review_confirmations SET invalidated_at = clock_timestamp()
    WHERE submission_id = p_submission_id AND review_version = p_expected_version
      AND consumed_at IS NULL AND invalidated_at IS NULL;
END;
$$;
REVOKE ALL ON FUNCTION app_private.withdraw_kyc_submission(uuid,bigint,uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION app_private.withdraw_kyc_submission(uuid,bigint,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.withdraw_kyc_submission(p_submission_id uuid, p_expected_version bigint, p_operation_id uuid)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = public, app_private, pg_temp AS $$
  SELECT app_private.withdraw_kyc_submission($1,$2,$3);
$$;
REVOKE ALL ON FUNCTION public.withdraw_kyc_submission(uuid,bigint,uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.withdraw_kyc_submission(uuid,bigint,uuid) TO authenticated;

CREATE FUNCTION app_private.begin_kyc_submission_v2(
  p_operation_id uuid,p_user_id uuid,p_ic_hash text,p_doc_type text,p_holder_name text,p_evidence_fingerprint text,p_ocr_consent boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,app_private,pg_temp AS $$
DECLARE v_operation app_private.kyc_operations%ROWTYPE; v_submission_id uuid; v_fingerprint text; v_status text;
BEGIN
  IF auth.role()<>'service_role' OR p_operation_id IS NULL OR p_user_id IS NULL OR p_ic_hash !~ '^[a-f0-9]{64}$'
     OR p_doc_type NOT IN ('national_id','passport','driving_license') OR length(btrim(coalesce(p_holder_name,''))) NOT BETWEEN 2 AND 100
     OR p_evidence_fingerprint IS NULL OR NOT coalesce(p_ocr_consent,false) THEN RAISE EXCEPTION 'invalid_kyc_operation'; END IF;
  v_fingerprint:=encode(extensions.digest(convert_to(concat_ws(':',p_user_id,p_ic_hash,p_doc_type,btrim(p_holder_name),p_evidence_fingerprint), 'UTF8'),'sha256'),'hex');
  INSERT INTO app_private.kyc_operations(id,owner_user_id,kind,request_fingerprint,state)
    VALUES(p_operation_id,p_user_id,'submit',v_fingerprint,'processing') ON CONFLICT(id) DO NOTHING;
  SELECT * INTO v_operation FROM app_private.kyc_operations WHERE id=p_operation_id FOR UPDATE;
  IF v_operation.owner_user_id<>p_user_id OR v_operation.kind<>'submit' OR v_operation.request_fingerprint<>v_fingerprint THEN
    RAISE EXCEPTION 'operation_key_conflict'; END IF;
  IF v_operation.submission_id IS NOT NULL THEN
    SELECT status INTO v_status FROM public.kyc_submissions WHERE id=v_operation.submission_id AND user_id=p_user_id;
    IF v_status='pending' THEN
      UPDATE app_private.kyc_operations SET state='succeeded',updated_at=clock_timestamp() WHERE id=p_operation_id;
      RETURN jsonb_build_object('submissionId',v_operation.submission_id,'state','succeeded');
    END IF;
    RETURN jsonb_build_object('submissionId',v_operation.submission_id,'state',coalesce(v_operation.state,'processing'));
  END IF;
  v_submission_id:=public.begin_kyc_submission(p_user_id,p_ic_hash,'hmac_sha256_v1',p_doc_type,p_ocr_consent);
  UPDATE app_private.kyc_operations SET submission_id=v_submission_id,updated_at=clock_timestamp() WHERE id=p_operation_id;
  RETURN jsonb_build_object('submissionId',v_submission_id,'state','processing');
END; $$;
REVOKE ALL ON FUNCTION app_private.begin_kyc_submission_v2(uuid,uuid,text,text,text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app_private.begin_kyc_submission_v2(uuid,uuid,text,text,text,text,boolean) TO service_role;
CREATE FUNCTION public.begin_kyc_submission_v2(
  p_operation_id uuid,p_user_id uuid,p_ic_hash text,p_doc_type text,p_holder_name text,p_evidence_fingerprint text,p_ocr_consent boolean
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=public,app_private,pg_temp AS $$
  SELECT app_private.begin_kyc_submission_v2($1,$2,$3,$4,$5,$6,$7);
$$;
REVOKE ALL ON FUNCTION public.begin_kyc_submission_v2(uuid,uuid,text,text,text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_kyc_submission_v2(uuid,uuid,text,text,text,text,boolean) TO service_role;

CREATE FUNCTION app_private.get_my_kyc_operation(p_operation_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,app_private,pg_temp AS $$
DECLARE v_operation app_private.kyc_operations%ROWTYPE; v_status text;
BEGIN
  IF auth.role()<>'authenticated' OR auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT * INTO v_operation FROM app_private.kyc_operations WHERE id=p_operation_id AND owner_user_id=auth.uid() AND kind IN ('submit','withdraw');
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_operation.submission_id IS NOT NULL THEN
    SELECT status INTO v_status FROM public.kyc_submissions WHERE id=v_operation.submission_id AND user_id=auth.uid();
    IF v_status='pending' OR v_status='withdrawn' THEN v_operation.state:='succeeded'; END IF;
  END IF;
  RETURN jsonb_build_object('operationId',v_operation.id,'state',v_operation.state,'submissionId',v_operation.submission_id,
    'submissionStatus',v_status,'safeErrorCode',v_operation.safe_error_code,'updatedAt',v_operation.updated_at);
END; $$;
REVOKE ALL ON FUNCTION app_private.get_my_kyc_operation(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION app_private.get_my_kyc_operation(uuid) TO authenticated;
CREATE FUNCTION public.get_my_kyc_operation(p_operation_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=public,app_private,pg_temp AS $$ SELECT app_private.get_my_kyc_operation($1); $$;
REVOKE ALL ON FUNCTION public.get_my_kyc_operation(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_my_kyc_operation(uuid) TO authenticated;

CREATE FUNCTION app_private.complete_kyc_submit_operation(p_operation_id uuid,p_submission_id uuid,p_owner_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,app_private,pg_temp AS $$
BEGIN
  IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
  UPDATE app_private.kyc_operations SET state='succeeded',updated_at=clock_timestamp()
    WHERE id=p_operation_id AND owner_user_id=p_owner_user_id AND kind='submit' AND submission_id=p_submission_id
      AND EXISTS(SELECT 1 FROM public.kyc_submissions WHERE id=p_submission_id AND user_id=p_owner_user_id AND status='pending');
  RETURN FOUND;
END; $$;
REVOKE ALL ON FUNCTION app_private.complete_kyc_submit_operation(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app_private.complete_kyc_submit_operation(uuid,uuid,uuid) TO service_role;
CREATE FUNCTION public.complete_kyc_submit_operation(p_operation_id uuid,p_submission_id uuid,p_owner_user_id uuid)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path=public,app_private,pg_temp AS $$ SELECT app_private.complete_kyc_submit_operation($1,$2,$3); $$;
REVOKE ALL ON FUNCTION public.complete_kyc_submit_operation(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_kyc_submit_operation(uuid,uuid,uuid) TO service_role;

-- Expand the legacy status check by exact known name; preserve its existing values.
ALTER TABLE public.kyc_submissions DROP CONSTRAINT IF EXISTS kyc_submissions_status_check;
ALTER TABLE public.kyc_submissions DROP CONSTRAINT IF EXISTS kyc_status_ck;
ALTER TABLE public.kyc_submissions ADD CONSTRAINT kyc_submissions_status_check
  CHECK (status IN ('draft', 'pending', 'info_requested', 'approved', 'rejected', 'superseded', 'withdrawn'));
NOTIFY pgrst, 'reload schema';
