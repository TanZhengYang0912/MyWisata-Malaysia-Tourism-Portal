-- P4: finish the limited-affiliate click cap (§8.3).
--
-- A teammate's WIP commit (1caed97, "just left checkout part no complete")
-- started this in lib/affiliate/redirect.ts with a hardcoded 50 and no
-- observability. This migration provides the two schema pieces the
-- finished version needs:
--   1. platform_settings['affiliate.monthly_click_cap'] — the cap value,
--      no longer hardcoded (lib/affiliate/settings.ts::getMonthlyClickCap()).
--   2. affiliate_fraud_flags.flag_type CHECK constraint extended with
--      'click_cap_reached' — a silent cap is an unprovable one; hitting it
--      now logs an observable, admin-visible flag (same table/pattern as
--      self_referral, zero_conversion, etc. — migration 014).

INSERT INTO platform_settings (key, value)
SELECT 'affiliate.monthly_click_cap', '50'
WHERE NOT EXISTS (SELECT 1 FROM platform_settings WHERE key = 'affiliate.monthly_click_cap');

ALTER TABLE affiliate_fraud_flags
  DROP CONSTRAINT IF EXISTS affiliate_fraud_flags_flag_type_check;
ALTER TABLE affiliate_fraud_flags
  ADD CONSTRAINT affiliate_fraud_flags_flag_type_check
  CHECK (flag_type IN (
    'self_referral', 'duplicate_attribution', 'expired_attribution',
    'click_velocity', 'zero_conversion', 'visitor_clustering', 'click_cap_reached'
  ));
