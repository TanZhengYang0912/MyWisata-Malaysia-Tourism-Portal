-- Shared catalog products are scoped to an outlet through outlet_offers.
-- Booking slots must follow the same product/outlet relationship so a booking
-- can retain a product-specific calendar even when products.outlet_id is NULL.

CREATE OR REPLACE FUNCTION public.validate_booking_slot_outlet_product()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  product_outlet UUID;
  product_vendor UUID;
  outlet_vendor UUID;
BEGIN
  SELECT outlet_id, vendor_id
    INTO product_outlet, product_vendor
    FROM public.products
   WHERE id = NEW.product_id;

  SELECT vendor_id INTO outlet_vendor
    FROM public.outlets
   WHERE id = NEW.outlet_id;

  IF product_outlet IS NOT NULL THEN
    IF product_outlet <> NEW.outlet_id THEN
      RAISE EXCEPTION 'booking_slot_product_outlet_mismatch';
    END IF;
  ELSIF product_vendor IS NULL
     OR outlet_vendor IS NULL
     OR product_vendor <> outlet_vendor
     OR NOT EXISTS (
       SELECT 1
         FROM public.outlet_offers AS offer
        WHERE offer.product_id = NEW.product_id
          AND offer.outlet_id = NEW.outlet_id
          AND offer.status = 'active'
     ) THEN
    RAISE EXCEPTION 'booking_slot_product_outlet_mismatch';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_booking_slot_outlet_product ON public.booking_slots;
CREATE TRIGGER trg_validate_booking_slot_outlet_product
  BEFORE INSERT OR UPDATE OF product_id, outlet_id ON public.booking_slots
  FOR EACH ROW EXECUTE FUNCTION public.validate_booking_slot_outlet_product();

REVOKE ALL ON FUNCTION public.validate_booking_slot_outlet_product() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_booking_slot_outlet_product() TO service_role;

NOTIFY pgrst, 'reload schema';
