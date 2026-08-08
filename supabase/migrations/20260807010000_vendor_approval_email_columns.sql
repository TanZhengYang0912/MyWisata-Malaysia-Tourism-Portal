-- P4 — Member 4: tracking + audit trail for admin-composed vendor approval
-- (welcome) emails. Deliberately NOT a new vendors.status value — see
-- app/admin/vendors/page.tsx's new "Welcomed" tab, which is a UI-only split
-- of the existing 'approved' status by approval_email_sent_at IS [NOT] NULL.
-- vendors.status itself, and every exact-match site that depends on it
-- (RLS policies, lib/vendor-authorization.ts, lib/vendor-dashboard.ts, etc.),
-- is completely untouched by this feature.
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS approval_email_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approval_email_subject  TEXT,
  ADD COLUMN IF NOT EXISTS approval_email_body      TEXT;
