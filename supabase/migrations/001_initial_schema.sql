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
