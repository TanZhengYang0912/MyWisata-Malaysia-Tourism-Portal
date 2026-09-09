-- Govern sponsored discovery as four deterministic positions. Preview and
-- approval use the same server-owned state so browser callers cannot choose
-- which campaigns move, pause, or archive.

ALTER TABLE public.sponsored_discovery_placements
  DISABLE TRIGGER sponsored_discovery_placements_authorize_mutation;

ALTER TABLE public.sponsored_discovery_placements
  DROP CONSTRAINT IF EXISTS sponsored_discovery_placements_priority_range,
  DROP CONSTRAINT IF EXISTS sponsored_discovery_placements_status_check,
  DROP CONSTRAINT IF EXISTS sponsored_discovery_placements_state_scope,
  DROP CONSTRAINT IF EXISTS sponsored_discovery_placements_category_scope;

UPDATE public.sponsored_discovery_placements
SET state = CASE LOWER(BTRIM(state))
  WHEN 'johor' THEN 'Johor'
  WHEN 'kedah' THEN 'Kedah'
  WHEN 'kelantan' THEN 'Kelantan'
  WHEN 'melaka' THEN 'Melaka'
  WHEN 'negeri sembilan' THEN 'Negeri Sembilan'
  WHEN 'pahang' THEN 'Pahang'
  WHEN 'perak' THEN 'Perak'
  WHEN 'perlis' THEN 'Perlis'
  WHEN 'penang' THEN 'Penang'
  WHEN 'sabah' THEN 'Sabah'
  WHEN 'sarawak' THEN 'Sarawak'
  WHEN 'selangor' THEN 'Selangor'
  WHEN 'terengganu' THEN 'Terengganu'
  WHEN 'kuala lumpur' THEN 'Kuala Lumpur'
  WHEN 'putrajaya' THEN 'Putrajaya'
  WHEN 'labuan' THEN 'Labuan'
  ELSE state
END
WHERE state IS NOT NULL;

UPDATE public.sponsored_discovery_placements
SET category_slug = LOWER(BTRIM(category_slug))
WHERE category_slug IS NOT NULL;

-- Unknown legacy scopes must fail closed instead of accidentally becoming a
-- broad campaign. They remain in history as archived records.
UPDATE public.sponsored_discovery_placements
SET status = 'archived',
    state = NULL,
    category_slug = NULL,
    updated_at = now()
WHERE (state IS NOT NULL AND state <> ALL (ARRAY[
    'Johor', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan', 'Pahang',
    'Perak', 'Perlis', 'Penang', 'Sabah', 'Sarawak', 'Selangor',
    'Terengganu', 'Kuala Lumpur', 'Putrajaya', 'Labuan'
  ]))
   OR (category_slug IS NOT NULL AND category_slug <> ALL (ARRAY[
    'food', 'activity', 'accommodation', 'retail'
  ]));

-- Drafts and pending rows without ownership cannot satisfy independent
-- approval. Keep them as history and require a new governed draft.
UPDATE public.sponsored_discovery_placements
SET status = 'archived', updated_at = now()
WHERE status IN ('draft', 'pending_approval')
  AND created_by IS NULL;

WITH ranked_approved AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY COALESCE(state, '*'), COALESCE(category_slug, '*')
      ORDER BY priority DESC, starts_at ASC, id ASC
    ) AS position
  FROM public.sponsored_discovery_placements
  WHERE status = 'approved'
)
UPDATE public.sponsored_discovery_placements AS placement
SET priority = LEAST(ranked.position, 4)::INTEGER,
    status = CASE WHEN ranked.position > 4 THEN 'paused' ELSE placement.status END,
    updated_at = CASE WHEN ranked.position > 4 THEN now() ELSE placement.updated_at END
FROM ranked_approved AS ranked
WHERE placement.id = ranked.id;

UPDATE public.sponsored_discovery_placements
SET priority = GREATEST(1, LEAST(4, priority))
WHERE priority NOT BETWEEN 1 AND 4;

WITH ranked_paused AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY status
      ORDER BY updated_at DESC, id DESC
    ) AS pause_rank
  FROM public.sponsored_discovery_placements
  WHERE status = 'paused'
)
UPDATE public.sponsored_discovery_placements AS placement
SET status = 'archived', updated_at = now()
FROM ranked_paused AS ranked
WHERE placement.id = ranked.id
  AND ranked.pause_rank > 2;

ALTER TABLE public.sponsored_discovery_placements
  ADD CONSTRAINT sponsored_discovery_placements_priority_range
    CHECK (priority BETWEEN 1 AND 4),
  ADD CONSTRAINT sponsored_discovery_placements_status_check
    CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected', 'paused', 'archived')),
  ADD CONSTRAINT sponsored_discovery_placements_state_scope
    CHECK (state IS NULL OR state = ANY (ARRAY[
      'Johor', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan', 'Pahang',
      'Perak', 'Perlis', 'Penang', 'Sabah', 'Sarawak', 'Selangor',
      'Terengganu', 'Kuala Lumpur', 'Putrajaya', 'Labuan'
    ])),
  ADD CONSTRAINT sponsored_discovery_placements_category_scope
    CHECK (category_slug IS NULL OR category_slug = ANY (ARRAY[
      'food', 'activity', 'accommodation', 'retail'
    ])),
  ADD CONSTRAINT sponsored_discovery_placements_owned_workflow
    CHECK (status NOT IN ('draft', 'pending_approval') OR created_by IS NOT NULL);

ALTER TABLE public.sponsored_discovery_placements
  ENABLE TRIGGER sponsored_discovery_placements_authorize_mutation;

DROP INDEX IF EXISTS public.sponsored_discovery_placements_active_lookup_idx;
CREATE INDEX sponsored_discovery_placements_active_lookup_idx
  ON public.sponsored_discovery_placements (
    state,
    category_slug,
    priority ASC,
    starts_at,
    ends_at,
    id
  )
  WHERE status = 'approved';

REVOKE ALL ON FUNCTION public.create_sponsored_discovery_placement(
  UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER
) FROM PUBLIC, anon, authenticated, service_role;
DROP FUNCTION public.create_sponsored_discovery_placement(
  UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER
);

REVOKE ALL ON FUNCTION public.transition_sponsored_discovery_placement(
  UUID, TEXT, TEXT
) FROM PUBLIC, anon, authenticated, service_role;
DROP FUNCTION public.transition_sponsored_discovery_placement(UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.preview_sponsored_discovery_placement(
  p_placement_id UUID,
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
  v_existing public.sponsored_discovery_placements%ROWTYPE;
  v_product_id UUID;
  v_product_name TEXT;
  v_product_status TEXT;
  v_product_review_status TEXT;
  v_state TEXT;
  v_category_slug TEXT;
  v_starts_at TIMESTAMPTZ;
  v_ends_at TIMESTAMPTZ;
  v_priority INTEGER;
  v_has_collision BOOLEAN := FALSE;
  v_shifts JSONB := '[]'::JSONB;
  v_paused JSONB := '[]'::JSONB;
  v_archived JSONB := '[]'::JSONB;
  v_relevant_state JSONB := '[]'::JSONB;
  v_preview_version TEXT;
  v_paused_capacity INTEGER := 2;
BEGIN
  IF v_actor IS NULL
     OR NOT public.has_staff_permission(v_actor, 'admin.map_campaign.manage') THEN
    RAISE EXCEPTION 'map_campaign_permission_required';
  END IF;

  IF p_placement_id IS NOT NULL THEN
    SELECT * INTO v_existing
      FROM public.sponsored_discovery_placements
     WHERE id = p_placement_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'sponsored_placement_not_found'; END IF;
    IF v_existing.status <> 'pending_approval' THEN
      RAISE EXCEPTION 'sponsored_transition_invalid';
    END IF;

    v_product_id := v_existing.product_id;
    v_state := v_existing.state;
    v_category_slug := v_existing.category_slug;
    v_starts_at := v_existing.starts_at;
    v_ends_at := v_existing.ends_at;
    v_priority := v_existing.priority;
  ELSE
    v_product_id := p_product_id;
    v_state := NULLIF(BTRIM(p_state), '');
    v_category_slug := NULLIF(LOWER(BTRIM(p_category_slug)), '');
    v_starts_at := p_starts_at;
    v_ends_at := p_ends_at;
    v_priority := p_priority;
  END IF;

  IF v_starts_at IS NULL OR v_ends_at IS NULL OR v_ends_at <= v_starts_at THEN
    RAISE EXCEPTION 'sponsored_date_range_invalid';
  END IF;
  IF v_priority IS NULL OR v_priority NOT BETWEEN 1 AND 4 THEN
    RAISE EXCEPTION 'sponsored_priority_invalid';
  END IF;
  IF v_state IS NOT NULL AND v_state <> ALL (ARRAY[
    'Johor', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan', 'Pahang',
    'Perak', 'Perlis', 'Penang', 'Sabah', 'Sarawak', 'Selangor',
    'Terengganu', 'Kuala Lumpur', 'Putrajaya', 'Labuan'
  ]) THEN
    RAISE EXCEPTION 'sponsored_state_invalid';
  END IF;
  IF v_category_slug IS NOT NULL AND v_category_slug <> ALL (ARRAY[
    'food', 'activity', 'accommodation', 'retail'
  ]) THEN
    RAISE EXCEPTION 'sponsored_category_invalid';
  END IF;

  SELECT product.name, product.status, product.review_status
    INTO v_product_name, v_product_status, v_product_review_status
    FROM public.products AS product
   WHERE product.id = v_product_id;
  IF NOT FOUND OR v_product_status <> 'active' OR v_product_review_status <> 'approved' THEN
    RAISE EXCEPTION 'sponsored_product_not_eligible';
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.sponsored_discovery_placements AS placement
     WHERE placement.status = 'approved'
       AND placement.id IS DISTINCT FROM p_placement_id
       AND placement.state IS NOT DISTINCT FROM v_state
       AND placement.category_slug IS NOT DISTINCT FROM v_category_slug
       AND placement.starts_at < v_ends_at
       AND placement.ends_at > v_starts_at
       AND placement.priority = v_priority
  ) INTO v_has_collision;

  IF v_has_collision THEN
    WITH ordered_affected AS (
      SELECT
        placement.id,
        product.name AS product_name,
        placement.priority AS from_position,
        (v_priority + ROW_NUMBER() OVER (
          ORDER BY placement.priority ASC, placement.id ASC
        ))::INTEGER AS target_position
      FROM public.sponsored_discovery_placements AS placement
      JOIN public.products AS product ON product.id = placement.product_id
      WHERE placement.status = 'approved'
        AND placement.id IS DISTINCT FROM p_placement_id
        AND placement.state IS NOT DISTINCT FROM v_state
        AND placement.category_slug IS NOT DISTINCT FROM v_category_slug
        AND placement.starts_at < v_ends_at
        AND placement.ends_at > v_starts_at
        AND placement.priority >= v_priority
    )
    SELECT COALESCE(JSONB_AGG(
      JSONB_BUILD_OBJECT(
        'placementId', affected.id,
        'productName', affected.product_name,
        'fromPosition', affected.from_position,
        'toPosition', affected.target_position
      ) ORDER BY affected.target_position ASC, affected.id ASC
    ), '[]'::JSONB)
    INTO v_shifts
    FROM ordered_affected AS affected
    WHERE affected.target_position <= 4
      AND affected.target_position <> affected.from_position;

    WITH ordered_affected AS (
      SELECT
        placement.id,
        product.name AS product_name,
        placement.priority AS from_position,
        (v_priority + ROW_NUMBER() OVER (
          ORDER BY placement.priority ASC, placement.id ASC
        ))::INTEGER AS target_position
      FROM public.sponsored_discovery_placements AS placement
      JOIN public.products AS product ON product.id = placement.product_id
      WHERE placement.status = 'approved'
        AND placement.id IS DISTINCT FROM p_placement_id
        AND placement.state IS NOT DISTINCT FROM v_state
        AND placement.category_slug IS NOT DISTINCT FROM v_category_slug
        AND placement.starts_at < v_ends_at
        AND placement.ends_at > v_starts_at
        AND placement.priority >= v_priority
    )
    SELECT COALESCE(JSONB_AGG(
      JSONB_BUILD_OBJECT(
        'placementId', affected.id,
        'productName', affected.product_name,
        'fromPosition', affected.from_position,
        'toStatus', 'paused'
      ) ORDER BY affected.target_position ASC, affected.id ASC
    ), '[]'::JSONB)
    INTO v_paused
    FROM ordered_affected AS affected
    WHERE affected.target_position > 4;
  END IF;

  IF JSONB_ARRAY_LENGTH(v_paused) > 0 THEN
    v_paused_capacity := 1;
  END IF;

  WITH ranked_paused AS (
    SELECT
      placement.id,
      product.name AS product_name,
      placement.priority,
      ROW_NUMBER() OVER (
        PARTITION BY placement.status
        ORDER BY placement.updated_at DESC, placement.id DESC
      ) AS pause_rank
    FROM public.sponsored_discovery_placements AS placement
    JOIN public.products AS product ON product.id = placement.product_id
    WHERE placement.status = 'paused'
  )
  SELECT COALESCE(JSONB_AGG(
    JSONB_BUILD_OBJECT(
      'placementId', ranked.id,
      'productName', ranked.product_name,
      'fromPosition', ranked.priority,
      'toStatus', 'archived'
    ) ORDER BY ranked.pause_rank ASC
  ), '[]'::JSONB)
  INTO v_archived
  FROM ranked_paused AS ranked
  WHERE ranked.pause_rank > v_paused_capacity;

  SELECT COALESCE(JSONB_AGG(
    JSONB_BUILD_OBJECT(
      'id', placement.id,
      'status', placement.status,
      'state', placement.state,
      'categorySlug', placement.category_slug,
      'startsAt', placement.starts_at,
      'endsAt', placement.ends_at,
      'priority', placement.priority,
      'updatedAt', placement.updated_at
    ) ORDER BY placement.id ASC
  ), '[]'::JSONB)
  INTO v_relevant_state
  FROM public.sponsored_discovery_placements AS placement
  WHERE (
      placement.status = 'approved'
      AND placement.state IS NOT DISTINCT FROM v_state
      AND placement.category_slug IS NOT DISTINCT FROM v_category_slug
      AND placement.starts_at < v_ends_at
      AND placement.ends_at > v_starts_at
    )
    OR placement.status = 'paused'
    OR placement.id = p_placement_id;

  v_preview_version := MD5(JSONB_BUILD_OBJECT(
    'proposal', JSONB_BUILD_OBJECT(
      'placementId', p_placement_id,
      'productId', v_product_id,
      'productName', v_product_name,
      'state', v_state,
      'categorySlug', v_category_slug,
      'startsAt', v_starts_at,
      'endsAt', v_ends_at,
      'priority', v_priority
    ),
    'productEligibility', JSONB_BUILD_OBJECT(
      'status', v_product_status,
      'reviewStatus', v_product_review_status
    ),
    'databaseState', v_relevant_state
  )::TEXT);

  RETURN JSONB_BUILD_OBJECT(
    'previewVersion', v_preview_version,
    'requestedPosition', v_priority,
    'hasCollision', v_has_collision,
    'shifts', v_shifts,
    'paused', v_paused,
    'archived', v_archived,
    'summary', JSONB_BUILD_OBJECT(
      'shiftedCount', JSONB_ARRAY_LENGTH(v_shifts),
      'pausedCount', JSONB_ARRAY_LENGTH(v_paused),
      'archivedCount', JSONB_ARRAY_LENGTH(v_archived)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.preview_sponsored_discovery_placement(
  UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.preview_sponsored_discovery_placement(
  UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER
) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_sponsored_discovery_placement(
  p_product_id UUID,
  p_state TEXT,
  p_category_slug TEXT,
  p_starts_at TIMESTAMPTZ,
  p_ends_at TIMESTAMPTZ,
  p_priority INTEGER,
  p_preview_version TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_preview JSONB;
  v_placement public.sponsored_discovery_placements%ROWTYPE;
BEGIN
  IF v_actor IS NULL
     OR NOT public.has_staff_permission(v_actor, 'admin.map_campaign.manage') THEN
    RAISE EXCEPTION 'map_campaign_permission_required';
  END IF;

  PERFORM PG_ADVISORY_XACT_LOCK(HASHTEXT('sponsored_discovery_position_governance'));
  v_preview := public.preview_sponsored_discovery_placement(
    NULL,
    p_product_id,
    p_state,
    p_category_slug,
    p_starts_at,
    p_ends_at,
    p_priority
  );
  IF p_preview_version IS NULL
     OR p_preview_version <> v_preview ->> 'previewVersion' THEN
    RAISE EXCEPTION 'sponsored_preview_stale';
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

  RETURN TO_JSONB(v_placement);
END;
$$;

CREATE OR REPLACE FUNCTION public.transition_sponsored_discovery_placement(
  p_placement_id UUID,
  p_action TEXT,
  p_note TEXT,
  p_preview_version TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_placement public.sponsored_discovery_placements%ROWTYPE;
  v_preview JSONB;
  v_product_lock UUID;
  v_has_collision BOOLEAN := FALSE;
  v_next_status TEXT;
BEGIN
  IF v_actor IS NULL
     OR NOT public.has_staff_permission(v_actor, 'admin.map_campaign.manage') THEN
    RAISE EXCEPTION 'map_campaign_permission_required';
  END IF;

  PERFORM PG_ADVISORY_XACT_LOCK(HASHTEXT('sponsored_discovery_position_governance'));

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
    IF v_placement.created_by IS NULL THEN
      RAISE EXCEPTION 'sponsored_creator_missing';
    END IF;
    IF v_placement.created_by = v_actor THEN
      RAISE EXCEPTION 'sponsored_creator_self_approval_denied';
    END IF;

    SELECT product.id INTO v_product_lock
      FROM public.products AS product
     WHERE product.id = v_placement.product_id
       AND product.status = 'active'
       AND product.review_status = 'approved'
     FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'sponsored_product_not_eligible'; END IF;

    PERFORM 1
      FROM public.sponsored_discovery_placements AS placement
     WHERE (
       placement.status = 'approved'
       AND placement.state IS NOT DISTINCT FROM v_placement.state
       AND placement.category_slug IS NOT DISTINCT FROM v_placement.category_slug
       AND placement.starts_at < v_placement.ends_at
       AND placement.ends_at > v_placement.starts_at
     ) OR placement.status = 'paused'
     ORDER BY placement.id
     FOR UPDATE;

    v_preview := public.preview_sponsored_discovery_placement(
      v_placement.id, NULL, NULL, NULL, NULL, NULL, NULL
    );
    IF p_preview_version IS NULL
       OR p_preview_version <> v_preview ->> 'previewVersion' THEN
      RAISE EXCEPTION 'sponsored_preview_stale';
    END IF;
    v_has_collision := COALESCE((v_preview ->> 'hasCollision')::BOOLEAN, FALSE);

    IF v_has_collision THEN
      WITH ordered_affected AS (
        SELECT
          placement.id,
          (v_placement.priority + ROW_NUMBER() OVER (
            ORDER BY placement.priority ASC, placement.id ASC
          ))::INTEGER AS target_position
        FROM public.sponsored_discovery_placements AS placement
        WHERE placement.status = 'approved'
          AND placement.id <> v_placement.id
          AND placement.state IS NOT DISTINCT FROM v_placement.state
          AND placement.category_slug IS NOT DISTINCT FROM v_placement.category_slug
          AND placement.starts_at < v_placement.ends_at
          AND placement.ends_at > v_placement.starts_at
          AND placement.priority >= v_placement.priority
      )
      UPDATE public.sponsored_discovery_placements AS placement
         SET priority = LEAST(affected.target_position, 4),
             status = CASE WHEN affected.target_position > 4 THEN 'paused' ELSE placement.status END,
             updated_at = now()
        FROM ordered_affected AS affected
       WHERE placement.id = affected.id;
    END IF;

    UPDATE public.sponsored_discovery_placements
       SET status = 'approved',
           approved_by = v_actor,
           approved_at = now(),
           updated_at = now()
     WHERE id = p_placement_id
     RETURNING * INTO v_placement;
  ELSE
    UPDATE public.sponsored_discovery_placements
       SET status = v_next_status,
           review_note = CASE WHEN p_action = 'reject' THEN BTRIM(p_note) ELSE review_note END,
           updated_at = now()
     WHERE id = p_placement_id
     RETURNING * INTO v_placement;
  END IF;

  IF p_action IN ('approve', 'pause') THEN
    WITH ranked_paused AS (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY status
          ORDER BY updated_at DESC, id DESC
        ) AS pause_rank
      FROM public.sponsored_discovery_placements
      WHERE status = 'paused'
    )
    UPDATE public.sponsored_discovery_placements AS placement
       SET status = 'archived', updated_at = now()
      FROM ranked_paused AS ranked
     WHERE placement.id = ranked.id
       AND ranked.pause_rank > 2;
  END IF;

  RETURN TO_JSONB(v_placement);
END;
$$;

REVOKE ALL ON FUNCTION public.create_sponsored_discovery_placement(
  UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, TEXT
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_sponsored_discovery_placement(
  UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, TEXT
) TO authenticated;

REVOKE ALL ON FUNCTION public.transition_sponsored_discovery_placement(
  UUID, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.transition_sponsored_discovery_placement(
  UUID, TEXT, TEXT, TEXT
) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_active_sponsored_discovery_placements()
RETURNS TABLE (
  id UUID,
  product_id UUID,
  state TEXT,
  category_slug TEXT,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  priority INTEGER,
  status TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    placement.id,
    placement.product_id,
    placement.state,
    placement.category_slug,
    placement.starts_at,
    placement.ends_at,
    placement.priority,
    placement.status
  FROM public.sponsored_discovery_placements AS placement
  JOIN public.products AS product ON product.id = placement.product_id
  WHERE placement.status = 'approved'
    AND placement.starts_at <= now()
    AND now() < placement.ends_at
    AND product.status = 'active'
    AND product.review_status = 'approved'
  ORDER BY placement.priority ASC, placement.starts_at ASC, placement.id ASC;
$$;

REVOKE ALL ON FUNCTION public.list_active_sponsored_discovery_placements()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_active_sponsored_discovery_placements()
  TO anon, authenticated, service_role;
