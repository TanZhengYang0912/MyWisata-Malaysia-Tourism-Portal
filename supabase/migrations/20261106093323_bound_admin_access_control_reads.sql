-- Bounded, database-side reads for the Access Control workspace.
-- Keep the established Super Admin check and expose only resource projections.

CREATE OR REPLACE FUNCTION app_private.list_access_control_capabilities(
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 25,
  p_search text DEFAULT '',
  p_category text DEFAULT NULL,
  p_risk_level text DEFAULT NULL,
  p_enabled boolean DEFAULT NULL,
  p_customer_visible boolean DEFAULT NULL,
  p_key text DEFAULT NULL,
  p_manually_assignable boolean DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
DECLARE v_result jsonb; v_total bigint;
BEGIN
  PERFORM public.require_entitlement_super_admin();
  IF p_page IS NULL OR p_page < 1 OR p_page > 1000000
     OR p_page_size NOT IN (25, 50, 100)
     OR length(COALESCE(p_search, '')) > 160
     OR (p_category IS NOT NULL AND p_category NOT IN ('platform','commerce','ai','recommendation','affiliate','wallet'))
     OR (p_risk_level IS NOT NULL AND p_risk_level NOT IN ('low','medium','high','critical')) THEN
    RAISE EXCEPTION 'invalid_access_control_query';
  END IF;
  WITH filtered AS MATERIALIZED (
    SELECT c.* FROM public.capabilities c
     WHERE (COALESCE(btrim(p_search),'') = '' OR position(lower(btrim(p_search)) IN lower(c.key)) > 0)
       AND (p_category IS NULL OR c.category = p_category)
       AND (p_risk_level IS NULL OR c.risk_level = p_risk_level)
       AND (p_enabled IS NULL OR c.enabled = p_enabled)
       AND (p_customer_visible IS NULL OR c.customer_visible = p_customer_visible)
       AND (p_key IS NULL OR c.key = p_key)
       AND (p_manually_assignable IS NULL OR c.manually_assignable = p_manually_assignable)
  ), page_rows AS (
    SELECT * FROM filtered ORDER BY key LIMIT p_page_size OFFSET (p_page::bigint - 1) * p_page_size
  )
  SELECT (SELECT count(*) FROM filtered), jsonb_build_object(
    'items', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.key) FROM page_rows x),'[]'::jsonb),
    'page',p_page,'pageSize',p_page_size,
    'total',(SELECT count(*) FROM filtered),
    'totalPages',ceil((SELECT count(*) FROM filtered)::numeric/p_page_size),
    'generation',public.current_entitlement_generation()
  ) INTO v_total,v_result;
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION app_private.list_access_control_policies(
  p_page integer DEFAULT 1,p_page_size integer DEFAULT 25,p_search text DEFAULT '',
  p_capability_key text DEFAULT NULL,p_scope text DEFAULT NULL,p_status text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.require_entitlement_super_admin();
  IF p_page IS NULL OR p_page < 1 OR p_page > 1000000 OR p_page_size NOT IN (25,50,100)
     OR length(COALESCE(p_search,'')) > 160
     OR (p_scope IS NOT NULL AND p_scope NOT IN ('customer','admin','system'))
     OR (p_status IS NOT NULL AND p_status NOT IN ('draft','pending_approval','scheduled','active','retired')) THEN
    RAISE EXCEPTION 'invalid_access_control_query';
  END IF;
  WITH projected AS MATERIALIZED (
    SELECT p.id,p.key,p.capability_key,p.name,p.scope,p.created_at,
      latest.id AS latest_version_id,latest.version AS latest_version,
      latest.status AS latest_status,latest.effect AS latest_effect,
      latest.effective_from AS latest_effective_from,latest.effective_until AS latest_effective_until,
      (SELECT count(*) FROM public.entitlement_policy_versions vc WHERE vc.policy_id=p.id) AS version_count
    FROM public.entitlement_policies p
    LEFT JOIN LATERAL (
      SELECT v.* FROM public.entitlement_policy_versions v WHERE v.policy_id=p.id ORDER BY v.version DESC LIMIT 1
    ) latest ON TRUE
    WHERE (COALESCE(btrim(p_search),'')='' OR position(lower(btrim(p_search)) IN lower(p.key))>0
       OR position(lower(btrim(p_search)) IN lower(p.name))>0)
      AND (p_capability_key IS NULL OR p.capability_key=p_capability_key)
      AND (p_scope IS NULL OR p.scope=p_scope)
      AND (p_status IS NULL OR latest.status=p_status)
  ), page_rows AS (
    SELECT * FROM projected ORDER BY key LIMIT p_page_size OFFSET (p_page::bigint-1)*p_page_size
  )
  SELECT jsonb_build_object(
    'items',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id',x.id,'key',x.key,'capability_key',x.capability_key,'name',x.name,'scope',x.scope,'created_at',x.created_at,
      'latest_version',CASE WHEN x.latest_version_id IS NULL THEN NULL ELSE jsonb_build_object(
        'id',x.latest_version_id,'version',x.latest_version,'status',x.latest_status,'effect',x.latest_effect,
        'effective_from',x.latest_effective_from,'effective_until',x.latest_effective_until) END,
      'version_count',x.version_count
    ) ORDER BY x.key) FROM page_rows x),'[]'::jsonb),
    'page',p_page,'pageSize',p_page_size,'total',(SELECT count(*) FROM projected),
    'totalPages',ceil((SELECT count(*) FROM projected)::numeric/p_page_size),
    'generation',public.current_entitlement_generation()
  ) INTO v_result;
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION app_private.list_access_control_assignments(
  p_page integer DEFAULT 1,p_page_size integer DEFAULT 25,p_search text DEFAULT '',
  p_subject_type text DEFAULT NULL,p_capability_key text DEFAULT NULL,p_effect text DEFAULT NULL,p_status text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
DECLARE v_result jsonb; v_now timestamptz := statement_timestamp();
BEGIN
  PERFORM public.require_entitlement_super_admin();
  IF p_page IS NULL OR p_page < 1 OR p_page > 1000000 OR p_page_size NOT IN (25,50,100)
     OR length(COALESCE(p_search,'')) > 255
     OR (p_subject_type IS NOT NULL AND p_subject_type NOT IN ('user','role','plan','partner'))
     OR (p_effect IS NOT NULL AND p_effect NOT IN ('allow','deny'))
     OR (p_status IS NOT NULL AND p_status NOT IN ('active','scheduled','expired','revoked')) THEN
    RAISE EXCEPTION 'invalid_access_control_query';
  END IF;
  WITH projected AS MATERIALIZED (
    SELECT a.*,CASE WHEN a.revoked_at IS NOT NULL THEN 'revoked'
      WHEN a.starts_at > v_now THEN 'scheduled'
      WHEN a.expires_at IS NOT NULL AND a.expires_at <= v_now THEN 'expired' ELSE 'active' END AS status,
      u.full_name AS subject_full_name,u.display_name AS subject_display_name,u.email AS subject_email
    FROM public.entitlement_assignments a
    LEFT JOIN public.users u ON a.subject_type='user' AND u.id::text=a.subject_id
    WHERE (COALESCE(btrim(p_search),'')='' OR position(lower(btrim(p_search)) IN lower(a.subject_id))>0
       OR position(lower(btrim(p_search)) IN lower(a.capability_key))>0)
      AND (p_subject_type IS NULL OR a.subject_type=p_subject_type)
      AND (p_capability_key IS NULL OR a.capability_key=p_capability_key)
      AND (p_effect IS NULL OR a.effect=p_effect)
  ), filtered AS MATERIALIZED (
    SELECT * FROM projected WHERE p_status IS NULL OR status=p_status
  ), page_rows AS (
    SELECT * FROM filtered ORDER BY created_at DESC,id DESC LIMIT p_page_size OFFSET (p_page::bigint-1)*p_page_size
  )
  SELECT jsonb_build_object(
    'items',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id',x.id,'subject_type',x.subject_type,'subject_id',x.subject_id,'capability_key',x.capability_key,
      'effect',x.effect,'starts_at',x.starts_at,'expires_at',x.expires_at,'reason',x.reason,
      'granted_by',x.granted_by,'revoked_by',x.revoked_by,'revoked_at',x.revoked_at,'created_at',x.created_at,
      'status',x.status,'subject_full_name',x.subject_full_name,'subject_display_name',x.subject_display_name,'subject_email',x.subject_email
    ) ORDER BY x.created_at DESC,x.id DESC) FROM page_rows x),'[]'::jsonb),
    'page',p_page,'pageSize',p_page_size,'total',(SELECT count(*) FROM filtered),
    'totalPages',ceil((SELECT count(*) FROM filtered)::numeric/p_page_size),
    'generation',public.current_entitlement_generation()
  ) INTO v_result;
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION app_private.get_access_control_overview()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
DECLARE v_result jsonb; v_now timestamptz := statement_timestamp();
BEGIN
  PERFORM public.require_entitlement_super_admin();
  SELECT jsonb_build_object(
    'generation',public.current_entitlement_generation(),
    'counts',jsonb_build_object(
      'capabilities',(SELECT count(*) FROM public.capabilities),
      'activeVersions',(SELECT count(*) FROM public.entitlement_policy_versions WHERE status='active'),
      'pendingApprovals',(SELECT count(*) FROM public.entitlement_policy_versions WHERE status='pending_approval'),
      'activeAssignments',(SELECT count(*) FROM public.entitlement_assignments WHERE revoked_at IS NULL),
      'expiringAssignments',(SELECT count(*) FROM public.entitlement_assignments WHERE revoked_at IS NULL AND expires_at>v_now AND expires_at<=v_now+interval '30 days')
    ),
    'warnings',CASE WHEN EXISTS(SELECT 1 FROM public.capabilities WHERE enabled IS FALSE) THEN jsonb_build_array('CAPABILITY_DISABLED') ELSE '[]'::jsonb END
  ) INTO v_result;
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION app_private.list_access_control_policy_versions(
  p_policy_id uuid,p_page_size integer DEFAULT 25,p_before_version integer DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
DECLARE v_result jsonb; v_has_more boolean;
BEGIN
  PERFORM public.require_entitlement_super_admin();
  IF p_policy_id IS NULL OR p_page_size NOT BETWEEN 1 AND 100 OR (p_before_version IS NOT NULL AND p_before_version<1) THEN
    RAISE EXCEPTION 'invalid_access_control_query';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.entitlement_policies WHERE id=p_policy_id) THEN RAISE EXCEPTION 'policy_not_found'; END IF;
  WITH page_rows AS MATERIALIZED (
    SELECT v.* FROM public.entitlement_policy_versions v WHERE v.policy_id=p_policy_id
      AND (p_before_version IS NULL OR v.version<p_before_version)
      ORDER BY v.version DESC LIMIT p_page_size+1
  ), visible AS (SELECT * FROM page_rows ORDER BY version DESC LIMIT p_page_size)
  SELECT count(*)>p_page_size INTO v_has_more FROM page_rows;
  SELECT jsonb_build_object(
    'policy',(SELECT jsonb_build_object('id',p.id,'key',p.key,'capability_key',p.capability_key,'name',p.name,'scope',p.scope) FROM public.entitlement_policies p WHERE p.id=p_policy_id),
    'items',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id',v.id,'version',v.version,'status',v.status,'effect',v.effect,'effective_from',v.effective_from,'effective_until',v.effective_until,
      'created_by',v.created_by,'approved_by',v.approved_by,'created_at',v.created_at,'activated_at',v.activated_at,
      'requirements',COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.alternative_group,r.fact_key) FROM public.entitlement_policy_requirements r WHERE r.policy_version_id=v.id),'[]'::jsonb),
      'approvals',COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC) FROM public.entitlement_policy_approvals a WHERE a.policy_version_id=v.id),'[]'::jsonb)
    ) ORDER BY v.version DESC) FROM (
      SELECT v.* FROM public.entitlement_policy_versions v WHERE v.policy_id=p_policy_id
        AND (p_before_version IS NULL OR v.version<p_before_version)
        ORDER BY v.version DESC LIMIT p_page_size
    ) v),'[]'::jsonb),
    'pageSize',p_page_size,'hasMore',COALESCE(v_has_more,false),
    'nextCursor',CASE WHEN v_has_more THEN (SELECT min(visible_row.version) FROM (
      SELECT v.version FROM public.entitlement_policy_versions v WHERE v.policy_id=p_policy_id
        AND (p_before_version IS NULL OR v.version<p_before_version)
        ORDER BY v.version DESC LIMIT p_page_size
    ) visible_row) ELSE NULL END,
    'generation',public.current_entitlement_generation()
  ) INTO v_result;
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION app_private.get_access_control_generation()
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
BEGIN
  PERFORM public.require_entitlement_super_admin();
  RETURN public.current_entitlement_generation();
END; $$;

REVOKE ALL ON FUNCTION app_private.list_access_control_capabilities(integer,integer,text,text,text,boolean,boolean,text,boolean),
  app_private.list_access_control_policies(integer,integer,text,text,text,text),
  app_private.list_access_control_assignments(integer,integer,text,text,text,text,text),
  app_private.get_access_control_overview(),app_private.list_access_control_policy_versions(uuid,integer,integer),
  app_private.get_access_control_generation() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION app_private.list_access_control_capabilities(integer,integer,text,text,text,boolean,boolean,text,boolean),
  app_private.list_access_control_policies(integer,integer,text,text,text,text),
  app_private.list_access_control_assignments(integer,integer,text,text,text,text,text),
  app_private.get_access_control_overview(),app_private.list_access_control_policy_versions(uuid,integer,integer),
  app_private.get_access_control_generation() TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.list_access_control_capabilities(integer,integer,text,text,text,boolean,boolean,text,boolean),
  app_private.list_access_control_policies(integer,integer,text,text,text,text),
  app_private.list_access_control_assignments(integer,integer,text,text,text,text,text),
  app_private.get_access_control_overview(),app_private.list_access_control_policy_versions(uuid,integer,integer),
  app_private.get_access_control_generation() TO authenticated;

CREATE OR REPLACE FUNCTION public.list_access_control_capabilities(
  p_page integer DEFAULT 1,p_page_size integer DEFAULT 25,p_search text DEFAULT '',p_category text DEFAULT NULL,
  p_risk_level text DEFAULT NULL,p_enabled boolean DEFAULT NULL,p_customer_visible boolean DEFAULT NULL,p_key text DEFAULT NULL,
  p_manually_assignable boolean DEFAULT NULL
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT app_private.list_access_control_capabilities(p_page,p_page_size,p_search,p_category,p_risk_level,p_enabled,p_customer_visible,p_key,p_manually_assignable);
$$;
CREATE OR REPLACE FUNCTION public.list_access_control_policies(
  p_page integer DEFAULT 1,p_page_size integer DEFAULT 25,p_search text DEFAULT '',p_capability_key text DEFAULT NULL,p_scope text DEFAULT NULL,p_status text DEFAULT NULL
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT app_private.list_access_control_policies(p_page,p_page_size,p_search,p_capability_key,p_scope,p_status);
$$;
CREATE OR REPLACE FUNCTION public.list_access_control_assignments(
  p_page integer DEFAULT 1,p_page_size integer DEFAULT 25,p_search text DEFAULT '',p_subject_type text DEFAULT NULL,p_capability_key text DEFAULT NULL,p_effect text DEFAULT NULL,p_status text DEFAULT NULL
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT app_private.list_access_control_assignments(p_page,p_page_size,p_search,p_subject_type,p_capability_key,p_effect,p_status);
$$;
CREATE OR REPLACE FUNCTION public.get_access_control_overview()
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT app_private.get_access_control_overview(); $$;
CREATE OR REPLACE FUNCTION public.list_access_control_policy_versions(p_policy_id uuid,p_page_size integer DEFAULT 25,p_before_version integer DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT app_private.list_access_control_policy_versions(p_policy_id,p_page_size,p_before_version); $$;
CREATE OR REPLACE FUNCTION public.get_access_control_generation()
RETURNS bigint LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT app_private.get_access_control_generation(); $$;

REVOKE ALL ON FUNCTION public.list_access_control_capabilities(integer,integer,text,text,text,boolean,boolean,text,boolean),
  public.list_access_control_policies(integer,integer,text,text,text,text),
  public.list_access_control_assignments(integer,integer,text,text,text,text,text),
  public.get_access_control_overview(),public.list_access_control_policy_versions(uuid,integer,integer),
  public.get_access_control_generation() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.list_access_control_capabilities(integer,integer,text,text,text,boolean,boolean,text,boolean),
  public.list_access_control_policies(integer,integer,text,text,text,text),
  public.list_access_control_assignments(integer,integer,text,text,text,text,text),
  public.get_access_control_overview(),public.list_access_control_policy_versions(uuid,integer,integer),
  public.get_access_control_generation() TO authenticated;

NOTIFY pgrst,'reload schema';
