CREATE TABLE IF NOT EXISTS public.product_source_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL UNIQUE REFERENCES public.products(id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  source_type VARCHAR(30) NOT NULL CHECK (source_type IN ('official', 'licensed', 'marketplace')),
  source_page TEXT NOT NULL,
  source_image_url TEXT NOT NULL,
  price_reference_page TEXT,
  observed_at DATE NOT NULL,
  artist TEXT NOT NULL,
  license TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_source_evidence_vendor_idx
  ON public.product_source_evidence (vendor_id);

ALTER TABLE public.product_source_evidence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_source_evidence_vendor_owner ON public.product_source_evidence;
CREATE POLICY product_source_evidence_vendor_owner
  ON public.product_source_evidence
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.vendors v
    WHERE v.id = product_source_evidence.vendor_id
      AND v.owner_id = auth.uid()
  ));

DROP TRIGGER IF EXISTS trg_product_source_evidence_updated_at ON public.product_source_evidence;
CREATE TRIGGER trg_product_source_evidence_updated_at
  BEFORE UPDATE ON public.product_source_evidence
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
