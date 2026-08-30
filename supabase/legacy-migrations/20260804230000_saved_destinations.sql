-- Customer-owned destination saves. Destination states are the canonical keys
-- from lib/customer/malaysia-destinations.ts and are intentionally separate
-- from product wishlist rows.
CREATE TABLE IF NOT EXISTS public.customer_saved_destinations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  destination_state TEXT NOT NULL CHECK (btrim(destination_state) <> ''),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, destination_state)
);

CREATE INDEX IF NOT EXISTS idx_customer_saved_destinations_user_created
  ON public.customer_saved_destinations(user_id, created_at DESC);

ALTER TABLE public.customer_saved_destinations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_saved_destinations_select_own ON public.customer_saved_destinations;
CREATE POLICY customer_saved_destinations_select_own
  ON public.customer_saved_destinations FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS customer_saved_destinations_insert_own ON public.customer_saved_destinations;
CREATE POLICY customer_saved_destinations_insert_own
  ON public.customer_saved_destinations FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS customer_saved_destinations_delete_own ON public.customer_saved_destinations;
CREATE POLICY customer_saved_destinations_delete_own
  ON public.customer_saved_destinations FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id);

GRANT SELECT, INSERT, DELETE ON public.customer_saved_destinations TO authenticated;
