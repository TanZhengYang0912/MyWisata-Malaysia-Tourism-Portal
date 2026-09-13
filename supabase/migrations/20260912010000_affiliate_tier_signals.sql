-- Affiliate tier upgrade/downgrade: 3 more signals alongside the existing
-- conversion-count threshold (min_conversions) — sales amount, active
-- period (recency), and a fraud-rate cap. All admin-editable via the
-- existing tier editor (PATCH /api/admin/affiliate/tiers/[id]), same as
-- rate/min_conversions today. Rates themselves are UNCHANGED here — this
-- is purely about which signals feed tier resolution.

ALTER TABLE public.commission_rules
  ADD COLUMN IF NOT EXISTS min_sales_amount_sen BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS active_period_days INTEGER,
  ADD COLUMN IF NOT EXISTS max_fraud_rate_percent NUMERIC(5,2);

COMMENT ON COLUMN public.commission_rules.min_sales_amount_sen IS
  'Lifetime confirmed sales amount (RM sen) required to hold this tier. 0 = no requirement.';
COMMENT ON COLUMN public.commission_rules.active_period_days IS
  'Affiliate must have a CONFIRMED referral within this many days to hold this tier. NULL = no recency requirement (the floor tier stays reachable indefinitely).';
COMMENT ON COLUMN public.commission_rules.max_fraud_rate_percent IS
  'Max percentage of this affiliate''s clicks that may be fraud-flagged while still holding this tier. NULL = no cap.';

-- Seed sensible starting thresholds for the 2 higher live affiliate tiers —
-- admin can retune immediately from /admin/affiliate. 'standard' is left at
-- the column defaults (0 / NULL / NULL) so the floor tier is always
-- reachable, never gated by recency or fraud rate.
UPDATE public.commission_rules
   SET active_period_days = 90, min_sales_amount_sen = 50000, max_fraud_rate_percent = 20
 WHERE rule_type = 'affiliate' AND is_active = true AND tier_name = 'active';

UPDATE public.commission_rules
   SET active_period_days = 60, min_sales_amount_sen = 200000, max_fraud_rate_percent = 10
 WHERE rule_type = 'affiliate' AND is_active = true AND tier_name = 'top';
