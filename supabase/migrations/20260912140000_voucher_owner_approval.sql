-- Outlet managers may submit vouchers, but the HQ owner must approve them.
-- Nullable keeps existing vouchers valid; new writes always record the creator.
ALTER TABLE public.vouchers
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS vouchers_created_by_idx ON public.vouchers(created_by);

-- Existing vouchers have already passed the Vendor Owner stage. New Outlet
-- Manager submissions are explicitly moved to pending by the write boundary.
ALTER TABLE public.vouchers
  ADD COLUMN IF NOT EXISTS vendor_review_status varchar(24) NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS vendor_review_note text,
  ADD COLUMN IF NOT EXISTS vendor_reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vendor_reviewed_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vouchers_vendor_review_status_check') THEN
    ALTER TABLE public.vouchers ADD CONSTRAINT vouchers_vendor_review_status_check
      CHECK (vendor_review_status IN ('pending', 'approved', 'rejected'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS vouchers_vendor_review_status_idx
  ON public.vouchers(vendor_id, vendor_review_status, review_status);
