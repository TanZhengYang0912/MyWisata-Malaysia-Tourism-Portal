-- Durable, per-Super-Admin read state for the Recommendations queue.

CREATE TABLE public.admin_recommendation_read_state (
  admin_user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  recommendations_last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_recommendation_read_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_recommendation_read_state_owner_select
  ON public.admin_recommendation_read_state
  FOR SELECT
  TO authenticated
  USING (
    admin_user_id = auth.uid()
    AND public.is_super_admin(auth.uid())
  );

CREATE OR REPLACE FUNCTION public.get_my_unread_recommendation_count()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin_user_id UUID := auth.uid();
  v_seen_at TIMESTAMPTZ;
BEGIN
  IF v_admin_user_id IS NULL OR NOT public.is_super_admin(v_admin_user_id) THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;

  SELECT recommendations_last_seen_at
    INTO v_seen_at
    FROM public.admin_recommendation_read_state
   WHERE admin_user_id = v_admin_user_id;

  RETURN (
    SELECT COUNT(*)::INTEGER
      FROM public.vendor_recommendations
     WHERE status = 'pending'
       AND (v_seen_at IS NULL OR created_at > v_seen_at)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_my_recommendations_seen()
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin_user_id UUID := auth.uid();
  v_seen_at TIMESTAMPTZ := now();
BEGIN
  IF v_admin_user_id IS NULL OR NOT public.is_super_admin(v_admin_user_id) THEN
    RAISE EXCEPTION 'super_admin_required';
  END IF;

  INSERT INTO public.admin_recommendation_read_state (
    admin_user_id,
    recommendations_last_seen_at,
    updated_at
  )
  VALUES (v_admin_user_id, v_seen_at, v_seen_at)
  ON CONFLICT (admin_user_id) DO UPDATE
    SET recommendations_last_seen_at = EXCLUDED.recommendations_last_seen_at,
        updated_at = EXCLUDED.updated_at;

  RETURN v_seen_at;
END;
$$;

REVOKE ALL ON TABLE public.admin_recommendation_read_state FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.admin_recommendation_read_state TO authenticated;

REVOKE ALL ON FUNCTION public.get_my_unread_recommendation_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_unread_recommendation_count() TO authenticated;

REVOKE ALL ON FUNCTION public.mark_my_recommendations_seen() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_my_recommendations_seen() TO authenticated;
