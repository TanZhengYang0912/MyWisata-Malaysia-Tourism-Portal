-- Bounded candidate lookup for the Super Admin Wallet Approvers screen.
-- The API also authorizes Super Admin access before invoking this service-role RPC.
CREATE OR REPLACE FUNCTION public.list_wallet_approver_candidates(
  p_search text,
  p_page integer,
  p_page_size integer
) RETURNS jsonb
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
  IF p_page IS NULL OR p_page < 1 OR p_page > 100000
    OR p_page_size IS NULL OR p_page_size NOT IN (10, 25, 50)
    OR length(coalesce(p_search, '')) > 200 THEN
    RAISE EXCEPTION 'invalid_candidate_page';
  END IF;

  WITH matching AS MATERIALIZED (
    SELECT u.id, u.email, u.full_name, u.display_name, u.created_at
    FROM public.users AS u
    WHERE u.status = 'active'
      AND NOT EXISTS (
        SELECT 1
        FROM public.user_roles AS ur
        JOIN public.roles AS r ON r.id = ur.role_id
        WHERE ur.user_id = u.id
          AND ur.vendor_id IS NULL
          AND ur.outlet_id IS NULL
          AND r.name IN ('approver', 'super_admin')
      )
      AND (
        NULLIF(btrim(p_search), '') IS NULL
        OR concat_ws(' ', u.full_name, u.display_name, u.email)
          ILIKE '%' || replace(replace(replace(btrim(p_search), E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%' ESCAPE E'\\'
      )
  ),
  page_rows AS (
    SELECT id, email, full_name, display_name, created_at
    FROM matching
    ORDER BY created_at DESC, id DESC
    OFFSET (p_page - 1) * p_page_size
    LIMIT p_page_size
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM matching),
    'eligibleUsers', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id,
        'email', email,
        'name', coalesce(full_name, display_name, email)
      ) ORDER BY created_at DESC, id DESC)
      FROM page_rows
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.list_wallet_approver_candidates(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_wallet_approver_candidates(text, integer, integer) TO service_role;
