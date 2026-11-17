-- Event staff links per stall (docs/plans/2026-11-17-1620-event-staff-per-stall-links.md).
-- A staff link and membership now belong to one stall: vendor × event location.
-- Someone who joins through the Bangsar link scans only at Bangsar. Access ends
-- with the stall's last day; that is derived at read time, never stored.

ALTER TABLE public.event_staff_links ADD COLUMN event_location_id UUID;
ALTER TABLE public.event_staff_members ADD COLUMN event_location_id UUID;

-- Event-wide rows from the first version have no stall to map to. The owner
-- chose to clear them (2026-11-17); audit_logs keeps their history.
DELETE FROM public.event_staff_members WHERE event_location_id IS NULL;
DELETE FROM public.event_staff_links WHERE event_location_id IS NULL;

ALTER TABLE public.event_staff_links ALTER COLUMN event_location_id SET NOT NULL;
ALTER TABLE public.event_staff_members ALTER COLUMN event_location_id SET NOT NULL;

-- Lets the composite keys below prove the stall belongs to the row's event.
CREATE UNIQUE INDEX IF NOT EXISTS promotion_campaign_locations_id_campaign
  ON public.promotion_campaign_locations (id, campaign_id);

ALTER TABLE public.event_staff_links
  ADD CONSTRAINT event_staff_links_location_fkey
  FOREIGN KEY (event_location_id, campaign_id)
  REFERENCES public.promotion_campaign_locations (id, campaign_id) ON DELETE CASCADE;
ALTER TABLE public.event_staff_members
  ADD CONSTRAINT event_staff_members_location_fkey
  FOREIGN KEY (event_location_id, campaign_id)
  REFERENCES public.promotion_campaign_locations (id, campaign_id) ON DELETE CASCADE;

-- One usable link per stall; rotation revokes the old row, then inserts.
DROP INDEX public.event_staff_links_one_active;
CREATE UNIQUE INDEX event_staff_links_one_active
  ON public.event_staff_links (vendor_id, event_location_id) WHERE revoked_at IS NULL;

-- One membership per person per stall; also keeps joining idempotent.
ALTER TABLE public.event_staff_members DROP CONSTRAINT event_staff_members_one_per_person;
ALTER TABLE public.event_staff_members
  ADD CONSTRAINT event_staff_members_one_per_person UNIQUE (vendor_id, event_location_id, user_id);

NOTIFY pgrst, 'reload schema';
