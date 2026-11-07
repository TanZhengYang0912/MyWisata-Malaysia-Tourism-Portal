-- JIT access is disabled until a controlled pilot is explicitly enabled.
CREATE TABLE public.staff_role_jit_permissions (
  role_id uuid NOT NULL REFERENCES public.staff_roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.staff_permissions(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, permission_id)
);
ALTER TABLE public.staff_role_jit_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY staff_role_jit_permissions_super_admin_read
  ON public.staff_role_jit_permissions FOR SELECT TO authenticated
  USING (auth.jwt()->>'aal'='aal2' AND public.is_active_global_staff_super_admin(auth.uid()));
REVOKE ALL ON public.staff_role_jit_permissions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.staff_role_jit_permissions TO authenticated;

CREATE TABLE app_private.staff_jit_configuration (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false,
  allowed_permission_keys text[] NOT NULL DEFAULT ARRAY['admin.kyc.review']::text[],
  allowed_durations_minutes integer[] NOT NULL DEFAULT ARRAY[30,60],
  request_ttl interval NOT NULL DEFAULT interval '24 hours',
  activation_ttl interval NOT NULL DEFAULT interval '1 hour',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  CHECK (allowed_permission_keys <@ ARRAY['admin.kyc.review']::text[]),
  CHECK (allowed_durations_minutes <@ ARRAY[30,60]::integer[]),
  CHECK (request_ttl > interval '0' AND request_ttl <= interval '24 hours'),
  CHECK (activation_ttl > interval '0' AND activation_ttl <= interval '1 hour')
);
INSERT INTO app_private.staff_jit_configuration(singleton) VALUES (true);

CREATE TABLE app_private.staff_jit_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_key uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.staff_roles(id) ON DELETE RESTRICT,
  assignment_id uuid NOT NULL REFERENCES public.staff_role_assignments(id) ON DELETE RESTRICT,
  role_updated_at timestamptz NOT NULL,
  permission_key text NOT NULL CHECK (permission_key = 'admin.kyc.review'),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 500),
  duration_minutes integer NOT NULL CHECK (duration_minutes IN (30,60)),
  state text NOT NULL CHECK (state IN ('pending','approved','rejected','withdrawn','active','expired','revoked')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  request_expires_at timestamptz NOT NULL,
  decided_by uuid REFERENCES auth.users(id),
  decided_at timestamptz,
  decision_reason text,
  activation_expires_at timestamptz,
  session_id uuid REFERENCES auth.sessions(id) ON DELETE SET NULL,
  activated_at timestamptz,
  expires_at timestamptz,
  ended_at timestamptz,
  end_reason text,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, request_key),
  CHECK ((state IN ('approved','rejected') AND decided_by IS NOT NULL AND decided_at IS NOT NULL)
    OR (state NOT IN ('approved','rejected') AND decided_by IS NULL AND decided_at IS NULL)
    OR state IN ('active','expired','revoked'))
);
CREATE UNIQUE INDEX staff_jit_one_open_request_per_user_permission
  ON app_private.staff_jit_requests(user_id, permission_key)
  WHERE state IN ('pending','approved','active');
CREATE INDEX staff_jit_requests_review_queue
  ON app_private.staff_jit_requests(state, requested_at DESC, id DESC);
CREATE INDEX staff_jit_requests_user_history
  ON app_private.staff_jit_requests(user_id, requested_at DESC, id DESC);

CREATE TABLE app_private.staff_jit_activation_proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES app_private.staff_jit_requests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES auth.sessions(id) ON DELETE CASCADE,
  request_version bigint NOT NULL,
  credential_id text NOT NULL REFERENCES app_private.staff_passkey_credentials(credential_id),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '2 minutes',
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION app_private.staff_jit_request_response(p_row app_private.staff_jit_requests)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id',p_row.id,'requestKey',p_row.request_key,'permissionKey',p_row.permission_key,
    'reason',p_row.reason,'durationMinutes',p_row.duration_minutes,'state',p_row.state,
    'requestedAt',p_row.requested_at,'requestExpiresAt',p_row.request_expires_at,
    'decidedAt',p_row.decided_at,'decisionReason',p_row.decision_reason,
    'activationExpiresAt',p_row.activation_expires_at,'activatedAt',p_row.activated_at,
    'expiresAt',p_row.expires_at,'endedAt',p_row.ended_at,'endReason',p_row.end_reason,
    'version',p_row.version
  );
$$;
REVOKE ALL ON FUNCTION app_private.staff_jit_request_response(app_private.staff_jit_requests) FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE app_private.staff_passkey_challenges DROP CONSTRAINT staff_passkey_challenges_operation_check;
ALTER TABLE app_private.staff_passkey_challenges ADD CONSTRAINT staff_passkey_challenges_operation_check
  CHECK (operation IN ('register','login','approve','retry-payout','fraud-override','manage','jit-activate'));
CREATE INDEX staff_jit_activation_proofs_expiry ON app_private.staff_jit_activation_proofs(expires_at);
ALTER TABLE app_private.staff_jit_configuration ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.staff_jit_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.staff_jit_activation_proofs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.staff_jit_configuration, app_private.staff_jit_requests,
  app_private.staff_jit_activation_proofs FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION app_private.staff_jit_is_eligible(p_user_id uuid,p_permission_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p_user_id IS NOT NULL AND p_permission_key IS NOT NULL
    AND EXISTS (SELECT 1 FROM app_private.staff_jit_configuration c
      WHERE c.singleton AND c.enabled AND p_permission_key=ANY(c.allowed_permission_keys))
    AND EXISTS (SELECT 1 FROM public.users u WHERE u.id=p_user_id AND u.status='active')
    AND EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id
      WHERE ur.user_id=p_user_id AND ur.vendor_id IS NULL AND ur.outlet_id IS NULL
        AND r.name IN ('admin','approver','super_admin','staff'))
    AND EXISTS (SELECT 1 FROM public.staff_role_assignments a
      JOIN public.staff_roles r ON r.id=a.role_id AND r.is_active AND NOT r.is_system
      JOIN public.staff_role_jit_permissions rp ON rp.role_id=r.id
      JOIN public.staff_permissions p ON p.id=rp.permission_id AND p.key=p_permission_key
      WHERE a.user_id=p_user_id AND a.revoked_at IS NULL);
$$;
REVOKE ALL ON FUNCTION app_private.staff_jit_is_eligible(uuid,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION app_private.staff_jit_request_is_current(p_request_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM app_private.staff_jit_requests request_row
    JOIN public.staff_role_assignments assignment_row ON assignment_row.id=request_row.assignment_id
      AND assignment_row.user_id=request_row.user_id AND assignment_row.role_id=request_row.role_id
      AND assignment_row.revoked_at IS NULL
    JOIN public.staff_roles role_row ON role_row.id=request_row.role_id AND role_row.is_active
      AND NOT role_row.is_system AND role_row.updated_at=request_row.role_updated_at
    JOIN public.staff_role_jit_permissions role_permission ON role_permission.role_id=role_row.id
    JOIN public.staff_permissions permission_row ON permission_row.id=role_permission.permission_id
      AND permission_row.key=request_row.permission_key
    JOIN app_private.staff_jit_configuration config_row ON config_row.singleton AND config_row.enabled
      AND request_row.permission_key=ANY(config_row.allowed_permission_keys)
    WHERE request_row.id=p_request_id
      AND app_private.staff_jit_is_eligible(request_row.user_id,request_row.permission_key)
  );
$$;
REVOKE ALL ON FUNCTION app_private.staff_jit_request_is_current(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION app_private.require_staff_jit_admin()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_actor uuid:=auth.uid(); v_session uuid:=NULLIF(auth.jwt()->>'session_id','')::uuid;
BEGIN
  IF auth.role()<>'authenticated' OR v_actor IS NULL OR auth.jwt()->>'aal'<>'aal2' OR v_session IS NULL
    OR NOT public.is_active_global_staff_super_admin(v_actor)
    OR NOT EXISTS (SELECT 1 FROM auth.sessions s WHERE s.id=v_session AND s.user_id=v_actor
      AND (s.not_after IS NULL OR s.not_after>statement_timestamp()))
    OR NOT EXISTS (SELECT 1 FROM app_private.staff_session_assurance assurance_row
      JOIN app_private.staff_passkey_credentials credential_row ON credential_row.credential_id=assurance_row.credential_id
      WHERE assurance_row.user_id=v_actor AND assurance_row.session_id=v_session
        AND assurance_row.verified_at>statement_timestamp()-interval '2 minutes'
        AND assurance_row.expires_at>statement_timestamp() AND credential_row.revoked_at IS NULL) THEN
    RAISE EXCEPTION 'staff_jit_admin_assurance_required';
  END IF;
  RETURN v_actor;
END; $$;
REVOKE ALL ON FUNCTION app_private.require_staff_jit_admin() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION app_private.require_staff_jit_admin_aal2()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_actor uuid:=auth.uid(); v_session uuid:=NULLIF(auth.jwt()->>'session_id','')::uuid;
BEGIN
  IF auth.role()<>'authenticated' OR v_actor IS NULL OR auth.jwt()->>'aal'<>'aal2' OR v_session IS NULL
    OR NOT public.is_active_global_staff_super_admin(v_actor)
    OR NOT EXISTS (SELECT 1 FROM auth.sessions s WHERE s.id=v_session AND s.user_id=v_actor
      AND (s.not_after IS NULL OR s.not_after>statement_timestamp())) THEN
    RAISE EXCEPTION 'staff_jit_admin_aal2_required';
  END IF;
  RETURN v_actor;
END; $$;
REVOKE ALL ON FUNCTION app_private.require_staff_jit_admin_aal2() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION app_private.staff_jit_permission_for_current_session(p_user_id uuid,p_permission_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.role()='authenticated' AND auth.uid()=p_user_id
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
            AND role_row.updated_at=r.role_updated_at));
$$;
REVOKE ALL ON FUNCTION app_private.staff_jit_permission_for_current_session(uuid,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION app_private.has_staff_permission(p_user_id uuid,p_permission_key text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
BEGIN
  IF p_user_id IS NULL OR p_permission_key IS NULL OR (COALESCE(auth.role(),'')<>'service_role'
      AND (auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid())) THEN RETURN false; END IF;
  IF app_private.caller_lacks_aal2(p_user_id) THEN RETURN false; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.staff_permissions WHERE key=p_permission_key) THEN RETURN false; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=p_user_id AND u.status='active') THEN RETURN false; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.user_roles a JOIN public.roles r ON r.id=a.role_id
      WHERE a.user_id=p_user_id AND a.vendor_id IS NULL AND a.outlet_id IS NULL
        AND r.name IN ('admin','approver','super_admin','staff')) THEN RETURN false; END IF;
  IF EXISTS(SELECT 1 FROM public.user_roles a JOIN public.roles r ON r.id=a.role_id
      WHERE a.user_id=p_user_id AND a.vendor_id IS NULL AND a.outlet_id IS NULL AND r.name='super_admin') THEN RETURN true; END IF;
  IF EXISTS (
    SELECT 1 FROM public.staff_role_assignments a
    JOIN public.staff_roles r ON r.id=a.role_id AND r.is_active
    JOIN public.staff_role_modules rm ON rm.role_id=r.id
    JOIN public.staff_modules m ON m.id=rm.module_id AND m.is_active
    JOIN public.staff_module_permissions mp ON mp.module_id=m.id
    JOIN public.staff_permissions p ON p.id=mp.permission_id
    WHERE a.user_id=p_user_id AND a.revoked_at IS NULL AND p.key=p_permission_key
    UNION ALL
    SELECT 1 FROM public.user_roles a JOIN public.roles r ON r.id=a.role_id
    JOIN public.staff_module_legacy_roles lm ON lm.role_name=r.name AND lm.grants_permissions
    JOIN public.staff_modules m ON m.id=lm.module_id AND m.is_active
    JOIN public.staff_module_permissions mp ON mp.module_id=m.id
    JOIN public.staff_permissions p ON p.id=mp.permission_id
    WHERE a.user_id=p_user_id AND a.vendor_id IS NULL AND a.outlet_id IS NULL AND p.key=p_permission_key
  ) THEN RETURN true; END IF;
  RETURN app_private.staff_jit_permission_for_current_session(p_user_id,p_permission_key);
EXCEPTION WHEN OTHERS THEN RETURN false;
END; $$;
REVOKE ALL ON FUNCTION app_private.has_staff_permission(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION app_private.has_staff_permission(uuid,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION app_private.get_my_staff_access()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp AS $$
  WITH actor AS (
    SELECT auth.uid() AS user_id
  ), coarse_roles AS (
    SELECT DISTINCT coarse_role.name
      FROM actor JOIN public.user_roles assignment ON assignment.user_id=actor.user_id
      JOIN public.roles coarse_role ON coarse_role.id=assignment.role_id
     WHERE assignment.vendor_id IS NULL AND assignment.outlet_id IS NULL
       AND coarse_role.name IN ('admin','approver','super_admin','staff')
  ), active_assignments AS (
    SELECT staff_role.id,staff_role.name
      FROM actor JOIN public.staff_role_assignments assignment ON assignment.user_id=actor.user_id
      JOIN public.staff_roles staff_role ON staff_role.id=assignment.role_id
     WHERE assignment.revoked_at IS NULL AND staff_role.is_active
  ), effective_module_ids AS (
    SELECT role_module.module_id FROM active_assignments active_assignment
      JOIN public.staff_role_modules role_module ON role_module.role_id=active_assignment.id
    UNION
    SELECT legacy_module.module_id FROM coarse_roles coarse_role
      JOIN public.staff_module_legacy_roles legacy_module ON legacy_module.role_name=coarse_role.name
    UNION
    SELECT module_row.id FROM public.staff_modules module_row
      WHERE EXISTS (SELECT 1 FROM coarse_roles WHERE name='super_admin')
    UNION
    SELECT module_row.id FROM actor
      JOIN public.staff_modules module_row ON module_row.is_active
      JOIN public.staff_module_permissions module_permission ON module_permission.module_id=module_row.id
      JOIN public.staff_permissions permission ON permission.id=module_permission.permission_id
      WHERE app_private.staff_jit_permission_for_current_session(actor.user_id,permission.key)
  ), effective_permissions AS (
    SELECT permission.key FROM public.staff_permissions permission,actor
      WHERE public.has_staff_permission(actor.user_id,permission.key)
  ), module_rows AS (
    SELECT module_row.*,module_group.key AS group_key,module_group.name AS group_name,
      coalesce((SELECT jsonb_agg(permission.key ORDER BY permission.key)
        FROM public.staff_module_permissions module_permission
        JOIN public.staff_permissions permission ON permission.id=module_permission.permission_id
        WHERE module_permission.module_id=module_row.id),'[]'::jsonb) AS permission_keys
      FROM effective_module_ids effective
      JOIN public.staff_modules module_row ON module_row.id=effective.module_id AND module_row.is_active
      LEFT JOIN public.staff_module_group_members group_member ON group_member.module_id=module_row.id
      LEFT JOIN public.staff_module_groups module_group ON module_group.id=group_member.group_id AND module_group.is_active
  )
  SELECT jsonb_build_object(
    'roleNames',coalesce((SELECT jsonb_agg(name ORDER BY name) FROM active_assignments),'[]'::jsonb),
    'permissionKeys',coalesce((SELECT jsonb_agg(key ORDER BY key) FROM effective_permissions),'[]'::jsonb),
    'jitExpiresAt',(SELECT min(request_row.expires_at) FROM app_private.staff_jit_requests request_row
      JOIN public.staff_permissions permission ON permission.key=request_row.permission_key
      WHERE request_row.user_id=auth.uid() AND request_row.session_id=NULLIF(auth.jwt()->>'session_id','')::uuid
        AND request_row.state='active' AND request_row.expires_at>statement_timestamp()
        AND app_private.staff_jit_permission_for_current_session(auth.uid(),request_row.permission_key)),
    'modules',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id',id,'key',key,'label',label,'labelKey',label_key,'description',description,
      'sectionKey',section_key,'sectionLabel',section_label,'sectionLabelKey',section_label_key,
      'sectionSortOrder',section_sort_order,'href',href,'iconKey',icon_key,'sortOrder',sort_order,
      'groupKey',group_key,'groupName',group_name,'permissionKeys',permission_keys
    ) ORDER BY section_sort_order,sort_order,key) FROM module_rows),'[]'::jsonb)
  ) WHERE auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM coarse_roles);
$$;

CREATE FUNCTION public.update_staff_role_with_modules_and_jit(
  p_role_id uuid,p_name text,p_description text,p_module_keys text[],p_active boolean,
  p_jit_permission_keys text[],p_expected_updated_at timestamptz,p_reason text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_actor uuid; v_role public.staff_roles%ROWTYPE; v_module_keys text[]; v_before_modules text[]; v_permissions text[];
  v_before_jit text[]; v_requested_jit text[];
BEGIN
  v_actor:=app_private.require_staff_jit_admin();
  PERFORM public.validate_staff_reason(p_reason);
  IF p_name IS NULL OR char_length(btrim(p_name)) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'staff_role_name_required'; END IF;
  IF p_description IS NOT NULL AND char_length(btrim(p_description))>1000 THEN RAISE EXCEPTION 'staff_role_description_too_long'; END IF;
  IF p_active IS NULL OR p_expected_updated_at IS NULL THEN RAISE EXCEPTION 'staff_role_active_required'; END IF;
  SELECT * INTO v_role FROM public.staff_roles WHERE id=p_role_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'staff_role_not_found'; END IF;
  IF v_role.is_system THEN RAISE EXCEPTION 'system_role_protected'; END IF;
  IF v_role.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'staff_role_version_conflict'; END IF;
  v_module_keys:=public.validate_staff_module_keys(p_module_keys);
  SELECT coalesce(array_agg(m.key ORDER BY m.key),ARRAY[]::text[]) INTO v_before_modules
    FROM public.staff_role_modules rm JOIN public.staff_modules m ON m.id=rm.module_id WHERE rm.role_id=p_role_id;
  IF p_jit_permission_keys IS NULL OR EXISTS(SELECT 1 FROM unnest(p_jit_permission_keys) x WHERE x<>'admin.kyc.review')
     OR cardinality(p_jit_permission_keys)<>(SELECT count(DISTINCT x) FROM unnest(p_jit_permission_keys) x) THEN RAISE EXCEPTION 'invalid_jit_permission'; END IF;
  IF cardinality(p_jit_permission_keys)>0 AND NOT EXISTS(SELECT 1 FROM app_private.staff_jit_configuration c
      WHERE c.singleton AND 'admin.kyc.review'=ANY(c.allowed_permission_keys)) THEN RAISE EXCEPTION 'jit_permission_not_allowed'; END IF;
  SELECT coalesce(array_agg(p.key ORDER BY p.key),ARRAY[]::text[]) INTO v_before_jit
    FROM public.staff_role_jit_permissions rp JOIN public.staff_permissions p ON p.id=rp.permission_id WHERE rp.role_id=p_role_id;
  UPDATE public.staff_roles SET name=btrim(p_name),description=nullif(btrim(p_description),''),is_active=p_active,updated_at=clock_timestamp() WHERE id=p_role_id;
  DELETE FROM public.staff_role_modules WHERE role_id=p_role_id;
  INSERT INTO public.staff_role_modules(role_id,module_id) SELECT p_role_id,m.id FROM public.staff_modules m WHERE m.key=ANY(v_module_keys);
  PERFORM public.sync_staff_role_permissions(p_role_id);
  DELETE FROM public.staff_role_jit_permissions WHERE role_id=p_role_id;
  INSERT INTO public.staff_role_jit_permissions(role_id,permission_id)
    SELECT p_role_id,p.id FROM public.staff_permissions p WHERE p.key=ANY(p_jit_permission_keys);
  SELECT coalesce(array_agg(p.key ORDER BY p.key),ARRAY[]::text[]) INTO v_permissions
    FROM public.staff_role_permissions rp JOIN public.staff_permissions p ON p.id=rp.permission_id WHERE rp.role_id=p_role_id;
  v_requested_jit:=coalesce(p_jit_permission_keys,ARRAY[]::text[]);
  INSERT INTO public.audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data,note)
    VALUES(v_actor,'staff.role.updated','staff_role',p_role_id,
      jsonb_build_object('moduleKeys',v_before_modules,'jitPermissionKeys',v_before_jit,'isActive',v_role.is_active),
      jsonb_build_object('moduleKeys',v_module_keys,'permissionKeys',v_permissions,'jitPermissionKeys',v_requested_jit,'isActive',p_active),btrim(p_reason));
END; $$;
REVOKE ALL ON FUNCTION public.update_staff_role_with_modules_and_jit(uuid,text,text,text[],boolean,text[],timestamptz,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.update_staff_role_with_modules_and_jit(uuid,text,text,text[],boolean,text[],timestamptz,text) TO authenticated;

CREATE FUNCTION app_private.request_staff_jit_access(p_request_key uuid,p_permission_key text,p_duration_minutes integer,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_actor uuid:=auth.uid(); v_now timestamptz:=statement_timestamp(); v_cfg app_private.staff_jit_configuration%ROWTYPE;
  v_role uuid; v_assignment uuid; v_updated timestamptz; v_row app_private.staff_jit_requests%ROWTYPE;
BEGIN
  IF auth.role()<>'authenticated' OR v_actor IS NULL OR p_request_key IS NULL OR auth.jwt()->>'aal'<>'aal2'
    OR NOT EXISTS (SELECT 1 FROM auth.sessions s WHERE s.id=NULLIF(auth.jwt()->>'session_id','')::uuid
      AND s.user_id=v_actor AND (s.not_after IS NULL OR s.not_after>v_now)) THEN RAISE EXCEPTION 'staff_jit_aal2_required'; END IF;
  IF p_permission_key<>'admin.kyc.review' OR p_duration_minutes NOT IN (30,60) OR length(btrim(p_reason)) NOT BETWEEN 10 AND 500 THEN RAISE EXCEPTION 'staff_jit_invalid_request'; END IF;
  SELECT * INTO v_cfg FROM app_private.staff_jit_configuration WHERE singleton;
  IF NOT v_cfg.enabled OR NOT p_permission_key=ANY(v_cfg.allowed_permission_keys) OR NOT p_duration_minutes=ANY(v_cfg.allowed_durations_minutes) THEN RAISE EXCEPTION 'staff_jit_disabled'; END IF;
  UPDATE app_private.staff_jit_requests SET state='expired',version=version+1,updated_at=v_now
    WHERE user_id=v_actor AND state='active' AND expires_at<=v_now;
  UPDATE app_private.staff_jit_requests SET state='expired',version=version+1,updated_at=v_now
    WHERE user_id=v_actor AND state='pending' AND request_expires_at<=v_now;
  UPDATE app_private.staff_jit_requests SET state='expired',version=version+1,updated_at=v_now
    WHERE user_id=v_actor AND state='approved' AND activation_expires_at<=v_now;
  SELECT id,updated_at INTO v_role,v_updated FROM public.staff_roles r
    WHERE r.is_active AND NOT r.is_system AND EXISTS(SELECT 1 FROM public.staff_role_assignments a
      JOIN public.staff_role_jit_permissions rp ON rp.role_id=r.id JOIN public.staff_permissions p ON p.id=rp.permission_id
      WHERE a.user_id=v_actor AND a.role_id=r.id AND a.revoked_at IS NULL AND p.key=p_permission_key)
    ORDER BY r.id LIMIT 1;
  SELECT a.id INTO v_assignment FROM public.staff_role_assignments a WHERE a.user_id=v_actor AND a.role_id=v_role AND a.revoked_at IS NULL ORDER BY a.created_at DESC LIMIT 1;
  IF v_role IS NULL OR v_assignment IS NULL OR NOT app_private.staff_jit_is_eligible(v_actor,p_permission_key) THEN RAISE EXCEPTION 'staff_jit_ineligible'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_actor::text||':'||p_permission_key,0));
  SELECT * INTO v_row FROM app_private.staff_jit_requests WHERE user_id=v_actor AND request_key=p_request_key;
  IF FOUND THEN
    IF v_row.permission_key<>p_permission_key OR v_row.duration_minutes<>p_duration_minutes OR v_row.reason<>btrim(p_reason) THEN RAISE EXCEPTION 'staff_jit_idempotency_conflict'; END IF;
    RETURN app_private.staff_jit_request_response(v_row);
  END IF;
  IF EXISTS (SELECT 1 FROM app_private.staff_jit_requests WHERE user_id=v_actor AND permission_key=p_permission_key AND state IN ('pending','approved','active')) THEN
    RAISE EXCEPTION 'staff_jit_request_open';
  END IF;
  INSERT INTO app_private.staff_jit_requests(request_key,user_id,role_id,assignment_id,role_updated_at,permission_key,reason,duration_minutes,state,request_expires_at)
    VALUES(p_request_key,v_actor,v_role,v_assignment,v_updated,p_permission_key,btrim(p_reason),p_duration_minutes,'pending',v_now+v_cfg.request_ttl)
    RETURNING * INTO v_row;
  INSERT INTO public.audit_logs(actor_id,action,entity_type,entity_id,after_data,note)
    VALUES(v_actor,'staff.jit.requested','staff_jit_request',v_row.id,jsonb_build_object('permissionKey',p_permission_key,'durationMinutes',p_duration_minutes),btrim(p_reason));
  RETURN app_private.staff_jit_request_response(v_row);
END; $$;
REVOKE ALL ON FUNCTION app_private.request_staff_jit_access(uuid,text,integer,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION app_private.request_staff_jit_access(uuid,text,integer,text) TO authenticated;

CREATE FUNCTION public.request_staff_jit_access(p_request_key uuid,p_permission_key text,p_duration_minutes integer,p_reason text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
 SELECT app_private.request_staff_jit_access($1,$2,$3,$4);
$$;
REVOKE ALL ON FUNCTION public.request_staff_jit_access(uuid,text,integer,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.request_staff_jit_access(uuid,text,integer,text) TO authenticated;

CREATE FUNCTION app_private.get_my_staff_jit_status()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('enabled',coalesce((SELECT enabled FROM app_private.staff_jit_configuration WHERE singleton),false),
    'eligible',auth.role()='authenticated' AND auth.uid() IS NOT NULL AND auth.jwt()->>'aal'='aal2'
      AND EXISTS (SELECT 1 FROM auth.sessions s WHERE s.id=NULLIF(auth.jwt()->>'session_id','')::uuid
        AND s.user_id=auth.uid() AND (s.not_after IS NULL OR s.not_after>statement_timestamp()))
      AND app_private.staff_jit_is_eligible(auth.uid(),'admin.kyc.review'));
$$;
REVOKE ALL ON FUNCTION app_private.get_my_staff_jit_status() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION app_private.get_my_staff_jit_status() TO authenticated;
CREATE FUNCTION public.get_my_staff_jit_status()
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT app_private.get_my_staff_jit_status(); $$;
REVOKE ALL ON FUNCTION public.get_my_staff_jit_status() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_my_staff_jit_status() TO authenticated;

CREATE FUNCTION app_private.list_staff_jit_requests(p_page integer DEFAULT 1,p_page_size integer DEFAULT 25,p_state text DEFAULT NULL,p_admin_queue boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
DECLARE v_actor uuid:=auth.uid(); v_admin boolean:=public.is_active_global_staff_super_admin(auth.uid()); v_result jsonb;
BEGIN
  IF auth.role()<>'authenticated' OR v_actor IS NULL OR p_page<1 OR p_page>1000 OR p_page_size NOT IN (25,50,100)
      OR (p_state IS NOT NULL AND p_state NOT IN ('pending','approved','rejected','withdrawn','active','expired','revoked'))
      OR (p_admin_queue AND NOT v_admin) THEN RAISE EXCEPTION 'staff_jit_invalid_query'; END IF;
  IF auth.jwt()->>'aal'<>'aal2' OR NOT EXISTS (SELECT 1 FROM auth.sessions s WHERE s.id=NULLIF(auth.jwt()->>'session_id','')::uuid
      AND s.user_id=v_actor AND (s.not_after IS NULL OR s.not_after>statement_timestamp())) THEN RAISE EXCEPTION 'staff_jit_aal2_required'; END IF;
  IF p_admin_queue THEN PERFORM app_private.require_staff_jit_admin_aal2(); END IF;
  WITH filtered AS MATERIALIZED (
    SELECT r.*,u.full_name AS requester_name
      FROM app_private.staff_jit_requests r JOIN public.users u ON u.id=r.user_id
     WHERE ((p_admin_queue AND r.state='pending') OR (NOT p_admin_queue AND r.user_id=v_actor))
       AND (p_state IS NULL OR r.state=p_state)
  ), page_rows AS (SELECT * FROM filtered ORDER BY requested_at DESC,id DESC LIMIT p_page_size OFFSET (p_page-1)*p_page_size)
  SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id',r.id,'user_id',r.user_id,'request_key',r.request_key,'permission_key',r.permission_key,'reason',r.reason,'duration_minutes',r.duration_minutes,
    'state',CASE WHEN r.state='active' AND r.expires_at<=statement_timestamp() THEN 'expired'
      WHEN r.state='pending' AND r.request_expires_at<=statement_timestamp() THEN 'expired'
      WHEN r.state='approved' AND r.activation_expires_at<=statement_timestamp() THEN 'expired' ELSE r.state END,
    'requested_at',r.requested_at,'request_expires_at',r.request_expires_at,'decided_by',r.decided_by,'decided_at',r.decided_at,
    'decision_reason',r.decision_reason,'activation_expires_at',r.activation_expires_at,'activated_at',r.activated_at,'expires_at',r.expires_at,
    'ended_at',r.ended_at,'end_reason',r.end_reason,'version',r.version,'requester_name',r.requester_name
  ) ORDER BY r.requested_at DESC,r.id DESC) FROM page_rows r),'[]'::jsonb),'page',p_page,'pageSize',p_page_size,
  'total',(SELECT count(*) FROM filtered),'totalPages',ceil((SELECT count(*) FROM filtered)::numeric/p_page_size)) INTO v_result;
  RETURN v_result;
END; $$;
REVOKE ALL ON FUNCTION app_private.list_staff_jit_requests(integer,integer,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION app_private.list_staff_jit_requests(integer,integer,text,boolean) TO authenticated;
CREATE FUNCTION public.list_staff_jit_requests(p_page integer DEFAULT 1,p_page_size integer DEFAULT 25,p_state text DEFAULT NULL,p_admin_queue boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT app_private.list_staff_jit_requests($1,$2,$3,$4); $$;
REVOKE ALL ON FUNCTION public.list_staff_jit_requests(integer,integer,text,boolean) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.list_staff_jit_requests(integer,integer,text,boolean) TO authenticated;

CREATE FUNCTION app_private.set_staff_jit_enabled(p_enabled boolean,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_actor uuid:=app_private.require_staff_jit_admin(); v_before boolean;
BEGIN
  IF p_enabled IS NULL OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 10 AND 500 THEN RAISE EXCEPTION 'staff_jit_reason_required'; END IF;
  SELECT enabled INTO v_before FROM app_private.staff_jit_configuration WHERE singleton FOR UPDATE;
  UPDATE app_private.staff_jit_configuration SET enabled=p_enabled,updated_at=clock_timestamp(),updated_by=v_actor WHERE singleton;
  IF NOT p_enabled THEN UPDATE app_private.staff_jit_requests SET state='revoked',ended_at=clock_timestamp(),end_reason='JIT feature disabled',session_id=NULL,version=version+1,updated_at=clock_timestamp() WHERE state IN ('pending','approved','active'); END IF;
  INSERT INTO public.audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data,note)
    VALUES(v_actor,'staff.jit.configuration.updated','staff_jit_configuration',NULL,jsonb_build_object('enabled',v_before),jsonb_build_object('enabled',p_enabled),btrim(p_reason));
END; $$;
REVOKE ALL ON FUNCTION app_private.set_staff_jit_enabled(boolean,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION app_private.decide_staff_jit_request(p_request_id uuid,p_approve boolean,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_actor uuid:=app_private.require_staff_jit_admin(); v_row app_private.staff_jit_requests%ROWTYPE; v_cfg app_private.staff_jit_configuration%ROWTYPE; v_now timestamptz:=statement_timestamp();
BEGIN
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 10 AND 500 THEN RAISE EXCEPTION 'staff_jit_reason_required'; END IF;
  SELECT * INTO v_row FROM app_private.staff_jit_requests WHERE id=p_request_id FOR UPDATE;
  IF NOT FOUND OR v_row.state<>'pending' OR v_row.request_expires_at<=v_now THEN RAISE EXCEPTION 'staff_jit_request_unavailable'; END IF;
  IF v_row.user_id=v_actor THEN RAISE EXCEPTION 'staff_jit_self_approval_forbidden'; END IF;
  IF NOT app_private.staff_jit_request_is_current(v_row.id) THEN RAISE EXCEPTION 'staff_jit_ineligible'; END IF;
  SELECT * INTO v_cfg FROM app_private.staff_jit_configuration WHERE singleton AND enabled;
  IF NOT FOUND THEN RAISE EXCEPTION 'staff_jit_disabled'; END IF;
  UPDATE app_private.staff_jit_requests SET state=CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
    decided_by=v_actor,decided_at=v_now,decision_reason=btrim(p_reason),activation_expires_at=CASE WHEN p_approve THEN v_now+v_cfg.activation_ttl ELSE NULL END,
    version=version+1,updated_at=v_now WHERE id=v_row.id RETURNING * INTO v_row;
  INSERT INTO public.audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data,note)
    VALUES(v_actor,CASE WHEN p_approve THEN 'staff.jit.approved' ELSE 'staff.jit.rejected' END,'staff_jit_request',v_row.id,
      jsonb_build_object('state','pending'),jsonb_build_object('state',v_row.state,'requesterId',v_row.user_id),btrim(p_reason));
  RETURN app_private.staff_jit_request_response(v_row);
END; $$;
REVOKE ALL ON FUNCTION app_private.decide_staff_jit_request(uuid,boolean,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION app_private.decide_staff_jit_request(uuid,boolean,text) TO authenticated;
CREATE FUNCTION public.decide_staff_jit_request(p_request_id uuid,p_approve boolean,p_reason text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT app_private.decide_staff_jit_request($1,$2,$3); $$;
REVOKE ALL ON FUNCTION public.decide_staff_jit_request(uuid,boolean,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.decide_staff_jit_request(uuid,boolean,text) TO authenticated;

CREATE FUNCTION app_private.activate_staff_jit_access(p_request_id uuid,p_proof_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_actor uuid:=auth.uid(); v_session uuid:=NULLIF(auth.jwt()->>'session_id','')::uuid; v_row app_private.staff_jit_requests%ROWTYPE; v_proof app_private.staff_jit_activation_proofs%ROWTYPE; v_now timestamptz:=statement_timestamp(); v_session_end timestamptz;
BEGIN
  IF auth.role()<>'authenticated' OR v_actor IS NULL OR auth.jwt()->>'aal'<>'aal2' OR v_session IS NULL THEN RAISE EXCEPTION 'staff_jit_aal2_required'; END IF;
  SELECT * INTO v_row FROM app_private.staff_jit_requests WHERE id=p_request_id AND user_id=v_actor FOR UPDATE;
  IF NOT FOUND OR v_row.state<>'approved' OR v_row.activation_expires_at<=v_now THEN RAISE EXCEPTION 'staff_jit_request_unavailable'; END IF;
  IF NOT app_private.staff_jit_request_is_current(v_row.id) THEN RAISE EXCEPTION 'staff_jit_ineligible'; END IF;
  SELECT * INTO v_proof FROM app_private.staff_jit_activation_proofs WHERE id=p_proof_id AND request_id=v_row.id
    AND user_id=v_actor AND session_id=v_session AND request_version=v_row.version AND consumed_at IS NULL AND expires_at>v_now FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM app_private.staff_passkey_credentials c WHERE c.credential_id=v_proof.credential_id AND c.user_id=v_actor AND c.revoked_at IS NULL)
    OR NOT EXISTS(SELECT 1 FROM app_private.staff_session_assurance a WHERE a.session_id=v_session AND a.user_id=v_actor AND a.credential_id=v_proof.credential_id AND a.expires_at>v_now AND a.verified_at>v_now-interval '2 minutes') THEN RAISE EXCEPTION 'staff_jit_passkey_required'; END IF;
  SELECT s.not_after INTO v_session_end FROM auth.sessions s WHERE s.id=v_session AND s.user_id=v_actor AND (s.not_after IS NULL OR s.not_after>v_now);
  IF NOT FOUND THEN RAISE EXCEPTION 'staff_jit_session_invalid'; END IF;
  UPDATE app_private.staff_jit_activation_proofs SET consumed_at=v_now WHERE id=v_proof.id;
  UPDATE app_private.staff_jit_requests SET state='active',session_id=v_session,activated_at=v_now,
    expires_at=CASE WHEN v_session_end IS NULL THEN v_now+make_interval(mins=>v_row.duration_minutes)
      ELSE least(v_now+make_interval(mins=>v_row.duration_minutes),v_session_end) END,version=version+1,updated_at=v_now
    WHERE id=v_row.id RETURNING * INTO v_row;
  INSERT INTO public.audit_logs(actor_id,action,entity_type,entity_id,after_data,note)
    VALUES(v_actor,'staff.jit.activated','staff_jit_request',v_row.id,jsonb_build_object('permissionKey',v_row.permission_key,'expiresAt',v_row.expires_at),'Passkey verified JIT activation');
  RETURN app_private.staff_jit_request_response(v_row);
END; $$;
REVOKE ALL ON FUNCTION app_private.activate_staff_jit_access(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION app_private.activate_staff_jit_access(uuid,uuid) TO authenticated;
CREATE FUNCTION public.activate_staff_jit_access(p_request_id uuid,p_proof_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT app_private.activate_staff_jit_access($1,$2); $$;
REVOKE ALL ON FUNCTION public.activate_staff_jit_access(uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.activate_staff_jit_access(uuid,uuid) TO authenticated;

CREATE FUNCTION public.begin_staff_jit_passkey_challenge(
  p_user_id uuid,p_session_id uuid,p_challenge text,p_user_handle text,p_request_id uuid,p_request_version bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id uuid; v_handle text; v_row app_private.staff_jit_requests%ROWTYPE;
BEGIN
  PERFORM app_private.staff_passkey_service();
  IF NOT app_private.staff_password_session(p_user_id,p_session_id) THEN RAISE EXCEPTION 'password_session_required'; END IF;
  SELECT * INTO v_row FROM app_private.staff_jit_requests WHERE id=p_request_id AND user_id=p_user_id
    AND version=p_request_version AND state='approved' AND activation_expires_at>statement_timestamp() FOR UPDATE;
  IF NOT FOUND OR NOT app_private.staff_jit_request_is_current(v_row.id) THEN RAISE EXCEPTION 'staff_jit_request_unavailable'; END IF;
  IF NOT EXISTS(SELECT 1 FROM app_private.staff_passkey_credentials WHERE user_id=p_user_id AND revoked_at IS NULL) THEN RAISE EXCEPTION 'enrollment_required'; END IF;
  SELECT user_handle INTO v_handle FROM app_private.staff_passkey_credentials WHERE user_id=p_user_id AND revoked_at IS NULL LIMIT 1;
  INSERT INTO app_private.staff_passkey_challenges(user_id,session_id,operation,challenge,user_handle,binding,label)
    VALUES(p_user_id,p_session_id,'jit-activate',p_challenge,coalesce(v_handle,p_user_handle),
      jsonb_build_object('requestId',v_row.id,'requestVersion',v_row.version,'permissionKey',v_row.permission_key,'durationMinutes',v_row.duration_minutes),'JIT activation')
    RETURNING id INTO v_id;
  RETURN jsonb_build_object('id',v_id,'userHandle',coalesce(v_handle,p_user_handle));
END; $$;
REVOKE ALL ON FUNCTION public.begin_staff_jit_passkey_challenge(uuid,uuid,text,text,uuid,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_staff_jit_passkey_challenge(uuid,uuid,text,text,uuid,bigint) TO service_role;

CREATE FUNCTION public.finish_staff_jit_passkey_challenge(
  p_user_id uuid,p_session_id uuid,p_challenge_id uuid,p_reservation_token uuid,p_credential_id text,p_counter bigint,p_previous_counter bigint,p_device_type text,p_backed_up boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_challenge app_private.staff_passkey_challenges%ROWTYPE; v_proof app_private.staff_jit_activation_proofs%ROWTYPE;
BEGIN
  PERFORM app_private.staff_passkey_service();
  PERFORM 1 FROM auth.users WHERE id=p_user_id FOR UPDATE;
  IF NOT app_private.staff_password_session(p_user_id,p_session_id) THEN RAISE EXCEPTION 'password_session_required'; END IF;
  SELECT * INTO v_challenge FROM app_private.staff_passkey_challenges WHERE id=p_challenge_id AND user_id=p_user_id AND session_id=p_session_id
    AND operation='jit-activate' AND reservation_token=p_reservation_token AND consumed_at IS NOT NULL AND expires_at>statement_timestamp() AND finalized_at IS NULL FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM app_private.staff_passkey_credentials WHERE credential_id=p_credential_id AND user_id=p_user_id AND revoked_at IS NULL AND counter=p_previous_counter
      AND (p_counter>counter OR (p_counter=0 AND counter=0))) THEN RAISE EXCEPTION 'challenge_unavailable'; END IF;
  PERFORM 1 FROM app_private.staff_jit_requests WHERE id=(v_challenge.binding->>'requestId')::uuid AND user_id=p_user_id
    AND version=(v_challenge.binding->>'requestVersion')::bigint AND state='approved' AND activation_expires_at>statement_timestamp() FOR UPDATE;
  IF NOT FOUND OR NOT app_private.staff_jit_request_is_current((v_challenge.binding->>'requestId')::uuid) THEN RAISE EXCEPTION 'staff_jit_request_unavailable'; END IF;
  UPDATE app_private.staff_passkey_credentials SET counter=p_counter,device_type=p_device_type,backed_up=p_backed_up
    WHERE credential_id=p_credential_id AND user_id=p_user_id AND revoked_at IS NULL AND counter=p_previous_counter;
  IF NOT FOUND THEN RAISE EXCEPTION 'credential_unavailable'; END IF;
  UPDATE app_private.staff_passkey_challenges SET finalized_at=statement_timestamp() WHERE id=v_challenge.id;
  INSERT INTO app_private.staff_session_assurance(session_id,user_id,credential_id) VALUES(p_session_id,p_user_id,p_credential_id)
    ON CONFLICT(session_id) DO UPDATE SET credential_id=EXCLUDED.credential_id,verified_at=statement_timestamp(),expires_at=statement_timestamp()+interval '12 hours';
  INSERT INTO app_private.staff_jit_activation_proofs(request_id,user_id,session_id,request_version,credential_id)
    VALUES((v_challenge.binding->>'requestId')::uuid,p_user_id,p_session_id,(v_challenge.binding->>'requestVersion')::bigint,p_credential_id)
    RETURNING * INTO v_proof;
  INSERT INTO public.audit_logs(actor_id,action,entity_type,entity_id,after_data)
    VALUES(p_user_id,'staff.passkey_jit-activate','staff_jit_request',v_proof.request_id,jsonb_build_object('proofId',v_proof.id));
  RETURN jsonb_build_object('registered',false,'proofId',v_proof.id);
END; $$;
REVOKE ALL ON FUNCTION public.finish_staff_jit_passkey_challenge(uuid,uuid,uuid,uuid,text,bigint,bigint,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_staff_jit_passkey_challenge(uuid,uuid,uuid,uuid,text,bigint,bigint,text,boolean) TO service_role;

CREATE FUNCTION app_private.end_staff_jit_access(p_request_id uuid,p_reason text,p_revoke boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_actor uuid:=auth.uid(); v_row app_private.staff_jit_requests%ROWTYPE; v_admin boolean:=public.is_active_global_staff_super_admin(auth.uid()); v_now timestamptz:=statement_timestamp();
BEGIN
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 10 AND 500 THEN RAISE EXCEPTION 'staff_jit_reason_required'; END IF;
  IF p_revoke THEN PERFORM app_private.require_staff_jit_admin(); END IF;
  SELECT * INTO v_row FROM app_private.staff_jit_requests WHERE id=p_request_id AND (user_id=v_actor OR v_admin) FOR UPDATE;
  IF NOT FOUND OR v_row.state NOT IN ('pending','approved','active') THEN RAISE EXCEPTION 'staff_jit_request_unavailable'; END IF;
  IF v_admin AND p_revoke AND v_row.user_id=v_actor THEN RAISE EXCEPTION 'staff_jit_self_revocation_forbidden'; END IF;
  IF v_row.user_id<>v_actor AND NOT(v_admin AND p_revoke) THEN RAISE EXCEPTION 'staff_jit_permission_required'; END IF;
  UPDATE app_private.staff_jit_requests SET state=CASE WHEN p_revoke THEN 'revoked' ELSE 'withdrawn' END,ended_at=v_now,end_reason=btrim(p_reason),
    session_id=NULL,version=version+1,updated_at=v_now WHERE id=v_row.id RETURNING * INTO v_row;
  INSERT INTO public.audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data,note)
    VALUES(v_actor,CASE WHEN p_revoke THEN 'staff.jit.revoked' ELSE 'staff.jit.ended' END,'staff_jit_request',v_row.id,
      jsonb_build_object('state',CASE WHEN p_revoke THEN 'active' ELSE 'open' END),jsonb_build_object('state',v_row.state),btrim(p_reason));
  RETURN app_private.staff_jit_request_response(v_row);
END; $$;
REVOKE ALL ON FUNCTION app_private.end_staff_jit_access(uuid,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION app_private.end_staff_jit_access(uuid,text,boolean) TO authenticated;
CREATE FUNCTION public.end_staff_jit_access(p_request_id uuid,p_reason text,p_revoke boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT app_private.end_staff_jit_access($1,$2,$3); $$;
REVOKE ALL ON FUNCTION public.end_staff_jit_access(uuid,text,boolean) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.end_staff_jit_access(uuid,text,boolean) TO authenticated;

NOTIFY pgrst,'reload schema';
