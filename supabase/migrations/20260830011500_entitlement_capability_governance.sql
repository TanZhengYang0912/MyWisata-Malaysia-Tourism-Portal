-- Governed capability catalog mutations. Stable capability keys remain
-- immutable; every metadata change is actor-derived, audited, and generation
-- invalidating in one database transaction.

CREATE OR REPLACE FUNCTION public.update_entitlement_capability(
  p_capability_key TEXT,
  p_category TEXT,
  p_risk_level TEXT,
  p_customer_visible BOOLEAN,
  p_manually_assignable BOOLEAN,
  p_enabled BOOLEAN,
  p_reason TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_before public.capabilities%ROWTYPE;
  v_previous_generation BIGINT;
  v_generation BIGINT;
BEGIN
  IF v_actor IS NULL OR NOT public.is_super_admin(v_actor) THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;
  PERFORM public.validate_entitlement_reason(p_reason);

  IF p_capability_key IS NULL
     OR p_capability_key !~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'
     OR p_category IS NULL
     OR p_risk_level IS NULL
     OR p_category NOT IN ('platform','commerce','ai','recommendation','affiliate','wallet')
     OR p_risk_level NOT IN ('low','medium','high','critical')
     OR p_customer_visible IS NULL
     OR p_manually_assignable IS NULL
     OR p_enabled IS NULL THEN
    RAISE EXCEPTION 'capability_invalid';
  END IF;

  SELECT * INTO v_before
    FROM public.capabilities
   WHERE key = p_capability_key
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'capability_not_found';
  END IF;

  IF ROW(
    v_before.category,
    v_before.risk_level,
    v_before.customer_visible,
    v_before.manually_assignable,
    v_before.enabled
  ) IS NOT DISTINCT FROM ROW(
    p_category,
    p_risk_level,
    p_customer_visible,
    p_manually_assignable,
    p_enabled
  ) THEN
    RAISE EXCEPTION 'capability_no_changes';
  END IF;

  v_previous_generation := public.current_entitlement_generation();

  UPDATE public.capabilities
     SET category = p_category,
         risk_level = p_risk_level,
         customer_visible = p_customer_visible,
         manually_assignable = p_manually_assignable,
         enabled = p_enabled,
         updated_at = now()
   WHERE key = p_capability_key;

  PERFORM public.increment_entitlement_generation();
  v_generation := public.current_entitlement_generation();

  INSERT INTO public.audit_logs(
    actor_id, action, entity_type, entity_id, before_data, after_data, note
  ) VALUES (
    v_actor,
    'entitlement.capability.updated',
    'entitlement_capability',
    v_before.id,
    jsonb_build_object(
      'capabilityKey', v_before.key,
      'category', v_before.category,
      'riskLevel', v_before.risk_level,
      'customerVisible', v_before.customer_visible,
      'manuallyAssignable', v_before.manually_assignable,
      'enabled', v_before.enabled,
      'generation', v_previous_generation
    ),
    jsonb_build_object(
      'capabilityKey', v_before.key,
      'category', p_category,
      'riskLevel', p_risk_level,
      'customerVisible', p_customer_visible,
      'manuallyAssignable', p_manually_assignable,
      'enabled', p_enabled,
      'generation', v_generation
    ),
    BTRIM(p_reason)
  );

  RETURN v_before.id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_entitlement_capability(TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_entitlement_capability(TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, TEXT)
  TO authenticated;
