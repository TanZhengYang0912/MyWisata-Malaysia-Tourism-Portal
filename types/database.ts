// Auto-generate via: npm run db:types
// This file is the manual approximation until you run the CLI command.
// After running `supabase gen types typescript --local`, replace this with
// the generated file and update imports to 'database.generated'.

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      users: { Row: UserRow; Insert: Partial<UserRow>; Update: Partial<UserRow> };
      roles: { Row: RoleRow; Insert: Partial<RoleRow>; Update: Partial<RoleRow> };
      user_roles: { Row: UserRoleRow; Insert: Partial<UserRoleRow>; Update: Partial<UserRoleRow> };
      vendors: { Row: VendorRow; Insert: Partial<VendorRow>; Update: Partial<VendorRow> };
      outlets: { Row: OutletRow; Insert: Partial<OutletRow>; Update: Partial<OutletRow> };
      categories: { Row: CategoryRow; Insert: Partial<CategoryRow>; Update: Partial<CategoryRow> };
      products: { Row: ProductRow; Insert: Partial<ProductRow>; Update: Partial<ProductRow> };
      product_variants: { Row: ProductVariantRow; Insert: Partial<ProductVariantRow>; Update: Partial<ProductVariantRow> };
      inventory: { Row: InventoryRow; Insert: Partial<InventoryRow>; Update: Partial<InventoryRow> };
      booking_slots: { Row: BookingSlotRow; Insert: Partial<BookingSlotRow>; Update: Partial<BookingSlotRow> };
      vouchers: { Row: VoucherRow; Insert: Partial<VoucherRow>; Update: Partial<VoucherRow> };
      carts: { Row: CartRow; Insert: Partial<CartRow>; Update: Partial<CartRow> };
      cart_items: { Row: CartItemRow; Insert: Partial<CartItemRow>; Update: Partial<CartItemRow> };
      orders: { Row: OrderRow; Insert: Partial<OrderRow>; Update: Partial<OrderRow> };
      order_items: { Row: OrderItemRow; Insert: Partial<OrderItemRow>; Update: Partial<OrderItemRow> };
      bookings: { Row: BookingRow; Insert: Partial<BookingRow>; Update: Partial<BookingRow> };
      wallets: { Row: WalletRow; Insert: Partial<WalletRow>; Update: Partial<WalletRow> };
      wallet_ledger: { Row: WalletLedgerRow; Insert: Partial<WalletLedgerRow>; Update: Partial<WalletLedgerRow> };
      withdrawal_requests: { Row: WithdrawalRequestRow; Insert: Partial<WithdrawalRequestRow>; Update: Partial<WithdrawalRequestRow> };
      withdrawal_approvals: { Row: WithdrawalApprovalRow; Insert: Partial<WithdrawalApprovalRow>; Update: Partial<WithdrawalApprovalRow> };
      vendor_recommendations: { Row: VendorRecommendationRow; Insert: Partial<VendorRecommendationRow>; Update: Partial<VendorRecommendationRow> };
      affiliate_links: { Row: AffiliateLinkRow; Insert: Partial<AffiliateLinkRow>; Update: Partial<AffiliateLinkRow> };
      reviews: { Row: ReviewRow; Insert: Partial<ReviewRow>; Update: Partial<ReviewRow> };
      chat_threads: { Row: ChatThreadRow; Insert: Partial<ChatThreadRow>; Update: Partial<ChatThreadRow> };
      chat_messages: { Row: ChatMessageRow; Insert: Partial<ChatMessageRow>; Update: Partial<ChatMessageRow> };
      support_tickets: { Row: SupportTicketRow; Insert: Partial<SupportTicketRow>; Update: Partial<SupportTicketRow> };
      notifications: { Row: NotificationRow; Insert: Partial<NotificationRow>; Update: Partial<NotificationRow> };
      audit_logs: { Row: AuditLogRow; Insert: Partial<AuditLogRow>; Update: Partial<AuditLogRow> };
      user_preferences: { Row: UserPreferenceRow; Insert: Partial<UserPreferenceRow>; Update: Partial<UserPreferenceRow> };
      user_interactions: { Row: UserInteractionRow; Insert: Partial<UserInteractionRow>; Update: Partial<UserInteractionRow> };
      recommendation_snapshots: { Row: RecommendationSnapshotRow; Insert: Partial<RecommendationSnapshotRow>; Update: Partial<RecommendationSnapshotRow> };
      kyc_submissions: { Row: KycSubmissionRow; Insert: Partial<KycSubmissionRow>; Update: Partial<KycSubmissionRow> };
      share_events: { Row: ShareEventRow; Insert: Partial<ShareEventRow>; Update: Partial<ShareEventRow> };
      platform_settings: { Row: PlatformSettingRow; Insert: Partial<PlatformSettingRow>; Update: Partial<PlatformSettingRow> };
      affiliate_clicks: { Row: AffiliateClickRow; Insert: Partial<AffiliateClickRow>; Update: Partial<AffiliateClickRow> };
      affiliate_attributions: { Row: AffiliateAttributionRow; Insert: Partial<AffiliateAttributionRow>; Update: Partial<AffiliateAttributionRow> };
      voucher_redemptions: { Row: VoucherRedemptionRow; Insert: Partial<VoucherRedemptionRow>; Update: Partial<VoucherRedemptionRow> };
      outlet_managers: { Row: OutletManagerRow; Insert: Partial<OutletManagerRow>; Update: Partial<OutletManagerRow> };
      payments: { Row: PaymentRow; Insert: Partial<PaymentRow>; Update: Partial<PaymentRow> };
      payout_destinations: { Row: PayoutDestinationRow; Insert: Partial<PayoutDestinationRow>; Update: Partial<PayoutDestinationRow> };
      wallet_transactions: { Row: WalletTransactionRow; Insert: Partial<WalletTransactionRow>; Update: Partial<WalletTransactionRow> };
    };
  };
}

// ── Row types ──────────────────────────────────────────────

export interface UserRow {
  id: string;
  email: string;
  full_name: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  phone: string | null;
  city: string | null;
  country: string;
  email_verified_at: string | null;
  phone_verified_at: string | null;
  profile_completed_at: string | null;
  kyc_status: 'unverified' | 'pending' | 'approved' | 'rejected';
  status: 'active' | 'suspended' | 'deleted';
  stripe_customer_id: string | null;
  stripe_connect_account_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface RoleRow {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
}

export interface UserRoleRow {
  id: string;
  user_id: string;
  role_id: number;
  vendor_id: string | null;
  outlet_id: string | null;
  created_at: string;
}

export interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface VendorRow {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  cover_url: string | null;
  business_type: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
  rejection_reason: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OutletRow {
  id: string;
  vendor_id: string;
  name: string;
  slug: string;
  address: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  country: string;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  email: string | null;
  operating_hours: Json | null;
  status: 'active' | 'inactive' | 'closed';
  created_at: string;
  updated_at: string;
}

export interface ProductRow {
  id: string;
  vendor_id: string;
  outlet_id: string;
  category_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  product_type: 'product' | 'activity' | 'experience' | 'food' | 'digital';
  requires_booking: boolean;
  base_price: number;
  currency: string;
  cover_url: string | null;
  status: 'active' | 'inactive' | 'archived';
  tags: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface ProductVariantRow {
  id: string;
  product_id: string;
  name: string;
  sku: string | null;
  price_offset: number;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface InventoryRow {
  id: string;
  variant_id: string;
  quantity: number;
  reserved: number;
  updated_at: string;
}

export interface BookingSlotRow {
  id: string;
  product_id: string;
  outlet_id: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  booked: number;
  price_override: number | null;
  status: 'available' | 'full' | 'cancelled' | 'expired';
  created_at: string;
}

export interface VoucherRow {
  id: string;
  vendor_id: string;
  outlet_id: string | null;
  code: string;
  name: string;
  voucher_type: 'percent' | 'fixed' | 'bogo';
  discount_value: number;
  min_spend: number;
  max_uses: number | null;
  uses_count: number;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
  created_at: string;
}

export interface CartRow {
  id: string;
  user_id: string;
  coupon_code: string | null;
  created_at: string;
  updated_at: string;
}

export interface CartItemRow {
  id: string;
  cart_id: string;
  variant_id: string | null;
  slot_id: string | null;
  quantity: number;
  unit_price: number;
  created_at: string;
}

export interface OrderRow {
  id: string;
  user_id: string;
  status: 'draft' | 'pending_payment' | 'paid' | 'completed' | 'cancelled' | 'refunded';
  subtotal: number;
  discount_amount: number;
  total_amount: number;
  currency: string;
  payment_method: string | null;
  voucher_code: string | null;
  notes: string | null;
  paid_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItemRow {
  id: string;
  order_id: string;
  vendor_id: string;
  outlet_id: string;
  product_id: string | null;
  variant_id: string | null;
  slot_id: string | null;
  product_name: string;
  variant_name: string | null;
  slot_starts_at: string | null;
  unit_price: number;
  quantity: number;
  line_total: number;
  fulfil_status: 'pending' | 'ready' | 'fulfilled' | 'cancelled';
  fulfilled_at: string | null;
  created_at: string;
}

export interface BookingRow {
  id: string;
  order_item_id: string;
  slot_id: string;
  customer_id: string;
  status: 'confirmed' | 'checked_in' | 'no_show' | 'cancelled';
  demo_qr_code: string | null;
  check_in_at: string | null;
  cancelled_at: string | null;
  created_at: string;
}

export interface PaymentRow {
  id: string;
  order_id: string;
  method: string;
  amount: number;
  status: 'pending' | 'succeeded' | 'failed';
  gateway_ref: string | null;
  processed_at: string | null;
  created_at: string;
}

export interface WalletRow {
  id: string;
  user_id: string;
  available_balance: number;
  pending_balance: number;
  topup_sen: number;
  earnings_sen: number;
  currency: string;
  updated_at: string;
}

export interface WalletLedgerRow {
  id: string;
  wallet_id: string;
  entry_type: string;
  amount: number;
  balance_type: 'available' | 'pending';
  reference_id: string | null;
  note: string | null;
  created_at: string;
}

export interface WithdrawalRequestRow {
  id: string;
  user_id: string;
  wallet_id: string;
  destination_id: string | null;
  destination_label: string | null;
  amount: number;
  status: 'pending' | 'approved' | 'rejected' | 'processing' | 'completed' | 'failed';
  requires_dual_approval: boolean;
  notes: string | null;
  stripe_transfer_id: string | null;
  stripe_payout_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface WalletTransactionRow {
  id: string;
  user_id: string;
  wallet_id: string;
  type: 'topup' | 'spend' | 'earnings' | 'withdrawal_reserve' | 'withdrawal_complete' | 'withdrawal_cancel';
  amount_sen: number;
  bucket: 'topup' | 'earnings';
  direction: 'credit' | 'debit';
  stripe_event_id: string | null;
  stripe_ref: string | null;
  withdrawal_id: string | null;
  note: string | null;
  created_at: string;
}

export interface WithdrawalApprovalRow {
  id: string;
  request_id: string;
  approver_id: string;
  action: 'approve' | 'reject' | 'hold';
  note: string | null;
  actioned_at: string;
}

export interface VendorRecommendationRow {
  id: string;
  recommender_id: string;
  vendor_name: string;
  vendor_address: string | null;
  description: string | null;
  category_id: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'converted';
  reviewer_id: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  converted_vendor_id: string | null;
  created_at: string;
}

export interface AffiliateLinkRow {
  id: string;
  user_id: string;
  affiliate_code: string;
  is_active: boolean;
  created_at: string;
}

export interface AffiliateClickRow {
  id: string;
  link_id: string;
  clicker_id: string | null;
  target_type: string | null;
  target_id: string | null;
  ip_hash: string | null;
  created_at: string;
}

export interface AffiliateAttributionRow {
  id: string;
  click_id: string;
  order_id: string;
  commission_rate: number;
  commission_amount: number;
  status: 'pending' | 'confirmed' | 'reversed';
  created_at: string;
}

export interface VoucherRedemptionRow {
  id: string;
  voucher_id: string;
  order_id: string;
  user_id: string;
  discount: number;
  created_at: string;
}

export interface ReviewRow {
  id: string;
  user_id: string;
  order_item_id: string;
  vendor_id: string;
  outlet_id: string | null;
  product_id: string | null;
  rating: number;
  title: string | null;
  body: string | null;
  is_visible: boolean;
  created_at: string;
}

export interface ShareEventRow {
  id: string;
  user_id: string | null;
  content_type: string;
  content_id: string;
  platform: string | null;
  affiliate_id: string | null;
  created_at: string;
}

export interface UserInteractionRow {
  id: string;
  user_id: string;
  event_type: 'view' | 'save' | 'share' | 'book' | 'rate';
  entity_type: 'vendor' | 'outlet' | 'product';
  entity_id: string;
  dwell_ms: number | null;
  created_at: string;
}

export interface UserPreferenceRow {
  id: string;
  user_id: string;
  interest_tags: string[] | null;
  travel_style: string | null;
  budget_range: string | null;
  group_composition: string[] | null;
  wheelchair_accessible: boolean;
  pet_friendly: boolean;
  preferred_radius_km: number;
  updated_at: string;
}

export interface RecommendationSnapshotRow {
  id: string;
  user_id: string;
  model_version: string;
  results: Json;
  generated_at: string;
}

export interface ChatThreadRow {
  id: string;
  customer_id: string;
  outlet_id: string;
  status: 'open' | 'archived' | 'closed';
  last_message_at: string | null;
  archived_at: string | null;
  created_at: string;
}

export interface ChatMessageRow {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  attachment_url: string | null;
  created_at: string;
}

export interface SupportTicketRow {
  id: string;
  user_id: string | null;
  session_id: string | null;
  subject: string;
  body: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  assigned_to: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export interface AuditLogRow {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  before_data: Json | null;
  after_data: Json | null;
  ip_address: string | null;
  note: string | null;
  created_at: string;
}

export interface KycSubmissionRow {
  id: string;
  user_id: string;
  document_type: 'national_id' | 'passport' | 'driving_license';
  document_url: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reviewer_id: string | null;
  rejection_reason: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface OutletManagerRow {
  id: string;
  outlet_id: string;
  user_id: string;
  created_at: string;
}

export interface PlatformSettingRow {
  key: string;
  value: string;
  description: string | null;
  updated_by: string | null;
  updated_at: string;
}

export interface PayoutDestinationRow {
  id: string;
  user_id: string;
  dest_type: 'bank' | 'ewallet';
  label: string | null;
  masked_ref: string | null;
  is_default: boolean;
  created_at: string;
}
