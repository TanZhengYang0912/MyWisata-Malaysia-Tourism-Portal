import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

describe('vendor notification event matrix', () => {
  it('defines the exact audience, category, and email policy', async () => {
    const { VENDOR_EVENT_MATRIX } = await import('@/lib/vendor-notifications/event-policy');
    expect(VENDOR_EVENT_MATRIX).toEqual({
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
    });
  });

  it('requires producer routes to call the scoped emitter after a mutation', () => {
    const producers = [
      'app/api/dev/simulate-purchase/route.ts',
      'app/api/orders/[orderId]/refund/route.ts',
      'app/api/vendors/[vendorId]/orders/[orderItemId]/fulfil/route.ts',
      'app/api/vendors/[vendorId]/bookings/[bookingId]/checkin/route.ts',
      'app/api/admin/catalogue/reviews/route.ts',
      'app/api/admin/vendors/[id]/approve/route.ts',
      'app/api/admin/vendors/[id]/suspend/route.ts',
      'app/api/vendors/[vendorId]/outlet-managers/route.ts',
      'app/api/vendors/[vendorId]/outlet-managers/[outletId]/route.ts',
      'app/api/stripe/connect-webhook/route.ts',
    ];
    for (const path of producers) {
      expect(read(path), path).toContain('emitVendorNotification');
    }
  });

  it('wires paid checkout finalization through the order event helper', () => {
    for (const path of ['app/api/checkout/finalize/route.ts', 'app/api/checkout/confirm-stripe/route.ts', 'app/api/stripe/webhook/route.ts']) {
      expect(read(path), path).toContain('emitOrderVendorEvent');
    }
  });

  it('keeps ordinary customer messages App-only', () => {
    const source = read('app/api/vendors/[vendorId]/inbox/route.ts');
    expect(source).toContain("email: false");
  });
});
