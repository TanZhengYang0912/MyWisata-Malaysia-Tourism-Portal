-- ============================================================
-- Migration 028 — Re-enable Row Level Security (close the data leak)
--
-- Root cause (confirmed live via pg_tables/pg_policies on the remote
-- project, which tracks its own migration history separate from this
-- repo's numbered files): two things compound the leak.
--   (a) 34 tables have rowsecurity = false outright (RLS never applies,
--       any policy on them is inert) -- orders, order_items, bookings,
--       users, wallets, chat_threads, chat_messages, support_tickets,
--       withdrawal_requests, vendors, outlets, products, etc.
--   (b) A migration named "add_demo_allow_all_policies" added explicit
--       TO anon USING (true) policies directly on users and
--       kyc_submissions -- these stay active even after RLS is turned
--       back on, so (a) alone is not a fix for those two tables.
--
-- This migration:
--   1. Re-enables RLS on every table found with rowsecurity = false.
--   2. Recreates orders_own_or_admin / order_items_own_or_vendor -- the
--      only two tables with zero policies at all (dropped at some point
--      to work around the 42P17 orders<->order_items mutual-recursion
--      bug) -- using SECURITY DEFINER helper functions so the cross-table
--      check no longer re-invokes the other table's RLS policy.
--   3. Drops the anon-open KYC policies entirely -- verified nothing in
--      the app needs anon access (upload/review routes already require
--      an authenticated session).
--   4. Replaces the anon-open users policies with one scoped to just
--      @demo.local accounts -- verified this is exactly (and only) what
--      GET /api/auth/demo-users needs for the login account picker.
--   Every other table's existing policy (003/007/008-style) was left
--   intact by whatever disabled RLS -- re-enabling RLS is sufficient to
--   reinstate those as-is.
-- ============================================================

-- 1. Re-enable RLS (idempotent -- safe if already enabled)

ALTER TABLE users                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences           ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_verifications        ENABLE ROW LEVEL SECURITY;
ALTER TABLE phone_verifications        ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_submissions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_ledger              ENABLE ROW LEVEL SECURITY;
ALTER TABLE withdrawal_requests        ENABLE ROW LEVEL SECURITY;
ALTER TABLE withdrawal_approvals       ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_destinations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_recommendations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendation_conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendation_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_rules           ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_links            ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications              ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_settings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys           ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE outlets                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE outlet_pages               ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE products                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants           ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_slots              ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items                ENABLE ROW LEVEL SECURITY;
ALTER TABLE vouchers                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_threads               ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages              ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets            ENABLE ROW LEVEL SECURITY;

-- 2. Recursion-safe helpers for the orders <-> order_items check.
--    SECURITY DEFINER + STABLE, same pattern as is_admin() -- queries run
--    inside these bypass RLS on the tables they touch, so referencing them
--    from a policy does not re-trigger that table's own RLS policy (which
--    is what caused the original 42P17 loop).

CREATE OR REPLACE FUNCTION public.order_has_vendor_item(p_order_id UUID, p_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM order_items oi
    JOIN vendors v ON v.id = oi.vendor_id
    WHERE oi.order_id = p_order_id AND v.owner_id = p_uid
  );
$$;

CREATE OR REPLACE FUNCTION public.order_owned_by(p_order_id UUID, p_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM orders o WHERE o.id = p_order_id AND o.user_id = p_uid
  );
$$;

GRANT EXECUTE ON FUNCTION order_has_vendor_item, order_owned_by TO authenticated, anon;

-- 3. Recreate the two policies that were dropped, now recursion-safe

DROP POLICY IF EXISTS orders_own_or_admin ON orders;
CREATE POLICY orders_own_or_admin ON orders
  FOR SELECT USING (
    user_id = auth.uid()
    OR is_admin(auth.uid())
    OR order_has_vendor_item(orders.id, auth.uid())
  );

DROP POLICY IF EXISTS order_items_own_or_vendor ON order_items;
CREATE POLICY order_items_own_or_vendor ON order_items
  FOR SELECT USING (
    order_owned_by(order_items.order_id, auth.uid())
    OR EXISTS (SELECT 1 FROM vendors v WHERE v.id = order_items.vendor_id AND v.owner_id = auth.uid())
    OR is_admin(auth.uid())
  );

-- 4. KYC_SUBMISSIONS -- drop the anon-open policies entirely.
--    Verified: app/api/kyc/upload/route.ts and app/api/admin/kyc/review/route.ts
--    both require an authenticated session already (auth.getUser() /
--    is_admin checks) -- nothing in the app needs anon access to this table.
--    The existing kyc_read_own_or_admin / kyc_insert_own / kyc_select_own
--    policies (for authenticated users) are untouched and remain correct.

DROP POLICY IF EXISTS allow_anon_select_kyc ON kyc_submissions;
DROP POLICY IF EXISTS allow_anon_insert_kyc ON kyc_submissions;
DROP POLICY IF EXISTS allow_anon_update_kyc ON kyc_submissions;

-- 5. USERS -- replace the anon-open policies with one scoped to demo
--    accounts only. Verified: GET /api/auth/demo-users is the sole anon
--    consumer (login page's account picker; comment there confirms it
--    relies on anon SELECT), and it only ever queries emails LIKE
--    '%@demo.local'. No route performs an anon UPDATE on users -- every
--    write path (profile/update, etc.) requires auth.getUser() first.

DROP POLICY IF EXISTS allow_anon_select_users ON users;
DROP POLICY IF EXISTS allow_anon_update_users ON users;
DROP POLICY IF EXISTS demo_login_can_list_users ON users;

DROP POLICY IF EXISTS demo_accounts_anon_read ON users;
CREATE POLICY demo_accounts_anon_read ON users
  FOR SELECT TO anon
  USING (email LIKE '%@demo.local');

-- 6. Sanity check (informational -- surfaces in migration output):
--    any table left with RLS off is a table this migration didn't cover.

DO $$
DECLARE
  v_off TEXT;
BEGIN
  SELECT string_agg(tablename, ', ') INTO v_off
  FROM pg_tables
  WHERE schemaname = 'public' AND rowsecurity = false;

  IF v_off IS NOT NULL THEN
    RAISE NOTICE 'Tables still without RLS: %', v_off;
  END IF;
END $$;
;
