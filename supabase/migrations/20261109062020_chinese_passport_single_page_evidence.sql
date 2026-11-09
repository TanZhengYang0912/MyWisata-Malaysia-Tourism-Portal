-- Allow one page for passports while retaining mandatory two-sided MyKad/driver evidence.
-- OCR stays opt-in in the application until real Chinese passport samples are evaluated.

CREATE OR REPLACE FUNCTION app_private.save_kyc_draft_v2(
  p_owner_user_id uuid,p_draft_id uuid,p_expected_version bigint,p_document_type text,p_holder_name text,
  p_front_storage_path text,p_back_storage_path text,p_front_input_sha256 text,p_back_input_sha256 text,
  p_front_evidence_sha256 text,p_back_evidence_sha256 text,p_evidence_revision text,
  p_idle_ttl_seconds integer,p_absolute_ttl_seconds integer
) RETURNS TABLE(draft_id uuid,version bigint,expires_at timestamptz,changed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,app_private,pg_temp AS $$
DECLARE
  v_draft app_private.kyc_drafts%ROWTYPE;
  v_holder_name text:=nullif(btrim(p_holder_name),'');
  v_now timestamptz:=clock_timestamp();
  v_retired text[];
BEGIN
  IF auth.role()<>'service_role' OR p_owner_user_id IS NULL OR p_draft_id IS NULL
     OR NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=p_owner_user_id AND u.status='active')
     OR p_document_type IS NULL OR p_document_type NOT IN ('national_id','passport','driving_license')
     OR p_idle_ttl_seconds IS NULL OR p_idle_ttl_seconds<=0 OR p_absolute_ttl_seconds IS NULL OR p_absolute_ttl_seconds<p_idle_ttl_seconds
     OR p_evidence_revision IS NULL OR p_evidence_revision !~ '^[a-f0-9]{64}$'
     OR p_front_storage_path IS NULL OR p_front_storage_path NOT LIKE p_owner_user_id::text||'/drafts/'||p_draft_id::text||'/%'
     OR (p_document_type='passport' AND p_back_storage_path IS NOT NULL)
     OR (p_document_type<>'passport' AND (p_back_storage_path IS NULL OR p_back_storage_path NOT LIKE p_owner_user_id::text||'/drafts/'||p_draft_id::text||'/%'))
     OR p_front_input_sha256 IS NOT NULL AND p_front_input_sha256 !~ '^[a-f0-9]{64}$'
     OR p_back_input_sha256 IS NOT NULL AND p_back_input_sha256 !~ '^[a-f0-9]{64}$'
     OR p_front_evidence_sha256 IS NULL OR p_front_evidence_sha256 !~ '^[a-f0-9]{64}$'
     OR (p_document_type='passport' AND p_back_evidence_sha256 IS NOT NULL)
     OR (p_document_type<>'passport' AND (p_back_evidence_sha256 IS NULL OR p_back_evidence_sha256 !~ '^[a-f0-9]{64}$')) THEN
    RAISE EXCEPTION 'invalid_kyc_draft';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('kyc-draft:'||p_owner_user_id::text,0));
  SELECT * INTO v_draft FROM app_private.kyc_drafts d WHERE d.owner_user_id=p_owner_user_id AND d.state='editing' FOR UPDATE;
  IF FOUND THEN
    IF v_draft.id<>p_draft_id OR v_draft.version<>p_expected_version OR v_draft.expires_at<=v_now OR v_draft.absolute_expires_at<=v_now THEN RAISE EXCEPTION 'kyc_draft_conflict'; END IF;
    IF v_draft.document_type=p_document_type AND v_draft.holder_name IS NOT DISTINCT FROM v_holder_name
       AND v_draft.front_storage_path=p_front_storage_path AND v_draft.back_storage_path IS NOT DISTINCT FROM p_back_storage_path
       AND v_draft.front_input_sha256 IS NOT DISTINCT FROM p_front_input_sha256 AND v_draft.back_input_sha256 IS NOT DISTINCT FROM p_back_input_sha256
       AND v_draft.front_evidence_sha256 IS NOT DISTINCT FROM p_front_evidence_sha256 AND v_draft.back_evidence_sha256 IS NOT DISTINCT FROM p_back_evidence_sha256
       AND v_draft.evidence_revision=p_evidence_revision THEN
      RETURN QUERY SELECT v_draft.id,v_draft.version,v_draft.expires_at,false; RETURN;
    END IF;
    v_retired:=ARRAY(SELECT DISTINCT path FROM unnest(v_draft.retired_storage_paths||array_remove(ARRAY[
      CASE WHEN v_draft.front_storage_path IS DISTINCT FROM p_front_storage_path THEN v_draft.front_storage_path END,
      CASE WHEN v_draft.back_storage_path IS DISTINCT FROM p_back_storage_path THEN v_draft.back_storage_path END],NULL)) retired(path) WHERE path IS NOT NULL);
    UPDATE app_private.kyc_drafts d SET document_type=p_document_type,holder_name=v_holder_name,
      front_storage_path=p_front_storage_path,back_storage_path=p_back_storage_path,
      front_input_sha256=p_front_input_sha256,back_input_sha256=p_back_input_sha256,
      front_evidence_sha256=p_front_evidence_sha256,back_evidence_sha256=p_back_evidence_sha256,
      hash_version='sha256_v1',evidence_revision=p_evidence_revision,
      ocr_observation_id=CASE WHEN d.evidence_revision=p_evidence_revision THEN d.ocr_observation_id ELSE NULL END,
      retired_storage_paths=v_retired,version=d.version+1,updated_at=v_now,
      expires_at=least(v_now+make_interval(secs=>p_idle_ttl_seconds),d.absolute_expires_at)
      WHERE d.id=v_draft.id RETURNING d.* INTO v_draft;
  ELSE
    IF p_expected_version IS NOT NULL OR EXISTS(SELECT 1 FROM app_private.kyc_drafts d WHERE d.owner_user_id=p_owner_user_id AND d.state='editing') THEN RAISE EXCEPTION 'kyc_draft_conflict'; END IF;
    INSERT INTO app_private.kyc_drafts(id,owner_user_id,state,document_type,holder_name,front_storage_path,back_storage_path,
      front_input_sha256,back_input_sha256,front_evidence_sha256,back_evidence_sha256,hash_version,evidence_revision,expires_at,absolute_expires_at)
    VALUES(p_draft_id,p_owner_user_id,'editing',p_document_type,v_holder_name,p_front_storage_path,p_back_storage_path,
      p_front_input_sha256,p_back_input_sha256,p_front_evidence_sha256,p_back_evidence_sha256,'sha256_v1',p_evidence_revision,
      least(v_now+make_interval(secs=>p_idle_ttl_seconds),v_now+make_interval(secs=>p_absolute_ttl_seconds)),
      v_now+make_interval(secs=>p_absolute_ttl_seconds)) RETURNING * INTO v_draft;
  END IF;
  INSERT INTO app_private.kyc_draft_events(draft_id,owner_user_id,event_type,actor_id) VALUES(v_draft.id,v_draft.owner_user_id,'saved',p_owner_user_id);
  RETURN QUERY SELECT v_draft.id,v_draft.version,v_draft.expires_at,true;
END; $$;

CREATE OR REPLACE FUNCTION public.save_kyc_draft_v2(
  p_owner_user_id uuid,p_draft_id uuid,p_expected_version bigint,p_document_type text,p_holder_name text,
  p_front_storage_path text,p_back_storage_path text,p_front_input_sha256 text,p_back_input_sha256 text,
  p_front_evidence_sha256 text,p_back_evidence_sha256 text,p_evidence_revision text,p_idle_ttl_seconds integer,p_absolute_ttl_seconds integer
) RETURNS TABLE(draft_id uuid,version bigint,expires_at timestamptz,changed boolean)
LANGUAGE sql SECURITY INVOKER SET search_path=public,app_private,pg_temp AS $$
  SELECT * FROM app_private.save_kyc_draft_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14);
$$;
REVOKE ALL ON FUNCTION app_private.save_kyc_draft_v2(uuid,uuid,bigint,text,text,text,text,text,text,text,text,text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app_private.save_kyc_draft_v2(uuid,uuid,bigint,text,text,text,text,text,text,text,text,text,integer,integer) TO service_role;
REVOKE ALL ON FUNCTION public.save_kyc_draft_v2(uuid,uuid,bigint,text,text,text,text,text,text,text,text,text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_kyc_draft_v2(uuid,uuid,bigint,text,text,text,text,text,text,text,text,text,integer,integer) TO service_role;

CREATE OR REPLACE FUNCTION app_private.kyc_evidence_revision(p_submission uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT CASE WHEN bool_and(d.purge_claimed_at IS NULL) AND (
      (s.document_type='passport' AND count(*)=1 AND bool_and(d.side='front')) OR
      (s.document_type<>'passport' AND count(*)=2 AND count(DISTINCT d.side)=2))
    THEN md5(string_agg(d.id::text||':'||d.side,',' ORDER BY d.side,d.id)) END
  FROM public.kyc_submissions s LEFT JOIN public.kyc_submission_documents d ON d.submission_id=s.id
  WHERE s.id=p_submission GROUP BY s.document_type;
$$;

CREATE OR REPLACE FUNCTION app_private.finalize_kyc_submission(p_submission_id uuid,p_front_path text,p_back_path text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,app_private,pg_temp AS $$
DECLARE v_case public.kyc_submissions%ROWTYPE; v_pos integer; v_prefix text; v_front_mime text; v_back_mime text;
  v_front_token text; v_back_token text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT * INTO v_case FROM public.kyc_submissions WHERE id=p_submission_id AND user_id=auth.uid() AND status='draft' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'draft_not_found'; END IF;
  IF (v_case.document_type='passport' AND p_back_path IS NOT NULL)
     OR (v_case.document_type<>'passport' AND p_back_path IS NULL) THEN RAISE EXCEPTION 'documents_missing'; END IF;
  v_prefix:=auth.uid()::text||'/'||p_submission_id::text||'/';
  SELECT (regexp_match(p_front_path,'^'||v_prefix||'([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/front\.(jpg|jpeg|png|webp)$'))[1] INTO v_front_token;
  IF p_back_path IS NOT NULL THEN
    SELECT (regexp_match(p_back_path,'^'||v_prefix||'([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/back\.(jpg|jpeg|png|webp)$'))[1] INTO v_back_token;
  END IF;
  IF v_front_token IS NULL OR (p_back_path IS NOT NULL AND (p_front_path=p_back_path OR v_back_token IS NULL OR v_front_token<>v_back_token)) THEN
    RAISE EXCEPTION 'invalid_document_path';
  END IF;
  SELECT coalesce(metadata->>'mimetype',CASE WHEN name ~* '\.webp$' THEN 'image/webp' WHEN name ~* '\.png$' THEN 'image/png' ELSE 'image/jpeg' END)
    INTO v_front_mime FROM storage.objects WHERE bucket_id='kyc-documents' AND name=p_front_path;
  IF p_back_path IS NOT NULL THEN
    SELECT coalesce(metadata->>'mimetype',CASE WHEN name ~* '\.webp$' THEN 'image/webp' WHEN name ~* '\.png$' THEN 'image/png' ELSE 'image/jpeg' END)
      INTO v_back_mime FROM storage.objects WHERE bucket_id='kyc-documents' AND name=p_back_path;
  END IF;
  IF v_front_mime IS NULL OR (p_back_path IS NOT NULL AND v_back_mime IS NULL) THEN RAISE EXCEPTION 'documents_missing'; END IF;
  IF v_front_mime NOT IN ('image/jpeg','image/png','image/webp') OR (v_back_mime IS NOT NULL AND v_back_mime NOT IN ('image/jpeg','image/png','image/webp')) THEN
    RAISE EXCEPTION 'invalid_document_mime';
  END IF;
  INSERT INTO public.kyc_submission_documents(submission_id,side,storage_path,mime_type)
    VALUES(p_submission_id,'front',p_front_path,v_front_mime);
  IF p_back_path IS NOT NULL THEN INSERT INTO public.kyc_submission_documents(submission_id,side,storage_path,mime_type)
    VALUES(p_submission_id,'back',p_back_path,v_back_mime); END IF;
  SELECT coalesce(max(queue_position),0)+1 INTO v_pos FROM public.kyc_submissions WHERE status='pending';
  UPDATE public.kyc_submissions SET status='pending',queue_position=v_pos WHERE id=p_submission_id;
  PERFORM set_config('app.allow_verification_write','on',true);
  UPDATE public.users SET kyc_status='pending',updated_at=now() WHERE id=auth.uid();
  PERFORM public.recompute_compatibility_tier(auth.uid());
  RETURN p_submission_id;
END; $$;

CREATE OR REPLACE FUNCTION public.finalize_kyc_submission(p_submission_id uuid,p_front_path text,p_back_path text)
RETURNS uuid LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=public,pg_temp AS $$
  SELECT app_private.finalize_kyc_submission($1,$2,$3);
$$;

CREATE OR REPLACE FUNCTION app_private.stage_kyc_identity_confirmation(
  p_expected_actor_id uuid,p_expected_session_id uuid,p_submission_id uuid,p_review_version bigint,p_evidence_revision text,
  p_actual_document_type text,p_issuer_country text,p_identifier_kind text,p_confirmed_holder_name text,p_confirmed_number_hmac text,
  p_source text,p_observation_id uuid,p_document_access_refs uuid[],p_reason_code text,p_reason_detail text,p_risk_level text,p_purpose text,p_ttl_seconds integer
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,app_private,pg_temp AS $$
DECLARE v_id uuid; v_case public.kyc_submissions%ROWTYPE; v_ttl integer; v_required_count integer; v_viewed_count integer;
BEGIN
  IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
  SELECT confirmation_ttl_seconds INTO v_ttl FROM app_private.kyc_identity_control WHERE singleton;
  IF v_ttl IS NULL OR p_ttl_seconds IS DISTINCT FROM v_ttl THEN RAISE EXCEPTION 'confirmation_ttl_unconfigured'; END IF;
  SELECT * INTO v_case FROM public.kyc_submissions WHERE id=p_submission_id FOR UPDATE;
  IF NOT FOUND OR v_case.status<>'pending' OR v_case.review_version<>p_review_version THEN RAISE EXCEPTION 'kyc_case_changed'; END IF;
  IF app_private.kyc_evidence_revision(p_submission_id) IS DISTINCT FROM p_evidence_revision THEN RAISE EXCEPTION 'kyc_evidence_changed'; END IF;
  v_required_count:=CASE WHEN v_case.document_type='passport' THEN 1 ELSE 2 END;
  SELECT count(DISTINCT a.after_data->>'side') INTO v_viewed_count FROM public.audit_logs a
   WHERE a.id=ANY(coalesce(p_document_access_refs,'{}')) AND a.actor_id=p_expected_actor_id
     AND a.action='kyc.document_viewed' AND a.entity_type='kyc_submission' AND a.entity_id=p_submission_id
     AND a.after_data->>'evidence_revision'=p_evidence_revision
     AND a.after_data->>'side' IN ('front','back')
     AND (v_case.document_type<>'passport' OR a.after_data->>'side'='front');
  IF cardinality(coalesce(p_document_access_refs,'{}'))<>v_required_count OR v_viewed_count<>v_required_count THEN RAISE EXCEPTION 'kyc_document_review_evidence_required'; END IF;
  IF p_purpose='primary' AND v_case.assigned_to IS DISTINCT FROM p_expected_actor_id AND NOT app_private.is_kyc_review_super_admin() THEN RAISE EXCEPTION 'kyc_not_assigned'; END IF;
  IF p_purpose='independent_second' AND NOT EXISTS(SELECT 1 FROM app_private.kyc_review_countersign_authorizations a
    WHERE a.submission_id=p_submission_id AND a.review_version=p_review_version AND a.evidence_revision=p_evidence_revision
      AND a.primary_actor_id=v_case.assigned_to AND a.secondary_actor_id=p_expected_actor_id AND a.expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'kyc_countersign_not_authorized'; END IF;
  IF NOT EXISTS(SELECT 1 FROM auth.sessions s WHERE s.id=p_expected_session_id AND s.user_id=p_expected_actor_id AND (s.not_after IS NULL OR s.not_after>clock_timestamp()))
    OR NOT public.has_staff_permission(p_expected_actor_id,'admin.kyc.review') THEN RAISE EXCEPTION 'reviewer_session_unavailable'; END IF;
  IF p_source='manual' AND (p_reason_code IS NULL OR p_reason_code NOT IN ('ocr_number_mismatch','ocr_name_mismatch','ocr_unavailable','ocr_unreadable','legacy_resolution','identity_replacement')) THEN
    RAISE EXCEPTION 'kyc_manual_reason_required'; END IF;
  INSERT INTO app_private.kyc_review_confirmations(expected_actor_id,expected_session_id,submission_id,review_version,evidence_revision,
    actual_document_type,issuer_country,identifier_kind,confirmed_holder_name,confirmed_number_hmac,hash_version,source,observation_id,
    document_access_refs,reason_code,reason_detail,risk_level,purpose,expires_at)
  VALUES(p_expected_actor_id,p_expected_session_id,p_submission_id,p_review_version,p_evidence_revision,p_actual_document_type,upper(p_issuer_country),
    p_identifier_kind,btrim(p_confirmed_holder_name),p_confirmed_number_hmac,'hmac_sha256_v1',p_source,p_observation_id,coalesce(p_document_access_refs,'{}'),
    p_reason_code,nullif(btrim(p_reason_detail),''),p_risk_level,p_purpose,clock_timestamp()+make_interval(secs=>p_ttl_seconds))
  ON CONFLICT(submission_id,review_version,evidence_revision,purpose,expected_actor_id) WHERE purpose<>'resolution'
  DO UPDATE SET expected_session_id=EXCLUDED.expected_session_id,actor_id=NULL,session_id=NULL,attested_aal=NULL,attested_at=NULL,
    actual_document_type=EXCLUDED.actual_document_type,issuer_country=EXCLUDED.issuer_country,identifier_kind=EXCLUDED.identifier_kind,
    confirmed_holder_name=EXCLUDED.confirmed_holder_name,confirmed_number_hmac=EXCLUDED.confirmed_number_hmac,hash_version=EXCLUDED.hash_version,
    source=EXCLUDED.source,observation_id=EXCLUDED.observation_id,document_access_refs=EXCLUDED.document_access_refs,
    reason_code=EXCLUDED.reason_code,reason_detail=EXCLUDED.reason_detail,risk_level=EXCLUDED.risk_level,created_at=clock_timestamp(),
    expires_at=EXCLUDED.expires_at,consumed_at=NULL,consumed_xid=NULL,invalidated_at=NULL RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

ALTER TABLE public.kyc_ocr_results
  ADD COLUMN IF NOT EXISTS issuer_country text CHECK (issuer_country IS NULL OR issuer_country ~ '^[A-Z]{2}$'),
  ADD COLUMN IF NOT EXISTS nationality text CHECK (nationality IS NULL OR nationality ~ '^[A-Z]{2}$'),
  ADD COLUMN IF NOT EXISTS mrz_status text CHECK (mrz_status IS NULL OR mrz_status IN ('valid','invalid','unreadable','unsupported')),
  ADD COLUMN IF NOT EXISTS visual_comparison_status text CHECK (visual_comparison_status IS NULL OR visual_comparison_status IN ('consistent','conflict','incomplete'));

CREATE FUNCTION public.record_kyc_ocr_result_v2(
  p_submission_id uuid,p_status text,p_holder_name text,p_document_number_hmac text,p_document_number_last4 text,
  p_expiry_date date,p_confidence numeric,p_mismatch_fields text[],p_provider_model text,
  p_issuer_country text,p_nationality text,p_mrz_status text,p_visual_comparison_status text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
  IF p_status IS NULL OR p_status NOT IN ('matched','mismatch','unreadable','unavailable')
     OR p_document_number_hmac IS NOT NULL AND p_document_number_hmac !~ '^[a-f0-9]{64}$'
     OR p_document_number_last4 IS NOT NULL AND p_document_number_last4 !~ '^[A-Z0-9]{4}$'
     OR p_issuer_country IS NOT NULL AND p_issuer_country !~ '^[A-Z]{2}$'
     OR p_nationality IS NOT NULL AND p_nationality !~ '^[A-Z]{2}$'
     OR p_mrz_status IS NOT NULL AND p_mrz_status NOT IN ('valid','invalid','unreadable','unsupported')
     OR p_visual_comparison_status IS NOT NULL AND p_visual_comparison_status NOT IN ('consistent','conflict','incomplete') THEN
    RAISE EXCEPTION 'invalid_ocr_result';
  END IF;
  INSERT INTO public.kyc_ocr_results(submission_id,status,holder_name,document_number_hmac,document_number_last4,expiry_date,
    confidence,mismatch_fields,provider_model,issuer_country,nationality,mrz_status,visual_comparison_status)
  VALUES(p_submission_id,p_status,nullif(btrim(p_holder_name),''),p_document_number_hmac,p_document_number_last4,p_expiry_date,
    p_confidence,coalesce(p_mismatch_fields,'{}'),p_provider_model,p_issuer_country,p_nationality,p_mrz_status,p_visual_comparison_status)
  ON CONFLICT(submission_id) DO UPDATE SET status=EXCLUDED.status,holder_name=EXCLUDED.holder_name,
    document_number_hmac=EXCLUDED.document_number_hmac,document_number_last4=EXCLUDED.document_number_last4,
    expiry_date=EXCLUDED.expiry_date,confidence=EXCLUDED.confidence,mismatch_fields=EXCLUDED.mismatch_fields,
    provider_model=EXCLUDED.provider_model,issuer_country=EXCLUDED.issuer_country,nationality=EXCLUDED.nationality,
    mrz_status=EXCLUDED.mrz_status,visual_comparison_status=EXCLUDED.visual_comparison_status,processed_at=now();
END; $$;
REVOKE ALL ON FUNCTION public.record_kyc_ocr_result_v2(uuid,text,text,text,text,date,numeric,text[],text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_kyc_ocr_result_v2(uuid,text,text,text,text,date,numeric,text[],text,text,text,text,text) TO service_role;

CREATE OR REPLACE FUNCTION app_private.finish_kyc_prescreening_job(p_job_id uuid,p_token uuid,p_result jsonb,p_retry_seconds integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,app_private,pg_temp AS $$
DECLARE j public.kyc_prescreening_jobs%ROWTYPE; s public.kyc_submissions%ROWTYPE; sid uuid; ocr_status text; v_outcome text;
BEGIN
  PERFORM app_private.require_kyc_job_service();
  IF p_retry_seconds IS NULL OR p_retry_seconds NOT BETWEEN 1 AND 86400 THEN RAISE EXCEPTION 'invalid_worker_budget'; END IF;
  SELECT submission_id INTO sid FROM public.kyc_prescreening_jobs WHERE id=p_job_id;
  IF sid IS NULL THEN RETURN false; END IF;
  SELECT * INTO s FROM public.kyc_submissions WHERE id=sid FOR UPDATE;
  SELECT * INTO j FROM public.kyc_prescreening_jobs WHERE id=p_job_id FOR UPDATE;
  IF j.status<>'processing' OR j.lease_token IS DISTINCT FROM p_token OR j.lease_expires_at<=now() THEN RETURN false; END IF;
  IF s.status<>'pending' OR app_private.kyc_evidence_revision(sid) IS DISTINCT FROM j.evidence_revision THEN
    UPDATE public.kyc_prescreening_jobs SET status='cancelled',outcome='manual_review',last_error_code='case_closed',lease_token=NULL,lease_expires_at=NULL,finished_at=now(),updated_at=now() WHERE id=j.id;
    RETURN false;
  END IF;
  ocr_status:=p_result->>'status';
  IF ocr_status IS NULL OR ocr_status NOT IN ('matched','mismatch','unreadable','unavailable') THEN RAISE EXCEPTION 'invalid_ocr_result'; END IF;
  IF ocr_status='unavailable' THEN
    UPDATE public.kyc_prescreening_jobs SET status=CASE WHEN attempts<attempt_limit THEN 'queued' ELSE 'failed' END,
      outcome='manual_review',last_error_code='ocr_unavailable',available_at=now()+make_interval(secs=>p_retry_seconds),
      lease_token=NULL,lease_expires_at=NULL,updated_at=now(),finished_at=CASE WHEN attempts>=attempt_limit THEN now() END WHERE id=j.id;
    RETURN true;
  END IF;
  IF (p_result->>'documentNumberHmac') IS NOT NULL AND (p_result->>'documentNumberHmac') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'invalid_ocr_result'; END IF;
  IF ocr_status='matched' AND (p_result->>'documentNumberHmac') IS DISTINCT FROM s.ic_hash THEN RAISE EXCEPTION 'invalid_ocr_match'; END IF;
  v_outcome:=CASE WHEN ocr_status='matched' AND coalesce(jsonb_array_length(p_result->'mismatchFields'),0)=0 THEN 'precheck_passed' ELSE 'manual_review' END;
  PERFORM public.record_kyc_ocr_result_v2(sid,ocr_status,left(p_result->>'holderName',160),p_result->>'documentNumberHmac',
    right(p_result->>'documentNumberLast4',4),(p_result->>'expiryDate')::date,(p_result->>'confidence')::numeric,
    ARRAY(SELECT jsonb_array_elements_text(coalesce(p_result->'mismatchFields','[]'::jsonb))),'private-ocr-v1',
    upper(p_result->>'issuerCountry'),upper(p_result->>'nationality'),p_result->>'mrzStatus',p_result->>'visualComparisonStatus');
  UPDATE public.kyc_prescreening_jobs SET status='succeeded',outcome=v_outcome,last_error_code=NULL,lease_token=NULL,lease_expires_at=NULL,finished_at=now(),updated_at=now() WHERE id=j.id;
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.finish_kyc_prescreening_job(p_job_id uuid,p_token uuid,p_result jsonb,p_retry_seconds integer)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path=public,pg_temp AS $$
  SELECT app_private.finish_kyc_prescreening_job($1,$2,$3,$4);
$$;

REVOKE ALL ON FUNCTION app_private.finish_kyc_prescreening_job(uuid,uuid,jsonb,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app_private.finish_kyc_prescreening_job(uuid,uuid,jsonb,integer) TO service_role;
REVOKE ALL ON FUNCTION public.finish_kyc_prescreening_job(uuid,uuid,jsonb,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_kyc_prescreening_job(uuid,uuid,jsonb,integer) TO service_role;

CREATE FUNCTION app_private.guard_passport_kyc_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,app_private,pg_temp AS $$
DECLARE v_ocr public.kyc_ocr_results%ROWTYPE;
BEGIN
  IF NEW.status='approved' AND OLD.status IS DISTINCT FROM 'approved' AND NEW.document_type='passport' THEN
    SELECT * INTO v_ocr FROM public.kyc_ocr_results WHERE submission_id=NEW.id;
    IF NOT FOUND OR v_ocr.issuer_country IS DISTINCT FROM 'CN' OR v_ocr.nationality IS DISTINCT FROM 'CN'
       OR v_ocr.mrz_status IS DISTINCT FROM 'valid' OR v_ocr.visual_comparison_status IS DISTINCT FROM 'consistent'
       OR v_ocr.expiry_date IS NULL OR v_ocr.expiry_date<=current_date THEN
      RAISE EXCEPTION 'chinese_passport_evidence_required';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER guard_passport_kyc_approval BEFORE UPDATE OF status ON public.kyc_submissions
  FOR EACH ROW EXECUTE FUNCTION app_private.guard_passport_kyc_approval();
REVOKE ALL ON FUNCTION app_private.guard_passport_kyc_approval() FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION app_private.finalize_kyc_submission(uuid,text,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION app_private.finalize_kyc_submission(uuid,text,text) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.finalize_kyc_submission(uuid,text,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.finalize_kyc_submission(uuid,text,text) TO authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.stage_kyc_identity_confirmation(uuid,uuid,uuid,bigint,text,text,text,text,text,text,text,uuid,uuid[],text,text,text,text,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION app_private.stage_kyc_identity_confirmation(uuid,uuid,uuid,bigint,text,text,text,text,text,text,text,uuid,uuid[],text,text,text,text,integer) TO service_role;

NOTIFY pgrst,'reload schema';
