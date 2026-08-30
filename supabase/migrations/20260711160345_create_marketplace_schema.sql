-- ============================================================
-- Pass 1: tables, columns, PKs, defaults, checks (no cross-table FKs yet)
-- ============================================================
create extension if not exists pgcrypto;

create table users (
  id uuid primary key default gen_random_uuid(),
  email varchar not null unique,
  full_name varchar,
  display_name varchar,
  bio text,
  avatar_url text,
  phone varchar,
  city varchar,
  country varchar,
  email_verified_at timestamptz,
  phone_verified_at timestamptz,
  profile_completed_at timestamptz,
  kyc_status varchar not null default 'unverified',
  status varchar not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table roles (
  id serial primary key,
  name varchar not null unique,
  description text,
  created_at timestamptz not null default now()
);

create table user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role_id int4 not null,
  vendor_id uuid,
  outlet_id uuid,
  created_at timestamptz not null default now()
);

create table email_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  token varchar,
  verified_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table phone_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  phone varchar not null,
  demo_code varchar,
  verified_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table kyc_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  document_type varchar not null,
  document_url text,
  status varchar not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewer_id uuid,
  rejection_reason text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  type varchar not null,
  title varchar not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action varchar not null,
  entity_type varchar not null,
  entity_id uuid not null,
  before_data jsonb,
  after_data jsonb,
  ip_address inet,
  note text,
  created_at timestamptz not null default now()
);

create table chat_threads (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null,
  outlet_id uuid not null,
  status varchar not null default 'open',
  last_message_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null,
  sender_id uuid not null,
  body text not null,
  attachment_url text,
  created_at timestamptz not null default now()
);

create table chat_message_reads (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null,
  user_id uuid not null,
  read_at timestamptz not null default now()
);

create table chatbot_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  session_key varchar unique,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create table chatbot_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  role varchar not null,
  body text not null,
  kb_matched bool,
  created_at timestamptz not null default now()
);

create table chatbot_kb_documents (
  id uuid primary key default gen_random_uuid(),
  title varchar not null,
  body text not null,
  keywords text[],
  category varchar,
  is_active bool not null default true,
  created_at timestamptz not null default now()
);

create table chatbot_message_kb_refs (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null,
  document_id uuid not null,
  score numeric,
  created_at timestamptz not null default now()
);

create table support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  session_id uuid,
  subject varchar not null,
  body text not null,
  status varchar not null default 'open' check (status in ('open','resolved')),
  assigned_to uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table platform_settings (
  key varchar primary key,
  value text not null,
  description text,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create table categories (
  id uuid primary key default gen_random_uuid(),
  name varchar not null unique,
  slug varchar not null unique,
  icon varchar,
  sort_order int4,
  is_active bool not null default true,
  created_at timestamptz not null default now()
);

create table vendors (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  name varchar not null,
  slug varchar not null unique,
  description text,
  logo_url text,
  cover_url text,
  business_type varchar,
  status varchar not null default 'pending',
  rejection_reason text,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table outlets (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null,
  name varchar not null,
  slug varchar not null unique,
  address text,
  city varchar,
  state varchar,
  postcode varchar,
  country varchar,
  lat numeric,
  lng numeric,
  phone varchar,
  email varchar,
  operating_hours jsonb,
  status varchar not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table outlet_pages (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null unique,
  hero_url text,
  brand_colour varchar,
  featured_ids uuid[],
  seo_title varchar,
  seo_description text,
  updated_at timestamptz not null default now()
);

create table outlet_managers (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null,
  user_id uuid not null,
  created_at timestamptz not null default now()
);

create table products (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null,
  outlet_id uuid not null,
  category_id uuid,
  name varchar not null,
  slug varchar not null unique,
  description text,
  product_type varchar not null,
  requires_booking bool not null default false,
  base_price numeric not null,
  currency varchar not null default 'MYR',
  cover_url text,
  status varchar not null default 'active',
  tags text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null,
  name varchar not null,
  sku varchar,
  price_offset numeric not null default 0,
  is_default bool not null default false,
  is_active bool not null default true,
  sort_order int4,
  created_at timestamptz not null default now()
);

create table price_rules (
  id uuid primary key default gen_random_uuid(),
  product_id uuid,
  variant_id uuid,
  rule_type varchar not null,
  label varchar,
  multiplier numeric,
  fixed_amount numeric,
  valid_from date,
  valid_until date,
  min_quantity int4,
  is_active bool not null default true,
  created_at timestamptz not null default now()
);

create table inventory (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null unique,
  quantity int4 not null,
  reserved int4 not null default 0,
  updated_at timestamptz not null default now()
);

create table booking_slots (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null,
  outlet_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity int4 not null,
  booked int4 not null default 0,
  price_override numeric,
  status varchar not null default 'open',
  created_at timestamptz not null default now()
);

create table vouchers (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null,
  outlet_id uuid,
  code varchar not null unique,
  name varchar not null,
  voucher_type varchar not null check (voucher_type in ('percent','fixed')),
  discount_value numeric not null,
  min_spend numeric,
  max_uses int4,
  uses_count int4 not null default 0,
  valid_from timestamptz,
  valid_until timestamptz,
  is_active bool not null default true,
  created_at timestamptz not null default now()
);

create table media_assets (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid,
  outlet_id uuid,
  product_id uuid,
  url text not null,
  alt_text varchar,
  media_type varchar,
  sort_order int4,
  created_at timestamptz not null default now()
);

create table user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  interest_tags text[],
  travel_style varchar,
  budget_range varchar,
  group_composition text[],
  wheelchair_accessible bool,
  pet_friendly bool,
  preferred_radius_km int4,
  updated_at timestamptz not null default now()
);

create table vendor_recommendations (
  id uuid primary key default gen_random_uuid(),
  recommender_id uuid not null,
  vendor_name varchar not null,
  vendor_address text,
  description text,
  category_id uuid,
  status varchar not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewer_id uuid,
  reviewed_at timestamptz,
  rejection_reason text,
  converted_vendor_id uuid,
  created_at timestamptz not null default now()
);

create table recommendation_conversions (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid not null,
  converted_vendor_id uuid not null,
  first_sale_order_id uuid,
  converted_at timestamptz not null default now()
);

create table commission_rules (
  id uuid primary key default gen_random_uuid(),
  name varchar not null,
  rule_type varchar not null,
  one_time_bonus numeric,
  ongoing_rate numeric,
  tier_name varchar,
  min_conversions int4,
  is_active bool not null default true,
  created_at timestamptz not null default now()
);

create table recommendation_commissions (
  id uuid primary key default gen_random_uuid(),
  recommender_id uuid not null,
  conversion_id uuid,
  commission_type varchar not null,
  amount numeric not null,
  ledger_entry_id uuid,
  created_at timestamptz not null default now()
);

create table affiliate_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  affiliate_code varchar not null unique,
  is_active bool not null default true,
  created_at timestamptz not null default now()
);

create table affiliate_clicks (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null,
  clicker_id uuid,
  target_type varchar,
  target_id uuid,
  ip_hash varchar,
  created_at timestamptz not null default now()
);

create table affiliate_attributions (
  id uuid primary key default gen_random_uuid(),
  click_id uuid not null,
  order_id uuid not null,
  commission_rate numeric not null,
  commission_amount numeric not null,
  status varchar not null default 'pending',
  created_at timestamptz not null default now()
);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  order_item_id uuid not null unique,
  vendor_id uuid not null,
  outlet_id uuid,
  product_id uuid,
  rating int4 not null check (rating between 1 and 5),
  title varchar,
  body text,
  is_visible bool not null default true,
  created_at timestamptz not null default now()
);

create table share_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  content_type varchar not null,
  content_id uuid not null,
  platform varchar,
  affiliate_id uuid,
  created_at timestamptz not null default now()
);

create table user_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  event_type varchar not null,
  entity_type varchar not null,
  entity_id uuid not null,
  dwell_ms int4,
  created_at timestamptz not null default now()
);

create table recommendation_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  model_version varchar not null,
  results jsonb not null,
  generated_at timestamptz not null default now()
);

create table geocode_cache (
  address text primary key,
  lat numeric not null,
  lng numeric not null,
  provider varchar,
  created_at timestamptz not null default now()
);

create table carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  coupon_code varchar,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null,
  variant_id uuid,
  slot_id uuid,
  quantity int4 not null default 1,
  unit_price numeric not null,
  created_at timestamptz not null default now()
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  status varchar not null default 'DRAFT' check (status in ('DRAFT','PENDING_PAYMENT','PAID','COMPLETED','CANCELLED')),
  subtotal numeric not null,
  discount_amount numeric not null default 0,
  total_amount numeric not null,
  currency varchar not null default 'MYR',
  payment_method varchar,
  voucher_code varchar,
  notes text,
  paid_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  vendor_id uuid not null,
  outlet_id uuid not null,
  product_id uuid,
  variant_id uuid,
  slot_id uuid,
  product_name varchar not null,
  variant_name varchar,
  slot_starts_at timestamptz,
  unit_price numeric not null,
  quantity int4 not null,
  line_total numeric not null,
  fulfil_status varchar not null default 'pending',
  fulfilled_at timestamptz,
  created_at timestamptz not null default now()
);

create table voucher_redemptions (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null,
  order_id uuid not null,
  user_id uuid not null,
  discount numeric not null,
  created_at timestamptz not null default now()
);

create table bookings (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null unique,
  slot_id uuid not null,
  customer_id uuid not null,
  status varchar not null default 'confirmed',
  demo_qr_code text,
  check_in_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now()
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  method varchar not null,
  amount numeric not null,
  status varchar not null default 'pending',
  gateway_ref varchar,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create table refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null,
  order_id uuid not null,
  amount numeric not null,
  reason text,
  status varchar not null default 'pending',
  processed_by uuid,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create table wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  available_balance numeric not null default 0,
  pending_balance numeric not null default 0,
  currency varchar not null default 'MYR',
  updated_at timestamptz not null default now()
);

create table wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null,
  entry_type varchar not null,
  amount numeric not null,
  balance_type varchar not null,
  reference_id uuid,
  note text,
  created_at timestamptz not null default now()
);

create table payout_destinations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  dest_type varchar not null,
  label varchar,
  masked_ref varchar,
  is_default bool,
  created_at timestamptz not null default now()
);

create table withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  wallet_id uuid not null,
  destination_id uuid,
  amount numeric not null,
  status varchar not null default 'pending' check (status in ('pending','approved','rejected','hold')),
  requires_dual_approval bool not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table withdrawal_approvals (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  approver_id uuid not null,
  action varchar not null,
  note text,
  actioned_at timestamptz not null default now()
);

create table payout_transactions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  gateway varchar,
  gateway_ref varchar,
  status varchar not null default 'pending',
  created_at timestamptz not null default now()
);

create table idempotency_keys (
  key varchar primary key,
  user_id uuid not null,
  endpoint varchar not null,
  request_hash varchar not null,
  response_body jsonb,
  status_code int4,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

-- ============================================================
-- Pass 2: foreign keys (added after all tables exist, so ordering doesn't matter)
-- ============================================================
alter table user_roles
  add constraint fk_user_roles_user foreign key (user_id) references users(id) on delete cascade,
  add constraint fk_user_roles_role foreign key (role_id) references roles(id) on delete restrict,
  add constraint fk_user_roles_vendor foreign key (vendor_id) references vendors(id) on delete cascade,
  add constraint fk_user_roles_outlet foreign key (outlet_id) references outlets(id) on delete cascade;

alter table email_verifications add constraint fk_ev_user foreign key (user_id) references users(id) on delete cascade;
alter table phone_verifications add constraint fk_pv_user foreign key (user_id) references users(id) on delete cascade;

alter table kyc_submissions
  add constraint fk_kyc_user foreign key (user_id) references users(id) on delete cascade,
  add constraint fk_kyc_reviewer foreign key (reviewer_id) references users(id) on delete set null;

alter table notifications add constraint fk_notif_user foreign key (user_id) references users(id) on delete cascade;
alter table audit_logs add constraint fk_audit_actor foreign key (actor_id) references users(id) on delete set null;

alter table chat_threads
  add constraint fk_thread_customer foreign key (customer_id) references users(id) on delete cascade,
  add constraint fk_thread_outlet foreign key (outlet_id) references outlets(id) on delete cascade;

alter table chat_messages
  add constraint fk_msg_thread foreign key (thread_id) references chat_threads(id) on delete cascade,
  add constraint fk_msg_sender foreign key (sender_id) references users(id) on delete cascade;

alter table chat_message_reads
  add constraint fk_read_message foreign key (message_id) references chat_messages(id) on delete cascade,
  add constraint fk_read_user foreign key (user_id) references users(id) on delete cascade;

alter table chatbot_sessions add constraint fk_cbs_user foreign key (user_id) references users(id) on delete set null;
alter table chatbot_messages add constraint fk_cbm_session foreign key (session_id) references chatbot_sessions(id) on delete cascade;

alter table chatbot_message_kb_refs
  add constraint fk_kbref_message foreign key (message_id) references chatbot_messages(id) on delete cascade,
  add constraint fk_kbref_document foreign key (document_id) references chatbot_kb_documents(id) on delete cascade;

alter table support_tickets
  add constraint fk_ticket_user foreign key (user_id) references users(id) on delete set null,
  add constraint fk_ticket_session foreign key (session_id) references chatbot_sessions(id) on delete set null,
  add constraint fk_ticket_assignee foreign key (assigned_to) references users(id) on delete set null;

alter table platform_settings add constraint fk_settings_updater foreign key (updated_by) references users(id) on delete set null;

alter table vendors
  add constraint fk_vendor_owner foreign key (owner_id) references users(id) on delete cascade,
  add constraint fk_vendor_approver foreign key (approved_by) references users(id) on delete set null;

alter table outlets add constraint fk_outlet_vendor foreign key (vendor_id) references vendors(id) on delete cascade;
alter table outlet_pages add constraint fk_outletpage_outlet foreign key (outlet_id) references outlets(id) on delete cascade;

alter table outlet_managers
  add constraint fk_om_outlet foreign key (outlet_id) references outlets(id) on delete cascade,
  add constraint fk_om_user foreign key (user_id) references users(id) on delete cascade;

alter table products
  add constraint fk_product_vendor foreign key (vendor_id) references vendors(id) on delete cascade,
  add constraint fk_product_outlet foreign key (outlet_id) references outlets(id) on delete cascade,
  add constraint fk_product_category foreign key (category_id) references categories(id) on delete set null;

alter table product_variants add constraint fk_variant_product foreign key (product_id) references products(id) on delete cascade;

alter table price_rules
  add constraint fk_pricerule_product foreign key (product_id) references products(id) on delete cascade,
  add constraint fk_pricerule_variant foreign key (variant_id) references product_variants(id) on delete cascade;

alter table inventory add constraint fk_inventory_variant foreign key (variant_id) references product_variants(id) on delete cascade;

alter table booking_slots
  add constraint fk_slot_product foreign key (product_id) references products(id) on delete cascade,
  add constraint fk_slot_outlet foreign key (outlet_id) references outlets(id) on delete cascade;

alter table vouchers
  add constraint fk_voucher_vendor foreign key (vendor_id) references vendors(id) on delete cascade,
  add constraint fk_voucher_outlet foreign key (outlet_id) references outlets(id) on delete cascade;

alter table media_assets
  add constraint fk_media_vendor foreign key (vendor_id) references vendors(id) on delete cascade,
  add constraint fk_media_outlet foreign key (outlet_id) references outlets(id) on delete cascade,
  add constraint fk_media_product foreign key (product_id) references products(id) on delete cascade;

alter table user_preferences add constraint fk_prefs_user foreign key (user_id) references users(id) on delete cascade;

alter table vendor_recommendations
  add constraint fk_vrec_recommender foreign key (recommender_id) references users(id) on delete cascade,
  add constraint fk_vrec_category foreign key (category_id) references categories(id) on delete set null,
  add constraint fk_vrec_reviewer foreign key (reviewer_id) references users(id) on delete set null,
  add constraint fk_vrec_converted_vendor foreign key (converted_vendor_id) references vendors(id) on delete set null;

alter table recommendation_conversions
  add constraint fk_conv_recommendation foreign key (recommendation_id) references vendor_recommendations(id) on delete cascade,
  add constraint fk_conv_vendor foreign key (converted_vendor_id) references vendors(id) on delete cascade,
  add constraint fk_conv_order foreign key (first_sale_order_id) references orders(id) on delete set null;

alter table recommendation_commissions
  add constraint fk_reccomm_recommender foreign key (recommender_id) references users(id) on delete cascade,
  add constraint fk_reccomm_conversion foreign key (conversion_id) references recommendation_conversions(id) on delete set null,
  add constraint fk_reccomm_ledger foreign key (ledger_entry_id) references wallet_ledger(id) on delete set null;

alter table affiliate_links add constraint fk_alink_user foreign key (user_id) references users(id) on delete cascade;

alter table affiliate_clicks
  add constraint fk_aclick_link foreign key (link_id) references affiliate_links(id) on delete cascade,
  add constraint fk_aclick_clicker foreign key (clicker_id) references users(id) on delete set null;

alter table affiliate_attributions
  add constraint fk_aattr_click foreign key (click_id) references affiliate_clicks(id) on delete cascade,
  add constraint fk_aattr_order foreign key (order_id) references orders(id) on delete cascade;

alter table reviews
  add constraint fk_review_user foreign key (user_id) references users(id) on delete cascade,
  add constraint fk_review_orderitem foreign key (order_item_id) references order_items(id) on delete cascade,
  add constraint fk_review_vendor foreign key (vendor_id) references vendors(id) on delete cascade,
  add constraint fk_review_outlet foreign key (outlet_id) references outlets(id) on delete set null,
  add constraint fk_review_product foreign key (product_id) references products(id) on delete set null;

alter table share_events
  add constraint fk_share_user foreign key (user_id) references users(id) on delete set null,
  add constraint fk_share_affiliate foreign key (affiliate_id) references affiliate_links(id) on delete set null;

alter table user_interactions add constraint fk_interaction_user foreign key (user_id) references users(id) on delete cascade;
alter table recommendation_snapshots add constraint fk_snapshot_user foreign key (user_id) references users(id) on delete cascade;

alter table carts add constraint fk_cart_user foreign key (user_id) references users(id) on delete cascade;

alter table cart_items
  add constraint fk_cartitem_cart foreign key (cart_id) references carts(id) on delete cascade,
  add constraint fk_cartitem_variant foreign key (variant_id) references product_variants(id) on delete cascade,
  add constraint fk_cartitem_slot foreign key (slot_id) references booking_slots(id) on delete set null;

alter table orders
  add constraint fk_order_user foreign key (user_id) references users(id) on delete cascade,
  add constraint fk_order_voucher foreign key (voucher_code) references vouchers(code) on delete set null;

alter table order_items
  add constraint fk_oi_order foreign key (order_id) references orders(id) on delete cascade,
  add constraint fk_oi_vendor foreign key (vendor_id) references vendors(id) on delete cascade,
  add constraint fk_oi_outlet foreign key (outlet_id) references outlets(id) on delete cascade,
  add constraint fk_oi_product foreign key (product_id) references products(id) on delete set null,
  add constraint fk_oi_variant foreign key (variant_id) references product_variants(id) on delete set null,
  add constraint fk_oi_slot foreign key (slot_id) references booking_slots(id) on delete set null;

alter table voucher_redemptions
  add constraint fk_vredeem_voucher foreign key (voucher_id) references vouchers(id) on delete cascade,
  add constraint fk_vredeem_order foreign key (order_id) references orders(id) on delete cascade,
  add constraint fk_vredeem_user foreign key (user_id) references users(id) on delete cascade;

alter table bookings
  add constraint fk_booking_orderitem foreign key (order_item_id) references order_items(id) on delete cascade,
  add constraint fk_booking_slot foreign key (slot_id) references booking_slots(id) on delete cascade,
  add constraint fk_booking_customer foreign key (customer_id) references users(id) on delete cascade;

alter table payments add constraint fk_payment_order foreign key (order_id) references orders(id) on delete cascade;

alter table refunds
  add constraint fk_refund_payment foreign key (payment_id) references payments(id) on delete cascade,
  add constraint fk_refund_order foreign key (order_id) references orders(id) on delete cascade,
  add constraint fk_refund_processor foreign key (processed_by) references users(id) on delete set null;

alter table wallets add constraint fk_wallet_user foreign key (user_id) references users(id) on delete cascade;
alter table wallet_ledger add constraint fk_ledger_wallet foreign key (wallet_id) references wallets(id) on delete cascade;

alter table payout_destinations add constraint fk_payoutdest_user foreign key (user_id) references users(id) on delete cascade;

alter table withdrawal_requests
  add constraint fk_wreq_user foreign key (user_id) references users(id) on delete cascade,
  add constraint fk_wreq_wallet foreign key (wallet_id) references wallets(id) on delete cascade,
  add constraint fk_wreq_dest foreign key (destination_id) references payout_destinations(id) on delete set null;

alter table withdrawal_approvals
  add constraint fk_wapp_request foreign key (request_id) references withdrawal_requests(id) on delete cascade,
  add constraint fk_wapp_approver foreign key (approver_id) references users(id) on delete cascade;

alter table payout_transactions add constraint fk_ptx_request foreign key (request_id) references withdrawal_requests(id) on delete cascade;

alter table idempotency_keys add constraint fk_idem_user foreign key (user_id) references users(id) on delete cascade;
;
