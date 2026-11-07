-- Keep direct RPC callers from creating timestamp and audit churn when a
-- normalized campaign draft has not changed.
CREATE OR REPLACE FUNCTION app_private.save_promotion_campaign_draft(
  p_campaign_id uuid,
  p_expected_updated_at timestamp with time zone,
  p_title text,
  p_slug text,
  p_summary text,
  p_description text,
  p_starts_at timestamp with time zone,
  p_ends_at timestamp with time zone,
  p_poster_url text,
  p_operating_hours text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor UUID := auth.uid();
  v_campaign public.promotion_campaigns%ROWTYPE;
  v_is_live BOOLEAN := FALSE;
  v_before JSONB;
BEGIN
  PERFORM app_private.lock_event_campaign(p_campaign_id);
  IF v_actor IS NULL OR NOT public.has_staff_permission(v_actor, 'admin.promotion_campaign.manage') THEN
    RAISE EXCEPTION 'promotion_campaign_permission_required';
  END IF;
  IF p_title IS NULL OR char_length(btrim(p_title)) NOT BETWEEN 3 AND 120
     OR p_slug IS NULL OR p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     OR p_summary IS NULL OR char_length(btrim(p_summary)) NOT BETWEEN 10 AND 240
     OR p_description IS NULL OR char_length(btrim(p_description)) NOT BETWEEN 10 AND 5000
     OR p_starts_at IS NULL OR p_ends_at IS NULL OR p_ends_at <= p_starts_at
     OR p_operating_hours IS NULL OR char_length(btrim(p_operating_hours)) NOT BETWEEN 3 AND 200 THEN
    RAISE EXCEPTION 'promotion_campaign_invalid_draft';
  END IF;

  IF p_campaign_id IS NULL THEN
    IF p_expected_updated_at IS NOT NULL THEN
      RAISE EXCEPTION 'promotion_campaign_stale';
    END IF;
    INSERT INTO public.promotion_campaigns (
      slug, title, summary, description, starts_at, ends_at, poster_url, operating_hours, created_by, updated_by
    ) VALUES (
      btrim(p_slug), btrim(p_title), btrim(p_summary), btrim(p_description),
      p_starts_at, p_ends_at, p_poster_url, btrim(p_operating_hours), v_actor, v_actor
    ) RETURNING * INTO v_campaign;
  ELSE
    SELECT * INTO v_campaign
      FROM public.promotion_campaigns
     WHERE id = p_campaign_id
     FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'promotion_campaign_not_found'; END IF;
    IF p_expected_updated_at IS NULL OR v_campaign.updated_at IS DISTINCT FROM p_expected_updated_at THEN
      RAISE EXCEPTION 'promotion_campaign_stale';
    END IF;

    v_is_live := v_campaign.status IN ('approved', 'paused');
    IF v_is_live THEN
      IF btrim(p_slug) IS DISTINCT FROM v_campaign.slug THEN
        RAISE EXCEPTION 'promotion_campaign_slug_locked';
      END IF;
      IF p_poster_url IS NULL OR btrim(p_poster_url) = '' THEN
        RAISE EXCEPTION 'promotion_campaign_poster_required';
      END IF;
      v_before := jsonb_build_object(
        'title', v_campaign.title, 'summary', v_campaign.summary, 'description', v_campaign.description,
        'startsAt', v_campaign.starts_at, 'endsAt', v_campaign.ends_at,
        'posterUrl', v_campaign.poster_url, 'operatingHours', v_campaign.operating_hours
      );
    ELSIF v_campaign.status NOT IN ('draft', 'rejected') THEN
      RAISE EXCEPTION 'promotion_campaign_stale';
    END IF;

    IF v_campaign.status <> 'rejected'
       AND btrim(p_slug) IS NOT DISTINCT FROM v_campaign.slug
       AND btrim(p_title) IS NOT DISTINCT FROM v_campaign.title
       AND btrim(p_summary) IS NOT DISTINCT FROM v_campaign.summary
       AND btrim(p_description) IS NOT DISTINCT FROM v_campaign.description
       AND p_starts_at IS NOT DISTINCT FROM v_campaign.starts_at
       AND p_ends_at IS NOT DISTINCT FROM v_campaign.ends_at
       AND p_poster_url IS NOT DISTINCT FROM v_campaign.poster_url
       AND btrim(p_operating_hours) IS NOT DISTINCT FROM v_campaign.operating_hours THEN
      RETURN to_jsonb(v_campaign);
    END IF;

    UPDATE public.promotion_campaigns
       SET slug = btrim(p_slug), title = btrim(p_title), summary = btrim(p_summary),
           description = btrim(p_description), starts_at = p_starts_at, ends_at = p_ends_at,
           poster_url = p_poster_url, operating_hours = btrim(p_operating_hours),
           status = CASE WHEN status = 'rejected' THEN 'draft' ELSE status END,
           rejection_note = CASE WHEN status = 'rejected' THEN NULL ELSE rejection_note END,
           updated_by = v_actor, updated_at = now()
     WHERE id = p_campaign_id
     RETURNING * INTO v_campaign;
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, before_data, after_data)
  VALUES (
    v_actor,
    CASE
      WHEN p_campaign_id IS NULL THEN 'promotion_campaign.created'
      WHEN v_is_live THEN 'promotion_campaign.live_updated'
      ELSE 'promotion_campaign.draft_updated'
    END,
    'promotion_campaign', v_campaign.id,
    v_before,
    CASE WHEN v_is_live THEN jsonb_build_object(
      'status', v_campaign.status, 'slug', v_campaign.slug,
      'title', v_campaign.title, 'summary', v_campaign.summary, 'description', v_campaign.description,
      'startsAt', v_campaign.starts_at, 'endsAt', v_campaign.ends_at,
      'posterUrl', v_campaign.poster_url, 'operatingHours', v_campaign.operating_hours
    ) ELSE jsonb_build_object('status', v_campaign.status, 'slug', v_campaign.slug) END
  );

  RETURN to_jsonb(v_campaign);
END;
$function$;

REVOKE ALL ON FUNCTION app_private.save_promotion_campaign_draft(uuid, timestamp with time zone, text, text, text, text, timestamp with time zone, timestamp with time zone, text, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION app_private.save_promotion_campaign_draft(uuid, timestamp with time zone, text, text, text, text, timestamp with time zone, timestamp with time zone, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
