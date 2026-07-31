-- Private, resumable voucher CSV builder documents.
CREATE TABLE IF NOT EXISTS public.vendor_voucher_csv_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Untitled voucher batch',
  document JSONB NOT NULL DEFAULT '{}'::jsonb,
  draft_version INTEGER NOT NULL DEFAULT 1 CHECK (draft_version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS vendor_voucher_csv_drafts_vendor_updated_idx
  ON public.vendor_voucher_csv_drafts (vendor_id, updated_at DESC);

ALTER TABLE public.vendor_voucher_csv_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vendor_voucher_csv_drafts_service_only ON public.vendor_voucher_csv_drafts;
CREATE POLICY vendor_voucher_csv_drafts_service_only
  ON public.vendor_voucher_csv_drafts
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON public.vendor_voucher_csv_drafts FROM anon, authenticated;
