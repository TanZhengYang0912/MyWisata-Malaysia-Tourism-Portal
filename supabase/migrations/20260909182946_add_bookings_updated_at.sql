-- Keep booking mutations compatible with admit_ticket_pass, which records
-- the parent booking's last mutation time during check-in.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
