-- Migration 013 — unified content review workflow
-- Existing records remain publishable; new or edited catalogue records require review.

ALTER TABLE outlets
  ADD COLUMN IF NOT EXISTS review_status VARCHAR(24) NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS review_note TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS review_status VARCHAR(24) NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS review_note TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

ALTER TABLE vouchers
  ADD COLUMN IF NOT EXISTS review_status VARCHAR(24) NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS review_note TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'outlets_review_status_check') THEN
    ALTER TABLE outlets ADD CONSTRAINT outlets_review_status_check
      CHECK (review_status IN ('pending_review','approved','change_requested','rejected'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_review_status_check') THEN
    ALTER TABLE products ADD CONSTRAINT products_review_status_check
      CHECK (review_status IN ('pending_review','approved','change_requested','rejected'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vouchers_review_status_check') THEN
    ALTER TABLE vouchers ADD CONSTRAINT vouchers_review_status_check
      CHECK (review_status IN ('pending_review','approved','change_requested','rejected'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_outlets_review_status ON outlets(review_status);
CREATE INDEX IF NOT EXISTS idx_products_review_status ON products(review_status);
CREATE INDEX IF NOT EXISTS idx_vouchers_review_status ON vouchers(review_status);

CREATE TABLE IF NOT EXISTS content_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(20) NOT NULL CHECK (entity_type IN ('outlet','product','voucher')),
  entity_id UUID NOT NULL,
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  reviewer_id UUID REFERENCES users(id),
  action VARCHAR(24) NOT NULL CHECK (action IN ('submitted','approved','change_requested','rejected')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_reviews_entity ON content_reviews(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_reviews_vendor ON content_reviews(vendor_id, created_at DESC);

ALTER TABLE content_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS content_reviews_admin_read ON content_reviews;
CREATE POLICY content_reviews_admin_read ON content_reviews
  FOR SELECT USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS content_reviews_admin_insert ON content_reviews;
CREATE POLICY content_reviews_admin_insert ON content_reviews
  FOR INSERT WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS outlets_public_read ON outlets;
CREATE POLICY outlets_public_read ON outlets
  FOR SELECT USING (
    (status = 'active' AND review_status = 'approved')
    OR EXISTS (SELECT 1 FROM vendors v WHERE v.id = outlets.vendor_id
               AND (v.owner_id = auth.uid() OR is_admin(auth.uid())))
    OR EXISTS (SELECT 1 FROM outlet_managers om WHERE om.outlet_id = outlets.id AND om.user_id = auth.uid())
  );

DROP POLICY IF EXISTS products_public_read ON products;
CREATE POLICY products_public_read ON products
  FOR SELECT USING (
    (status = 'active' AND review_status = 'approved')
    OR EXISTS (SELECT 1 FROM vendors v WHERE v.id = products.vendor_id
               AND (v.owner_id = auth.uid() OR is_admin(auth.uid())))
  );

DROP POLICY IF EXISTS vouchers_public_read ON vouchers;
CREATE POLICY vouchers_public_read ON vouchers
  FOR SELECT USING (is_active = true AND review_status = 'approved');

COMMENT ON COLUMN products.review_status IS 'Marketplace publication review state; status remains operational state.';
COMMENT ON COLUMN outlets.review_status IS 'Marketplace publication review state; status remains operational state.';
COMMENT ON COLUMN vouchers.review_status IS 'Marketplace publication review state; is_active remains operational state.';
