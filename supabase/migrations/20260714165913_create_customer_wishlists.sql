-- Customer-owned wishlist state. The unique pair makes save/unsave idempotent.
CREATE TABLE IF NOT EXISTS public.customer_wishlists (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_wishlists_user_created
  ON public.customer_wishlists(user_id, created_at DESC);

ALTER TABLE public.customer_wishlists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_wishlists_select_own ON public.customer_wishlists;
CREATE POLICY customer_wishlists_select_own
  ON public.customer_wishlists FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS customer_wishlists_insert_own ON public.customer_wishlists;
CREATE POLICY customer_wishlists_insert_own
  ON public.customer_wishlists FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS customer_wishlists_delete_own ON public.customer_wishlists;
CREATE POLICY customer_wishlists_delete_own
  ON public.customer_wishlists FOR DELETE TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT, INSERT, DELETE ON public.customer_wishlists TO authenticated;;
