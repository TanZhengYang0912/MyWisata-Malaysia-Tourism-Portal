-- 014 — Vendor requirements: outlet page builder, pricing, voucher rules and checkout methods

ALTER TABLE outlet_pages
  ADD COLUMN IF NOT EXISTS blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS font_family VARCHAR(120) DEFAULT 'Plus Jakarta Sans',
  ADD COLUMN IF NOT EXISTS gallery JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'price_rules'::regclass AND conname = 'price_rules_rule_type_check'
  ) THEN
    ALTER TABLE price_rules DROP CONSTRAINT price_rules_rule_type_check;
  END IF;
END $$;

ALTER TABLE price_rules
  ADD COLUMN IF NOT EXISTS bundle_product_ids UUID[];

ALTER TABLE price_rules
  ADD CONSTRAINT price_rules_rule_type_check
  CHECK (rule_type IN ('date_range','group_size','weekend','peak','off_peak','bundle','tiered'));

ALTER TABLE vouchers
  ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS buy_quantity INTEGER,
  ADD COLUMN IF NOT EXISTS free_quantity INTEGER;

ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_payment_method_check;

ALTER TABLE orders
  ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method IS NULL OR payment_method IN ('mock_card','stripe_card','ewallet','bank_transfer','wallet'));

ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS payments_method_check;

ALTER TABLE payments
  ADD CONSTRAINT payments_method_check
  CHECK (method IN ('mock_card','stripe_card','ewallet','bank_transfer','wallet','mock_fail'));

CREATE INDEX IF NOT EXISTS idx_price_rules_product_active ON price_rules(product_id, is_active);
CREATE INDEX IF NOT EXISTS idx_vouchers_product ON vouchers(product_id);

COMMENT ON COLUMN outlet_pages.blocks IS 'Ordered block-builder page configuration for this outlet.';
COMMENT ON COLUMN outlet_pages.gallery IS 'Ordered gallery image objects with url and alt text.';
COMMENT ON COLUMN vouchers.product_id IS 'Optional product targeted by a BOGO or product-specific voucher.';

CREATE OR REPLACE FUNCTION decrement_inventory(p_variant_id UUID, p_quantity INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE updated_rows INTEGER;
BEGIN
  IF p_quantity IS NULL OR p_quantity < 1 THEN RETURN FALSE; END IF;
  UPDATE inventory SET quantity = quantity - p_quantity, updated_at = NOW()
  WHERE variant_id = p_variant_id AND quantity - reserved >= p_quantity;
  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  RETURN updated_rows = 1;
END;
$$;
