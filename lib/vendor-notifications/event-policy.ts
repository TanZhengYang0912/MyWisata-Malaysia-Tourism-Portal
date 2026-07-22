import type { VendorAudience } from '@/lib/vendor-notifications/scope';
import type { VendorNotificationCategory } from '@/lib/vendor-notifications/emit';

export type VendorEventPolicy = {
  audience: VendorAudience;
  category: VendorNotificationCategory;
  email: boolean;
};

/**
 * Single source of truth for which vendor events are operationally visible and
 * which events warrant email. Keep customer chat App-only and avoid making
 * notification producers invent their own audience policy.
 */
export const VENDOR_EVENT_MATRIX = {
  newOrder: { audience: 'owner_and_assigned_outlet', category: 'vendor_orders', email: true },
  orderRefunded: { audience: 'owner_and_assigned_outlet', category: 'vendor_orders', email: true },
  bookingCreated: { audience: 'owner_and_assigned_outlet', category: 'vendor_bookings', email: false },
  bookingCancelled: { audience: 'owner_and_assigned_outlet', category: 'vendor_bookings', email: true },
  bookingCheckIn: { audience: 'owner_and_assigned_outlet', category: 'vendor_bookings', email: false },
  listingReviewed: { audience: 'owner', category: 'vendor_products', email: true },
  customerMessage: { audience: 'owner_and_assigned_outlet', category: 'vendor_orders', email: false },
  walletSettlement: { audience: 'owner', category: 'vendor_wallet', email: true },
  vendorAccount: { audience: 'owner', category: 'vendor_account', email: true },
  managerPermission: { audience: 'owner_and_assigned_outlet', category: 'vendor_account', email: true },
} as const satisfies Record<string, VendorEventPolicy>;
