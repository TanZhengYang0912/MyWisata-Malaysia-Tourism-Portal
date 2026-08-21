-- Recommendation geography resolution and reviewed, source-bound content drafts.
-- Google Maps identifiers remain external evidence and never reference places.id.

ALTER TABLE public.vendor_recommendations
  ADD COLUMN IF NOT EXISTS suggested_place_id UUID REFERENCES public.places(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolved_place_id UUID REFERENCES public.places(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS place_resolution_status TEXT NOT NULL DEFAULT 'unresolved'
    CHECK (place_resolution_status IN ('unresolved', 'suggested', 'confirmed', 'cleared'));

CREATE INDEX IF NOT EXISTS idx_vendor_recommendations_suggested_place
  ON public.vendor_recommendations(suggested_place_id)
  WHERE suggested_place_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vendor_recommendations_resolved_place
  ON public.vendor_recommendations(resolved_place_id)
  WHERE resolved_place_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.content_translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('vendor_recommendation', 'vendor', 'outlet', 'product', 'place')),
  entity_id UUID NOT NULL,
  field TEXT NOT NULL CHECK (field IN ('name', 'description', 'tagline', 'intro')),
  locale TEXT NOT NULL CHECK (locale IN ('zh-CN', 'ms')),
  source_text TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'rejected', 'stale')),
  provider TEXT,
  model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by UUID REFERENCES public.users(id),
  reviewed_at TIMESTAMPTZ,
  UNIQUE (entity_type, entity_id, field, locale, source_hash)
);

CREATE INDEX IF NOT EXISTS idx_content_translations_lookup
  ON public.content_translations(entity_type, entity_id, field, locale, status);

CREATE TABLE IF NOT EXISTS public.content_translation_generation_locks (
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  field TEXT NOT NULL,
  locale TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  owner_token UUID NOT NULL DEFAULT gen_random_uuid(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '10 minutes'),
  PRIMARY KEY (entity_type, entity_id, field, locale, source_hash)
);

ALTER TABLE public.content_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_translation_generation_locks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS content_translations_super_admin_only ON public.content_translations;
CREATE POLICY content_translations_super_admin_only ON public.content_translations
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

REVOKE ALL ON TABLE public.content_translations FROM anon, authenticated;
REVOKE ALL ON TABLE public.content_translation_generation_locks FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_resolve_recommendation_place(
  p_rec_id UUID,
  p_action TEXT,
  p_place_id UUID DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_place_active BOOLEAN;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'super_admin_required'; END IF;
  IF p_action NOT IN ('suggest', 'confirm', 'clear') THEN RAISE EXCEPTION 'invalid_resolution_action'; END IF;

  PERFORM 1 FROM public.vendor_recommendations WHERE id = p_rec_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'recommendation_not_found'; END IF;

  IF p_action IN ('suggest', 'confirm') THEN
    SELECT EXISTS(SELECT 1 FROM public.places WHERE id = p_place_id AND status = 'active') INTO v_place_active;
    IF NOT v_place_active THEN RAISE EXCEPTION 'active_place_required'; END IF;
  END IF;

  UPDATE public.vendor_recommendations
     SET suggested_place_id = CASE WHEN p_action = 'suggest' THEN p_place_id ELSE suggested_place_id END,
         resolved_place_id = CASE WHEN p_action = 'confirm' THEN p_place_id WHEN p_action = 'clear' THEN NULL ELSE resolved_place_id END,
         place_resolution_status = CASE
           WHEN p_action = 'suggest' AND resolved_place_id IS NOT NULL THEN 'confirmed'
           WHEN p_action = 'suggest' THEN 'suggested'
           WHEN p_action = 'confirm' THEN 'confirmed'
           ELSE 'cleared'
         END
   WHERE id = p_rec_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_resolve_recommendation_place(UUID, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_resolve_recommendation_place(UUID, TEXT, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_review_recommendation_translation(
  p_translation_id UUID,
  p_rec_id UUID,
  p_translated_text TEXT,
  p_status TEXT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_entity_type TEXT;
  v_entity_id UUID;
  v_field TEXT;
  v_source_hash TEXT;
  v_translation_status TEXT;
  v_recommendation_status TEXT;
  v_source_text TEXT;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'super_admin_required'; END IF;
  IF p_status NOT IN ('approved', 'rejected') THEN RAISE EXCEPTION 'invalid_translation_status'; END IF;
  IF p_translated_text IS NULL OR length(trim(p_translated_text)) = 0 OR length(p_translated_text) > 2000 OR p_translated_text ~ '<[^>]+>' THEN
    RAISE EXCEPTION 'invalid_translation_text';
  END IF;

  SELECT entity_type, entity_id, field, source_hash, status
    INTO v_entity_type, v_entity_id, v_field, v_source_hash, v_translation_status
    FROM public.content_translations
   WHERE id = p_translation_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'translation_not_found'; END IF;
  IF v_entity_type <> 'vendor_recommendation' OR v_entity_id <> p_rec_id OR v_field NOT IN ('name', 'description') THEN
    RAISE EXCEPTION 'invalid_translation_target';
  END IF;
  IF v_translation_status <> 'draft' THEN RAISE EXCEPTION 'translation_not_draft'; END IF;

  SELECT status, CASE WHEN v_field = 'name' THEN vendor_name ELSE description END
    INTO v_recommendation_status, v_source_text
    FROM public.vendor_recommendations
   WHERE id = p_rec_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'recommendation_not_found'; END IF;
  IF v_recommendation_status <> 'approved' THEN RAISE EXCEPTION 'recommendation_not_approved'; END IF;
  IF v_source_text IS NULL OR encode(digest(v_source_text, 'sha256'), 'hex') <> v_source_hash THEN
    RAISE EXCEPTION 'stale_translation';
  END IF;

  UPDATE public.content_translations
     SET translated_text = trim(p_translated_text),
         status = p_status,
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         updated_at = now()
   WHERE id = p_translation_id
     AND status = 'draft';
  IF NOT FOUND THEN RAISE EXCEPTION 'translation_not_draft'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_review_recommendation_translation(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_review_recommendation_translation(UUID, UUID, TEXT, TEXT) TO authenticated;
