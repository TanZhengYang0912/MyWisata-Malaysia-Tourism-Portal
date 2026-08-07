-- P4 — Member 4: audit trail for admin-composed vendor invite emails.
-- Custom subject/body path only (app/api/admin/vendors/recommendation-invite/route.ts) —
-- the legacy fixed-template path leaves these NULL.
ALTER TABLE public.vendor_recommendation_invites
  ADD COLUMN IF NOT EXISTS subject TEXT,
  ADD COLUMN IF NOT EXISTS body    TEXT;
