-- Admin-editable profanity/slur word list — supplements the hardcoded,
-- English-only lists in lib/moderation/wordlists.ts and lib/chat/moderation.ts
-- so an admin can add words (any language) without a code deploy.

CREATE TABLE IF NOT EXISTS public.moderation_custom_words (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term        TEXT NOT NULL,
  category    TEXT NOT NULL CHECK (category IN ('profanity', 'slur')),
  language    TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS moderation_custom_words_term_idx
  ON public.moderation_custom_words (lower(term));

ALTER TABLE public.moderation_custom_words ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS moderation_custom_words_admin_read ON public.moderation_custom_words;
CREATE POLICY moderation_custom_words_admin_read ON public.moderation_custom_words
  FOR SELECT USING (public.is_admin(auth.uid()));

-- No INSERT/UPDATE/DELETE policy — writes only through the service-role
-- admin API routes (app/api/admin/moderation-words/**), same pattern as
-- order_settlements (migration 20260911000000).
