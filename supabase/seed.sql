-- ============================================================
-- Demo Seed Data — Reset with: supabase db reset
-- Run after: supabase db push (which applies migrations)
-- ============================================================

-- ── Roles ──────────────────────────────────────────────────
INSERT INTO roles (name, description) VALUES
  ('super_admin',    'Full platform access'),
  ('approver',       'Can approve/reject wallet withdrawals'),
  ('vendor_owner',   'Manages vendor account and all outlets'),
  ('outlet_manager', 'Manages assigned outlet only'),
  ('customer',       'Browsing and purchasing customer')
ON CONFLICT (name) DO NOTHING;

-- ── Categories ─────────────────────────────────────────────
INSERT INTO categories (id, name, slug, icon, sort_order) VALUES
  ('11111111-0000-0000-0000-000000000001', 'Food & Dining',       'food',          'utensils',    1),
  ('11111111-0000-0000-0000-000000000002', 'Nature & Hiking',     'nature',        'tree-pine',   2),
  ('11111111-0000-0000-0000-000000000003', 'Cultural & Heritage', 'cultural',      'landmark',    3),
  ('11111111-0000-0000-0000-000000000004', 'Adventure Sports',    'adventure',     'mountain',    4),
  ('11111111-0000-0000-0000-000000000005', 'Wellness & Spa',      'wellness',      'heart',       5),
  ('11111111-0000-0000-0000-000000000006', 'Shopping',            'shopping',      'shopping-bag',6),
  ('11111111-0000-0000-0000-000000000007', 'Family Friendly',     'family',        'baby',        7),
  ('11111111-0000-0000-0000-000000000008', 'Accommodation',       'accommodation', 'hotel',       8)
ON CONFLICT DO NOTHING;

-- ── Demo Users (email/password managed by Supabase Auth seed or test accounts) ─
-- NOTE: In local dev, create these via Supabase Auth dashboard or CLI
-- then the trigger will populate public.users automatically.
-- The UUIDs below must match the auth.users IDs you create.

-- For CI / demo resets, insert directly (bypassing auth trigger):
INSERT INTO users (id, email, full_name, kyc_status, email_verified_at, phone_verified_at, profile_completed_at) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@demo.local',           'Super Admin',       'approved', NOW(), NOW(), NOW()),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'approver@demo.local',        'Wallet Approver',   'approved', NOW(), NOW(), NOW()),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'vendor.owner@demo.local',    'Vendor Owner Ali',  'approved', NOW(), NOW(), NOW()),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'outlet.manager@demo.local',  'Outlet Manager Mei','approved', NOW(), NOW(), NOW()),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'customer1@demo.local',       'Customer Alice',    'approved', NOW(), NOW(), NOW()),
  ('aaaaaaaa-0000-0000-0000-000000000006', 'customer2@demo.local',       'Customer Bob',      'pending',  NOW(), NOW(), NULL),
  ('aaaaaaaa-0000-0000-0000-000000000007', 'customer3@demo.local',       'Customer Carol',    'unverified',NOW(), NULL, NULL),
  ('aaaaaaaa-0000-0000-0000-000000000008', 'customer4@demo.local',       'Customer Dave',     'unverified',NOW(), NULL, NULL),
  ('aaaaaaaa-0000-0000-0000-000000000009', 'manager.klcc@demo.local',    'Outlet Manager Hana','approved', NOW(), NOW(), NOW()),
  ('aaaaaaaa-0000-0000-0000-000000000010', 'manager.georgetown@demo.local','Outlet Manager Ravi','approved', NOW(), NOW(), NOW()),
  ('aaaaaaaa-0000-0000-0000-000000000011', 'manager.batu@demo.local',     'Outlet Manager Siti','approved', NOW(), NOW(), NOW()),
  ('aaaaaaaa-0000-0000-0000-000000000012', 'manager.melaka@demo.local',   'Outlet Manager Lim', 'approved', NOW(), NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
  full_name            = EXCLUDED.full_name,
  kyc_status           = EXCLUDED.kyc_status,
  email_verified_at    = EXCLUDED.email_verified_at,
  phone_verified_at    = EXCLUDED.phone_verified_at,
  profile_completed_at = EXCLUDED.profile_completed_at,
  updated_at           = NOW();

-- ── User Roles ──────────────────────────────────────────────
INSERT INTO user_roles (user_id, role_id, vendor_id, outlet_id)
SELECT 'aaaaaaaa-0000-0000-0000-000000000001', id, NULL, NULL FROM roles WHERE name = 'super_admin'
ON CONFLICT DO NOTHING;
INSERT INTO user_roles (user_id, role_id, vendor_id, outlet_id)
SELECT 'aaaaaaaa-0000-0000-0000-000000000002', id, NULL, NULL FROM roles WHERE name = 'approver'
ON CONFLICT DO NOTHING;
-- vendor_owner & outlet_manager roles added after vendor/outlet are inserted below

INSERT INTO user_roles (user_id, role_id, vendor_id, outlet_id)
SELECT u.id, r.id, NULL, NULL FROM users u, roles r
WHERE u.email IN ('customer1@demo.local','customer2@demo.local','customer3@demo.local','customer4@demo.local')
AND r.name = 'customer'
ON CONFLICT DO NOTHING;

-- ── Wallets ─────────────────────────────────────────────────
INSERT INTO wallets (user_id, available_balance, pending_balance)
SELECT id, 0, 0 FROM users
ON CONFLICT (user_id) DO NOTHING;

-- Seed Alice with some demo wallet balance
UPDATE wallets SET available_balance = 45.00, pending_balance = 12.50
WHERE user_id = 'aaaaaaaa-0000-0000-0000-000000000005';

-- ── Vendors ─────────────────────────────────────────────────
INSERT INTO vendors (id, owner_id, name, slug, description, status) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000003',
   'Rasa Malaysia Kitchen', 'rasa-malaysia',
   'Authentic Malaysian cuisine in the heart of KL', 'approved'),
  ('bbbbbbbb-0000-0000-0000-000000000002',
   'aaaaaaaa-0000-0000-0000-000000000003',
   'Penang Heritage Tours', 'penang-heritage',
   'Guided cultural and heritage tours of Penang', 'approved'),
  ('bbbbbbbb-0000-0000-0000-000000000003',
   'aaaaaaaa-0000-0000-0000-000000000003',
   'Melaka River Cruise', 'melaka-river',
   'Scenic boat tours along the historic Melaka River', 'pending')
ON CONFLICT DO NOTHING;

-- ── Outlets ─────────────────────────────────────────────────
INSERT INTO outlets (id, vendor_id, name, slug, address, city, state, lat, lng) VALUES
  ('cccccccc-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000001',
   'Rasa Malaysia — Bukit Bintang', 'rasa-bukit-bintang',
   'Lot 10, Jalan Bukit Bintang', 'Kuala Lumpur', 'WP KL',
   3.1466, 101.7118),
  ('cccccccc-0000-0000-0000-000000000002',
   'bbbbbbbb-0000-0000-0000-000000000001',
   'Rasa Malaysia — KLCC', 'rasa-klcc',
   'Suria KLCC, Level 2', 'Kuala Lumpur', 'WP KL',
   3.1578, 101.7123),
  ('cccccccc-0000-0000-0000-000000000003',
   'bbbbbbbb-0000-0000-0000-000000000002',
   'Penang Heritage Tours — Georgetown', 'penang-georgetown',
   '123 Lebuh Armenian, Georgetown', 'George Town', 'Penang',
   5.4141, 100.3288),
  ('cccccccc-0000-0000-0000-000000000004',
   'bbbbbbbb-0000-0000-0000-000000000002',
   'Penang Heritage Tours — Batu Ferringhi', 'penang-batu-ferringhi',
   'Batu Ferringhi Beach Road', 'Batu Ferringhi', 'Penang',
   5.4675, 100.2461),
  ('cccccccc-0000-0000-0000-000000000005',
   'bbbbbbbb-0000-0000-0000-000000000003',
   'Melaka River Cruise — Quayside', 'melaka-quayside',
   'Jalan Merdeka, Bandar Hilir', 'Melaka', 'Melaka',
   2.1943, 102.2443)
ON CONFLICT DO NOTHING;

-- Back-fill vendor_owner / outlet_manager roles with scope
INSERT INTO user_roles (user_id, role_id, vendor_id, outlet_id)
SELECT 'aaaaaaaa-0000-0000-0000-000000000003', r.id, v.id, NULL
FROM roles r, vendors v WHERE r.name = 'vendor_owner'
ON CONFLICT DO NOTHING;

INSERT INTO user_roles (user_id, role_id, vendor_id, outlet_id)
SELECT 'aaaaaaaa-0000-0000-0000-000000000004', r.id, NULL, o.id
FROM roles r, outlets o WHERE r.name = 'outlet_manager' AND o.id = 'cccccccc-0000-0000-0000-000000000001'
ON CONFLICT DO NOTHING;

INSERT INTO user_roles (user_id, role_id, vendor_id, outlet_id)
SELECT managers.user_id, r.id, NULL, managers.outlet_id
FROM (VALUES
  ('aaaaaaaa-0000-0000-0000-000000000009'::uuid, 'cccccccc-0000-0000-0000-000000000002'::uuid),
  ('aaaaaaaa-0000-0000-0000-000000000010'::uuid, 'cccccccc-0000-0000-0000-000000000003'::uuid),
  ('aaaaaaaa-0000-0000-0000-000000000011'::uuid, 'cccccccc-0000-0000-0000-000000000004'::uuid),
  ('aaaaaaaa-0000-0000-0000-000000000012'::uuid, 'cccccccc-0000-0000-0000-000000000005'::uuid)
) AS managers(user_id, outlet_id), roles r
WHERE r.name = 'outlet_manager'
ON CONFLICT DO NOTHING;

-- The demo manager owns exactly one outlet. Other outlets can be assigned by the vendor owner.
INSERT INTO outlet_managers (user_id, outlet_id)
VALUES ('aaaaaaaa-0000-0000-0000-000000000004', 'cccccccc-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;

INSERT INTO outlet_managers (user_id, outlet_id) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000009', 'cccccccc-0000-0000-0000-000000000002'),
  ('aaaaaaaa-0000-0000-0000-000000000010', 'cccccccc-0000-0000-0000-000000000003'),
  ('aaaaaaaa-0000-0000-0000-000000000011', 'cccccccc-0000-0000-0000-000000000004'),
  ('aaaaaaaa-0000-0000-0000-000000000012', 'cccccccc-0000-0000-0000-000000000005')
ON CONFLICT DO NOTHING;

-- ── Products ─────────────────────────────────────────────────
INSERT INTO products (id, vendor_id, outlet_id, category_id, name, slug, product_type, requires_booking, base_price, status, tags) VALUES
  ('dddddddd-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000001',
   'cccccccc-0000-0000-0000-000000000001',
   '11111111-0000-0000-0000-000000000001',
   'Nasi Lemak Set', 'nasi-lemak-set', 'food', FALSE, 18.00, 'active',
   ARRAY['rice','coconut','local']),
  ('dddddddd-0000-0000-0000-000000000002',
   'bbbbbbbb-0000-0000-0000-000000000001',
   'cccccccc-0000-0000-0000-000000000002',
   '11111111-0000-0000-0000-000000000001',
   'Laksa Penang', 'laksa-penang', 'food', FALSE, 14.50, 'active',
   ARRAY['noodles','spicy','penang']),
  ('dddddddd-0000-0000-0000-000000000003',
   'bbbbbbbb-0000-0000-0000-000000000002',
   'cccccccc-0000-0000-0000-000000000003',
   '11111111-0000-0000-0000-000000000003',
   'Georgetown Heritage Walk (2h)', 'georgetown-heritage-walk', 'activity', TRUE, 55.00, 'active',
   ARRAY['history','walking','guided']),
  ('dddddddd-0000-0000-0000-000000000004',
   'bbbbbbbb-0000-0000-0000-000000000002',
   'cccccccc-0000-0000-0000-000000000004',
   '11111111-0000-0000-0000-000000000004',
   'Batu Ferringhi Sunset Kayak', 'batu-ferringhi-kayak', 'activity', TRUE, 85.00, 'active',
   ARRAY['water','sunset','adventure']),
  ('dddddddd-0000-0000-0000-000000000005',
   'bbbbbbbb-0000-0000-0000-000000000003',
   'cccccccc-0000-0000-0000-000000000005',
   '11111111-0000-0000-0000-000000000003',
   'Melaka River Night Cruise', 'melaka-river-cruise', 'activity', TRUE, 35.00, 'active',
   ARRAY['river','history','night'])
ON CONFLICT DO NOTHING;

-- ── Variants ─────────────────────────────────────────────────
INSERT INTO product_variants (id, product_id, name, price_offset, is_default) VALUES
  ('eeeeeeee-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000001','Standard', 0, TRUE),
  ('eeeeeeee-0000-0000-0000-000000000002','dddddddd-0000-0000-0000-000000000002','Standard', 0, TRUE),
  ('eeeeeeee-0000-0000-0000-000000000003','dddddddd-0000-0000-0000-000000000003','Adult',    0, TRUE),
  ('eeeeeeee-0000-0000-0000-000000000004','dddddddd-0000-0000-0000-000000000003','Child',  -20, FALSE),
  ('eeeeeeee-0000-0000-0000-000000000005','dddddddd-0000-0000-0000-000000000004','Adult',    0, TRUE),
  ('eeeeeeee-0000-0000-0000-000000000006','dddddddd-0000-0000-0000-000000000004','Child',  -30, FALSE),
  ('eeeeeeee-0000-0000-0000-000000000007','dddddddd-0000-0000-0000-000000000005','Adult',    0, TRUE),
  ('eeeeeeee-0000-0000-0000-000000000008','dddddddd-0000-0000-0000-000000000005','Child',  -15, FALSE)
ON CONFLICT DO NOTHING;

-- ── Inventory ────────────────────────────────────────────────
INSERT INTO inventory (variant_id, quantity) VALUES
  ('eeeeeeee-0000-0000-0000-000000000001', 999),
  ('eeeeeeee-0000-0000-0000-000000000002', 999)
ON CONFLICT DO NOTHING;

-- ── Booking Slots ────────────────────────────────────────────
INSERT INTO booking_slots (id, product_id, outlet_id, starts_at, ends_at, capacity, booked, status) VALUES
  ('ffffffff-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000003','cccccccc-0000-0000-0000-000000000003',
   NOW() + INTERVAL '1 day' + TIME '09:00', NOW() + INTERVAL '1 day' + TIME '11:00', 12, 4, 'available'),
  ('ffffffff-0000-0000-0000-000000000002','dddddddd-0000-0000-0000-000000000003','cccccccc-0000-0000-0000-000000000003',
   NOW() + INTERVAL '2 days' + TIME '14:00', NOW() + INTERVAL '2 days' + TIME '16:00', 12, 12, 'full'),
  ('ffffffff-0000-0000-0000-000000000003','dddddddd-0000-0000-0000-000000000004','cccccccc-0000-0000-0000-000000000004',
   NOW() + INTERVAL '1 day' + TIME '17:00', NOW() + INTERVAL '1 day' + TIME '19:00', 8, 2, 'available'),
  ('ffffffff-0000-0000-0000-000000000004','dddddddd-0000-0000-0000-000000000005','cccccccc-0000-0000-0000-000000000005',
   NOW() + INTERVAL '1 day' + TIME '20:00', NOW() + INTERVAL '1 day' + TIME '21:30', 20, 5, 'available')
ON CONFLICT DO NOTHING;

-- ── Vouchers ─────────────────────────────────────────────────
INSERT INTO vouchers (vendor_id, code, name, voucher_type, discount_value, min_spend, max_uses, valid_until) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001','WELCOME10','Welcome 10% Off','percent',10,30,100,NOW()+INTERVAL '30 days'),
  ('bbbbbbbb-0000-0000-0000-000000000002','TOUR20','RM20 Off Tours','fixed',20,80,50,NOW()+INTERVAL '30 days'),
  ('bbbbbbbb-0000-0000-0000-000000000001','EXPIRED','Expired Voucher','percent',5,0,100,NOW()-INTERVAL '1 day'),
  ('bbbbbbbb-0000-0000-0000-000000000003','RIVER15','River Cruise 15%','percent',15,35,30,NOW()+INTERVAL '14 days')
ON CONFLICT DO NOTHING;

-- ── User Preferences ─────────────────────────────────────────
INSERT INTO user_preferences (user_id, interest_tags, travel_style, budget_range, preferred_radius_km) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000005',
   ARRAY['food','cultural','nature'], 'mid_range', '20_80', 20),
  ('aaaaaaaa-0000-0000-0000-000000000006',
   ARRAY['adventure','wellness'], 'budget', 'under_20', 10)
ON CONFLICT (user_id) DO NOTHING;

-- ── Affiliate Links ───────────────────────────────────────────
INSERT INTO affiliate_links (user_id, affiliate_code) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000005', 'AF-ALICE1'),
  ('aaaaaaaa-0000-0000-0000-000000000006', 'AF-BOB001')
ON CONFLICT DO NOTHING;

-- ── FAQ Knowledge Base ───────────────────────────────────────
INSERT INTO chatbot_kb_documents (title, body, keywords, category) VALUES
  ('How to earn rewards?',
   'You can earn rewards by recommending vendors or sharing affiliate links. Complete your verified profile first to unlock earning.',
   ARRAY['earn','reward','money','how'], 'rewards'),
  ('How do affiliate links work?',
   'After KYC verification, generate your unique link from any vendor page. When someone books via your link within 30 days, you earn a commission.',
   ARRAY['affiliate','link','commission','share'], 'affiliate'),
  ('Withdrawal timeline?',
   'Withdrawals are reviewed by an Approver within 24–48 hours. Requests above RM500 require dual approval. Funds clear to Available after 7 days.',
   ARRAY['withdraw','payout','how long','approval'], 'wallet'),
  ('How to book an activity?',
   'Browse activities, select a time slot, add to cart, and checkout. You will receive a QR code booking confirmation.',
   ARRAY['book','activity','slot','how'], 'booking'),
  ('KYC verification?',
   'Go to Profile > Verification. Upload a government-issued ID. Our team reviews within 24–48 hours. KYC is required for withdrawals.',
   ARRAY['kyc','verify','identity','document'], 'account')
ON CONFLICT DO NOTHING;

-- ── Platform Settings ─────────────────────────────────────────
INSERT INTO platform_settings (key, value, description) VALUES
  ('wallet.clearance_days',    '7',    'Days before pending reward clears to available'),
  ('withdrawal.high_value_rm', '500',  'Amount (RM) requiring dual approval'),
  ('withdrawal.pending_hours', '48',   'Hours before auto-escalate to super admin'),
  ('affiliate.cookie_days',    '30',   'Attribution window in days'),
  ('demo.mode',                'true', 'Enables mock payment/OTP/KYC buttons')
ON CONFLICT (key) DO NOTHING;

-- ── Sample Completed Order (for review/wallet demo) ──────────
-- Alice bought Nasi Lemak on a previous date
INSERT INTO orders (id, user_id, status, subtotal, total_amount, payment_method, paid_at, completed_at) VALUES
  ('00000000-aaaa-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000005',
   'completed', 18.00, 18.00, 'mock_card', NOW()-INTERVAL '5 days', NOW()-INTERVAL '4 days')
ON CONFLICT DO NOTHING;

INSERT INTO order_items (id, order_id, vendor_id, outlet_id, product_id, variant_id, product_name, variant_name, unit_price, quantity, line_total, fulfil_status, fulfilled_at) VALUES
  ('00000000-bbbb-0000-0000-000000000001',
   '00000000-aaaa-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000001',
   'cccccccc-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000001',
   'eeeeeeee-0000-0000-0000-000000000001',
   'Nasi Lemak Set', 'Standard', 18.00, 1, 18.00, 'fulfilled', NOW()-INTERVAL '4 days')
ON CONFLICT DO NOTHING;

-- Wallet ledger entry (reward credit for demo)
INSERT INTO wallet_ledger (wallet_id, entry_type, amount, balance_type, reference_id, note)
SELECT w.id, 'reward_pending', 12.50, 'pending',
       '00000000-aaaa-0000-0000-000000000001',
       'Recommendation commission — first sale'
FROM wallets w WHERE w.user_id = 'aaaaaaaa-0000-0000-0000-000000000005';
