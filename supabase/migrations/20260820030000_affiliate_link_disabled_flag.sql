-- P4: adds the 'link_disabled_at_payout' flag_type — a live-found gap
-- (2026-08-20) where onOrderPaid() never re-checked affiliate_links.is_active,
-- so a click made before a link was disabled (e.g. an admin confirming a
-- fraud flag) could still pay out afterward if a legitimate different
-- buyer's purchase completed later. See lib/affiliate/attribution.ts's
-- LINK-DISABLED GUARD.
--
-- Same pattern as 037_affiliate_click_cap.sql / 20260801030000's
-- 'vendor_ineligible' addition (DROP + re-ADD, since a plain CHECK
-- constraint has no ADD VALUE the way an ENUM type does).

ALTER TABLE affiliate_fraud_flags
  DROP CONSTRAINT IF EXISTS affiliate_fraud_flags_flag_type_check;
ALTER TABLE affiliate_fraud_flags
  ADD CONSTRAINT affiliate_fraud_flags_flag_type_check
  CHECK (flag_type IN (
    'self_referral', 'duplicate_attribution', 'expired_attribution',
    'click_velocity', 'zero_conversion', 'visitor_clustering', 'click_cap_reached',
    'vendor_ineligible', 'link_disabled_at_payout'
  ));
