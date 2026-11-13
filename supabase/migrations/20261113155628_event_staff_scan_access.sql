-- Event staff scan access (docs/plans/2026-11-13-1707-event-staff-scan-access.md).
-- A vendor owner shares one link per vendor × event (campaign). Anyone who
-- opens it, verifies an email and joins can resolve and collect that vendor's
-- event pickups at that event's locations, and nothing else. Access ends at
-- promotion_campaigns.ends_at; it is derived at read time, never stored.

CREATE TABLE public.event_staff_links (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id   UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.promotion_campaigns(id) ON DELETE CASCADE,
  created_by  UUID NOT NULL REFERENCES public.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at  TIMESTAMPTZ
);

-- One usable link per vendor × event; rotation revokes the old row, then inserts.
CREATE UNIQUE INDEX event_staff_links_one_active
  ON public.event_staff_links (vendor_id, campaign_id) WHERE revoked_at IS NULL;

CREATE TABLE public.event_staff_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id     UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  campaign_id   UUID NOT NULL REFERENCES public.promotion_campaigns(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  display_name  TEXT NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 80),
  joined_via    UUID REFERENCES public.event_staff_links(id) ON DELETE SET NULL,
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  removed_at    TIMESTAMPTZ,
  removed_by    UUID REFERENCES public.users(id),
  -- Also makes joining idempotent: a retry or double submit hits this key.
  CONSTRAINT event_staff_members_one_per_person UNIQUE (vendor_id, campaign_id, user_id)
);

-- Hot path: authorizeVendor looks up a caller's live memberships for one vendor.
CREATE INDEX event_staff_members_active_user
  ON public.event_staff_members (user_id, vendor_id) WHERE removed_at IS NULL;

-- Service-only, like event_pickup_codes: every read and write goes through an
-- API route after authorization. UPDATE is needed for revoke and remove.
ALTER TABLE public.event_staff_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_staff_members ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.event_staff_links FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.event_staff_members FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.event_staff_links TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.event_staff_members TO service_role;

NOTIFY pgrst, 'reload schema';
