-- Forward-only correlation for Access Control audit evidence. Trace references
-- are generated inside PostgreSQL and replace any caller-supplied value.

CREATE OR REPLACE FUNCTION public.correlate_entitlement_audit_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_trace_reference TEXT := gen_random_uuid()::TEXT;
BEGIN
  IF NEW.action = 'entitlement.shadow_evaluation' THEN
    IF COALESCE(auth.role(), '') <> 'service_role' THEN
      RAISE EXCEPTION 'shadow_evaluation_service_role_required';
    END IF;
    NEW.actor_id := NULL;
  END IF;

  IF NEW.action LIKE 'entitlement.%' THEN
    IF NEW.before_data IS NOT NULL THEN
      NEW.before_data := NEW.before_data - 'traceReference';
    END IF;

    NEW.after_data := (
      COALESCE(NEW.after_data, '{}'::JSONB) - 'traceReference'
    ) || jsonb_build_object('traceReference', v_trace_reference);

    -- Every governed policy mutation uses the policy-version row as its audit
    -- entity. Deriving the correlation here prevents a request body or RPC
    -- argument from substituting a different version identifier.
    IF NEW.action LIKE 'entitlement.policy%' THEN
      IF NEW.before_data IS NOT NULL THEN
        NEW.before_data := NEW.before_data - 'policyVersionId';
      END IF;
      NEW.after_data := (
        NEW.after_data - 'policyVersionId'
      ) || jsonb_build_object('policyVersionId', NEW.entity_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.correlate_entitlement_audit_insert()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS entitlement_audit_correlation ON public.audit_logs;
CREATE TRIGGER entitlement_audit_correlation
  BEFORE INSERT ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.correlate_entitlement_audit_insert();

-- Preserve and strengthen the existing append-only boundary. The established
-- audit_logs_append_only trigger continues to reject UPDATE and DELETE.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.audit_logs
  FROM anon, authenticated, service_role;
