-- 015 — Complete Supabase-backed cart, pricing and inventory alerts

ALTER TABLE vendor_recommendations
  ADD COLUMN IF NOT EXISTS state VARCHAR(100);

ALTER TABLE price_rules
  ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 0;

ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER NOT NULL DEFAULT 5;

ALTER TABLE inventory
  DROP CONSTRAINT IF EXISTS inventory_low_stock_threshold_check;

ALTER TABLE inventory
  ADD CONSTRAINT inventory_low_stock_threshold_check CHECK (low_stock_threshold >= 0);

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_price_rules_product_priority
  ON price_rules(product_id, is_active, priority DESC);

CREATE OR REPLACE FUNCTION decrement_inventory(p_variant_id UUID, p_quantity INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_rows INTEGER;
  v_product_id UUID;
  v_available INTEGER;
BEGIN
  IF p_quantity IS NULL OR p_quantity < 1 THEN RETURN FALSE; END IF;

  SELECT product_id INTO v_product_id FROM product_variants WHERE id = p_variant_id;

  UPDATE inventory
  SET quantity = quantity - p_quantity, updated_at = NOW()
  WHERE variant_id = p_variant_id AND quantity - reserved >= p_quantity;
  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  IF updated_rows <> 1 THEN RETURN FALSE; END IF;

  SELECT COALESCE(SUM(i.quantity - i.reserved), 0)::INTEGER
    INTO v_available
    FROM inventory i
    JOIN product_variants pv ON pv.id = i.variant_id
   WHERE pv.product_id = v_product_id AND pv.is_active = TRUE;

  UPDATE products
     SET status = CASE WHEN v_available <= 0 THEN 'inactive' ELSE status END,
         updated_at = NOW()
   WHERE id = v_product_id AND status <> 'archived';

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION review_vendor_recommendation(
  p_recommendation_id UUID,
  p_action TEXT,
  p_admin_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_status TEXT;
BEGIN
  IF p_admin_id <> auth.uid() OR NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only an authenticated admin can review recommendations';
  END IF;
  IF p_action NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid recommendation action';
  END IF;
  UPDATE vendor_recommendations
     SET status = p_action, reviewer_id = auth.uid(), reviewed_at = NOW()
   WHERE id = p_recommendation_id AND status = 'pending'
   RETURNING status INTO v_status;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Recommendation is not pending or does not exist'; END IF;
  RETURN jsonb_build_object('id', p_recommendation_id, 'status', v_status);
END;
$$;

GRANT EXECUTE ON FUNCTION review_vendor_recommendation(UUID, TEXT, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION redeem_voucher(
  p_voucher_id UUID,
  p_order_id UUID,
  p_user_id UUID,
  p_discount NUMERIC
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_max_uses INTEGER;
BEGIN
  IF p_user_id <> auth.uid() THEN RAISE EXCEPTION 'Voucher can only be redeemed by the signed-in customer'; END IF;
  SELECT max_uses INTO v_max_uses FROM vouchers WHERE id = p_voucher_id FOR UPDATE;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF v_max_uses IS NOT NULL AND (SELECT uses_count FROM vouchers WHERE id = p_voucher_id) >= v_max_uses THEN RETURN FALSE; END IF;
  UPDATE vouchers SET uses_count = uses_count + 1 WHERE id = p_voucher_id;
  INSERT INTO voucher_redemptions(voucher_id, order_id, user_id, discount)
  VALUES (p_voucher_id, p_order_id, p_user_id, p_discount);
  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION redeem_voucher(UUID, UUID, UUID, NUMERIC) TO authenticated;
