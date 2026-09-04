-- Adds anonymous posting flag to place comments.
-- When is_anonymous is true, author identity details (avatar, name, city)
-- are masked in public endpoints, while user_id is preserved for ownership/deletion.

ALTER TABLE public.place_comments
  ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_place_comments_anonymous
  ON public.place_comments(is_anonymous)
  WHERE status = 'published';
