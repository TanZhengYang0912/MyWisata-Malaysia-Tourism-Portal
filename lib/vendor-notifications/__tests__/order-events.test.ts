import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emitOrderVendorEvent } from '@/lib/vendor-notifications/order-events';

const emitMock = vi.hoisted(() => ({ emitVendorNotification: vi.fn(async () => ({ notificationIds: [], recipientIds: [] })) }));
vi.mock('@/lib/vendor-notifications/emit', () => emitMock);

function fakeDb() {
  const rows = {
    order_items: [
      { id: 'item-1', vendor_id: 'vendor-1', outlet_id: 'outlet-1' },
      { id: 'item-2', vendor_id: 'vendor-1', outlet_id: 'outlet-1' },
    ],
    bookings: [{ id: 'booking-1', order_item_id: 'item-1', status: 'confirmed' }],
  };
  return {
    from(table: keyof typeof rows) {
      const query: any = {
        select: () => query,
        eq: () => query,
        in: () => query,
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows[table], error: null }).then(resolve),
      };
      return query;
    },
  } as any;
}

describe('emitOrderVendorEvent', () => {
  beforeEach(() => emitMock.emitVendorNotification.mockClear());

  it('deduplicates order lines and emits a separate App-only booking event', async () => {
    await emitOrderVendorEvent({ serviceDb: fakeDb(), orderId: 'order-1', eventKey: 'order:paid:order-1' });
    expect(emitMock.emitVendorNotification).toHaveBeenCalledTimes(2);
    expect(emitMock.emitVendorNotification).toHaveBeenNthCalledWith(1, expect.objectContaining({
      category: 'vendor_orders',
      email: true,
      vendorId: 'vendor-1',
    }));
    expect(emitMock.emitVendorNotification).toHaveBeenNthCalledWith(2, expect.objectContaining({
      category: 'vendor_bookings',
      type: 'vendor_booking_created',
      email: false,
      reference: 'booking-1',
    }));
  });
});
