-- Checkout is authenticated at the route boundary; do not expose the
-- SECURITY DEFINER RPC to anonymous PostgREST callers.
REVOKE EXECUTE ON FUNCTION public.prepare_checkout(UUID, UUID[], TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.prepare_checkout(UUID, UUID[], TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, JSONB) TO authenticated;
