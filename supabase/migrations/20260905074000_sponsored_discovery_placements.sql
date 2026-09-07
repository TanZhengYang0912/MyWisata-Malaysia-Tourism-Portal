-- Sponsored discovery placements are server-sourced campaign facts. Browser
-- callers may read active approved rows, but every mutation is independently
-- checked against the dedicated Staff RBAC permission inside the database.

CREATE TABLE public.sponsored_discovery_placements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  state TEXT,
  category_slug TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sponsored_discovery_placements_valid_time CHECK (ends_at > starts_at),
  CONSTRAINT sponsored_discovery_placements_priority_range CHECK (priority BETWEEN 0 AND 1000),
  CONSTRAINT sponsored_discovery_placements_status_check
    CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected', 'paused')),
  CONSTRAINT sponsored_discovery_placements_state_scope
    CHECK (state IS NULL OR BTRIM(state) <> ''),
  CONSTRAINT sponsored_discovery_placements_category_scope
    CHECK (category_slug IS NULL OR BTRIM(category_slug) <> '')
);

CREATE INDEX sponsored_discovery_placements_active_lookup_idx
  ON public.sponsored_discovery_placements (
    state,
    category_slug,
    priority DESC,
    starts_at,
    id
  )
  WHERE status = 'approved';

CREATE TABLE public.sponsored_discovery_placement_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  placement_id UUID REFERENCES public.sponsored_discovery_placements(id) ON DELETE SET NULL,
  placement_ref UUID NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('insert', 'update', 'delete')),
  actor_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  actor_role TEXT NOT NULL,
  before_data JSONB,
  after_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX sponsored_discovery_placement_events_placement_created_idx
  ON public.sponsored_discovery_placement_events (placement_id, created_at, id);

CREATE OR REPLACE FUNCTION public.authorize_sponsored_discovery_placement_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF COALESCE(auth.role(), '') = 'service_role' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL
     OR NOT public.has_staff_permission(auth.uid(), 'admin.map_campaign.manage') THEN
    RAISE EXCEPTION 'map_campaign_permission_required';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.authorize_sponsored_discovery_placement_mutation()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER sponsored_discovery_placements_authorize_mutation
  BEFORE INSERT OR UPDATE OR DELETE ON public.sponsored_discovery_placements
  FOR EACH ROW EXECUTE FUNCTION public.authorize_sponsored_discovery_placement_mutation();

CREATE OR REPLACE FUNCTION public.audit_sponsored_discovery_placement_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_placement_id UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_placement_id := NEW.id;
    INSERT INTO public.sponsored_discovery_placement_events (
      placement_id, placement_ref, operation, actor_id, actor_role, before_data, after_data
    ) VALUES (
      v_placement_id, v_placement_id, 'insert', auth.uid(), COALESCE(auth.role(), 'unknown'), NULL, to_jsonb(NEW)
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    v_placement_id := NEW.id;
    INSERT INTO public.sponsored_discovery_placement_events (
      placement_id, placement_ref, operation, actor_id, actor_role, before_data, after_data
    ) VALUES (
      v_placement_id, v_placement_id, 'update', auth.uid(), COALESCE(auth.role(), 'unknown'), to_jsonb(OLD), to_jsonb(NEW)
    );
    RETURN NEW;
  END IF;

  INSERT INTO public.sponsored_discovery_placement_events (
    placement_id, placement_ref, operation, actor_id, actor_role, before_data, after_data
  ) VALUES (
    NULL, OLD.id, 'delete', auth.uid(), COALESCE(auth.role(), 'unknown'), to_jsonb(OLD), NULL
  );
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_sponsored_discovery_placement_mutation()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER sponsored_discovery_placements_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.sponsored_discovery_placements
  FOR EACH ROW EXECUTE FUNCTION public.audit_sponsored_discovery_placement_mutation();

CREATE OR REPLACE FUNCTION public.sponsored_discovery_placement_events_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'sponsored_discovery_placement_events_append_only';
END;
$$;

REVOKE ALL ON FUNCTION public.sponsored_discovery_placement_events_append_only()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER sponsored_discovery_placement_events_append_only
  BEFORE UPDATE OR DELETE ON public.sponsored_discovery_placement_events
  FOR EACH ROW EXECUTE FUNCTION public.sponsored_discovery_placement_events_append_only();

ALTER TABLE public.sponsored_discovery_placements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sponsored_discovery_placement_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.sponsored_discovery_placements FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.sponsored_discovery_placements TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sponsored_discovery_placements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sponsored_discovery_placements TO service_role;

CREATE POLICY sponsored_discovery_placements_public_active_read
  ON public.sponsored_discovery_placements
  FOR SELECT
  TO anon, authenticated
  USING (status = 'approved' AND starts_at <= now() AND now() < ends_at);

CREATE POLICY sponsored_discovery_placements_staff_read
  ON public.sponsored_discovery_placements
  FOR SELECT
  TO authenticated
  USING (public.has_staff_permission(auth.uid(), 'admin.map_campaign.manage'));

CREATE POLICY sponsored_discovery_placements_staff_mutation
  ON public.sponsored_discovery_placements
  FOR ALL
  TO authenticated
  USING (public.has_staff_permission(auth.uid(), 'admin.map_campaign.manage'))
  WITH CHECK (public.has_staff_permission(auth.uid(), 'admin.map_campaign.manage'));

REVOKE ALL ON TABLE public.sponsored_discovery_placement_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.sponsored_discovery_placement_events TO authenticated, service_role;

CREATE POLICY sponsored_discovery_placement_events_staff_read
  ON public.sponsored_discovery_placement_events
  FOR SELECT
  TO authenticated
  USING (public.has_staff_permission(auth.uid(), 'admin.map_campaign.manage'));
