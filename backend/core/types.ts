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
  phone?: string;
  verificationTier: "email_verified" | "phone_verified" | "profile_complete" | "kyc_verified";
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
  outlets: { id: string; name: string; city: string; state: string }[];
}

export interface Outlet {
  id: string;
  vendorId: string;
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
  priceOverride?: number;
}

// ─── Contract #2: Catalogue DTO ────────────────────────────────────────────
export interface Activity {
  id: string;
  outletId: string;
  name: string;
  category: string;
  description: string;
  image: string;
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
}

export interface ComputedActivity extends Activity {
  outlet: Outlet;
  distanceKm?: number;
}

// ─── Commerce domain (P4 — Cart/Order/Booking/Wallet) ──────────────────────
export type OrderStatus = "DRAFT" | "PENDING_PAYMENT" | "PAID" | "COMPLETED" | "CANCELLED" | "REFUNDED";

export interface CartItem {
  activityId: string;
  variantId: string;
  slotId?: string;
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
  qrCode: string; // demo placeholder string
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
  isKycVerified: boolean;
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
}

/** @deprecated Use CustomerKycSubmission or AdminKycSubmission at the relevant boundary. */
export type KycSubmission = AdminKycSubmission;

// ─── Identity/Chat domain (P1) ──────────────────────────────────────────────
export interface ChatThread {
  id: string;
  customerId: string;
  outletId: string;
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
  status: "pending" | "approved" | "rejected";
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
  status: "pending" | "approved" | "rejected" | "processing" | "completed" | "failed" | "paid";
  requiresDualApproval: boolean;
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
