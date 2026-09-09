-- Customer discovery may read only the fields needed to render and validate
-- currently effective sponsored placements. Internal review metadata remains
-- available to authorized Staff through the base table's existing Staff RLS.

DROP POLICY IF EXISTS sponsored_discovery_placements_public_active_read
  ON public.sponsored_discovery_placements;

REVOKE SELECT ON TABLE public.sponsored_discovery_placements FROM anon, authenticated;
GRANT SELECT ON TABLE public.sponsored_discovery_placements TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.list_active_sponsored_discovery_placements()
RETURNS TABLE (
  id UUID,
  product_id UUID,
  state TEXT,
  category_slug TEXT,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  priority INTEGER,
  status TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    placement.id,
    placement.product_id,
    placement.state,
    placement.category_slug,
    placement.starts_at,
    placement.ends_at,
    placement.priority,
    placement.status
  FROM public.sponsored_discovery_placements AS placement
  WHERE placement.status = 'approved'
    AND placement.starts_at <= now()
    AND now() < placement.ends_at
  ORDER BY placement.priority DESC, placement.starts_at, placement.id;
$$;

REVOKE ALL ON FUNCTION public.list_active_sponsored_discovery_placements()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_active_sponsored_discovery_placements()
  TO anon, authenticated, service_role;
