-- Penang place model — Phase 2: schema.
-- See docs/plans/2026-08-12-2152-penang-place-model-and-data-reset.md §3.
-- Additive only. No existing table, column, constraint or trigger is touched.

CREATE TABLE public.places (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id            UUID REFERENCES public.places(id) ON DELETE RESTRICT,
  level                TEXT NOT NULL CHECK (level IN ('state','region','poi')),
  name                 TEXT NOT NULL,
  slug                 TEXT NOT NULL UNIQUE,
  tagline              TEXT,
  intro                TEXT,
  image_url            TEXT,
  state                TEXT NOT NULL,          -- denormalised for cheap filtering
  district             TEXT,
  lat                  NUMERIC(10,7) NOT NULL,
  lng                  NUMERIC(10,7) NOT NULL,
  entry_fee            NUMERIC(10,2),          -- NULL = n/a, 0 = free, >0 = RM
  managed_by_vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL,
  detail               JSONB,                  -- difficulty/duration/best_time/getting_there
  status               TEXT NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active','hidden')),
  sort_order           INTEGER NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- a state has no parent; region and poi must have one
  CONSTRAINT places_parent_shape CHECK (
    (level = 'state' AND parent_id IS NULL) OR
    (level <> 'state' AND parent_id IS NOT NULL)
  )
);

CREATE INDEX idx_places_parent ON public.places(parent_id);
CREATE INDEX idx_places_state_level ON public.places(state, level);

CREATE TRIGGER trg_places_updated_at
  BEFORE UPDATE ON public.places FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE public.product_places (
  product_id    UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  place_id      UUID NOT NULL REFERENCES public.places(id)   ON DELETE CASCADE,
  relation_type TEXT NOT NULL CHECK (relation_type IN ('admission','guide_service','addon')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, place_id)
);

CREATE INDEX idx_product_places_place ON public.product_places(place_id);

-- ── RLS ──────────────────────────────────────────────────────────────────
-- Places are editorial content, not vendor-owned — vendors do not create
-- them (see plan D-decisions). Pattern matches categories_public_read /
-- outlet_offers_public_read: public read of active rows, admin-only writes.

ALTER TABLE public.places ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS places_public_read ON public.places;
CREATE POLICY places_public_read ON public.places
  FOR SELECT TO anon, authenticated
  USING (status = 'active');

DROP POLICY IF EXISTS places_admin_write ON public.places;
CREATE POLICY places_admin_write ON public.places
  FOR ALL TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

ALTER TABLE public.product_places ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_places_public_read ON public.product_places;
CREATE POLICY product_places_public_read ON public.product_places
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.places pl
       WHERE pl.id = product_places.place_id AND pl.status = 'active'
    )
    AND EXISTS (
      SELECT 1 FROM public.products p
       WHERE p.id = product_places.product_id
         AND p.status = 'active' AND p.review_status = 'approved'
    )
  );

DROP POLICY IF EXISTS product_places_admin_write ON public.product_places;
CREATE POLICY product_places_admin_write ON public.product_places
  FOR ALL TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));
