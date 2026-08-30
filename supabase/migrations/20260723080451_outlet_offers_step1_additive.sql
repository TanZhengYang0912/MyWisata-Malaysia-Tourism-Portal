ALTER TABLE public.products ALTER COLUMN outlet_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_product_outlet_vendor()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE outlet_vendor UUID;
BEGIN
  IF NEW.outlet_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT vendor_id INTO outlet_vendor FROM public.outlets WHERE id = NEW.outlet_id;
  IF outlet_vendor IS NULL OR outlet_vendor <> NEW.vendor_id THEN
    RAISE EXCEPTION 'product_outlet_vendor_mismatch';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.outlet_offers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  outlet_id  UUID NOT NULL REFERENCES public.outlets(id)  ON DELETE CASCADE,
  price      NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  status     VARCHAR(20) NOT NULL DEFAULT 'active'
             CHECK (status IN ('active', 'inactive', 'sold_out')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT outlet_offers_product_outlet_key UNIQUE (product_id, outlet_id)
);

CREATE INDEX IF NOT EXISTS idx_outlet_offers_outlet  ON public.outlet_offers(outlet_id);
CREATE INDEX IF NOT EXISTS idx_outlet_offers_product ON public.outlet_offers(product_id);

DROP TRIGGER IF EXISTS trg_outlet_offers_updated_at ON public.outlet_offers;
CREATE TRIGGER trg_outlet_offers_updated_at
  BEFORE UPDATE ON public.outlet_offers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.validate_offer_same_vendor()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_product_vendor UUID; v_outlet_vendor UUID;
BEGIN
  SELECT vendor_id INTO v_product_vendor FROM public.products WHERE id = NEW.product_id;
  SELECT vendor_id INTO v_outlet_vendor  FROM public.outlets  WHERE id = NEW.outlet_id;
  IF v_product_vendor IS NULL OR v_outlet_vendor IS NULL OR v_product_vendor <> v_outlet_vendor THEN
    RAISE EXCEPTION 'offer_vendor_mismatch';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_offer_same_vendor ON public.outlet_offers;
CREATE TRIGGER trg_validate_offer_same_vendor
  BEFORE INSERT OR UPDATE OF product_id, outlet_id ON public.outlet_offers
  FOR EACH ROW EXECUTE FUNCTION public.validate_offer_same_vendor();

ALTER TABLE public.outlet_offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS outlet_offers_public_read ON public.outlet_offers;
CREATE POLICY outlet_offers_public_read ON public.outlet_offers
  FOR SELECT TO anon, authenticated
  USING (
    status = 'active'
    AND EXISTS (
      SELECT 1 FROM public.products p
       WHERE p.id = outlet_offers.product_id
         AND p.status = 'active' AND p.review_status = 'approved'
    )
    AND EXISTS (
      SELECT 1 FROM public.outlets o
       WHERE o.id = outlet_offers.outlet_id AND o.status = 'active'
    )
  );

DROP POLICY IF EXISTS outlet_offers_vendor_owner ON public.outlet_offers;
CREATE POLICY outlet_offers_vendor_owner ON public.outlet_offers
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.outlets o JOIN public.vendors v ON v.id = o.vendor_id
       WHERE o.id = outlet_offers.outlet_id AND v.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.outlets o JOIN public.vendors v ON v.id = o.vendor_id
       WHERE o.id = outlet_offers.outlet_id AND v.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS outlet_offers_outlet_manager ON public.outlet_offers;
CREATE POLICY outlet_offers_outlet_manager ON public.outlet_offers
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.outlet_managers m
       WHERE m.outlet_id = outlet_offers.outlet_id AND m.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.outlet_managers m
       WHERE m.outlet_id = outlet_offers.outlet_id AND m.user_id = auth.uid()
    )
  );

ALTER TABLE public.inventory              ADD COLUMN IF NOT EXISTS outlet_id UUID REFERENCES public.outlets(id) ON DELETE CASCADE;
ALTER TABLE public.cart_items             ADD COLUMN IF NOT EXISTS outlet_id UUID REFERENCES public.outlets(id) ON DELETE CASCADE;
ALTER TABLE public.checkout_reservations  ADD COLUMN IF NOT EXISTS outlet_id UUID REFERENCES public.outlets(id) ON DELETE CASCADE;

UPDATE public.inventory i
   SET outlet_id = p.outlet_id
  FROM public.product_variants v
  JOIN public.products p ON p.id = v.product_id
 WHERE v.id = i.variant_id AND i.outlet_id IS NULL;

UPDATE public.cart_items c
   SET outlet_id = p.outlet_id
  FROM public.product_variants v
  JOIN public.products p ON p.id = v.product_id
 WHERE v.id = c.variant_id AND c.outlet_id IS NULL;

UPDATE public.checkout_reservations r
   SET outlet_id = p.outlet_id
  FROM public.product_variants v
  JOIN public.products p ON p.id = v.product_id
 WHERE v.id = r.variant_id AND r.outlet_id IS NULL;

ALTER TABLE public.inventory DROP CONSTRAINT IF EXISTS inventory_variant_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS inventory_variant_outlet_key
  ON public.inventory(variant_id, outlet_id);

CREATE INDEX IF NOT EXISTS idx_cart_items_outlet ON public.cart_items(outlet_id);;
