-- Keep voucher targets tied to the same vendor catalogue used by checkout.
-- This protects direct SQL/import paths in addition to the vendor API.

CREATE OR REPLACE FUNCTION public.validate_voucher_catalogue_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  product_vendor UUID;
  outlet_vendor UUID;
  product_is_sellable BOOLEAN;
BEGIN
  IF NEW.product_id IS NOT NULL THEN
    SELECT vendor_id INTO product_vendor
      FROM public.products
     WHERE id = NEW.product_id;
    IF product_vendor IS NULL OR product_vendor <> NEW.vendor_id THEN
      RAISE EXCEPTION 'voucher_product_vendor_mismatch';
    END IF;
  END IF;

  IF NEW.outlet_id IS NOT NULL THEN
    SELECT vendor_id INTO outlet_vendor
      FROM public.outlets
     WHERE id = NEW.outlet_id;
    IF outlet_vendor IS NULL OR outlet_vendor <> NEW.vendor_id THEN
      RAISE EXCEPTION 'voucher_outlet_vendor_mismatch';
    END IF;
  END IF;

  IF NEW.product_id IS NOT NULL AND NEW.outlet_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
        FROM public.products
       WHERE id = NEW.product_id
         AND outlet_id = NEW.outlet_id
      UNION ALL
      SELECT 1
        FROM public.outlet_offers
       WHERE product_id = NEW.product_id
         AND outlet_id = NEW.outlet_id
         AND status = 'active'
    ) INTO product_is_sellable;
    IF NOT product_is_sellable THEN
      RAISE EXCEPTION 'voucher_product_outlet_mismatch';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vouchers_catalogue_scope ON public.vouchers;
CREATE TRIGGER vouchers_catalogue_scope
  BEFORE INSERT OR UPDATE OF vendor_id, outlet_id, product_id ON public.vouchers
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_voucher_catalogue_scope();

REVOKE ALL ON FUNCTION public.validate_voucher_catalogue_scope() FROM PUBLIC;;
