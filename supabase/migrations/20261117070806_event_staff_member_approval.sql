-- Event staff owner approval (docs/plans/2026-11-17-1504-event-staff-approval-and-restore.md).
-- Joining through a staff link now creates a pending member; scan access starts
-- only once the vendor owner approves. Removal stays durable against the link:
-- only the owner can restore a removed member. History lives in audit_logs.
--
-- States: pending  = approved_at IS NULL     AND removed_at IS NULL
--         active   = approved_at IS NOT NULL AND removed_at IS NULL
--         removed  = removed_at IS NOT NULL

ALTER TABLE public.event_staff_members
  ADD COLUMN approved_at TIMESTAMPTZ,
  ADD COLUMN approved_by UUID REFERENCES public.users(id);

-- Members who joined before approval existed already had access; keep it.
UPDATE public.event_staff_members
  SET approved_at = joined_at
  WHERE approved_at IS NULL;

-- event_staff_members_active_user (removed_at IS NULL) still serves the
-- authorization lookup; the approved_at filter runs on its few matching rows.

NOTIFY pgrst, 'reload schema';
