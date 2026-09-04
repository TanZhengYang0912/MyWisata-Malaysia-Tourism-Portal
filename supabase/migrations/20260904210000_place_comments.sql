-- Public place discussion is deliberately separate from purchase-qualified
-- reviews. Browser roles can read published notes, while all writes go through
-- the authenticated server route so text is sanitised before storage.

CREATE TABLE public.place_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id   UUID NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT place_comments_body_length CHECK (char_length(btrim(body)) BETWEEN 8 AND 600)
);

CREATE INDEX idx_place_comments_place_created
  ON public.place_comments(place_id, created_at DESC)
  WHERE status = 'published';

CREATE INDEX idx_place_comments_user_created
  ON public.place_comments(user_id, created_at DESC);

CREATE TRIGGER trg_place_comments_updated_at
  BEFORE UPDATE ON public.place_comments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.place_comments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.place_comments FROM anon, authenticated;
GRANT SELECT ON TABLE public.place_comments TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.place_comments FROM anon, authenticated;

CREATE POLICY place_comments_public_read_published ON public.place_comments
  FOR SELECT TO anon, authenticated
  USING (
    status = 'published'
    AND EXISTS (
      SELECT 1 FROM public.places
      WHERE places.id = place_comments.place_id
        AND places.status = 'active'
    )
  );
