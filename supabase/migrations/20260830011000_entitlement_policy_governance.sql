-- Governed entitlement evaluation and mutation boundary.
-- All facts and actors are derived from trusted database/session state.

CREATE OR REPLACE FUNCTION public.validate_entitlement_reason(p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_reason IS NULL OR char_length(BTRIM(p_reason)) NOT BETWEEN 10 AND 2000 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.require_entitlement_super_admin()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
BEGIN
  IF v_actor IS NULL OR NOT public.is_super_admin(v_actor) THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;
  RETURN v_actor;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_entitlement_generation()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_generation BIGINT;
BEGIN
  UPDATE public.entitlement_generation
     SET generation = generation + 1,
         updated_at = now()
   WHERE singleton = TRUE
   RETURNING generation INTO v_generation;

  IF v_generation IS NULL THEN
    RAISE EXCEPTION 'policy_unavailable';
  END IF;
  RETURN v_generation;
END;
$$;

-- The stored generation covers governed writes. The transition count makes
-- time-window changes visible without a cron write: every assignment start or
-- expiry boundary crossed adds one to the token. Revoked rows remain in the
-- count, which may cause harmless extra invalidations but can never leave a
-- stale authorization snapshot. Overflow fails closed before JavaScript's
-- maximum safe integer because this value is returned through JSON.
CREATE OR REPLACE FUNCTION public.current_entitlement_generation()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_base_generation BIGINT;
  v_transition_count NUMERIC;
  v_effective_generation NUMERIC;
BEGIN
  SELECT generation INTO v_base_generation
    FROM public.entitlement_generation
   WHERE singleton = TRUE;
  IF v_base_generation IS NULL THEN
    RAISE EXCEPTION 'policy_unavailable';
  END IF;

  SELECT
    (COUNT(*) FILTER (WHERE assignment.starts_at <= now()))::NUMERIC
    + (COUNT(*) FILTER (
      WHERE assignment.expires_at IS NOT NULL AND assignment.expires_at <= now()
    ))::NUMERIC
  INTO v_transition_count
  FROM public.entitlement_assignments AS assignment;

  v_effective_generation := v_base_generation + v_transition_count;
  IF v_effective_generation < 0 OR v_effective_generation > 9007199254740991 THEN
    RAISE EXCEPTION 'policy_unavailable';
  END IF;

  RETURN v_effective_generation::BIGINT;
END;
$$;

CREATE OR REPLACE FUNCTION public.entitlement_fact_value(
  p_user_id UUID,
  p_fact_key TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_value JSONB;
BEGIN
  CASE p_fact_key
    WHEN 'email_verified' THEN
      SELECT to_jsonb(user_row.email_verified_at IS NOT NULL)
        INTO v_value
        FROM public.users AS user_row
       WHERE user_row.id = p_user_id;
    WHEN 'phone_verified' THEN
      SELECT to_jsonb(user_row.phone_verified_at IS NOT NULL)
        INTO v_value
        FROM public.users AS user_row
       WHERE user_row.id = p_user_id;
    WHEN 'profile_complete' THEN
      SELECT to_jsonb(user_row.profile_completed_at IS NOT NULL)
        INTO v_value
        FROM public.users AS user_row
       WHERE user_row.id = p_user_id;
    WHEN 'kyc_status' THEN
      SELECT to_jsonb(user_row.kyc_status::TEXT)
        INTO v_value
        FROM public.users AS user_row
       WHERE user_row.id = p_user_id;
    WHEN 'account_status' THEN
      SELECT to_jsonb(user_row.status::TEXT)
        INTO v_value
        FROM public.users AS user_row
       WHERE user_row.id = p_user_id;
    WHEN 'role' THEN
      SELECT COALESCE(jsonb_agg(to_jsonb(role_row.name) ORDER BY role_row.name), '[]'::JSONB)
        INTO v_value
        FROM public.user_roles AS user_role
        JOIN public.roles AS role_row ON role_row.id = user_role.role_id
       WHERE user_role.user_id = p_user_id;
    -- These keys are registered for forward compatibility, but no authoritative
    -- membership source exists yet. They must make the whole evaluation
    -- unavailable: returning an empty set would let eq/contains-empty and
    -- not_eq requirements match and overgrant.
    WHEN 'plan' THEN
      RAISE EXCEPTION 'policy_unavailable';
    WHEN 'partner' THEN
      RAISE EXCEPTION 'policy_unavailable';
    ELSE
      RAISE EXCEPTION 'policy_invalid';
  END CASE;

  RETURN v_value;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_entitlement_requirement(
  p_fact_key TEXT,
  p_operator TEXT,
  p_expected_value JSONB
) RETURNS VOID
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_fact_key NOT IN (
    'email_verified', 'phone_verified', 'profile_complete', 'kyc_status',
    'account_status', 'role', 'plan', 'partner'
  ) OR p_operator NOT IN ('eq', 'not_eq', 'contains') OR p_expected_value IS NULL THEN
    RAISE EXCEPTION 'policy_invalid';
  END IF;

  IF p_fact_key IN ('email_verified', 'phone_verified', 'profile_complete')
     AND jsonb_typeof(p_expected_value) <> 'boolean' THEN
    RAISE EXCEPTION 'policy_invalid';
  END IF;

  IF p_fact_key IN ('kyc_status', 'account_status')
     AND jsonb_typeof(p_expected_value) <> 'string' THEN
    RAISE EXCEPTION 'policy_invalid';
  END IF;

  IF p_fact_key IN ('role', 'plan', 'partner')
     AND jsonb_typeof(p_expected_value) NOT IN ('string', 'array') THEN
    RAISE EXCEPTION 'policy_invalid';
  END IF;

  IF p_operator = 'contains' AND p_fact_key NOT IN ('role', 'plan', 'partner') THEN
    RAISE EXCEPTION 'policy_invalid';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.entitlement_requirement_matches(
  p_user_id UUID,
  p_fact_key TEXT,
  p_operator TEXT,
  p_expected_value JSONB
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actual JSONB;
BEGIN
  PERFORM public.validate_entitlement_requirement(p_fact_key, p_operator, p_expected_value);
  v_actual := public.entitlement_fact_value(p_user_id, p_fact_key);
  IF v_actual IS NULL THEN
    RETURN FALSE;
  END IF;

  CASE p_operator
    WHEN 'eq' THEN
      RETURN v_actual = p_expected_value;
    WHEN 'not_eq' THEN
      RETURN v_actual <> p_expected_value;
    WHEN 'contains' THEN
      IF jsonb_typeof(p_expected_value) = 'array' THEN
        RETURN v_actual @> p_expected_value;
      END IF;
      RETURN v_actual @> jsonb_build_array(p_expected_value);
    ELSE
      RAISE EXCEPTION 'policy_invalid';
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.capability_hard_guard(
  p_user_id UUID,
  p_capability_key TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email BOOLEAN;
  v_phone BOOLEAN;
  v_profile BOOLEAN;
  v_kyc TEXT;
  v_status TEXT;
  v_roles JSONB;
  v_customer_eligible BOOLEAN;
BEGIN
  SELECT
    user_row.email_verified_at IS NOT NULL,
    user_row.phone_verified_at IS NOT NULL,
    user_row.profile_completed_at IS NOT NULL,
    user_row.kyc_status,
    user_row.status
  INTO v_email, v_phone, v_profile, v_kyc, v_status
  FROM public.users AS user_row
  WHERE user_row.id = p_user_id;

  IF NOT FOUND OR v_status IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object(
      'allowed', FALSE,
      'blockerCode', 'ACCOUNT_RESTRICTED',
      'qualificationPaths', '[]'::JSONB
    );
  END IF;

  v_roles := public.entitlement_fact_value(p_user_id, 'role');
  v_customer_eligible := v_roles ? 'customer'
    AND NOT (v_roles ? 'vendor_owner')
    AND NOT (v_roles ? 'outlet_manager');

  IF p_capability_key = 'wallet.approve_withdrawal' THEN
    IF NOT (v_roles ? 'super_admin' OR v_roles ? 'approver') THEN
      RETURN jsonb_build_object('allowed', FALSE, 'blockerCode', 'ENTITLEMENT_DENIED', 'qualificationPaths', '[]'::JSONB);
    END IF;
    RETURN jsonb_build_object('allowed', TRUE, 'blockerCode', NULL, 'qualificationPaths', '[]'::JSONB);
  END IF;

  IF p_capability_key IN (
    'platform.browse', 'commerce.booking', 'commerce.purchase',
    'commerce.checkout', 'ai.basic_recommendation', 'recommendation.submit',
    'affiliate.limited', 'affiliate.full', 'affiliate.earn_commission',
    'wallet.request_withdrawal'
  ) AND NOT v_email THEN
    RETURN jsonb_build_object(
      'allowed', FALSE,
      'blockerCode', 'EMAIL_VERIFICATION_REQUIRED',
      'qualificationPaths', jsonb_build_array(jsonb_build_object('type', 'email', 'href', '/customer/profile'))
    );
  END IF;

  IF p_capability_key IN (
    'commerce.booking', 'commerce.purchase', 'commerce.checkout', 'ai.basic_recommendation'
  ) AND NOT v_phone THEN
    RETURN jsonb_build_object(
      'allowed', FALSE,
      'blockerCode', 'PHONE_VERIFICATION_REQUIRED',
      'qualificationPaths', jsonb_build_array(jsonb_build_object('type', 'phone', 'href', '/customer/profile'))
    );
  END IF;

  IF p_capability_key = 'recommendation.submit'
     AND NOT v_profile
     AND v_kyc IS DISTINCT FROM 'approved' THEN
    RETURN jsonb_build_object(
      'allowed', FALSE,
      'blockerCode', 'PROFILE_OR_KYC_REQUIRED',
      'qualificationPaths', jsonb_build_array(
        jsonb_build_object('type', 'profile', 'href', '/customer/profile'),
        jsonb_build_object('type', 'kyc', 'href', '/customer/kyc')
      )
    );
  END IF;

  IF p_capability_key = 'affiliate.limited' THEN
    IF NOT v_customer_eligible OR v_kyc = 'approved' THEN
      RETURN jsonb_build_object('allowed', FALSE, 'blockerCode', 'ENTITLEMENT_DENIED', 'qualificationPaths', '[]'::JSONB);
    END IF;
    IF NOT v_profile THEN
      RETURN jsonb_build_object(
        'allowed', FALSE,
        'blockerCode', 'PROFILE_REQUIRED',
        'qualificationPaths', jsonb_build_array(jsonb_build_object('type', 'profile', 'href', '/customer/profile'))
      );
    END IF;
  END IF;

  IF p_capability_key IN ('affiliate.full', 'affiliate.earn_commission', 'wallet.request_withdrawal') THEN
    IF NOT v_customer_eligible THEN
      RETURN jsonb_build_object('allowed', FALSE, 'blockerCode', 'ENTITLEMENT_DENIED', 'qualificationPaths', '[]'::JSONB);
    END IF;
    IF v_kyc IS DISTINCT FROM 'approved' THEN
      RETURN jsonb_build_object(
        'allowed', FALSE,
        'blockerCode', CASE v_kyc
          WHEN 'pending' THEN 'KYC_PENDING'
          WHEN 'rejected' THEN 'KYC_RESUBMISSION_REQUIRED'
          ELSE 'KYC_REQUIRED'
        END,
        'qualificationPaths', jsonb_build_array(jsonb_build_object('type', 'kyc', 'href', '/customer/kyc'))
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('allowed', TRUE, 'blockerCode', NULL, 'qualificationPaths', '[]'::JSONB);
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_user_capability(
  p_user_id UUID,
  p_capability_key TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_generation BIGINT := 0;
  v_capability_enabled BOOLEAN;
  v_guard JSONB;
  v_explicit_deny BOOLEAN := FALSE;
  v_deny_source TEXT;
  v_explicit_allow BOOLEAN := FALSE;
  v_allow_source TEXT;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'authentication_required';
    END IF;
    IF auth.uid() IS DISTINCT FROM p_user_id THEN
      RAISE EXCEPTION 'resolver_subject_forbidden';
    END IF;
  END IF;

  BEGIN
    v_generation := public.current_entitlement_generation();

    -- Resolve key existence before subject guards. Unknown runtime keys deny,
    -- but known disabled keys still report account/hard-guard blockers first.
    SELECT capability.enabled INTO v_capability_enabled
      FROM public.capabilities AS capability
     WHERE capability.key = p_capability_key;
    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'capability', p_capability_key,
        'allowed', FALSE,
        'blockerCode', 'ENTITLEMENT_DENIED',
        'qualificationPaths', '[]'::JSONB,
        'entitlementGeneration', v_generation,
        'source', 'default_deny'
      );
    END IF;

    -- Account and capability hard guards run before enabled-state denial and
    -- before all policy and assignment data.
    v_guard := public.capability_hard_guard(p_user_id, p_capability_key);
    IF NOT COALESCE((v_guard ->> 'allowed')::BOOLEAN, FALSE) THEN
      RETURN jsonb_build_object(
        'capability', p_capability_key,
        'allowed', FALSE,
        'blockerCode', v_guard ->> 'blockerCode',
        'qualificationPaths', COALESCE(v_guard -> 'qualificationPaths', '[]'::JSONB),
        'entitlementGeneration', v_generation,
        'source', 'hard_guard'
      );
    END IF;

    -- A known disabled capability is default-denied after hard guards.
    IF NOT v_capability_enabled THEN
      RETURN jsonb_build_object(
        'capability', p_capability_key,
        'allowed', FALSE,
        'blockerCode', 'ENTITLEMENT_DENIED',
        'qualificationPaths', '[]'::JSONB,
        'entitlementGeneration', v_generation,
        'source', 'default_deny'
      );
    END IF;

    WITH candidate_versions AS (
      SELECT version_row.id, version_row.effect
        FROM public.entitlement_policy_versions AS version_row
        JOIN public.entitlement_policies AS policy_row ON policy_row.id = version_row.policy_id
       WHERE policy_row.capability_key = p_capability_key
         AND version_row.status = 'active'
         AND version_row.effective_from <= now()
         AND (version_row.effective_until IS NULL OR version_row.effective_until > now())
    ), matching_groups AS (
      SELECT requirement.policy_version_id, requirement.alternative_group
        FROM public.entitlement_policy_requirements AS requirement
        JOIN candidate_versions AS candidate ON candidate.id = requirement.policy_version_id
       GROUP BY requirement.policy_version_id, requirement.alternative_group
      HAVING bool_and(public.entitlement_requirement_matches(
        p_user_id,
        requirement.fact_key,
        requirement.operator,
        requirement.expected_value
      ))
    ), matching_policies AS (
      SELECT candidate.id, candidate.effect
        FROM candidate_versions AS candidate
       WHERE NOT EXISTS (
         SELECT 1 FROM public.entitlement_policy_requirements AS requirement
          WHERE requirement.policy_version_id = candidate.id
       ) OR EXISTS (
         SELECT 1 FROM matching_groups
          WHERE matching_groups.policy_version_id = candidate.id
       )
    ), matching_assignments AS (
      SELECT assignment.effect
        FROM public.entitlement_assignments AS assignment
       WHERE assignment.capability_key = p_capability_key
         AND assignment.revoked_at IS NULL
         AND assignment.starts_at <= now()
         AND (assignment.expires_at IS NULL OR assignment.expires_at > now())
         AND CASE assignment.subject_type
           WHEN 'user' THEN assignment.subject_id = p_user_id::TEXT
           WHEN 'role' THEN public.entitlement_fact_value(p_user_id, 'role') ? assignment.subject_id
           WHEN 'plan' THEN public.entitlement_fact_value(p_user_id, 'plan') ? assignment.subject_id
           WHEN 'partner' THEN public.entitlement_fact_value(p_user_id, 'partner') ? assignment.subject_id
           ELSE FALSE
         END
    )
    SELECT
      EXISTS (SELECT 1 FROM matching_assignments WHERE effect = 'deny')
        OR EXISTS (SELECT 1 FROM matching_policies WHERE effect = 'deny'),
      CASE
        WHEN EXISTS (SELECT 1 FROM matching_assignments WHERE effect = 'deny') THEN 'assignment'
        WHEN EXISTS (SELECT 1 FROM matching_policies WHERE effect = 'deny') THEN 'policy'
        ELSE NULL
      END,
      EXISTS (SELECT 1 FROM matching_assignments WHERE effect = 'allow')
        OR EXISTS (SELECT 1 FROM matching_policies WHERE effect = 'allow'),
      CASE
        WHEN EXISTS (SELECT 1 FROM matching_assignments WHERE effect = 'allow') THEN 'assignment'
        WHEN EXISTS (SELECT 1 FROM matching_policies WHERE effect = 'allow') THEN 'policy'
        ELSE NULL
      END
    INTO v_explicit_deny, v_deny_source, v_explicit_allow, v_allow_source;

    -- Explicit deny always wins once the immutable guard has passed.
    IF v_explicit_deny THEN
      RETURN jsonb_build_object(
        'capability', p_capability_key,
        'allowed', FALSE,
        'blockerCode', 'ENTITLEMENT_DENIED',
        'qualificationPaths', '[]'::JSONB,
        'entitlementGeneration', v_generation,
        'source', v_deny_source
      );
    END IF;

    -- An allow can select a capability, but can never bypass the guard above.
    IF v_explicit_allow THEN
      RETURN jsonb_build_object(
        'capability', p_capability_key,
        'allowed', TRUE,
        'blockerCode', NULL,
        'qualificationPaths', '[]'::JSONB,
        'entitlementGeneration', v_generation,
        'source', v_allow_source
      );
    END IF;

    RETURN jsonb_build_object(
      'capability', p_capability_key,
      'allowed', FALSE,
      'blockerCode', 'ENTITLEMENT_DENIED',
      'qualificationPaths', '[]'::JSONB,
      'entitlementGeneration', v_generation,
      'source', 'default_deny'
    );
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'capability', p_capability_key,
      'allowed', FALSE,
      'blockerCode', 'POLICY_UNAVAILABLE',
      'qualificationPaths', '[]'::JSONB,
      'entitlementGeneration', COALESCE(v_generation, 0),
      'source', 'default_deny'
    );
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_entitlement_access_control_state()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_result JSONB;
BEGIN
  IF v_actor IS NULL OR NOT public.is_super_admin(v_actor) THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;

  SELECT jsonb_build_object(
    'capabilities', COALESCE((
      SELECT jsonb_agg(to_jsonb(capability) ORDER BY capability.key)
        FROM public.capabilities AS capability
    ), '[]'::JSONB),
    'policies', COALESCE((
      SELECT jsonb_agg(to_jsonb(policy_row) ORDER BY policy_row.key)
        FROM public.entitlement_policies AS policy_row
    ), '[]'::JSONB),
    'policyVersions', COALESCE((
      SELECT jsonb_agg(to_jsonb(version_row) ORDER BY version_row.created_at DESC)
        FROM public.entitlement_policy_versions AS version_row
    ), '[]'::JSONB),
    'policyRequirements', COALESCE((
      SELECT jsonb_agg(to_jsonb(requirement) ORDER BY requirement.created_at)
        FROM public.entitlement_policy_requirements AS requirement
    ), '[]'::JSONB),
    'approvals', COALESCE((
      SELECT jsonb_agg(to_jsonb(approval) ORDER BY approval.created_at DESC)
        FROM public.entitlement_policy_approvals AS approval
    ), '[]'::JSONB),
    'assignments', COALESCE((
      SELECT jsonb_agg(to_jsonb(assignment) ORDER BY assignment.created_at DESC)
        FROM public.entitlement_assignments AS assignment
    ), '[]'::JSONB),
    'generation', public.current_entitlement_generation()
  ) INTO v_result;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_entitlement_policy_version(
  p_policy_id UUID,
  p_effect TEXT,
  p_effective_from TIMESTAMPTZ,
  p_effective_until TIMESTAMPTZ,
  p_requirements JSONB,
  p_reason TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_version_id UUID;
  v_next_version INTEGER;
  v_requirement JSONB;
  v_group INTEGER;
  v_fact_key TEXT;
  v_operator TEXT;
  v_expected JSONB;
BEGIN
  IF v_actor IS NULL OR NOT public.is_super_admin(v_actor) THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;
  PERFORM public.validate_entitlement_reason(p_reason);

  IF p_effect NOT IN ('allow', 'deny')
     OR p_effective_from IS NULL
     OR (p_effective_until IS NOT NULL AND p_effective_until <= p_effective_from)
     OR p_requirements IS NULL
     OR jsonb_typeof(p_requirements) <> 'array' THEN
    RAISE EXCEPTION 'policy_invalid';
  END IF;

  PERFORM 1 FROM public.entitlement_policies WHERE id = p_policy_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'policy_not_found'; END IF;

  SELECT COALESCE(MAX(version), 0) + 1
    INTO v_next_version
    FROM public.entitlement_policy_versions
   WHERE policy_id = p_policy_id;

  INSERT INTO public.entitlement_policy_versions(
    policy_id, version, status, effect, effective_from, effective_until, created_by
  ) VALUES (
    p_policy_id, v_next_version, 'pending_approval', p_effect,
    p_effective_from, p_effective_until, v_actor
  ) RETURNING id INTO v_version_id;

  FOR v_requirement IN SELECT value FROM jsonb_array_elements(p_requirements)
  LOOP
    IF jsonb_typeof(v_requirement) <> 'object'
       OR NOT (v_requirement ?& ARRAY['alternativeGroup', 'factKey', 'operator', 'expectedValue'])
       OR EXISTS (
         SELECT 1 FROM jsonb_object_keys(v_requirement) AS requirement_key
          WHERE requirement_key NOT IN ('alternativeGroup', 'factKey', 'operator', 'expectedValue')
       )
       OR jsonb_typeof(v_requirement -> 'alternativeGroup') <> 'number'
       OR (v_requirement ->> 'alternativeGroup') !~ '^[1-9][0-9]*$' THEN
      RAISE EXCEPTION 'policy_invalid';
    END IF;

    v_group := (v_requirement ->> 'alternativeGroup')::INTEGER;
    v_fact_key := v_requirement ->> 'factKey';
    v_operator := v_requirement ->> 'operator';
    v_expected := v_requirement -> 'expectedValue';
    PERFORM public.validate_entitlement_requirement(v_fact_key, v_operator, v_expected);

    INSERT INTO public.entitlement_policy_requirements(
      policy_version_id, alternative_group, fact_key, operator, expected_value
    ) VALUES (v_version_id, v_group, v_fact_key, v_operator, v_expected);
  END LOOP;

  INSERT INTO public.audit_logs(
    actor_id, action, entity_type, entity_id, before_data, after_data, note
  ) VALUES (
    v_actor,
    'entitlement.policy_version.created',
    'entitlement_policy_version',
    v_version_id,
    NULL,
    jsonb_build_object(
      'policyId', p_policy_id,
      'policyVersionId', v_version_id,
      'version', v_next_version,
      'effect', p_effect,
      'status', 'pending_approval',
      'effectiveFrom', p_effective_from,
      'effectiveUntil', p_effective_until
    ),
    BTRIM(p_reason)
  );

  RETURN v_version_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_entitlement_policy_version(
  p_version_id UUID,
  p_reason TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_version RECORD;
BEGIN
  IF v_actor IS NULL OR NOT public.is_super_admin(v_actor) THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;
  PERFORM public.validate_entitlement_reason(p_reason);

  SELECT version_row.*, policy_row.capability_key, capability.risk_level
    INTO v_version
    FROM public.entitlement_policy_versions AS version_row
    JOIN public.entitlement_policies AS policy_row ON policy_row.id = version_row.policy_id
    JOIN public.capabilities AS capability ON capability.key = policy_row.capability_key
   WHERE version_row.id = p_version_id
   FOR UPDATE OF version_row;

  IF NOT FOUND THEN RAISE EXCEPTION 'policy_version_not_found'; END IF;
  IF v_version.status <> 'pending_approval' THEN RAISE EXCEPTION 'policy_version_not_pending'; END IF;
  IF v_version.risk_level IN ('high', 'critical') AND v_version.created_by = v_actor THEN
    RAISE EXCEPTION 'self_approval_forbidden';
  END IF;
  -- Task 2's integrity constraint separates creator/approver for every risk tier.
  IF v_version.created_by = v_actor THEN RAISE EXCEPTION 'self_approval_forbidden'; END IF;

  INSERT INTO public.entitlement_policy_approvals(
    policy_version_id, decision, actor_id, reason
  ) VALUES (p_version_id, 'approved', v_actor, BTRIM(p_reason));

  UPDATE public.entitlement_policy_versions
     SET status = 'scheduled', approved_by = v_actor
   WHERE id = p_version_id;

  INSERT INTO public.audit_logs(
    actor_id, action, entity_type, entity_id, before_data, after_data, note
  ) VALUES (
    v_actor,
    'entitlement.policy_version.approved',
    'entitlement_policy_version',
    p_version_id,
    jsonb_build_object('status', v_version.status, 'approvedBy', v_version.approved_by),
    jsonb_build_object(
      'policyId', v_version.policy_id,
      'policyVersionId', p_version_id,
      'capabilityKey', v_version.capability_key,
      'status', 'scheduled',
      'approvedBy', v_actor
    ),
    BTRIM(p_reason)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.activate_entitlement_policy_version(
  p_version_id UUID,
  p_reason TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_version RECORD;
  v_previous_active UUID;
  v_generation BIGINT;
BEGIN
  IF v_actor IS NULL OR NOT public.is_super_admin(v_actor) THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;
  PERFORM public.validate_entitlement_reason(p_reason);

  SELECT version_row.*, policy_row.capability_key
    INTO v_version
    FROM public.entitlement_policy_versions AS version_row
    JOIN public.entitlement_policies AS policy_row ON policy_row.id = version_row.policy_id
   WHERE version_row.id = p_version_id
   FOR UPDATE OF version_row;

  IF NOT FOUND THEN RAISE EXCEPTION 'policy_version_not_found'; END IF;
  IF v_version.status <> 'scheduled' OR v_version.approved_by IS NULL THEN
    RAISE EXCEPTION 'policy_version_not_approved';
  END IF;
  IF v_version.effective_from > now()
     OR (v_version.effective_until IS NOT NULL AND v_version.effective_until <= now()) THEN
    RAISE EXCEPTION 'policy_version_not_effective';
  END IF;

  SELECT id INTO v_previous_active
    FROM public.entitlement_policy_versions
   WHERE policy_id = v_version.policy_id AND status = 'active'
   FOR UPDATE;

  UPDATE public.entitlement_policy_versions
     SET status = 'retired'
   WHERE policy_id = v_version.policy_id AND status = 'active';

  UPDATE public.entitlement_policy_versions
     SET status = 'active', activated_at = now()
   WHERE id = p_version_id;

  PERFORM public.increment_entitlement_generation();
  v_generation := public.current_entitlement_generation();

  INSERT INTO public.audit_logs(
    actor_id, action, entity_type, entity_id, before_data, after_data, note
  ) VALUES (
    v_actor,
    'entitlement.policy_version.activated',
    'entitlement_policy_version',
    p_version_id,
    jsonb_build_object('status', v_version.status, 'previousActiveVersionId', v_previous_active),
    jsonb_build_object(
      'policyId', v_version.policy_id,
      'policyVersionId', p_version_id,
      'capabilityKey', v_version.capability_key,
      'status', 'active',
      'generation', v_generation
    ),
    BTRIM(p_reason)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.rollback_entitlement_policy(
  p_policy_id UUID,
  p_target_version INTEGER,
  p_reason TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_target RECORD;
  v_current_active UUID;
  v_new_id UUID;
  v_new_version INTEGER;
BEGIN
  IF v_actor IS NULL OR NOT public.is_super_admin(v_actor) THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;
  PERFORM public.validate_entitlement_reason(p_reason);

  PERFORM 1 FROM public.entitlement_policies WHERE id = p_policy_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'policy_not_found'; END IF;

  SELECT version_row.*, policy_row.capability_key
    INTO v_target
    FROM public.entitlement_policy_versions AS version_row
    JOIN public.entitlement_policies AS policy_row ON policy_row.id = version_row.policy_id
   WHERE version_row.policy_id = p_policy_id
     AND version_row.version = p_target_version
     AND version_row.status IN ('active', 'retired')
     AND version_row.activated_at IS NOT NULL;

  IF NOT FOUND THEN RAISE EXCEPTION 'rollback_target_not_found'; END IF;
  IF v_target.effective_until IS NOT NULL AND v_target.effective_until <= now() THEN
    RAISE EXCEPTION 'rollback_target_expired';
  END IF;

  SELECT COALESCE(MAX(version), 0) + 1
    INTO v_new_version
    FROM public.entitlement_policy_versions
   WHERE policy_id = p_policy_id;

  INSERT INTO public.entitlement_policy_versions(
    policy_id, version, status, effect, effective_from, effective_until,
    created_by
  ) VALUES (
    p_policy_id, v_new_version, 'pending_approval', v_target.effect, now(),
    v_target.effective_until, v_actor
  ) RETURNING id INTO v_new_id;

  INSERT INTO public.entitlement_policy_requirements(
    policy_version_id, alternative_group, fact_key, operator, expected_value
  )
  SELECT v_new_id, alternative_group, fact_key, operator, expected_value
    FROM public.entitlement_policy_requirements
   WHERE policy_version_id = v_target.id;

  SELECT id INTO v_current_active
    FROM public.entitlement_policy_versions
   WHERE policy_id = p_policy_id AND status = 'active'
   FOR UPDATE;

  INSERT INTO public.audit_logs(
    actor_id, action, entity_type, entity_id, before_data, after_data, note
  ) VALUES (
    v_actor,
    'entitlement.policy.rollback_requested',
    'entitlement_policy_version',
    v_new_id,
    jsonb_build_object('policyId', p_policy_id, 'previousActiveVersionId', v_current_active),
    jsonb_build_object(
      'policyId', p_policy_id,
      'policyVersionId', v_new_id,
      'targetVersion', p_target_version,
      'version', v_new_version,
      'capabilityKey', v_target.capability_key,
      'status', 'pending_approval'
    ),
    BTRIM(p_reason)
  );

  RETURN v_new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_entitlement_assignment(
  p_subject_type TEXT,
  p_subject_id TEXT,
  p_capability_key TEXT,
  p_effect TEXT,
  p_starts_at TIMESTAMPTZ,
  p_expires_at TIMESTAMPTZ,
  p_reason TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_assignment_id UUID;
  v_starts_at TIMESTAMPTZ := COALESCE(p_starts_at, now());
  v_subject_id TEXT;
  v_manually_assignable BOOLEAN;
  v_generation BIGINT;
BEGIN
  IF v_actor IS NULL OR NOT public.is_super_admin(v_actor) THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;
  PERFORM public.validate_entitlement_reason(p_reason);

  IF p_subject_type NOT IN ('user', 'role', 'plan', 'partner')
     OR p_effect NOT IN ('allow', 'deny')
     OR p_subject_id IS NULL
     OR char_length(BTRIM(p_subject_id)) NOT BETWEEN 1 AND 255
     OR (p_expires_at IS NOT NULL AND p_expires_at <= v_starts_at) THEN
    RAISE EXCEPTION 'assignment_invalid';
  END IF;

  SELECT manually_assignable INTO v_manually_assignable
    FROM public.capabilities
   WHERE key = p_capability_key AND enabled
   FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'capability_not_found'; END IF;
  IF p_effect = 'allow' AND NOT v_manually_assignable THEN
    RAISE EXCEPTION 'capability_not_manually_assignable';
  END IF;

  IF p_subject_type = 'user' THEN
    BEGIN
      v_subject_id := BTRIM(p_subject_id)::UUID::TEXT;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'assignment_invalid';
    END;

    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = v_subject_id::UUID) THEN
      RAISE EXCEPTION 'assignment_subject_not_found';
    END IF;
  ELSE
    v_subject_id := BTRIM(p_subject_id);
  END IF;
  IF p_subject_type = 'role' AND NOT EXISTS (
    SELECT 1 FROM public.roles WHERE name = v_subject_id
  ) THEN
    RAISE EXCEPTION 'assignment_subject_not_found';
  END IF;

  INSERT INTO public.entitlement_assignments(
    subject_type, subject_id, capability_key, effect, starts_at, expires_at,
    reason, granted_by
  ) VALUES (
    p_subject_type, v_subject_id, p_capability_key, p_effect,
    v_starts_at, p_expires_at, BTRIM(p_reason), v_actor
  ) RETURNING id INTO v_assignment_id;

  PERFORM public.increment_entitlement_generation();
  v_generation := public.current_entitlement_generation();

  INSERT INTO public.audit_logs(
    actor_id, action, entity_type, entity_id, before_data, after_data, note
  ) VALUES (
    v_actor,
    'entitlement.assignment.set',
    'entitlement_assignment',
    v_assignment_id,
    NULL,
    jsonb_build_object(
      'assignmentId', v_assignment_id,
      'subjectType', p_subject_type,
      'subjectId', v_subject_id,
      'capabilityKey', p_capability_key,
      'effect', p_effect,
      'startsAt', v_starts_at,
      'expiresAt', p_expires_at,
      'generation', v_generation
    ),
    BTRIM(p_reason)
  );

  RETURN v_assignment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_entitlement_assignment(
  p_assignment_id UUID,
  p_reason TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_assignment public.entitlement_assignments%ROWTYPE;
  v_generation BIGINT;
BEGIN
  IF v_actor IS NULL OR NOT public.is_super_admin(v_actor) THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;
  PERFORM public.validate_entitlement_reason(p_reason);

  SELECT * INTO v_assignment
    FROM public.entitlement_assignments
   WHERE id = p_assignment_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'assignment_not_found'; END IF;
  IF v_assignment.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'assignment_already_revoked'; END IF;

  UPDATE public.entitlement_assignments
     SET revoked_at = now(), revoked_by = v_actor
   WHERE id = p_assignment_id;

  PERFORM public.increment_entitlement_generation();
  v_generation := public.current_entitlement_generation();

  INSERT INTO public.audit_logs(
    actor_id, action, entity_type, entity_id, before_data, after_data, note
  ) VALUES (
    v_actor,
    'entitlement.assignment.revoked',
    'entitlement_assignment',
    p_assignment_id,
    jsonb_build_object(
      'assignmentId', p_assignment_id,
      'subjectType', v_assignment.subject_type,
      'subjectId', v_assignment.subject_id,
      'capabilityKey', v_assignment.capability_key,
      'effect', v_assignment.effect,
      'status', 'active'
    ),
    jsonb_build_object(
      'assignmentId', p_assignment_id,
      'subjectType', v_assignment.subject_type,
      'subjectId', v_assignment.subject_id,
      'capabilityKey', v_assignment.capability_key,
      'effect', v_assignment.effect,
      'status', 'revoked',
      'generation', v_generation
    ),
    BTRIM(p_reason)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.validate_entitlement_reason(TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.require_entitlement_super_admin()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.increment_entitlement_generation()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.current_entitlement_generation()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.entitlement_fact_value(UUID, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_entitlement_requirement(TEXT, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.entitlement_requirement_matches(UUID, TEXT, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.capability_hard_guard(UUID, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.resolve_user_capability(UUID, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_user_capability(UUID, TEXT)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.list_entitlement_access_control_state()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_entitlement_access_control_state()
  TO authenticated;

REVOKE ALL ON FUNCTION public.create_entitlement_policy_version(UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, JSONB, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_entitlement_policy_version(UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, JSONB, TEXT)
  TO authenticated;

REVOKE ALL ON FUNCTION public.approve_entitlement_policy_version(UUID, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_entitlement_policy_version(UUID, TEXT)
  TO authenticated;

REVOKE ALL ON FUNCTION public.activate_entitlement_policy_version(UUID, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.activate_entitlement_policy_version(UUID, TEXT)
  TO authenticated;

REVOKE ALL ON FUNCTION public.rollback_entitlement_policy(UUID, INTEGER, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rollback_entitlement_policy(UUID, INTEGER, TEXT)
  TO authenticated;

REVOKE ALL ON FUNCTION public.set_entitlement_assignment(TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_entitlement_assignment(TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT)
  TO authenticated;

REVOKE ALL ON FUNCTION public.revoke_entitlement_assignment(UUID, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revoke_entitlement_assignment(UUID, TEXT)
  TO authenticated;
