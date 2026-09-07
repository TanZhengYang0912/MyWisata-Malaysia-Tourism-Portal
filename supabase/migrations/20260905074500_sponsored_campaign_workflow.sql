-- Governed sponsored campaign workflow. All staff writes run through these
-- RPCs; the permission check is repeated inside the database transaction.

ALTER TABLE public.sponsored_discovery_placements
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_note TEXT;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.sponsored_discovery_placements FROM authenticated;
DROP POLICY IF EXISTS sponsored_discovery_placements_staff_mutation
  ON public.sponsored_discovery_placements;

CREATE OR REPLACE FUNCTION public.create_sponsored_discovery_placement(
  p_product_id UUID,
  p_state TEXT,
  p_category_slug TEXT,
  p_starts_at TIMESTAMPTZ,
  p_ends_at TIMESTAMPTZ,
  p_priority INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_placement public.sponsored_discovery_placements%ROWTYPE;
BEGIN
  IF v_actor IS NULL
     OR NOT public.has_staff_permission(v_actor, 'admin.map_campaign.manage') THEN
    RAISE EXCEPTION 'map_campaign_permission_required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.products
     WHERE id = p_product_id
       AND status = 'active'
       AND review_status = 'approved'
  ) THEN
    RAISE EXCEPTION 'sponsored_product_not_eligible';
  END IF;

  IF p_starts_at IS NULL OR p_ends_at IS NULL OR p_ends_at <= p_starts_at THEN
    RAISE EXCEPTION 'sponsored_date_range_invalid';
  END IF;
  IF p_priority IS NULL OR p_priority < 0 OR p_priority > 1000 THEN
    RAISE EXCEPTION 'sponsored_priority_invalid';
  END IF;
  IF p_state IS NOT NULL AND BTRIM(p_state) = '' THEN
    RAISE EXCEPTION 'sponsored_state_invalid';
  END IF;
  IF p_category_slug IS NOT NULL AND BTRIM(p_category_slug) = '' THEN
    RAISE EXCEPTION 'sponsored_category_invalid';
  END IF;

  INSERT INTO public.sponsored_discovery_placements (
    product_id,
    state,
    category_slug,
    starts_at,
    ends_at,
    priority,
    status,
    created_by
  ) VALUES (
    p_product_id,
    NULLIF(BTRIM(p_state), ''),
    NULLIF(LOWER(BTRIM(p_category_slug)), ''),
    p_starts_at,
    p_ends_at,
    p_priority,
    'draft',
    v_actor
  )
  RETURNING * INTO v_placement;

  RETURN to_jsonb(v_placement);
END;
$$;

CREATE OR REPLACE FUNCTION public.transition_sponsored_discovery_placement(
  p_placement_id UUID,
  p_action TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_placement public.sponsored_discovery_placements%ROWTYPE;
  v_next_status TEXT;
BEGIN
  IF v_actor IS NULL
     OR NOT public.has_staff_permission(v_actor, 'admin.map_campaign.manage') THEN
    RAISE EXCEPTION 'map_campaign_permission_required';
  END IF;

  SELECT * INTO v_placement
    FROM public.sponsored_discovery_placements
   WHERE id = p_placement_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'sponsored_placement_not_found'; END IF;

  v_next_status := CASE
    WHEN v_placement.status = 'draft' AND p_action = 'submit' THEN 'pending_approval'
    WHEN v_placement.status = 'pending_approval' AND p_action = 'approve' THEN 'approved'
    WHEN v_placement.status = 'pending_approval' AND p_action = 'reject' THEN 'rejected'
    WHEN v_placement.status = 'approved' AND p_action = 'pause' THEN 'paused'
    ELSE NULL
  END;
  IF v_next_status IS NULL THEN RAISE EXCEPTION 'sponsored_transition_invalid'; END IF;

  IF p_action = 'reject' AND COALESCE(LENGTH(BTRIM(p_note)), 0) < 5 THEN
    RAISE EXCEPTION 'sponsored_rejection_reason_required';
  END IF;
  IF p_action <> 'reject' AND p_note IS NOT NULL THEN
    RAISE EXCEPTION 'sponsored_transition_note_not_allowed';
  END IF;

  IF p_action = 'approve' THEN
    IF v_placement.created_by = v_actor THEN
      RAISE EXCEPTION 'sponsored_creator_self_approval_denied';
    END IF;
    IF NOT EXISTS (
      SELECT 1
        FROM public.products
       WHERE id = v_placement.product_id
         AND status = 'active'
         AND review_status = 'approved'
    ) THEN
      RAISE EXCEPTION 'sponsored_product_not_eligible';
    END IF;
  END IF;

  UPDATE public.sponsored_discovery_placements
     SET status = v_next_status,
         review_note = CASE WHEN p_action = 'reject' THEN BTRIM(p_note) ELSE review_note END,
         approved_by = CASE WHEN p_action = 'approve' THEN v_actor ELSE approved_by END,
         approved_at = CASE WHEN p_action = 'approve' THEN now() ELSE approved_at END,
         updated_at = now()
   WHERE id = p_placement_id
   RETURNING * INTO v_placement;

  -- The existing sponsored_discovery_placements_audit trigger appends this
  -- transition to sponsored_discovery_placement_events. Its append-only
  -- sponsored_discovery_placement_events_append_only trigger remains active.
  RETURN to_jsonb(v_placement);
END;
$$;

REVOKE ALL ON FUNCTION public.create_sponsored_discovery_placement(
  UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_sponsored_discovery_placement(
  UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER
) TO authenticated;

REVOKE ALL ON FUNCTION public.transition_sponsored_discovery_placement(
  UUID, TEXT, TEXT
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.transition_sponsored_discovery_placement(
  UUID, TEXT, TEXT
) TO authenticated;

-- Public interaction evidence is intentionally privacy-minimal. Eligibility
-- is resolved again at insert time, so the browser cannot manufacture a
-- sponsored association or attach tracking metadata.
CREATE TABLE public.sponsored_discovery_events (
  placement_id UUID NOT NULL REFERENCES public.sponsored_discovery_placements(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('impression', 'click')),
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sponsored_discovery_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sponsored_discovery_events FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.record_sponsored_discovery_event(
  p_placement_id UUID,
  p_product_id UUID,
  p_event_type TEXT
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_placement public.sponsored_discovery_placements%ROWTYPE;
  v_created_at TIMESTAMPTZ;
BEGIN
  IF p_event_type NOT IN ('impression', 'click') THEN
    RAISE EXCEPTION 'sponsored_event_type_invalid';
  END IF;

  SELECT placement.* INTO v_placement
    FROM public.sponsored_discovery_placements placement
   WHERE placement.id = p_placement_id
     AND placement.status = 'approved'
     AND placement.starts_at <= now()
     AND now() < placement.ends_at;
  IF NOT FOUND THEN RAISE EXCEPTION 'sponsored_placement_not_effective'; END IF;

  IF v_placement.product_id <> p_product_id THEN
    RAISE EXCEPTION 'sponsored_placement_product_mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.products product
     WHERE product.id = p_product_id
       AND product.status = 'active'
       AND product.review_status = 'approved'
  ) THEN
    RAISE EXCEPTION 'sponsored_product_not_eligible';
  END IF;

  INSERT INTO public.sponsored_discovery_events (
    placement_id, product_id, event_type, user_id, created_at
  ) VALUES (
    p_placement_id, p_product_id, p_event_type, auth.uid(), now()
  )
  RETURNING created_at INTO v_created_at;

  RETURN v_created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.record_sponsored_discovery_event(UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_sponsored_discovery_event(UUID, UUID, TEXT) TO anon, authenticated;
