-- Cross-account KYC identity protection. The gate starts closed; historical
-- coverage and the coordinated application rollout must be completed before it
-- can be opened by a separately authorized operational procedure.

CREATE TABLE app_private.kyc_identity_control (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  status text NOT NULL CHECK (status IN ('blocked', 'migrating', 'ready', 'paused')),
  confirmation_ttl_seconds integer CHECK (confirmation_ttl_seconds > 0),
  coverage_epoch bigint NOT NULL DEFAULT 0 CHECK (coverage_epoch >= 0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO app_private.kyc_identity_control(singleton, status) VALUES (true, 'blocked');

CREATE TABLE app_private.kyc_review_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expected_actor_id uuid NOT NULL REFERENCES public.users(id),
  expected_session_id uuid NOT NULL,
  actor_id uuid REFERENCES public.users(id),
  session_id uuid,
  attested_aal text CHECK (attested_aal IS NULL OR attested_aal = 'aal2'),
  submission_id uuid NOT NULL REFERENCES public.kyc_submissions(id) ON DELETE CASCADE,
  review_version bigint NOT NULL,
  evidence_revision text NOT NULL,
  actual_document_type text NOT NULL CHECK (actual_document_type IN ('national_id', 'passport', 'driving_license')),
  issuer_country text NOT NULL CHECK (issuer_country ~ '^[A-Z]{2}$'),
  identifier_kind text NOT NULL CHECK (identifier_kind IN ('my_ic', 'passport')),
  confirmed_holder_name text NOT NULL CHECK (char_length(btrim(confirmed_holder_name)) BETWEEN 2 AND 100),
  confirmed_number_hmac text NOT NULL CHECK (confirmed_number_hmac ~ '^[0-9a-f]{64}$'),
  hash_version text NOT NULL CHECK (hash_version = 'hmac_sha256_v1'),
  source text NOT NULL CHECK (source IN ('ocr', 'manual')),
  observation_id uuid,
  document_access_refs uuid[] NOT NULL DEFAULT '{}',
  reason_code text,
  reason_detail text,
  risk_level text NOT NULL CHECK (risk_level IN ('normal', 'high')),
  purpose text NOT NULL CHECK (purpose IN ('primary', 'independent_second', 'resolution')),
  resolution_id uuid,
  resolution_version bigint,
  proposal_digest text,
  resolution_actor_role text CHECK (resolution_actor_role IS NULL OR resolution_actor_role IN ('primary', 'independent_second')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  attested_at timestamptz,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  consumed_xid bigint,
  invalidated_at timestamptz,
  CHECK (expires_at > created_at),
  CHECK ((attested_at IS NULL) = (actor_id IS NULL)),
  CHECK ((attested_at IS NULL) = (session_id IS NULL)),
  CHECK ((consumed_at IS NULL) = (consumed_xid IS NULL))
);
CREATE INDEX kyc_review_confirmation_case_lookup
  ON app_private.kyc_review_confirmations(submission_id, review_version, evidence_revision, purpose, created_at DESC);
CREATE UNIQUE INDEX kyc_review_confirmation_retry_key
  ON app_private.kyc_review_confirmations(submission_id, review_version, evidence_revision, purpose, expected_actor_id)
  WHERE purpose <> 'resolution';
CREATE UNIQUE INDEX kyc_resolution_confirmation_retry_key
  ON app_private.kyc_review_confirmations(resolution_id, resolution_version, proposal_digest, resolution_actor_role, expected_actor_id)
  WHERE purpose='resolution';

CREATE TABLE app_private.kyc_identity_bindings (
  identity_scope text NOT NULL CHECK (identity_scope = 'MY_IC'),
  hash_version text NOT NULL CHECK (hash_version = 'hmac_sha256_v1'),
  document_number_hmac text NOT NULL CHECK (document_number_hmac ~ '^[0-9a-f]{64}$'),
  owner_user_id uuid NOT NULL REFERENCES public.users(id),
  current_verified_submission_id uuid NOT NULL REFERENCES public.kyc_submissions(id),
  state text NOT NULL CHECK (state IN ('active', 'reserved_previous', 'reserved_closed', 'legacy_reserved', 'legacy_conflict', 'released_by_resolution')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (identity_scope, hash_version, document_number_hmac)
);
CREATE UNIQUE INDEX kyc_identity_one_active_key_per_owner
  ON app_private.kyc_identity_bindings(identity_scope, owner_user_id)
  WHERE state = 'active';
CREATE INDEX kyc_identity_bindings_owner_state
  ON app_private.kyc_identity_bindings(owner_user_id, state);

CREATE FUNCTION app_private.reserve_kyc_identity_after_account_close()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,app_private,pg_temp AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM 'deleted' AND NEW.status='deleted' THEN
    UPDATE app_private.kyc_identity_bindings SET state='reserved_closed',version=version+1,updated_at=clock_timestamp()
      WHERE owner_user_id=NEW.id AND state='active';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION app_private.reserve_kyc_identity_after_account_close() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER reserve_kyc_identity_after_account_close
AFTER UPDATE OF status ON public.users FOR EACH ROW
EXECUTE FUNCTION app_private.reserve_kyc_identity_after_account_close();

CREATE FUNCTION app_private.kyc_user_has_review_permission(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,app_private,pg_temp AS $$
  SELECT p_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.users u WHERE u.id=p_user_id AND u.status='active'
      AND (
        EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id
          WHERE ur.user_id=u.id AND ur.vendor_id IS NULL AND ur.outlet_id IS NULL AND r.name='super_admin')
        OR EXISTS (SELECT 1 FROM public.staff_role_assignments a
          JOIN public.staff_roles r ON r.id=a.role_id AND r.is_active
          JOIN public.staff_role_modules rm ON rm.role_id=r.id
          JOIN public.staff_modules m ON m.id=rm.module_id AND m.is_active
          JOIN public.staff_module_permissions mp ON mp.module_id=m.id
          JOIN public.staff_permissions p ON p.id=mp.permission_id
          WHERE a.user_id=u.id AND a.revoked_at IS NULL AND p.key='admin.kyc.review')
        OR EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id
          JOIN public.staff_module_legacy_roles lm ON lm.role_name=r.name AND lm.grants_permissions
          JOIN public.staff_modules m ON m.is_active
          JOIN public.staff_module_permissions mp ON mp.module_id=m.id
          JOIN public.staff_permissions p ON p.id=mp.permission_id
          WHERE ur.user_id=u.id AND ur.vendor_id IS NULL AND ur.outlet_id IS NULL AND p.key='admin.kyc.review')
      )
  );
$$;
REVOKE ALL ON FUNCTION app_private.kyc_user_has_review_permission(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE app_private.kyc_identity_resolutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('replacement', 'legacy_conflict', 'ownership_correction', 'retention_release')),
  related_case_id uuid REFERENCES public.kyc_submissions(id),
  related_submission_ids uuid[] NOT NULL DEFAULT '{}',
  support_ticket_ref text,
  affected_owner_ids uuid[] NOT NULL,
  affected_keys jsonb NOT NULL,
  proposal jsonb NOT NULL DEFAULT '{}'::jsonb,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  proposal_digest text,
  status text NOT NULL CHECK (status IN ('open', 'evidence_required', 'second_review', 'approved', 'applied', 'declined', 'cancelled')),
  reason_code text NOT NULL,
  created_by uuid NOT NULL REFERENCES public.users(id),
  primary_actor_id uuid NOT NULL REFERENCES public.users(id),
  secondary_actor_id uuid REFERENCES public.users(id),
  primary_confirmation_id uuid REFERENCES app_private.kyc_review_confirmations(id),
  secondary_confirmation_id uuid REFERENCES app_private.kyc_review_confirmations(id),
  operation_id uuid,
  applied_at timestamptz,
  applied_by uuid REFERENCES public.users(id),
  applied_xid bigint,
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES public.users(id),
  cancellation_reason_code text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (primary_actor_id <> secondary_actor_id),
  CHECK ((status='applied') = (applied_at IS NOT NULL AND applied_by IS NOT NULL AND applied_xid IS NOT NULL)),
  CHECK ((status='cancelled') = (cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL AND cancellation_reason_code IS NOT NULL))
);
CREATE UNIQUE INDEX kyc_identity_resolution_one_active_per_case
  ON app_private.kyc_identity_resolutions(related_case_id)
  WHERE status IN ('open','evidence_required','second_review','approved');
CREATE UNIQUE INDEX kyc_identity_resolution_one_active_per_key
  ON app_private.kyc_identity_resolutions((affected_keys->0->>'hash_version'),(affected_keys->0->>'key'))
  WHERE status IN ('open','evidence_required','second_review','approved');

CREATE TABLE app_private.kyc_identity_resolution_authorizations (
  resolution_id uuid NOT NULL REFERENCES app_private.kyc_identity_resolutions(id) ON DELETE CASCADE,
  resolution_version bigint NOT NULL,
  proposal_digest text NOT NULL,
  primary_actor_id uuid NOT NULL REFERENCES public.users(id),
  secondary_actor_id uuid NOT NULL REFERENCES public.users(id),
  authorized_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (resolution_id, resolution_version),
  CHECK (primary_actor_id <> secondary_actor_id),
  CHECK (expires_at > authorized_at)
);
ALTER TABLE app_private.kyc_identity_resolution_authorizations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app_private.kyc_identity_resolution_authorizations FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION app_private.protect_kyc_identity_resolution()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=app_private,pg_temp AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'kyc_identity_resolution_append_only'; END IF;
  IF (OLD.id,OLD.kind,OLD.related_case_id,OLD.related_submission_ids,OLD.support_ticket_ref,OLD.affected_owner_ids,
      OLD.affected_keys,OLD.proposal,OLD.version,OLD.proposal_digest,OLD.reason_code,OLD.created_by,OLD.primary_actor_id,
      OLD.secondary_actor_id,OLD.operation_id)
     IS DISTINCT FROM
     (NEW.id,NEW.kind,NEW.related_case_id,NEW.related_submission_ids,NEW.support_ticket_ref,NEW.affected_owner_ids,
      NEW.affected_keys,NEW.proposal,NEW.version,NEW.proposal_digest,NEW.reason_code,NEW.created_by,NEW.primary_actor_id,
      NEW.secondary_actor_id,NEW.operation_id)
     AND OLD.status IN ('second_review','applied','declined','cancelled') THEN RAISE EXCEPTION 'kyc_identity_resolution_immutable'; END IF;
  IF OLD.status IN ('applied','declined','cancelled') AND NEW.status<>OLD.status THEN RAISE EXCEPTION 'kyc_identity_resolution_terminal'; END IF;
  IF OLD.status='cancelled' AND (OLD.cancelled_at,OLD.cancelled_by,OLD.cancellation_reason_code)
     IS DISTINCT FROM (NEW.cancelled_at,NEW.cancelled_by,NEW.cancellation_reason_code) THEN
    RAISE EXCEPTION 'kyc_identity_resolution_immutable';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION app_private.protect_kyc_identity_resolution() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER protect_kyc_identity_resolution BEFORE UPDATE OR DELETE ON app_private.kyc_identity_resolutions
FOR EACH ROW EXECUTE FUNCTION app_private.protect_kyc_identity_resolution();

INSERT INTO public.staff_permissions(key,module,action,description,is_system)
VALUES ('admin.kyc.resolve_identity','admin','kyc.resolve_identity','Resolve a KYC identity ownership conflict',true)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE app_private.kyc_identity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_scope text NOT NULL,
  hash_version text NOT NULL,
  document_number_hmac text NOT NULL,
  resolution_id uuid REFERENCES app_private.kyc_identity_resolutions(id),
  primary_confirmation_id uuid REFERENCES app_private.kyc_review_confirmations(id),
  secondary_confirmation_id uuid REFERENCES app_private.kyc_review_confirmations(id),
  submission_id uuid REFERENCES public.kyc_submissions(id),
  old_owner_user_id uuid REFERENCES public.users(id),
  new_owner_user_id uuid REFERENCES public.users(id),
  old_state text,
  new_state text NOT NULL,
  actor_ids uuid[] NOT NULL,
  reason_code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE app_private.kyc_ocr_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  context_kind text NOT NULL CHECK (context_kind IN ('draft', 'submission')),
  context_id uuid NOT NULL,
  evidence_revision text NOT NULL,
  attempt integer NOT NULL CHECK (attempt > 0),
  engine text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  holder_name text,
  document_number_hmac text CHECK (document_number_hmac IS NULL OR document_number_hmac ~ '^[0-9a-f]{64}$'),
  hash_version text,
  document_number_last4 text CHECK (document_number_last4 IS NULL OR document_number_last4 ~ '^[A-Z0-9]{4}$'),
  actual_document_type text,
  issuer_country text,
  status text NOT NULL CHECK (status IN ('extracted', 'matched', 'mismatch', 'unreadable', 'unavailable', 'invalid_response')),
  confidence numeric,
  failure_code text,
  UNIQUE (context_kind, context_id, evidence_revision, attempt)
);

CREATE TABLE app_private.kyc_operations (
  id uuid PRIMARY KEY,
  owner_user_id uuid NOT NULL REFERENCES public.users(id),
  kind text NOT NULL CHECK (kind IN ('submit', 'withdraw', 'review', 'resolve')),
  request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  draft_id uuid,
  submission_id uuid REFERENCES public.kyc_submissions(id),
  expected_version bigint,
  state text NOT NULL CHECK (state IN ('received', 'processing', 'succeeded', 'failed', 'needs_reconciliation')),
  result_reference jsonb,
  safe_error_code text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (owner_user_id, id)
);

-- User-declared identity is preserved separately from profile and OCR values.
CREATE TABLE app_private.kyc_user_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL UNIQUE REFERENCES public.kyc_submissions(id) ON DELETE RESTRICT,
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  holder_name text NOT NULL CHECK (length(btrim(holder_name)) BETWEEN 2 AND 100),
  document_type text NOT NULL CHECK (document_type IN ('national_id','passport','driving_license')),
  document_number_hmac text NOT NULL CHECK (document_number_hmac ~ '^[a-f0-9]{64}$'),
  hash_version text NOT NULL CHECK (hash_version = 'hmac_sha256_v1'),
  document_number_last4 text NOT NULL CHECK (document_number_last4 ~ '^[A-Z0-9]{4}$'),
  evidence_revision text NOT NULL,
  confirmed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE app_private.kyc_user_confirmations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app_private.kyc_user_confirmations FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION app_private.record_kyc_user_confirmation(
  p_submission_id uuid,p_owner_user_id uuid,p_holder_name text,p_document_type text,
  p_document_number_hmac text,p_hash_version text,p_document_number_last4 text,p_evidence_revision text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,app_private,pg_temp AS $$
DECLARE v_case public.kyc_submissions%ROWTYPE; v_id uuid;
BEGIN
  IF auth.role()<>'service_role' OR p_owner_user_id IS NULL OR p_submission_id IS NULL
     OR length(btrim(coalesce(p_holder_name,''))) NOT BETWEEN 2 AND 100
     OR p_document_type NOT IN ('national_id','passport','driving_license')
     OR p_hash_version<>'hmac_sha256_v1' OR p_document_number_hmac !~ '^[a-f0-9]{64}$'
     OR p_document_number_last4 !~ '^[A-Z0-9]{4}$' OR p_evidence_revision IS NULL THEN
    RAISE EXCEPTION 'invalid_user_kyc_confirmation';
  END IF;
  SELECT * INTO v_case FROM public.kyc_submissions WHERE id=p_submission_id AND user_id=p_owner_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'kyc_confirmation_state_conflict'; END IF;
  SELECT id INTO v_id FROM app_private.kyc_user_confirmations WHERE submission_id=p_submission_id;
  IF FOUND THEN
    IF NOT EXISTS(SELECT 1 FROM app_private.kyc_user_confirmations WHERE id=v_id AND owner_user_id=p_owner_user_id
      AND holder_name=btrim(p_holder_name) AND document_type=p_document_type AND document_number_hmac=p_document_number_hmac
      AND hash_version=p_hash_version AND document_number_last4=p_document_number_last4 AND evidence_revision=p_evidence_revision)
      THEN RAISE EXCEPTION 'kyc_confirmation_conflict'; END IF;
    RETURN v_id;
  END IF;
  IF v_case.status<>'draft' THEN RAISE EXCEPTION 'kyc_confirmation_state_conflict'; END IF;
  INSERT INTO app_private.kyc_user_confirmations(submission_id,owner_user_id,holder_name,document_type,
    document_number_hmac,hash_version,document_number_last4,evidence_revision)
  VALUES(p_submission_id,p_owner_user_id,btrim(p_holder_name),p_document_type,p_document_number_hmac,
    p_hash_version,p_document_number_last4,p_evidence_revision) RETURNING id INTO v_id;
  UPDATE public.kyc_submissions SET legal_name_snapshot=btrim(p_holder_name),document_type=p_document_type,
    ic_hash=p_document_number_hmac,ic_hash_version=p_hash_version,identity_snapshot_captured_at=clock_timestamp()
  WHERE id=p_submission_id AND user_id=p_owner_user_id AND status='draft';
  IF NOT FOUND THEN RAISE EXCEPTION 'kyc_confirmation_state_conflict'; END IF;
  RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION app_private.record_kyc_user_confirmation(uuid,uuid,text,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app_private.record_kyc_user_confirmation(uuid,uuid,text,text,text,text,text,text) TO service_role;
CREATE FUNCTION public.record_kyc_user_confirmation(
  p_submission_id uuid,p_owner_user_id uuid,p_holder_name text,p_document_type text,
  p_document_number_hmac text,p_hash_version text,p_document_number_last4 text,p_evidence_revision text
) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path=public,app_private,pg_temp AS $$
  SELECT app_private.record_kyc_user_confirmation($1,$2,$3,$4,$5,$6,$7,$8);
$$;
REVOKE ALL ON FUNCTION public.record_kyc_user_confirmation(uuid,uuid,text,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_kyc_user_confirmation(uuid,uuid,text,text,text,text,text,text) TO service_role;

CREATE TABLE app_private.kyc_review_countersign_authorizations (
  submission_id uuid NOT NULL REFERENCES public.kyc_submissions(id) ON DELETE CASCADE,
  review_version bigint NOT NULL,
  evidence_revision text NOT NULL,
  primary_actor_id uuid NOT NULL REFERENCES public.users(id),
  secondary_actor_id uuid NOT NULL REFERENCES public.users(id),
  authorized_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (submission_id, review_version, evidence_revision, secondary_actor_id),
  CHECK (primary_actor_id <> secondary_actor_id),
  CHECK (expires_at > authorized_at)
);

CREATE FUNCTION app_private.get_kyc_evidence_revision(p_submission_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, app_private, pg_temp AS $$
  SELECT CASE WHEN auth.role() = 'service_role' THEN app_private.kyc_evidence_revision(p_submission_id) END;
$$;
REVOKE ALL ON FUNCTION app_private.get_kyc_evidence_revision(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.get_kyc_evidence_revision(uuid) TO service_role;
CREATE FUNCTION public.get_kyc_evidence_revision(p_submission_id uuid)
RETURNS text LANGUAGE sql SECURITY INVOKER SET search_path = public, app_private, pg_temp AS $$
  SELECT app_private.get_kyc_evidence_revision($1);
$$;
REVOKE ALL ON FUNCTION public.get_kyc_evidence_revision(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_kyc_evidence_revision(uuid) TO service_role;

CREATE FUNCTION app_private.get_kyc_review_confirmation_ids(
  p_submission_id uuid,p_expected_version bigint,p_evidence_revision text,p_primary_actor_id uuid,p_primary_session_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,app_private,pg_temp AS $$
DECLARE v_primary app_private.kyc_review_confirmations%ROWTYPE; v_secondary app_private.kyc_review_confirmations%ROWTYPE; v_count integer;
BEGIN
  IF auth.role()<>'service_role' OR p_submission_id IS NULL OR p_primary_actor_id IS NULL OR p_primary_session_id IS NULL THEN
    RAISE EXCEPTION 'service_role_required'; END IF;
  SELECT count(*) INTO v_count FROM app_private.kyc_review_confirmations c
    WHERE c.submission_id=p_submission_id AND c.review_version=p_expected_version AND c.evidence_revision=p_evidence_revision
      AND c.purpose='primary' AND c.expected_actor_id=p_primary_actor_id AND c.actor_id=p_primary_actor_id
      AND c.session_id=p_primary_session_id AND c.attested_aal='aal2' AND c.attested_at IS NOT NULL
      AND c.expires_at>clock_timestamp() AND c.consumed_at IS NULL AND c.invalidated_at IS NULL
      AND app_private.is_live_kyc_session(c.actor_id,c.session_id)
      AND app_private.kyc_user_has_review_permission(c.actor_id);
  IF v_count<>1 THEN RETURN NULL; END IF;
  SELECT * INTO v_primary FROM app_private.kyc_review_confirmations c
    WHERE c.submission_id=p_submission_id AND c.review_version=p_expected_version AND c.evidence_revision=p_evidence_revision
      AND c.purpose='primary' AND c.expected_actor_id=p_primary_actor_id AND c.actor_id=p_primary_actor_id
      AND c.session_id=p_primary_session_id AND c.attested_aal='aal2' AND c.attested_at IS NOT NULL
      AND c.expires_at>clock_timestamp() AND c.consumed_at IS NULL AND c.invalidated_at IS NULL
      AND app_private.is_live_kyc_session(c.actor_id,c.session_id)
      AND app_private.kyc_user_has_review_permission(c.actor_id);
  SELECT count(*) INTO v_count FROM app_private.kyc_review_confirmations c
    WHERE c.submission_id=p_submission_id AND c.review_version=p_expected_version AND c.evidence_revision=p_evidence_revision
      AND c.purpose='independent_second' AND c.actor_id IS NOT NULL AND c.actor_id<>p_primary_actor_id
      AND c.attested_aal='aal2' AND c.attested_at IS NOT NULL AND c.expires_at>clock_timestamp()
      AND c.consumed_at IS NULL AND c.invalidated_at IS NULL
      AND c.actual_document_type=v_primary.actual_document_type AND c.issuer_country=v_primary.issuer_country
      AND c.identifier_kind=v_primary.identifier_kind AND c.confirmed_holder_name=v_primary.confirmed_holder_name
      AND c.confirmed_number_hmac=v_primary.confirmed_number_hmac
      AND app_private.is_live_kyc_session(c.actor_id,c.session_id)
      AND app_private.kyc_user_has_review_permission(c.actor_id)
      AND EXISTS(SELECT 1 FROM app_private.kyc_review_countersign_authorizations a WHERE a.submission_id=p_submission_id
        AND a.review_version=p_expected_version AND a.evidence_revision=p_evidence_revision
        AND a.primary_actor_id=p_primary_actor_id AND a.secondary_actor_id=c.actor_id AND a.expires_at>clock_timestamp());
  IF v_count<>1 THEN RETURN jsonb_build_object('primaryConfirmationId',v_primary.id,'secondaryConfirmationId',NULL); END IF;
  SELECT * INTO v_secondary FROM app_private.kyc_review_confirmations c
    WHERE c.submission_id=p_submission_id AND c.review_version=p_expected_version AND c.evidence_revision=p_evidence_revision
      AND c.purpose='independent_second' AND c.actor_id IS NOT NULL AND c.actor_id<>p_primary_actor_id
      AND c.attested_aal='aal2' AND c.attested_at IS NOT NULL AND c.expires_at>clock_timestamp()
      AND c.consumed_at IS NULL AND c.invalidated_at IS NULL
      AND c.actual_document_type=v_primary.actual_document_type AND c.issuer_country=v_primary.issuer_country
      AND c.identifier_kind=v_primary.identifier_kind AND c.confirmed_holder_name=v_primary.confirmed_holder_name
      AND c.confirmed_number_hmac=v_primary.confirmed_number_hmac
      AND app_private.is_live_kyc_session(c.actor_id,c.session_id)
      AND app_private.kyc_user_has_review_permission(c.actor_id)
      AND EXISTS(SELECT 1 FROM app_private.kyc_review_countersign_authorizations a WHERE a.submission_id=p_submission_id
        AND a.review_version=p_expected_version AND a.evidence_revision=p_evidence_revision
        AND a.primary_actor_id=p_primary_actor_id AND a.secondary_actor_id=c.actor_id AND a.expires_at>clock_timestamp());
  RETURN jsonb_build_object('primaryConfirmationId',v_primary.id,'secondaryConfirmationId',v_secondary.id);
END; $$;
REVOKE ALL ON FUNCTION app_private.get_kyc_review_confirmation_ids(uuid,bigint,text,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION app_private.get_kyc_review_confirmation_ids(uuid,bigint,text,uuid,uuid) TO service_role;

CREATE FUNCTION app_private.list_kyc_countersign_candidates(p_submission_id uuid,p_expected_version bigint)
RETURNS TABLE(user_id uuid,display_name text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,app_private,auth,pg_temp AS $$
DECLARE v_case public.kyc_submissions%ROWTYPE; v_session_id uuid;
BEGIN
  IF auth.role()<>'authenticated' OR auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  v_session_id:=NULLIF(auth.jwt()->>'session_id','')::uuid;
  IF NOT app_private.has_live_kyc_reviewer_session(auth.uid(),v_session_id) THEN RAISE EXCEPTION 'kyc_permission_required'; END IF;
  SELECT * INTO v_case FROM public.kyc_submissions WHERE id=p_submission_id AND status='pending' AND review_version=p_expected_version;
  IF NOT FOUND OR (v_case.assigned_to IS DISTINCT FROM auth.uid() AND NOT app_private.is_kyc_review_super_admin()) THEN RAISE EXCEPTION 'kyc_not_assigned'; END IF;
  RETURN QUERY SELECT u.id,coalesce(nullif(btrim(u.full_name),''),'Reviewer') FROM public.users u
    WHERE u.id<>auth.uid() AND u.id<>v_case.user_id AND u.status='active'
      AND app_private.kyc_user_has_review_permission(u.id)
    ORDER BY coalesce(nullif(btrim(u.full_name),''),'Reviewer'),u.id LIMIT 50;
END; $$;
REVOKE ALL ON FUNCTION app_private.list_kyc_countersign_candidates(uuid,bigint) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION app_private.list_kyc_countersign_candidates(uuid,bigint) TO authenticated;
CREATE FUNCTION public.list_kyc_countersign_candidates(p_submission_id uuid,p_expected_version bigint)
RETURNS TABLE(user_id uuid,display_name text) LANGUAGE sql SECURITY INVOKER SET search_path=public,app_private,pg_temp AS $$
  SELECT * FROM app_private.list_kyc_countersign_candidates($1,$2);
$$;
REVOKE ALL ON FUNCTION public.list_kyc_countersign_candidates(uuid,bigint) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.list_kyc_countersign_candidates(uuid,bigint) TO authenticated;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS verified_kyc_submission_id uuid REFERENCES public.kyc_submissions(id);

DO $private_tables$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'kyc_identity_control', 'kyc_review_confirmations', 'kyc_identity_bindings',
    'kyc_identity_resolutions', 'kyc_identity_resolution_authorizations', 'kyc_identity_events', 'kyc_ocr_observations', 'kyc_operations',
    'kyc_review_countersign_authorizations'
  ] LOOP
    EXECUTE format('ALTER TABLE app_private.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE app_private.%I FROM PUBLIC, anon, authenticated, service_role', table_name);
  END LOOP;
END;
$private_tables$;

CREATE FUNCTION app_private.is_live_kyc_session(p_user_id uuid, p_session_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = auth, public, pg_temp
AS $$
  SELECT p_user_id IS NOT NULL AND p_session_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM auth.sessions s WHERE s.id = p_session_id AND s.user_id = p_user_id
      AND (s.not_after IS NULL OR s.not_after > clock_timestamp()))
$$;
REVOKE ALL ON FUNCTION app_private.is_live_kyc_session(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION app_private.has_live_kyc_reviewer_session(p_user_id uuid, p_session_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = auth, public, app_private, pg_temp AS $$
  SELECT auth.uid() = p_user_id AND auth.role() = 'authenticated'
    AND auth.jwt() ->> 'aal' = 'aal2'
    AND NULLIF(auth.jwt() ->> 'session_id', '')::uuid = p_session_id
    AND app_private.is_live_kyc_session(p_user_id, p_session_id)
    AND public.has_staff_permission(p_user_id, 'admin.kyc.review');
$$;
REVOKE ALL ON FUNCTION app_private.has_live_kyc_reviewer_session(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION app_private.has_kyc_identity_resolution_permission(p_user_id uuid,p_session_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,app_private,auth,pg_temp AS $$
  SELECT auth.role()='authenticated' AND auth.uid()=p_user_id
    AND app_private.has_live_kyc_reviewer_session(p_user_id,p_session_id)
    AND EXISTS (SELECT 1 FROM public.staff_role_assignments a
      JOIN public.staff_roles r ON r.id=a.role_id AND r.is_active
      JOIN public.staff_role_permissions rp ON rp.role_id=r.id
      JOIN public.staff_permissions p ON p.id=rp.permission_id AND p.key='admin.kyc.resolve_identity'
      WHERE a.user_id=p_user_id AND a.revoked_at IS NULL);
$$;
REVOKE ALL ON FUNCTION app_private.has_kyc_identity_resolution_permission(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION app_private.kyc_identity_resolver_candidates(p_resolution_id uuid,p_expected_version bigint)
RETURNS TABLE(user_id uuid,display_name text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,app_private,auth,pg_temp AS $$
DECLARE v_resolution app_private.kyc_identity_resolutions%ROWTYPE; v_session uuid;
BEGIN
  v_session:=NULLIF(auth.jwt()->>'session_id','')::uuid;
  IF NOT app_private.has_kyc_identity_resolution_permission(auth.uid(),v_session) THEN RAISE EXCEPTION 'kyc_identity_resolution_permission_required'; END IF;
  SELECT * INTO v_resolution FROM app_private.kyc_identity_resolutions WHERE id=p_resolution_id AND version=p_expected_version;
  IF NOT FOUND OR v_resolution.status<>'open' OR v_resolution.primary_actor_id<>auth.uid() THEN RAISE EXCEPTION 'kyc_identity_resolution_changed'; END IF;
  RETURN QUERY SELECT u.id,coalesce(nullif(btrim(u.full_name),''),'Reviewer') FROM public.users u
    WHERE u.status='active' AND u.id<>auth.uid() AND NOT (u.id=ANY(v_resolution.affected_owner_ids)
      OR u.id=(v_resolution.proposal->>'target_owner_id')::uuid)
      AND app_private.kyc_user_has_review_permission(u.id)
      AND EXISTS (SELECT 1 FROM public.staff_role_assignments a JOIN public.staff_roles r ON r.id=a.role_id AND r.is_active
        JOIN public.staff_role_permissions rp ON rp.role_id=r.id JOIN public.staff_permissions p ON p.id=rp.permission_id
        WHERE a.user_id=u.id AND a.revoked_at IS NULL AND p.key='admin.kyc.resolve_identity')
    ORDER BY coalesce(nullif(btrim(u.full_name),''),'Reviewer'),u.id LIMIT 50;
END; $$;
REVOKE ALL ON FUNCTION app_private.kyc_identity_resolver_candidates(uuid,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION app_private.kyc_identity_resolver_candidates(uuid,bigint) TO authenticated;
CREATE FUNCTION public.list_kyc_identity_resolver_candidates(p_resolution_id uuid,p_expected_version bigint)
RETURNS TABLE(user_id uuid,display_name text) LANGUAGE sql SECURITY INVOKER SET search_path=public,app_private,pg_temp AS $$
  SELECT * FROM app_private.kyc_identity_resolver_candidates($1,$2);
$$;
REVOKE ALL ON FUNCTION public.list_kyc_identity_resolver_candidates(uuid,bigint) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.list_kyc_identity_resolver_candidates(uuid,bigint) TO authenticated;

CREATE FUNCTION app_private.create_kyc_identity_resolution(
  p_submission_id uuid,p_kind text,p_reason_code text,p_support_ticket_ref text,p_operation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,app_private,auth,extensions,pg_temp AS $$
DECLARE v_actor uuid:=auth.uid(); v_session uuid:=NULLIF(auth.jwt()->>'session_id','')::uuid;
  v_case public.kyc_submissions%ROWTYPE; v_binding app_private.kyc_identity_bindings%ROWTYPE;
  v_old app_private.kyc_identity_bindings%ROWTYPE; v_owners uuid[]; v_cases uuid[]; v_keys jsonb;
  v_proposal jsonb; v_digest text; v_fingerprint text; v_resolution uuid; v_ttl integer; v_operation app_private.kyc_operations%ROWTYPE;
  v_status text; v_version bigint;
BEGIN
  IF NOT app_private.has_kyc_identity_resolution_permission(v_actor,v_session) THEN RAISE EXCEPTION 'kyc_identity_resolution_permission_required'; END IF;
  IF p_kind NOT IN ('replacement','legacy_conflict','ownership_correction') OR p_reason_code NOT IN ('legacy_resolution','identity_replacement')
     OR p_operation_id IS NULL OR p_submission_id IS NULL
     OR (p_support_ticket_ref IS NOT NULL AND btrim(p_support_ticket_ref) !~ '^[A-Za-z0-9_-]{1,80}$') THEN
    RAISE EXCEPTION 'invalid_kyc_identity_resolution';
  END IF;
  v_fingerprint:=encode(extensions.digest(convert_to(concat_ws(':',p_submission_id,p_kind,p_reason_code,coalesce(NULLIF(btrim(p_support_ticket_ref),''),'')),'UTF8'),'sha256'),'hex');
  SELECT * INTO v_operation FROM app_private.kyc_operations WHERE id=p_operation_id FOR UPDATE;
  IF FOUND THEN
    IF v_operation.owner_user_id<>v_actor OR v_operation.kind<>'resolve' OR v_operation.request_fingerprint<>v_fingerprint THEN RAISE EXCEPTION 'operation_key_conflict'; END IF;
    IF v_operation.state='succeeded' THEN
      v_resolution:=(v_operation.result_reference->>'resolution_id')::uuid;
      SELECT status,version INTO v_status,v_version FROM app_private.kyc_identity_resolutions WHERE id=v_resolution;
      IF NOT FOUND THEN RAISE EXCEPTION 'operation_unavailable'; END IF;
      RETURN jsonb_build_object('id',v_resolution,'status',v_status,'version',v_version);
    END IF;
    RAISE EXCEPTION 'operation_unavailable';
  END IF;
  PERFORM 1 FROM app_private.kyc_identity_control WHERE singleton FOR SHARE;
  SELECT * INTO v_case FROM public.kyc_submissions WHERE id=p_submission_id AND status='pending' FOR UPDATE;
  IF NOT FOUND OR v_case.ic_hash IS NULL OR v_case.ic_hash_version<>'hmac_sha256_v1' THEN RAISE EXCEPTION 'kyc_case_changed'; END IF;
  IF v_case.assigned_to IS DISTINCT FROM v_actor THEN RAISE EXCEPTION 'kyc_not_assigned'; END IF;
  IF v_case.user_id=v_actor THEN RAISE EXCEPTION 'kyc_identity_resolution_self_dealing'; END IF;
  SELECT * INTO v_binding FROM app_private.kyc_identity_bindings b WHERE b.identity_scope='MY_IC'
    AND b.hash_version=v_case.ic_hash_version AND b.document_number_hmac=v_case.ic_hash FOR UPDATE;
  IF p_kind='replacement' THEN
    SELECT * INTO v_old FROM app_private.kyc_identity_bindings b WHERE b.identity_scope='MY_IC'
      AND b.owner_user_id=v_case.user_id AND b.state='active' AND b.document_number_hmac<>v_case.ic_hash FOR UPDATE;
    IF NOT FOUND OR (v_binding.document_number_hmac IS NOT NULL AND v_binding.owner_user_id<>v_case.user_id) THEN RAISE EXCEPTION 'kyc_identity_resolution_state_conflict'; END IF;
  ELSIF p_kind IN ('legacy_conflict','ownership_correction') THEN
    IF NOT FOUND OR v_binding.state NOT IN ('legacy_conflict','legacy_reserved') OR v_binding.owner_user_id=v_case.user_id THEN
      RAISE EXCEPTION 'kyc_identity_resolution_state_conflict';
    END IF;
  END IF;
  IF p_kind='replacement' THEN
    v_owners:=ARRAY[v_case.user_id]; v_cases:=ARRAY[v_case.id];
    v_keys:=jsonb_build_array(jsonb_build_object('hash_version',v_old.hash_version,'key',v_old.document_number_hmac,'owner',v_old.owner_user_id,'state',v_old.state,'version',v_old.version),
      jsonb_build_object('hash_version',v_case.ic_hash_version,'key',v_case.ic_hash,'owner',v_case.user_id,'state','unbound'));
    v_proposal:=jsonb_build_object('target_owner_id',v_case.user_id,'target_submission_id',v_case.id,'new_hash',v_case.ic_hash,
      'hash_version',v_old.hash_version,'old_hash',v_old.document_number_hmac,'old_state',v_old.state,'old_version',v_old.version,'action','reserve_old_key');
  ELSE
    v_owners:=ARRAY[v_binding.owner_user_id,v_case.user_id]; v_cases:=ARRAY[v_binding.current_verified_submission_id,v_case.id];
    v_keys:=jsonb_build_array(jsonb_build_object('hash_version',v_binding.hash_version,'key',v_binding.document_number_hmac,
      'owner',v_binding.owner_user_id,'state',v_binding.state,'version',v_binding.version));
    v_proposal:=jsonb_build_object('target_owner_id',v_case.user_id,'target_submission_id',v_case.id,
      'hash_version',v_binding.hash_version,'target_hash',v_binding.document_number_hmac,'previous_owner_id',v_binding.owner_user_id,
      'previous_state',v_binding.state,'previous_version',v_binding.version,'action','reserve_for_reverification');
  END IF;
  IF v_actor=ANY(v_owners) THEN RAISE EXCEPTION 'kyc_identity_resolution_self_dealing'; END IF;
  v_proposal:=v_proposal || jsonb_build_object('affected_keys',v_keys,'affected_owner_ids',v_owners,
    'related_submission_ids',v_cases,'evidence_revision',app_private.kyc_evidence_revision(v_case.id),'case_version',v_case.review_version);
  v_digest:=encode(extensions.digest(convert_to(v_proposal::text,'UTF8'),'sha256'),'hex');
  INSERT INTO app_private.kyc_operations(id,owner_user_id,kind,request_fingerprint,submission_id,expected_version,state)
    VALUES(p_operation_id,v_actor,'resolve',v_fingerprint,p_submission_id,v_case.review_version,'processing') ON CONFLICT(id) DO NOTHING;
  SELECT * INTO v_operation FROM app_private.kyc_operations WHERE id=p_operation_id FOR UPDATE;
  IF v_operation.owner_user_id<>v_actor OR v_operation.kind<>'resolve' OR v_operation.request_fingerprint<>v_fingerprint THEN RAISE EXCEPTION 'operation_key_conflict'; END IF;
  IF v_operation.state='succeeded' THEN
    v_resolution:=(v_operation.result_reference->>'resolution_id')::uuid;
    SELECT status,version INTO v_status,v_version FROM app_private.kyc_identity_resolutions WHERE id=v_resolution;
    IF NOT FOUND THEN RAISE EXCEPTION 'operation_unavailable'; END IF;
    RETURN jsonb_build_object('id',v_resolution,'status',v_status,'version',v_version);
  END IF;
  IF v_operation.state<>'processing' THEN RAISE EXCEPTION 'operation_unavailable'; END IF;
  IF EXISTS(SELECT 1 FROM app_private.kyc_identity_resolutions r WHERE r.status IN ('open','evidence_required','second_review','approved')
       AND (r.related_case_id=p_submission_id OR
         (r.affected_keys->0->>'hash_version'=v_keys->0->>'hash_version' AND r.affected_keys->0->>'key'=v_keys->0->>'key'))) THEN
    RAISE EXCEPTION 'kyc_identity_resolution_exists';
  END IF;
  SELECT confirmation_ttl_seconds INTO v_ttl FROM app_private.kyc_identity_control WHERE singleton;
  INSERT INTO app_private.kyc_identity_resolutions(kind,related_case_id,related_submission_ids,support_ticket_ref,
      affected_owner_ids,affected_keys,proposal,version,proposal_digest,status,reason_code,created_by,primary_actor_id,operation_id)
    VALUES(p_kind,p_submission_id,v_cases,NULLIF(btrim(p_support_ticket_ref),''),v_owners,v_keys,v_proposal,1,v_digest,'open',p_reason_code,v_actor,v_actor,p_operation_id)
    RETURNING id INTO v_resolution;
  UPDATE app_private.kyc_operations SET state='succeeded',result_reference=jsonb_build_object('resolution_id',v_resolution),updated_at=clock_timestamp() WHERE id=p_operation_id;
  RETURN jsonb_build_object('id',v_resolution,'status','open','version',1,'confirmationTtlConfigured',v_ttl IS NOT NULL);
END; $$;
REVOKE ALL ON FUNCTION app_private.create_kyc_identity_resolution(uuid,text,text,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION app_private.create_kyc_identity_resolution(uuid,text,text,text,uuid) TO authenticated;
CREATE FUNCTION public.create_kyc_identity_resolution(p_submission_id uuid,p_kind text,p_reason_code text,p_support_ticket_ref text,p_operation_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=public,app_private,pg_temp AS $$ SELECT app_private.create_kyc_identity_resolution($1,$2,$3,$4,$5); $$;
REVOKE ALL ON FUNCTION public.create_kyc_identity_resolution(uuid,text,text,text,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.create_kyc_identity_resolution(uuid,text,text,text,uuid) TO authenticated;

CREATE FUNCTION app_private.authorize_kyc_identity_resolution(p_resolution_id uuid,p_expected_version bigint,p_secondary_actor_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,app_private,auth,pg_temp AS $$
DECLARE v_resolution app_private.kyc_identity_resolutions%ROWTYPE; v_session uuid:=NULLIF(auth.jwt()->>'session_id','')::uuid; v_ttl integer;
BEGIN
  IF NOT app_private.has_kyc_identity_resolution_permission(auth.uid(),v_session) THEN RAISE EXCEPTION 'kyc_identity_resolution_permission_required'; END IF;
  SELECT * INTO v_resolution FROM app_private.kyc_identity_resolutions WHERE id=p_resolution_id FOR UPDATE;
  IF NOT FOUND OR v_resolution.version<>p_expected_version OR v_resolution.status NOT IN ('open','second_review') OR v_resolution.primary_actor_id<>auth.uid()
     OR p_secondary_actor_id=auth.uid() OR p_secondary_actor_id=ANY(v_resolution.affected_owner_ids)
     OR p_secondary_actor_id=(v_resolution.proposal->>'target_owner_id')::uuid THEN RAISE EXCEPTION 'kyc_identity_resolution_changed'; END IF;
  IF v_resolution.status='second_review' AND v_resolution.secondary_actor_id IS DISTINCT FROM p_secondary_actor_id THEN
    RAISE EXCEPTION 'kyc_identity_resolution_changed';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=p_secondary_actor_id AND u.status='active') OR
     NOT EXISTS(SELECT 1 FROM public.staff_role_assignments a JOIN public.staff_roles r ON r.id=a.role_id AND r.is_active
       JOIN public.staff_role_permissions rp ON rp.role_id=r.id JOIN public.staff_permissions p ON p.id=rp.permission_id
       WHERE a.user_id=p_secondary_actor_id AND a.revoked_at IS NULL AND p.key='admin.kyc.resolve_identity') OR
     NOT app_private.kyc_user_has_review_permission(p_secondary_actor_id) THEN RAISE EXCEPTION 'kyc_identity_resolution_reviewer_invalid'; END IF;
  SELECT confirmation_ttl_seconds INTO v_ttl FROM app_private.kyc_identity_control WHERE singleton;
  IF v_ttl IS NULL THEN RAISE EXCEPTION 'confirmation_ttl_unconfigured'; END IF;
  INSERT INTO app_private.kyc_identity_resolution_authorizations(resolution_id,resolution_version,proposal_digest,primary_actor_id,secondary_actor_id,expires_at)
    VALUES(p_resolution_id,v_resolution.version,v_resolution.proposal_digest,auth.uid(),p_secondary_actor_id,clock_timestamp()+make_interval(secs=>v_ttl))
    ON CONFLICT(resolution_id,resolution_version) DO UPDATE SET proposal_digest=EXCLUDED.proposal_digest,
      primary_actor_id=EXCLUDED.primary_actor_id,secondary_actor_id=EXCLUDED.secondary_actor_id,
      authorized_at=clock_timestamp(),expires_at=EXCLUDED.expires_at;
  UPDATE app_private.kyc_identity_resolutions SET secondary_actor_id=p_secondary_actor_id,status='second_review',updated_at=clock_timestamp()
    WHERE id=p_resolution_id;
END; $$;
REVOKE ALL ON FUNCTION app_private.authorize_kyc_identity_resolution(uuid,bigint,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION app_private.authorize_kyc_identity_resolution(uuid,bigint,uuid) TO authenticated;
CREATE FUNCTION public.authorize_kyc_identity_resolution(p_resolution_id uuid,p_expected_version bigint,p_secondary_actor_id uuid)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path=public,app_private,pg_temp AS $$ SELECT app_private.authorize_kyc_identity_resolution($1,$2,$3); $$;
REVOKE ALL ON FUNCTION public.authorize_kyc_identity_resolution(uuid,bigint,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.authorize_kyc_identity_resolution(uuid,bigint,uuid) TO authenticated;

CREATE FUNCTION app_private.cancel_kyc_identity_resolution(p_resolution_id uuid,p_expected_version bigint,p_reason_code text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,app_private,auth,pg_temp AS $$
DECLARE v_resolution app_private.kyc_identity_resolutions%ROWTYPE; v_case public.kyc_submissions%ROWTYPE;
  v_session uuid:=NULLIF(auth.jwt()->>'session_id','')::uuid; v_key jsonb;
BEGIN
  IF NOT app_private.has_kyc_identity_resolution_permission(auth.uid(),v_session) THEN
    RAISE EXCEPTION 'kyc_identity_resolution_permission_required';
  END IF;
  IF p_reason_code NOT IN ('reviewer_declined','evidence_unavailable','case_changed','other') THEN
    RAISE EXCEPTION 'invalid_kyc_identity_resolution_reason';
  END IF;
  SELECT * INTO v_resolution FROM app_private.kyc_identity_resolutions WHERE id=p_resolution_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'kyc_identity_resolution_changed'; END IF;
  -- Preserve the shared case-before-resolution lock order used by staging and
  -- apply, then re-read under lock to avoid a stale proposal race.
  PERFORM 1 FROM public.kyc_submissions WHERE id=v_resolution.related_case_id FOR UPDATE;
  SELECT * INTO v_resolution FROM app_private.kyc_identity_resolutions WHERE id=p_resolution_id FOR UPDATE;
  IF NOT FOUND OR v_resolution.version<>p_expected_version OR v_resolution.status NOT IN ('open','evidence_required','second_review') THEN
    IF FOUND AND v_resolution.version=p_expected_version AND v_resolution.status='cancelled' THEN RETURN; END IF;
    RAISE EXCEPTION 'kyc_identity_resolution_changed';
  END IF;
  SELECT * INTO v_case FROM public.kyc_submissions WHERE id=v_resolution.related_case_id FOR UPDATE;
  IF NOT FOUND OR v_case.assigned_to IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'kyc_identity_resolution_assignment_required';
  END IF;
  UPDATE app_private.kyc_review_confirmations SET invalidated_at=coalesce(invalidated_at,clock_timestamp())
    WHERE resolution_id=p_resolution_id AND resolution_version=p_expected_version AND consumed_at IS NULL;
  UPDATE app_private.kyc_identity_resolutions SET status='cancelled',cancelled_at=clock_timestamp(),cancelled_by=auth.uid(),
    cancellation_reason_code=p_reason_code,updated_at=clock_timestamp() WHERE id=p_resolution_id;
  v_key:=v_resolution.affected_keys->0;
  INSERT INTO app_private.kyc_identity_events(identity_scope,hash_version,document_number_hmac,resolution_id,submission_id,
    old_owner_user_id,new_owner_user_id,old_state,new_state,actor_ids,reason_code)
  VALUES('MY_IC',v_key->>'hash_version',v_key->>'key',p_resolution_id,v_resolution.related_case_id,
    (v_key->>'owner')::uuid,(v_key->>'owner')::uuid,v_resolution.status,'resolution_cancelled',ARRAY[auth.uid()],p_reason_code);
END; $$;
REVOKE ALL ON FUNCTION app_private.cancel_kyc_identity_resolution(uuid,bigint,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION app_private.cancel_kyc_identity_resolution(uuid,bigint,text) TO authenticated;
CREATE FUNCTION public.cancel_kyc_identity_resolution(p_resolution_id uuid,p_expected_version bigint,p_reason_code text)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path=public,app_private,pg_temp AS $$
  SELECT app_private.cancel_kyc_identity_resolution($1,$2,$3);
$$;
REVOKE ALL ON FUNCTION public.cancel_kyc_identity_resolution(uuid,bigint,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.cancel_kyc_identity_resolution(uuid,bigint,text) TO authenticated;

CREATE FUNCTION app_private.stage_kyc_resolution_confirmation(
  p_expected_actor_id uuid,p_expected_session_id uuid,p_resolution_id uuid,p_expected_version bigint,
  p_actor_role text,p_document_access_refs uuid[],p_actual_document_type text,p_issuer_country text,
  p_identifier_kind text,p_holder_name text,p_number_hmac text,p_reason_detail text,p_ttl_seconds integer
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,app_private,auth,pg_temp AS $$
DECLARE v_resolution app_private.kyc_identity_resolutions%ROWTYPE; v_case public.kyc_submissions%ROWTYPE;
  v_auth app_private.kyc_identity_resolution_authorizations%ROWTYPE; v_revision text; v_ttl integer; v_id uuid;
BEGIN
  IF auth.role()<>'service_role' OR p_actor_role NOT IN ('primary','independent_second') THEN RAISE EXCEPTION 'service_role_required'; END IF;
  SELECT * INTO v_resolution FROM app_private.kyc_identity_resolutions WHERE id=p_resolution_id AND version=p_expected_version AND status='second_review';
  IF NOT FOUND THEN RAISE EXCEPTION 'kyc_identity_resolution_changed'; END IF;
  SELECT * INTO v_case FROM public.kyc_submissions WHERE id=v_resolution.related_case_id AND status='pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'kyc_case_changed'; END IF;
  SELECT * INTO v_resolution FROM app_private.kyc_identity_resolutions WHERE id=p_resolution_id AND version=p_expected_version AND status='second_review' FOR UPDATE;
  IF NOT FOUND OR v_case.review_version IS DISTINCT FROM (v_resolution.proposal->>'case_version')::bigint THEN
    RAISE EXCEPTION 'kyc_identity_resolution_changed';
  END IF;
  SELECT confirmation_ttl_seconds INTO v_ttl FROM app_private.kyc_identity_control WHERE singleton;
  IF v_ttl IS NULL OR p_ttl_seconds IS DISTINCT FROM v_ttl THEN RAISE EXCEPTION 'confirmation_ttl_unconfigured'; END IF;
  SELECT * INTO v_auth FROM app_private.kyc_identity_resolution_authorizations WHERE resolution_id=p_resolution_id
    AND resolution_version=p_expected_version AND proposal_digest=v_resolution.proposal_digest AND expires_at>clock_timestamp();
  IF NOT FOUND OR v_auth.primary_actor_id<>v_resolution.primary_actor_id OR v_auth.secondary_actor_id<>v_resolution.secondary_actor_id
     OR p_expected_actor_id=ANY(v_resolution.affected_owner_ids) THEN RAISE EXCEPTION 'kyc_identity_resolution_reviewer_invalid'; END IF;
  IF (p_actor_role='primary' AND p_expected_actor_id<>v_resolution.primary_actor_id)
     OR (p_actor_role='independent_second' AND p_expected_actor_id<>v_resolution.secondary_actor_id) THEN
    RAISE EXCEPTION 'kyc_identity_resolution_reviewer_invalid';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM auth.sessions s WHERE s.id=p_expected_session_id AND s.user_id=p_expected_actor_id
      AND (s.not_after IS NULL OR s.not_after>clock_timestamp()))
     OR NOT public.has_staff_permission(p_expected_actor_id,'admin.kyc.review')
     OR NOT EXISTS(SELECT 1 FROM public.staff_role_assignments a JOIN public.staff_roles r ON r.id=a.role_id AND r.is_active
       JOIN public.staff_role_permissions rp ON rp.role_id=r.id JOIN public.staff_permissions p ON p.id=rp.permission_id
       WHERE a.user_id=p_expected_actor_id AND a.revoked_at IS NULL AND p.key='admin.kyc.resolve_identity') THEN
    RAISE EXCEPTION 'kyc_identity_resolution_reviewer_invalid';
  END IF;
  IF p_actor_role='primary' AND v_case.assigned_to IS DISTINCT FROM p_expected_actor_id THEN RAISE EXCEPTION 'kyc_not_assigned'; END IF;
  v_revision:=app_private.kyc_evidence_revision(v_case.id);
  IF v_revision IS DISTINCT FROM v_resolution.proposal->>'evidence_revision'
     OR v_case.review_version<>(v_resolution.proposal->>'case_version')::bigint THEN RAISE EXCEPTION 'kyc_evidence_changed'; END IF;
  IF cardinality(coalesce(p_document_access_refs,'{}'))<>2 OR
     (SELECT count(DISTINCT a.after_data->>'side') FROM public.audit_logs a WHERE a.id=ANY(p_document_access_refs)
       AND a.actor_id=p_expected_actor_id AND a.action='kyc.document_viewed' AND a.entity_type='kyc_submission'
       AND a.entity_id=v_case.id AND a.after_data->>'evidence_revision'=v_revision AND a.after_data->>'side' IN ('front','back'))<>2 THEN
    RAISE EXCEPTION 'kyc_document_review_evidence_required';
  END IF;
  IF p_number_hmac IS DISTINCT FROM v_case.ic_hash OR p_holder_name IS DISTINCT FROM v_case.legal_name_snapshot
     OR p_actual_document_type IS DISTINCT FROM v_case.document_type OR p_identifier_kind<>'my_ic'
     OR upper(p_issuer_country)<>'MY' OR p_actual_document_type NOT IN ('national_id','driving_license')
     OR length(btrim(coalesce(p_reason_detail,'')))<10 OR length(coalesce(p_reason_detail,''))>500 THEN RAISE EXCEPTION 'kyc_identity_resolution_evidence_mismatch'; END IF;
  INSERT INTO app_private.kyc_review_confirmations(expected_actor_id,expected_session_id,submission_id,review_version,evidence_revision,
    actual_document_type,issuer_country,identifier_kind,confirmed_holder_name,confirmed_number_hmac,hash_version,source,
    document_access_refs,reason_code,reason_detail,risk_level,purpose,resolution_id,resolution_version,proposal_digest,
    resolution_actor_role,expires_at)
  VALUES(p_expected_actor_id,p_expected_session_id,v_case.id,v_case.review_version,v_revision,p_actual_document_type,'MY','my_ic',
    btrim(p_holder_name),p_number_hmac,'hmac_sha256_v1','manual',p_document_access_refs,v_resolution.reason_code,btrim(p_reason_detail),
    'high','resolution',p_resolution_id,p_expected_version,v_resolution.proposal_digest,p_actor_role,
    least(clock_timestamp()+make_interval(secs=>p_ttl_seconds),v_auth.expires_at))
  ON CONFLICT(resolution_id,resolution_version,proposal_digest,resolution_actor_role,expected_actor_id) WHERE purpose='resolution'
  DO UPDATE SET expected_session_id=EXCLUDED.expected_session_id,actor_id=NULL,session_id=NULL,attested_aal=NULL,attested_at=NULL,
    actual_document_type=EXCLUDED.actual_document_type,issuer_country=EXCLUDED.issuer_country,identifier_kind=EXCLUDED.identifier_kind,
    confirmed_holder_name=EXCLUDED.confirmed_holder_name,confirmed_number_hmac=EXCLUDED.confirmed_number_hmac,
    document_access_refs=EXCLUDED.document_access_refs,reason_detail=EXCLUDED.reason_detail,created_at=clock_timestamp(),
    expires_at=EXCLUDED.expires_at,consumed_at=NULL,consumed_xid=NULL,invalidated_at=NULL RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION app_private.stage_kyc_resolution_confirmation(uuid,uuid,uuid,bigint,text,uuid[],text,text,text,text,text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app_private.stage_kyc_resolution_confirmation(uuid,uuid,uuid,bigint,text,uuid[],text,text,text,text,text,text,integer) TO service_role;
CREATE FUNCTION public.stage_kyc_resolution_confirmation(
  p_expected_actor_id uuid,p_expected_session_id uuid,p_resolution_id uuid,p_expected_version bigint,
  p_actor_role text,p_document_access_refs uuid[],p_actual_document_type text,p_issuer_country text,
  p_identifier_kind text,p_holder_name text,p_number_hmac text,p_reason_detail text,p_ttl_seconds integer
) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path=public,app_private,pg_temp AS $$
  SELECT app_private.stage_kyc_resolution_confirmation($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13);
$$;
REVOKE ALL ON FUNCTION public.stage_kyc_resolution_confirmation(uuid,uuid,uuid,bigint,text,uuid[],text,text,text,text,text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.stage_kyc_resolution_confirmation(uuid,uuid,uuid,bigint,text,uuid[],text,text,text,text,text,text,integer) TO service_role;
CREATE FUNCTION app_private.attest_kyc_resolution_confirmation(p_confirmation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,app_private,auth,pg_temp AS $$
DECLARE v_proof app_private.kyc_review_confirmations%ROWTYPE; v_session uuid:=NULLIF(auth.jwt()->>'session_id','')::uuid;
  v_resolution app_private.kyc_identity_resolutions%ROWTYPE; v_case public.kyc_submissions%ROWTYPE;
  v_submission_id uuid; v_actor uuid:=auth.uid();
BEGIN
  SELECT submission_id INTO v_submission_id FROM app_private.kyc_review_confirmations WHERE id=p_confirmation_id AND purpose='resolution';
  IF NOT FOUND THEN RAISE EXCEPTION 'kyc_confirmation_invalid'; END IF;
  SELECT * INTO v_case FROM public.kyc_submissions WHERE id=v_submission_id AND status='pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'kyc_case_changed'; END IF;
  SELECT * INTO v_proof FROM app_private.kyc_review_confirmations WHERE id=p_confirmation_id AND purpose='resolution' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'kyc_confirmation_invalid'; END IF;
  SELECT * INTO v_resolution FROM app_private.kyc_identity_resolutions WHERE id=v_proof.resolution_id AND version=v_proof.resolution_version AND status='second_review';
  IF NOT FOUND OR v_resolution.proposal_digest IS DISTINCT FROM v_proof.proposal_digest
     OR v_proof.expected_actor_id IS DISTINCT FROM v_actor OR v_proof.expected_session_id IS DISTINCT FROM v_session
     OR NOT ((v_proof.resolution_actor_role='primary' AND v_actor=v_resolution.primary_actor_id)
       OR (v_proof.resolution_actor_role='independent_second' AND v_actor=v_resolution.secondary_actor_id))
     OR NOT app_private.has_kyc_identity_resolution_permission(v_actor,v_session)
     OR NOT EXISTS(SELECT 1 FROM app_private.kyc_identity_resolution_authorizations a WHERE a.resolution_id=v_resolution.id
       AND a.resolution_version=v_resolution.version AND a.proposal_digest=v_resolution.proposal_digest
       AND a.primary_actor_id=v_resolution.primary_actor_id AND a.secondary_actor_id=v_resolution.secondary_actor_id
       AND a.expires_at>clock_timestamp())
     OR v_proof.expires_at<=clock_timestamp() OR v_proof.invalidated_at IS NOT NULL OR v_proof.consumed_at IS NOT NULL
     OR v_case.review_version<>(v_resolution.proposal->>'case_version')::bigint
     OR v_proof.review_version<>v_case.review_version
     OR app_private.kyc_evidence_revision(v_proof.submission_id) IS DISTINCT FROM v_proof.evidence_revision THEN RAISE EXCEPTION 'kyc_confirmation_invalid'; END IF;
  UPDATE app_private.kyc_review_confirmations SET actor_id=v_actor,session_id=v_session,attested_aal='aal2',attested_at=clock_timestamp()
    WHERE id=p_confirmation_id;
END; $$;
REVOKE ALL ON FUNCTION app_private.attest_kyc_resolution_confirmation(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION app_private.attest_kyc_resolution_confirmation(uuid) TO authenticated;
CREATE FUNCTION public.attest_kyc_resolution_confirmation(p_confirmation_id uuid)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path=public,app_private,pg_temp AS $$ SELECT app_private.attest_kyc_resolution_confirmation($1); $$;
REVOKE ALL ON FUNCTION public.attest_kyc_resolution_confirmation(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.attest_kyc_resolution_confirmation(uuid) TO authenticated;

CREATE FUNCTION app_private.apply_kyc_identity_resolution(p_resolution_id uuid,p_expected_version bigint,p_operation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,app_private,auth,extensions,pg_temp AS $$
DECLARE v_resolution app_private.kyc_identity_resolutions%ROWTYPE; v_case public.kyc_submissions%ROWTYPE;
  v_primary app_private.kyc_review_confirmations%ROWTYPE; v_secondary app_private.kyc_review_confirmations%ROWTYPE;
  v_binding app_private.kyc_identity_bindings%ROWTYPE; v_operation app_private.kyc_operations%ROWTYPE;
  v_fingerprint text; v_user uuid; v_session uuid:=NULLIF(auth.jwt()->>'session_id','')::uuid;
BEGIN
  IF NOT app_private.has_kyc_identity_resolution_permission(auth.uid(),v_session) OR p_operation_id IS NULL THEN RAISE EXCEPTION 'kyc_identity_resolution_permission_required'; END IF;
  SELECT * INTO v_resolution FROM app_private.kyc_identity_resolutions WHERE id=p_resolution_id AND version=p_expected_version;
  IF NOT FOUND OR auth.uid()<>v_resolution.primary_actor_id
     OR auth.uid()=ANY(v_resolution.affected_owner_ids) THEN RAISE EXCEPTION 'kyc_identity_resolution_changed'; END IF;
  v_fingerprint:=encode(extensions.digest(convert_to(concat_ws(':','apply',p_resolution_id,p_expected_version,v_resolution.proposal_digest),'UTF8'),'sha256'),'hex');
  -- Return a previously completed operation before checking mutable assignment
  -- and case state. A lost response must not turn a successful apply into an
  -- apparent failure after the case has advanced.
  SELECT * INTO v_operation FROM app_private.kyc_operations WHERE id=p_operation_id FOR UPDATE;
  IF FOUND THEN
    IF v_operation.owner_user_id<>auth.uid() OR v_operation.kind<>'resolve' OR v_operation.request_fingerprint<>v_fingerprint THEN
      RAISE EXCEPTION 'operation_key_conflict';
    END IF;
    IF v_operation.state='succeeded' THEN RETURN; END IF;
    RAISE EXCEPTION 'operation_unavailable';
  END IF;
  PERFORM 1 FROM app_private.kyc_identity_control WHERE singleton FOR SHARE;
  FOR v_user IN SELECT DISTINCT x FROM unnest(v_resolution.affected_owner_ids || ARRAY[(v_resolution.proposal->>'target_owner_id')::uuid]) x ORDER BY x LOOP
    PERFORM 1 FROM public.users WHERE id=v_user FOR UPDATE;
  END LOOP;
  SELECT * INTO v_case FROM public.kyc_submissions WHERE id=v_resolution.related_case_id AND status='pending' FOR UPDATE;
  IF NOT FOUND OR v_case.assigned_to IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'kyc_not_assigned'; END IF;
  IF v_case.review_version IS DISTINCT FROM (v_resolution.proposal->>'case_version')::bigint THEN RAISE EXCEPTION 'kyc_case_changed'; END IF;
  INSERT INTO app_private.kyc_operations(id,owner_user_id,kind,request_fingerprint,submission_id,expected_version,state)
    VALUES(p_operation_id,auth.uid(),'resolve',v_fingerprint,v_resolution.related_case_id,p_expected_version,'processing') ON CONFLICT(id) DO NOTHING;
  SELECT * INTO v_operation FROM app_private.kyc_operations WHERE id=p_operation_id FOR UPDATE;
  IF v_operation.owner_user_id<>auth.uid() OR v_operation.kind<>'resolve' OR v_operation.request_fingerprint<>v_fingerprint THEN RAISE EXCEPTION 'operation_key_conflict'; END IF;
  IF v_operation.state='succeeded' THEN RETURN; END IF;
  IF v_operation.state<>'processing' THEN RAISE EXCEPTION 'operation_unavailable'; END IF;
  IF v_resolution.status<>'second_review' THEN RAISE EXCEPTION 'kyc_identity_resolution_changed'; END IF;
  IF NOT FOUND OR app_private.kyc_evidence_revision(v_case.id) IS DISTINCT FROM (
      SELECT evidence_revision FROM app_private.kyc_review_confirmations WHERE resolution_id=p_resolution_id AND resolution_actor_role='primary'
      ORDER BY created_at DESC LIMIT 1) THEN RAISE EXCEPTION 'kyc_evidence_changed'; END IF;
  -- Lock identity keys before confirmation and resolution rows, matching the
  -- shared KYC identity lock order used by approval and withdrawal.
  SELECT * INTO v_binding FROM app_private.kyc_identity_bindings WHERE identity_scope='MY_IC'
    AND hash_version=(v_resolution.proposal->>'hash_version') AND document_number_hmac=coalesce(v_resolution.proposal->>'target_hash',v_resolution.proposal->>'old_hash') FOR UPDATE;
  IF v_resolution.kind='replacement' THEN
    SELECT * INTO v_binding FROM app_private.kyc_identity_bindings WHERE identity_scope='MY_IC'
      AND hash_version=(v_resolution.proposal->>'hash_version') AND document_number_hmac=v_resolution.proposal->>'old_hash' FOR UPDATE;
  END IF;
  SELECT * INTO v_primary FROM app_private.kyc_review_confirmations WHERE resolution_id=p_resolution_id AND resolution_version=p_expected_version
    AND proposal_digest=v_resolution.proposal_digest AND resolution_actor_role='primary' AND actor_id=v_resolution.primary_actor_id
    AND attested_at IS NOT NULL AND attested_aal='aal2' AND expires_at>clock_timestamp() AND consumed_at IS NULL AND invalidated_at IS NULL FOR UPDATE;
  SELECT * INTO v_secondary FROM app_private.kyc_review_confirmations WHERE resolution_id=p_resolution_id AND resolution_version=p_expected_version
    AND proposal_digest=v_resolution.proposal_digest AND resolution_actor_role='independent_second' AND actor_id=v_resolution.secondary_actor_id
    AND attested_at IS NOT NULL AND attested_aal='aal2' AND expires_at>clock_timestamp() AND consumed_at IS NULL AND invalidated_at IS NULL FOR UPDATE;
  IF v_primary.id IS NULL OR v_secondary.id IS NULL OR v_primary.actor_id=v_secondary.actor_id
     OR NOT EXISTS(SELECT 1 FROM app_private.kyc_identity_resolution_authorizations a WHERE a.resolution_id=p_resolution_id
       AND a.resolution_version=p_expected_version AND a.proposal_digest=v_resolution.proposal_digest
       AND a.primary_actor_id=v_resolution.primary_actor_id AND a.secondary_actor_id=v_resolution.secondary_actor_id
       AND a.expires_at>clock_timestamp())
     OR NOT app_private.has_live_kyc_reviewer_session(v_primary.actor_id,v_primary.session_id)
     OR NOT app_private.is_live_kyc_session(v_secondary.actor_id,v_secondary.session_id)
     OR NOT app_private.kyc_user_has_review_permission(v_secondary.actor_id)
     OR NOT EXISTS(SELECT 1 FROM public.staff_role_assignments a JOIN public.staff_roles r ON r.id=a.role_id AND r.is_active
       JOIN public.staff_role_permissions rp ON rp.role_id=r.id JOIN public.staff_permissions p ON p.id=rp.permission_id
       WHERE a.user_id=v_secondary.actor_id AND a.revoked_at IS NULL AND p.key='admin.kyc.resolve_identity')
     OR v_primary.confirmed_number_hmac<>v_secondary.confirmed_number_hmac
     OR v_primary.confirmed_holder_name<>v_secondary.confirmed_holder_name
     OR v_primary.evidence_revision<>v_secondary.evidence_revision
     OR v_primary.confirmed_number_hmac<>v_case.ic_hash OR v_primary.confirmed_holder_name<>v_case.legal_name_snapshot
     OR v_primary.actual_document_type<>v_case.document_type
     OR v_case.review_version<>(v_resolution.proposal->>'case_version')::bigint THEN RAISE EXCEPTION 'kyc_identity_resolution_confirmation_invalid'; END IF;
  SELECT * INTO v_resolution FROM app_private.kyc_identity_resolutions WHERE id=p_resolution_id AND version=p_expected_version FOR UPDATE;
  IF NOT FOUND OR v_resolution.status<>'second_review' OR auth.uid()<>v_resolution.primary_actor_id
     OR v_resolution.proposal_digest IS DISTINCT FROM v_primary.proposal_digest THEN RAISE EXCEPTION 'kyc_identity_resolution_changed'; END IF;
  IF v_resolution.kind='replacement' THEN
    IF v_binding.owner_user_id IS DISTINCT FROM (v_resolution.proposal->>'target_owner_id')::uuid
      OR v_binding.state IS DISTINCT FROM 'active'
      OR v_binding.version IS DISTINCT FROM (v_resolution.proposal->>'old_version')::bigint THEN RAISE EXCEPTION 'kyc_identity_resolution_state_conflict'; END IF;
    UPDATE app_private.kyc_identity_bindings SET state='reserved_previous',version=version+1,updated_at=clock_timestamp()
      WHERE identity_scope='MY_IC' AND hash_version=v_binding.hash_version AND document_number_hmac=v_binding.document_number_hmac;
    UPDATE public.users SET kyc_status='unverified',verified_kyc_submission_id=NULL WHERE id=v_binding.owner_user_id;
    INSERT INTO app_private.kyc_identity_events(identity_scope,hash_version,document_number_hmac,resolution_id,primary_confirmation_id,
      secondary_confirmation_id,submission_id,old_owner_user_id,new_owner_user_id,old_state,new_state,actor_ids,reason_code)
      VALUES('MY_IC',v_binding.hash_version,v_binding.document_number_hmac,p_resolution_id,v_primary.id,v_secondary.id,v_case.id,
        v_binding.owner_user_id,v_binding.owner_user_id,'active','reserved_previous',ARRAY[v_primary.actor_id,v_secondary.actor_id],v_resolution.reason_code);
  ELSE
    IF (v_binding.state IS DISTINCT FROM 'legacy_conflict' AND v_binding.state IS DISTINCT FROM 'legacy_reserved')
      OR v_binding.owner_user_id IS DISTINCT FROM (v_resolution.proposal->>'previous_owner_id')::uuid
      OR v_binding.version IS DISTINCT FROM (v_resolution.proposal->>'previous_version')::bigint THEN RAISE EXCEPTION 'kyc_identity_resolution_state_conflict'; END IF;
    -- The current proof only covers the claimant's documents. It cannot
    -- adjudicate the other account's ownership, so this path freezes the key
    -- and both qualifications instead of transferring identity to either side.
    UPDATE public.users SET kyc_status='unverified',verified_kyc_submission_id=NULL
      WHERE id=ANY(v_resolution.affected_owner_ids || ARRAY[(v_resolution.proposal->>'target_owner_id')::uuid]);
    UPDATE app_private.kyc_identity_bindings SET state='legacy_conflict',version=version+1,updated_at=clock_timestamp()
      WHERE identity_scope='MY_IC' AND hash_version=v_binding.hash_version AND document_number_hmac=v_binding.document_number_hmac;
    INSERT INTO app_private.kyc_identity_events(identity_scope,hash_version,document_number_hmac,resolution_id,primary_confirmation_id,
      secondary_confirmation_id,submission_id,old_owner_user_id,new_owner_user_id,old_state,new_state,actor_ids,reason_code)
      VALUES('MY_IC',v_binding.hash_version,v_binding.document_number_hmac,p_resolution_id,v_primary.id,v_secondary.id,v_case.id,
        v_binding.owner_user_id,v_binding.owner_user_id,v_binding.state,'legacy_conflict',ARRAY[v_primary.actor_id,v_secondary.actor_id],v_resolution.reason_code);
  END IF;
  UPDATE app_private.kyc_review_confirmations SET consumed_at=clock_timestamp(),consumed_xid=txid_current() WHERE id IN (v_primary.id,v_secondary.id);
  UPDATE app_private.kyc_identity_resolutions SET status='applied',primary_confirmation_id=v_primary.id,secondary_confirmation_id=v_secondary.id,
    applied_at=clock_timestamp(),applied_by=auth.uid(),applied_xid=txid_current(),updated_at=clock_timestamp() WHERE id=p_resolution_id;
  UPDATE app_private.kyc_operations SET state='succeeded',result_reference=jsonb_build_object('resolution_id',p_resolution_id),updated_at=clock_timestamp() WHERE id=p_operation_id;
END; $$;
REVOKE ALL ON FUNCTION app_private.apply_kyc_identity_resolution(uuid,bigint,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION app_private.apply_kyc_identity_resolution(uuid,bigint,uuid) TO authenticated;
CREATE FUNCTION public.apply_kyc_identity_resolution(p_resolution_id uuid,p_expected_version bigint,p_operation_id uuid)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path=public,app_private,pg_temp AS $$ SELECT app_private.apply_kyc_identity_resolution($1,$2,$3); $$;
REVOKE ALL ON FUNCTION public.apply_kyc_identity_resolution(uuid,bigint,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.apply_kyc_identity_resolution(uuid,bigint,uuid) TO authenticated;

CREATE FUNCTION app_private.get_kyc_identity_resolution(p_resolution_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,app_private,auth,pg_temp AS $$
DECLARE v_resolution app_private.kyc_identity_resolutions%ROWTYPE; v_session uuid:=NULLIF(auth.jwt()->>'session_id','')::uuid;
  v_primary_confirmed boolean; v_secondary_confirmed boolean;
BEGIN
  IF NOT app_private.has_kyc_identity_resolution_permission(auth.uid(),v_session) THEN RAISE EXCEPTION 'kyc_identity_resolution_permission_required'; END IF;
  SELECT * INTO v_resolution FROM app_private.kyc_identity_resolutions WHERE id=p_resolution_id;
  IF NOT FOUND OR (auth.uid() IS DISTINCT FROM v_resolution.primary_actor_id
      AND auth.uid() IS DISTINCT FROM v_resolution.secondary_actor_id) THEN RAISE EXCEPTION 'kyc_identity_resolution_not_found'; END IF;
  SELECT EXISTS(SELECT 1 FROM app_private.kyc_review_confirmations c WHERE c.resolution_id=p_resolution_id AND c.resolution_version=v_resolution.version
    AND c.proposal_digest=v_resolution.proposal_digest AND c.expected_actor_id=v_resolution.primary_actor_id AND c.resolution_actor_role='primary'
    AND c.attested_at IS NOT NULL AND c.expires_at>clock_timestamp() AND c.consumed_at IS NULL AND c.invalidated_at IS NULL),
    EXISTS(SELECT 1 FROM app_private.kyc_review_confirmations c WHERE c.resolution_id=p_resolution_id AND c.resolution_version=v_resolution.version
    AND c.proposal_digest=v_resolution.proposal_digest AND c.expected_actor_id=v_resolution.secondary_actor_id AND c.resolution_actor_role='independent_second'
    AND c.attested_at IS NOT NULL AND c.expires_at>clock_timestamp() AND c.consumed_at IS NULL AND c.invalidated_at IS NULL)
    INTO v_primary_confirmed,v_secondary_confirmed;
  RETURN jsonb_build_object('id',v_resolution.id,'kind',v_resolution.kind,'status',v_resolution.status,'version',v_resolution.version,
    'caseId',v_resolution.related_case_id,'primary',auth.uid()=v_resolution.primary_actor_id,'secondary',auth.uid()=v_resolution.secondary_actor_id,
    'primaryConfirmed',v_primary_confirmed,'secondaryConfirmed',v_secondary_confirmed,
    'canApply',v_resolution.status='second_review' AND v_primary_confirmed AND v_secondary_confirmed AND auth.uid()=v_resolution.primary_actor_id);
END; $$;
REVOKE ALL ON FUNCTION app_private.get_kyc_identity_resolution(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION app_private.get_kyc_identity_resolution(uuid) TO authenticated;
CREATE FUNCTION public.get_kyc_identity_resolution(p_resolution_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=public,app_private,pg_temp AS $$ SELECT app_private.get_kyc_identity_resolution($1); $$;
REVOKE ALL ON FUNCTION public.get_kyc_identity_resolution(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_kyc_identity_resolution(uuid) TO authenticated;
CREATE FUNCTION app_private.get_my_kyc_identity_resolution_for_case(p_submission_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,app_private,auth,pg_temp AS $$
DECLARE v_resolution_id uuid; v_session uuid:=NULLIF(auth.jwt()->>'session_id','')::uuid;
BEGIN
  IF NOT app_private.has_kyc_identity_resolution_permission(auth.uid(),v_session) THEN RAISE EXCEPTION 'kyc_identity_resolution_permission_required'; END IF;
  SELECT id INTO v_resolution_id FROM app_private.kyc_identity_resolutions WHERE related_case_id=p_submission_id
    AND auth.uid() IN (primary_actor_id,secondary_actor_id) ORDER BY created_at DESC LIMIT 1;
  IF v_resolution_id IS NULL THEN RETURN NULL; END IF;
  RETURN app_private.get_kyc_identity_resolution(v_resolution_id);
END; $$;
REVOKE ALL ON FUNCTION app_private.get_my_kyc_identity_resolution_for_case(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION app_private.get_my_kyc_identity_resolution_for_case(uuid) TO authenticated;
CREATE FUNCTION public.get_my_kyc_identity_resolution_for_case(p_submission_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=public,app_private,pg_temp AS $$ SELECT app_private.get_my_kyc_identity_resolution_for_case($1); $$;
REVOKE ALL ON FUNCTION public.get_my_kyc_identity_resolution_for_case(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_my_kyc_identity_resolution_for_case(uuid) TO authenticated;

CREATE FUNCTION app_private.stage_kyc_identity_confirmation(
  p_expected_actor_id uuid, p_expected_session_id uuid, p_submission_id uuid,
  p_review_version bigint, p_evidence_revision text, p_actual_document_type text,
  p_issuer_country text, p_identifier_kind text, p_confirmed_holder_name text,
  p_confirmed_number_hmac text, p_source text, p_observation_id uuid,
  p_document_access_refs uuid[], p_reason_code text, p_reason_detail text,
  p_risk_level text, p_purpose text, p_ttl_seconds integer
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, app_private, pg_temp
AS $$
DECLARE v_id uuid; v_case public.kyc_submissions%ROWTYPE;
  v_ttl integer;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
  SELECT confirmation_ttl_seconds INTO v_ttl FROM app_private.kyc_identity_control WHERE singleton;
  IF v_ttl IS NULL OR p_ttl_seconds IS DISTINCT FROM v_ttl THEN RAISE EXCEPTION 'confirmation_ttl_unconfigured'; END IF;
  SELECT * INTO v_case FROM public.kyc_submissions WHERE id = p_submission_id FOR UPDATE;
  IF NOT FOUND OR v_case.status <> 'pending' OR v_case.review_version <> p_review_version THEN
    RAISE EXCEPTION 'kyc_case_changed';
  END IF;
  IF app_private.kyc_evidence_revision(p_submission_id) IS DISTINCT FROM p_evidence_revision THEN
    RAISE EXCEPTION 'kyc_evidence_changed';
  END IF;
  IF cardinality(coalesce(p_document_access_refs, '{}')) <> 2 OR
     (SELECT count(DISTINCT a.after_data ->> 'side') FROM public.audit_logs a
       WHERE a.id = ANY(p_document_access_refs) AND a.actor_id = p_expected_actor_id
         AND a.action = 'kyc.document_viewed' AND a.entity_type = 'kyc_submission'
         AND a.entity_id = p_submission_id AND a.after_data ->> 'evidence_revision' = p_evidence_revision
         AND a.after_data ->> 'side' IN ('front','back')) <> 2 THEN
    RAISE EXCEPTION 'kyc_document_review_evidence_required';
  END IF;
  IF p_purpose = 'primary' AND v_case.assigned_to IS DISTINCT FROM p_expected_actor_id
     AND NOT app_private.is_kyc_review_super_admin() THEN RAISE EXCEPTION 'kyc_not_assigned'; END IF;
  IF p_purpose = 'independent_second' AND NOT EXISTS (
    SELECT 1 FROM app_private.kyc_review_countersign_authorizations a
    WHERE a.submission_id = p_submission_id AND a.review_version = p_review_version
      AND a.evidence_revision = p_evidence_revision AND a.primary_actor_id = v_case.assigned_to
      AND a.secondary_actor_id = p_expected_actor_id AND a.expires_at > clock_timestamp()
  ) THEN RAISE EXCEPTION 'kyc_countersign_not_authorized'; END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.sessions s WHERE s.id = p_expected_session_id AND s.user_id = p_expected_actor_id
      AND (s.not_after IS NULL OR s.not_after > clock_timestamp()))
     OR NOT public.has_staff_permission(p_expected_actor_id, 'admin.kyc.review') THEN
    RAISE EXCEPTION 'reviewer_session_unavailable';
  END IF;
  IF p_source = 'manual' AND (p_reason_code IS NULL OR p_reason_code NOT IN
       ('ocr_number_mismatch', 'ocr_name_mismatch', 'ocr_unavailable', 'ocr_unreadable', 'legacy_resolution', 'identity_replacement')) THEN
    RAISE EXCEPTION 'kyc_manual_reason_required';
  END IF;
  INSERT INTO app_private.kyc_review_confirmations(
    expected_actor_id, expected_session_id, submission_id, review_version, evidence_revision,
    actual_document_type, issuer_country, identifier_kind, confirmed_holder_name,
    confirmed_number_hmac, hash_version, source, observation_id, document_access_refs,
    reason_code, reason_detail, risk_level, purpose, expires_at
  ) VALUES (
    p_expected_actor_id, p_expected_session_id, p_submission_id, p_review_version, p_evidence_revision,
    p_actual_document_type, upper(p_issuer_country), p_identifier_kind, btrim(p_confirmed_holder_name),
    p_confirmed_number_hmac, 'hmac_sha256_v1', p_source, p_observation_id, coalesce(p_document_access_refs, '{}'),
    p_reason_code, NULLIF(btrim(p_reason_detail), ''), p_risk_level, p_purpose,
    clock_timestamp() + make_interval(secs => p_ttl_seconds)
  ) ON CONFLICT (submission_id, review_version, evidence_revision, purpose, expected_actor_id) WHERE purpose <> 'resolution'
  DO UPDATE SET expected_session_id=EXCLUDED.expected_session_id, actor_id=NULL, session_id=NULL,
    attested_aal=NULL, attested_at=NULL, actual_document_type=EXCLUDED.actual_document_type,
    issuer_country=EXCLUDED.issuer_country, identifier_kind=EXCLUDED.identifier_kind,
    confirmed_holder_name=EXCLUDED.confirmed_holder_name, confirmed_number_hmac=EXCLUDED.confirmed_number_hmac,
    hash_version=EXCLUDED.hash_version, source=EXCLUDED.source, observation_id=EXCLUDED.observation_id,
    document_access_refs=EXCLUDED.document_access_refs, reason_code=EXCLUDED.reason_code,
    reason_detail=EXCLUDED.reason_detail, risk_level=EXCLUDED.risk_level, created_at=clock_timestamp(),
    expires_at=EXCLUDED.expires_at, consumed_at=NULL, consumed_xid=NULL, invalidated_at=NULL
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION app_private.stage_kyc_identity_confirmation(uuid, uuid, uuid, bigint, text, text, text, text, text, text, text, uuid, uuid[], text, text, text, text, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.stage_kyc_identity_confirmation(uuid, uuid, uuid, bigint, text, text, text, text, text, text, text, uuid, uuid[], text, text, text, text, integer) TO service_role;
CREATE FUNCTION public.stage_kyc_identity_confirmation(
  p_expected_actor_id uuid, p_expected_session_id uuid, p_submission_id uuid,
  p_review_version bigint, p_evidence_revision text, p_actual_document_type text,
  p_issuer_country text, p_identifier_kind text, p_confirmed_holder_name text,
  p_confirmed_number_hmac text, p_source text, p_observation_id uuid,
  p_document_access_refs uuid[], p_reason_code text, p_reason_detail text,
  p_risk_level text, p_purpose text, p_ttl_seconds integer
) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = public, app_private, pg_temp AS $$
  SELECT app_private.stage_kyc_identity_confirmation($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18);
$$;
REVOKE ALL ON FUNCTION public.stage_kyc_identity_confirmation(uuid, uuid, uuid, bigint, text, text, text, text, text, text, text, uuid, uuid[], text, text, text, text, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.stage_kyc_identity_confirmation(uuid, uuid, uuid, bigint, text, text, text, text, text, text, text, uuid, uuid[], text, text, text, text, integer) TO service_role;

CREATE FUNCTION app_private.attest_kyc_identity_confirmation(p_confirmation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app_private, pg_temp
AS $$
DECLARE v_proof app_private.kyc_review_confirmations%ROWTYPE; v_session uuid;
BEGIN
  IF auth.role() <> 'authenticated' OR auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  v_session := NULLIF(auth.jwt() ->> 'session_id', '')::uuid;
  IF v_session IS NULL OR NOT app_private.has_live_kyc_reviewer_session(auth.uid(), v_session) THEN
    RAISE EXCEPTION 'reviewer_session_unavailable';
  END IF;
  SELECT * INTO v_proof FROM app_private.kyc_review_confirmations WHERE id = p_confirmation_id FOR UPDATE;
  IF NOT FOUND OR v_proof.expected_actor_id <> auth.uid() OR v_proof.expected_session_id <> v_session
     OR v_proof.attested_at IS NOT NULL OR v_proof.consumed_at IS NOT NULL
     OR v_proof.invalidated_at IS NOT NULL OR v_proof.expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'confirmation_unavailable';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.kyc_submissions s
    WHERE s.id = v_proof.submission_id AND s.status = 'pending'
      AND s.review_version = v_proof.review_version
      AND app_private.kyc_evidence_revision(s.id) = v_proof.evidence_revision
      AND ((v_proof.purpose = 'primary' AND (s.assigned_to = auth.uid() OR app_private.is_kyc_review_super_admin()))
        OR (v_proof.purpose = 'independent_second' AND EXISTS (
          SELECT 1 FROM app_private.kyc_review_countersign_authorizations a
          WHERE a.submission_id = s.id AND a.review_version = s.review_version
            AND a.evidence_revision = v_proof.evidence_revision AND a.primary_actor_id = s.assigned_to
            AND a.secondary_actor_id = auth.uid() AND a.expires_at > clock_timestamp()
        )))
  ) THEN RAISE EXCEPTION 'kyc_case_changed'; END IF;
  UPDATE app_private.kyc_review_confirmations
     SET actor_id = auth.uid(), session_id = v_session, attested_aal = auth.jwt() ->> 'aal', attested_at = clock_timestamp()
   WHERE id = v_proof.id;
END;
$$;
CREATE FUNCTION public.attest_kyc_identity_confirmation(p_confirmation_id uuid)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = public, app_private, pg_temp
AS $$ SELECT app_private.attest_kyc_identity_confirmation(p_confirmation_id); $$;
REVOKE ALL ON FUNCTION public.attest_kyc_identity_confirmation(uuid), app_private.attest_kyc_identity_confirmation(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.attest_kyc_identity_confirmation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.attest_kyc_identity_confirmation(uuid) TO authenticated;

CREATE FUNCTION app_private.assert_kyc_approved_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app_private, pg_temp
AS $$
DECLARE v_submission_id uuid; v_user_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'users' THEN
    IF NEW.kyc_status <> 'approved' OR
       (TG_OP = 'UPDATE' AND OLD.kyc_status = NEW.kyc_status
          AND OLD.verified_kyc_submission_id IS NOT DISTINCT FROM NEW.verified_kyc_submission_id) THEN RETURN NEW; END IF;
    v_user_id := NEW.id;
    v_submission_id := NEW.verified_kyc_submission_id;
  ELSE
    IF NEW.status <> 'approved' OR (TG_OP = 'UPDATE' AND OLD.status = NEW.status) THEN RETURN NEW; END IF;
    v_user_id := NEW.user_id;
    v_submission_id := NEW.id;
  END IF;
  IF auth.role() <> 'authenticated' OR auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM app_private.kyc_identity_control c WHERE c.singleton AND c.status = 'ready'
  ) THEN RAISE EXCEPTION 'kyc_identity_gate_closed'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.kyc_submissions s
    JOIN app_private.kyc_review_confirmations p ON p.submission_id = s.id
    WHERE s.id = v_submission_id AND s.user_id = v_user_id AND s.status = 'approved'
      AND p.consumed_xid = txid_current() AND p.attested_at IS NOT NULL
      AND p.actor_id = auth.uid() AND p.expires_at > p.consumed_at
  ) THEN RAISE EXCEPTION 'kyc_approval_identity_proof_required'; END IF;
  IF EXISTS (
    SELECT 1 FROM app_private.kyc_review_confirmations p
    WHERE p.submission_id = v_submission_id AND p.consumed_xid = txid_current()
      AND p.identifier_kind = 'my_ic'
  ) AND NOT EXISTS (
    SELECT 1 FROM app_private.kyc_review_confirmations p
    JOIN app_private.kyc_identity_bindings b
      ON b.identity_scope = 'MY_IC' AND b.hash_version = p.hash_version
     AND b.document_number_hmac = p.confirmed_number_hmac
     AND b.owner_user_id = v_user_id AND b.current_verified_submission_id = v_submission_id
     AND b.state = 'active'
    WHERE p.submission_id = v_submission_id AND p.consumed_xid = txid_current()
      AND p.identifier_kind = 'my_ic'
  ) THEN RAISE EXCEPTION 'kyc_active_identity_binding_required'; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.assert_kyc_approved_identity() FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION app_private.prevent_approved_kyc_identity_rewrite()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,app_private,pg_temp AS $$
DECLARE v_has_verified_identity boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.users u WHERE u.id=OLD.user_id AND u.verified_kyc_submission_id=OLD.id)
      OR EXISTS (SELECT 1 FROM app_private.kyc_identity_bindings b WHERE b.current_verified_submission_id=OLD.id AND b.state='active')
    INTO v_has_verified_identity;
  IF OLD.status='approved' AND NEW.status IN ('pending','info_requested','draft') THEN
    RAISE EXCEPTION 'kyc_approved_identity_immutable';
  END IF;
  IF (OLD.status='approved' OR v_has_verified_identity) AND (
    NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.ic_hash IS DISTINCT FROM OLD.ic_hash
    OR NEW.ic_hash_version IS DISTINCT FROM OLD.ic_hash_version OR NEW.document_type IS DISTINCT FROM OLD.document_type
    OR NEW.legal_name_snapshot IS DISTINCT FROM OLD.legal_name_snapshot
  ) THEN
    RAISE EXCEPTION 'kyc_approved_identity_immutable';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION app_private.prevent_approved_kyc_identity_rewrite() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER kyc_approved_identity_immutable
BEFORE UPDATE ON public.kyc_submissions FOR EACH ROW
EXECUTE FUNCTION app_private.prevent_approved_kyc_identity_rewrite();
CREATE CONSTRAINT TRIGGER kyc_submission_approved_identity_guard
AFTER INSERT OR UPDATE ON public.kyc_submissions
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_private.assert_kyc_approved_identity();
CREATE CONSTRAINT TRIGGER kyc_user_approved_identity_guard
AFTER INSERT OR UPDATE ON public.users
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_private.assert_kyc_approved_identity();

-- The existing implementation remains available only through the v2 boundary;
-- the six-argument API is a reject/request-info compatibility shell.
CREATE OR REPLACE FUNCTION app_private.review_kyc_case(
  p_submission_id uuid, p_user_id uuid, p_expected_version bigint,
  p_action text, p_reason_code text DEFAULT NULL, p_reason_detail text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app_private, pg_temp AS $$
DECLARE v_case public.kyc_submissions%ROWTYPE;
BEGIN
  IF p_action = 'approve' THEN RAISE EXCEPTION 'kyc_upgrade_required'; END IF;
  PERFORM app_private.require_kyc_operations_reviewer();
  IF p_action NOT IN ('reject', 'request_info') THEN RAISE EXCEPTION 'invalid_action'; END IF;
  -- Keep the same user-then-case lock order as approval and user withdrawal.
  PERFORM 1 FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'user_not_found'; END IF;
  SELECT * INTO v_case FROM public.kyc_submissions
   WHERE id = p_submission_id AND user_id = p_user_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND OR v_case.review_version <> p_expected_version THEN RAISE EXCEPTION 'kyc_assignment_changed'; END IF;
  PERFORM app_private.admin_review_kyc(p_submission_id, p_user_id, p_action, p_reason_code, p_reason_detail);
END;
$$;
REVOKE ALL ON FUNCTION app_private.review_kyc_case(uuid, uuid, bigint, text, text, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION app_private.review_kyc_case(uuid, uuid, bigint, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_kyc_case(
  p_submission_id uuid, p_user_id uuid, p_expected_version bigint,
  p_action text, p_reason_code text DEFAULT NULL, p_reason_detail text DEFAULT NULL
) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = public, app_private, pg_temp
AS $$ SELECT app_private.review_kyc_case(p_submission_id, p_user_id, p_expected_version, p_action, p_reason_code, p_reason_detail); $$;
REVOKE ALL ON FUNCTION public.review_kyc_case(uuid, uuid, bigint, text, text, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.review_kyc_case(uuid, uuid, bigint, text, text, text) TO authenticated;

CREATE FUNCTION app_private.authorize_kyc_countersign(
  p_submission_id uuid, p_expected_version bigint, p_evidence_revision text,
  p_secondary_actor_id uuid, p_ttl_seconds integer
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app_private, pg_temp AS $$
DECLARE v_case public.kyc_submissions%ROWTYPE; v_session uuid;
  v_ttl integer;
BEGIN
  v_session := NULLIF(auth.jwt() ->> 'session_id', '')::uuid;
  IF v_session IS NULL OR NOT app_private.has_live_kyc_reviewer_session(auth.uid(), v_session) THEN
    RAISE EXCEPTION 'reviewer_session_unavailable';
  END IF;
  SELECT * INTO v_case FROM public.kyc_submissions WHERE id = p_submission_id FOR UPDATE;
  IF NOT FOUND OR v_case.status <> 'pending' OR v_case.review_version <> p_expected_version
     OR v_case.assigned_to IS DISTINCT FROM auth.uid() OR v_case.user_id = p_secondary_actor_id
     OR p_secondary_actor_id = auth.uid()
     OR app_private.kyc_evidence_revision(p_submission_id) IS DISTINCT FROM p_evidence_revision
     OR NOT app_private.kyc_user_has_review_permission(p_secondary_actor_id) THEN
    RAISE EXCEPTION 'kyc_countersign_not_authorized';
  END IF;
  SELECT confirmation_ttl_seconds INTO v_ttl FROM app_private.kyc_identity_control WHERE singleton;
  IF v_ttl IS NULL OR p_ttl_seconds IS DISTINCT FROM v_ttl THEN RAISE EXCEPTION 'confirmation_ttl_unconfigured'; END IF;
  UPDATE app_private.kyc_review_confirmations SET invalidated_at=clock_timestamp()
    WHERE submission_id=p_submission_id AND review_version=p_expected_version AND evidence_revision=p_evidence_revision
      AND purpose='independent_second' AND expected_actor_id<>p_secondary_actor_id
      AND invalidated_at IS NULL AND consumed_at IS NULL;
  DELETE FROM app_private.kyc_review_countersign_authorizations
    WHERE submission_id=p_submission_id AND review_version=p_expected_version AND evidence_revision=p_evidence_revision
      AND primary_actor_id=auth.uid() AND secondary_actor_id<>p_secondary_actor_id;
  INSERT INTO app_private.kyc_review_countersign_authorizations(
    submission_id, review_version, evidence_revision, primary_actor_id, secondary_actor_id, expires_at
  ) VALUES (p_submission_id, p_expected_version, p_evidence_revision, auth.uid(), p_secondary_actor_id,
            clock_timestamp() + make_interval(secs => p_ttl_seconds))
  ON CONFLICT (submission_id, review_version, evidence_revision, secondary_actor_id)
  DO UPDATE SET primary_actor_id = EXCLUDED.primary_actor_id,
                authorized_at = clock_timestamp(), expires_at = EXCLUDED.expires_at;
END;
$$;
REVOKE ALL ON FUNCTION app_private.authorize_kyc_countersign(uuid, bigint, text, uuid, integer) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION app_private.authorize_kyc_countersign(uuid, bigint, text, uuid, integer) TO authenticated;
CREATE FUNCTION public.authorize_kyc_countersign(
  p_submission_id uuid, p_expected_version bigint, p_evidence_revision text,
  p_secondary_actor_id uuid, p_ttl_seconds integer
) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = public, app_private, pg_temp AS $$
  SELECT app_private.authorize_kyc_countersign($1,$2,$3,$4,$5);
$$;
REVOKE ALL ON FUNCTION public.authorize_kyc_countersign(uuid, bigint, text, uuid, integer) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.authorize_kyc_countersign(uuid, bigint, text, uuid, integer) TO authenticated;

CREATE FUNCTION app_private.review_kyc_case_v2(
  p_submission_id uuid, p_user_id uuid, p_expected_version bigint, p_action text,
  p_reason_code text, p_reason_detail text, p_operation_id uuid,
  p_primary_confirmation_id uuid, p_secondary_confirmation_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app_private, auth, pg_temp AS $$
DECLARE
  v_case public.kyc_submissions%ROWTYPE;
  v_primary app_private.kyc_review_confirmations%ROWTYPE;
  v_secondary app_private.kyc_review_confirmations%ROWTYPE;
  v_gate app_private.kyc_identity_control%ROWTYPE;
  v_operation app_private.kyc_operations%ROWTYPE;
  v_fingerprint text;
  v_high_risk boolean;
BEGIN
  IF auth.role() <> 'authenticated' OR auth.uid() IS NULL
     OR NOT app_private.has_live_kyc_reviewer_session(auth.uid(), NULLIF(auth.jwt() ->> 'session_id', '')::uuid) THEN
    RAISE EXCEPTION 'reviewer_session_unavailable';
  END IF;
  IF p_action NOT IN ('approve', 'reject', 'request_info') OR p_operation_id IS NULL THEN RAISE EXCEPTION 'invalid_action'; END IF;
  SELECT * INTO v_gate FROM app_private.kyc_identity_control WHERE singleton FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'kyc_identity_gate_closed'; END IF;
  v_fingerprint := encode(extensions.digest(convert_to(concat_ws(':', p_submission_id, p_user_id, p_expected_version,
    p_action, p_reason_code, p_reason_detail, p_primary_confirmation_id, p_secondary_confirmation_id), 'UTF8'), 'sha256'), 'hex');
  SELECT * INTO v_operation FROM app_private.kyc_operations WHERE id = p_operation_id;
  IF FOUND THEN
    IF v_operation.owner_user_id <> auth.uid() OR v_operation.request_fingerprint <> v_fingerprint THEN
      RAISE EXCEPTION 'operation_key_conflict';
    END IF;
    IF v_operation.state = 'succeeded' THEN RETURN; END IF;
  END IF;
  PERFORM 1 FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'user_not_found'; END IF;
  SELECT * INTO v_case FROM public.kyc_submissions WHERE id = p_submission_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND OR v_case.status <> 'pending' OR v_case.review_version <> p_expected_version OR v_case.user_id = auth.uid() THEN
    RAISE EXCEPTION 'kyc_assignment_changed';
  END IF;
  IF NOT app_private.is_kyc_review_super_admin() AND v_case.assigned_to IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'kyc_not_assigned';
  END IF;
  INSERT INTO app_private.kyc_operations(id, owner_user_id, kind, request_fingerprint, submission_id, expected_version, state)
  VALUES (p_operation_id, auth.uid(), 'review', v_fingerprint, p_submission_id, p_expected_version, 'processing')
  ON CONFLICT (id) DO NOTHING;
  SELECT * INTO v_operation FROM app_private.kyc_operations WHERE id = p_operation_id FOR UPDATE;
  IF v_operation.owner_user_id <> auth.uid() OR v_operation.request_fingerprint <> v_fingerprint THEN
    RAISE EXCEPTION 'operation_key_conflict';
  END IF;
  IF v_operation.state = 'succeeded' THEN RETURN; END IF;
  IF v_operation.state <> 'processing' THEN RAISE EXCEPTION 'operation_unavailable'; END IF;
  IF p_action <> 'approve' THEN
    IF p_primary_confirmation_id IS NOT NULL OR p_secondary_confirmation_id IS NOT NULL THEN RAISE EXCEPTION 'confirmation_not_allowed'; END IF;
    PERFORM app_private.review_kyc_case(p_submission_id, p_user_id, p_expected_version, p_action, p_reason_code, p_reason_detail);
    UPDATE app_private.kyc_operations SET state = 'succeeded', updated_at = clock_timestamp() WHERE id = p_operation_id;
    RETURN;
  END IF;
  IF v_gate.status <> 'ready' THEN RAISE EXCEPTION 'kyc_identity_gate_closed'; END IF;
  IF p_primary_confirmation_id IS NULL THEN RAISE EXCEPTION 'kyc_confirmation_required'; END IF;
  SELECT * INTO v_primary FROM app_private.kyc_review_confirmations WHERE id = p_primary_confirmation_id;
  IF NOT FOUND OR v_primary.submission_id <> p_submission_id OR v_primary.review_version <> p_expected_version
     OR v_primary.purpose <> 'primary' OR v_primary.attested_at IS NULL OR v_primary.actor_id <> auth.uid()
     OR v_primary.expires_at <= clock_timestamp() OR v_primary.consumed_at IS NOT NULL OR v_primary.invalidated_at IS NOT NULL
     OR NOT app_private.has_live_kyc_reviewer_session(v_primary.actor_id, v_primary.session_id)
     OR app_private.kyc_evidence_revision(p_submission_id) IS DISTINCT FROM v_primary.evidence_revision
     OR v_primary.confirmed_number_hmac <> v_case.ic_hash
     OR lower(regexp_replace(btrim(v_primary.confirmed_holder_name), '\s+', ' ', 'g'))
       <> lower(regexp_replace(btrim(v_case.legal_name_snapshot), '\s+', ' ', 'g'))
     OR v_primary.actual_document_type <> v_case.document_type THEN RAISE EXCEPTION 'kyc_confirmation_invalid'; END IF;
  IF (v_primary.identifier_kind = 'my_ic' AND NOT (v_primary.issuer_country = 'MY'
       AND v_primary.actual_document_type IN ('national_id', 'driving_license')))
     OR (v_primary.identifier_kind = 'passport' AND v_primary.actual_document_type <> 'passport') THEN
    RAISE EXCEPTION 'kyc_actual_document_type_mismatch';
  END IF;
  IF v_primary.identifier_kind = 'my_ic' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('kyc-identity:' || v_primary.confirmed_number_hmac, 0));
  END IF;
  SELECT * INTO v_primary FROM app_private.kyc_review_confirmations WHERE id = p_primary_confirmation_id FOR UPDATE;
  IF NOT FOUND OR v_primary.submission_id <> p_submission_id OR v_primary.review_version <> p_expected_version
     OR v_primary.attested_at IS NULL OR v_primary.actor_id <> auth.uid()
     OR v_primary.expires_at <= clock_timestamp() OR v_primary.consumed_at IS NOT NULL OR v_primary.invalidated_at IS NOT NULL
     OR NOT app_private.has_live_kyc_reviewer_session(v_primary.actor_id, v_primary.session_id)
     OR app_private.kyc_evidence_revision(p_submission_id) IS DISTINCT FROM v_primary.evidence_revision THEN
    RAISE EXCEPTION 'kyc_confirmation_invalid';
  END IF;
  IF v_primary.source = 'ocr' AND NOT EXISTS (
    SELECT 1 FROM app_private.kyc_ocr_observations o
    WHERE o.id = v_primary.observation_id AND o.context_kind = 'submission'
      AND o.context_id = p_submission_id AND o.evidence_revision = v_primary.evidence_revision
      AND o.document_number_hmac = v_primary.confirmed_number_hmac
      AND o.holder_name IS NOT DISTINCT FROM v_primary.confirmed_holder_name
      AND o.actual_document_type IS NOT DISTINCT FROM v_primary.actual_document_type
      AND o.issuer_country IS NOT DISTINCT FROM v_primary.issuer_country
  ) THEN RAISE EXCEPTION 'kyc_ocr_observation_unavailable'; END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.kyc_ocr_results o WHERE o.submission_id = p_submission_id
      AND (o.status <> 'matched' OR o.document_number_hmac IS DISTINCT FROM v_case.ic_hash
        OR lower(regexp_replace(btrim(coalesce(o.holder_name, '')), '\s+', ' ', 'g'))
          <> lower(regexp_replace(btrim(coalesce(v_case.legal_name_snapshot, '')), '\s+', ' ', 'g')))
  ) OR v_primary.source = 'manual' OR v_primary.reason_code IN ('legacy_resolution', 'identity_replacement')
  INTO v_high_risk;
  IF coalesce(v_high_risk, true) THEN
    IF p_secondary_confirmation_id IS NULL OR p_secondary_confirmation_id IS NOT DISTINCT FROM p_primary_confirmation_id THEN
      RAISE EXCEPTION 'kyc_second_confirmation_required';
    END IF;
    SELECT * INTO v_secondary FROM app_private.kyc_review_confirmations WHERE id = p_secondary_confirmation_id FOR UPDATE;
    IF NOT FOUND OR v_secondary.purpose <> 'independent_second'
       OR v_secondary.submission_id <> p_submission_id OR v_secondary.review_version <> p_expected_version
       OR v_secondary.evidence_revision <> v_primary.evidence_revision OR v_secondary.actor_id IS NULL
       OR v_secondary.actor_id = v_primary.actor_id OR v_secondary.expected_actor_id <> v_secondary.actor_id
       OR v_secondary.attested_at IS NULL OR v_secondary.attested_aal <> 'aal2' OR v_secondary.expires_at <= clock_timestamp()
       OR v_secondary.consumed_at IS NOT NULL OR v_secondary.invalidated_at IS NOT NULL
       OR v_secondary.actual_document_type <> v_primary.actual_document_type
       OR v_secondary.issuer_country <> v_primary.issuer_country
       OR v_secondary.identifier_kind <> v_primary.identifier_kind
       OR v_secondary.confirmed_holder_name <> v_primary.confirmed_holder_name
       OR v_secondary.confirmed_number_hmac <> v_primary.confirmed_number_hmac
       OR NOT EXISTS (SELECT 1 FROM app_private.kyc_review_countersign_authorizations a
         WHERE a.submission_id = p_submission_id AND a.review_version = p_expected_version
           AND a.evidence_revision = v_primary.evidence_revision AND a.primary_actor_id = v_primary.actor_id
           AND a.secondary_actor_id = v_secondary.actor_id AND a.expires_at > clock_timestamp())
       OR NOT app_private.is_live_kyc_session(v_secondary.actor_id, v_secondary.session_id)
       OR NOT app_private.kyc_user_has_review_permission(v_secondary.actor_id) THEN
      RAISE EXCEPTION 'kyc_second_confirmation_invalid';
    END IF;
    UPDATE app_private.kyc_review_confirmations SET consumed_at = clock_timestamp(), consumed_xid = txid_current()
     WHERE id = v_secondary.id;
  ELSIF p_secondary_confirmation_id IS NOT NULL THEN RAISE EXCEPTION 'kyc_second_confirmation_not_expected'; END IF;
  IF v_primary.identifier_kind = 'my_ic' THEN
    INSERT INTO app_private.kyc_identity_bindings(identity_scope, hash_version, document_number_hmac,
      owner_user_id, current_verified_submission_id, state)
    VALUES ('MY_IC', v_primary.hash_version, v_primary.confirmed_number_hmac, p_user_id, p_submission_id, 'active')
    ON CONFLICT (identity_scope, hash_version, document_number_hmac) DO UPDATE SET
      state='active',current_verified_submission_id=EXCLUDED.current_verified_submission_id,version=app_private.kyc_identity_bindings.version+1,updated_at=clock_timestamp()
      WHERE app_private.kyc_identity_bindings.owner_user_id=EXCLUDED.owner_user_id AND app_private.kyc_identity_bindings.state='legacy_reserved';
    IF NOT EXISTS (SELECT 1 FROM app_private.kyc_identity_bindings b
      WHERE b.identity_scope = 'MY_IC' AND b.hash_version = v_primary.hash_version
        AND b.document_number_hmac = v_primary.confirmed_number_hmac AND b.owner_user_id = p_user_id AND b.state = 'active')
      THEN RAISE EXCEPTION 'kyc_identity_conflict'; END IF;
    UPDATE app_private.kyc_identity_bindings SET current_verified_submission_id = p_submission_id,
      version = version + 1, updated_at = clock_timestamp()
      WHERE identity_scope = 'MY_IC' AND hash_version = v_primary.hash_version
        AND document_number_hmac = v_primary.confirmed_number_hmac AND owner_user_id = p_user_id AND state = 'active';
  END IF;
  UPDATE app_private.kyc_review_confirmations SET consumed_at = clock_timestamp(), consumed_xid = txid_current()
   WHERE id = v_primary.id;
  UPDATE public.users SET verified_kyc_submission_id = p_submission_id WHERE id = p_user_id;
  PERFORM app_private.admin_review_kyc(p_submission_id, p_user_id, 'approve', NULL, NULL);
  INSERT INTO app_private.kyc_identity_events(identity_scope, hash_version, document_number_hmac,
    submission_id, primary_confirmation_id, secondary_confirmation_id, new_owner_user_id,
    new_state, actor_ids, reason_code)
  VALUES (CASE WHEN v_primary.identifier_kind = 'my_ic' THEN 'MY_IC' ELSE 'PASSPORT' END,
    v_primary.hash_version, v_primary.confirmed_number_hmac, p_submission_id,
    p_primary_confirmation_id, p_secondary_confirmation_id, p_user_id, 'approved',
    ARRAY[auth.uid()] || CASE WHEN v_secondary.id IS NULL THEN '{}'::uuid[] ELSE ARRAY[v_secondary.actor_id] END,
    coalesce(v_primary.reason_code, 'approval'));
  UPDATE app_private.kyc_operations SET state = 'succeeded', updated_at = clock_timestamp() WHERE id = p_operation_id;
END;
$$;

CREATE FUNCTION public.review_kyc_case_v2(
  p_submission_id uuid, p_user_id uuid, p_expected_version bigint, p_action text,
  p_reason_code text, p_reason_detail text, p_operation_id uuid,
  p_primary_confirmation_id uuid, p_secondary_confirmation_id uuid
) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = public, app_private, pg_temp
AS $$ SELECT app_private.review_kyc_case_v2($1,$2,$3,$4,$5,$6,$7,$8,$9); $$;
REVOKE ALL ON FUNCTION app_private.review_kyc_case_v2(uuid, uuid, bigint, text, text, text, uuid, uuid, uuid), public.review_kyc_case_v2(uuid, uuid, bigint, text, text, text, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.review_kyc_case_v2(uuid, uuid, bigint, text, text, text, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_kyc_case_v2(uuid, uuid, bigint, text, text, text, uuid, uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_review_kyc(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.admin_review_kyc(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
DO $revoke_legacy_paths$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS signature
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'app_private')
      AND p.proname IN ('admin_review_kyc', 'promote_to_kyc_verified', 'admin_set_tier')
  LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', f.signature); END LOOP;
  FOR f IN SELECT p.oid::regprocedure AS signature
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'app_private') AND p.proname = 'review_kyc_case'
      AND p.oid NOT IN (
        to_regprocedure('public.review_kyc_case(uuid,uuid,bigint,text,text,text)'),
        to_regprocedure('app_private.review_kyc_case(uuid,uuid,bigint,text,text,text)')
      )
  LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', f.signature); END LOOP;
END;
$revoke_legacy_paths$;

NOTIFY pgrst, 'reload schema';
