CREATE OR REPLACE FUNCTION public.require_food_qr_before_fulfilment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_category_slug TEXT;
  v_product_type TEXT;
  v_requires_booking BOOLEAN;
BEGIN
  IF NEW.food_qr_scanned_at IS DISTINCT FROM OLD.food_qr_scanned_at
     AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'food_qr_scan_service_required';
  END IF;

  IF NEW.retail_qr_scanned_at IS DISTINCT FROM OLD.retail_qr_scanned_at
     AND (auth.role() IS DISTINCT FROM 'service_role'
       OR current_setting('app.retail_pickup_rpc', true) IS DISTINCT FROM 'on') THEN
    RAISE EXCEPTION 'retail_qr_scan_rpc_required';
  END IF;

  IF NEW.fulfil_status IS DISTINCT FROM OLD.fulfil_status AND NEW.fulfil_status = 'fulfilled' THEN
    SELECT category.slug, product.product_type, product.requires_booking
      INTO v_category_slug, v_product_type, v_requires_booking
      FROM public.products AS product
      JOIN public.categories AS category ON category.id = product.category_id
     WHERE product.id = NEW.product_id;

    IF v_category_slug = 'food' AND NEW.food_qr_scanned_at IS NULL THEN
      RAISE EXCEPTION 'food_qr_scan_required';
    END IF;

    IF v_category_slug = 'retail'
       AND v_product_type = 'product'
       AND v_requires_booking IS FALSE
       AND NEW.event_location_id IS NULL
       AND NEW.event_listing_id IS NULL
       AND NEW.slot_starts_at IS NULL
       AND NEW.retail_qr_scanned_at IS NULL THEN
      RAISE EXCEPTION 'retail_qr_scan_required';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.require_food_qr_before_fulfilment() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS order_items_require_food_qr_before_fulfilment ON public.order_items;
CREATE TRIGGER order_items_require_food_qr_before_fulfilment
  BEFORE UPDATE OF fulfil_status, food_qr_scanned_at, retail_qr_scanned_at ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.require_food_qr_before_fulfilment();

NOTIFY pgrst, 'reload schema';
