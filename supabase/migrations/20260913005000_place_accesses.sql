-- Verified public access is information about a real place, not a vendor sale.
-- Keep it outside products so a customer never sees an invented provider,
-- price, cart, or booking action for a public landmark/trail.

CREATE TABLE public.place_accesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id UUID NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  access_type TEXT NOT NULL CHECK (access_type IN ('free_public_access', 'free_activity')),
  source_title TEXT NOT NULL,
  source_url TEXT NOT NULL CHECK (source_url ~ '^https://'),
  image_source_url TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'hidden')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (place_id, slug)
);

CREATE INDEX idx_place_accesses_place_status
  ON public.place_accesses(place_id, status);

CREATE TRIGGER trg_place_accesses_updated_at
  BEFORE UPDATE ON public.place_accesses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE public.place_accesses ENABLE ROW LEVEL SECURITY;

CREATE POLICY place_accesses_public_read
  ON public.place_accesses
  FOR SELECT TO anon, authenticated
  USING (status = 'active');

CREATE POLICY place_accesses_admin_write
  ON public.place_accesses
  FOR ALL TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));
