-- Run this script in the Supabase SQL Editor to disable Row Level Security (RLS) on all tables.
-- Since the application uses a local localStorage-based mock auth, client-side queries
-- are treated as anonymous by Supabase. Disabling RLS allows these client-side queries to work.
--
-- Also drops the mutually-recursive orders ↔ order_items RLS policies that caused:
--   ERROR 42P17: infinite recursion detected in policy for relation "orders"

DROP POLICY IF EXISTS orders_own_or_admin      ON orders;
DROP POLICY IF EXISTS order_items_own_or_vendor ON order_items;

ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE roles DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences DISABLE ROW LEVEL SECURITY;
ALTER TABLE email_verifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE phone_verifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_submissions DISABLE ROW LEVEL SECURITY;
ALTER TABLE wallets DISABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_ledger DISABLE ROW LEVEL SECURITY;
ALTER TABLE withdrawal_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE withdrawal_approvals DISABLE ROW LEVEL SECURITY;
ALTER TABLE payout_destinations DISABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_recommendations DISABLE ROW LEVEL SECURITY;
ALTER TABLE recommendation_conversions DISABLE ROW LEVEL SECURITY;
ALTER TABLE recommendation_commissions DISABLE ROW LEVEL SECURITY;
ALTER TABLE commission_rules DISABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_links DISABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE platform_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys DISABLE ROW LEVEL SECURITY;
ALTER TABLE vendors DISABLE ROW LEVEL SECURITY;
ALTER TABLE outlets DISABLE ROW LEVEL SECURITY;
ALTER TABLE outlet_pages DISABLE ROW LEVEL SECURITY;
ALTER TABLE categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants DISABLE ROW LEVEL SECURITY;
ALTER TABLE booking_slots DISABLE ROW LEVEL SECURITY;
ALTER TABLE bookings DISABLE ROW LEVEL SECURITY;
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE order_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE vouchers DISABLE ROW LEVEL SECURITY;
ALTER TABLE chat_threads DISABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets DISABLE ROW LEVEL SECURITY;

-- Verify RLS is disabled
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
