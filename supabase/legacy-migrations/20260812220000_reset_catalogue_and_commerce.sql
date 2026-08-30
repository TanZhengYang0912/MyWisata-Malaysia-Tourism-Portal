-- Penang place model & catalogue data reset — Phase 1: wipe.
-- See docs/plans/2026-08-12-2152-penang-place-model-and-data-reset.md §3/§D6.
-- users, roles, categories, platform_settings, chatbot_kb_documents,
-- geocode_cache, email_outbox, audit_logs are explicitly preserved.
--
-- Order is a topological sort of every NO ACTION/RESTRICT foreign key found
-- against the live schema (rehearsed via BEGIN...ROLLBACK before this file
-- was written — plain listing order was NOT delete-safe, see plan §3 note).

BEGIN;

-- Tables not in original scope but holding NO ACTION FKs into wiped tables.
-- user_roles: scoped (vendor/outlet) grants are meaningless once their
-- vendor/outlet is gone — deleted, not nulled (nulling collides with the
-- idx_user_roles_unique_global partial unique index). Global roles untouched.
DELETE FROM user_roles WHERE outlet_id IS NOT NULL OR vendor_id IS NOT NULL;
-- chat_threads.outlet_id is NOT NULL — every thread is outlet-scoped, so all
-- go; chat_messages/chat_reports cascade from chat_threads.
DELETE FROM chat_threads;
-- share_events.affiliate_id is nullable — clear the dangling reference,
-- keep the share_events row itself.
UPDATE share_events SET affiliate_id = NULL WHERE affiliate_id IS NOT NULL;

-- Layer A — transactional
DELETE FROM reviews;
DELETE FROM bookings;
DELETE FROM refunds;
DELETE FROM affiliate_attributions;
DELETE FROM recommendation_commissions;
DELETE FROM recommendation_conversions;
DELETE FROM payments;
DELETE FROM voucher_redemptions;
DELETE FROM order_items;
DELETE FROM orders;
DELETE FROM affiliate_clicks;
DELETE FROM affiliate_fraud_flags;
DELETE FROM affiliate_links;
DELETE FROM payout_transactions;
DELETE FROM wallet_adjustments;
DELETE FROM wallet_transactions;
DELETE FROM withdrawal_requests;
DELETE FROM payout_destinations;
DELETE FROM wallet_ledger;
DELETE FROM wallets;
DELETE FROM payment_events;
DELETE FROM voucher_holds;
DELETE FROM voucher_events;
DELETE FROM checkout_wallet_reservations;
DELETE FROM checkout_reservations;
DELETE FROM checkout_sessions;
DELETE FROM cart_items;
DELETE FROM carts;
DELETE FROM digital_entitlements;
DELETE FROM content_reviews;
DELETE FROM user_interactions;
DELETE FROM recommendation_snapshots;
DELETE FROM monthly_payout_reports;
DELETE FROM withdrawal_approvals;
DELETE FROM withdrawal_risk_assessments;
DELETE FROM wallet_moderation_attempts;

-- Layer B — catalogue
DELETE FROM customer_wishlists;
DELETE FROM customer_saved_destinations;
DELETE FROM outlet_offers;
DELETE FROM inventory;
DELETE FROM booking_slots;
DELETE FROM price_rules;
DELETE FROM product_variants;
DELETE FROM vouchers;
DELETE FROM vendor_voucher_csv_drafts;
DELETE FROM products;
DELETE FROM outlet_pages;
DELETE FROM outlet_manager_invitations;
DELETE FROM outlet_managers;
DELETE FROM outlets;
DELETE FROM vendor_documents;
DELETE FROM vendor_onboarding_profiles;
DELETE FROM vendor_recommendation_claims;
DELETE FROM vendor_recommendation_invites;
DELETE FROM vendor_recommendations;
DELETE FROM vendors;

-- Post-condition: fail loudly rather than leave a half-empty database.
DO $$
DECLARE n INTEGER;
BEGIN
  SELECT count(*) INTO n FROM products;
  IF n <> 0 THEN RAISE EXCEPTION 'reset incomplete: % products remain', n; END IF;

  SELECT count(*) INTO n FROM vendors;
  IF n <> 0 THEN RAISE EXCEPTION 'reset incomplete: % vendors remain', n; END IF;

  SELECT count(*) INTO n FROM orders;
  IF n <> 0 THEN RAISE EXCEPTION 'reset incomplete: % orders remain', n; END IF;

  SELECT count(*) INTO n FROM users;
  IF n = 0 THEN RAISE EXCEPTION 'reset destroyed users — restore from dump'; END IF;
END $$;

COMMIT;
