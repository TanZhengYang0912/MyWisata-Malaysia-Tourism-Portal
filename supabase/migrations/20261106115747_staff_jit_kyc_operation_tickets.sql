-- Bind privileged KYC service-role work to a verified reviewer session and
-- one exact case/evidence operation. Tickets are consumed in the same database
-- transaction as the protected operation.
CREATE TABLE app_private.kyc_service_operation_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES auth.sessions(id) ON DELETE CASCADE,
  submission_id uuid NOT NULL REFERENCES public.kyc_submissions(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('document.view','confirmation.stage','confirmation.lookup','resolution.confirmation.stage','evidence.revision')),
  review_version bigint NOT NULL CHECK (review_version >= 0),
  evidence_revision text NOT NULL,
  side text CHECK (side IS NULL OR side IN ('front','back')),
  target_id uuid,
  purpose text CHECK (purpose IS NULL OR purpose IN ('primary','independent_second')),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  consumed_xid bigint,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((action='document.view' AND side IS NOT NULL AND target_id IS NULL)
    OR (action='resolution.confirmation.stage' AND side IS NULL AND target_id IS NOT NULL AND purpose IS NOT NULL)
    OR (action='confirmation.stage' AND side IS NULL AND target_id IS NULL AND purpose IS NOT NULL)
    OR (action IN ('confirmation.lookup','evidence.revision') AND side IS NULL AND target_id IS NULL AND purpose IS NULL))
);
CREATE INDEX kyc_service_operation_tickets_expiry ON app_private.kyc_service_operation_tickets(expires_at);
CREATE INDEX kyc_service_operation_tickets_consumed_xid
  ON app_private.kyc_service_operation_tickets(consumed_xid,actor_id,session_id) WHERE consumed_xid IS NOT NULL;
ALTER TABLE app_private.kyc_service_operation_tickets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.kyc_service_operation_tickets FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION app_private.staff_jit_permission_for_current_session(p_user_id uuid,p_permission_key text)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE
    WHEN auth.role()='authenticated' THEN auth.uid()=p_user_id
      AND auth.jwt()->>'aal'='aal2'
      AND NULLIF(auth.jwt()->>'session_id','') IS NOT NULL
      AND app_private.staff_jit_is_eligible(p_user_id,p_permission_key)
      AND EXISTS (SELECT 1 FROM auth.sessions s JOIN app_private.staff_jit_requests r
        ON r.session_id=s.id AND r.user_id=s.user_id
        WHERE s.id=NULLIF(auth.jwt()->>'session_id','')::uuid AND s.user_id=p_user_id
          AND (s.not_after IS NULL OR s.not_after>statement_timestamp())
          AND r.permission_key=p_permission_key AND r.state='active'
          AND r.activated_at<=statement_timestamp() AND r.expires_at>statement_timestamp()
          AND EXISTS (SELECT 1 FROM public.staff_role_assignments a
            JOIN public.staff_roles role_row ON role_row.id=a.role_id AND role_row.is_active AND NOT role_row.is_system
            JOIN public.staff_role_jit_permissions rp ON rp.role_id=role_row.id
            JOIN public.staff_permissions p ON p.id=rp.permission_id AND p.key=p_permission_key
            WHERE a.id=r.assignment_id AND a.user_id=p_user_id AND a.role_id=r.role_id AND a.revoked_at IS NULL
              AND role_row.updated_at=r.role_updated_at))
    WHEN auth.role()='service_role' THEN EXISTS (
      SELECT 1 FROM app_private.kyc_service_operation_tickets t
      JOIN auth.sessions s ON s.id=t.session_id AND s.user_id=t.actor_id
      JOIN app_private.staff_jit_requests r ON r.user_id=t.actor_id AND r.session_id=t.session_id
        AND r.permission_key=p_permission_key AND r.state='active'
        AND r.activated_at<=statement_timestamp() AND r.expires_at>statement_timestamp()
      WHERE t.actor_id=p_user_id AND t.consumed_xid=txid_current()
        AND s.id=t.session_id AND (s.not_after IS NULL OR s.not_after>statement_timestamp())
        AND app_private.staff_jit_request_is_current(r.id))
    ELSE false END;
$$;

CREATE OR REPLACE FUNCTION app_private.kyc_user_has_review_permission(p_user_id uuid)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,app_private,pg_temp AS $$
  SELECT p_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.users u WHERE u.id=p_user_id AND u.status='active'
      AND (EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id
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
          JOIN public.staff_modules m ON m.id=lm.module_id AND m.is_active
          JOIN public.staff_module_permissions mp ON mp.module_id=m.id
          JOIN public.staff_permissions p ON p.id=mp.permission_id
          WHERE ur.user_id=u.id AND ur.vendor_id IS NULL AND ur.outlet_id IS NULL AND p.key='admin.kyc.review')
        OR (auth.role()='service_role' AND EXISTS (SELECT 1 FROM app_private.kyc_service_operation_tickets t
          WHERE t.actor_id=u.id AND t.consumed_xid=txid_current()
            AND app_private.staff_jit_permission_for_current_session(u.id,'admin.kyc.review'))))
  );
$$;
REVOKE ALL ON FUNCTION app_private.kyc_user_has_review_permission(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION app_private.kyc_session_has_review_permission(p_user_id uuid,p_session_id uuid)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,app_private,auth,pg_temp AS $$
  SELECT p_user_id IS NOT NULL AND p_session_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.users u WHERE u.id=p_user_id AND u.status='active')
    AND EXISTS (SELECT 1 FROM auth.sessions s WHERE s.id=p_session_id AND s.user_id=p_user_id
      AND (s.not_after IS NULL OR s.not_after>statement_timestamp()))
    AND (EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id
        WHERE ur.user_id=p_user_id AND ur.vendor_id IS NULL AND ur.outlet_id IS NULL AND r.name='super_admin')
      OR EXISTS (SELECT 1 FROM public.staff_role_assignments a
        JOIN public.staff_roles r ON r.id=a.role_id AND r.is_active
        JOIN public.staff_role_modules rm ON rm.role_id=r.id
        JOIN public.staff_modules m ON m.id=rm.module_id AND m.is_active
        JOIN public.staff_module_permissions mp ON mp.module_id=m.id
        JOIN public.staff_permissions p ON p.id=mp.permission_id
        WHERE a.user_id=p_user_id AND a.revoked_at IS NULL AND p.key='admin.kyc.review')
      OR EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id
        JOIN public.staff_module_legacy_roles lm ON lm.role_name=r.name AND lm.grants_permissions
        JOIN public.staff_modules m ON m.id=lm.module_id AND m.is_active
        JOIN public.staff_module_permissions mp ON mp.module_id=m.id
        JOIN public.staff_permissions p ON p.id=mp.permission_id
        WHERE ur.user_id=p_user_id AND ur.vendor_id IS NULL AND ur.outlet_id IS NULL AND p.key='admin.kyc.review')
      OR EXISTS (SELECT 1 FROM app_private.staff_jit_requests r
        WHERE r.user_id=p_user_id AND r.session_id=p_session_id AND r.permission_key='admin.kyc.review'
          AND r.state='active' AND r.activated_at<=statement_timestamp() AND r.expires_at>statement_timestamp()
          AND app_private.staff_jit_request_is_current(r.id)));
$$;
REVOKE ALL ON FUNCTION app_private.kyc_session_has_review_permission(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Candidate discovery and countersign authorization happen before the secondary
-- reviewer can receive an operation ticket. Recognize an active JIT lease tied
-- to one of that reviewer's live sessions at these two authenticated gates.
CREATE FUNCTION app_private.kyc_user_has_available_review_permission(p_user_id uuid)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,app_private,auth,pg_temp AS $$
  SELECT p_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.users u WHERE u.id=p_user_id AND u.status='active'
      AND (app_private.kyc_user_has_review_permission(p_user_id)
        OR EXISTS (SELECT 1 FROM auth.sessions s JOIN app_private.staff_jit_requests r
          ON r.user_id=s.user_id AND r.session_id=s.id
          WHERE s.user_id=p_user_id AND (s.not_after IS NULL OR s.not_after>statement_timestamp())
            AND r.permission_key='admin.kyc.review' AND r.state='active'
            AND r.activated_at<=statement_timestamp() AND r.expires_at>statement_timestamp()
            AND app_private.staff_jit_request_is_current(r.id)))
  );
$$;
REVOKE ALL ON FUNCTION app_private.kyc_user_has_available_review_permission(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION app_private.list_kyc_countersign_candidates(p_submission_id uuid,p_expected_version bigint)
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
      AND app_private.kyc_user_has_available_review_permission(u.id)
    ORDER BY coalesce(nullif(btrim(u.full_name),''),'Reviewer'),u.id LIMIT 50;
END; $$;

CREATE OR REPLACE FUNCTION app_private.authorize_kyc_countersign(
  p_submission_id uuid,p_expected_version bigint,p_evidence_revision text,
  p_secondary_actor_id uuid,p_ttl_seconds integer
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,app_private,auth,pg_temp AS $$
DECLARE v_case public.kyc_submissions%ROWTYPE; v_session uuid; v_ttl integer;
BEGIN
  v_session:=NULLIF(auth.jwt()->>'session_id','')::uuid;
  IF auth.role()<>'authenticated' OR auth.uid() IS NULL OR v_session IS NULL
    OR NOT app_private.has_live_kyc_reviewer_session(auth.uid(),v_session) THEN
    RAISE EXCEPTION 'reviewer_session_unavailable';
  END IF;
  SELECT * INTO v_case FROM public.kyc_submissions WHERE id=p_submission_id FOR UPDATE;
  IF NOT FOUND OR v_case.status<>'pending' OR v_case.review_version<>p_expected_version
    OR v_case.assigned_to IS DISTINCT FROM auth.uid() OR v_case.user_id=p_secondary_actor_id
    OR p_secondary_actor_id=auth.uid()
    OR app_private.kyc_evidence_revision(p_submission_id) IS DISTINCT FROM p_evidence_revision
    OR NOT app_private.kyc_user_has_available_review_permission(p_secondary_actor_id) THEN
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
    submission_id,review_version,evidence_revision,primary_actor_id,secondary_actor_id,expires_at
  ) VALUES(p_submission_id,p_expected_version,p_evidence_revision,auth.uid(),p_secondary_actor_id,
    clock_timestamp()+make_interval(secs=>p_ttl_seconds))
  ON CONFLICT (submission_id,review_version,evidence_revision,secondary_actor_id)
  DO UPDATE SET primary_actor_id=EXCLUDED.primary_actor_id,authorized_at=clock_timestamp(),expires_at=EXCLUDED.expires_at;
END; $$;

REVOKE ALL ON FUNCTION app_private.list_kyc_countersign_candidates(uuid,bigint) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION app_private.list_kyc_countersign_candidates(uuid,bigint) TO authenticated;
REVOKE ALL ON FUNCTION app_private.authorize_kyc_countersign(uuid,bigint,text,uuid,integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION app_private.authorize_kyc_countersign(uuid,bigint,text,uuid,integer) TO authenticated;

CREATE FUNCTION app_private.issue_kyc_service_operation_ticket(
  p_submission_id uuid,p_action text,p_expected_version bigint DEFAULT NULL,
  p_side text DEFAULT NULL,p_target_id uuid DEFAULT NULL,p_purpose text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,app_private,auth,pg_temp AS $$
DECLARE v_actor uuid:=auth.uid(); v_session uuid:=NULLIF(auth.jwt()->>'session_id','')::uuid;
  v_case public.kyc_submissions%ROWTYPE; v_revision text; v_ticket uuid;
BEGIN
  IF auth.role()<>'authenticated' OR v_actor IS NULL OR auth.jwt()->>'aal'<>'aal2'
    OR NOT app_private.has_live_kyc_reviewer_session(v_actor,v_session) THEN RAISE EXCEPTION 'kyc_permission_required'; END IF;
  IF p_action NOT IN ('document.view','confirmation.stage','confirmation.lookup','resolution.confirmation.stage','evidence.revision')
    OR (p_action='document.view' AND p_side NOT IN ('front','back'))
    OR (p_action='resolution.confirmation.stage' AND p_target_id IS NULL)
    OR (p_action<>'document.view' AND p_side IS NOT NULL)
    OR (p_action IN ('confirmation.stage','resolution.confirmation.stage')
      AND (p_purpose IS NULL OR p_purpose NOT IN ('primary','independent_second')))
    OR (p_action NOT IN ('confirmation.stage','resolution.confirmation.stage') AND p_purpose IS NOT NULL) THEN
    RAISE EXCEPTION 'invalid_kyc_operation_ticket'; END IF;
  SELECT * INTO v_case FROM public.kyc_submissions WHERE id=p_submission_id AND status='pending';
  IF NOT FOUND OR (p_expected_version IS NOT NULL AND p_action<>'resolution.confirmation.stage'
      AND v_case.review_version<>p_expected_version) THEN RAISE EXCEPTION 'kyc_case_changed'; END IF;
  v_revision:=app_private.kyc_evidence_revision(p_submission_id);
  IF v_revision IS NULL THEN RAISE EXCEPTION 'kyc_evidence_unavailable'; END IF;
  IF p_action='confirmation.stage' AND p_purpose='independent_second' THEN
    IF v_case.user_id=v_actor OR NOT EXISTS (SELECT 1 FROM app_private.kyc_review_countersign_authorizations a
      WHERE a.submission_id=p_submission_id AND a.review_version=v_case.review_version
        AND a.evidence_revision=v_revision AND a.primary_actor_id=v_case.assigned_to
        AND a.secondary_actor_id=v_actor AND a.expires_at>statement_timestamp()) THEN
      RAISE EXCEPTION 'kyc_countersign_not_authorized';
    END IF;
  ELSIF p_action='resolution.confirmation.stage' THEN
    IF NOT app_private.has_kyc_identity_resolution_permission(v_actor,v_session)
      OR NOT EXISTS (SELECT 1 FROM app_private.kyc_identity_resolutions resolution_row
        WHERE resolution_row.id=p_target_id AND resolution_row.related_case_id=p_submission_id
          AND resolution_row.version=p_expected_version AND resolution_row.status='second_review'
          AND (resolution_row.proposal->>'case_version')::bigint=v_case.review_version
          AND ((p_purpose='primary' AND resolution_row.primary_actor_id=v_actor AND v_case.assigned_to=v_actor)
            OR (p_purpose='independent_second' AND resolution_row.secondary_actor_id=v_actor))) THEN
      RAISE EXCEPTION 'kyc_identity_resolution_permission_required';
    END IF;
  ELSIF v_case.assigned_to IS DISTINCT FROM v_actor AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id
    WHERE ur.user_id=v_actor AND ur.vendor_id IS NULL AND ur.outlet_id IS NULL AND r.name='super_admin'
    UNION ALL
    SELECT 1 FROM app_private.kyc_review_countersign_authorizations a
    WHERE p_action='document.view' AND a.submission_id=p_submission_id
      AND a.review_version=v_case.review_version AND a.evidence_revision=v_revision
      AND a.secondary_actor_id=v_actor AND a.expires_at>statement_timestamp()) THEN
    RAISE EXCEPTION 'kyc_not_assigned';
  END IF;
  IF p_action='resolution.confirmation.stage' THEN
    IF NOT app_private.has_kyc_identity_resolution_permission(v_actor,v_session)
      OR NOT EXISTS (SELECT 1 FROM app_private.kyc_identity_resolutions resolution_row
        WHERE resolution_row.id=p_target_id AND resolution_row.related_case_id=p_submission_id
          AND resolution_row.version=p_expected_version AND resolution_row.status='second_review'
          AND (resolution_row.proposal->>'case_version')::bigint=v_case.review_version
          AND v_actor IN (resolution_row.primary_actor_id,resolution_row.secondary_actor_id)) THEN
      RAISE EXCEPTION 'kyc_identity_resolution_permission_required';
    END IF;
  END IF;
  INSERT INTO app_private.kyc_service_operation_tickets(actor_id,session_id,submission_id,action,
    review_version,evidence_revision,side,target_id,purpose,expires_at)
  VALUES(v_actor,v_session,p_submission_id,p_action,v_case.review_version,v_revision,p_side,p_target_id,p_purpose,
    statement_timestamp()+interval '60 seconds') RETURNING id INTO v_ticket;
  RETURN jsonb_build_object('ticketId',v_ticket,'reviewVersion',v_case.review_version,'evidenceRevision',v_revision);
END; $$;
REVOKE ALL ON FUNCTION app_private.issue_kyc_service_operation_ticket(uuid,text,bigint,text,uuid,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION app_private.issue_kyc_service_operation_ticket(uuid,text,bigint,text,uuid,text) TO authenticated;
CREATE FUNCTION public.issue_kyc_service_operation_ticket(
  p_submission_id uuid,p_action text,p_expected_version bigint DEFAULT NULL,
  p_side text DEFAULT NULL,p_target_id uuid DEFAULT NULL,p_purpose text DEFAULT NULL
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=public,app_private,pg_temp AS $$
  SELECT app_private.issue_kyc_service_operation_ticket($1,$2,$3,$4,$5,$6);
$$;
REVOKE ALL ON FUNCTION public.issue_kyc_service_operation_ticket(uuid,text,bigint,text,uuid,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.issue_kyc_service_operation_ticket(uuid,text,bigint,text,uuid,text) TO authenticated;

CREATE FUNCTION app_private.consume_kyc_service_operation_ticket(
  p_ticket_id uuid,p_submission_id uuid,p_action text,p_review_version bigint,
  p_evidence_revision text,p_side text DEFAULT NULL,p_target_id uuid DEFAULT NULL,p_purpose text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,app_private,auth,pg_temp AS $$
DECLARE v_ticket app_private.kyc_service_operation_tickets%ROWTYPE; v_case public.kyc_submissions%ROWTYPE;
BEGIN
  IF auth.role()<>'service_role' OR p_ticket_id IS NULL THEN RAISE EXCEPTION 'service_role_required'; END IF;
  SELECT * INTO v_ticket FROM app_private.kyc_service_operation_tickets WHERE id=p_ticket_id FOR UPDATE;
  IF NOT FOUND OR v_ticket.consumed_at IS NOT NULL OR v_ticket.expires_at<=statement_timestamp()
    OR v_ticket.submission_id IS DISTINCT FROM p_submission_id OR v_ticket.action IS DISTINCT FROM p_action
    OR v_ticket.review_version IS DISTINCT FROM p_review_version OR v_ticket.evidence_revision IS DISTINCT FROM p_evidence_revision
    OR v_ticket.side IS DISTINCT FROM p_side OR v_ticket.target_id IS DISTINCT FROM p_target_id
    OR v_ticket.purpose IS DISTINCT FROM p_purpose
    OR NOT app_private.is_live_kyc_session(v_ticket.actor_id,v_ticket.session_id) THEN
    RAISE EXCEPTION 'kyc_operation_ticket_invalid';
  END IF;
  UPDATE app_private.kyc_service_operation_tickets SET consumed_at=statement_timestamp(),consumed_xid=txid_current()
    WHERE id=v_ticket.id;
  IF NOT app_private.kyc_user_has_review_permission(v_ticket.actor_id)
    OR app_private.kyc_evidence_revision(p_submission_id) IS DISTINCT FROM v_ticket.evidence_revision THEN
    RAISE EXCEPTION 'kyc_operation_ticket_invalid';
  END IF;
  SELECT * INTO v_case FROM public.kyc_submissions WHERE id=p_submission_id AND status='pending'
    AND review_version=v_ticket.review_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'kyc_operation_ticket_invalid'; END IF;
  IF v_ticket.action='confirmation.stage' AND v_ticket.purpose='independent_second' THEN
    IF v_case.user_id=v_ticket.actor_id OR NOT EXISTS (SELECT 1 FROM app_private.kyc_review_countersign_authorizations a
      WHERE a.submission_id=p_submission_id AND a.review_version=v_case.review_version
        AND a.evidence_revision=v_ticket.evidence_revision AND a.primary_actor_id=v_case.assigned_to
        AND a.secondary_actor_id=v_ticket.actor_id AND a.expires_at>statement_timestamp()) THEN
      RAISE EXCEPTION 'kyc_operation_ticket_invalid';
    END IF;
  ELSIF v_ticket.action='resolution.confirmation.stage' THEN
    IF NOT EXISTS (SELECT 1 FROM app_private.kyc_identity_resolutions resolution_row
      WHERE resolution_row.id=v_ticket.target_id AND resolution_row.related_case_id=p_submission_id
        AND resolution_row.status='second_review'
        AND (resolution_row.proposal->>'case_version')::bigint=v_case.review_version
        AND ((v_ticket.purpose='primary' AND resolution_row.primary_actor_id=v_ticket.actor_id AND v_case.assigned_to=v_ticket.actor_id)
          OR (v_ticket.purpose='independent_second' AND resolution_row.secondary_actor_id=v_ticket.actor_id))) THEN
      RAISE EXCEPTION 'kyc_operation_ticket_invalid';
    END IF;
  ELSIF v_case.assigned_to IS DISTINCT FROM v_ticket.actor_id AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id
    WHERE ur.user_id=v_ticket.actor_id AND ur.vendor_id IS NULL AND ur.outlet_id IS NULL AND r.name='super_admin'
    UNION ALL
    SELECT 1 FROM app_private.kyc_review_countersign_authorizations a
    WHERE v_ticket.action='document.view' AND a.submission_id=p_submission_id
      AND a.review_version=v_case.review_version AND a.evidence_revision=v_ticket.evidence_revision
      AND a.secondary_actor_id=v_ticket.actor_id AND a.expires_at>statement_timestamp()) THEN
    RAISE EXCEPTION 'kyc_operation_ticket_invalid';
  END IF;
  RETURN v_ticket.actor_id;
END; $$;
REVOKE ALL ON FUNCTION app_private.consume_kyc_service_operation_ticket(uuid,uuid,text,bigint,text,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app_private.consume_kyc_service_operation_ticket(uuid,uuid,text,bigint,text,text,uuid,text) TO service_role;

CREATE FUNCTION public.get_kyc_document_view_v3(
  p_submission_id uuid,p_side text,p_ticket_id uuid,p_review_version bigint,p_evidence_revision text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,app_private,pg_temp AS $$
DECLARE v_actor uuid; v_path text; v_audit_id uuid;
BEGIN
  v_actor:=app_private.consume_kyc_service_operation_ticket(p_ticket_id,p_submission_id,'document.view',p_review_version,p_evidence_revision,p_side,NULL);
  IF p_side NOT IN ('front','back') THEN RAISE EXCEPTION 'invalid_document_side'; END IF;
  SELECT storage_path INTO v_path FROM public.kyc_submission_documents
    WHERE submission_id=p_submission_id AND side=p_side AND purge_claimed_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'document_not_found'; END IF;
  INSERT INTO public.audit_logs(actor_id,action,entity_type,entity_id,after_data)
    VALUES(v_actor,'kyc.document_viewed','kyc_submission',p_submission_id,
      jsonb_build_object('submission_id',p_submission_id,'side',p_side,'evidence_revision',p_evidence_revision))
    RETURNING id INTO v_audit_id;
  PERFORM app_private.check_kyc_document_access(v_actor);
  RETURN jsonb_build_object('storage_path',v_path,'access_id',v_audit_id);
END; $$;
REVOKE ALL ON FUNCTION public.get_kyc_document_view_v2(uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.get_kyc_document_view_v3(uuid,text,uuid,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_kyc_document_view_v3(uuid,text,uuid,bigint,text) TO service_role;
REVOKE ALL ON FUNCTION public.get_kyc_document_view(uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.get_kyc_review_confirmation_ids_v2(
  p_ticket_id uuid,p_submission_id uuid,p_expected_version bigint,p_evidence_revision text,
  p_primary_actor_id uuid,p_primary_session_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,app_private,pg_temp AS $$
DECLARE v_actor uuid;
BEGIN
  v_actor:=app_private.consume_kyc_service_operation_ticket(p_ticket_id,p_submission_id,'confirmation.lookup',
    p_expected_version,p_evidence_revision,NULL,NULL,NULL);
  IF v_actor IS DISTINCT FROM p_primary_actor_id OR p_primary_session_id IS DISTINCT FROM (
      SELECT session_id FROM app_private.kyc_service_operation_tickets WHERE id=p_ticket_id) THEN
    RAISE EXCEPTION 'kyc_operation_ticket_invalid';
  END IF;
  RETURN app_private.get_kyc_review_confirmation_ids(p_submission_id,p_expected_version,p_evidence_revision,p_primary_actor_id,p_primary_session_id);
END; $$;
REVOKE ALL ON FUNCTION public.get_kyc_review_confirmation_ids(uuid,bigint,text,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.get_kyc_review_confirmation_ids_v2(uuid,uuid,bigint,text,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_kyc_review_confirmation_ids_v2(uuid,uuid,bigint,text,uuid,uuid) TO service_role;

CREATE FUNCTION public.get_kyc_evidence_revision_v2(p_ticket_id uuid,p_submission_id uuid,p_review_version bigint)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,app_private,pg_temp AS $$
DECLARE v_revision text;
BEGIN
  PERFORM app_private.consume_kyc_service_operation_ticket(p_ticket_id,p_submission_id,'evidence.revision',
    p_review_version, (SELECT evidence_revision FROM app_private.kyc_service_operation_tickets WHERE id=p_ticket_id),NULL,NULL,NULL);
  v_revision:=app_private.kyc_evidence_revision(p_submission_id);
  IF v_revision IS NULL OR v_revision IS DISTINCT FROM (
    SELECT evidence_revision FROM app_private.kyc_service_operation_tickets WHERE id=p_ticket_id) THEN
    RAISE EXCEPTION 'kyc_operation_ticket_invalid';
  END IF;
  RETURN v_revision;
END; $$;
REVOKE ALL ON FUNCTION public.get_kyc_evidence_revision_v2(uuid,uuid,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_kyc_evidence_revision_v2(uuid,uuid,bigint) TO service_role;
REVOKE ALL ON FUNCTION app_private.get_kyc_evidence_revision(uuid) FROM service_role;
REVOKE ALL ON FUNCTION public.get_kyc_evidence_revision(uuid) FROM service_role;

-- A JIT reviewer can reach the legacy stage RPC only from a ticket-consuming
-- wrapper transaction; direct service-role calls to the old signatures fail.
CREATE FUNCTION public.stage_kyc_identity_confirmation_with_ticket(
  p_ticket_id uuid,p_expected_actor_id uuid,p_expected_session_id uuid,p_submission_id uuid,
  p_review_version bigint,p_evidence_revision text,p_actual_document_type text,p_issuer_country text,
  p_identifier_kind text,p_confirmed_holder_name text,p_confirmed_number_hmac text,p_source text,
  p_observation_id uuid,p_document_access_refs uuid[],p_reason_code text,p_reason_detail text,
  p_risk_level text,p_purpose text,p_ttl_seconds integer
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,app_private,auth,pg_temp AS $$
DECLARE v_actor uuid;
BEGIN
  v_actor:=app_private.consume_kyc_service_operation_ticket(p_ticket_id,p_submission_id,'confirmation.stage',
    p_review_version,p_evidence_revision,NULL,NULL,p_purpose);
  IF v_actor IS DISTINCT FROM p_expected_actor_id OR p_expected_session_id IS DISTINCT FROM (
      SELECT session_id FROM app_private.kyc_service_operation_tickets WHERE id=p_ticket_id) THEN
    RAISE EXCEPTION 'kyc_operation_ticket_invalid';
  END IF;
  RETURN app_private.stage_kyc_identity_confirmation(p_expected_actor_id,p_expected_session_id,p_submission_id,
    p_review_version,p_evidence_revision,p_actual_document_type,p_issuer_country,p_identifier_kind,
    p_confirmed_holder_name,p_confirmed_number_hmac,p_source,p_observation_id,p_document_access_refs,
    p_reason_code,p_reason_detail,p_risk_level,p_purpose,p_ttl_seconds);
END; $$;
REVOKE ALL ON FUNCTION app_private.stage_kyc_identity_confirmation(uuid,uuid,uuid,bigint,text,text,text,text,text,text,text,uuid,uuid[],text,text,text,text,integer) FROM service_role;
REVOKE ALL ON FUNCTION public.stage_kyc_identity_confirmation(uuid,uuid,uuid,bigint,text,text,text,text,text,text,text,uuid,uuid[],text,text,text,text,integer) FROM service_role;
REVOKE ALL ON FUNCTION public.stage_kyc_identity_confirmation_with_ticket(uuid,uuid,uuid,uuid,bigint,text,text,text,text,text,text,text,uuid,uuid[],text,text,text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.stage_kyc_identity_confirmation_with_ticket(uuid,uuid,uuid,uuid,bigint,text,text,text,text,text,text,text,uuid,uuid[],text,text,text,text,integer) TO service_role;

CREATE FUNCTION public.stage_kyc_resolution_confirmation_with_ticket(
  p_ticket_id uuid,p_expected_actor_id uuid,p_expected_session_id uuid,p_resolution_id uuid,
  p_expected_version bigint,p_actor_role text,p_document_access_refs uuid[],p_actual_document_type text,
  p_issuer_country text,p_identifier_kind text,p_holder_name text,p_number_hmac text,p_reason_detail text,p_ttl_seconds integer
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,app_private,auth,pg_temp AS $$
DECLARE v_case_id uuid; v_case_version bigint; v_revision text; v_actor uuid;
BEGIN
  SELECT related_case_id,(proposal->>'case_version')::bigint INTO v_case_id,v_case_version
    FROM app_private.kyc_identity_resolutions WHERE id=p_resolution_id AND version=p_expected_version;
  IF v_case_id IS NULL THEN RAISE EXCEPTION 'kyc_identity_resolution_changed'; END IF;
  v_revision:=app_private.kyc_evidence_revision(v_case_id);
  v_actor:=app_private.consume_kyc_service_operation_ticket(p_ticket_id,v_case_id,'resolution.confirmation.stage',
    v_case_version,v_revision,NULL,p_resolution_id,p_actor_role);
  IF v_actor IS DISTINCT FROM p_expected_actor_id OR p_expected_session_id IS DISTINCT FROM (
      SELECT session_id FROM app_private.kyc_service_operation_tickets WHERE id=p_ticket_id) THEN
    RAISE EXCEPTION 'kyc_operation_ticket_invalid';
  END IF;
  RETURN app_private.stage_kyc_resolution_confirmation(p_expected_actor_id,p_expected_session_id,p_resolution_id,
    p_expected_version,p_actor_role,p_document_access_refs,p_actual_document_type,p_issuer_country,
    p_identifier_kind,p_holder_name,p_number_hmac,p_reason_detail,p_ttl_seconds);
END; $$;
REVOKE ALL ON FUNCTION app_private.stage_kyc_resolution_confirmation(uuid,uuid,uuid,bigint,text,uuid[],text,text,text,text,text,text,integer) FROM service_role;
REVOKE ALL ON FUNCTION public.stage_kyc_resolution_confirmation(uuid,uuid,uuid,bigint,text,uuid[],text,text,text,text,text,text,integer) FROM service_role;
REVOKE ALL ON FUNCTION public.stage_kyc_resolution_confirmation_with_ticket(uuid,uuid,uuid,uuid,bigint,text,uuid[],text,text,text,text,text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.stage_kyc_resolution_confirmation_with_ticket(uuid,uuid,uuid,uuid,bigint,text,uuid[],text,text,text,text,text,text,integer) TO service_role;


-- Revalidate both reviewers against the exact session recorded on their confirmation.
CREATE OR REPLACE FUNCTION app_private.get_kyc_review_confirmation_ids(
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
      AND app_private.kyc_session_has_review_permission(c.actor_id,c.session_id);
  IF v_count<>1 THEN RETURN NULL; END IF;
  SELECT * INTO v_primary FROM app_private.kyc_review_confirmations c
    WHERE c.submission_id=p_submission_id AND c.review_version=p_expected_version AND c.evidence_revision=p_evidence_revision
      AND c.purpose='primary' AND c.expected_actor_id=p_primary_actor_id AND c.actor_id=p_primary_actor_id
      AND c.session_id=p_primary_session_id AND c.attested_aal='aal2' AND c.attested_at IS NOT NULL
      AND c.expires_at>clock_timestamp() AND c.consumed_at IS NULL AND c.invalidated_at IS NULL
      AND app_private.is_live_kyc_session(c.actor_id,c.session_id)
      AND app_private.kyc_session_has_review_permission(c.actor_id,c.session_id);
  SELECT count(*) INTO v_count FROM app_private.kyc_review_confirmations c
    WHERE c.submission_id=p_submission_id AND c.review_version=p_expected_version AND c.evidence_revision=p_evidence_revision
      AND c.purpose='independent_second' AND c.actor_id IS NOT NULL AND c.actor_id<>p_primary_actor_id
      AND c.attested_aal='aal2' AND c.attested_at IS NOT NULL AND c.expires_at>clock_timestamp()
      AND c.consumed_at IS NULL AND c.invalidated_at IS NULL
      AND c.actual_document_type=v_primary.actual_document_type AND c.issuer_country=v_primary.issuer_country
      AND c.identifier_kind=v_primary.identifier_kind AND c.confirmed_holder_name=v_primary.confirmed_holder_name
      AND c.confirmed_number_hmac=v_primary.confirmed_number_hmac
      AND app_private.is_live_kyc_session(c.actor_id,c.session_id)
      AND app_private.kyc_session_has_review_permission(c.actor_id,c.session_id)
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
      AND app_private.kyc_session_has_review_permission(c.actor_id,c.session_id)
      AND EXISTS(SELECT 1 FROM app_private.kyc_review_countersign_authorizations a WHERE a.submission_id=p_submission_id
        AND a.review_version=p_expected_version AND a.evidence_revision=p_evidence_revision
        AND a.primary_actor_id=p_primary_actor_id AND a.secondary_actor_id=c.actor_id AND a.expires_at>clock_timestamp());
  RETURN jsonb_build_object('primaryConfirmationId',v_primary.id,'secondaryConfirmationId',v_secondary.id);
END; $$;

CREATE OR REPLACE FUNCTION app_private.review_kyc_case_v2(
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
       OR NOT app_private.kyc_session_has_review_permission(v_secondary.actor_id,v_secondary.session_id) THEN
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


NOTIFY pgrst, 'reload schema';
