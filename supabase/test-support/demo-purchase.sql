-- DEVELOPMENT / STAGING TEST SUPPORT ONLY.
--
-- This file is intentionally outside supabase/migrations. Install it only in a
-- disposable local database or isolated staging project after applying the
-- canonical production migrations. It creates paid mock orders without a real
-- payment provider and must never be installed in production.
BEGIN;

INSERT INTO public.platform_settings (key, value, description)
VALUES ('demo.mode', 'true', 'Enables explicitly installed development-only tools')
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    description = EXCLUDED.description,
    updated_at = NOW();

CREATE OR REPLACE FUNCTION public.create_demo_purchase(
  p_user_id UUID,
  p_product_id UUID,
  p_affiliate_click_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_product RECORD;
  v_order_id UUID;
  v_amount NUMERIC(12,2);
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'demo_purchase_service_required';
  END IF;

  SELECT id, name, base_price, vendor_id, outlet_id, cover_url
    INTO v_product
    FROM public.products
   WHERE id = p_product_id
     AND status = 'active'
     AND review_status = 'approved'
     AND vendor_id IS NOT NULL
     AND outlet_id IS NOT NULL
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'demo_product_not_purchasable';
  END IF;

  v_amount := ROUND(v_product.base_price::NUMERIC, 2);

  INSERT INTO public.orders(
    user_id,
    status,
    subtotal,
    discount_amount,
    total_amount,
    payment_method,
    paid_at,
    affiliate_click_id
  )
  VALUES (
    p_user_id,
    'paid',
    v_amount,
    0,
    v_amount,
    'mock_card',
    NOW(),
    p_affiliate_click_id
  )
  RETURNING id INTO v_order_id;

  INSERT INTO public.order_items(
    order_id,
    vendor_id,
    outlet_id,
    product_id,
    product_name,
    image_url,
    unit_price,
    quantity,
    line_total,
    fulfil_status
  )
  VALUES (
    v_order_id,
    v_product.vendor_id,
    v_product.outlet_id,
    v_product.id,
    v_product.name,
    v_product.cover_url,
    v_amount,
    1,
    v_amount,
    'fulfilled'
  );

  RETURN jsonb_build_object('order_id', v_order_id);
END;
$$;

REVOKE ALL ON FUNCTION public.create_demo_purchase(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_demo_purchase(UUID, UUID, UUID) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
