-- Apply after the API release that writes appeals through the service-only RPC.
-- Client reads remain scoped to each user's tickets and existing staff policies.
DROP POLICY IF EXISTS support_insert_own ON public.support_tickets;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.support_tickets FROM PUBLIC, anon, authenticated;
REVOKE SELECT ON TABLE public.support_tickets FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.support_tickets TO authenticated;
