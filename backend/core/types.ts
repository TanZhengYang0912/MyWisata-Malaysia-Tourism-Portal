// Shared domain types — the integration contract every member's code imports.
// Ownership: each seed/repo file below is owned by one member (see README).
// Read the type, not the DB shape, when consuming another domain.

export type Role =
  | "customer"
  | "vendor_owner"
  | "outlet_manager"
  | "admin"
  | "approver"
  | "super_admin";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatarInitial: string;
  city?: string;
  country?: string;
  phone?: string;
  status?: "active" | "suspended" | "deleted";
  verificationTier: "email_unverified" | "email_verified" | "phone_verified" | "profile_complete" | "kyc_verified";
  vendorId?: string; // set for vendor_owner
  outletId?: string; // set for outlet_manager
}

// ─── Contract #1: AuthContext shape ────────────────────────────────────────
export interface AuthState {
  currentUser: User | null;
  roles: Role[];
  activeVendorId?: string;
  activeOutletIds?: string[];
}

// ─── Catalogue domain (P2 — Vendor/Outlet/Catalogue) ───────────────────────
export interface VendorSummary {
  id: string;
  name: string;
  status: string; // "pending" | "approved" | "rejected"
  logoUrl: string | null;
  coverUrl: string | null;
  outlets: { id: string; name: string; city: string; state: string }[];
}

export interface Outlet {
  id: string;
  vendorId: string;
  vendorName?: string;
  name: string;
  category: string;
  state: string;
  city: string;
  address: string;
  lat: number;
  lng: number;
  hours: string;
  phone?: string;
  verified: boolean;
  open: boolean;
  rating: number;
  reviews: number;
  wheelchairAccessible?: boolean | null; // null = vendor hasn't specified
  petFriendly?: boolean | null;
}

export interface Variant {
  id: string;
  label: string; // e.g. "Adult", "Child"
  priceDelta: number; // added to base price
}

export interface PriceRule {
  id: string;
  productId: string;
  ruleType: "date_range" | "group_size" | "weekend" | "peak" | "off_peak" | "bundle" | "tiered";
  label?: string;
  multiplier?: number;
  fixedAmount?: number;
  validFrom?: string;
  validUntil?: string;
  minQuantity?: number;
  bundleProductIds?: string[];
  priority: number;
  isActive: boolean;
}

export interface BookingSlot {
  id: string;
  activityId: string;
  startsAt: string; // ISO datetime
  capacity: number;
  booked: number;
  status?: "available" | "full" | "expired" | string;
  priceOverride?: number;
}

/**
 * A place-bound product's own destination — independent of the outlet that
 * sells it. Only nature/cultural/adventure products carry this; everything
 * else is found through its outlet's location instead. See
 * docs/plans/2026-08-03-0237-dev-explore-discovery-map.md.
 */
export interface PlaceLocation {
  state: string;
  district?: string;
  lat: number;
  lng: number;
}

// ─── Contract #2: Catalogue DTO ────────────────────────────────────────────
export interface Activity {
  id: string;
  /**
   * Representative outlet. For a product sold at several outlets this is the
   * one chosen for the card (nearest, else cheapest) — `offers` holds them all.
   */
  outletId: string;
  /**
   * Every outlet selling this product, each with its own price. Empty for a
   * single-outlet product, which still uses `outletId` / `price` directly.
   */
  offers?: OutletOffer[];
  name: string;
  category: string;
  description: string;
  image: string | null;
  price: number; // RM base price
  rating: number;
  reviews: number;
  duration: string;
  requiresBooking: boolean;
  variants: Variant[];
  priceRules?: PriceRule[];
  availableStock?: number;
  lowStockThreshold?: number;
  aiTag?: string; // static label for now; AI scoring deferred
  hot?: boolean;
  tags?: string[];
  categorySlug?: string; // categories.slug — one of the 4: food/activity/accommodation/retail
  typeSlugs?: string[];  // products.type_slugs — the second taxonomy level (e.g. "nature", "chinese")
  createdAt?: string;    // products.created_at — recency signal
  attributes?: Record<string, unknown>; // category-specific detail fields — see lib/customer/category-details.ts
  isHiddenGem?: boolean;
  isFamilyFriendly?: boolean;
  isCoupleFriendly?: boolean;
  /** The product's own destination coordinate, when it has one — see PlaceLocation. */
  place?: PlaceLocation;
}

/** One outlet's actual listing of a shared vendor product: its own price and state. */
export interface OutletOffer {
  outletId: string;
  price: number;
  status: string;
}

export interface ComputedActivity extends Activity {
  outlet: Outlet;
  distanceKm?: number;
}

export interface ProductReview {
  id: string;
  rating: number;
  title?: string;
  body?: string;
  createdAt: string;
  authorName: string;
  verifiedPurchase: boolean;
}

// ─── Places domain (Penang place-first navigation) ─────────────────────────
// See docs/plans/2026-08-12-2152-penang-place-model-and-data-reset.md.
// Independent of vendors/outlets/products — places and vendors are two trees
// joined by geography, not a parent/child hierarchy (plan §2 D1).
export type PlaceLevel = "state" | "region" | "poi";
export type PlaceRelation = "admission" | "guide_service" | "addon";

export interface Place {
  id: string;
  parentId: string | null;
  level: PlaceLevel;
  name: string;
  slug: string;
  tagline: string | null;
  intro: string | null;
  imageUrl: string | null;
  state: string;
  district: string | null;
  lat: number;
  lng: number;
  entryFee: number | null; // null = n/a, 0 = free, >0 = RM
  managedByVendorId: string | null;
  detail: { difficulty?: string; duration?: string; bestTime?: string; gettingThere?: string } | null;
}

/** One vendor's product available at a place, with how it relates to the place. */
export interface PlaceProduct {
  product: Activity;
  vendor: VendorSummary;
  relation: PlaceRelation;
}

// ─── Commerce domain (P4 — Cart/Order/Booking/Wallet) ──────────────────────
export type OrderStatus = "DRAFT" | "PENDING_PAYMENT" | "PAID" | "COMPLETED" | "CANCELLED" | "REFUNDED";

export interface CartItem {
  activityId: string;
  variantId: string;
  slotId?: string;
  /**
   * Which outlet this line is bought from. A product can be sold at several
   * outlets at different prices, so the outlet is part of the line's identity —
   * without it, "2 laksa from A" and "2 laksa from B" would merge into one line.
   */
  outletId?: string;
  qty: number;
  priceOverride?: number;
}

export interface Voucher {
  id: string;
  code: string;
  name?: string;
  type: "percent" | "fixed" | "bogo";
  value: number;
  minSpend: number;
  usageCap: number;
  usageCount: number;
  perCustomerLimit?: number;
  expiresAt: string; // ISO date
  productId?: string;
  buyQuantity?: number;
  freeQuantity?: number;
}

export interface OrderItem {
  activityId: string;
  activityName: string; // snapshot
  imageUrl?: string; // snapshot
  variantLabel: string; // snapshot
  slotStartsAt?: string; // snapshot
  unitPrice: number; // snapshot
  qty: number;
  outletId: string;
}

export interface Order {
  id: string;
  userId: string;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  total: number;
  voucherCode?: string;
  status: OrderStatus;
  createdAt: string;
  paymentMethod?: string;
}

export interface Booking {
  id: string;
  orderId: string;
  activityId: string;
  activityName: string;
  outletId: string;
  slotStartsAt?: string;
  qty: number;
  status: "confirmed" | "checked_in" | "no_show" | "cancelled";
  qrCode: string; // booking id retained as a compatibility payload; customer UI renders a real QR
}

export type KycSubmissionStatus = "draft" | "pending" | "info_requested" | "approved" | "rejected" | "superseded";

export interface CustomerKycSubmission {
  id: string;
  status: KycSubmissionStatus;
  docType: string;
  queuePosition: number | null;
  submittedAt: string;
  reviewedAt: string | null;
  reviewReasonCode: string | null;
  reviewReasonDetail: string | null;
}

/** Safe identity fields for displaying another user on a public surface. */
export interface PublicUser {
  id: string;
  name: string;
  avatarUrl?: string;
  city?: string;
  country?: string;
  bio?: string;
  isKycVerified: boolean;
}

export interface ProfileSummary {
  id: string;
  email: string;
  fullName: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  phone: string | null;
  maskedPhone: string | null;
  city: string | null;
  country: string | null;
  status: "active" | "suspended" | "deleted";
  tier: User["verificationTier"];
  kycStatus: "unverified" | "pending" | "approved" | "rejected";
  emailVerified: boolean;
  phoneVerified: boolean;
  profileComplete: boolean;
  survey: {
    interests: string[];
    travelStyle: string | null;
    budgetRange: string | null;
    mobilityNeeds: string | null;
    preferredDistance: string | null;
  } | null;
  latestKycReview: {
    status: string;
    reasonCode: string | null;
    reasonDetail: string | null;
    reviewedAt: string | null;
  } | null;
}

export interface AdminKycSubmission {
  id: string;
  userId: string;
  docType: string;
  status: KycSubmissionStatus;
  queuePosition: number | null;
  submittedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewReasonCode: string | null;
  reviewReasonDetail: string | null;
  documents: { side: "front" | "back" }[];
  ocr: {
    status: "matched" | "mismatch" | "unreadable" | "unavailable";
    holderName: string | null;
    documentNumberLast4: string | null;
    expiryDate: string | null;
    confidence: number | null;
    mismatchFields: string[];
    processedAt: string;
  } | null;
}

/** @deprecated Use CustomerKycSubmission or AdminKycSubmission at the relevant boundary. */
export type KycSubmission = AdminKycSubmission;

// ─── Identity/Chat domain (P1) ──────────────────────────────────────────────
export interface ChatThread {
  id: string;
  customerId: string;
  outletId: string;
  vendorId: string;
  lastMessageAt: string;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  senderId: string;
  senderRole: "customer" | "vendor";
  text: string;
  sentAt: string;
  /** Storage path in the chat-attachments bucket, not a URL — sign it before rendering. */
  attachmentUrl?: string;
  /** Id of the message this one is quoting, if any. */
  replyToId?: string;
  /** Product/activity this message references — set on the "Re: <activity>" context chip. */
  contextProductId?: string;
}

export interface Notification {
  id: string;
  userId: string;
  text: string;
  read: boolean;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  userId: string;
  category: string;
  subject: string;
  status: "open" | "resolved";
  createdAt: string;
}

export interface AuditLog {
  id: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  note?: string;
  before?: unknown;
  after?: unknown;
  createdAt: string;
}

// ─── Discovery/Growth domain (P3) ───────────────────────────────────────────
export interface VendorRecommendation {
  id: string;
  submittedBy: string;
  name: string;
  category: string;
  state: string;
  status: "pending" | "changes_requested" | "approved" | "invited" | "claimed" | "onboarding" | "vendor_pending_review" | "rejected" | "converted";
  qualityScore: number;
  duplicate: boolean;
  /** Present when the public author is still active and visible. */
  author?: PublicUser;
}

export interface WithdrawalRequest {
  id: string;
  userId: string;
  amount: number;
  destination: string;
  status: "pending" | "pending_second_approval" | "approved" | "rejected" | "processing" | "hold" | "overdue" | "completed" | "failed" | "paid";
  requiresDualApproval: boolean;
  createdAt: string;
}

export interface WalletTransaction {
  id: string;
  userId: string;
  walletId: string;
  orderId: string | null;
  withdrawalId: string | null;
  type: string;
  amount: number;
  bucket: string;
  direction: "credit" | "debit";
  note: string | null;
  createdAt: string;
}

// ─── Domain event helper (Contract #5) ──────────────────────────────────────
export type DomainEventName =
  | "order.paid"
  | "order.completed"
  | "withdrawal.reviewed"
  | "recommendation.converted";

export interface DomainEvent<T = unknown> {
  name: DomainEventName;
  payload: T;
  at: string;
}
