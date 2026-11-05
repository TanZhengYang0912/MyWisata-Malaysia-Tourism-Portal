-- Extend the existing bounded public-translation queue for the legacy paid
-- vendor event-promotion surface. New items are enqueued on request/change;
-- do not launch an unbounded historical backfill.
ALTER TABLE public.public_content_translations
  DROP CONSTRAINT IF EXISTS public_content_translations_entity_type_check,
  DROP CONSTRAINT IF EXISTS public_content_translations_field_check;
ALTER TABLE public.public_content_translations
  ADD CONSTRAINT public_content_translations_entity_type_check
    CHECK (entity_type IN ('product', 'place', 'place_informational_activity', 'review', 'promotion_campaign', 'vendor_event_promotion')),
  ADD CONSTRAINT public_content_translations_field_check
    CHECK (field IN ('name', 'description', 'tagline', 'intro', 'title', 'body', 'summary', 'details'));

ALTER TABLE public.content_translation_jobs
  DROP CONSTRAINT IF EXISTS content_translation_jobs_entity_type_check,
  DROP CONSTRAINT IF EXISTS content_translation_jobs_field_check;
ALTER TABLE public.content_translation_jobs
  ADD CONSTRAINT content_translation_jobs_entity_type_check
    CHECK (entity_type IN ('product', 'place', 'place_informational_activity', 'review', 'promotion_campaign', 'vendor_event_promotion')),
  ADD CONSTRAINT content_translation_jobs_field_check
    CHECK (field IN ('name', 'description', 'tagline', 'intro', 'title', 'body', 'summary', 'details'));

CREATE OR REPLACE FUNCTION app_private.queue_public_content_translation(
  p_entity_type TEXT,
  p_entity_key TEXT,
  p_field TEXT,
  p_locale TEXT,
  p_source_hash TEXT,
  p_max_backlog INTEGER DEFAULT 5000
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_field_allowed BOOLEAN;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('public_content_translation_queue'));
  IF p_entity_type NOT IN ('product', 'place', 'place_informational_activity', 'review', 'promotion_campaign', 'vendor_event_promotion')
     OR p_locale NOT IN ('en', 'zh-CN', 'ms')
     OR p_entity_key IS NULL OR length(p_entity_key) NOT BETWEEN 1 AND 120
     OR p_source_hash !~ '^[a-f0-9]{64}$' THEN
    RETURN FALSE;
  END IF;
  v_field_allowed := CASE p_entity_type
    WHEN 'product' THEN p_field IN ('name', 'description')
    WHEN 'place' THEN p_field IN ('name', 'tagline', 'intro')
    WHEN 'place_informational_activity' THEN p_field IN ('title', 'description')
    WHEN 'review' THEN p_field IN ('title', 'body')
    WHEN 'promotion_campaign' THEN p_field IN ('title', 'summary', 'description')
    WHEN 'vendor_event_promotion' THEN p_field IN ('title', 'details')
    ELSE FALSE
  END;
  IF NOT v_field_allowed THEN RETURN FALSE; END IF;
  IF (SELECT count(*) FROM public.content_translation_jobs WHERE status IN ('queued', 'processing')) >= greatest(1, least(coalesce(p_max_backlog, 5000), 20000)) THEN
    RETURN FALSE;
  END IF;
  UPDATE public.content_translation_jobs
     SET status = 'superseded', lease_token = NULL, lease_expires_at = NULL, updated_at = now()
   WHERE entity_type = p_entity_type AND entity_key = p_entity_key AND field = p_field
     AND locale = p_locale AND source_hash <> p_source_hash AND status IN ('queued', 'processing');
  INSERT INTO public.content_translation_jobs(entity_type, entity_key, field, locale, source_hash)
  VALUES (p_entity_type, p_entity_key, p_field, p_locale, p_source_hash)
  ON CONFLICT (entity_type, entity_key, field, locale, source_hash)
  DO UPDATE SET status = 'queued', attempts = 0, available_at = now(), lease_token = NULL,
                lease_expires_at = NULL, last_error_code = NULL, completed_at = NULL, updated_at = now()
    WHERE content_translation_jobs.status IN ('failed', 'superseded', 'completed')
      AND NOT EXISTS (
        SELECT 1 FROM public.public_content_translations AS cached
         WHERE cached.entity_type = EXCLUDED.entity_type AND cached.entity_key = EXCLUDED.entity_key
           AND cached.field = EXCLUDED.field AND cached.locale = EXCLUDED.locale
           AND cached.source_hash = EXCLUDED.source_hash
      );
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.invalidate_vendor_event_promotion_translations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_id TEXT; v_is_public BOOLEAN; v_field TEXT; v_source TEXT; v_locale TEXT; v_changed BOOLEAN;
BEGIN
  v_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id::TEXT ELSE NEW.id::TEXT END;
  v_is_public := TG_OP <> 'DELETE' AND NEW.status = 'paid' AND NEW.ends_on >= CURRENT_DATE;
  IF NOT v_is_public THEN
    DELETE FROM public.public_content_translations WHERE entity_type = 'vendor_event_promotion' AND entity_key = v_id;
    UPDATE public.content_translation_jobs SET status = 'superseded', lease_token = NULL,
      lease_expires_at = NULL, updated_at = now()
     WHERE entity_type = 'vendor_event_promotion' AND entity_key = v_id AND status IN ('queued', 'processing');
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  FOREACH v_field IN ARRAY ARRAY['title', 'details'] LOOP
    v_source := to_jsonb(NEW)->>v_field;
    IF v_source IS NULL OR length(btrim(v_source)) = 0 OR length(v_source) > 5000 THEN
      DELETE FROM public.public_content_translations WHERE entity_type = 'vendor_event_promotion' AND entity_key = v_id AND field = v_field;
      UPDATE public.content_translation_jobs SET status = 'superseded', lease_token = NULL,
        lease_expires_at = NULL, updated_at = now()
       WHERE entity_type = 'vendor_event_promotion' AND entity_key = v_id AND field = v_field AND status IN ('queued', 'processing');
      CONTINUE;
    END IF;
    IF TG_OP = 'INSERT' THEN
      v_changed := TRUE;
    ELSE
      v_changed := (to_jsonb(OLD)->>v_field) IS DISTINCT FROM v_source
        OR OLD.status IS DISTINCT FROM NEW.status OR OLD.ends_on IS DISTINCT FROM NEW.ends_on;
    END IF;
    IF v_changed THEN
      DELETE FROM public.public_content_translations WHERE entity_type = 'vendor_event_promotion' AND entity_key = v_id AND field = v_field;
      UPDATE public.content_translation_jobs SET status = 'superseded', lease_token = NULL,
        lease_expires_at = NULL, updated_at = now()
       WHERE entity_type = 'vendor_event_promotion' AND entity_key = v_id AND field = v_field AND status IN ('queued', 'processing');
      FOREACH v_locale IN ARRAY ARRAY['en', 'zh-CN', 'ms'] LOOP
        PERFORM app_private.queue_public_content_translation('vendor_event_promotion', v_id, v_field, v_locale,
          encode(extensions.digest(v_source, 'sha256'), 'hex'), 5000);
      END LOOP;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER vendor_event_promotions_public_translation_sync
  AFTER INSERT OR UPDATE OF title, details, status, ends_on OR DELETE ON public.vendor_event_promotions
  FOR EACH ROW EXECUTE FUNCTION app_private.invalidate_vendor_event_promotion_translations();

REVOKE ALL ON FUNCTION app_private.invalidate_vendor_event_promotion_translations() FROM PUBLIC, anon, authenticated, service_role;
