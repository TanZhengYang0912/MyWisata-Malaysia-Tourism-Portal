-- A real attraction can have paid visitor facilities without being sold by a
-- MyWisata vendor. Keep that source-backed information outside products,
-- outlets, carts, and bookings.

CREATE TABLE public.place_informational_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id UUID NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('informational_activity', 'informational_paid_activity')),
  price_label TEXT,
  source_title TEXT NOT NULL,
  source_url TEXT NOT NULL CHECK (source_url ~ '^https://'),
  image_source_url TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'hidden')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (place_id, slug),
  CHECK (activity_type <> 'informational_paid_activity' OR length(trim(price_label)) > 0)
);

CREATE INDEX idx_place_informational_activities_place_status
  ON public.place_informational_activities(place_id, status);

CREATE TRIGGER trg_place_informational_activities_updated_at
  BEFORE UPDATE ON public.place_informational_activities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE public.place_informational_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY place_informational_activities_public_read
  ON public.place_informational_activities
  FOR SELECT TO anon, authenticated
  USING (status = 'active');

CREATE POLICY place_informational_activities_admin_write
  ON public.place_informational_activities
  FOR ALL TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));
