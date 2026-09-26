-- Food orders must pass through the signed, outlet-bound food scanner before
-- any generic vendor endpoint can mark them fulfilled.
CREATE OR REPLACE FUNCTION public.require_food_qr_before_fulfilment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_category_slug TEXT;
BEGIN
  -- The timestamp is the database proof that the signed, outlet-bound scanner
  -- accepted the QR. Vendors must never be able to forge or clear it through
  -- the broad order_items update policy.
  IF NEW.food_qr_scanned_at IS DISTINCT FROM OLD.food_qr_scanned_at
     AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'food_qr_scan_service_required';
  END IF;

  IF NEW.fulfil_status IS DISTINCT FROM OLD.fulfil_status
     AND NEW.fulfil_status = 'fulfilled'
     AND NEW.food_qr_scanned_at IS NULL THEN
    SELECT category.slug
      INTO v_category_slug
      FROM public.products AS product
      JOIN public.categories AS category ON category.id = product.category_id
     WHERE product.id = NEW.product_id;

    IF v_category_slug = 'food' THEN
      RAISE EXCEPTION 'food_qr_scan_required';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.require_food_qr_before_fulfilment() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS order_items_require_food_qr_before_fulfilment ON public.order_items;
CREATE TRIGGER order_items_require_food_qr_before_fulfilment
  BEFORE UPDATE OF fulfil_status, food_qr_scanned_at ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.require_food_qr_before_fulfilment();
