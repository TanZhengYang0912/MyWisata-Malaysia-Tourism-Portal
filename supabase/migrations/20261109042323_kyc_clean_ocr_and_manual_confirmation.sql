-- Bind OCR facts to the exact clean request source and protected artifact revision.
ALTER TABLE app_private.kyc_drafts ADD COLUMN ocr_source_revision text CHECK (ocr_source_revision IS NULL OR ocr_source_revision ~ '^[a-f0-9]{64}$');

CREATE FUNCTION app_private.clear_kyc_draft_ocr_source_on_change()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,app_private,pg_temp AS $$
BEGIN
 IF OLD.front_input_sha256 IS DISTINCT FROM NEW.front_input_sha256 OR OLD.back_input_sha256 IS DISTINCT FROM NEW.back_input_sha256
   OR OLD.document_type IS DISTINCT FROM NEW.document_type THEN NEW.ocr_observation_id:=NULL; NEW.ocr_source_revision:=NULL; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER clear_kyc_draft_ocr_source_on_change BEFORE UPDATE ON app_private.kyc_drafts
 FOR EACH ROW EXECUTE FUNCTION app_private.clear_kyc_draft_ocr_source_on_change();

ALTER TABLE app_private.kyc_ocr_observations
  ADD COLUMN nationality text CHECK (nationality IS NULL OR nationality ~ '^[A-Z]{2}$'),
  ADD COLUMN mrz_status text CHECK (mrz_status IS NULL OR mrz_status IN ('valid','invalid','unreadable','unsupported')),
  ADD COLUMN visual_comparison_status text CHECK (visual_comparison_status IS NULL OR visual_comparison_status IN ('consistent','conflict','incomplete')),
  ADD COLUMN expiry_date date,
  ADD COLUMN source_revision text CHECK (source_revision IS NULL OR source_revision ~ '^[a-f0-9]{64}$'),
  ADD COLUMN artifact_revision text CHECK (artifact_revision IS NULL OR artifact_revision ~ '^([a-f0-9]{64}|[a-f0-9]{32})$'),
  ADD COLUMN front_clean_sha256 text CHECK (front_clean_sha256 IS NULL OR front_clean_sha256 ~ '^[a-f0-9]{64}$'),
  ADD COLUMN back_clean_sha256 text CHECK (back_clean_sha256 IS NULL OR back_clean_sha256 ~ '^[a-f0-9]{64}$'),
  ADD COLUMN clean_transform_version text,
  ADD COLUMN parser_version text,
  ADD COLUMN policy_version text;
ALTER TABLE app_private.kyc_ocr_observations ADD CONSTRAINT kyc_ocr_observation_source_binding_check CHECK (
  source_revision IS NULL OR (artifact_revision = evidence_revision AND front_clean_sha256 IS NOT NULL
    AND clean_transform_version ~ '^[A-Za-z0-9._-]{1,64}$' AND parser_version ~ '^[A-Za-z0-9._-]{1,64}$'
    AND policy_version ~ '^[A-Za-z0-9._-]{1,64}$')
);

CREATE FUNCTION app_private.record_kyc_draft_ocr_observation_v2(
  p_owner_user_id uuid,p_draft_id uuid,p_artifact_revision text,p_source_revision text,p_front_input_sha256 text,p_front_clean_sha256 text,
  p_back_input_sha256 text,p_back_clean_sha256 text,p_clean_transform_version text,p_parser_version text,p_policy_version text,
  p_engine text,p_holder_name text,p_document_number_hmac text,p_document_number_last4 text,p_status text,p_confidence numeric,
  p_issuer_country text,p_nationality text,p_mrz_status text,p_visual_comparison_status text,p_expiry_date date,p_failure_code text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,app_private,extensions,pg_temp AS $$
DECLARE d app_private.kyc_drafts%ROWTYPE; v_source text; v_attempt integer; v_id uuid; v_required_back boolean;
BEGIN
  IF auth.role()<>'service_role' OR p_owner_user_id IS NULL OR p_draft_id IS NULL
    OR p_artifact_revision !~ '^[a-f0-9]{64}$' OR p_source_revision !~ '^[a-f0-9]{64}$' OR p_front_input_sha256 !~ '^[a-f0-9]{64}$'
    OR p_front_clean_sha256 !~ '^[a-f0-9]{64}$'
    OR (p_back_input_sha256 IS NOT NULL AND p_back_input_sha256 !~ '^[a-f0-9]{64}$')
    OR (p_back_clean_sha256 IS NOT NULL AND p_back_clean_sha256 !~ '^[a-f0-9]{64}$')
    OR p_clean_transform_version !~ '^[A-Za-z0-9._-]{1,64}$' OR p_parser_version !~ '^[A-Za-z0-9._-]{1,64}$'
    OR p_policy_version !~ '^[A-Za-z0-9._-]{1,64}$' OR p_status NOT IN ('extracted','unreadable','unavailable')
    OR (p_document_number_hmac IS NOT NULL AND p_document_number_hmac !~ '^[a-f0-9]{64}$')
    OR (p_document_number_last4 IS NOT NULL AND p_document_number_last4 !~ '^[A-Z0-9]{4}$')
    OR (p_confidence IS NOT NULL AND p_confidence NOT BETWEEN 0 AND 1) THEN RAISE EXCEPTION 'invalid_ocr_observation'; END IF;
  SELECT * INTO d FROM app_private.kyc_drafts WHERE id=p_draft_id AND owner_user_id=p_owner_user_id
    AND state='editing' AND evidence_revision=p_artifact_revision AND expires_at>clock_timestamp() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'kyc_draft_revision_conflict'; END IF;
  v_required_back := d.document_type IN ('national_id','driving_license');
  IF d.front_input_sha256 IS DISTINCT FROM p_front_input_sha256
    OR (v_required_back AND (d.back_input_sha256 IS DISTINCT FROM p_back_input_sha256 OR p_back_clean_sha256 IS NULL))
    OR (NOT v_required_back AND (p_back_input_sha256 IS NOT NULL OR p_back_clean_sha256 IS NOT NULL)) THEN
    RAISE EXCEPTION 'kyc_ocr_source_conflict';
  END IF;
  v_source := encode(extensions.digest(convert_to(concat_ws('|','kyc-source-v1',d.document_type,p_clean_transform_version,'front',
    p_front_input_sha256,p_front_clean_sha256,CASE WHEN v_required_back THEN 'back' ELSE 'none' END,
    coalesce(p_back_input_sha256,''),coalesce(p_back_clean_sha256,'')),'UTF8'),'sha256'),'hex');
  IF v_source IS DISTINCT FROM p_source_revision THEN RAISE EXCEPTION 'kyc_ocr_source_revision_invalid'; END IF;
  SELECT coalesce(max(attempt),0)+1 INTO v_attempt FROM app_private.kyc_ocr_observations
    WHERE context_kind='draft' AND context_id=p_draft_id AND evidence_revision=p_artifact_revision;
  INSERT INTO app_private.kyc_ocr_observations(context_kind,context_id,evidence_revision,artifact_revision,source_revision,actual_document_type,
    issuer_country,nationality,mrz_status,visual_comparison_status,expiry_date,front_clean_sha256,back_clean_sha256,clean_transform_version,parser_version,policy_version,attempt,engine,holder_name,
    document_number_hmac,hash_version,document_number_last4,status,confidence,failure_code)
  VALUES('draft',p_draft_id,p_artifact_revision,p_artifact_revision,v_source,d.document_type,upper(p_issuer_country),upper(p_nationality),p_mrz_status,p_visual_comparison_status,p_expiry_date,p_front_clean_sha256,p_back_clean_sha256,
    p_clean_transform_version,p_parser_version,p_policy_version,v_attempt,left(coalesce(p_engine,'unknown'),100),nullif(btrim(p_holder_name),''),
    p_document_number_hmac,CASE WHEN p_document_number_hmac IS NULL THEN NULL ELSE 'hmac_sha256_v1' END,
    p_document_number_last4,p_status,p_confidence,left(p_failure_code,80)) RETURNING id INTO v_id;
  UPDATE app_private.kyc_drafts SET ocr_observation_id=v_id,ocr_source_revision=v_source,updated_at=clock_timestamp() WHERE id=p_draft_id;
  INSERT INTO app_private.kyc_draft_events(draft_id,owner_user_id,event_type,actor_id) VALUES(p_draft_id,p_owner_user_id,'ocr_preview',p_owner_user_id);
  RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION app_private.record_kyc_draft_ocr_observation_v2(uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,numeric,text,text,text,text,date,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app_private.record_kyc_draft_ocr_observation_v2(uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,numeric,text,text,text,text,date,text) TO service_role;
CREATE FUNCTION public.record_kyc_draft_ocr_observation_v2(
  p_owner_user_id uuid,p_draft_id uuid,p_artifact_revision text,p_source_revision text,p_front_input_sha256 text,p_front_clean_sha256 text,
  p_back_input_sha256 text,p_back_clean_sha256 text,p_clean_transform_version text,p_parser_version text,p_policy_version text,
  p_engine text,p_holder_name text,p_document_number_hmac text,p_document_number_last4 text,p_status text,p_confidence numeric,
  p_issuer_country text,p_nationality text,p_mrz_status text,p_visual_comparison_status text,p_expiry_date date,p_failure_code text
) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path=public,app_private,pg_temp AS $$
 SELECT app_private.record_kyc_draft_ocr_observation_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23);
$$;
REVOKE ALL ON FUNCTION public.record_kyc_draft_ocr_observation_v2(uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,numeric,text,text,text,text,date,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_kyc_draft_ocr_observation_v2(uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,numeric,text,text,text,text,date,text) TO service_role;

CREATE FUNCTION app_private.link_kyc_ocr_observation_v2(p_owner_user_id uuid,p_draft_id uuid,p_submission_id uuid,p_draft_revision text,p_source_revision text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,app_private,pg_temp AS $$
DECLARE v_source app_private.kyc_ocr_observations%ROWTYPE; v_attempt integer; v_id uuid; v_submission_revision text;
BEGIN
 IF auth.role()<>'service_role' AND auth.uid() IS DISTINCT FROM p_owner_user_id THEN RAISE EXCEPTION 'service_role_required'; END IF;
 IF p_source_revision IS NULL THEN RETURN NULL; END IF;
 IF p_owner_user_id IS NULL OR p_source_revision !~ '^[a-f0-9]{64}$'
  OR p_draft_revision !~ '^[a-f0-9]{64}$' OR NOT EXISTS(SELECT 1 FROM public.kyc_submissions WHERE id=p_submission_id AND user_id=p_owner_user_id AND status='pending')
 THEN RAISE EXCEPTION 'invalid_ocr_observation_link'; END IF;
 PERFORM 1 FROM app_private.kyc_drafts WHERE id=p_draft_id AND owner_user_id=p_owner_user_id AND state IN ('editing','submitted')
   AND evidence_revision=p_draft_revision AND ocr_source_revision=p_source_revision FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'kyc_draft_revision_conflict'; END IF;
 SELECT * INTO v_source FROM app_private.kyc_ocr_observations WHERE context_kind='draft' AND context_id=p_draft_id
  AND evidence_revision=p_draft_revision AND artifact_revision=p_draft_revision AND source_revision=p_source_revision
  ORDER BY attempt DESC LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 v_submission_revision:=app_private.kyc_evidence_revision(p_submission_id);
 IF v_submission_revision IS NULL THEN RAISE EXCEPTION 'kyc_evidence_changed'; END IF;
 SELECT coalesce(max(attempt),0)+1 INTO v_attempt FROM app_private.kyc_ocr_observations
  WHERE context_kind='submission' AND context_id=p_submission_id AND evidence_revision=v_submission_revision;
 INSERT INTO app_private.kyc_ocr_observations(context_kind,context_id,evidence_revision,artifact_revision,source_revision,
  issuer_country,nationality,mrz_status,visual_comparison_status,expiry_date,front_clean_sha256,back_clean_sha256,clean_transform_version,parser_version,policy_version,attempt,engine,holder_name,
  document_number_hmac,hash_version,document_number_last4,actual_document_type,status,confidence,failure_code)
 VALUES('submission',p_submission_id,v_submission_revision,v_submission_revision,v_source.source_revision,v_source.issuer_country,v_source.nationality,
  v_source.mrz_status,v_source.visual_comparison_status,v_source.expiry_date,v_source.front_clean_sha256,
  v_source.back_clean_sha256,v_source.clean_transform_version,v_source.parser_version,v_source.policy_version,v_attempt,v_source.engine,
  v_source.holder_name,v_source.document_number_hmac,v_source.hash_version,v_source.document_number_last4,v_source.actual_document_type,
  v_source.status,v_source.confidence,v_source.failure_code) RETURNING id INTO v_id;
 RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION app_private.link_kyc_ocr_observation_v2(uuid,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app_private.link_kyc_ocr_observation_v2(uuid,uuid,uuid,text,text) TO service_role;
CREATE FUNCTION public.link_kyc_ocr_observation_v2(uuid,uuid,uuid,text,text) RETURNS uuid
LANGUAGE sql SECURITY INVOKER SET search_path=public,app_private,pg_temp AS $$ SELECT app_private.link_kyc_ocr_observation_v2($1,$2,$3,$4,$5); $$;
REVOKE ALL ON FUNCTION public.link_kyc_ocr_observation_v2(uuid,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.link_kyc_ocr_observation_v2(uuid,uuid,uuid,text,text) TO service_role;

-- Finalize evidence, link its observation, and seal the draft atomically so a
-- queue worker cannot claim a job before the clean-source facts are available.
CREATE FUNCTION app_private.finalize_kyc_submission_with_ocr_v2(
 p_submission_id uuid,p_front_path text,p_back_path text,p_draft_id uuid,p_draft_revision text,p_source_revision text,p_operation_id uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,app_private,pg_temp AS $$
DECLARE v_owner uuid:=auth.uid(); v_result uuid; v_case public.kyc_submissions%ROWTYPE; v_operation app_private.kyc_operations%ROWTYPE; v_expected_fingerprint text;
BEGIN
 IF v_owner IS NULL OR p_draft_id IS NULL OR p_operation_id IS NULL OR p_draft_revision !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'unauthorized'; END IF;
 SELECT * INTO v_case FROM public.kyc_submissions WHERE id=p_submission_id AND user_id=v_owner AND status='draft' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'draft_not_found'; END IF;
 v_expected_fingerprint:=encode(extensions.digest(convert_to(concat_ws(':',v_owner,v_case.ic_hash,v_case.document_type,
  btrim(v_case.legal_name_snapshot),p_draft_revision),'UTF8'),'sha256'),'hex');
 SELECT * INTO v_operation FROM app_private.kyc_operations WHERE id=p_operation_id FOR UPDATE;
 IF NOT FOUND OR v_operation.owner_user_id IS DISTINCT FROM v_owner OR v_operation.kind<>'submit'
  OR v_operation.submission_id IS DISTINCT FROM p_submission_id OR v_operation.request_fingerprint IS DISTINCT FROM v_expected_fingerprint
 THEN RAISE EXCEPTION 'kyc_submission_evidence_binding_conflict'; END IF;
 PERFORM 1 FROM app_private.kyc_drafts WHERE id=p_draft_id AND owner_user_id=v_owner AND state='editing'
  AND evidence_revision=p_draft_revision FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'kyc_draft_revision_conflict'; END IF;
 v_result:=app_private.finalize_kyc_submission(p_submission_id,p_front_path,p_back_path);
 PERFORM app_private.link_kyc_ocr_observation_v2(v_owner,p_draft_id,p_submission_id,p_draft_revision,p_source_revision);
 UPDATE app_private.kyc_drafts SET state='submitted',updated_at=clock_timestamp()
  WHERE id=p_draft_id AND owner_user_id=v_owner AND state='editing';
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_kyc_draft_submission'; END IF;
 INSERT INTO app_private.kyc_draft_events(draft_id,owner_user_id,event_type,actor_id)
  VALUES(p_draft_id,v_owner,'submitted',v_owner);
 RETURN v_result;
END; $$;
REVOKE ALL ON FUNCTION app_private.finalize_kyc_submission_with_ocr_v2(uuid,text,text,uuid,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app_private.finalize_kyc_submission_with_ocr_v2(uuid,text,text,uuid,text,text,uuid) TO authenticated;
CREATE FUNCTION public.finalize_kyc_submission_with_ocr_v2(uuid,text,text,uuid,text,text,uuid) RETURNS uuid
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=public,app_private,pg_temp AS $$
 SELECT app_private.finalize_kyc_submission_with_ocr_v2($1,$2,$3,$4,$5,$6,$7);
$$;
REVOKE ALL ON FUNCTION public.finalize_kyc_submission_with_ocr_v2(uuid,text,text,uuid,text,text,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.finalize_kyc_submission_with_ocr_v2(uuid,text,text,uuid,text,text,uuid) TO authenticated;

-- Safe manual-transcription result metadata; raw MRZ, DOB and document number never persist.
ALTER TABLE app_private.kyc_review_confirmations
  ADD COLUMN passport_verification_method text CHECK (passport_verification_method IS NULL OR passport_verification_method='manual_td3_v1'),
  ADD COLUMN passport_nationality text CHECK (passport_nationality IS NULL OR passport_nationality='CN'),
  ADD COLUMN passport_expiry_date date,
  ADD COLUMN passport_mrz_status text CHECK (passport_mrz_status IS NULL OR passport_mrz_status='valid'),
  ADD COLUMN passport_visual_comparison_status text CHECK (passport_visual_comparison_status IS NULL OR passport_visual_comparison_status='consistent');

CREATE FUNCTION public.stage_kyc_manual_passport_confirmation_with_ticket(
  p_ticket_id uuid,p_expected_actor_id uuid,p_expected_session_id uuid,p_submission_id uuid,p_review_version bigint,p_evidence_revision text,
  p_actual_document_type text,p_issuer_country text,p_identifier_kind text,p_confirmed_holder_name text,p_confirmed_number_hmac text,
  p_source text,p_observation_id uuid,p_document_access_refs uuid[],p_reason_code text,p_reason_detail text,p_risk_level text,p_purpose text,p_ttl_seconds integer,
  p_passport_nationality text,p_passport_expiry_date date
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,app_private,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
 IF auth.role()<>'service_role' OR p_actual_document_type<>'passport' OR p_issuer_country<>'CN' OR p_identifier_kind<>'passport'
  OR p_source<>'manual' OR p_observation_id IS NOT NULL OR p_passport_nationality<>'CN' OR p_passport_expiry_date<=current_date
  OR p_reason_code NOT IN ('ocr_unavailable','ocr_source_unavailable','ocr_unreadable','ocr_viz_incomplete','ocr_transcription_error')
  OR p_reason_code='ocr_transcription_error' AND nullif(btrim(p_reason_detail),'') IS NULL
 THEN RAISE EXCEPTION 'invalid_manual_passport_confirmation'; END IF;
 v_id:=public.stage_kyc_identity_confirmation_with_ticket(p_ticket_id,p_expected_actor_id,p_expected_session_id,p_submission_id,
  p_review_version,p_evidence_revision,p_actual_document_type,p_issuer_country,p_identifier_kind,p_confirmed_holder_name,
  p_confirmed_number_hmac,p_source,p_observation_id,p_document_access_refs,p_reason_code,p_reason_detail,p_risk_level,p_purpose,p_ttl_seconds);
 UPDATE app_private.kyc_review_confirmations SET passport_verification_method='manual_td3_v1',passport_nationality=p_passport_nationality,
  passport_expiry_date=p_passport_expiry_date,passport_mrz_status='valid',passport_visual_comparison_status='consistent'
 WHERE id=v_id AND submission_id=p_submission_id AND review_version=p_review_version AND evidence_revision=p_evidence_revision
  AND expected_actor_id=p_expected_actor_id AND purpose=p_purpose;
 IF NOT FOUND THEN RAISE EXCEPTION 'manual_passport_confirmation_unavailable'; END IF;
 RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.stage_kyc_manual_passport_confirmation_with_ticket(uuid,uuid,uuid,uuid,bigint,text,text,text,text,text,text,text,uuid,uuid[],text,text,text,text,integer,text,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.stage_kyc_manual_passport_confirmation_with_ticket(uuid,uuid,uuid,uuid,bigint,text,text,text,text,text,text,text,uuid,uuid[],text,text,text,text,integer,text,date) TO service_role;

CREATE OR REPLACE FUNCTION app_private.guard_passport_kyc_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,app_private,pg_temp AS $$
DECLARE v_ocr public.kyc_ocr_results%ROWTYPE; v_observation app_private.kyc_ocr_observations%ROWTYPE;
  v_primary app_private.kyc_review_confirmations%ROWTYPE; v_secondary app_private.kyc_review_confirmations%ROWTYPE; v_current_revision text;
BEGIN
 IF NEW.status='approved' AND OLD.status IS DISTINCT FROM 'approved' AND NEW.document_type='passport' THEN
  SELECT * INTO v_ocr FROM public.kyc_ocr_results WHERE submission_id=NEW.id;
  v_current_revision:=app_private.kyc_evidence_revision(NEW.id);
  SELECT * INTO v_observation FROM app_private.kyc_ocr_observations o WHERE o.context_kind='submission'
    AND o.context_id=NEW.id AND o.evidence_revision=v_current_revision AND o.artifact_revision=v_current_revision
    AND o.source_revision IS NOT NULL ORDER BY o.attempt DESC LIMIT 1;
  IF FOUND AND v_ocr.status='matched' AND v_observation.status='extracted' AND v_observation.actual_document_type='passport'
    AND v_observation.document_number_hmac IS NOT DISTINCT FROM v_ocr.document_number_hmac
    AND v_observation.holder_name IS NOT DISTINCT FROM v_ocr.holder_name
    AND v_observation.issuer_country='CN' AND v_observation.nationality='CN' AND v_observation.mrz_status='valid'
    AND v_observation.visual_comparison_status='consistent' AND v_observation.expiry_date>current_date
    AND v_ocr.issuer_country=v_observation.issuer_country AND v_ocr.nationality=v_observation.nationality
    AND v_ocr.mrz_status=v_observation.mrz_status AND v_ocr.visual_comparison_status=v_observation.visual_comparison_status
    AND v_ocr.expiry_date=v_observation.expiry_date THEN RETURN NEW; END IF;
  SELECT * INTO v_primary FROM app_private.kyc_review_confirmations c WHERE c.submission_id=NEW.id AND c.purpose='primary'
    AND c.consumed_xid=txid_current() AND c.passport_verification_method='manual_td3_v1' AND c.review_version=OLD.review_version
    AND c.evidence_revision=v_current_revision ORDER BY c.consumed_at DESC LIMIT 1;
  IF NOT FOUND OR v_primary.actual_document_type<>'passport' OR v_primary.identifier_kind<>'passport' OR v_primary.issuer_country<>'CN'
    OR v_primary.passport_nationality<>'CN' OR v_primary.passport_mrz_status<>'valid'
    OR v_primary.passport_visual_comparison_status<>'consistent' OR v_primary.passport_expiry_date IS NULL
    OR v_primary.passport_expiry_date<=current_date OR v_primary.reason_code NOT IN
      ('ocr_unavailable','ocr_source_unavailable','ocr_unreadable','ocr_viz_incomplete','ocr_transcription_error') THEN
    RAISE EXCEPTION 'chinese_passport_evidence_required';
  END IF;
  SELECT * INTO v_secondary FROM app_private.kyc_review_confirmations c WHERE c.submission_id=NEW.id AND c.purpose='independent_second'
   AND c.consumed_xid=txid_current() AND c.review_version=OLD.review_version AND c.evidence_revision=v_primary.evidence_revision
   AND c.actor_id<>v_primary.actor_id AND c.passport_verification_method='manual_td3_v1'
   AND c.passport_nationality=v_primary.passport_nationality AND c.passport_expiry_date=v_primary.passport_expiry_date
   AND c.passport_mrz_status=v_primary.passport_mrz_status AND c.passport_visual_comparison_status=v_primary.passport_visual_comparison_status
   AND c.actual_document_type=v_primary.actual_document_type AND c.issuer_country=v_primary.issuer_country
   AND c.identifier_kind=v_primary.identifier_kind AND c.confirmed_holder_name=v_primary.confirmed_holder_name
   AND c.confirmed_number_hmac=v_primary.confirmed_number_hmac
   ORDER BY c.consumed_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'kyc_passport_manual_evidence_required'; END IF;
 END IF;
 RETURN NEW;
END; $$;

CREATE FUNCTION public.get_kyc_submission_ocr_observation_v2(p_submission_id uuid,p_artifact_revision text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,app_private,pg_temp AS $$
DECLARE v_result jsonb;
BEGIN
 IF auth.role()<>'service_role' OR p_submission_id IS NULL
  OR app_private.kyc_evidence_revision(p_submission_id) IS DISTINCT FROM p_artifact_revision THEN RAISE EXCEPTION 'kyc_ocr_source_conflict'; END IF;
 SELECT jsonb_build_object('status',o.status,'engine',o.engine,'holderName',o.holder_name,'documentNumberHmac',o.document_number_hmac,
  'documentNumberLast4',o.document_number_last4,'expiryDate',o.expiry_date,'confidence',o.confidence,'issuerCountry',o.issuer_country,
  'nationality',o.nationality,'mrzStatus',o.mrz_status,'visualComparisonStatus',o.visual_comparison_status,'failureCode',o.failure_code,
  'sourceRevision',o.source_revision,'artifactRevision',o.artifact_revision)
 INTO v_result FROM app_private.kyc_ocr_observations o WHERE o.context_kind='submission' AND o.context_id=p_submission_id
  AND o.evidence_revision=p_artifact_revision AND o.artifact_revision=p_artifact_revision AND o.source_revision IS NOT NULL
  ORDER BY o.attempt DESC LIMIT 1;
 RETURN v_result;
END; $$;
REVOKE ALL ON FUNCTION public.get_kyc_submission_ocr_observation_v2(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_kyc_submission_ocr_observation_v2(uuid,text) TO service_role;

-- One-pass draft save + OCR uses the existing private operation ledger.
ALTER TABLE app_private.kyc_operations DROP CONSTRAINT IF EXISTS kyc_operations_kind_check;
ALTER TABLE app_private.kyc_operations ADD CONSTRAINT kyc_operations_kind_check
 CHECK (kind IN ('submit','withdraw','review','resolve','draft_ocr'));
ALTER TABLE app_private.kyc_operations ADD COLUMN lease_token uuid;
ALTER TABLE app_private.kyc_operations ADD COLUMN lease_expires_at timestamptz;
ALTER TABLE app_private.kyc_operations ADD COLUMN staging_storage_paths text[] NOT NULL DEFAULT '{}';
CREATE INDEX kyc_draft_ocr_operations_retention_idx ON app_private.kyc_operations(updated_at,id)
 WHERE kind='draft_ocr';
CREATE INDEX kyc_draft_ocr_operations_lease_idx ON app_private.kyc_operations(lease_expires_at,id)
 WHERE kind='draft_ocr' AND state='processing';

CREATE FUNCTION app_private.is_kyc_draft_storage_path_referenced(p_storage_path text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,app_private,pg_temp AS $$
BEGIN
 IF auth.role()<>'service_role' OR p_storage_path IS NULL THEN RAISE EXCEPTION 'service_role_required'; END IF;
 RETURN EXISTS(SELECT 1 FROM app_private.kyc_drafts d WHERE d.state='editing'
  AND (p_storage_path IN (d.front_storage_path,d.back_storage_path)
   OR p_storage_path=ANY(COALESCE(d.retired_storage_paths,'{}'::text[]))));
END; $$;
REVOKE ALL ON FUNCTION app_private.is_kyc_draft_storage_path_referenced(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_kyc_draft_storage_path_referenced(text) TO service_role;
CREATE FUNCTION public.is_kyc_draft_storage_path_referenced(p_storage_path text)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path=public,app_private,pg_temp AS $$
 SELECT app_private.is_kyc_draft_storage_path_referenced($1);
$$;
REVOKE ALL ON FUNCTION public.is_kyc_draft_storage_path_referenced(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.is_kyc_draft_storage_path_referenced(text) TO service_role;

CREATE FUNCTION app_private.claim_kyc_draft_ocr_operation(
 p_operation_id uuid,p_owner_user_id uuid,p_draft_id uuid,p_expected_version bigint,p_request_fingerprint text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,app_private,pg_temp AS $$
DECLARE v_operation app_private.kyc_operations%ROWTYPE; v_token uuid:=gen_random_uuid(); v_claimed boolean:=false;
BEGIN
 IF auth.role()<>'service_role' OR p_operation_id IS NULL OR p_owner_user_id IS NULL OR p_draft_id IS NULL
  OR p_request_fingerprint !~ '^[a-f0-9]{64}$' OR p_expected_version IS NOT NULL AND p_expected_version<1
  OR NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=p_owner_user_id AND u.status='active')
 THEN RAISE EXCEPTION 'invalid_kyc_draft_ocr_operation'; END IF;
 IF p_expected_version IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app_private.kyc_drafts d
  WHERE d.id=p_draft_id AND d.owner_user_id=p_owner_user_id AND d.state='editing' AND d.version=p_expected_version
    AND d.expires_at>clock_timestamp() AND d.absolute_expires_at>clock_timestamp())
 THEN RAISE EXCEPTION 'kyc_draft_conflict'; END IF;
 -- Serialize different client operation IDs for the same exact input snapshot.
 PERFORM pg_advisory_xact_lock(hashtextextended(concat_ws(':',p_owner_user_id::text,p_draft_id::text,
  coalesce(p_expected_version::text,'new'),p_request_fingerprint),721940113));
 SELECT * INTO v_operation FROM app_private.kyc_operations
  WHERE owner_user_id=p_owner_user_id AND kind='draft_ocr' AND draft_id=p_draft_id
   AND expected_version IS NOT DISTINCT FROM p_expected_version AND request_fingerprint=p_request_fingerprint
   AND state IN ('processing','succeeded')
  ORDER BY created_at DESC,id DESC LIMIT 1;
 IF FOUND THEN
  RETURN jsonb_build_object('status',v_operation.state,'duplicate',true);
 END IF;
 INSERT INTO app_private.kyc_operations(id,owner_user_id,kind,request_fingerprint,draft_id,expected_version,state,lease_token,lease_expires_at)
 VALUES(p_operation_id,p_owner_user_id,'draft_ocr',p_request_fingerprint,p_draft_id,p_expected_version,'processing',v_token,clock_timestamp()+interval '60 seconds')
 ON CONFLICT(id) DO NOTHING;
 v_claimed:=FOUND;
 SELECT * INTO v_operation FROM app_private.kyc_operations WHERE id=p_operation_id FOR UPDATE;
 IF v_operation.owner_user_id<>p_owner_user_id OR v_operation.kind<>'draft_ocr'
  OR v_operation.request_fingerprint<>p_request_fingerprint OR v_operation.draft_id<>p_draft_id
  OR v_operation.expected_version IS DISTINCT FROM p_expected_version THEN
  RAISE EXCEPTION 'kyc_operation_key_conflict';
 END IF;
 IF v_operation.state='succeeded' THEN RETURN jsonb_build_object('status','succeeded'); END IF;
 IF v_claimed THEN RETURN jsonb_build_object('status','claimed','leaseToken',v_token); END IF;
 IF v_operation.state='processing' THEN RETURN jsonb_build_object('status','processing'); END IF;
 RETURN jsonb_build_object('status',v_operation.state);
END; $$;
REVOKE ALL ON FUNCTION app_private.claim_kyc_draft_ocr_operation(uuid,uuid,uuid,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app_private.claim_kyc_draft_ocr_operation(uuid,uuid,uuid,bigint,text) TO service_role;
CREATE FUNCTION public.claim_kyc_draft_ocr_operation(p_operation_id uuid,p_owner_user_id uuid,p_draft_id uuid,p_expected_version bigint,p_request_fingerprint text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=public,app_private,pg_temp AS $$
 SELECT app_private.claim_kyc_draft_ocr_operation($1,$2,$3,$4,$5);
$$;
REVOKE ALL ON FUNCTION public.claim_kyc_draft_ocr_operation(uuid,uuid,uuid,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_kyc_draft_ocr_operation(uuid,uuid,uuid,bigint,text) TO service_role;

CREATE FUNCTION app_private.register_kyc_draft_ocr_staging_paths(
 p_operation_id uuid,p_owner_user_id uuid,p_lease_token uuid,p_document_type text,p_storage_paths text[]
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,app_private,pg_temp AS $$
DECLARE v_operation app_private.kyc_operations%ROWTYPE; v_path text; v_front boolean:=false; v_back boolean:=false;
BEGIN
 IF auth.role()<>'service_role' OR p_storage_paths IS NULL OR cardinality(p_storage_paths) NOT BETWEEN 1 AND 2
  OR p_document_type NOT IN ('national_id','passport','driving_license') THEN RAISE EXCEPTION 'invalid_kyc_staging_paths'; END IF;
 SELECT * INTO v_operation FROM app_private.kyc_operations WHERE id=p_operation_id FOR UPDATE;
 IF NOT FOUND OR v_operation.owner_user_id<>p_owner_user_id OR v_operation.kind<>'draft_ocr' OR v_operation.state<>'processing'
  OR v_operation.lease_token IS DISTINCT FROM p_lease_token OR v_operation.lease_expires_at<=clock_timestamp() THEN RETURN false; END IF;
 FOREACH v_path IN ARRAY p_storage_paths LOOP
  IF v_path !~ ('^'||p_owner_user_id::text||'/drafts/'||v_operation.draft_id::text||'/staging/'||p_operation_id::text||'/(front|back)\.(jpg|png|webp)$') THEN
   RAISE EXCEPTION 'invalid_kyc_staging_path';
  END IF;
  IF v_path ~ '/front\.' THEN v_front:=true; END IF;
  IF v_path ~ '/back\.' THEN v_back:=true; END IF;
 END LOOP;
 IF NOT v_front OR p_document_type='passport' AND v_back OR p_document_type<>'passport' AND NOT v_back
  OR cardinality(p_storage_paths)<>cardinality(ARRAY(SELECT DISTINCT paths.path FROM unnest(p_storage_paths) AS paths(path))) THEN
  RAISE EXCEPTION 'invalid_kyc_staging_sides';
 END IF;
 UPDATE app_private.kyc_operations SET staging_storage_paths=p_storage_paths,updated_at=clock_timestamp()
  WHERE id=p_operation_id AND lease_token=p_lease_token;
 RETURN FOUND;
END; $$;
REVOKE ALL ON FUNCTION app_private.register_kyc_draft_ocr_staging_paths(uuid,uuid,uuid,text,text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app_private.register_kyc_draft_ocr_staging_paths(uuid,uuid,uuid,text,text[]) TO service_role;
CREATE FUNCTION public.register_kyc_draft_ocr_staging_paths(p_operation_id uuid,p_owner_user_id uuid,p_lease_token uuid,p_document_type text,p_storage_paths text[])
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path=public,app_private,pg_temp AS $$
 SELECT app_private.register_kyc_draft_ocr_staging_paths($1,$2,$3,$4,$5);
$$;
REVOKE ALL ON FUNCTION public.register_kyc_draft_ocr_staging_paths(uuid,uuid,uuid,text,text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.register_kyc_draft_ocr_staging_paths(uuid,uuid,uuid,text,text[]) TO service_role;

CREATE FUNCTION app_private.fail_kyc_draft_ocr_operation(p_operation_id uuid,p_owner_user_id uuid,p_lease_token uuid,p_safe_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,app_private,pg_temp AS $$
DECLARE v_paths text[];
BEGIN
 IF auth.role()<>'service_role' OR p_safe_code !~ '^[a-z_]{3,40}$' THEN RAISE EXCEPTION 'invalid_kyc_draft_ocr_failure'; END IF;
 SELECT staging_storage_paths INTO v_paths FROM app_private.kyc_operations WHERE id=p_operation_id AND owner_user_id=p_owner_user_id
  AND kind='draft_ocr' AND state='processing' AND lease_token=p_lease_token AND lease_expires_at>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 INSERT INTO app_private.kyc_draft_cleanup_orphans(owner_user_id,storage_path)
  SELECT p_owner_user_id,paths.path FROM unnest(v_paths) AS paths(path) ON CONFLICT(storage_path) DO NOTHING;
 UPDATE app_private.kyc_operations SET state='failed',safe_error_code=p_safe_code,lease_token=NULL,lease_expires_at=NULL,
  staging_storage_paths='{}',updated_at=clock_timestamp() WHERE id=p_operation_id AND owner_user_id=p_owner_user_id AND lease_token=p_lease_token;
 RETURN FOUND;
END; $$;
REVOKE ALL ON FUNCTION app_private.fail_kyc_draft_ocr_operation(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app_private.fail_kyc_draft_ocr_operation(uuid,uuid,uuid,text) TO service_role;
CREATE FUNCTION public.fail_kyc_draft_ocr_operation(p_operation_id uuid,p_owner_user_id uuid,p_lease_token uuid,p_safe_code text)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path=public,app_private,pg_temp AS $$
 SELECT app_private.fail_kyc_draft_ocr_operation($1,$2,$3,$4);
$$;
REVOKE ALL ON FUNCTION public.fail_kyc_draft_ocr_operation(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fail_kyc_draft_ocr_operation(uuid,uuid,uuid,text) TO service_role;

CREATE FUNCTION app_private.complete_kyc_draft_ocr_operation_v2(
 p_operation_id uuid,p_owner_user_id uuid,p_lease_token uuid,p_request_fingerprint text,p_saved_version bigint,
 p_draft_id uuid,p_artifact_revision text,p_source_revision text,p_front_input_sha256 text,p_front_clean_sha256 text,
 p_back_input_sha256 text,p_back_clean_sha256 text,p_clean_transform_version text,p_parser_version text,p_policy_version text,
 p_engine text,p_holder_name text,p_document_number_hmac text,p_document_number_last4 text,p_status text,p_confidence numeric,
 p_issuer_country text,p_nationality text,p_mrz_status text,p_visual_comparison_status text,p_expiry_date date,p_failure_code text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,app_private,extensions,pg_temp AS $$
DECLARE v_operation app_private.kyc_operations%ROWTYPE; v_observation_id uuid;
BEGIN
 IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
 SELECT * INTO v_operation FROM app_private.kyc_operations WHERE id=p_operation_id FOR UPDATE;
 IF NOT FOUND OR v_operation.owner_user_id<>p_owner_user_id OR v_operation.kind<>'draft_ocr'
  OR v_operation.state<>'processing' OR v_operation.lease_token IS DISTINCT FROM p_lease_token
  OR v_operation.lease_expires_at<=clock_timestamp() OR v_operation.request_fingerprint<>p_request_fingerprint
  OR v_operation.draft_id<>p_draft_id OR p_saved_version IS NULL OR p_saved_version<1
  OR v_operation.expected_version IS NOT NULL AND p_saved_version NOT IN (v_operation.expected_version,v_operation.expected_version+1)
  OR v_operation.expected_version IS NULL AND p_saved_version<>1
  OR NOT EXISTS(SELECT 1 FROM app_private.kyc_drafts d WHERE d.id=p_draft_id AND d.owner_user_id=p_owner_user_id
    AND d.state='editing' AND d.version=p_saved_version AND d.evidence_revision=p_artifact_revision) THEN
  RAISE EXCEPTION 'kyc_operation_fence_conflict';
 END IF;
 v_observation_id:=app_private.record_kyc_draft_ocr_observation_v2(p_owner_user_id,p_draft_id,p_artifact_revision,p_source_revision,
  p_front_input_sha256,p_front_clean_sha256,p_back_input_sha256,p_back_clean_sha256,p_clean_transform_version,p_parser_version,
  p_policy_version,p_engine,p_holder_name,p_document_number_hmac,p_document_number_last4,p_status,p_confidence,p_issuer_country,
  p_nationality,p_mrz_status,p_visual_comparison_status,p_expiry_date,p_failure_code);
 UPDATE app_private.kyc_operations SET state='succeeded',lease_token=NULL,lease_expires_at=NULL,staging_storage_paths='{}',
  result_reference=jsonb_build_object('observationId',v_observation_id,'draftVersion',p_saved_version),updated_at=clock_timestamp()
 WHERE id=p_operation_id AND lease_token=p_lease_token;
 IF NOT FOUND THEN RAISE EXCEPTION 'kyc_operation_fence_conflict'; END IF;
 RETURN jsonb_build_object('status','succeeded','draftVersion',p_saved_version);
END; $$;
CREATE FUNCTION public.complete_kyc_draft_ocr_operation_v2(
 p_operation_id uuid,p_owner_user_id uuid,p_lease_token uuid,p_request_fingerprint text,p_saved_version bigint,
 p_draft_id uuid,p_artifact_revision text,p_source_revision text,p_front_input_sha256 text,p_front_clean_sha256 text,
 p_back_input_sha256 text,p_back_clean_sha256 text,p_clean_transform_version text,p_parser_version text,p_policy_version text,
 p_engine text,p_holder_name text,p_document_number_hmac text,p_document_number_last4 text,p_status text,p_confidence numeric,
 p_issuer_country text,p_nationality text,p_mrz_status text,p_visual_comparison_status text,p_expiry_date date,p_failure_code text
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=public,app_private,extensions,pg_temp AS $$
 SELECT app_private.complete_kyc_draft_ocr_operation_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27);
$$;
REVOKE ALL ON FUNCTION public.complete_kyc_draft_ocr_operation_v2(uuid,uuid,uuid,text,bigint,uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,numeric,text,text,text,text,date,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_kyc_draft_ocr_operation_v2(uuid,uuid,uuid,text,bigint,uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,numeric,text,text,text,text,date,text) TO service_role;
REVOKE ALL ON FUNCTION app_private.complete_kyc_draft_ocr_operation_v2(uuid,uuid,uuid,text,bigint,uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,numeric,text,text,text,text,date,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app_private.complete_kyc_draft_ocr_operation_v2(uuid,uuid,uuid,text,bigint,uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,numeric,text,text,text,text,date,text) TO service_role;

CREATE OR REPLACE FUNCTION app_private.get_my_kyc_operation(p_operation_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,app_private,pg_temp AS $$
DECLARE v_operation app_private.kyc_operations%ROWTYPE; v_status text;
BEGIN
 IF auth.role()<>'authenticated' OR auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
 SELECT * INTO v_operation FROM app_private.kyc_operations WHERE id=p_operation_id AND owner_user_id=auth.uid()
  AND kind IN ('submit','withdraw','draft_ocr');
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF v_operation.submission_id IS NOT NULL THEN
  SELECT status INTO v_status FROM public.kyc_submissions WHERE id=v_operation.submission_id AND user_id=auth.uid();
  IF v_status='pending' OR v_status='withdrawn' THEN v_operation.state:='succeeded'; END IF;
 END IF;
 RETURN jsonb_build_object('operationId',v_operation.id,'state',v_operation.state,'submissionId',v_operation.submission_id,
  'submissionStatus',v_status,'safeErrorCode',v_operation.safe_error_code,'updatedAt',v_operation.updated_at);
END; $$;

CREATE FUNCTION app_private.purge_kyc_draft_ocr_operations(p_limit integer DEFAULT 500)
RETURNS TABLE(marked_for_reconciliation integer,deleted integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,app_private,pg_temp AS $$
DECLARE v_marked integer:=0; v_deleted integer:=0; v_stale app_private.kyc_operations%ROWTYPE;
BEGIN
 IF auth.role()<>'service_role' OR p_limit IS NULL OR p_limit<1 OR p_limit>5000 THEN RAISE EXCEPTION 'invalid_kyc_operation_purge'; END IF;
 FOR v_stale IN SELECT * FROM app_private.kyc_operations WHERE kind='draft_ocr' AND state='processing'
  AND lease_expires_at<=clock_timestamp() ORDER BY lease_expires_at,id LIMIT p_limit FOR UPDATE SKIP LOCKED LOOP
  INSERT INTO app_private.kyc_draft_cleanup_orphans(owner_user_id,storage_path)
   SELECT v_stale.owner_user_id,paths.path FROM unnest(v_stale.staging_storage_paths) AS paths(path) ON CONFLICT(storage_path) DO NOTHING;
  UPDATE app_private.kyc_operations SET state='needs_reconciliation',safe_error_code='reconciliation_required',
   lease_token=NULL,lease_expires_at=NULL,staging_storage_paths='{}',updated_at=clock_timestamp() WHERE id=v_stale.id;
  v_marked:=v_marked+1;
 END LOOP;
 WITH expired AS (SELECT id FROM app_private.kyc_operations WHERE kind='draft_ocr'
  AND ((state IN ('succeeded','failed') AND updated_at<clock_timestamp()-interval '7 days')
    OR (state='needs_reconciliation' AND updated_at<clock_timestamp()-interval '30 days'))
  ORDER BY updated_at,id LIMIT p_limit FOR UPDATE SKIP LOCKED)
 DELETE FROM app_private.kyc_operations o USING expired WHERE o.id=expired.id;
 GET DIAGNOSTICS v_deleted=ROW_COUNT;
 RETURN QUERY SELECT v_marked,v_deleted;
END; $$;
REVOKE ALL ON FUNCTION app_private.purge_kyc_draft_ocr_operations(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app_private.purge_kyc_draft_ocr_operations(integer) TO service_role;
CREATE FUNCTION public.purge_kyc_draft_ocr_operations(p_limit integer DEFAULT 500)
RETURNS TABLE(marked_for_reconciliation integer,deleted integer)
LANGUAGE sql SECURITY INVOKER SET search_path=public,app_private,pg_temp AS $$
 SELECT * FROM app_private.purge_kyc_draft_ocr_operations($1);
$$;
REVOKE ALL ON FUNCTION public.purge_kyc_draft_ocr_operations(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.purge_kyc_draft_ocr_operations(integer) TO service_role;
NOTIFY pgrst,'reload schema';
