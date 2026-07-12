// ── Application Domain Types ────────────────────────────────
// These are the DTOs and view-model types used in the UI and API routes.
// DB row types are in database.ts — these compose and extend them.

import type { RoleName } from '@/lib/constants';

// ── Auth Context (P1 — shared with all modules) ─────────────
export interface AuthUser {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  kycStatus: 'unverified' | 'pending' | 'approved' | 'rejected';
  emailVerified: boolean;
  phoneVerified: boolean;
  profileComplete: boolean;
  roles: RoleName[];
  activeVendorId: string | null;
  activeOutletIds: string[];
  activeOutletName?: string | null;
}

// ── Catalogue DTO (P2 → used by P3 discovery & P4 cart) ─────
export interface CatalogueOutlet {
  id: string;
  vendorId: string;
  vendorName: string;
  vendorSlug: string;
  name: string;
  slug: string;
  city: string | null;
  lat: number | null;
  lng: number | null;
  coverUrl: string | null;
  rating: number | null;
  reviewCount: number;
  status: string;
}

export interface CatalogueVariant {
  id: string;
  name: string;
  priceOffset: number;
  isDefault: boolean;
  computedPrice: number;  // base_price + price_offset — money.ts handles
  availableStock: number | null;  // null for booking-type products
}

export interface CatalogueProduct {
  id: string;
  outletId: string;
  vendorId: string;
  name: string;
  slug: string;
  description: string | null;
  productType: string;
  requiresBooking: boolean;
  basePrice: number;
  coverUrl: string | null;
  tags: string[];
  variants: CatalogueVariant[];
  availableSlots?: BookingSlotSummary[];
  categoryName: string | null;
  rating: number | null;
}

export interface BookingSlotSummary {
  id: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  booked: number;
  remaining: number;
  priceOverride: number | null;
  status: string;
}

// ── Cart (P4) ────────────────────────────────────────────────
export interface CartLineItem {
  id: string;
  variantId: string | null;
  slotId: string | null;
  productName: string;
  variantName: string | null;
  outletName: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  coverUrl: string | null;
  slotStartsAt: string | null;
}

export interface CartSummary {
  items: CartLineItem[];
  subtotal: number;
  discountAmount: number;
  total: number;
  appliedVoucherCode: string | null;
}

// ── Order state machine (P4) ─────────────────────────────────
export type OrderStatus =
  | 'draft'
  | 'pending_payment'
  | 'paid'
  | 'completed'
  | 'cancelled'
  | 'refunded';

export const ORDER_STATE_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  draft:           ['pending_payment', 'cancelled'],
  pending_payment: ['paid', 'cancelled'],
  paid:            ['completed', 'refunded'],
  completed:       [],
  cancelled:       [],
  refunded:        [],
};

// ── Wallet (P4) ──────────────────────────────────────────────
export interface WalletSummary {
  availableBalance: number;
  pendingBalance: number;
  currency: string;
}

// ── Recommendation (P3) ─────────────────────────────────────
export interface RecommendedItem {
  entityId: string;
  entityType: 'vendor' | 'outlet' | 'product';
  score: number;
  reasonTags: ReasonTag[];
}

export type ReasonTag =
  | 'near_you'
  | 'matches_your_interests'
  | 'popular_with_similar_travellers'
  | 'hidden_gem'
  | 'highly_rated'
  | 'new_listing';

// ── Admin (P1) ───────────────────────────────────────────────
export interface PendingApproval {
  id: string;
  type: 'vendor' | 'kyc' | 'recommendation' | 'withdrawal';
  label: string;
  submittedAt: string;
  submittedBy: string;
}

// ── API response wrappers ───────────────────────────────────
export interface ApiSuccess<T> {
  data: T;
  error: null;
}

export interface ApiError {
  data: null;
  error: { code: string; message: string };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;
