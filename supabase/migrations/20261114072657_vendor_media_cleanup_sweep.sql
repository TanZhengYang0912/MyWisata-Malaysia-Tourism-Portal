-- Vendor media cleanup sweep — Phase 2 of
-- docs/plans/2026-11-14-1610-vendor-media-upload-cleanup.md.
-- Retention (approved 2026-11-14): never-referenced uploads 24 hours;
-- previously referenced files 7 days after the last observed reference.
--
-- p_dry_run = true (the default) writes nothing and only reports what the
-- sweep would do. Deletion stays off until Phase 3 sets the cron mode.
-- Apply only after confirming the target is the local test database and
-- 20261114072629_vendor_media_objects.sql is applied.
-- Rollback: DROP FUNCTION public.finish_vendor_media_cleanup(uuid, uuid, boolean);
--   DROP FUNCTION public.claim_vendor_media_cleanup(integer, boolean);
--   DROP FUNCTION app_private.finish_vendor_media_cleanup(uuid, uuid, boolean);
--   DROP FUNCTION app_private.claim_vendor_media_cleanup(integer, boolean);
--   DROP FUNCTION app_private.vendor_media_object_is_referenced(text, text, uuid);

-- Every place a vendor image URL can be saved. Keep in sync with new URL or
-- document columns on these tables. Every lookup is scoped to one vendor.
CREATE OR REPLACE FUNCTION app_private.vendor_media_object_is_referenced(
  p_bucket text, p_storage_path text, p_vendor_id uuid
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  WITH needle AS (SELECT '/' || p_bucket || '/' || p_storage_path AS value),
  vendor_outlets AS (SELECT o.id FROM public.outlets o WHERE o.vendor_id = p_vendor_id),
  vendor_products AS (SELECT p.id FROM public.products p WHERE p.vendor_id = p_vendor_id)
  SELECT
    EXISTS (SELECT 1 FROM public.vendors v, needle n WHERE v.id = p_vendor_id
      AND (strpos(coalesce(v.logo_url, ''), n.value) > 0 OR strpos(coalesce(v.cover_url, ''), n.value) > 0))
    OR EXISTS (SELECT 1 FROM public.products p, needle n WHERE p.vendor_id = p_vendor_id
      AND strpos(coalesce(p.cover_url, ''), n.value) > 0)
    -- Approved hotel photos carry only outlet_id; product gallery rows only product_id.
    OR EXISTS (SELECT 1 FROM public.media_assets m, needle n
      WHERE (m.vendor_id = p_vendor_id OR m.outlet_id IN (SELECT id FROM vendor_outlets) OR m.product_id IN (SELECT id FROM vendor_products))
        AND strpos(m.url, n.value) > 0)
    OR EXISTS (SELECT 1 FROM public.outlet_pages op, needle n WHERE op.outlet_id IN (SELECT id FROM vendor_outlets)
      AND (strpos(coalesce(op.hero_url, ''), n.value) > 0
        OR strpos(coalesce(op.draft_document::text, ''), n.value) > 0
        OR strpos(coalesce(op.published_document::text, ''), n.value) > 0))
    OR EXISTS (SELECT 1 FROM public.hotel_profile_submissions h, needle n WHERE h.vendor_id = p_vendor_id
      AND h.status = 'pending_review' AND strpos(h.payload::text, n.value) > 0)
    OR EXISTS (SELECT 1 FROM public.vendor_event_promotions e, needle n WHERE e.vendor_id = p_vendor_id
      AND strpos(coalesce(e.poster_url, ''), n.value) > 0)
    OR EXISTS (SELECT 1 FROM public.promotion_campaign_vendors r, needle n WHERE r.vendor_id = p_vendor_id
      AND strpos(coalesce(r.stall_poster_url, ''), n.value) > 0)
    OR EXISTS (SELECT 1 FROM public.promotion_campaign_vendor_products rp
      JOIN public.promotion_campaign_vendors r ON r.id = rp.registration_id, needle n
      WHERE r.vendor_id = p_vendor_id AND strpos(coalesce(rp.image_url, ''), n.value) > 0);
$$;

CREATE OR REPLACE FUNCTION app_private.claim_vendor_media_cleanup(p_limit integer, p_dry_run boolean DEFAULT true)
RETURNS TABLE(object_id uuid, bucket text, storage_path text, claim_token uuid, action text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  r record;
  v_referenced boolean;
  v_due boolean;
  v_token uuid;
BEGIN
  IF p_limit < 1 OR p_limit > 100 THEN RAISE EXCEPTION 'invalid_batch_size'; END IF;
  FOR r IN
    SELECT o.* FROM app_private.vendor_media_objects o
     WHERE o.state IN ('reserved', 'stored')
        OR (o.state = 'deleting' AND o.cleanup_claimed_at < clock_timestamp() - interval '15 minutes')
     ORDER BY o.checked_at NULLS FIRST, o.created_at, o.object_id
     LIMIT p_limit
     FOR UPDATE SKIP LOCKED
  LOOP
    v_referenced := app_private.vendor_media_object_is_referenced(r.bucket, r.storage_path, r.vendor_id);
    v_due := r.state = 'deleting'
      OR (r.last_referenced_at IS NULL AND r.created_at < clock_timestamp() - interval '24 hours')
      OR (r.last_referenced_at < clock_timestamp() - interval '7 days');
    v_token := NULL;
    IF v_referenced THEN
      action := 'keep_referenced';
      IF NOT p_dry_run THEN
        UPDATE app_private.vendor_media_objects SET last_referenced_at = clock_timestamp(), checked_at = clock_timestamp(),
          state = CASE WHEN state = 'deleting' THEN 'stored' ELSE state END, cleanup_claimed_at = NULL, cleanup_claim_token = NULL
         WHERE vendor_media_objects.object_id = r.object_id;
      END IF;
    ELSIF v_due THEN
      action := 'delete';
      IF NOT p_dry_run THEN
        v_token := gen_random_uuid();
        UPDATE app_private.vendor_media_objects SET state = 'deleting', cleanup_claimed_at = clock_timestamp(),
          cleanup_claim_token = v_token, checked_at = clock_timestamp()
         WHERE vendor_media_objects.object_id = r.object_id;
      END IF;
    ELSE
      action := 'keep_recent';
      IF NOT p_dry_run THEN
        UPDATE app_private.vendor_media_objects SET checked_at = clock_timestamp() WHERE vendor_media_objects.object_id = r.object_id;
      END IF;
    END IF;
    object_id := r.object_id; bucket := r.bucket; storage_path := r.storage_path; claim_token := v_token;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- Matches on the claim token, so a stale worker cannot finish a newer claim.
CREATE OR REPLACE FUNCTION app_private.finish_vendor_media_cleanup(p_object_id uuid, p_claim_token uuid, p_succeeded boolean)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  UPDATE app_private.vendor_media_objects
     SET state = CASE WHEN p_succeeded THEN 'deleted' ELSE 'stored' END,
         cleanup_claimed_at = NULL, cleanup_claim_token = NULL
   WHERE object_id = p_object_id AND state = 'deleting' AND cleanup_claim_token = p_claim_token;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_vendor_media_cleanup(p_limit integer, p_dry_run boolean DEFAULT true)
RETURNS TABLE(object_id uuid, bucket text, storage_path text, claim_token uuid, action text)
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$ SELECT * FROM app_private.claim_vendor_media_cleanup(p_limit, p_dry_run); $$;

CREATE OR REPLACE FUNCTION public.finish_vendor_media_cleanup(p_object_id uuid, p_claim_token uuid, p_succeeded boolean)
RETURNS boolean
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$ SELECT app_private.finish_vendor_media_cleanup(p_object_id, p_claim_token, p_succeeded); $$;

REVOKE ALL ON FUNCTION app_private.vendor_media_object_is_referenced(text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.claim_vendor_media_cleanup(integer, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.finish_vendor_media_cleanup(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_vendor_media_cleanup(integer, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_vendor_media_cleanup(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app_private.vendor_media_object_is_referenced(text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION app_private.claim_vendor_media_cleanup(integer, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION app_private.finish_vendor_media_cleanup(uuid, uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_vendor_media_cleanup(integer, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_vendor_media_cleanup(uuid, uuid, boolean) TO service_role;

NOTIFY pgrst, 'reload schema';
