-- Return only the bounded dashboard aggregate; no attribution or user rows leave the database.
CREATE OR REPLACE FUNCTION public.admin_rewards_pending_summary(p_cutoff timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;
  IF p_cutoff IS NULL THEN
    RAISE EXCEPTION 'cutoff_required';
  END IF;

  SELECT jsonb_build_object(
    'count', count(*)::bigint,
    'total_rm', coalesce(sum(commission_amount), 0)::numeric
  ) INTO v_result
  FROM public.affiliate_attributions
  WHERE status = 'pending'
    AND hold_until <= p_cutoff;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_rewards_pending_summary(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_rewards_pending_summary(timestamptz) TO service_role;
