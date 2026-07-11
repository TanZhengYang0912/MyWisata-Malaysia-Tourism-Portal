-- ============================================================
-- COMBINED MIGRATION SCRIPT
-- Step 1: Drop & recreate public schema
-- Step 2: Apply all 8 migrations in order
-- ============================================================

DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres, anon, authenticated, service_role;

-- ============================================================
-- 001_initial_schema.sql
-- ============================================================

-- ============================================================
-- Malaysia Tourism Portal — Initial Schema
-- 56 tables | Owner tags: P1 P2 P3 P4
-- Money convention: NUMERIC(12,2) in RM — only money.ts rounds
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- P1 — Platform, Identity & Communication
-- ============================================================

-- [P1-core] User accounts (links to Supabase auth.users via id)
CREATE TABLE users (
  id              UUID PRIMARY KEY,  -- same as auth.users.id
  email           VARCHAR(255) UNIQUE NOT NULL,
  full_name       VARCHAR(255),
  display_name    VARCHAR(100),
  bio             TEXT,
  avatar_url      TEXT,
  phone           VARCHAR(50),
  city            VARCHAR(100),
  country         VARCHAR(100) DEFAULT 'Malaysia',
  email_verified_at   TIMESTAMPTZ,
  phone_verified_at   TIMESTAMPTZ,
  profile_completed_at TIMESTAMPTZ,
  kyc_status      VARCHAR(20) NOT NULL DEFAULT 'unverified'
                    CHECK (kyc_status IN ('unverified','pending','approved','rejected')),
  status          VARCHAR(20) NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','suspended','deleted')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- [P1-core] Role dictionary
CREATE TABLE roles (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(50) UNIQUE NOT NULL,
    -- 'super_admin' | 'approver' | 'vendor_owner' | 'outlet_manager' | 'customer'
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- [P1-core] User↔Role binding with optional vendor/outlet scope
CREATE TABLE user_roles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id    INTEGER NOT NULL REFERENCES roles(id),
  vendor_id  UUID,   -- FK added after vendors table
  outlet_id  UUID,   -- FK added after outlets table
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, role_id, vendor_id, outlet_id)
);

-- [P1-mock] Email OTP log (demo: just record verified_at, no real OTP send)
CREATE TABLE email_verifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       VARCHAR(64),
  verified_at TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- [P1-mock] Phone OTP log (demo: fixed code 123456)
CREATE TABLE phone_verifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phone       VARCHAR(50) NOT NULL,
  demo_code   VARCHAR(10) DEFAULT '123456',
  verified_at TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- [P1-mock] KYC document submissions (mock: upload placeholder, admin manual review)
CREATE TABLE kyc_submissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_type   VARCHAR(50) NOT NULL DEFAULT 'national_id'
                    CHECK (document_type IN ('national_id','passport','driving_license')),
  document_url    TEXT,     -- placeholder URL or filename
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected')),
  reviewer_id     UUID REFERENCES users(id),
  rejection_reason TEXT,
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- [P1-core] In-app notifications (no push/email in demo)
CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        VARCHAR(50) NOT NULL,
    -- 'vendor_approved'|'kyc_approved'|'withdrawal_approved'|'new_message'|'order_paid'|...
  title       VARCHAR(255) NOT NULL,
  body        TEXT,
  link        TEXT,     -- internal route
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- [P1-core] Immutable audit trail for all approve/reject actions
CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID REFERENCES users(id),
  action      VARCHAR(100) NOT NULL,
    -- 'vendor.approved'|'kyc.rejected'|'withdrawal.approved'|...
  entity_type VARCHAR(50) NOT NULL,
  entity_id   UUID NOT NULL,
  before_data JSONB,
  after_data  JSONB,
  ip_address  INET,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- [P1-core] Customer↔Vendor chat threads
CREATE TABLE chat_threads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES users(id),
  outlet_id   UUID NOT NULL,  -- FK added after outlets
  status      VARCHAR(20) NOT NULL DEFAULT 'open'
                CHECK (status IN ('open','archived','closed')),
  last_message_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- [P1-core] Chat messages (text only in demo)
CREATE TABLE chat_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   UUID NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  sender_id   UUID NOT NULL REFERENCES users(id),
  body        TEXT NOT NULL,
  attachment_url TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- [P1-mock] Read receipts (record when thread opened)
CREATE TABLE chat_message_reads (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id),
  read_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (message_id, user_id)
);

-- [P1-mock] Chatbot FAQ sessions
CREATE TABLE chatbot_sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES users(id),
  session_key VARCHAR(64) UNIQUE,  -- for guest sessions
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at   TIMESTAMPTZ
);

-- [P1-mock] Chatbot message log
CREATE TABLE chatbot_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES chatbot_sessions(id) ON DELETE CASCADE,
  role        VARCHAR(10) NOT NULL CHECK (role IN ('user','bot')),
  body        TEXT NOT NULL,
  kb_matched  BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- [P1-mock] FAQ knowledge base (5–10 entries, no embeddings in demo)
CREATE TABLE chatbot_kb_documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       VARCHAR(255) NOT NULL,
  body        TEXT NOT NULL,
  keywords    TEXT[],   -- for keyword matching
  category    VARCHAR(50),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- [P1-later] RAG citation links (not used in demo)
CREATE TABLE chatbot_message_kb_refs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  UUID NOT NULL REFERENCES chatbot_messages(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES chatbot_kb_documents(id),
  score       NUMERIC(5,4),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- [P1-core] Support tickets (created when chatbot can't answer)
CREATE TABLE support_tickets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES users(id),
  session_id   UUID REFERENCES chatbot_sessions(id),
  subject      VARCHAR(255) NOT NULL,
  body         TEXT NOT NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open','in_progress','resolved','closed')),
  assigned_to  UUID REFERENCES users(id),
  resolved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- [P1-mock] Platform config key-value store
CREATE TABLE platform_settings (
  key         VARCHAR(100) PRIMARY KEY,
  value       TEXT NOT NULL,
  description TEXT,
  updated_by  UUID REFERENCES users(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- P2 — Vendor, Outlet & Catalogue
-- ============================================================

-- [P2-core] Product/activity categories
CREATE TABLE categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) UNIQUE NOT NULL,
  slug        VARCHAR(100) UNIQUE NOT NULL,
  icon        VARCHAR(50),   -- lucide icon name
  sort_order  INTEGER DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- [P2-core] Vendor accounts (pending admin approval)
CREATE TABLE vendors (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID NOT NULL REFERENCES users(id),
  name          VARCHAR(255) NOT NULL,
  slug          VARCHAR(100) UNIQUE NOT NULL,
  description   TEXT,
  logo_url      TEXT,
  cover_url     TEXT,
  business_type VARCHAR(50),
  status        VARCHAR(20) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','rejected','suspended')),
  rejection_reason TEXT,
  approved_by   UUID REFERENCES users(id),
  approved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- [P2-core] Physical outlets/branches of a vendor
CREATE TABLE outlets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id     UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  name          VARCHAR(255) NOT NULL,
  slug          VARCHAR(100) UNIQUE NOT NULL,
  address       TEXT,
  city          VARCHAR(100),
  state         VARCHAR(100),
  postcode      VARCHAR(20),
  country       VARCHAR(100) DEFAULT 'Malaysia',
  lat           NUMERIC(10,7),   -- GPS latitude
  lng           NUMERIC(10,7),   -- GPS longitude
  phone         VARCHAR(50),
  email         VARCHAR(255),
  operating_hours JSONB,   -- { mon: {open:'09:00', close:'18:00'}, ... }
  status        VARCHAR(20) NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','inactive','closed')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- [P2-mock] Outlet page customisation (basic hero/colour, no drag-drop builder)
CREATE TABLE outlet_pages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id      UUID NOT NULL UNIQUE REFERENCES outlets(id) ON DELETE CASCADE,
  hero_url       TEXT,
  brand_colour   VARCHAR(7),  -- hex #RRGGBB
  featured_ids   UUID[],      -- up to 4 product IDs
  seo_title      VARCHAR(255),
  seo_description TEXT,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- [P2-core] Outlet manager assignments
CREATE TABLE outlet_managers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id  UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (outlet_id, user_id)
);

-- [P2-core] Products and activities
CREATE TABLE products (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id        UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  outlet_id        UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  category_id      UUID REFERENCES categories(id),
  name             VARCHAR(255) NOT NULL,
  slug             VARCHAR(100) UNIQUE NOT NULL,
  description      TEXT,
  product_type     VARCHAR(20) NOT NULL DEFAULT 'product'
                     CHECK (product_type IN ('product','activity','experience','food','digital')),
  requires_booking BOOLEAN NOT NULL DEFAULT FALSE,
  base_price       NUMERIC(12,2) NOT NULL,  -- in RM
  currency         VARCHAR(3) NOT NULL DEFAULT 'MYR',
  cover_url        TEXT,
  status           VARCHAR(20) NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','inactive','archived')),
  tags             TEXT[],
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- [P2-core] Product variants (e.g., Adult/Child, Size S/M/L)
CREATE TABLE product_variants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name          VARCHAR(100) NOT NULL,  -- 'Adult', 'Child', 'Large'
  sku           VARCHAR(100),
  price_offset  NUMERIC(12,2) NOT NULL DEFAULT 0, -- added to base_price
  is_default    BOOLEAN NOT NULL DEFAULT FALSE,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order    INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- [P2-mock] Simple date-based or group price rules (complex rules deferred)
CREATE TABLE price_rules (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     UUID REFERENCES products(id) ON DELETE CASCADE,
  variant_id     UUID REFERENCES product_variants(id) ON DELETE CASCADE,
  rule_type      VARCHAR(30) NOT NULL
                   CHECK (rule_type IN ('date_range','group_size','weekend')),
  label          VARCHAR(100),
  multiplier     NUMERIC(5,4),   -- e.g. 0.9 for 10% off
  fixed_amount   NUMERIC(12,2),  -- alternative flat price
  valid_from     DATE,
  valid_until    DATE,
  min_quantity   INTEGER,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- [P2-core] Stock/inventory per variant
CREATE TABLE inventory (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id      UUID NOT NULL UNIQUE REFERENCES product_variants(id) ON DELETE CASCADE,
  quantity        INTEGER NOT NULL DEFAULT 0,
  reserved        INTEGER NOT NULL DEFAULT 0,  -- held in active carts/orders
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- [P2-core] Bookable time slots for activities
CREATE TABLE booking_slots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  outlet_id       UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  starts_at       TIMESTAMPTZ NOT NULL,
  ends_at         TIMESTAMPTZ NOT NULL,
  capacity        INTEGER NOT NULL DEFAULT 10,
  booked          INTEGER NOT NULL DEFAULT 0,
  price_override  NUMERIC(12,2),  -- overrides product base_price if set
  status          VARCHAR(20) NOT NULL DEFAULT 'available'
                    CHECK (status IN ('available','full','cancelled','expired')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- [P2-core] Vouchers / discount codes
CREATE TABLE vouchers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id      UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  outlet_id      UUID REFERENCES outlets(id),  -- null = all outlets
  code           VARCHAR(50) NOT NULL UNIQUE,
  name           VARCHAR(255) NOT NULL,
  voucher_type   VARCHAR(20) NOT NULL
                   CHECK (voucher_type IN ('percent','fixed','bogo')),
  discount_value NUMERIC(12,2) NOT NULL,  -- percent 0–100 or fixed RM amount
  min_spend      NUMERIC(12,2) DEFAULT 0,
  max_uses       INTEGER,  -- null = unlimited
  uses_count     INTEGER NOT NULL DEFAULT 0,
  valid_from     TIMESTAMPTZ,
  valid_until    TIMESTAMPTZ,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- [P2-mock] Vendor/outlet media assets (URL-based, no S3 upload in demo)
CREATE TABLE media_assets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id   UUID REFERENCES vendors(id) ON DELETE CASCADE,
  outlet_id   UUID REFERENCES outlets(id) ON DELETE CASCADE,
  product_id  UUID REFERENCES products(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  alt_text    VARCHAR(255),
  media_type  VARCHAR(20) DEFAULT 'image' CHECK (media_type IN ('image','video')),
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- P3 — Discovery, Recommendation & Growth
-- ============================================================

-- [P3-core] Customer preference survey results
CREATE TABLE user_preferences (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  interest_tags        TEXT[],
    -- ['nature','food','cultural','adventure','nightlife','wellness','shopping','family']
  travel_style         VARCHAR(30),
    -- 'budget'|'mid_range'|'luxury'|'business'|'family'
  budget_range         VARCHAR(20),
    -- 'under_20'|'20_80'|'80_200'|'200_plus'
  group_composition    TEXT[],
    -- ['solo','couple','friends','family','senior']
  wheelchair_accessible BOOLEAN DEFAULT FALSE,
  pet_friendly         BOOLEAN DEFAULT FALSE,
  preferred_radius_km  INTEGER DEFAULT 20,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- [P3-core] Community vendor recommendations by customers
CREATE TABLE vendor_recommendations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommender_id  UUID NOT NULL REFERENCES users(id),
  vendor_name     VARCHAR(255) NOT NULL,
  vendor_address  TEXT,
  description     TEXT,
  category_id     UUID REFERENCES categories(id),
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected','converted')),
  reviewer_id     UUID REFERENCES users(id),
  reviewed_at     TIMESTAMPTZ,
  rejection_reason TEXT,
  converted_vendor_id UUID REFERENCES vendors(id),  -- set on conversion
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- [P3-mock] Mock vendor onboarding conversion (admin button simulates first sale)
CREATE TABLE recommendation_conversions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id      UUID NOT NULL REFERENCES vendor_recommendations(id),
  converted_vendor_id    UUID NOT NULL REFERENCES vendors(id),
  first_sale_order_id    UUID,   -- FK added after orders
  converted_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- [P3-mock] Commission tier rules (one fixed rule for demo)
CREATE TABLE commission_rules (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             VARCHAR(100) NOT NULL,
  rule_type        VARCHAR(20) NOT NULL CHECK (rule_type IN ('recommendation','affiliate')),
  one_time_bonus   NUMERIC(12,2) DEFAULT 0,   -- on first sale / first click
  ongoing_rate     NUMERIC(5,4) DEFAULT 0.03, -- 3% default
  tier_name        VARCHAR(50),
  min_conversions  INTEGER DEFAULT 0,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- [P3-mock] Individual commission payouts (credited via wallet_ledger)
CREATE TABLE recommendation_commissions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommender_id      UUID NOT NULL REFERENCES users(id),
  conversion_id       UUID REFERENCES recommendation_conversions(id),
  commission_type     VARCHAR(20) NOT NULL CHECK (commission_type IN ('bonus','ongoing')),
  amount              NUMERIC(12,2) NOT NULL,  -- in RM
  ledger_entry_id     UUID,  -- FK to wallet_ledger, added after
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- [P3-core] Unique affiliate links per user
CREATE TABLE affiliate_links (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  affiliate_code VARCHAR(20) NOT NULL UNIQUE,  -- e.g. 'AF-XXXXXX'
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- [P3-mock] Click tracking for affiliate links
CREATE TABLE affiliate_clicks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id       UUID NOT NULL REFERENCES affiliate_links(id) ON DELETE CASCADE,
  clicker_id    UUID REFERENCES users(id),  -- null if guest
  target_type   VARCHAR(20),  -- 'vendor'|'product'|'outlet'
  target_id     UUID,
  ip_hash       VARCHAR(64),  -- hashed IP for demo dedup
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- [P3-mock] 30-day cookie attribution (mock: admin manually triggers)
CREATE TABLE affiliate_attributions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  click_id      UUID NOT NULL REFERENCES affiliate_clicks(id),
  order_id      UUID NOT NULL,  -- FK added after orders
  commission_rate NUMERIC(5,4) NOT NULL DEFAULT 0.03,
  commission_amount NUMERIC(12,2) NOT NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','confirmed','reversed')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- [P3-core] Product/vendor reviews (requires completed order_item)
CREATE TABLE reviews (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id),
  order_item_id  UUID NOT NULL UNIQUE,   -- FK added after order_items
  vendor_id      UUID NOT NULL REFERENCES vendors(id),
  outlet_id      UUID REFERENCES outlets(id),
  product_id     UUID REFERENCES products(id),
  rating         INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title          VARCHAR(255),
  body           TEXT,
  is_visible     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- [P3-core] Share events (Web Share API + copy-link fallback)
CREATE TABLE share_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES users(id),
  content_type VARCHAR(30) NOT NULL,  -- 'vendor'|'product'|'outlet'|'recommendation'
  content_id   UUID NOT NULL,
  platform     VARCHAR(30),  -- 'whatsapp'|'facebook'|'instagram'|'copy_link'|'native'
  affiliate_id UUID REFERENCES affiliate_links(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- [P3-core] Implicit & explicit user interaction signals for recommendation ranking
CREATE TABLE user_interactions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type   VARCHAR(20) NOT NULL
                 CHECK (event_type IN ('view','save','share','book','rate')),
  entity_type  VARCHAR(20) NOT NULL CHECK (entity_type IN ('vendor','outlet','product')),
  entity_id    UUID NOT NULL,
  dwell_ms     INTEGER,   -- time on page in ms
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- [P3-mock] Saved recommendation snapshots (rule-based, no vectors)
CREATE TABLE recommendation_snapshots (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  model_version  VARCHAR(20) NOT NULL DEFAULT 'rule-v1',
  results        JSONB NOT NULL,  -- [{entity_id, score, reason_tags: ['near_you',...]}]
  generated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- [P3-later] Geocode cache (teacher data already has lat/lng — deferred)
CREATE TABLE geocode_cache (
  address     TEXT PRIMARY KEY,
  lat         NUMERIC(10,7) NOT NULL,
  lng         NUMERIC(10,7) NOT NULL,
  provider    VARCHAR(20) DEFAULT 'manual',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- P4 — Cart, Order, Booking & Wallet
-- ============================================================

-- [P4-core] Shopping cart (one active cart per user)
CREATE TABLE carts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  coupon_code VARCHAR(50),   -- pending voucher code entry
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- [P4-core] Cart line items (can be product variant or booking slot)
CREATE TABLE cart_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id      UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  variant_id   UUID REFERENCES product_variants(id),
  slot_id      UUID REFERENCES booking_slots(id),
  quantity     INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price   NUMERIC(12,2) NOT NULL,  -- price at time of add-to-cart
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cart_item_has_item CHECK (variant_id IS NOT NULL OR slot_id IS NOT NULL)
);

-- [P4-core] Orders (snapshot of transaction)
CREATE TABLE orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  status          VARCHAR(30) NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','pending_payment','paid','completed','cancelled','refunded')),
  subtotal        NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency        VARCHAR(3) NOT NULL DEFAULT 'MYR',
  payment_method  VARCHAR(30),  -- 'mock_card'|'wallet'
  voucher_code    VARCHAR(50),
  notes           TEXT,
  paid_at         TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  cancelled_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- [P4-core] Order line items (price/name snapshot — immutable after creation)
CREATE TABLE order_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  vendor_id      UUID NOT NULL REFERENCES vendors(id),
  outlet_id      UUID NOT NULL REFERENCES outlets(id),
  product_id     UUID REFERENCES products(id),
  variant_id     UUID REFERENCES product_variants(id),
  slot_id        UUID REFERENCES booking_slots(id),
  product_name   VARCHAR(255) NOT NULL,   -- snapshot
  variant_name   VARCHAR(100),            -- snapshot
  slot_starts_at TIMESTAMPTZ,             -- snapshot
  unit_price     NUMERIC(12,2) NOT NULL,  -- snapshot
  quantity       INTEGER NOT NULL DEFAULT 1,
  line_total     NUMERIC(12,2) NOT NULL,  -- unit_price * quantity
  fulfil_status  VARCHAR(20) NOT NULL DEFAULT 'pending'
                   CHECK (fulfil_status IN ('pending','ready','fulfilled','cancelled')),
  fulfilled_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- [P4-core] Voucher usage record (written on order success, never deleted)
CREATE TABLE voucher_redemptions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id UUID NOT NULL REFERENCES vouchers(id),
  order_id   UUID NOT NULL REFERENCES orders(id),
  user_id    UUID NOT NULL REFERENCES users(id),
  discount   NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (voucher_id, order_id)
);

-- [P4-core] Bookings (generated from paid order_items with requires_booking=true)
CREATE TABLE bookings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id UUID NOT NULL UNIQUE REFERENCES order_items(id),
  slot_id       UUID NOT NULL REFERENCES booking_slots(id),
  customer_id   UUID NOT NULL REFERENCES users(id),
  status        VARCHAR(20) NOT NULL DEFAULT 'confirmed'
                  CHECK (status IN ('confirmed','checked_in','no_show','cancelled')),
  demo_qr_code  TEXT,   -- simple UUID-based QR payload
  check_in_at   TIMESTAMPTZ,
  cancelled_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- [P4-mock] Payment records (mock: button changes status, no real gateway)
CREATE TABLE payments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       UUID NOT NULL REFERENCES orders(id),
  method         VARCHAR(30) NOT NULL CHECK (method IN ('mock_card','wallet','mock_fail')),
  amount         NUMERIC(12,2) NOT NULL,
  status         VARCHAR(20) NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','succeeded','failed')),
  gateway_ref    VARCHAR(100) DEFAULT 'DEMO-MOCK',
  processed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- [P4-mock] Refunds (admin manually changes status)
CREATE TABLE refunds (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id     UUID NOT NULL REFERENCES payments(id),
  order_id       UUID NOT NULL REFERENCES orders(id),
  amount         NUMERIC(12,2) NOT NULL,
  reason         TEXT,
  status         VARCHAR(20) NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','approved','rejected','processed')),
  processed_by   UUID REFERENCES users(id),
  processed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- [P4-core] Customer wallets (demo credits only)
CREATE TABLE wallets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  available_balance NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (available_balance >= 0),
  pending_balance   NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (pending_balance >= 0),
  currency          VARCHAR(3) NOT NULL DEFAULT 'MYR',
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- [P4-core] Every credit/debit as a ledger entry (source of truth for balance)
CREATE TABLE wallet_ledger (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id    UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  entry_type   VARCHAR(30) NOT NULL
                 CHECK (entry_type IN (
                   'reward_pending','reward_cleared','wallet_payment',
                   'withdrawal_reserve','withdrawal_release','withdrawal_complete',
                   'affiliate_commission','refund_credit'
                 )),
  amount       NUMERIC(12,2) NOT NULL,  -- positive = credit, negative = debit
  balance_type VARCHAR(10) NOT NULL CHECK (balance_type IN ('available','pending')),
  reference_id UUID,    -- order_id / withdrawal_id / commission_id
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- [P4-mock] Saved payout destinations (masked dummy data, no real banking)
CREATE TABLE payout_destinations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dest_type    VARCHAR(20) NOT NULL CHECK (dest_type IN ('bank','ewallet')),
  label        VARCHAR(100),      -- e.g. 'Maybank ****1234'
  masked_ref   VARCHAR(50),       -- masked account number
  is_default   BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- [P4-core] Withdrawal requests
CREATE TABLE withdrawal_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  wallet_id       UUID NOT NULL REFERENCES wallets(id),
  destination_id  UUID REFERENCES payout_destinations(id),
  amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected','processing','completed')),
  requires_dual_approval BOOLEAN NOT NULL DEFAULT FALSE,  -- amount > threshold
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- [P4-core] Withdrawal approval actions (one row per approver action)
CREATE TABLE withdrawal_approvals (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id     UUID NOT NULL REFERENCES withdrawal_requests(id) ON DELETE CASCADE,
  approver_id    UUID NOT NULL REFERENCES users(id),
  action         VARCHAR(10) NOT NULL CHECK (action IN ('approve','reject','hold')),
  note           TEXT,
  actioned_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- [P4-later] Real bank/e-wallet payout transactions (not used in demo)
CREATE TABLE payout_transactions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id     UUID NOT NULL REFERENCES withdrawal_requests(id),
  gateway        VARCHAR(50),
  gateway_ref    VARCHAR(100),
  status         VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- Back-fill deferred FKs
-- ============================================================

ALTER TABLE user_roles
  ADD CONSTRAINT fk_user_roles_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id),
  ADD CONSTRAINT fk_user_roles_outlet FOREIGN KEY (outlet_id) REFERENCES outlets(id);

ALTER TABLE chat_threads
  ADD CONSTRAINT fk_chat_threads_outlet FOREIGN KEY (outlet_id) REFERENCES outlets(id);

ALTER TABLE recommendation_conversions
  ADD CONSTRAINT fk_conv_order FOREIGN KEY (first_sale_order_id) REFERENCES orders(id);

ALTER TABLE recommendation_commissions
  ADD CONSTRAINT fk_comm_ledger FOREIGN KEY (ledger_entry_id) REFERENCES wallet_ledger(id);

ALTER TABLE affiliate_attributions
  ADD CONSTRAINT fk_attr_order FOREIGN KEY (order_id) REFERENCES orders(id);

ALTER TABLE reviews
  ADD CONSTRAINT fk_reviews_order_item FOREIGN KEY (order_item_id) REFERENCES order_items(id);


-- ============================================================
-- Indexes (common query patterns)
-- ============================================================

CREATE INDEX idx_products_outlet ON products(outlet_id);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_outlets_vendor ON outlets(vendor_id);
CREATE INDEX idx_outlets_location ON outlets(lat, lng);
CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_vendor ON order_items(vendor_id);
CREATE INDEX idx_booking_slots_product ON booking_slots(product_id, starts_at);
CREATE INDEX idx_wallet_ledger_wallet ON wallet_ledger(wallet_id, created_at DESC);
CREATE INDEX idx_notifications_user ON notifications(user_id, read_at);
CREATE INDEX idx_chat_messages_thread ON chat_messages(thread_id, created_at);
CREATE INDEX idx_user_interactions_user ON user_interactions(user_id, event_type);
CREATE INDEX idx_affiliate_clicks_link ON affiliate_clicks(link_id, created_at DESC);
CREATE INDEX idx_vendors_status ON vendors(status);


-- ============================================================
-- Triggers: auto-update updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_vendors_updated_at
  BEFORE UPDATE ON vendors FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_outlets_updated_at
  BEFORE UPDATE ON outlets FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_carts_updated_at
  BEFORE UPDATE ON carts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_withdrawal_requests_updated_at
  BEFORE UPDATE ON withdrawal_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_support_tickets_updated_at
  BEFORE UPDATE ON support_tickets FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Auto-create public.users record when Supabase auth user signs up
CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.users (id, email, created_at, updated_at)
  VALUES (NEW.id, NEW.email, NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Create wallet for every new user
  INSERT INTO public.wallets (user_id) VALUES (NEW.id)
  ON CONFLICT DO NOTHING;

  -- Assign default 'customer' role
  INSERT INTO public.user_roles (user_id, role_id)
  SELECT NEW.id, r.id FROM public.roles r WHERE r.name = 'customer'
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();


-- ============================================================
-- 002_governance_functions.sql
-- ============================================================

-- ============================================================
-- P-TMF (Trust & Money Flow) — Governance RPC Functions
-- These are the TRANSACTIONAL entry points for:
--   1. withdrawal approve/reject (single + dual approval)
--   2. recommendation convert → wallet credit
--   3. KYC status update with cascade to users table
--
-- All approval flows go through these RPCs to guarantee atomicity.
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. approve_withdrawal(request_id, approver_id, action, note)
--    Handles: approve / reject / hold
--    Ensures: dual approval logic, ledger consistency, single-transaction
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION approve_withdrawal(
  p_request_id  UUID,
  p_approver_id UUID,
  p_action      VARCHAR,
  p_note        TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request        withdrawal_requests%ROWTYPE;
  v_approve_count  INT;
  v_final_status   VARCHAR;
BEGIN
  -- Validate action
  IF p_action NOT IN ('approve', 'reject', 'hold') THEN
    RAISE EXCEPTION 'Invalid action: %', p_action;
  END IF;

  -- Lock the request row (prevents concurrent approvals)
  SELECT * INTO v_request
    FROM withdrawal_requests
   WHERE id = p_request_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Withdrawal request not found: %', p_request_id;
  END IF;

  IF v_request.status NOT IN ('pending') THEN
    RAISE EXCEPTION 'Request already in terminal state: %', v_request.status;
  END IF;

  -- Prevent same approver acting twice
  IF EXISTS (
    SELECT 1 FROM withdrawal_approvals
     WHERE request_id = p_request_id AND approver_id = p_approver_id
  ) THEN
    RAISE EXCEPTION 'Approver already acted on this request';
  END IF;

  -- Record the approval action
  INSERT INTO withdrawal_approvals (request_id, approver_id, action, note)
  VALUES (p_request_id, p_approver_id, p_action, p_note);

  IF p_action = 'reject' THEN
    v_final_status := 'rejected';
    -- Release reserved funds back to available
    INSERT INTO wallet_ledger (wallet_id, entry_type, amount, balance_type, reference_id, note)
    VALUES (
      v_request.wallet_id, 'withdrawal_release',
      v_request.amount, 'available',
      p_request_id, 'Withdrawal rejected: ' || COALESCE(p_note, '')
    );
    UPDATE wallets
       SET available_balance = available_balance + v_request.amount,
           updated_at = NOW()
     WHERE id = v_request.wallet_id;

  ELSIF p_action = 'hold' THEN
    v_final_status := 'pending';   -- still pending, no fund movement

  ELSIF p_action = 'approve' THEN
    SELECT COUNT(*) INTO v_approve_count
      FROM withdrawal_approvals
     WHERE request_id = p_request_id AND action = 'approve';

    IF v_request.requires_dual_approval AND v_approve_count < 2 THEN
      -- 1 of 2 approvals received
      v_final_status := 'pending';
    ELSE
      -- Single approval OR 2 of 2 dual approvals
      v_final_status := 'completed';
      -- Debit ledger (reserve was made on request creation; this closes it out)
      INSERT INTO wallet_ledger (wallet_id, entry_type, amount, balance_type, reference_id, note)
      VALUES (
        v_request.wallet_id, 'withdrawal_complete',
        -v_request.amount, 'available',
        p_request_id, 'Withdrawal completed by approver ' || p_approver_id
      );
      -- Note: available_balance was already reduced at request time
    END IF;
  END IF;

  -- Update request status
  UPDATE withdrawal_requests
     SET status = v_final_status, updated_at = NOW()
   WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'status', v_final_status,
    'action', p_action,
    'approver_id', p_approver_id,
    'approve_count', COALESCE(v_approve_count, 0)
  );
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- 2. submit_withdrawal(user_id, amount, destination_id)
--    Reserves funds from available at submission time
--    Auto-flags dual approval if amount >= threshold
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION submit_withdrawal(
  p_user_id        UUID,
  p_amount         NUMERIC,
  p_destination_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_wallet          wallets%ROWTYPE;
  v_request_id      UUID;
  v_threshold       NUMERIC;
  v_requires_dual   BOOLEAN;
  v_kyc_status      VARCHAR;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  -- Check KYC gate
  SELECT kyc_status INTO v_kyc_status FROM users WHERE id = p_user_id;
  IF v_kyc_status != 'approved' THEN
    RAISE EXCEPTION 'KYC not approved (current: %)', v_kyc_status;
  END IF;

  -- Lock wallet
  SELECT * INTO v_wallet
    FROM wallets
   WHERE user_id = p_user_id
   FOR UPDATE;

  IF v_wallet.available_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance: available=% requested=%',
      v_wallet.available_balance, p_amount;
  END IF;

  -- Threshold from platform_settings
  SELECT value::NUMERIC INTO v_threshold
    FROM platform_settings WHERE key = 'withdrawal.high_value_rm';
  v_requires_dual := p_amount >= COALESCE(v_threshold, 500);

  -- Create request
  INSERT INTO withdrawal_requests (user_id, wallet_id, destination_id, amount, requires_dual_approval)
  VALUES (p_user_id, v_wallet.id, p_destination_id, p_amount, v_requires_dual)
  RETURNING id INTO v_request_id;

  -- Reserve funds: available goes down, ledger records reserve
  UPDATE wallets
     SET available_balance = available_balance - p_amount,
         updated_at = NOW()
   WHERE id = v_wallet.id;

  INSERT INTO wallet_ledger (wallet_id, entry_type, amount, balance_type, reference_id, note)
  VALUES (v_wallet.id, 'withdrawal_reserve', -p_amount, 'available',
          v_request_id, 'Reserved for withdrawal request');

  RETURN jsonb_build_object(
    'request_id', v_request_id,
    'requires_dual_approval', v_requires_dual,
    'new_available_balance', v_wallet.available_balance - p_amount
  );
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- 3. convert_recommendation(recommendation_id, admin_id, vendor_id, bonus_amount)
--    Marks recommendation as 'converted' AND credits recommender wallet
--    Used by admin's "Mock Convert" button
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION convert_recommendation(
  p_recommendation_id UUID,
  p_admin_id          UUID,
  p_vendor_id         UUID,
  p_bonus_amount      NUMERIC DEFAULT 12.50
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rec                vendor_recommendations%ROWTYPE;
  v_wallet_id          UUID;
  v_conversion_id      UUID;
  v_ledger_entry_id    UUID;
  v_commission_id      UUID;
BEGIN
  SELECT * INTO v_rec FROM vendor_recommendations
   WHERE id = p_recommendation_id FOR UPDATE;

  IF v_rec.status != 'approved' THEN
    RAISE EXCEPTION 'Recommendation must be approved before conversion (current: %)', v_rec.status;
  END IF;

  -- 1. Record conversion
  INSERT INTO recommendation_conversions (recommendation_id, converted_vendor_id)
  VALUES (p_recommendation_id, p_vendor_id)
  RETURNING id INTO v_conversion_id;

  -- 2. Update recommendation
  UPDATE vendor_recommendations
     SET status = 'converted',
         converted_vendor_id = p_vendor_id,
         reviewed_at = NOW(),
         reviewer_id = p_admin_id
   WHERE id = p_recommendation_id;

  -- 3. Find recommender's wallet
  SELECT id INTO v_wallet_id FROM wallets WHERE user_id = v_rec.recommender_id;
  IF v_wallet_id IS NULL THEN
    RAISE EXCEPTION 'Recommender has no wallet';
  END IF;

  -- 4. Credit wallet (pending)
  INSERT INTO wallet_ledger (wallet_id, entry_type, amount, balance_type, reference_id, note)
  VALUES (v_wallet_id, 'reward_pending', p_bonus_amount, 'pending',
          v_conversion_id, 'Recommendation conversion bonus')
  RETURNING id INTO v_ledger_entry_id;

  UPDATE wallets
     SET pending_balance = pending_balance + p_bonus_amount,
         updated_at = NOW()
   WHERE id = v_wallet_id;

  -- 5. Record commission row
  INSERT INTO recommendation_commissions
    (recommender_id, conversion_id, commission_type, amount, ledger_entry_id)
  VALUES
    (v_rec.recommender_id, v_conversion_id, 'bonus', p_bonus_amount, v_ledger_entry_id)
  RETURNING id INTO v_commission_id;

  RETURN jsonb_build_object(
    'conversion_id',   v_conversion_id,
    'ledger_entry_id', v_ledger_entry_id,
    'commission_id',   v_commission_id,
    'amount_credited', p_bonus_amount
  );
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- 4. review_kyc(submission_id, admin_id, action, reason)
--    Updates KYC submission + users.kyc_status atomically
--    On approve: cascades to users.kyc_status = 'approved'
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION review_kyc(
  p_submission_id UUID,
  p_admin_id      UUID,
  p_action        VARCHAR,
  p_reason        TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_submission kyc_submissions%ROWTYPE;
  v_new_kyc_status VARCHAR;
BEGIN
  IF p_action NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Invalid action: %', p_action;
  END IF;

  SELECT * INTO v_submission FROM kyc_submissions
   WHERE id = p_submission_id FOR UPDATE;

  IF v_submission.status != 'pending' THEN
    RAISE EXCEPTION 'Submission not pending (current: %)', v_submission.status;
  END IF;

  v_new_kyc_status := CASE p_action WHEN 'approve' THEN 'approved' ELSE 'rejected' END;

  UPDATE kyc_submissions
     SET status = v_new_kyc_status,
         reviewer_id = p_admin_id,
         reviewed_at = NOW(),
         rejection_reason = CASE WHEN p_action = 'reject' THEN p_reason ELSE NULL END
   WHERE id = p_submission_id;

  UPDATE users
     SET kyc_status = v_new_kyc_status, updated_at = NOW()
   WHERE id = v_submission.user_id;

  RETURN jsonb_build_object(
    'submission_id', p_submission_id,
    'user_id', v_submission.user_id,
    'new_status', v_new_kyc_status
  );
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- 5. recalculate_wallet_balance(wallet_id)
--    Rebuilds wallets.available_balance + pending_balance from ledger.
--    Called by creditWallet() helper for consistency.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION recalculate_wallet_balance(p_wallet_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_available NUMERIC;
  v_pending   NUMERIC;
BEGIN
  SELECT
    COALESCE(SUM(CASE WHEN balance_type = 'available' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN balance_type = 'pending'   THEN amount ELSE 0 END), 0)
  INTO v_available, v_pending
  FROM wallet_ledger
  WHERE wallet_id = p_wallet_id;

  UPDATE wallets
     SET available_balance = GREATEST(v_available, 0),
         pending_balance   = GREATEST(v_pending, 0),
         updated_at        = NOW()
   WHERE id = p_wallet_id;
END;
$$;

-- Grant execute to authenticated users (RLS will still gate access)
GRANT EXECUTE ON FUNCTION approve_withdrawal        TO authenticated;
GRANT EXECUTE ON FUNCTION submit_withdrawal         TO authenticated;
GRANT EXECUTE ON FUNCTION convert_recommendation    TO authenticated;
GRANT EXECUTE ON FUNCTION review_kyc                TO authenticated;
GRANT EXECUTE ON FUNCTION recalculate_wallet_balance TO authenticated;


-- ============================================================
-- 003_rls_policies.sql
-- ============================================================

-- ============================================================
-- P-TMF (Trust & Money Flow) — Row Level Security Policies
-- Critical security layer. Without RLS the anon key can read ANY row.
--
-- Design:
--   - Every user-owned table: user reads own rows; admin reads all
--   - Governance tables (approvals, audit): admin only
--   - RPCs from 002_governance_functions.sql use SECURITY DEFINER,
--     so they bypass RLS by design — role checks are added below
--   - Public reference data (roles, categories): world-readable
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- Role check helper functions
-- STABLE = safe for RLS use (postgres caches within a statement)
-- SECURITY DEFINER = runs with postgres privileges to bypass its own RLS lookup
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_admin(uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = uid
      AND r.name IN ('super_admin', 'approver')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = uid AND r.name = 'super_admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_approver(uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = uid AND r.name IN ('super_admin', 'approver')
  );
$$;

GRANT EXECUTE ON FUNCTION is_admin, is_super_admin, is_approver TO authenticated, anon;


-- ─────────────────────────────────────────────────────────────
-- Enable RLS on all P-TMF-owned tables
-- ─────────────────────────────────────────────────────────────

ALTER TABLE users                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences            ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_verifications         ENABLE ROW LEVEL SECURITY;
ALTER TABLE phone_verifications         ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_submissions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_ledger               ENABLE ROW LEVEL SECURITY;
ALTER TABLE withdrawal_requests         ENABLE ROW LEVEL SECURITY;
ALTER TABLE withdrawal_approvals        ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_destinations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_recommendations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendation_conversions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendation_commissions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_rules            ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_links             ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications               ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_settings           ENABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────
-- USERS
-- Read: own profile OR admin
-- Update: own profile only (NOT kyc_status — that's a governance field)
-- Insert: handled by trigger (SECURITY DEFINER bypasses RLS)
-- ─────────────────────────────────────────────────────────────

CREATE POLICY users_select_own_or_admin ON users
  FOR SELECT USING (auth.uid() = id OR is_admin(auth.uid()));

CREATE POLICY users_update_own ON users
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);


-- ─────────────────────────────────────────────────────────────
-- ROLES + USER_ROLES — reference data
-- Roles: world-readable (needed for auth hook)
-- User_roles: users see own; admins see all; only super_admin can grant
-- ─────────────────────────────────────────────────────────────

CREATE POLICY roles_read_all ON roles FOR SELECT USING (true);

CREATE POLICY user_roles_read_own_or_admin ON user_roles
  FOR SELECT USING (auth.uid() = user_id OR is_admin(auth.uid()));

CREATE POLICY user_roles_super_admin_manages ON user_roles
  FOR ALL USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));


-- ─────────────────────────────────────────────────────────────
-- USER_PREFERENCES — own only
-- ─────────────────────────────────────────────────────────────

CREATE POLICY user_prefs_own ON user_preferences
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────
-- EMAIL / PHONE VERIFICATIONS — own only (writes via SECURITY DEFINER)
-- ─────────────────────────────────────────────────────────────

CREATE POLICY email_verif_own ON email_verifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY phone_verif_own ON phone_verifications
  FOR SELECT USING (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────
-- KYC_SUBMISSIONS
-- Read: own OR admin
-- Insert: own (customer submits)
-- Update: admin only (approve/reject via review_kyc RPC)
-- ─────────────────────────────────────────────────────────────

CREATE POLICY kyc_read_own_or_admin ON kyc_submissions
  FOR SELECT USING (auth.uid() = user_id OR is_admin(auth.uid()));

CREATE POLICY kyc_insert_own ON kyc_submissions
  FOR INSERT WITH CHECK (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────
-- WALLETS
-- Read: own OR admin
-- Update: NONE from client — only via RPCs (SECURITY DEFINER)
-- ─────────────────────────────────────────────────────────────

CREATE POLICY wallets_read_own_or_admin ON wallets
  FOR SELECT USING (auth.uid() = user_id OR is_admin(auth.uid()));


-- ─────────────────────────────────────────────────────────────
-- WALLET_LEDGER
-- Read: own wallet's entries OR admin
-- Insert: NONE from client — only via RPCs / creditWallet helper
-- ─────────────────────────────────────────────────────────────

CREATE POLICY ledger_read_own_or_admin ON wallet_ledger
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM wallets w WHERE w.id = wallet_ledger.wallet_id AND w.user_id = auth.uid())
    OR is_admin(auth.uid())
  );


-- ─────────────────────────────────────────────────────────────
-- WITHDRAWAL_REQUESTS
-- Read: own OR approver+admin
-- Insert: NONE from client — via submit_withdrawal RPC (which validates KYC)
-- Update: NONE from client — via approve_withdrawal RPC
-- ─────────────────────────────────────────────────────────────

CREATE POLICY withdrawal_read_own_or_admin ON withdrawal_requests
  FOR SELECT USING (auth.uid() = user_id OR is_approver(auth.uid()));


-- ─────────────────────────────────────────────────────────────
-- WITHDRAWAL_APPROVALS — approver+admin only
-- ─────────────────────────────────────────────────────────────

CREATE POLICY withdrawal_approvals_admin ON withdrawal_approvals
  FOR SELECT USING (is_approver(auth.uid()));


-- ─────────────────────────────────────────────────────────────
-- PAYOUT_DESTINATIONS — own only
-- ─────────────────────────────────────────────────────────────

CREATE POLICY payout_dest_own ON payout_destinations
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────
-- VENDOR_RECOMMENDATIONS
-- Read: own submissions OR approved-status (public feed) OR admin
-- Insert: own (must be KYC'd — checked in RPC)
-- Update: admin only (via review RPC)
-- ─────────────────────────────────────────────────────────────

CREATE POLICY vendor_rec_read ON vendor_recommendations
  FOR SELECT USING (
    auth.uid() = recommender_id
    OR status IN ('approved', 'converted')
    OR is_admin(auth.uid())
  );

CREATE POLICY vendor_rec_insert_own ON vendor_recommendations
  FOR INSERT WITH CHECK (auth.uid() = recommender_id);


-- ─────────────────────────────────────────────────────────────
-- RECOMMENDATION_CONVERSIONS + COMMISSIONS — read own, admin manages
-- ─────────────────────────────────────────────────────────────

CREATE POLICY rec_conv_read ON recommendation_conversions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM vendor_recommendations vr
             WHERE vr.id = recommendation_conversions.recommendation_id
               AND (vr.recommender_id = auth.uid() OR is_admin(auth.uid())))
  );

CREATE POLICY rec_commissions_read_own ON recommendation_commissions
  FOR SELECT USING (auth.uid() = recommender_id OR is_admin(auth.uid()));


-- ─────────────────────────────────────────────────────────────
-- COMMISSION_RULES — public read (transparent scoring)
-- ─────────────────────────────────────────────────────────────

CREATE POLICY commission_rules_read ON commission_rules FOR SELECT USING (true);


-- ─────────────────────────────────────────────────────────────
-- AFFILIATE_LINKS — own only
-- ─────────────────────────────────────────────────────────────

CREATE POLICY affiliate_own ON affiliate_links
  FOR SELECT USING (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────
-- AUDIT_LOGS — admin only for read; writes via auditAndNotify (SECURITY DEFINER)
-- ─────────────────────────────────────────────────────────────

CREATE POLICY audit_admin_read ON audit_logs
  FOR SELECT USING (is_admin(auth.uid()));


-- ─────────────────────────────────────────────────────────────
-- NOTIFICATIONS — own only; writes via SECURITY DEFINER
-- Users can mark own as read
-- ─────────────────────────────────────────────────────────────

CREATE POLICY notif_read_own ON notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY notif_update_own_read ON notifications
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────
-- PLATFORM_SETTINGS — world-readable (config discovery); super_admin writes
-- ─────────────────────────────────────────────────────────────

CREATE POLICY settings_read ON platform_settings FOR SELECT USING (true);
CREATE POLICY settings_super_admin_write ON platform_settings
  FOR ALL USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));


-- ============================================================
-- Add caller role checks to governance RPCs (defence in depth)
-- The RPCs are SECURITY DEFINER — they bypass RLS but MUST verify
-- the caller has the right role themselves.
-- ============================================================

CREATE OR REPLACE FUNCTION approve_withdrawal(
  p_request_id  UUID,
  p_approver_id UUID,
  p_action      VARCHAR,
  p_note        TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request        withdrawal_requests%ROWTYPE;
  v_approve_count  INT;
  v_final_status   VARCHAR;
BEGIN
  -- Defence in depth: verify caller matches p_approver_id AND is an approver
  IF p_approver_id != auth.uid() THEN
    RAISE EXCEPTION 'Approver ID mismatch — cannot act on behalf of another user';
  END IF;
  IF NOT is_approver(p_approver_id) THEN
    RAISE EXCEPTION 'Caller is not an approver';
  END IF;

  IF p_action NOT IN ('approve', 'reject', 'hold') THEN
    RAISE EXCEPTION 'Invalid action: %', p_action;
  END IF;

  SELECT * INTO v_request FROM withdrawal_requests
   WHERE id = p_request_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Withdrawal request not found: %', p_request_id;
  END IF;

  IF v_request.status != 'pending' THEN
    RAISE EXCEPTION 'Request already in terminal state: %', v_request.status;
  END IF;

  -- Approver cannot approve their own withdrawal (segregation of duties)
  IF v_request.user_id = p_approver_id THEN
    RAISE EXCEPTION 'Approver cannot act on their own withdrawal request';
  END IF;

  IF EXISTS (
    SELECT 1 FROM withdrawal_approvals
     WHERE request_id = p_request_id AND approver_id = p_approver_id
  ) THEN
    RAISE EXCEPTION 'Approver already acted on this request';
  END IF;

  INSERT INTO withdrawal_approvals (request_id, approver_id, action, note)
  VALUES (p_request_id, p_approver_id, p_action, p_note);

  IF p_action = 'reject' THEN
    v_final_status := 'rejected';
    INSERT INTO wallet_ledger (wallet_id, entry_type, amount, balance_type, reference_id, note)
    VALUES (v_request.wallet_id, 'withdrawal_release', v_request.amount, 'available',
            p_request_id, 'Withdrawal rejected: ' || COALESCE(p_note, ''));
    UPDATE wallets
       SET available_balance = available_balance + v_request.amount, updated_at = NOW()
     WHERE id = v_request.wallet_id;

  ELSIF p_action = 'hold' THEN
    v_final_status := 'pending';

  ELSIF p_action = 'approve' THEN
    SELECT COUNT(*) INTO v_approve_count FROM withdrawal_approvals
     WHERE request_id = p_request_id AND action = 'approve';

    IF v_request.requires_dual_approval AND v_approve_count < 2 THEN
      v_final_status := 'pending';
    ELSE
      v_final_status := 'completed';
      INSERT INTO wallet_ledger (wallet_id, entry_type, amount, balance_type, reference_id, note)
      VALUES (v_request.wallet_id, 'withdrawal_complete', -v_request.amount, 'available',
              p_request_id, 'Withdrawal completed');
    END IF;
  END IF;

  UPDATE withdrawal_requests SET status = v_final_status, updated_at = NOW()
   WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'status', v_final_status,
    'action', p_action,
    'approve_count', COALESCE(v_approve_count, 0)
  );
END;
$$;


CREATE OR REPLACE FUNCTION review_kyc(
  p_submission_id UUID,
  p_admin_id      UUID,
  p_action        VARCHAR,
  p_reason        TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_submission     kyc_submissions%ROWTYPE;
  v_new_kyc_status VARCHAR;
BEGIN
  IF p_admin_id != auth.uid() THEN
    RAISE EXCEPTION 'Admin ID mismatch';
  END IF;
  IF NOT is_admin(p_admin_id) THEN
    RAISE EXCEPTION 'Caller is not an admin';
  END IF;
  IF p_action NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Invalid action: %', p_action;
  END IF;

  SELECT * INTO v_submission FROM kyc_submissions
   WHERE id = p_submission_id FOR UPDATE;
  IF v_submission.status != 'pending' THEN
    RAISE EXCEPTION 'Submission not pending (current: %)', v_submission.status;
  END IF;

  v_new_kyc_status := CASE p_action WHEN 'approve' THEN 'approved' ELSE 'rejected' END;

  UPDATE kyc_submissions
     SET status = v_new_kyc_status,
         reviewer_id = p_admin_id,
         reviewed_at = NOW(),
         rejection_reason = CASE WHEN p_action = 'reject' THEN p_reason ELSE NULL END
   WHERE id = p_submission_id;

  UPDATE users
     SET kyc_status = v_new_kyc_status, updated_at = NOW()
   WHERE id = v_submission.user_id;

  RETURN jsonb_build_object(
    'submission_id', p_submission_id,
    'user_id',       v_submission.user_id,
    'new_status',    v_new_kyc_status
  );
END;
$$;


CREATE OR REPLACE FUNCTION convert_recommendation(
  p_recommendation_id UUID,
  p_admin_id          UUID,
  p_vendor_id         UUID,
  p_bonus_amount      NUMERIC DEFAULT 12.50
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rec              vendor_recommendations%ROWTYPE;
  v_wallet_id        UUID;
  v_conversion_id    UUID;
  v_ledger_entry_id  UUID;
  v_commission_id    UUID;
BEGIN
  IF p_admin_id != auth.uid() THEN RAISE EXCEPTION 'Admin ID mismatch'; END IF;
  IF NOT is_admin(p_admin_id) THEN RAISE EXCEPTION 'Caller is not an admin'; END IF;
  IF p_bonus_amount <= 0 OR p_bonus_amount > 1000 THEN
    RAISE EXCEPTION 'Bonus amount out of range: %', p_bonus_amount;
  END IF;

  SELECT * INTO v_rec FROM vendor_recommendations
   WHERE id = p_recommendation_id FOR UPDATE;

  IF v_rec.status != 'approved' THEN
    RAISE EXCEPTION 'Recommendation must be approved before conversion (current: %)', v_rec.status;
  END IF;

  INSERT INTO recommendation_conversions (recommendation_id, converted_vendor_id)
  VALUES (p_recommendation_id, p_vendor_id) RETURNING id INTO v_conversion_id;

  UPDATE vendor_recommendations
     SET status = 'converted', converted_vendor_id = p_vendor_id,
         reviewed_at = NOW(), reviewer_id = p_admin_id
   WHERE id = p_recommendation_id;

  SELECT id INTO v_wallet_id FROM wallets WHERE user_id = v_rec.recommender_id;
  IF v_wallet_id IS NULL THEN RAISE EXCEPTION 'Recommender has no wallet'; END IF;

  INSERT INTO wallet_ledger (wallet_id, entry_type, amount, balance_type, reference_id, note)
  VALUES (v_wallet_id, 'reward_pending', p_bonus_amount, 'pending',
          v_conversion_id, 'Recommendation conversion bonus')
  RETURNING id INTO v_ledger_entry_id;

  UPDATE wallets
     SET pending_balance = pending_balance + p_bonus_amount, updated_at = NOW()
   WHERE id = v_wallet_id;

  INSERT INTO recommendation_commissions
    (recommender_id, conversion_id, commission_type, amount, ledger_entry_id)
  VALUES (v_rec.recommender_id, v_conversion_id, 'bonus', p_bonus_amount, v_ledger_entry_id)
  RETURNING id INTO v_commission_id;

  RETURN jsonb_build_object(
    'conversion_id',   v_conversion_id,
    'ledger_entry_id', v_ledger_entry_id,
    'commission_id',   v_commission_id,
    'amount_credited', p_bonus_amount
  );
END;
$$;


-- Add idempotency table for API-level dedup
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key             VARCHAR(128) PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES users(id),
  endpoint        VARCHAR(200) NOT NULL,
  request_hash    VARCHAR(64) NOT NULL,
  response_body   JSONB,
  status_code     INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
);
CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_keys(expires_at);

ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY idempotency_own ON idempotency_keys
  FOR SELECT USING (auth.uid() = user_id);


-- ============================================================
-- 004_audit_notify_rpc.sql
-- ============================================================

-- ============================================================
-- Migration 004 — Audit + Notification RPCs (SECURITY DEFINER)
--
-- Fixes the RLS blocker: audit_logs and notifications have RLS enabled
-- but no INSERT policies, so client inserts silently fail.
--
-- Design: expose a single RPC that inserts both in one transaction,
-- with defence-in-depth checks on notification recipient.
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- record_audit_and_notify — atomic audit + N notifications
-- Caller identity = auth.uid(); no impersonation possible.
-- Regular users can only notify themselves; admins can notify anyone.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION record_audit_and_notify(
  p_action        VARCHAR,
  p_entity_type   VARCHAR,
  p_entity_id     UUID,
  p_before_data   JSONB DEFAULT NULL,
  p_after_data    JSONB DEFAULT NULL,
  p_note          TEXT  DEFAULT NULL,
  p_notifications JSONB DEFAULT '[]'::JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id     UUID := auth.uid();
  v_is_admin     BOOLEAN;
  v_audit_id     UUID;
  v_notif        JSONB;
  v_recipient    UUID;
  v_notif_count  INT := 0;
  v_notif_ids    UUID[] := ARRAY[]::UUID[];
  v_new_id       UUID;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_is_admin := is_admin(v_actor_id);

  -- Insert audit log
  INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, before_data, after_data, note)
  VALUES (v_actor_id, p_action, p_entity_type, p_entity_id, p_before_data, p_after_data, p_note)
  RETURNING id INTO v_audit_id;

  -- Insert each notification with recipient check
  FOR v_notif IN SELECT * FROM jsonb_array_elements(p_notifications)
  LOOP
    v_recipient := (v_notif->>'user_id')::UUID;

    IF v_recipient IS NULL THEN
      RAISE EXCEPTION 'Notification user_id is required';
    END IF;

    IF v_recipient != v_actor_id AND NOT v_is_admin THEN
      RAISE EXCEPTION 'Cannot notify user % without admin role', v_recipient;
    END IF;

    INSERT INTO notifications (user_id, type, title, body, link)
    VALUES (
      v_recipient,
      v_notif->>'type',
      v_notif->>'title',
      v_notif->>'body',
      v_notif->>'link'
    )
    RETURNING id INTO v_new_id;

    v_notif_ids   := array_append(v_notif_ids, v_new_id);
    v_notif_count := v_notif_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'audit_id',           v_audit_id,
    'notification_ids',   v_notif_ids,
    'notification_count', v_notif_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION record_audit_and_notify TO authenticated;


-- ─────────────────────────────────────────────────────────────
-- send_notification — single notification without audit log
-- Same recipient check as above.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION send_notification(
  p_user_id UUID,
  p_type    VARCHAR,
  p_title   VARCHAR,
  p_body    TEXT DEFAULT NULL,
  p_link    TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_new_id   UUID;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_user_id != v_actor_id AND NOT is_admin(v_actor_id) THEN
    RAISE EXCEPTION 'Cannot send notification to another user';
  END IF;

  INSERT INTO notifications (user_id, type, title, body, link)
  VALUES (p_user_id, p_type, p_title, p_body, p_link)
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION send_notification TO authenticated;


-- ─────────────────────────────────────────────────────────────
-- Fill missing INSERT policies exposed by RLS audit
-- ─────────────────────────────────────────────────────────────

-- idempotency_keys: withIdempotency() writes rows on behalf of the caller
CREATE POLICY idempotency_insert_own ON idempotency_keys
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- affiliate_links: KYC'd customers generate their own link
CREATE POLICY affiliate_insert_own ON affiliate_links
  FOR INSERT WITH CHECK (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────
-- Partial unique index — prevents duplicate role assignments
--
-- Existing UNIQUE(user_id, role_id, vendor_id, outlet_id) does NOT
-- dedupe rows where vendor_id/outlet_id are both NULL, because
-- SQL treats NULL != NULL. This partial index fixes that so the
-- auth trigger + seed script don't create two 'customer' rows.
-- ─────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_roles_unique_global
  ON user_roles (user_id, role_id)
  WHERE vendor_id IS NULL AND outlet_id IS NULL;


-- ============================================================
-- 005_my_roles_rpc.sql
-- ============================================================

-- ============================================================
-- Migration 005 — Current-user role lookup RPC
--
-- Why: client and server-side queries against user_roles with RLS
-- filter `auth.uid() = user_id` were returning empty in some contexts,
-- breaking role-based login redirect. Root cause is the RLS evaluation
-- when the query joins user_roles + roles under the anon token.
--
-- Fix: a SECURITY DEFINER RPC that reads user_roles by auth.uid()
-- and returns the caller's own role names. Safe because it can only
-- ever see the current user's roles.
-- ============================================================

CREATE OR REPLACE FUNCTION get_my_roles()
RETURNS TABLE(role_name VARCHAR)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT r.name
  FROM user_roles ur
  JOIN roles r ON r.id = ur.role_id
  WHERE ur.user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION get_my_roles TO authenticated, anon;


-- Also expose the raw auth.uid() for debugging in dev.
CREATE OR REPLACE FUNCTION whoami()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT auth.uid();
$$;

GRANT EXECUTE ON FUNCTION whoami TO authenticated, anon;


-- ============================================================
-- 006_fix_default_grants.sql
-- ============================================================

-- ============================================================
-- Migration 006 — Restore Supabase's default table grants
--
-- Root cause: DROP SCHEMA public CASCADE removed the ALTER DEFAULT
-- PRIVILEGES that Supabase sets up by default. After that, any tables
-- we CREATE have no grants to anon/authenticated/service_role, so
-- PostgREST returns "permission denied for table X" for every request.
-- RLS was a red herring — this is a plain PostgreSQL privilege issue.
--
-- Fix: grant table/function/sequence access to the standard Supabase
-- roles, and set default privileges so future tables inherit them.
-- ============================================================

-- Schema-level (usage on public + auth for RLS auth.uid())
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Grant on all EXISTING tables in public
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO authenticated, service_role;
GRANT SELECT                                          ON ALL TABLES    IN SCHEMA public TO anon;

-- Grant on sequences (for SERIAL / gen_random_uuid() etc)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- Grant on functions (for RPCs)
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

-- Default privileges for FUTURE tables/sequences/functions created by postgres
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

-- Ensure the auth trigger's target tables also work when trigger runs
-- (trigger runs as its DEFINER which is postgres, so this is mostly belt-and-braces)
GRANT INSERT, UPDATE ON users, wallets, user_roles TO service_role;


-- ============================================================
-- 007_public_read_policies.sql
-- ============================================================

-- ============================================================
-- Migration 007 — Public-read policies for browsable catalogue tables
--
-- Root cause: after DROP SCHEMA + reseed, some tables silently ended up
-- with RLS enabled but no policies. PostgREST returns empty rows with no
-- error in that state, which broke discovery/search/vendor pages.
--
-- Industrial-grade approach: rather than DISABLE RLS, we KEEP RLS on
-- and add explicit narrow SELECT policies that only expose "publishable"
-- rows (approved vendors, active products, etc.). Writes remain locked
-- down until vendor CRUD routes are wired.
-- ============================================================

-- Idempotent: ensure RLS is on so the policies actually apply
ALTER TABLE products         ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE outlets          ENABLE ROW LEVEL SECURITY;
ALTER TABLE outlet_pages     ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors          ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories       ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_slots    ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory        ENABLE ROW LEVEL SECURITY;
ALTER TABLE vouchers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews          ENABLE ROW LEVEL SECURITY;
ALTER TABLE share_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_assets     ENABLE ROW LEVEL SECURITY;
ALTER TABLE outlet_managers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_rules      ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_threads     ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages    ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_message_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE chatbot_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chatbot_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chatbot_kb_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets  ENABLE ROW LEVEL SECURITY;
ALTER TABLE carts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders           ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE refunds          ENABLE ROW LEVEL SECURITY;
ALTER TABLE voucher_redemptions ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- CATALOGUE (public browsing — anyone can see published items)
-- ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS categories_public_read ON categories;
CREATE POLICY categories_public_read ON categories
  FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS vendors_public_read ON vendors;
CREATE POLICY vendors_public_read ON vendors
  FOR SELECT USING (status = 'approved' OR owner_id = auth.uid() OR is_admin(auth.uid()));

DROP POLICY IF EXISTS outlets_public_read ON outlets;
CREATE POLICY outlets_public_read ON outlets
  FOR SELECT USING (
    status = 'active'
    OR EXISTS (SELECT 1 FROM vendors v WHERE v.id = outlets.vendor_id
                 AND (v.owner_id = auth.uid() OR is_admin(auth.uid())))
    OR EXISTS (SELECT 1 FROM outlet_managers om WHERE om.outlet_id = outlets.id AND om.user_id = auth.uid())
  );

DROP POLICY IF EXISTS outlet_pages_public_read ON outlet_pages;
CREATE POLICY outlet_pages_public_read ON outlet_pages FOR SELECT USING (true);

DROP POLICY IF EXISTS products_public_read ON products;
CREATE POLICY products_public_read ON products
  FOR SELECT USING (
    status = 'active'
    OR EXISTS (SELECT 1 FROM vendors v WHERE v.id = products.vendor_id
                 AND (v.owner_id = auth.uid() OR is_admin(auth.uid())))
  );

DROP POLICY IF EXISTS variants_public_read ON product_variants;
CREATE POLICY variants_public_read ON product_variants FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS inventory_public_read ON inventory;
CREATE POLICY inventory_public_read ON inventory FOR SELECT USING (true);

DROP POLICY IF EXISTS slots_public_read ON booking_slots;
CREATE POLICY slots_public_read ON booking_slots FOR SELECT USING (true);

DROP POLICY IF EXISTS vouchers_public_read ON vouchers;
CREATE POLICY vouchers_public_read ON vouchers FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS media_public_read ON media_assets;
CREATE POLICY media_public_read ON media_assets FOR SELECT USING (true);

DROP POLICY IF EXISTS price_rules_public_read ON price_rules;
CREATE POLICY price_rules_public_read ON price_rules FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS reviews_public_read ON reviews;
CREATE POLICY reviews_public_read ON reviews FOR SELECT USING (is_visible = true);

DROP POLICY IF EXISTS chatbot_kb_public_read ON chatbot_kb_documents;
CREATE POLICY chatbot_kb_public_read ON chatbot_kb_documents FOR SELECT USING (is_active = true);

-- ─────────────────────────────────────────────────────────────
-- OWN / ADMIN scoped tables
-- ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS outlet_managers_scoped ON outlet_managers;
CREATE POLICY outlet_managers_scoped ON outlet_managers
  FOR SELECT USING (user_id = auth.uid() OR is_admin(auth.uid()));

DROP POLICY IF EXISTS carts_own ON carts;
CREATE POLICY carts_own ON carts FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS cart_items_own ON cart_items;
CREATE POLICY cart_items_own ON cart_items FOR ALL
  USING (EXISTS (SELECT 1 FROM carts c WHERE c.id = cart_items.cart_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM carts c WHERE c.id = cart_items.cart_id AND c.user_id = auth.uid()));

DROP POLICY IF EXISTS orders_own_or_admin ON orders;
CREATE POLICY orders_own_or_admin ON orders
  FOR SELECT USING (user_id = auth.uid() OR is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM order_items oi
      JOIN vendors v ON v.id = oi.vendor_id
      WHERE oi.order_id = orders.id AND v.owner_id = auth.uid()
    ));

DROP POLICY IF EXISTS order_items_own_or_vendor ON order_items;
CREATE POLICY order_items_own_or_vendor ON order_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM orders o WHERE o.id = order_items.order_id AND o.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM vendors v WHERE v.id = order_items.vendor_id AND v.owner_id = auth.uid())
    OR is_admin(auth.uid())
  );

DROP POLICY IF EXISTS bookings_own_or_vendor ON bookings;
CREATE POLICY bookings_own_or_vendor ON bookings
  FOR SELECT USING (
    customer_id = auth.uid()
    OR EXISTS (SELECT 1 FROM order_items oi
               JOIN vendors v ON v.id = oi.vendor_id
               WHERE oi.id = bookings.order_item_id AND v.owner_id = auth.uid())
    OR is_admin(auth.uid())
  );

DROP POLICY IF EXISTS payments_own ON payments;
CREATE POLICY payments_own ON payments
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM orders o WHERE o.id = payments.order_id
      AND (o.user_id = auth.uid() OR is_admin(auth.uid()))
  ));

DROP POLICY IF EXISTS refunds_own ON refunds;
CREATE POLICY refunds_own ON refunds
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM orders o WHERE o.id = refunds.order_id
      AND (o.user_id = auth.uid() OR is_admin(auth.uid()))
  ));

DROP POLICY IF EXISTS voucher_redemptions_own ON voucher_redemptions;
CREATE POLICY voucher_redemptions_own ON voucher_redemptions
  FOR SELECT USING (user_id = auth.uid() OR is_admin(auth.uid()));

DROP POLICY IF EXISTS share_events_own ON share_events;
CREATE POLICY share_events_own ON share_events
  FOR SELECT USING (user_id = auth.uid() OR is_admin(auth.uid()));
DROP POLICY IF EXISTS share_events_insert_own ON share_events;
CREATE POLICY share_events_insert_own ON share_events
  FOR INSERT WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

DROP POLICY IF EXISTS interactions_own ON user_interactions;
CREATE POLICY interactions_own ON user_interactions FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS chat_threads_participant ON chat_threads;
CREATE POLICY chat_threads_participant ON chat_threads
  FOR SELECT USING (
    customer_id = auth.uid()
    OR EXISTS (SELECT 1 FROM outlets o JOIN vendors v ON v.id = o.vendor_id
                 WHERE o.id = chat_threads.outlet_id AND v.owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM outlet_managers om
                 WHERE om.outlet_id = chat_threads.outlet_id AND om.user_id = auth.uid())
    OR is_admin(auth.uid())
  );

DROP POLICY IF EXISTS chat_messages_participant ON chat_messages;
CREATE POLICY chat_messages_participant ON chat_messages
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM chat_threads t WHERE t.id = chat_messages.thread_id
      AND (t.customer_id = auth.uid() OR is_admin(auth.uid())
           OR EXISTS (SELECT 1 FROM outlets o JOIN vendors v ON v.id = o.vendor_id
                        WHERE o.id = t.outlet_id AND v.owner_id = auth.uid())
           OR EXISTS (SELECT 1 FROM outlet_managers om
                        WHERE om.outlet_id = t.outlet_id AND om.user_id = auth.uid()))
  ));

DROP POLICY IF EXISTS chatbot_sessions_own ON chatbot_sessions;
CREATE POLICY chatbot_sessions_own ON chatbot_sessions
  FOR SELECT USING (user_id = auth.uid() OR user_id IS NULL);

DROP POLICY IF EXISTS chatbot_messages_own ON chatbot_messages;
CREATE POLICY chatbot_messages_own ON chatbot_messages
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM chatbot_sessions s WHERE s.id = chatbot_messages.session_id
      AND (s.user_id = auth.uid() OR s.user_id IS NULL OR is_admin(auth.uid()))
  ));

DROP POLICY IF EXISTS chat_reads_own ON chat_message_reads;
CREATE POLICY chat_reads_own ON chat_message_reads
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS support_own_or_admin ON support_tickets;
CREATE POLICY support_own_or_admin ON support_tickets
  FOR SELECT USING (user_id = auth.uid() OR is_admin(auth.uid()));
DROP POLICY IF EXISTS support_insert_own ON support_tickets;
CREATE POLICY support_insert_own ON support_tickets
  FOR INSERT WITH CHECK (user_id = auth.uid() OR user_id IS NULL);


-- ============================================================
-- 008_vendor_realtime_and_chat_policies.sql
-- ============================================================

-- Vendor dashboard realtime subscriptions and authenticated chat writes.
-- Additive only: no data is deleted or rewritten.

DROP POLICY IF EXISTS chat_threads_customer_insert ON chat_threads;
CREATE POLICY chat_threads_customer_insert ON chat_threads
  FOR INSERT WITH CHECK (customer_id = auth.uid());

DROP POLICY IF EXISTS chat_threads_participant_update ON chat_threads;
CREATE POLICY chat_threads_participant_update ON chat_threads
  FOR UPDATE USING (
    customer_id = auth.uid()
    OR EXISTS (SELECT 1 FROM outlets o JOIN vendors v ON v.id = o.vendor_id
               WHERE o.id = chat_threads.outlet_id AND v.owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM outlet_managers om
               WHERE om.outlet_id = chat_threads.outlet_id AND om.user_id = auth.uid())
    OR is_admin(auth.uid())
  ) WITH CHECK (true);

DROP POLICY IF EXISTS chat_messages_participant_insert ON chat_messages;
CREATE POLICY chat_messages_participant_insert ON chat_messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM chat_threads t WHERE t.id = chat_messages.thread_id
        AND (t.customer_id = auth.uid()
             OR is_admin(auth.uid())
             OR EXISTS (SELECT 1 FROM outlets o JOIN vendors v ON v.id = o.vendor_id
                        WHERE o.id = t.outlet_id AND v.owner_id = auth.uid())
             OR EXISTS (SELECT 1 FROM outlet_managers om
                        WHERE om.outlet_id = t.outlet_id AND om.user_id = auth.uid()))
    )
  );

DO $$
BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.orders';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.products';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.outlets';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.reviews';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.booking_slots';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_threads';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


