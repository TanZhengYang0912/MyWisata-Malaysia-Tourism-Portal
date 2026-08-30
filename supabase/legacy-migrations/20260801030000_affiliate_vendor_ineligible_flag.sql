-- P4: team decision 2026-08-01 — vendor_owner and outlet_manager accounts
-- cannot earn affiliate commission at all. This adds the 'vendor_ineligible'
-- flag_type so a blocked commission (lib/affiliate/attribution.ts::onOrderPaid())
-- and the deactivation sweep (lib/affiliate/fraud.ts::runFraudSweep()) can
-- log a real, provable row instead of silently dropping the attribution.
--
-- Same pattern as 037_affiliate_click_cap.sql's 'click_cap_reached' addition
-- (DROP + re-ADD, since Postgres has no ADD VALUE for a plain CHECK
-- constraint the way it does for an ENUM type) and the migration this table
-- itself was superseded from (014_p4_depth.sql -> 037_affiliate_click_cap.sql).

ALTER TABLE affiliate_fraud_flags
  DROP CONSTRAINT IF EXISTS affiliate_fraud_flags_flag_type_check;
ALTER TABLE affiliate_fraud_flags
  ADD CONSTRAINT affiliate_fraud_flags_flag_type_check
  CHECK (flag_type IN (
    'self_referral', 'duplicate_attribution', 'expired_attribution',
    'click_velocity', 'zero_conversion', 'visitor_clustering', 'click_cap_reached',
    'vendor_ineligible'
  ));
