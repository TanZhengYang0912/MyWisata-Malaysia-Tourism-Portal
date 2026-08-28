-- Recommendation moderation uses a mutable current snapshot plus immutable
-- decision events. Assignment and every decision side effect are transactional.

ALTER TABLE public.vendor_recommendations
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS vendor_recommendations_assignment_idx
  ON public.vendor_recommendations(status, assigned_to, created_at DESC);

CREATE TABLE public.recommendation_review_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id UUID NOT NULL REFERENCES public.vendor_recommendations(id) ON DELETE RESTRICT,
  recommender_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('approve', 'reject', 'request_changes')),
  actor_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  actor_role TEXT NOT NULL,
  internal_note TEXT,
  customer_message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX recommendation_review_events_subject_created_idx
  ON public.recommendation_review_events(recommendation_id, created_at, id);

ALTER TABLE public.recommendation_review_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.recommendation_review_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.recommendation_review_events TO service_role;

CREATE OR REPLACE FUNCTION public.recommendation_review_events_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'recommendation_review_events_append_only';
END;
$$;

REVOKE ALL ON FUNCTION public.recommendation_review_events_append_only() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER recommendation_review_events_append_only
  BEFORE UPDATE OR DELETE ON public.recommendation_review_events
  FOR EACH ROW EXECUTE FUNCTION public.recommendation_review_events_append_only();

-- Best-effort immutable history for legacy decisions. New decisions below
-- always distinguish the internal note from customer-visible copy.
INSERT INTO public.recommendation_review_events(
  recommendation_id, recommender_id, from_status, to_status, action,
  actor_id, actor_role, internal_note, customer_message, created_at
)
SELECT
  recommendation.id,
  recommendation.recommender_id,
  'pending',
  recommendation.status,
  CASE recommendation.status
    WHEN 'approved' THEN 'approve'
    WHEN 'changes_requested' THEN 'request_changes'
    ELSE 'reject'
  END,
  recommendation.reviewer_id,
  'legacy_snapshot',
  NULL,
  COALESCE(
    recommendation.changes_requested_reason,
    recommendation.rejection_reason,
    CASE recommendation.status
      WHEN 'approved' THEN 'Your recommendation was approved.'
      WHEN 'changes_requested' THEN 'Changes were requested for this recommendation.'
      ELSE 'Your recommendation was not approved.'
    END
  ),
  COALESCE(recommendation.reviewed_at, recommendation.created_at)
FROM public.vendor_recommendations recommendation
WHERE recommendation.status IN ('approved', 'changes_requested', 'rejected')
  AND NOT EXISTS (
    SELECT 1
      FROM public.recommendation_review_events event
     WHERE event.recommendation_id = recommendation.id
  );

CREATE OR REPLACE FUNCTION public.claim_recommendation_review(
  p_recommendation_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_recommendation public.vendor_recommendations%ROWTYPE;
  v_can_decide BOOLEAN;
BEGIN
  IF v_actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF NOT public.can_review_recommendation(v_actor_id) THEN
    RAISE EXCEPTION 'recommendation_reviewer_required';
  END IF;

  SELECT * INTO v_recommendation
    FROM public.vendor_recommendations
   WHERE id = p_recommendation_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'recommendation_not_found'; END IF;

  IF v_recommendation.status = 'pending' THEN
    UPDATE public.vendor_recommendations
       SET assigned_to = v_actor_id,
           claimed_at = now()
     WHERE id = p_recommendation_id
       AND assigned_to IS NULL;

    SELECT * INTO v_recommendation
      FROM public.vendor_recommendations
     WHERE id = p_recommendation_id;
  END IF;

  v_can_decide := v_recommendation.status = 'pending'
    AND (
      v_recommendation.assigned_to = v_actor_id
      OR public.is_super_admin(v_actor_id)
    );

  RETURN jsonb_build_object(
    'assignedTo', v_recommendation.assigned_to,
    'claimedAt', v_recommendation.claimed_at,
    'isAssignedToActor', v_recommendation.assigned_to = v_actor_id,
    'canDecide', v_can_decide
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_recommendation_review(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_recommendation_review(UUID) TO authenticated;

DROP FUNCTION IF EXISTS public.admin_review_recommendation(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.admin_review_recommendation(UUID, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.admin_review_recommendation(
  p_rec_id UUID,
  p_action TEXT,
  p_internal_note TEXT DEFAULT NULL,
  p_customer_message TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_recommendation public.vendor_recommendations%ROWTYPE;
  v_status TEXT;
  v_actor_role TEXT;
  v_message TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF NOT public.can_review_recommendation(auth.uid()) THEN RAISE EXCEPTION 'admin_required'; END IF;
  IF p_action NOT IN ('approve', 'reject', 'request_changes') THEN RAISE EXCEPTION 'invalid_action'; END IF;
  IF char_length(COALESCE(p_internal_note, '')) > 1000 THEN RAISE EXCEPTION 'internal_note_too_long'; END IF;
  IF char_length(COALESCE(p_customer_message, '')) > 500 THEN RAISE EXCEPTION 'customer_message_too_long'; END IF;
  IF p_action <> 'approve' AND char_length(BTRIM(COALESCE(p_customer_message, ''))) < 10 THEN
    RAISE EXCEPTION 'customer_message_required';
  END IF;

  SELECT * INTO v_recommendation
    FROM public.vendor_recommendations
   WHERE id = p_rec_id
     AND status = 'pending'
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found_or_already_reviewed'; END IF;
  IF v_recommendation.recommender_id = auth.uid() THEN RAISE EXCEPTION 'self_dealing'; END IF;
  IF NOT public.is_super_admin(auth.uid())
     AND v_recommendation.assigned_to IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'recommendation_not_assigned';
  END IF;

  SELECT role.name INTO v_actor_role
    FROM public.user_roles assignment
    JOIN public.roles role ON role.id = assignment.role_id
   WHERE assignment.user_id = auth.uid()
     AND role.name IN ('admin', 'super_admin')
   ORDER BY CASE role.name WHEN 'super_admin' THEN 0 ELSE 1 END
   LIMIT 1;
  IF v_actor_role IS NULL THEN RAISE EXCEPTION 'admin_required'; END IF;

  v_status := CASE p_action
    WHEN 'approve' THEN 'approved'
    WHEN 'reject' THEN 'rejected'
    ELSE 'changes_requested'
  END;
  v_message := CASE
    WHEN p_action = 'approve' AND NULLIF(BTRIM(COALESCE(p_customer_message, '')), '') IS NULL
      THEN 'Great find! Your recommendation was approved.'
    ELSE BTRIM(p_customer_message)
  END;

  UPDATE public.vendor_recommendations
     SET status = v_status,
         reviewer_id = auth.uid(),
         reviewed_at = now(),
         rejection_reason = CASE WHEN p_action = 'reject' THEN v_message ELSE NULL END,
         changes_requested_at = CASE WHEN p_action = 'request_changes' THEN now() ELSE NULL END,
         changes_requested_reason = CASE WHEN p_action = 'request_changes' THEN v_message ELSE NULL END
   WHERE id = p_rec_id;

  INSERT INTO public.recommendation_review_events(
    recommendation_id, recommender_id, from_status, to_status, action,
    actor_id, actor_role, internal_note, customer_message
  ) VALUES (
    p_rec_id, v_recommendation.recommender_id, v_recommendation.status, v_status,
    p_action, auth.uid(), v_actor_role, NULLIF(BTRIM(p_internal_note), ''), v_message
  );

  INSERT INTO public.audit_logs(
    actor_id, action, entity_type, entity_id, before_data, after_data, note
  ) VALUES (
    auth.uid(), 'recommendation.' || p_action, 'vendor_recommendation', p_rec_id,
    jsonb_build_object('status', v_recommendation.status),
    jsonb_build_object('status', v_status, 'assigned_to', v_recommendation.assigned_to),
    NULLIF(BTRIM(p_internal_note), '')
  );

  INSERT INTO public.notifications(
    user_id, type, title, body, link, event_key, metadata
  ) VALUES (
    v_recommendation.recommender_id,
    CASE p_action
      WHEN 'approve' THEN 'recommendation_approved'
      WHEN 'reject' THEN 'recommendation_rejected'
      ELSE 'recommendation_changes_requested'
    END,
    CASE p_action
      WHEN 'approve' THEN 'Recommendation approved'
      WHEN 'reject' THEN 'Recommendation reviewed'
      ELSE 'Changes requested for your recommendation'
    END,
    v_message,
    '/customer/recommendations',
    'recommendation_decision:' || p_rec_id::text || ':' || v_status,
    jsonb_build_object('recommendation_id', p_rec_id, 'vendor_name', v_recommendation.vendor_name)
  ) ON CONFLICT (event_key) WHERE event_key IS NOT NULL DO NOTHING;

  RETURN jsonb_build_object(
    'recommendationId', p_rec_id,
    'status', v_status,
    'recommenderId', v_recommendation.recommender_id,
    'vendorName', v_recommendation.vendor_name
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_review_recommendation(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_recommendation(UUID, TEXT, TEXT, TEXT) TO authenticated;
